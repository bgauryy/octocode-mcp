#!/usr/bin/env python3
"""Paired, auditable off/on report from campaign_summary.py JSON documents.

Example:
  python3 ablation_report.py off.json on.json --off-arm mcp-off --on-arm mcp-on \
    --subset terraform=Q33-Q40 --json-out ablation.json --md-out ablation.md

Ratios are on/off (<1 means the on arm used less). Only successful matched
runs with known, positive measurements enter a metric. Matched passes are
averaged within each question before the question-level bootstrap.
"""
from __future__ import annotations

import argparse
import json
import math
import random
import re
import statistics
from collections import Counter, defaultdict
from pathlib import Path


METRICS = {"chars": "chars", "reported_input_tokens": "input_tokens",
           "reported_output_tokens": "output_tokens", "wall_seconds": "secs"}


def question_key(q: str) -> tuple[int, str]:
    match = re.fullmatch(r"Q(\d+)", q)
    return (int(match[1]), q) if match else (10**9, q)


def subset_spec(spec: str) -> tuple[str, list[str]]:
    name, sep, values = spec.partition("=")
    if not sep or not name or not values:
        raise ValueError("subset must be NAME=Qn-Qm or NAME=Qn,Qm")
    questions = set()
    for part in values.split(","):
        match = re.fullmatch(r"Q(\d+)-Q(\d+)", part)
        if match:
            first, last = map(int, match.groups())
            if first > last:
                raise ValueError(f"descending question range: {part}")
            questions.update(f"Q{i}" for i in range(first, last + 1))
        elif re.fullmatch(r"Q\d+", part):
            questions.add(part)
        else:
            raise ValueError(f"invalid question: {part}")
    return name, sorted(questions, key=question_key)


def positive(row: dict | None, key: str) -> float | None:
    value = row.get(key) if row else None
    if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value > 0:
        return float(value)
    return None


def ratio_summary(pairs: list[tuple[str, dict | None, dict | None]], key: str,
                  *, seed: int, samples: int) -> dict:
    by_question: dict[str, list[tuple[float, float]]] = defaultdict(list)
    for q, off, on in pairs:
        a, b = positive(off, key), positive(on, key)
        if a is not None and b is not None:
            by_question[q].append((a, b))
    ratios = [sum(b for _, b in values) / sum(a for a, _ in values)
              for _, values in sorted(by_question.items(), key=lambda item: question_key(item[0]))]
    logs = [math.log(r) for r in ratios]
    if not logs:
        return {"paired": 0, "questions": 0, "geomean_on_over_off": None,
                "median_on_over_off": None, "leaner_on_questions": 0, "bootstrap_ci95": None}
    mean = sum(logs) / len(logs)
    rng = random.Random(seed)
    estimates = sorted(math.exp(sum(rng.choice(logs) for _ in logs) / len(logs))
                       for _ in range(samples))
    return {"paired": sum(map(len, by_question.values())), "questions": len(logs),
            "geomean_on_over_off": math.exp(mean),
            "median_on_over_off": statistics.median(ratios),
            "leaner_on_questions": sum(r < 1 for r in ratios),
            "bootstrap_ci95": [estimates[int(0.025 * samples)],
                               estimates[min(samples - 1, int(0.975 * samples))]]}


def score(judgment: dict | None, arm: str) -> int | None:
    value = (judgment or {}).get("scores", {}).get(arm, {}).get("correctness")
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def provider(rows: list[dict]) -> dict:
    known_in = known_out = attempts = completed = failed = rejected = 0
    observed = complete_in = complete_out = 0
    missing_trace = 0
    for row in rows:
        trace = row.get("classification_http")
        if trace is None:
            missing_trace += 1
            continue
        observed += 1
        attempts += trace.get("attempts", 0)
        completed += trace.get("completed", 0)
        failed += trace.get("failed_or_unknown", 0)
        rejected += trace.get("rejected_before_upstream", 0)
        known_in += trace.get("known_input_tokens", 0)
        known_out += trace.get("known_output_tokens", 0)
        complete_in += bool(trace.get("input_tokens_complete"))
        complete_out += bool(trace.get("output_tokens_complete"))
    return {"traced_runs": observed, "missing_trace_runs": missing_trace,
            "attempts_known": attempts, "completed_known": completed,
            "failed_or_unknown_known": failed, "rejected_before_upstream_known": rejected,
            "known_input_tokens": known_in if observed else None,
            "known_output_tokens": known_out if observed else None,
            "input_usage_complete": missing_trace == 0 and complete_in == observed,
            "output_usage_complete": missing_trace == 0 and complete_out == observed,
            "scope": "Traced transport attempts, including probes; missing trace or usage is unknown, not zero"}


def adoption(rows: list[dict]) -> dict:
    tools: Counter = Counter()
    tool_errors: Counter = Counter()
    errors = 0
    for row in rows:
        tools.update(row.get("tool_calls") or {})
        tool_errors.update(row.get("tool_failed_calls") or {})
        errors += row.get("failed", 0) or 0
    def observed_sum(key: str) -> int | None:
        return sum(r[key] for r in rows) if all(r.get(key) is not None for r in rows) else None
    return {"goal_queries": observed_sum("goal_queries"),
            "ranking_replay_queries": observed_sum("ranking_replay_queries"),
            "clasify_calls": observed_sum("clasify_calls"),
            "tool_calls": dict(sorted(tools.items())), "tool_errors_total": errors,
            "per_tool_errors": dict(sorted(tool_errors.items())) if all(
                r.get("tool_failed_calls") is not None for r in rows) else None}


def build(off_doc: dict, on_doc: dict, off_arm: str, on_arm: str,
          subsets: dict[str, list[str]] | None = None, *, seed: int = 42,
          samples: int = 10000) -> dict:
    if samples < 1:
        raise ValueError("bootstrap samples must be positive")
    off_set, on_set = off_doc.get("question_set"), on_doc.get("question_set")
    if off_set and on_set and off_set != on_set:
        raise ValueError(f"different question sets: {off_set} vs {on_set}")
    off_rows = [r for r in off_doc.get("runs", []) if r.get("arm") == off_arm]
    on_rows = [r for r in on_doc.get("runs", []) if r.get("arm") == on_arm]
    off_by = {(r["pass"], r["q"]): r for r in off_rows}
    on_by = {(r["pass"], r["q"]): r for r in on_rows}
    if len(off_by) != len(off_rows) or len(on_by) != len(on_rows):
        raise ValueError("duplicate final run identity; select one campaign per arm")
    attempt_rows = {"off": [r for r in off_doc.get("prior_attempts", []) if r.get("arm") == off_arm],
                    "on": [r for r in on_doc.get("prior_attempts", []) if r.get("arm") == on_arm]}
    questions = set(off_doc.get("question_ids") or []) | set(on_doc.get("question_ids") or [])
    questions |= {q for _, q in off_by.keys() | on_by.keys()}
    questions |= {r["q"] for rows in attempt_rows.values() for r in rows}
    if not questions:
        raise ValueError("no planned or attempted questions")
    passes = set()
    for doc in (off_doc, on_doc):
        manifest_passes = doc.get("manifest", {}).get("passes")
        if isinstance(manifest_passes, int):
            passes.update(range(1, manifest_passes + 1))
        elif isinstance(manifest_passes, list):
            passes.update(manifest_passes)
    passes |= {p for p, _ in off_by.keys() | on_by.keys()}
    passes |= {r["pass"] for rows in attempt_rows.values() for r in rows}
    if not passes:
        raise ValueError("no planned or attempted passes")
    all_subsets = {"all": sorted(questions, key=question_key), **(subsets or {})}
    if "all" in (subsets or {}):
        raise ValueError("subset name 'all' is reserved")
    for name, qs in (subsets or {}).items():
        missing = set(qs) - questions
        if missing:
            raise ValueError(f"subset {name} contains unplanned questions: {sorted(missing, key=question_key)}")
    judgments = {}
    for doc in (off_doc, on_doc):
        for j in doc.get("judgments", []):
            if off_arm in j.get("scores", {}) and on_arm in j.get("scores", {}):
                key = (j["pass"], j["q"])
                if key in judgments and judgments[key]["scores"] != j["scores"]:
                    raise ValueError(f"conflicting judgments for {key}")
                judgments[key] = j
    result = {"campaigns": {"off": off_doc.get("campaign"), "on": on_doc.get("campaign")},
              "arms": {"off": off_arm, "on": on_arm},
              "question_sets": {"off": off_doc.get("question_set"), "on": on_doc.get("question_set")},
              "ratio_definition": "on/off; below 1 is less on-arm resource usage",
              "bootstrap": {"samples": samples, "seed": seed, "resampling_unit": "question",
                            "within_question": "mean each arm over matched valid passes, then on/off"},
              "subsets": {}}
    for name, qs in all_subsets.items():
        cells = []
        for q in qs:
            for p in sorted(passes):
                off, on = off_by.get((p, q)), on_by.get((p, q))
                j = judgments.get((p, q))
                valid = bool(off and on and off.get("ok") and on.get("ok"))
                a, b = score(j, off_arm), score(j, on_arm)
                cells.append({"q": q, "pass": p, "off": off, "on": on,
                              "valid_pair": valid, "invalid_reason": None if valid else
                              ("missing_run" if not off or not on else "run_not_ok"),
                              "correctness": {"off": a, "on": b} if valid else {"off": None, "on": None},
                              "judgment_present": bool(j)})
        valid_cells = [c for c in cells if c["valid_pair"]]
        judged = [c for c in valid_cells if c["correctness"]["off"] is not None
                  and c["correctness"]["on"] is not None]
        off_scores = [c["correctness"]["off"] for c in judged]
        on_scores = [c["correctness"]["on"] for c in judged]
        head = Counter("on" if b - a > 1 else "off" if a - b > 1 else "within_one_tie"
                       for a, b in zip(off_scores, on_scores))
        rows = {"off": [r for r in off_rows if r["q"] in qs],
                "on": [r for r in on_rows if r["q"] in qs]}
        prior = {arm: [r for r in attempt_rows[arm] if r["q"] in qs] for arm in ("off", "on")}
        metrics = {label: ratio_summary([(c["q"], c["off"], c["on"]) for c in valid_cells], key,
                                        seed=seed, samples=samples)
                   for label, key in METRICS.items()}
        result["subsets"][name] = {
            "questions": qs, "planned_pairs": len(cells), "valid_pairs": len(valid_cells),
            "invalid_pairs": len(cells) - len(valid_cells),
            "final_runs": {arm: len(rows[arm]) for arm in ("off", "on")},
            "prior_attempts": {arm: {"count": len(prior[arm]),
                                      "ok": sum(bool(r.get("ok")) for r in prior[arm]),
                                      "invalid": sum(not bool(r.get("ok")) for r in prior[arm]),
                                      "attempts": prior[arm]}
                               for arm in ("off", "on")},
            "metrics": metrics,
            "correctness": {"judged_valid_pairs": len(judged),
                            "absent_judgments": len(valid_cells) - len(judged),
                            "off_mean_whole_point_scores": sum(off_scores) / len(judged) if judged else None,
                            "on_mean_whole_point_scores": sum(on_scores) / len(judged) if judged else None,
                            "head_to_head_within_one_tie": {k: head[k] for k in ("off", "on", "within_one_tie")}},
            "adoption": {arm: adoption(rows[arm]) for arm in ("off", "on")},
            "provider": {arm: provider(rows[arm]) for arm in ("off", "on")},
            "provider_prior_attempts": {arm: provider(prior[arm]) for arm in ("off", "on")},
            "every_question": [
                {"q": q, "planned": sum(c["q"] == q for c in cells),
                 "valid": sum(c["q"] == q and c["valid_pair"] for c in cells),
                 "invalid": sum(c["q"] == q and not c["valid_pair"] for c in cells),
                 "judged": sum(c["q"] == q for c in judged),
                 "prior_attempts": {arm: sum(r["q"] == q for r in prior[arm]) for arm in ("off", "on")},
                 "chars": ratio_summary([(c["q"], c["off"], c["on"]) for c in cells
                                         if c["q"] == q and c["valid_pair"]], "chars",
                                        seed=seed, samples=samples),
                 "passes": [{"pass": c["pass"], "valid_pair": c["valid_pair"],
                             "invalid_reason": c["invalid_reason"],
                             "off_chars": c["off"].get("chars") if c["off"] else None,
                             "on_chars": c["on"].get("chars") if c["on"] else None,
                             "off_correctness": c["correctness"]["off"],
                             "on_correctness": c["correctness"]["on"]}
                            for c in cells if c["q"] == q]}
                for q in qs]}
    return result


def markdown(report: dict) -> str:
    lines = ["# Paired ablation report", "",
             f"Off: `{report['arms']['off']}` ({report['campaigns']['off']}); on: `{report['arms']['on']}` ({report['campaigns']['on']}).",
             "Ratios are on/off. Each metric uses only valid pairs with known positive values; missing usage is unknown.",
             "Bootstrap resamples questions after averaging matched valid passes within each arm. Provider counts include probes when traced.", ""]
    for name, s in report["subsets"].items():
        lines += [f"## {name}", "", f"Planned {s['planned_pairs']}; valid {s['valid_pairs']}; invalid {s['invalid_pairs']}; "
                  f"prior attempts off/on {s['prior_attempts']['off']['count']}/{s['prior_attempts']['on']['count']}.", "",
                  "| Metric | Pass pairs | Questions | Geomean on/off | Median | Leaner on | Bootstrap 95% CI |",
                  "|---|---:|---:|---:|---:|---:|---:|"]
        for metric, value in s["metrics"].items():
            ratio = value["geomean_on_over_off"]
            ci = value["bootstrap_ci95"]
            lines.append(f"| {metric} | {value['paired']} | {value['questions']} | {ratio:.3f} | "
                         f"{value['median_on_over_off']:.3f} | {value['leaner_on_questions']} | "
                         f"[{ci[0]:.3f}, {ci[1]:.3f}] |" if ratio is not None
                         else f"| {metric} | 0 | 0 | unknown | unknown | 0 | unknown |")
        c = s["correctness"]
        rounded_off = (math.floor(c["off_mean_whole_point_scores"] + 0.5)
                       if c["off_mean_whole_point_scores"] is not None else "unknown")
        rounded_on = (math.floor(c["on_mean_whole_point_scores"] + 0.5)
                      if c["on_mean_whole_point_scores"] is not None else "unknown")
        lines += ["", f"Correctness: {c['judged_valid_pairs']} judged valid pairs; {c['absent_judgments']} without judgments. "
                  f"Whole-point-score means off/on: {rounded_off}/{rounded_on} "
                  "(unrounded values in JSON). "
                  f"Head-to-head (>1 point): {c['head_to_head_within_one_tie']}.", "",
                  "Adoption and traced provider attempts (off/on): "
                  f"goals {s['adoption']['off']['goal_queries']}/{s['adoption']['on']['goal_queries']}, "
                  f"ranking replay {s['adoption']['off']['ranking_replay_queries']}/{s['adoption']['on']['ranking_replay_queries']}, "
                  f"clasify calls {s['adoption']['off']['clasify_calls']}/{s['adoption']['on']['clasify_calls']}; "
                  f"provider attempts {s['provider']['off']['attempts_known']}/{s['provider']['on']['attempts_known']} "
                  f"(missing trace runs {s['provider']['off']['missing_trace_runs']}/{s['provider']['on']['missing_trace_runs']}).",
                  "Known provider usage totals and completeness flags are in JSON; incomplete totals are lower bounds, not zeros.", "",
                  "| Question | Planned | Valid | Invalid | Judged | Chars on/off |", "|---|---:|---:|---:|---:|---:|"]
        for q in s["every_question"]:
            ratio = q["chars"]["geomean_on_over_off"]
            lines.append(f"| {q['q']} | {q['planned']} | {q['valid']} | {q['invalid']} | {q['judged']} | "
                         f"{ratio:.3f} |" if ratio is not None else
                         f"| {q['q']} | {q['planned']} | {q['valid']} | {q['invalid']} | {q['judged']} | unknown |")
        lines.append("")
    lines.append("Machine-readable JSON includes every pass, adoption, per-tool calls, and provider usage completeness.")
    return "\n".join(lines) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("off_summary", type=Path)
    ap.add_argument("on_summary", type=Path)
    ap.add_argument("--off-arm", required=True)
    ap.add_argument("--on-arm", required=True)
    ap.add_argument("--subset", action="append", default=[], metavar="NAME=Qn-Qm")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--bootstrap", type=int, default=10000)
    ap.add_argument("--json-out", type=Path)
    ap.add_argument("--md-out", type=Path)
    args = ap.parse_args()
    subsets = dict(subset_spec(s) for s in args.subset)
    if len(subsets) != len(args.subset):
        ap.error("duplicate subset name")
    report = build(json.loads(args.off_summary.read_text()), json.loads(args.on_summary.read_text()),
                   args.off_arm, args.on_arm, subsets, seed=args.seed, samples=args.bootstrap)
    payload = json.dumps(report, indent=2, sort_keys=True) + "\n"
    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(payload)
    else:
        print(payload, end="")
    if args.md_out:
        args.md_out.parent.mkdir(parents=True, exist_ok=True)
        args.md_out.write_text(markdown(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
