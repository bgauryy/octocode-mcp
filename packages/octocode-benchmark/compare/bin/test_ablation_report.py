#!/usr/bin/env python3
"""Executable contract checks for paired ablation accounting."""
from __future__ import annotations

import math
import unittest

from ablation_report import build, markdown, subset_spec


def row(arm: str, q: str, p: int, *, chars=100, ok=True, tokens=50, secs=2.0) -> dict:
    return {"arm": arm, "q": q, "pass": p, "chars": chars, "ok": ok,
            "input_tokens": tokens, "output_tokens": tokens, "secs": secs,
            "goal_queries": 1, "ranking_replay_queries": 1, "clasify_calls": 0,
            "tool_calls": {"localSearch": 2}, "failed": 0}


def doc(arm: str, runs: list[dict], judgments=None, prior=None) -> dict:
    return {"campaign": arm, "question_set": "local-v1", "question_ids": ["Q33", "Q34"],
            "manifest": {"passes": 1}, "runs": runs,
            "judgments": judgments or [], "prior_attempts": prior or []}


class AblationReportTest(unittest.TestCase):
    def test_invalid_pair_excluded_but_accounted_and_prior_attempt_preserved(self):
        off = doc("off", [row("off", "Q33", 1), row("off", "Q34", 1, chars=100)],
                  prior=[{**row("off", "Q33", 1), "attempt": "attempt-1", "ok": False}])
        on = doc("on", [row("on", "Q33", 1, chars=50),
                        row("on", "Q34", 1, chars=1, ok=False)])
        report = build(off, on, "off", "on", {"terraform": ["Q33", "Q34"]}, samples=100)
        s = report["subsets"]["terraform"]
        self.assertEqual((s["planned_pairs"], s["valid_pairs"], s["invalid_pairs"]), (2, 1, 1))
        self.assertEqual(s["metrics"]["chars"]["paired"], 1)
        self.assertAlmostEqual(s["metrics"]["chars"]["geomean_on_over_off"], 0.5)
        self.assertEqual({k: s["prior_attempts"]["off"][k] for k in ("count", "ok", "invalid")},
                         {"count": 1, "ok": 0, "invalid": 1})
        self.assertEqual(s["prior_attempts"]["off"]["attempts"][0]["attempt"], "attempt-1")
        self.assertEqual(s["every_question"][1]["passes"][0]["invalid_reason"], "run_not_ok")

    def test_missing_usage_and_judgments_are_unknown_not_zero(self):
        off = doc("off", [row("off", "Q33", 1, tokens=None)])
        on = doc("on", [row("on", "Q33", 1, tokens=30)])
        s = build(off, on, "off", "on", samples=100)["subsets"]["all"]
        self.assertEqual(s["metrics"]["reported_input_tokens"]["paired"], 0)
        self.assertIsNone(s["metrics"]["reported_input_tokens"]["geomean_on_over_off"])
        self.assertEqual(s["correctness"]["judged_valid_pairs"], 0)
        self.assertEqual(s["correctness"]["absent_judgments"], 1)
        self.assertIsNone(s["correctness"]["off_mean_whole_point_scores"])
        self.assertIsNone(s["provider"]["off"]["known_input_tokens"])
        self.assertFalse(s["provider"]["off"]["input_usage_complete"])
        self.assertIn("unknown", markdown(build(off, on, "off", "on", samples=100)))

    def test_missing_adoption_in_old_summary_remains_unknown(self):
        old = row("off", "Q33", 1)
        old.pop("goal_queries")
        s = build(doc("off", [old]), doc("on", [row("on", "Q33", 1)]),
                  "off", "on", samples=100)["subsets"]["all"]
        self.assertIsNone(s["adoption"]["off"]["goal_queries"])

    def test_whole_point_head_to_head_uses_within_one_tie(self):
        judgments = [
            {"pass": 1, "q": "Q33", "scores": {"off": {"correctness": 7}, "on": {"correctness": 8}}},
            {"pass": 1, "q": "Q34", "scores": {"off": {"correctness": 6}, "on": {"correctness": 9}}},
        ]
        off = doc("off", [row("off", "Q33", 1), row("off", "Q34", 1)], judgments)
        on = doc("on", [row("on", "Q33", 1), row("on", "Q34", 1)])
        c = build(off, on, "off", "on", samples=100)["subsets"]["all"]["correctness"]
        self.assertEqual(c["judged_valid_pairs"], 2)
        self.assertEqual(c["off_mean_whole_point_scores"], 6.5)
        self.assertEqual(c["on_mean_whole_point_scores"], 8.5)
        self.assertEqual(c["head_to_head_within_one_tie"], {"off": 0, "on": 1, "within_one_tie": 1})

    def test_named_subset_and_provider_completeness(self):
        self.assertEqual(subset_spec("terraform=Q33-Q40")[1], [f"Q{i}" for i in range(33, 41)])
        traced = {**row("off", "Q33", 1), "classification_http": {
            "attempts": 2, "completed": 1, "failed_or_unknown": 1,
            "known_input_tokens": 123, "known_output_tokens": 8,
            "input_tokens_complete": False, "output_tokens_complete": False}}
        s = build(doc("off", [traced]), doc("on", [row("on", "Q33", 1)]),
                  "off", "on", samples=100)["subsets"]["all"]
        self.assertEqual(s["provider"]["off"]["attempts_known"], 2)
        self.assertEqual(s["provider"]["off"]["known_input_tokens"], 123)
        self.assertFalse(s["provider"]["off"]["input_usage_complete"])
        self.assertEqual(s["adoption"]["off"]["tool_calls"]["localSearch"], 2)

    def test_rejects_different_corpus_and_unplanned_subset(self):
        off = doc("off", [row("off", "Q33", 1)])
        on = doc("on", [row("on", "Q33", 1)])
        on["question_set"] = "github-v2"
        with self.assertRaisesRegex(ValueError, "different question sets"):
            build(off, on, "off", "on", samples=100)
        on["question_set"] = "local-v1"
        with self.assertRaisesRegex(ValueError, "unplanned questions"):
            build(off, on, "off", "on", {"bad": ["Q40"]}, samples=100)

    def test_multi_pass_question_is_one_bootstrap_unit(self):
        off = doc("off", [row("off", "Q33", 1, chars=100), row("off", "Q33", 2, chars=100),
                          row("off", "Q34", 1, chars=100)])
        on = doc("on", [row("on", "Q33", 1, chars=50), row("on", "Q33", 2, chars=150),
                        row("on", "Q34", 1, chars=50)])
        s = build(off, on, "off", "on", samples=1000)["subsets"]["all"]
        metric = s["metrics"]["chars"]
        self.assertEqual((metric["paired"], metric["questions"]), (3, 2))
        self.assertAlmostEqual(metric["geomean_on_over_off"], math.sqrt(0.5))
        self.assertEqual(metric["median_on_over_off"], 0.75)
        self.assertEqual(metric["leaner_on_questions"], 1)
        one_question = s["every_question"][0]["chars"]
        self.assertEqual((one_question["paired"], one_question["questions"]), (2, 1))
        self.assertEqual(one_question["bootstrap_ci95"], [1.0, 1.0])
        self.assertEqual(s["valid_pairs"], 3)
        self.assertEqual(build(off, on, "off", "on", samples=10)["bootstrap"]["resampling_unit"], "question")


if __name__ == "__main__":
    unittest.main()
