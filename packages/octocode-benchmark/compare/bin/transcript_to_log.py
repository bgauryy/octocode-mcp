#!/usr/bin/env python3
"""Turn one runner's `claude -p --output-format stream-json` transcript into the measured log.

The transcript is what the model actually exchanged, for every arm alike (MCP, gh, rtk,
Headroom), so it is the measurement:

  model-out = `<tool> <compact JSON input>` for each tool call the model wrote, + final answer
  model-in  = the tool_result text the model read back (after any host truncation)

Writes <log>.jsonl (one row per call + one answer row; the schema sumlog.py reads), an
artifact per call (exactly the model-in text, re-hashed by `sumlog.py --strict`),
answer.md, result.json (the run's final `result` event: usage, cost, turns) and status.json
(ok=false when the runner crashed, hit its turn cap, or its MCP server never connected).

    transcript_to_log.py --transcript t.jsonl --log Q1.jsonl --run-dir runs/<id> --question Q1
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def chars(text: str) -> int:
    return len(text)  # Python str length = Unicode code points


def result_text(content) -> str:
    if isinstance(content, str):
        return content
    parts = []
    for block in content or []:
        if block.get("type") == "text":
            parts.append(block.get("text", ""))
        else:
            parts.append(json.dumps(block, ensure_ascii=False))
    return "\n".join(parts)


def _rate_limited(text: str) -> bool:
    low = text.lower()
    return "ratelimited" in low or "rate limit" in low or "search window is full" in low


def tool_label(name: str, tool_input: dict) -> str:
    short = name.split("__")[-1] if name.startswith("mcp__") else name
    return f"{short} {json.dumps(tool_input, ensure_ascii=False, separators=(',', ':'))}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--transcript", required=True, type=Path)
    ap.add_argument("--log", required=True, type=Path)
    ap.add_argument("--run-dir", required=True, type=Path)
    ap.add_argument("--question", required=True)
    args = ap.parse_args()

    uses: dict[str, tuple[str, dict]] = {}
    order: list[str] = []
    results: dict[str, tuple[str, bool]] = {}
    final: dict = {}
    problems: list[str] = []
    for line in args.transcript.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        event = json.loads(line)
        if event.get("type") == "result":
            final = event
            continue
        if event.get("type") == "system" and event.get("subtype") == "init":
            # A runner whose MCP server never connected answered without its tools: invalid.
            problems += [f"mcp server {s.get('name')} {s.get('status')}" for s in event.get("mcp_servers") or []
                         if s.get("status") != "connected"]
        message = event.get("message")
        content = message.get("content") if isinstance(message, dict) else None
        if not isinstance(content, list):
            continue
        for block in content:
            if block.get("type") == "tool_use":
                uses[block["id"]] = (block["name"], block.get("input") or {})
                order.append(block["id"])
            elif block.get("type") == "tool_result":
                results[block["tool_use_id"]] = (result_text(block.get("content")), bool(block.get("is_error")))

    artifacts = args.run_dir / "artifacts"
    artifacts.mkdir(parents=True, exist_ok=True)
    rows = []
    for n, use_id in enumerate(order, 1):
        name, tool_input = uses[use_id]
        text, is_error = results.get(use_id, ("", True))
        label = tool_label(name, tool_input)
        artifact = artifacts / f"{n:03d}-{name.split('__')[-1]}.txt"
        artifact.write_text(text, encoding="utf-8")
        rows.append({
            "cmd": label,
            "tool": name,
            "char_unit": "unicode_code_points",
            "chars": chars(text),
            "bytes": len(text.encode("utf-8")),
            "model_out_chars": chars(label),
            "model_in_chars": chars(text),
            "total_chars": chars(label) + chars(text),
            "sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
            "exit_code": 1 if is_error else 0,
            "artifact": str(artifact),
        })
    answer = (final.get("result") or "").strip() + "\n"
    rows.append({
        "kind": "answer",
        "question": args.question,
        "cmd": f"answer:{args.question}",
        "char_unit": "unicode_code_points",
        "model_out_chars": chars(answer),
        "model_in_chars": 0,
        "total_chars": chars(answer),
        "sha256": hashlib.sha256(answer.encode("utf-8")).hexdigest(),
    })
    args.log.parent.mkdir(parents=True, exist_ok=True)
    args.log.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")
    (args.run_dir / "answer.md").write_text(answer, encoding="utf-8")
    (args.run_dir / "result.json").write_text(json.dumps(final, indent=1), encoding="utf-8")
    # A run starved by GitHub rate limits measures the shared token, not the tool: when half or
    # more of its calls came back rate-limited, rerun it (one at a time). Same rule for every arm.
    calls_rows = rows[:-1]
    limited = sum(1 for r in calls_rows if r["exit_code"] and _rate_limited(Path(r["artifact"]).read_text(encoding="utf-8")))
    if calls_rows and limited * 2 >= len(calls_rows):
        problems.append(f"rate-limited {limited}/{len(calls_rows)} calls (rerun with fewer parallel runners)")
    if not final:
        problems.append("no result event (runner crashed or was killed)")
    elif final.get("subtype") != "success" or final.get("is_error"):
        problems.append(f"runner ended with {final.get('subtype')}")
    ok = not problems
    (args.run_dir / "status.json").write_text(json.dumps({"ok": ok, "problems": problems}, indent=1))
    calls = len(rows) - 1
    failed = sum(r.get("exit_code", 0) for r in rows)
    print(f"{args.question}: calls={calls} failed={failed} chars={sum(r['total_chars'] for r in rows)} ok={ok}"
          + (f" problems={'; '.join(problems)}" if problems else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
