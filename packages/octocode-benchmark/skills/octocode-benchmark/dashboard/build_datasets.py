#!/usr/bin/env python3
"""Build the benchmark dashboard's datasets (and optionally a static HTML copy).

Reads results/matrix_summary.json, results/runs/*.json, compare/github-questions/README.md
and this folder's release-notes.json. Writes one JSON file per dashboard dataset into --out:

  groups        one row per tool group: chars, correctness (whole + exact), anchor ratio + CI
  per_question  one row per (question, group): chars and correctness
  matrix        every ordered pair: how many times leaner the row is, on how many questions
  head_to_head  same-campaign judged pairs: who was more correct, who won
  live_runs     per live campaign arm: calls, failures, clasify calls, tokens, cost
  tool_map      release-notes.json → tools old → new
  changes       release-notes.json → notable changes

    python3 skills/octocode-benchmark/dashboard/build_datasets.py --out /tmp/dash
    python3 skills/octocode-benchmark/dashboard/build_datasets.py --static results/index.html
"""
from __future__ import annotations

import argparse
import json
import re
import statistics as st
from pathlib import Path

HERE = Path(__file__).resolve().parent
PKG = HERE.parents[2]
RESULTS = PKG / "results"


def complete_sum(rows, key):
    values = [r.get(key) for r in rows]
    return sum(values) if values and all(v is not None for v in values) else None


def rounded(value, digits=1):
    return round(value, digits) if value is not None else None


def build(matrix_path=None, question_dir=None) -> dict[str, list]:
    m = json.loads((matrix_path or RESULTS / "matrix_summary.json").read_text())
    question_set = m.get("question_set", "github-v2")
    notes = json.loads((HERE / "release-notes.json").read_text())
    question_dir = question_dir or PKG / "compare/github-questions"
    titles = {p.stem[1:]: p.read_text().splitlines()[0].lstrip("# ") for p in question_dir.glob("Q*.md")}
    order, G, an = m["order"], m["groups"], m["anchor"]
    groups = []
    for i, g in enumerate(order):
        s = G[g]
        groups.append({
            "id": g, "order": i, "label": s["label"], "anchor": g == an, "how": s["how"], "measured": s["measured"],
            "octocode": s.get("octocode", False), "live": s.get("live", False),
            "same_campaign": bool(set(s["campaigns"]) & set(G[an]["campaigns"])),
            "runs_per_question": s["runs_per_question"], "questions": m["questions"],
            "median_chars": round(s["chars_median"]), "mean_chars": round(s["chars_mean"]), "total_chars": round(s["chars_total"]),
            "correctness": None if s["correct_mean"] is None else round(s["correct_mean"]),
            "correctness_exact": None if s["correct_mean"] is None else round(s["correct_mean"], 2),
            "leaner_x": round(s["anchor_leaner_x"], 2), "ci_low": round(s["anchor_leaner_ci95"][0], 2),
            "ci_high": round(s["anchor_leaner_ci95"][1], 2), "leaner_on": s["anchor_leaner_on"],
            # Timing exists only for arms run with the current harness (null = not measured comparably).
            "secs_median": rounded(s.get("secs_median")),
            "model_secs_mean": rounded(s.get("model_secs_mean")),
            "tool_secs_mean": rounded(s.get("tool_secs_mean")),
            "faster_x": round(s["anchor_faster_x"], 2) if "anchor_faster_x" in s else None,
            "faster_ci_low": round(s["anchor_faster_ci95"][0], 2) if "anchor_faster_ci95" in s else None,
            "faster_ci_high": round(s["anchor_faster_ci95"][1], 2) if "anchor_faster_ci95" in s else None,
            "faster_on": s.get("anchor_faster_on"),
        })
    per_question = [{
        "key": f"{r['q']}:{g}", "q": r["q"], "n": int(r["q"][1:]), "title": titles.get(r["q"][1:], r["q"]), "group": g,
        "chars": round(r["chars"][g]),
        "secs": None if r.get("secs", {}).get(g) is None else round(r["secs"][g], 1),
        "correctness": None if r["correct"][g] is None else round(r["correct"][g]),
    } for r in m["rows"] for g in order]
    matrix = [{"pair": f"{a}~{b}", "row": a, "col": b, "leaner_x": round(m["matrix"][a][b]["geo_mean"], 2),
               "leaner_on": m["leaner_count"][a][b]} for a in order for b in order if a != b]
    head_to_head = [{
        "pair": f"{p['campaign']}:{p['arm_a']}~{p['arm_b']}", "campaign": p["campaign"], "a": p["arm_a"], "b": p["arm_b"],
        "judged": p["judged"], "a_more_correct": p["a_more_correct"], "same": p["same"],
        "b_more_correct": p["b_more_correct"], "a_wins": p["a_wins"], "b_wins": p["b_wins"],
        "chars_b_over_a": round(p["chars_b_over_a"], 2), "a_leaner_on": p["a_leaner_on"],
        "secs_b_over_a": round(p["secs_b_over_a"], 2) if "secs_b_over_a" in p else None,
        "a_faster_on": p.get("a_faster_on"), "questions": p["questions"],
    } for p in m["judged_pairs"]]
    live_runs = []
    for path in sorted((RESULTS / "runs").glob("*.json")):
        doc = json.loads(path.read_text())
        inferred = "local-v1" if any(r["arm"].startswith("local-") for r in doc["runs"]) else "github-v2"
        if doc.get("question_set", inferred) != question_set:
            continue
        scores = {}
        for j in doc["judgments"]:
            for arm, s in j["scores"].items():
                scores.setdefault(arm, []).append(s["correctness"])
        for arm in sorted({r["arm"] for r in doc["runs"]}):
            rs = [r for r in doc["runs"] if r["arm"] == arm]
            valid = [r for r in rs if r.get("ok", True)]
            attempts = rs + [r for r in doc.get("prior_attempts", []) if r["arm"] == arm]
            live_runs.append({
                "run": f"{doc['campaign']}:{arm}", "campaign": doc["campaign"], "arm": arm, "runs": len(rs),
                "valid_runs": len(valid), "attempts": len(attempts), "question_set": question_set,
                "calls": sum(r["calls"] for r in attempts), "failed": sum(r["failed"] for r in attempts),
                "clasify_calls": sum(r["clasify_calls"] for r in attempts),
                "median_chars": round(st.median(r["chars"] for r in valid)) if valid else None,
                "input_tokens": complete_sum(attempts, "input_tokens"), "output_tokens": complete_sum(attempts, "output_tokens"),
                "cost_usd": rounded(complete_sum(attempts, "cost_usd"), 2),
                "median_secs": round(st.median(r["secs"] for r in valid), 1) if valid and all(r.get("secs") is not None for r in valid) else None,
                "correctness": round(st.mean(scores[arm])) if scores.get(arm) else None,
            })
    return {"groups": groups, "per_question": per_question, "matrix": matrix, "head_to_head": head_to_head,
            "live_runs": live_runs, "tool_map": notes["tool_map"], "changes": notes["changes"],
            "corpus": [{"question_set": question_set, "questions": m["questions"]}]}


STATIC_SHELL = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Octocode Benchmark</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>
<style>
:root{--font-anthropic-sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
--font-anthropic-serif:Georgia,"Times New Roman",serif;--cds-font-size-caption:12px;--cds-font-size-body:14px;
--cds-font-size-heading:16px;--cds-font-size-title:22px;--cds-font-weight-medium:600;--cds-gap-xs:4px;--cds-gap-sm:8px;
--cds-gap-md:16px;--cds-gap-lg:24px;--cds-pad-xs:4px;--cds-pad-sm:8px;--cds-pad-md:12px;--cds-pad-lg:16px;--cds-radius:10px;
--cds-dur-slow:.3s;--color-bg:#fbfbf9;--color-panel:#fff;--color-fg:#1d1d1b;--color-fg-muted:#6b6a65;
--color-border-line:#e4e2dc;--color-ok:#2f7d4f;--color-warn:#b7791f;--color-bad:#c0392b;--cds-chart-grid:#ecebe6;
--cds-chart-reference:#8a8984;--cds-surface-popover:#fff;--cds-border:#dddbd5;--cds-shadow-popover:0 4px 16px rgba(0,0,0,.12);
--cds-text-secondary:#6b6a65;--c0:#2a78d6;--c1:#eb6834;--c2:#1baf7a;--c3:#eda100;--c4:#e87ba4;--c5:#008300;--c6:#4a3aa7;--c7:#e34948;
--div-pos:#2a78d6;--div-neg:#e34948}
@media (prefers-color-scheme: dark){:root{--color-bg:#1b1b19;--color-panel:#242422;--color-fg:#ecebe6;--color-fg-muted:#a3a19a;
--color-border-line:#3a3936;--cds-chart-grid:#33322f;--cds-surface-popover:#2b2b29;--cds-border:#44433f;--cds-text-secondary:#a3a19a;
--c0:#3987e5;--c1:#d95926;--c2:#199e70;--c3:#c98500;--c4:#d55181;--c5:#008300;--c6:#9085e9;--c7:#e66767;
--div-pos:#3987e5;--div-neg:#e66767;color-scheme:dark}}
body{margin:0;background:var(--color-bg);color:var(--color-fg);font:14px/1.5 var(--font-anthropic-sans)}
#dash-root{padding:24px 16px}.dash-skeleton{background:var(--cds-chart-grid);border-radius:var(--cds-radius)}
</style></head><body><div id="dash-root">__PAGE__</div>
<script>
/* Palette: the dataviz skill's validated reference categorical palette (light/dark steps).
   Minimal stand-in for the dashboard runtime: every dataset is inlined, so status is always ok. */
window.dash = (() => {
  const DATA = __DATA__, fns = [];
  const colors = ['var(--c0)','var(--c1)','var(--c2)','var(--c3)','var(--c4)','var(--c5)','var(--c6)','var(--c7)'];
  let t; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => fns.forEach((f) => f()), 120); });
  return { colors, data: (id) => ({ status: DATA[id] ? 'ok' : 'missing', data: DATA[id] || [] }),
    onData: (fn) => { fns.push(fn); fn(); }, setLink: (id) => { history.replaceState(null, '', '#' + id); },
    params: () => ({}), setParams() {}, resetParams() {}, refresh() {} };
})();
</script>
__SCRIPTS__
</body></html>
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, help="directory for one <dataset>.json per dataset (dashboard assets)")
    ap.add_argument("--static", type=Path, help="write a self-contained HTML copy of the dashboard here")
    ap.add_argument("--matrix", type=Path, help="matrix JSON for one question set")
    ap.add_argument("--questions", type=Path, help="matching public question directory for titles")
    args = ap.parse_args()
    data = build(args.matrix, args.questions)
    if args.out:
        args.out.mkdir(parents=True, exist_ok=True)
        for name, rows in data.items():
            (args.out / f"{name}.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1))
        print(f"wrote {len(data)} datasets to {args.out}: " + ", ".join(f"{k} {len(v)}" for k, v in data.items()))
    if args.static:
        page = (HERE / "page.html").read_text()
        markup = re.sub(r"<script>.*?</script>", "", page, flags=re.S)
        scripts = "\n".join(re.findall(r"<script>.*?</script>", page, flags=re.S))
        html = (STATIC_SHELL.replace("__DATA__", json.dumps(data, ensure_ascii=False))
                .replace("__PAGE__", markup).replace("__SCRIPTS__", scripts))
        args.static.write_text(html)
        print(f"wrote {args.static} ({len(html):,} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
