#!/usr/bin/env python3
"""Summarize one campaign into results/runs/<campaign>.json (committed; campaigns/ is not).

Reads every <arm>-p<pass>-<Qn>.jsonl measured log, runs/<id>/result.json (usage, cost) and
judge/<A>~<B>/p<pass>-<Qn>.md verdicts (de-blinded with that pair's MAP.secret.txt).

    campaign_summary.py campaigns/<name> --octocode-label "Octocode v20 (local 20.1.1)"
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

PKG = Path(__file__).resolve().parents[2]
LOG = re.compile(r"^(?P<arm>.+)-p(?P<pass>\d+)-(?P<q>Q\d+)\.jsonl$")


def run_row(camp: Path, log: Path) -> dict:
    m = LOG.match(log.name)
    recs = [json.loads(l) for l in log.read_text(encoding="utf-8").splitlines() if l.strip()]
    calls = [r for r in recs if r.get("kind") != "answer"]
    result_path = camp / "runs" / log.name[:-6] / "result.json"
    res = json.loads(result_path.read_text()) if result_path.exists() else {}
    usage = res.get("usage") or {}
    return {
        "arm": m["arm"], "pass": int(m["pass"]), "q": m["q"],
        "chars": sum(r["total_chars"] for r in recs),
        "model_in": sum(r["model_in_chars"] for r in recs),
        "model_out": sum(r["model_out_chars"] for r in recs),
        "calls": len(calls),
        "failed": sum(1 for r in calls if r.get("exit_code")),
        "clasify_calls": sum(1 for r in calls if r["cmd"].startswith("clasify ")),
        "input_tokens": usage.get("input_tokens", 0) + usage.get("cache_creation_input_tokens", 0)
        + usage.get("cache_read_input_tokens", 0),
        "output_tokens": usage.get("output_tokens", 0),
        "cost_usd": res.get("total_cost_usd"),
        "turns": res.get("num_turns"),
        # Wall-clock seconds for the whole run, split into model time (API) and the rest:
        # tool calls plus harness overhead. Same clock for every arm of a campaign.
        "secs": (res.get("duration_ms") or 0) / 1000,
        "model_secs": (res.get("duration_api_ms") or 0) / 1000,
        "tool_secs": max(0.0, ((res.get("duration_ms") or 0) - (res.get("duration_api_ms") or 0)) / 1000),
        "ok": res.get("subtype") == "success" and not res.get("is_error"),
    }


def judgments(camp: Path) -> list[dict]:
    out = []
    for pair_dir in sorted((camp / "judge").glob("*~*")):
        mapping = {}
        for line in (pair_dir / "MAP.secret.txt").read_text().splitlines():
            p, q, x, y = line.split()
            mapping[(int(p[1:]), q)] = {"X": x.split("=", 1)[1], "Y": y.split("=", 1)[1]}
        for verdict in sorted(pair_dir.glob("p*-Q*.md")):
            if verdict.name.endswith(".packet.md"):
                continue
            p, q = verdict.stem.split("-")
            blocks = re.findall(r"```json\s*(\{.*?\})\s*```", verdict.read_text(), re.S)
            if not blocks:
                continue
            v = json.loads(blocks[-1])
            labels = mapping[(int(p[1:]), q)]
            out.append({
                "pair": pair_dir.name, "pass": int(p[1:]), "q": q,
                "scores": {labels[k]: v[k] for k in "XY"},
                "winner": labels.get(v.get("winner"), "tie"),
                "reason": v.get("reason", ""),
            })
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("campaign", type=Path)
    ap.add_argument("--octocode-label", default="Octocode v20")
    ap.add_argument("--runner-model", default="claude-sonnet-5-5")
    ap.add_argument("--judge-model", default="gpt-5.5")
    ap.add_argument("--out", type=Path)
    args = ap.parse_args()
    camp = args.campaign.resolve()
    rows = [run_row(camp, p) for p in sorted(camp.glob("*-p*-Q*.jsonl")) if LOG.match(p.name)]
    doc = {
        "campaign": camp.name,
        "octocode_label": args.octocode_label,
        "runner_model": args.runner_model,
        "judge_model": args.judge_model,
        "runs": rows,
        "judgments": judgments(camp),
    }
    out = args.out or PKG / "results" / "runs" / f"{camp.name}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, indent=1) + "\n")
    arms = sorted({r["arm"] for r in rows})
    print(f"wrote {out}: {len(rows)} runs ({', '.join(arms)}), {len(doc['judgments'])} judgments, "
          f"{sum(not r['ok'] for r in rows)} not ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
