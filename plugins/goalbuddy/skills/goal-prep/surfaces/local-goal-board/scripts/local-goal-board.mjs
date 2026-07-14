#!/usr/bin/env node
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, watch, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createBoardPayload, writeBoardApp } from "./lib/goal-board.mjs";

const textTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
};

const SETTINGS_VERSION = 1;
const SETTINGS_DEFAULTS = {
  theme: "system",
  density: "comfortable",
  completedVisibility: "show",
  boardOpenBehavior: "last",
  motion: "system",
  lastBoardPath: "",
};
const SETTINGS_OPTIONS = {
  theme: new Set(["system", "light", "dark"]),
  density: new Set(["comfortable", "compact"]),
  completedVisibility: new Set(["show", "collapse"]),
  boardOpenBehavior: new Set(["last", "newest"]),
  motion: new Set(["system", "reduce", "allow"]),
};
const DEFAULT_BIND_HOST = "127.0.0.1";
const DEFAULT_PUBLIC_HOST = "goalbuddy.localhost";
const DEFAULT_PORT = 41737;
const STATE_CHANGE_SETTLE_MS = 300;

if (isDirectRun()) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

function isDirectRun() {
  if (!process.argv[1]) return false;
  return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
}

export async function main() {
  const options = parseArgs(process.argv.slice(2));
  const goalDir = resolve(options.goal || "");
  if (!options.goal) throw new Error("Missing --goal docs/goals/<slug>");
  if (!existsSync(join(goalDir, "state.yaml"))) {
    throw new Error(`Missing state.yaml in ${goalDir}`);
  }

  const appDir = writeBoardApp(goalDir);
  const board = createBoardPayload(goalDir);

  if (options.once) {
    if (options.json) {
      console.log(JSON.stringify({ goalDir, appDir, board }, null, 2));
    } else {
      console.log(`Generated GoalBuddy board app at ${appDir}`);
    }
    return { goalDir, appDir, board };
  }

  let server = null;
  try {
    server = await startBoardServer({
      goalDir,
      appDir,
      host: options.host,
      publicHost: options.publicHost,
      port: options.port,
    });
  } catch (error) {
    if (error.code !== "EADDRINUSE") throw error;
    server = await registerWithBoardHub({
      goalDir,
      host: options.host,
      port: options.port,
    });
  }

  if (options.json) {
    console.log(JSON.stringify({ goalDir, appDir: server.appDir || appDir, url: server.url, hubUrl: server.hubUrl, apiUrl: server.apiUrl, registered: Boolean(server.registered) }, null, 2));
  } else {
    console.log(`GoalBuddy local board: ${server.url}`);
    console.log(`GoalBuddy local hub: ${server.hubUrl}`);
    if (server.registered) {
      console.log("Registered with the existing GoalBuddy local board hub.");
    } else {
      console.log(`Watching: ${join(goalDir, "state.yaml")}`);
      console.log("Press Ctrl-C to stop.");
    }
  }

  return server;
}

export function parseArgs(args) {
  const options = {
    goal: "",
    host: DEFAULT_BIND_HOST,
    publicHost: DEFAULT_PUBLIC_HOST,
    port: DEFAULT_PORT,
    once: false,
    json: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--goal") {
      options.goal = args[++index] || "";
    } else if (arg.startsWith("--goal=")) {
      options.goal = arg.slice("--goal=".length);
    } else if (arg === "--host") {
      options.host = args[++index] || options.host;
      options.publicHost = options.host;
    } else if (arg.startsWith("--host=")) {
      options.host = arg.slice("--host=".length);
      options.publicHost = options.host;
    } else if (arg === "--port") {
      options.port = Number(args[++index] || options.port);
    } else if (arg.startsWith("--port=")) {
      options.port = Number(arg.slice("--port=".length));
    } else if (arg === "--once") {
      options.once = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) {
    throw new Error(`Invalid --port: ${options.port}`);
  }

  return options;
}

export async function startBoardServer(options = {}) {
  const {
    goalDir,
    appDir = "",
    host = DEFAULT_BIND_HOST,
    publicHost = Object.hasOwn(options, "host") ? host : DEFAULT_PUBLIC_HOST,
    port = DEFAULT_PORT,
  } = options;
  const boards = new Map();
  let baseUrl = "";
  let initialBoard = null;
  const allowedHostnames = new Set(["localhost", "127.0.0.1", "[::1]", "::1", DEFAULT_PUBLIC_HOST]);
  if (host) allowedHostnames.add(String(host).toLowerCase());
  if (publicHost) allowedHostnames.add(String(publicHost).toLowerCase());

  const addBoard = (candidateGoalDir, candidateAppDir = "") => {
    const root = resolve(candidateGoalDir);
    if (!existsSync(join(root, "state.yaml"))) {
      throw new Error(`Missing state.yaml in ${root}`);
    }

    const existing = [...boards.values()].find((board) => board.root === root);
    if (existing) {
      existing.appDir = candidateAppDir || writeBoardApp(root);
      existing.lastPayload = safePayload(root);
      return boardSummary(existing, baseUrl);
    }

    const payload = safePayload(root);
    const board = {
      root,
      appDir: candidateAppDir || writeBoardApp(root),
      boardPath: nextBoardPath(root, payload, boards),
      clients: new Set(),
      lastPayload: payload,
      watcher: null,
      startedAt: new Date().toISOString(),
    };
    board.watcher = watchGoal(root, () => {
      board.lastPayload = safePayload(root);
      for (const client of board.clients) sendEvent(client, board.lastPayload);
      board.watcher.refresh();
    });
    boards.set(board.boardPath, board);
    return boardSummary(board, baseUrl);
  };

  const server = createServer(async (request, response) => {
    try {
      if (!requestHostAllowed(request, allowedHostnames)) {
        sendForbidden(response, "Unexpected Host header for the GoalBuddy local board.");
        return;
      }
      if ((request.method === "POST" || request.method === "PUT") && !originAllowed(request, allowedHostnames)) {
        sendForbidden(response, "Cross-site requests are not allowed for the GoalBuddy local board.");
        return;
      }
      const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
      if (request.method === "POST" && url.pathname === "/api/boards") {
        const payload = await readJsonRequest(request);
        sendJson(response, addBoard(payload.goalDir || ""));
        return;
      }
      if (url.pathname === "/" || url.pathname === "/boards") {
        redirectToFirstBoard(response, boards, baseUrl, readBoardSettings());
        return;
      }
      if (url.pathname === "/api/boards") {
        sendJson(response, { boards: [...boards.values()].map((board) => boardSummary(board, baseUrl)) });
        return;
      }
      if (url.pathname === "/api/settings") {
        if (request.method === "GET") {
          sendJson(response, { version: SETTINGS_VERSION, settings: readBoardSettings() });
          return;
        }
        if (request.method === "PUT") {
          const payload = await readJsonRequest(request);
          sendJson(response, { version: SETTINGS_VERSION, settings: writeBoardSettings(payload.settings || payload) });
          return;
        }
        response.writeHead(405, { "Allow": "GET, PUT" });
        response.end("Method not allowed");
        return;
      }

      const slashUrl = boardTrailingSlashUrl(url.pathname, boards, baseUrl);
      if (slashUrl) {
        redirect(response, slashUrl);
        return;
      }

      const route = routeBoardRequest(url.pathname, boards, initialBoard);
      if (!route.board) {
        sendUnregisteredBoardPath(response, url.pathname, boards, baseUrl);
        return;
      }
      if (route.pathname === "/api/board") {
        sendJson(response, safePayload(route.board.root));
        return;
      }
      if (route.pathname === "/events") {
        response.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
        });
        response.write("retry: 1000\n\n");
        route.board.clients.add(response);
        sendEvent(response, route.board.lastPayload);
        request.on("close", () => route.board.clients.delete(response));
        return;
      }

      serveStatic(route.board.appDir, route.pathname, response);
    } catch (error) {
      sendError(response, error);
    }
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, host, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  baseUrl = `http://${publicHost || host}:${actualPort}`;
  const initialSummary = addBoard(goalDir, appDir);
  initialBoard = boards.get(new URL(initialSummary.url).pathname);

  return {
    ...initialSummary,
    close: () => new Promise((resolveClose, rejectClose) => {
      for (const board of boards.values()) {
        board.watcher.close();
        for (const client of board.clients) client.end();
      }
      server.close((error) => error ? rejectClose(error) : resolveClose());
    }),
  };
}

async function registerWithBoardHub({ goalDir, host, port }) {
  const response = await fetch(`http://${host}:${port}/api/boards`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ goalDir }),
  });
  if (!response.ok) {
    const message = await response.text();
    if (response.status === 404) {
      throw new Error(`Port ${port} is already in use, but it is not the GoalBuddy multi-board hub. Stop the existing local board process on ${host}:${port}, then retry.`);
    }
    throw new Error(`GoalBuddy local board hub rejected ${goalDir}: ${message}`);
  }
  return { ...(await response.json()), registered: true };
}

function redirectToFirstBoard(response, boards, baseUrl, settings = {}) {
  const board = preferredBoard(boards, settings);
  if (!board) {
    response.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end("No GoalBuddy boards are registered.");
    return;
  }

  redirect(response, `${baseUrl}${board.boardPath}`);
}

function preferredBoard(boards, settings = {}) {
  const allBoards = [...boards.values()];
  if (allBoards.length === 0) return null;
  const normalized = normalizeSettings(settings);
  if (normalized.boardOpenBehavior === "last" && normalized.lastBoardPath) {
    const remembered = allBoards.find((board) => board.boardPath === normalized.lastBoardPath);
    if (remembered) return remembered;
  }
  if (normalized.boardOpenBehavior === "newest") {
    return allBoards
      .slice()
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0];
  }
  return allBoards[0];
}

function boardTrailingSlashUrl(pathname, boards, baseUrl) {
  for (const board of boards.values()) {
    const prefix = board.boardPath.endsWith("/") ? board.boardPath.slice(0, -1) : board.boardPath;
    if (pathname === prefix) return `${baseUrl}${board.boardPath}`;
  }
  return "";
}

function redirect(response, location) {
  response.writeHead(302, {
    "Location": location,
    "Cache-Control": "no-store",
  });
  response.end();
}

function boardPathFor(goalDir, payload) {
  const slug = slugifyPathSegment(payload?.goal?.slug || basename(goalDir));
  return `/${slug || "goal"}/`;
}

function nextBoardPath(goalDir, payload, boards) {
  const existing = [...boards.values()].find((board) => board.root === goalDir);
  if (existing) return existing.boardPath;

  const basePath = boardPathFor(goalDir, payload);
  if (!boards.has(basePath)) return basePath;

  const prefix = basePath.slice(0, -1);
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${prefix}-${index}/`;
    if (!boards.has(candidate)) return candidate;
  }
  throw new Error(`Could not allocate a board path for ${goalDir}`);
}

function boardSummary(board, baseUrl) {
  const slug = board.boardPath.replace(/^\/+|\/+$/g, "")
    || slugifyPathSegment(board.lastPayload.goal?.slug || basename(board.root))
    || "goal";
  return {
    goalDir: board.root,
    appDir: board.appDir,
    title: board.lastPayload.goal?.title || basename(board.root),
    slug,
    url: `${baseUrl}${board.boardPath}`,
    hubUrl: `${baseUrl}/`,
    indexUrl: `${baseUrl}/`,
    apiUrl: `${baseUrl}/api/boards`,
    startedAt: board.startedAt,
  };
}

function slugifyPathSegment(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function routeBoardRequest(pathname, boards, initialBoard) {
  if ((pathname === "/api/board" || pathname === "/events") && initialBoard) {
    return { board: initialBoard, pathname };
  }

  const matches = [...boards.values()]
    .map((board) => ({ board, pathname: stripBoardPathPrefix(pathname, board.boardPath) }))
    .filter((route) => route.pathname !== pathname || pathname === route.board.boardPath.slice(0, -1))
    .sort((left, right) => right.board.boardPath.length - left.board.boardPath.length);

  return matches[0] || { board: null, pathname };
}

function sendUnregisteredBoardPath(response, pathname, boards, baseUrl) {
  response.writeHead(404, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  const registeredBoards = [...boards.values()].map((board) => {
    const summary = boardSummary(board, baseUrl);
    return `- ${summary.title}: ${summary.url}`;
  });
  response.end([
    `GoalBuddy board path is not registered in this local hub: ${pathname}`,
    "",
    "This server is the GoalBuddy multi-board hub. Do not stop it just because a /<slug>/ board URL returned 404.",
    "Start or rerun `goalbuddy board <goal-dir>` to register that goal on this same port, then open the printed /<slug>/ URL.",
    "",
    "Registered boards:",
    registeredBoards.length ? registeredBoards.join("\n") : "- none",
    "",
    `Hub API: ${baseUrl}/api/boards`,
  ].join("\n"));
}

function stripBoardPathPrefix(pathname, boardPath) {
  const prefix = boardPath.endsWith("/") ? boardPath.slice(0, -1) : boardPath;
  if (pathname === prefix) return "/";
  if (pathname.startsWith(`${prefix}/`)) {
    return pathname.slice(prefix.length) || "/";
  }
  return pathname;
}

async function readJsonRequest(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error("Request body is too large.");
  }
  return JSON.parse(body || "{}");
}

function watchGoal(goalDir, onChange) {
  const watchers = [];
  const schedule = debounce(onChange, STATE_CHANGE_SETTLE_MS);
  let watchedDirs = new Set();

  const rebuild = () => {
    const nextWatchedDirs = goalDirsForPayload(goalDir);
    const nextWatchers = [];
    try {
      for (const dir of nextWatchedDirs) {
        nextWatchers.push(watch(dir, { persistent: true }, (_event, filename) => {
          if (!filename || filename === "state.yaml" || filename === "notes") schedule();
        }));
        const notesDir = join(dir, "notes");
        if (existsSync(notesDir)) nextWatchers.push(watch(notesDir, { persistent: true }, schedule));
      }
    } catch (error) {
      for (const watcher of nextWatchers) watcher.close();
      throw error;
    }
    const previousWatchers = watchers.splice(0, watchers.length, ...nextWatchers);
    watchedDirs = nextWatchedDirs;
    for (const watcher of previousWatchers) watcher.close();
    schedule();
  };

  rebuild();
  return {
    close() {
      for (const watcher of watchers) watcher.close();
    },
    refresh() {
      const next = goalDirsForPayload(goalDir);
      if (!sameSet(watchedDirs, next)) rebuild();
    },
  };
}

function safePayload(goalDir) {
  try {
    return createBoardPayload(goalDir);
  } catch (error) {
    return {
      generatedAt: new Date().toISOString(),
      error: error.message,
      goal: { title: "GoalBuddy Board", slug: "", status: "error", activeTask: "", tranche: "" },
      columns: [
        { id: "todo", title: "Todo", description: "Queued work ready to pull", tasks: [] },
        { id: "in-progress", title: "In Progress", description: "The active task", tasks: [] },
        { id: "blocked", title: "Blocked", description: "Needs unblock or a smaller slice", tasks: [] },
        { id: "completed", title: "Completed", description: "Receipted work", tasks: [] },
      ],
      tasks: [],
      notes: [],
    };
  }
}

function goalDirsForPayload(goalDir) {
  const dirs = new Set([resolve(goalDir)]);
  try {
    collectPayloadGoalDirs(createBoardPayload(goalDir), dirs);
  } catch {
    // Keep watching the parent when the board is temporarily invalid.
  }
  return dirs;
}

function collectPayloadGoalDirs(payload, dirs) {
  if (payload?.source?.goalDir) dirs.add(resolve(payload.source.goalDir));
  for (const task of payload?.tasks || []) {
    if (task.subgoal?.board) collectPayloadGoalDirs(task.subgoal.board, dirs);
  }
}

function sameSet(left, right) {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

function sendJson(response, payload) {
  response.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload, null, 2));
}

function requestHostAllowed(request, allowedHostnames) {
  const rawHost = request.headers.host || "";
  if (!rawHost) return false;
  try {
    return allowedHostnames.has(new URL(`http://${rawHost}`).hostname.toLowerCase());
  } catch {
    return false;
  }
}

function originAllowed(request, allowedHostnames) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return allowedHostnames.has(new URL(origin).hostname.toLowerCase());
  } catch {
    return false;
  }
}

function sendForbidden(response, message) {
  response.writeHead(403, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(message);
}

function sendError(response, error) {
  response.writeHead(400, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(error.message || "Request failed");
}

function sendEvent(response, payload) {
  response.write(`event: board\ndata: ${JSON.stringify(payload)}\n\n`);
}

function serveStatic(appDir, pathname, response) {
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  if (!/^\/[A-Za-z0-9_.-]+$/.test(cleanPath) || cleanPath === "/.." || cleanPath === "/.") {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  const file = join(appDir, cleanPath.slice(1));
  if (!existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  const fileExtension = cleanPath.match(/\.[^.]+$/)?.[0] || "";
  response.writeHead(200, {
    "Content-Type": textTypes[fileExtension] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  response.end(readFileSync(file));
}

function debounce(fn, delay) {
  let timer = null;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, delay);
  };
}

function readBoardSettings() {
  try {
    if (!existsSync(settingsPath())) return { ...SETTINGS_DEFAULTS };
    return normalizeSettings(JSON.parse(readFileSync(settingsPath(), "utf8")));
  } catch {
    return { ...SETTINGS_DEFAULTS };
  }
}

function writeBoardSettings(settings) {
  const normalized = normalizeSettings(settings, readBoardSettings());
  const path = settingsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(normalized, null, 2)}\n`);
  return normalized;
}

function normalizeSettings(settings, base = SETTINGS_DEFAULTS) {
  const normalized = { ...base };
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return normalized;
  for (const [key, allowed] of Object.entries(SETTINGS_OPTIONS)) {
    if (allowed.has(settings[key])) normalized[key] = settings[key];
  }
  if (typeof settings.lastBoardPath === "string" && /^\/[a-z0-9][a-z0-9-]*\/$/.test(settings.lastBoardPath)) {
    normalized.lastBoardPath = settings.lastBoardPath;
  }
  return normalized;
}

function settingsPath() {
  return process.env.GOALBUDDY_LOCAL_BOARD_SETTINGS_PATH || join(homedir(), ".goalbuddy", "local-board-settings.json");
}

function usage() {
  console.log(`GoalBuddy Local Goal Board

Usage:
  goalbuddy board docs/goals/<slug>
  goalbuddy board docs/goals/<slug> --once --json

Options:
  --goal <path>   Goal directory containing state.yaml.
  --host <host>   Local server bind host. Default: 127.0.0.1, advertised as goalbuddy.localhost.
  --port <port>   Local server port. Default: 41737 shared board hub.
  --once          Generate .goalbuddy-board and exit.
  --json          Print structured output.
`);
}
