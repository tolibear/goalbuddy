#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SCRIPT = REPO / "codex-goal-compiler" / "scripts" / "check_goalbuddy_runtime.py"


def fake_cli(root: Path) -> Path:
    path = root / "goalbuddy"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        """#!/usr/bin/env python3
import json, os, sys, time
args = sys.argv[1:]
mode = os.environ.get('FAKE_MODE', 'valid')
if len(args) == 4 and args[:2] == ['contract', '--target'] and args[3] == '--json':
    target = args[2]
    if mode == 'timeout': time.sleep(1)
    if mode == 'malformed': print('not-json'); raise SystemExit(0)
    if mode == 'empty': print('{}'); raise SystemExit(0)
    if mode == 'nonobject': print('[]'); raise SystemExit(0)
    capabilities = [
        'atomic_amendment_transition',
        'atomic_placeholder_hydration_transition',
        'lossless_receipt_identity',
        'strict_multiline_yaml_projection',
        'closed_judge_decision_vocabulary',
        'atomic_exact_human_wait_resume',
        'atomic_goal_completion',
    ]
    target_report = {
        'name': target,
        'ready': True,
        'install_model': 'plugin' if target == 'codex' else 'personal-skills-and-agents',
        'goal_prep_installed': True,
        'compiler_installed': True,
        'agents_ready': True,
    }
    if target == 'codex':
        target_report.update(native_goal_ready=True, duplicate_compiler_present=False)
    else:
        target_report['goal_command_ready'] = True
    payload = {
        'ok': True,
        'contract_version': 1,
        'product_version': '0.5.0',
        'board_schema_version': 2,
        'capabilities': capabilities,
        'source': {'kind': 'local_git_checkout', 'root': '/tmp/goalbuddy', 'commit': 'a' * 40, 'dirty': False},
        'target': target_report,
        'errors': [],
    }
    if mode == 'unsupported-contract': payload['contract_version'] = 2
    if mode == 'unsupported-board': payload['board_schema_version'] = 3
    if mode == 'missing-capability': payload['capabilities'].remove('atomic_amendment_transition')
    if mode == 'extra-capability': payload['capabilities'].append('future_additive_capability')
    if mode == 'unready': payload['target']['ready'] = False
    if mode == 'wrong-target': payload['target']['name'] = 'claude' if target == 'codex' else 'codex'
    if mode == 'missing-compiler': payload['target']['compiler_installed'] = False
    if mode == 'duplicate' and target == 'codex': payload['target']['duplicate_compiler_present'] = True
    if mode == 'bad-source': payload['source']['kind'] = 'mystery'
    if mode == 'declared-error': payload.update(ok=False, errors=['declared runtime error'])
    print(json.dumps(payload))
    raise SystemExit(int(os.environ.get('FAKE_CONTRACT_EXIT', '0')))
raise SystemExit(2)
""",
        encoding="utf-8",
    )
    path.chmod(path.stat().st_mode | stat.S_IXUSR)
    return path


def run(cli: Path, target: str, *, use_override: bool = True, **overrides: str) -> tuple[int, dict[str, object]]:
    env = {**os.environ, **overrides}
    if use_override:
        env["GOALBUDDY_BIN"] = str(cli)
    else:
        env.pop("GOALBUDDY_BIN", None)
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--target", target, "--json"],
        check=False,
        capture_output=True,
        text=True,
        env=env,
    )
    return result.returncode, json.loads(result.stdout)


class GoalBuddyRuntimeCliTests(unittest.TestCase):
    def test_selected_target_contract_and_failure_modes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cli = fake_cli(root)

            for target in ("codex", "claude"):
                code, report = run(cli, target)
                self.assertEqual(0, code, report)
                self.assertTrue(report["ok"], report)

            code, report = run(cli, "codex", FAKE_MODE="extra-capability")
            self.assertEqual(0, code, report)
            self.assertTrue(report["ok"], report)

            for mode in (
                "malformed",
                "empty",
                "nonobject",
                "unsupported-contract",
                "unsupported-board",
                "missing-capability",
                "unready",
                "wrong-target",
                "missing-compiler",
                "duplicate",
                "bad-source",
                "declared-error",
            ):
                with self.subTest(mode=mode):
                    code, report = run(cli, "codex", FAKE_MODE=mode)
                    self.assertEqual(1, code, report)
                    self.assertFalse(report["ok"], report)
                    self.assertTrue(report["errors"], report)

            code, report = run(cli, "claude", FAKE_CONTRACT_EXIT="1")
            self.assertEqual(1, code, report)
            self.assertTrue(any("exited 1" in error for error in report["errors"]), report)

            code, report = run(
                cli,
                "codex",
                FAKE_MODE="timeout",
                GOALBUDDY_TIMEOUT_SECONDS="0.05",
            )
            self.assertEqual(1, code, report)
            self.assertTrue(any("timed out" in error for error in report["errors"]), report)

    def test_uses_only_override_or_bun_owned_cli(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            custom_bun = root / "custom-bun"
            cli = fake_cli(custom_bun / "bin")
            code, report = run(
                cli,
                "codex",
                use_override=False,
                BUN_INSTALL=str(custom_bun),
                HOME=str(root / "home"),
            )
            self.assertEqual(0, code, report)
            self.assertEqual(str(cli.resolve()), report["resolved_cli_path"], report)

            shadow = root / "shadow"
            shadow_cli = fake_cli(shadow)
            code, report = run(
                shadow_cli,
                "codex",
                use_override=False,
                BUN_INSTALL=str(root / "empty-bun"),
                HOME=str(root / "home"),
                PATH=f"{shadow}:{os.environ.get('PATH', '')}",
            )
            self.assertEqual(1, code, report)
            self.assertIn("CLI not found", report["errors"][0])

            broken_cli = root / "broken-cli"
            broken_cli.write_text("#!/definitely/missing/interpreter\n", encoding="utf-8")
            broken_cli.chmod(broken_cli.stat().st_mode | stat.S_IXUSR)
            code, report = run(broken_cli, "codex")
            self.assertEqual(1, code, report)
            self.assertTrue(any("could not launch" in error for error in report["errors"]), report)


if __name__ == "__main__":
    unittest.main()
