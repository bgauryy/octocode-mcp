#!/usr/bin/env python3
"""Tests for the benchmark harness: gh guard, transcript measurement, campaign summary."""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

BIN = Path(__file__).resolve().parent


def transcript(*events) -> str:
    return "".join(json.dumps(e) + "\n" for e in events)


INIT_OK = {"type": "system", "subtype": "init", "mcp_servers": [{"name": "octocode", "status": "connected"}]}
INIT_FAILED = {"type": "system", "subtype": "init", "mcp_servers": [{"name": "octocode", "status": "failed"}]}
RESULT = {"type": "result", "subtype": "success", "is_error": False, "result": "**Answer** ok",
          "usage": {"input_tokens": 10, "output_tokens": 5}, "total_cost_usd": 0.01, "num_turns": 3}


def use(i, name, inp):
    return {"type": "assistant", "message": {"content": [{"type": "tool_use", "id": i, "name": name, "input": inp}]}}


def result(i, content, error=False):
    return {"type": "user", "message": {"content": [{"type": "tool_result", "tool_use_id": i, "content": content, "is_error": error}]}}


class GuardTest(unittest.TestCase):
    def run_guard(self, *args):
        with tempfile.TemporaryDirectory() as tmp:
            fake = Path(tmp) / "gh"
            fake.write_text("#!/usr/bin/env bash\necho REAL \"$@\"\n")
            fake.chmod(0o755)
            env = {**os.environ, "REAL_GH": str(fake)}
            return subprocess.run([str(BIN / "guard" / "gh"), *args], capture_output=True, text=True, env=env)

    def test_reads_pass_through(self):
        for args in (["search", "code", "x", "--repo", "a/b"], ["api", "repos/a/b", "--jq", ".x"],
                     ["api", "-X", "GET", "search/code", "-f", "q=x"], ["pr", "view", "1"], ["repo", "view", "a/b"]):
            out = self.run_guard(*args)
            self.assertEqual(out.returncode, 0, args)
            self.assertTrue(out.stdout.startswith("REAL"), args)

    def test_writes_are_refused(self):
        for args in (["api", "-X", "POST", "repos/a/b/issues"], ["api", "repos/a/b/issues", "-f", "title=x"],
                     ["api", "--method=DELETE", "repos/a/b"], ["pr", "merge", "1"], ["auth", "token"],
                     ["api", "graphql", "-f", "query=mutation { x }"]):
            out = self.run_guard(*args)
            self.assertEqual(out.returncode, 2, args)
            self.assertIn("not allowed", out.stderr)


    def test_guard_refuses_to_call_itself(self):
        env = {**os.environ, "REAL_GH": str(BIN / "guard" / "gh")}
        out = subprocess.run([str(BIN / "guard" / "gh"), "api", "x"], capture_output=True, text=True, env=env, timeout=10)
        self.assertEqual(out.returncode, 3)


class LocalGuardTest(unittest.TestCase):
    """guard-local/git and guard-local/find: the local-shell arm's read-only wrappers."""

    def run_guard(self, tool, *args):
        with tempfile.TemporaryDirectory() as tmp:
            fake = Path(tmp) / tool
            fake.write_text("#!/usr/bin/env bash\necho REAL \"$@\"\n")
            fake.chmod(0o755)
            env = {**os.environ, f"REAL_{tool.upper()}": str(fake)}
            return subprocess.run([str(BIN / "guard-local" / tool), *args], capture_output=True, text=True, env=env)

    def test_reads_pass_through(self):
        for tool, args in (("git", ["-C", "/x", "log", "--oneline", "-3"]), ("git", ["grep", "-c", "x"]),
                           ("git", ["ls-files", "*.rs"]), ("git", ["--no-pager", "show", "HEAD:a"]),
                           ("find", ["/x", "-maxdepth", "1", "-name", "*.go"])):
            out = self.run_guard(tool, *args)
            self.assertEqual(out.returncode, 0, args)
            self.assertTrue(out.stdout.startswith("REAL"), args)

    def test_writes_are_refused(self):
        for tool, args in (("git", ["push"]), ("git", ["-C", "/x", "checkout", "main"]), ("git", ["-c", "core.pager=x", "log"]),
                           ("git", ["log", "--output=/tmp/x"]), ("git", ["grep", "-O", "x"]), ("git", ["stash"]),
                           ("find", ["/x", "-delete"]), ("find", ["/x", "-exec", "rm", "{}", ";"])):
            out = self.run_guard(tool, *args)
            self.assertEqual(out.returncode, 2, args)
            self.assertIn("not allowed", out.stderr)


class TranscriptTest(unittest.TestCase):
    def convert(self, text):
        tmp = Path(tempfile.mkdtemp())
        (tmp / "t.jsonl").write_text(text)
        subprocess.run([sys.executable, str(BIN / "transcript_to_log.py"), "--transcript", str(tmp / "t.jsonl"),
                        "--log", str(tmp / "Q1.jsonl"), "--run-dir", str(tmp / "run"), "--question", "Q1"],
                       check=True, capture_output=True)
        rows = [json.loads(l) for l in (tmp / "Q1.jsonl").read_text().splitlines()]
        status = json.loads((tmp / "run" / "status.json").read_text())
        return tmp, rows, status

    def test_counts_what_the_model_wrote_and_read(self):
        tmp, rows, status = self.convert(transcript(
            INIT_OK,
            use("a", "Bash", {"command": "gh api repos/a/b --jq .x"}), result("a", "main"),
            use("b", "mcp__octocode__ghSearchCode", {"queries": [{"owner": "a"}]}),
            result("b", [{"type": "text", "text": "{\"results\":[]}"}]),
            use("c", "Bash", {"command": "gh pr merge 1"}), result("c", "refused", error=True),
            RESULT))
        self.assertTrue(status["ok"])
        self.assertEqual([r.get("exit_code") for r in rows], [0, 0, 1, None])
        self.assertEqual(rows[0]["cmd"], 'Bash {"command":"gh api repos/a/b --jq .x"}')
        self.assertEqual(rows[0]["model_in_chars"], 4)
        self.assertTrue(rows[1]["cmd"].startswith("ghSearchCode "))
        self.assertEqual(rows[1]["model_in_chars"], len('{"results":[]}'))
        self.assertEqual(rows[-1]["kind"], "answer")
        self.assertEqual(rows[-1]["model_out_chars"], len("**Answer** ok\n"))
        strict = subprocess.run([sys.executable, str(BIN / "sumlog.py"), "--strict", str(tmp / "Q1.jsonl")],
                                capture_output=True, text=True)
        self.assertEqual(strict.returncode, 0, strict.stdout)

    def test_mcp_that_never_connected_is_invalid(self):
        _, _, status = self.convert(transcript(INIT_FAILED, RESULT))
        self.assertFalse(status["ok"])
        self.assertIn("octocode failed", status["problems"][0])

    def test_rate_limit_starved_run_is_invalid(self):
        _, _, status = self.convert(transcript(
            INIT_OK, use("a", "Bash", {"command": "gh search code x"}), result("a", "HTTP 403: API rate limit exceeded", error=True),
            use("b", "Bash", {"command": "gh api x"}), result("b", "ok"), RESULT))
        self.assertFalse(status["ok"])
        self.assertIn("rate-limited 1/2", status["problems"][0])

    def test_missing_result_is_invalid(self):
        _, _, status = self.convert(transcript(INIT_OK, use("a", "Bash", {"command": "gh"}), result("a", "x")))
        self.assertFalse(status["ok"])


class CampaignSummaryTest(unittest.TestCase):
    def test_deblinds_judgments(self):
        camp = Path(tempfile.mkdtemp()) / "demo-120000-2026-10-09"
        for arm, chars in (("mcp", 10), ("gh-lean", 30)):
            run = camp / "runs" / f"{arm}-p1-Q1"
            run.mkdir(parents=True)
            (run / "result.json").write_text(json.dumps(RESULT))
            (camp / f"{arm}-p1-Q1.jsonl").write_text(json.dumps(
                {"kind": "answer", "cmd": "answer:Q1", "model_in_chars": 0, "model_out_chars": chars, "total_chars": chars}) + "\n")
        judge = camp / "judge" / "mcp~gh-lean"
        judge.mkdir(parents=True)
        (judge / "MAP.secret.txt").write_text("p1 Q1 X=gh-lean Y=mcp\n")
        (judge / "p1-Q1.md").write_text('```json\n{"X":{"correctness":8,"depth":4,"workflow":4},'
                                        '"Y":{"correctness":9,"depth":5,"workflow":5},"winner":"Y","reason":"r"}\n```\n')
        out = camp.parent / "summary.json"
        subprocess.run([sys.executable, str(BIN / "campaign_summary.py"), str(camp), "--out", str(out)],
                       check=True, capture_output=True)
        doc = json.loads(out.read_text())
        self.assertEqual({r["arm"]: r["chars"] for r in doc["runs"]}, {"mcp": 10, "gh-lean": 30})
        self.assertEqual(doc["judgments"][0]["winner"], "mcp")
        self.assertEqual(doc["judgments"][0]["scores"]["gh-lean"]["correctness"], 8)


if __name__ == "__main__":
    unittest.main()
