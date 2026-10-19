#!/usr/bin/env python3
"""Rate Octocode MCP versions against other GitHub research tools: one matrix over every arm.

Inputs (all committed, so this rebuilds without the gitignored campaigns/):
  * results/*/run.json               — campaigns summarized by campaign_summary.py
  * results/overview/per_question_summary.json — the Aug 2026 CLI campaigns (Octocode v18, gh, gh+RTK,
                                         gh+Headroom; per-question means of 3 passes)

Arms become groups: every `mcp*` arm of a campaign is that campaign's Octocode version
(its --octocode-label), `gh-lean` is "gh lean", other live arms keep their id. Per question a
group's chars are the mean over all its runs; correctness is the mean of every blind score it
received. Ratios are per-question geometric means with a 95% bootstrap CI.

    python3 scripts/matrix_summary.py            # → results/overview/MATRIX.md + results/overview/matrix_summary.json
"""
from __future__ import annotations

import argparse
import json
import math
import random
import re
import statistics as st
from collections import defaultdict
from pathlib import Path

from accounting import complete_sum

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "results"
HISTORICAL = {  # id in per_question_summary.json → group
    "octocode": ("octocode_v18", "Octocode v18 (CLI)", "Octocode v18 CLI · pi agents", "Aug 2026"),
    "gh": ("gh", "gh", "plain gh CLI · pi agents", "Aug 2026"),
    "rtk": ("rtk", "gh + RTK", "rtk gh · pi agents", "Aug 2026"),
    "headroom": ("headroom", "gh + Headroom", "gh → Headroom · pi agents", "Aug 2026"),
}
LIVE = {"gh-lean": ("gh_lean", "gh lean"), "gh": ("gh_live", "gh (Sonnet)"),
        "rtk": ("rtk_live", "gh + RTK (Sonnet)"), "headroom": ("headroom_live", "gh + Headroom (Sonnet)")}


def slug(label: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")


def geo(xs):
    return math.exp(sum(math.log(x) for x in xs) / len(xs))


def boot_ci(xs, n=10000, seed=42):
    rng = random.Random(seed)
    gs = sorted(geo([rng.choice(xs) for _ in xs]) for _ in range(n))
    return gs[int(0.025 * n)], gs[int(0.975 * n)]


def load_groups(question_set: str = "github-v2"):
    groups: dict[str, dict] = {}
    chars = defaultdict(lambda: defaultdict(list))   # group → q → [chars per run]
    secs = defaultdict(lambda: defaultdict(list))    # group → q → [(wall, model, tools) per run]; live campaigns only
    scores = defaultdict(lambda: defaultdict(list))  # group → q → [correctness per judged answer]
    pairs = []
    def started(path):  # Campaign dates may include a preceding HHMMSS.
        m = re.search(r"-(?:(\d{6})-)?(\d{4}-\d{2}-\d{2})$", path.parent.name)
        return (m[2], m[1] or "000000") if m else ("", path.parent.name)

    for path in sorted(RESULTS.glob("*/run.json"), key=started):
        doc = json.loads(path.read_text())
        inferred_set = "local-v1" if any(r["arm"].startswith("local-") for r in doc["runs"]) else "github-v2"
        if doc.get("question_set", inferred_set) != question_set:
            continue
        # One group per (campaign, tool): pooling campaigns would mix agents, days and rate-limit
        # conditions. The short tag is the campaign name without its time and date.
        tag = re.sub(r"-\d{6}-\d{4}-\d{2}-\d{2}$", "", doc["campaign"])
        month = re.search(r"(\d{4})-(\d{2})-\d{2}$", doc["campaign"])
        when = f"{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][int(month[2]) - 1]} {month[1]}" if month else ""
        arm_group = {}
        mcp_arms = {r["arm"] for r in doc["runs"] if r["arm"].startswith(("mcp", "local-mcp"))}
        for arm in sorted({r["arm"] for r in doc["runs"]}):
            is_mcp = arm in mcp_arms
            if is_mcp:
                suffix = f" · {arm}" if len(mcp_arms) > 1 else ""
                label = f"{doc['octocode_label']} · {tag}{suffix}"
                gid, how = slug(label), "local MCP"
            else:
                base, base_label = LIVE.get(arm, (slug(arm), arm))
                gid, label, how = f"{base}_{slug(tag)}", f"{base_label} · {tag}", arm
            arm_group[arm] = gid
            g = groups.setdefault(gid, {"id": gid, "label": label, "octocode": is_mcp,
                                        "how": f"{how} · {doc['runner_model']}", "measured": when,
                                        "campaigns": [], "runs": []})
            if doc["campaign"] not in g["campaigns"]:
                g["campaigns"].append(doc["campaign"])
        for r in doc["runs"]:
            groups[arm_group[r["arm"]]]["runs"].append(r)
            if not r.get("ok", True):
                continue
            chars[arm_group[r["arm"]]][r["q"]].append(r["chars"])
            if r.get("secs"):
                secs[arm_group[r["arm"]]][r["q"]].append((r["secs"], r.get("model_secs"), r.get("tool_secs")))
        by_pair = defaultdict(list)
        runs_by = {(r["arm"], r["pass"], r["q"]): r for r in doc["runs"] if r.get("ok", True)}
        for j in doc["judgments"]:
            if not all((arm, j["pass"], j["q"]) in runs_by for arm in j["scores"]):
                continue
            for arm, s in j["scores"].items():
                scores[arm_group[arm]][j["q"]].append(s["correctness"])
            by_pair[j["pair"]].append(j)
        for pair, js in by_pair.items():
            a, b = pair.split("~")
            ga, gb = arm_group[a], arm_group[b]
            diff = [j["scores"][a]["correctness"] - j["scores"][b]["correctness"] for j in js]
            # Same-campaign ratios over every question both arms ran (B ÷ A: >1 = A leaner / faster).
            both = [(runs_by[(a, p, q)], runs_by[(b, p, q)]) for (arm, p, q) in runs_by if arm == a and (b, p, q) in runs_by]
            cr = [rb["chars"] / ra["chars"] for ra, rb in both]
            if not cr:
                continue
            tr = [rb["secs"] / ra["secs"] for ra, rb in both if ra.get("secs") and rb.get("secs")]
            ratios = {"chars_b_over_a": geo(cr), "chars_ci95": list(boot_ci(cr)), "a_leaner_on": sum(x > 1 for x in cr),
                      "questions": len(cr)}
            if tr:
                ratios.update({"secs_b_over_a": geo(tr), "secs_ci95": list(boot_ci(tr)), "a_faster_on": sum(x > 1 for x in tr)})
            pairs.append({"campaign": doc["campaign"], "a": ga, "b": gb, "arm_a": a, "arm_b": b, "judged": len(js), **ratios,
                          "a_more_correct": sum(d > 1 for d in diff), "same": sum(abs(d) <= 1 for d in diff),
                          "b_more_correct": sum(d < -1 for d in diff),
                          "a_wins": sum(j["winner"] == a for j in js), "b_wins": sum(j["winner"] == b for j in js)})
    hist = json.loads((RESULTS / "overview/per_question_summary.json").read_text())["rows"] if question_set == "github-v2" else []
    for key, (gid, label, how, when) in HISTORICAL.items():
        if not hist:
            break
        groups[gid] = {"id": gid, "label": label, "octocode": key == "octocode", "how": how, "measured": when,
                       "campaigns": ["Aug 2026 CLI campaigns (3 passes)"], "runs": []}
        for row in hist:
            chars[gid][f"Q{row['q']}"].append(row["chars"][key])
            if row["correct"][key] is not None:
                scores[gid][f"Q{row['q']}"].append(row["correct"][key])
    return groups, chars, scores, pairs, secs


def build(anchor: str | None, question_set: str = "github-v2"):
    groups, chars, scores, pairs, secs = load_groups(question_set)
    questions = sorted({q for group in chars.values() for q in group}, key=lambda q: int(q[1:]))
    live_octo = [g for g in groups.values() if g["octocode"] and g["runs"]]
    anchor = anchor or (live_octo[-1]["id"] if live_octo else "octocode_v18")
    live_other = [g["id"] for g in reversed(list(groups.values())) if g["runs"] and not g["octocode"]]
    order = ([anchor] + [g["id"] for g in reversed(live_octo) if g["id"] != anchor] + live_other
             + ["octocode_v18", "gh", "rtk", "headroom"])
    order = [g for g in dict.fromkeys(order) if g in groups and questions and all(chars[g][q] for q in questions)]
    if anchor not in order and order:
        anchor = order[0]
    timed = [g for g in order if all(secs[g][q] for q in questions)]
    rows = [{"q": q, "chars": {g: st.mean(chars[g][q]) for g in order},
             "secs": {g: (st.mean(t[0] for t in secs[g][q]) if g in timed else None) for g in order},
             "correct": {g: (st.mean(scores[g][q]) if scores[g][q] else None) for g in order}} for q in questions]
    matrix, leaner = {}, {}
    for a in order:
        matrix[a], leaner[a] = {}, {}
        for b in order:
            ratios = [r["chars"][b] / r["chars"][a] for r in rows]
            lo, hi = boot_ci(ratios)
            matrix[a][b] = {"geo_mean": geo(ratios), "ci95": [lo, hi], "median": st.median(ratios)}
            leaner[a][b] = sum(x > 1 for x in ratios)
    summary = {}
    for g in order:
        c = [r["chars"][g] for r in rows]
        sc = [s for q in questions for s in scores[g][q]]
        runs = groups[g]["runs"]
        summary[g] = {
            "label": groups[g]["label"], "how": groups[g]["how"], "measured": groups[g]["measured"],
            "campaigns": groups[g]["campaigns"], "octocode": groups[g]["octocode"], "live": bool(runs),
            "runs_per_question": max(len(chars[g][q]) for q in questions) if runs else 3,
            "chars_median": st.median(c), "chars_mean": st.mean(c), "chars_total": sum(c),
            "correct_mean": st.mean(sc) if sc else None, "correct_judged": len(sc),
            "anchor_leaner_x": matrix[anchor][g]["geo_mean"], "anchor_leaner_ci95": matrix[anchor][g]["ci95"],
            "anchor_leaner_on": leaner[anchor][g],
            "calls": sum(r["calls"] for r in runs) if runs else None,
            "failed": sum(r["failed"] for r in runs) if runs else None,
            "cost_usd": complete_sum(runs, "cost_usd"),
            "input_tokens": complete_sum(runs, "input_tokens"),
        }
        if g in timed:
            per_q = [[t for t in secs[g][q]] for q in questions]
            split_known = all(t[1] is not None and t[2] is not None for ts in per_q for t in ts)
            summary[g].update({
                "secs_median": st.median(st.mean(t[0] for t in ts) for ts in per_q),
                # Means split additively (wall = model + tools); medians of parts would not add up.
                "secs_mean": st.mean(t[0] for ts in per_q for t in ts),
                "model_secs_mean": st.mean(t[1] for ts in per_q for t in ts) if split_known else None,
                "tool_secs_mean": st.mean(t[2] for ts in per_q for t in ts) if split_known else None,
                "secs_total": sum(t[0] for ts in per_q for t in ts),
            })
            if anchor in timed:
                ratios = [r["secs"][g] / r["secs"][anchor] for r in rows]
                lo, hi = boot_ci(ratios)
                summary[g].update({"anchor_faster_x": geo(ratios), "anchor_faster_ci95": [lo, hi],
                                   "anchor_faster_on": sum(x > 1 for x in ratios)})
    return {"anchor": anchor, "order": order, "timed": timed, "groups": summary, "rows": rows, "matrix": matrix,
            "leaner_count": leaner, "judged_pairs": pairs, "questions": len(questions), "question_set": question_set}


def whole(x):
    return "–" if x is None else f"{round(x)}"


def render(m) -> str:
    A, G, an = m["order"], m["groups"], m["anchor"]
    if not A:
        return f"# Benchmark matrix — {m['question_set']}\n\nNo complete valid arm for this corpus. See campaign results for invalid and partial runs.\n"
    L = {g: G[g]["label"] for g in A}
    out = [
        f"# Benchmark matrix — {L[an]} vs every other tool",
        "",
        f"Question set: `{m['question_set']}`. Characters = model-in + model-out from "
        "the runner transcript or wrapper log. Correctness = the recorded independent judge, shown as a whole "
        "number out of 10: judge scores move by a point between runs, so treat tools within one point "
        "as equally correct. Rebuild: `scripts/matrix_summary.py`.",
        "",
        "## Headline",
        "",
        f"| Tool | How it ran | Measured | Runs / Q | Median chars / Q | Mean chars / Q | Correctness /10 | {L[an]} leaner by (95% CI) | Leaner on |",
        "|---|---|---|---:|---:|---:|---:|---:|---:|",
    ]
    for g in A:
        s = G[g]
        ratio = "anchor" if g == an else f"**{s['anchor_leaner_x']:.2f}×** ({s['anchor_leaner_ci95'][0]:.2f}–{s['anchor_leaner_ci95'][1]:.2f})"
        lean = "—" if g == an else f"{s['anchor_leaner_on']}/{m['questions']}"
        out.append(f"| {s['label']} | {s['how']} | {s['measured']} | {s['runs_per_question']} | {s['chars_median']:,.0f} | "
                   f"{s['chars_mean']:,.0f} | {whole(s['correct_mean'])} | {ratio} | {lean} |")
    if m["timed"]:
        out += ["", "## Time to answer (wall clock, same harness only)", "",
                "Seconds from the agent's start to its final answer, split into model time and tool + harness "
                "time. Only campaigns run with the current harness are timed; the Aug 2026 CLI arms logged "
                "tool time per call (with an npx start per call, none for Headroom), which is not comparable.", "",
                f"| Tool | Median s / Q | Mean s / Q | of which model | of which tools + overhead | {L[an]} faster by (95% CI) | Faster on |",
                "|---|---:|---:|---:|---:|---:|---:|"]
        for g in m["timed"]:
            s = G[g]
            fast = "anchor" if g == an else (f"{s['anchor_faster_x']:.2f}× ({s['anchor_faster_ci95'][0]:.2f}–{s['anchor_faster_ci95'][1]:.2f})"
                                             if "anchor_faster_x" in s else "—")
            on = "—" if g == an or "anchor_faster_on" not in s else f"{s['anchor_faster_on']}/{m['questions']}"
            model = f"{s['model_secs_mean']:.1f}" if s['model_secs_mean'] is not None else "—"
            tools = f"{s['tool_secs_mean']:.1f}" if s['tool_secs_mean'] is not None else "—"
            out.append(f"| {s['label']} | {s['secs_median']:.1f} | {s['secs_mean']:.1f} | {model} | "
                       f"{tools} | {fast} | {on} |")
    if m["judged_pairs"]:
        out += ["", "## Head-to-head (same campaign, same judge)", "",
                "The fairest comparison: same agent model, same day, judged together. Ratios are B ÷ A per "
                "question (geometric mean, 95% CI): above 1× means A used fewer characters / less time.", "",
                "| Campaign | A | B | Judged | A more correct / same / B more correct | Wins A / B | Chars B÷A | A leaner on | Time B÷A | A faster on |",
                "|---|---|---|---:|---|---|---:|---:|---:|---:|"]
        for p in m["judged_pairs"]:
            t = (f"{p['secs_b_over_a']:.2f}× ({p['secs_ci95'][0]:.2f}–{p['secs_ci95'][1]:.2f})", f"{p['a_faster_on']}/{p['questions']}") \
                if "secs_b_over_a" in p else ("—", "—")
            out.append(f"| {p['campaign']} | {p['arm_a']} | {p['arm_b']} | {p['judged']} | "
                       f"{p['a_more_correct']} / {p['same']} / {p['b_more_correct']} | {p['a_wins']} / {p['b_wins']} | "
                       f"{p['chars_b_over_a']:.2f}× ({p['chars_ci95'][0]:.2f}–{p['chars_ci95'][1]:.2f}) | {p['a_leaner_on']}/{p['questions']} | {t[0]} | {t[1]} |")
    out += ["", "## Pairwise char matrix", "",
            "Cell = per-question geometric mean of **column ÷ row** characters (>1× = row leaner); "
            "bracket = questions where the row was leaner.", "",
            "| row ÷ col → | " + " | ".join(L[b] for b in A) + " |", "|---|" + "---:|" * len(A)]
    for a in A:
        out.append(f"| **{L[a]}** | " + " | ".join(
            "—" if a == b else f"{m['matrix'][a][b]['geo_mean']:.2f}× ({m['leaner_count'][a][b]})" for b in A) + " |")
    out += ["", "## Characters per question", "", "| Q | " + " | ".join(L[g] for g in A) + " |", "|---|" + "---:|" * len(A)]
    for r in m["rows"]:
        out.append(f"| {r['q']} | " + " | ".join(f"{r['chars'][g]:,.0f}" for g in A) + " |")
    out += ["", "## Correctness per question (whole points /10)", "", "| Q | " + " | ".join(L[g] for g in A) + " |",
            "|---|" + "---:|" * len(A)]
    for r in m["rows"]:
        out.append(f"| {r['q']} | " + " | ".join(whole(r["correct"][g]) for g in A) + " |")
    out += ["", "Live campaigns: " + ", ".join(sorted({c for g in A for c in G[g]['campaigns'] if not c.startswith('Aug')}))
            + ". Aug 2026 columns are a separate campaign with different agents: compare margins, not decimals.", ""]
    return "\n".join(out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--anchor", help="group id to rate the others against (default: newest Octocode MCP group)")
    ap.add_argument("--question-set", default="github-v2")
    ap.add_argument("--out", type=Path, default=RESULTS / "overview/MATRIX.md")
    ap.add_argument("--json", type=Path, default=RESULTS / "overview/matrix_summary.json")
    args = ap.parse_args()
    m = build(args.anchor, args.question_set)
    args.json.write_text(json.dumps(m, indent=1) + "\n")
    args.out.write_text(render(m))
    print(f"wrote {args.out} and {args.json}: anchor {m['anchor']}, groups {', '.join(m['order'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
