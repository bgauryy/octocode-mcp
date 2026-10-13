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

--format pi reads the pi runner's JSON event stream (pi_runner.py) instead: tool calls and
tool results from its finalized messages, and a claude-shaped result.json (usage, cost, turns,
durations from the runner's receive timestamps) so campaign_summary.py reads both alike.
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


def parse_pi(transcript: Path, run_dir: Path, max_turns: int):
    """The pi runner's events as (uses, order, results, final, problems)."""
    uses: dict[str, tuple[str, dict]] = {}
    order: list[str] = []
    results: dict[str, tuple[str, bool]] = {}
    problems: list[str] = []
    usage = {"input_tokens": 0, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0, "output_tokens": 0}
    cost = 0.0
    turns = 0
    answer = ""
    last_stop = None
    error = None
    tools_added: list[str] = []
    tool_start: dict[str, float] = {}
    tool_secs = 0.0
    end: dict = {}
    model = None
    for line in transcript.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        event = json.loads(line)
        kind = event.get("type")
        if kind == "bench_end":
            end = event
        elif kind == "tool_execution_start":
            tool_start[event["toolCallId"]] = event["_t"]
        elif kind == "tool_execution_end" and event.get("toolCallId") in tool_start:
            tool_secs += event["_t"] - tool_start.pop(event["toolCallId"])
        if kind != "message_end":
            continue
        message = event["message"]
        role = message.get("role")
        if role == "system":
            tools_added += [t.get("name", "") for t in message.get("toolsAdded") or []]
        elif role == "assistant":
            turns += 1
            model = message.get("model")
            u = message.get("usage") or {}
            usage["input_tokens"] += u.get("input", 0)
            usage["cache_creation_input_tokens"] += u.get("cacheWrite", 0)
            usage["cache_read_input_tokens"] += u.get("cacheRead", 0)
            usage["output_tokens"] += u.get("output", 0)
            cost += (u.get("cost") or {}).get("total", 0) or 0
            last_stop = message.get("stopReason")
            error = message.get("errorMessage") or error
            texts = []
            for block in message.get("content") or []:
                if block.get("type") == "toolCall":
                    uses[block["id"]] = (block["name"], block.get("arguments") or {})
                    order.append(block["id"])
                elif block.get("type") == "text":
                    texts.append(block.get("text", ""))
            if texts:
                answer = "\n".join(texts)
        elif role == "toolResult":
            results[message["toolCallId"]] = (result_text(message.get("content")), bool(message.get("isError")))
    runner = json.loads((run_dir / "runner.json").read_text()) if (run_dir / "runner.json").exists() else {}
    if runner.get("mcp") and not any(n.startswith("mcp__") for n in tools_added):
        problems.append("mcp server never connected (no mcp__ tools offered)")
    if turns > max_turns:
        problems.append(f"runner passed the {max_turns}-turn cap ({turns} turns)")
    secs = (end.get("_t", 0) - end.get("start", 0)) if end else 0
    ok_end = bool(end) and not end.get("timedOut") and end.get("exit") == 0 and last_stop == "stop"
    final = {}
    if end:
        final = {
            "type": "result", "runner": "pi", "model": model,
            "subtype": "success" if ok_end else ("timeout" if end.get("timedOut") else f"stop:{last_stop}"),
            "is_error": not ok_end, "error": error, "result": answer, "usage": usage,
            "total_cost_usd": round(cost, 6), "num_turns": turns,
            "duration_ms": round(secs * 1000), "duration_api_ms": round(max(0.0, secs - tool_secs) * 1000),
        }
    return uses, order, results, final, problems


def parse_codex(transcript: Path, run_dir: Path):
    """Codex JSONL: MCP item arguments/results, reported usage, honest timing limits."""
    uses, order, results, problems = {}, [], {}, []
    answer = ""
    usage = None
    end = {}
    completed = False
    tool_started, tool_seconds = {}, 0.0
    for line in transcript.read_text(encoding="utf-8").splitlines():
        if not line.strip(): continue
        event = json.loads(line)
        kind = event.get("type")
        item = event.get("item", {})
        ident = item.get("id")
        if kind == "bench_end": end = event
        elif kind == "turn.completed":
            usage = event.get("usage")
            completed = True
        elif kind in ("turn.failed", "error"):
            problems.append("Codex " + kind + ": " + json.dumps(event.get("error", event.get("message", ""))))
        if item.get("type") == "mcp_tool_call":
            if ident not in uses:
                uses[ident] = ("mcp__" + item.get("server", "unknown") + "__" + item.get("tool", "unknown"), item.get("arguments") or {})
                order.append(ident)
            if kind == "item.started": tool_started[ident] = event.get("_t")
            if kind == "item.completed":
                payload = item.get("result") or {}
                text = result_text(payload.get("content"))
                # Codex renders MCP content; structuredContent is retained separately in raw JSONL.
                if not text and item.get("error"): text = json.dumps(item["error"], ensure_ascii=False)
                results[ident] = (text, bool(item.get("error") or payload.get("isError") or payload.get("is_error") or item.get("status") == "failed"))
                if ident in tool_started and event.get("_t") is not None:
                    tool_seconds += event["_t"] - tool_started.pop(ident)
        elif kind == "item.completed" and item.get("type") == "agent_message":
            answer = item.get("text", "")
        elif item.get("type") in ("command_execution", "file_change", "web_search"):
            problems.append("unexpected built-in tool: " + item["type"])
    runner = json.loads((run_dir / "runner.json").read_text()) if (run_dir / "runner.json").exists() else {}
    preflight = json.loads((run_dir / "preflight.json").read_text()) if (run_dir / "preflight.json").exists() else {}
    if not preflight.get("ok"): problems.append("MCP preflight unavailable or failed")
    if not order: problems.append("Codex made no MCP calls; tool availability/research is unverified")
    if not completed: problems.append("Codex completion missing")
    if not usage: problems.append("Codex usage missing")
    ok = completed and bool(end) and end.get("exit") == 0 and not end.get("reason")
    if end.get("errors"): problems += end["errors"]
    raw_usage = usage or {}
    final = {"type":"result", "runner":"codex", "model":runner.get("model"),
        "subtype":"success" if ok else end.get("reason") or "runner_failed", "is_error":not ok,
        "result":answer, "usage":raw_usage, "provider_usage":raw_usage,
        "total_cost_usd":None, "num_turns":None, "tool_calls":len(order),
        "duration_ms":round((end["_t"]-end["start"])*1000) if end else None,
        "duration_api_ms":None, "setup_duration_ms":end.get("setup_ms"),
        "solver_duration_ms":end.get("solver_ms"), "observed_tool_duration_ms":round(tool_seconds*1000),
        "measurement_notes":["Codex reports session token totals; internal sampling turns and API time unavailable.",
            "Tool characters are MCP content blocks in Codex JSONL; exact internal prompt framing is unavailable."]}
    return uses, order, results, final, problems


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--transcript", required=True, type=Path)
    ap.add_argument("--log", required=True, type=Path)
    ap.add_argument("--run-dir", required=True, type=Path)
    ap.add_argument("--question", required=True)
    ap.add_argument("--format", choices=["claude", "pi", "codex"], default="claude")
    ap.add_argument("--max-turns", type=int, default=60)
    args = ap.parse_args()

    uses: dict[str, tuple[str, dict]] = {}
    order: list[str] = []
    results: dict[str, tuple[str, bool]] = {}
    final: dict = {}
    problems: list[str] = []
    if args.format == "pi":
        uses, order, results, final, problems = parse_pi(args.transcript, args.run_dir, args.max_turns)
    elif args.format == "codex":
        uses, order, results, final, problems = parse_codex(args.transcript, args.run_dir)
    for line in ([] if args.format in ("pi", "codex") else args.transcript.read_text(encoding="utf-8").splitlines()):
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
