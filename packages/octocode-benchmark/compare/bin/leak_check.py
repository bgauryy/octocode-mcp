#!/usr/bin/env python3
"""Overfitting check: is anything an agent sees, or the product itself, tuned to the questions?

Takes each question's distinctive terms (owner/repo names, paths, camelCase / snake_case
identifiers, backticked code) and looks for them in:

  agent-visible (FAIL): the runner and arm briefs, and the MCP server's initialize
      instructions + tools/list (fetched live, the exact text a runner's model receives).
  product source (REVIEW): Octocode's own code, contract, prompts and skills, outside
      tests/fixtures. A hit is not proof of tuning (a repo can be a doc example), so each
      is listed with file:line for a person to judge.

    leak_check.py                 # live MCP from the local build
    leak_check.py --mcp-cmd "npx -y octocode-mcp@20.1.1" --json leak.json
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import subprocess
from pathlib import Path

PKG = Path(__file__).resolve().parents[2]
REPO = PKG.parents[1]
PRODUCT = ["packages/octocode-native/crates", "packages/octocode-config/contract", "packages/octocode-config/src",
           "packages/octocode-mcp/src", "packages/octocode/src", "skills"]
SKIP_DIRS = re.compile(r"/(tests?|fixtures?|__tests__|testdata|benches|benchmarks?|node_modules|target|dist|out)/")
# File names and phrases every codebase uses; they say nothing about a specific question.
GENERIC = {"package.json", "package-lock.json", "tsconfig.json", "readme.md", "src/lib", "src/index", "src/main",
           "javascript/typescript", "yes/no", "node_modules", "cargo.toml"}
SKIP_FILES = re.compile(r"(^|/)(tests?\.rs|.*_tests?\.rs|.*\.(test|spec)\.[jt]s|test_.*\.py)$")
TEXT_EXT = {".rs", ".ts", ".js", ".mjs", ".json", ".md", ".yaml", ".yml", ".toml", ".txt"}


def question_terms(question_dir=None) -> dict[str, list[str]]:
    out = {}
    for f in sorted((question_dir or PKG / "compare/github-questions").glob("Q*.md"), key=lambda p: int(p.stem[1:])):
        body = f.read_text().split("## Question", 1)[-1]
        found = set(re.findall(r"\b[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\b", body))      # owner/repo, paths
        found |= set(re.findall(r"\b[a-z]+[A-Z][A-Za-z0-9]{2,}\b", body))           # camelCase
        found |= set(re.findall(r"\b[a-z]+_[a-z0-9_]{3,}\b", body))                 # snake_case
        for code in re.findall(r"`([^`]{4,80})`", body):
            code = code.strip("()")
            if re.search(r"[A-Z_./]", code[1:]):                                     # not a plain word
                found.add(code)
        out[f.stem] = sorted(t for t in found if len(t) >= 6 and t.lower() not in GENERIC
                             and not re.fullmatch(r"[\d./-]+", t))
    return out


def mcp_surface(cmd: str) -> str:
    from mcp_probe import McpClient
    command = shlex.split(cmd)
    client = McpClient({"command":command[0],"args":command[1:]})
    try:
        init = client.call("initialize", {"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"leak-check","version":"2"}})
        client.proc.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n')
        client.proc.stdin.flush()
        catalog = client.call("tools/list")
        return json.dumps(init, ensure_ascii=False) + "\n" + json.dumps(catalog, ensure_ascii=False)
    finally:
        client.close()


def scan_text(name: str, text: str, terms: dict[str, list[str]]) -> list[dict]:
    hits = []
    low = text.lower()
    for q, ts in terms.items():
        for t in ts:
            if t.lower() in low:
                i = low.index(t.lower())
                hits.append({"question": q, "term": t, "where": name, "context": text[max(0, i - 60): i + len(t) + 60]})
    return hits


def scan_product(terms: dict[str, list[str]]) -> list[dict]:
    hits = []
    flat = {t.lower(): (q, t) for q, ts in terms.items() for t in ts}
    # Whole terms only: `onRequest` must not match inside `invalidClassificationRequest`.
    pattern = re.compile(r"(?<![A-Za-z0-9_])(?:" + "|".join(re.escape(t) for t in sorted(flat, key=len, reverse=True))
                         + r")(?![A-Za-z0-9_])", re.I)
    for root in PRODUCT:
        for path in (REPO / root).rglob("*"):
            rel = "/" + str(path.relative_to(REPO))
            if (not path.is_file() or path.suffix not in TEXT_EXT or SKIP_DIRS.search(rel) or SKIP_FILES.search(rel)
                    or path.stat().st_size > 2_000_000):
                continue
            lines = path.read_text(errors="replace").splitlines()
            for n, line in enumerate(lines, 1):
                # A Rust file's inline `#[cfg(test)] mod tests` is test data, like a tests/ dir.
                if path.suffix == ".rs" and line.strip() == "#[cfg(test)]" and n < len(lines) and lines[n].lstrip().startswith("mod "):
                    break
                for m in pattern.finditer(line):
                    q, t = flat[m.group(0).lower()]
                    hits.append({"question": q, "term": t, "where": f"{rel[1:]}:{n}", "context": line.strip()[:160]})
    return hits


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mcp-cmd", default=f"node {REPO}/packages/octocode-mcp/dist/index.js")
    ap.add_argument("--question-dir", type=Path, default=os.environ.get("QUESTION_DIR"))
    ap.add_argument("--json", type=Path, help="write all hits here")
    args = ap.parse_args()
    terms = question_terms(args.question_dir)
    visible = []
    for brief in sorted((PKG / "compare/arms").glob("*.md")):
        visible += scan_text(f"compare/arms/{brief.name}", brief.read_text(), terms)
    visible += scan_text("MCP initialize + tools/list", mcp_surface(args.mcp_cmd), terms)
    product = scan_product(terms)
    print(f"{sum(map(len, terms.values()))} distinctive terms from {len(terms)} questions")
    print(f"agent-visible hits: {len(visible)}")
    for h in visible:
        print(f"  FAIL {h['question']} `{h['term']}` in {h['where']}: …{h['context']}…")
    print(f"product-source hits (review each): {len(product)}")
    by_term: dict[tuple[str, str], list[dict]] = {}
    for h in product:
        by_term.setdefault((h["question"], h["term"]), []).append(h)
    for (q, t), hs in sorted(by_term.items(), key=lambda kv: -len(kv[1])):
        print(f"  {q} `{t}` ×{len(hs)}: " + "; ".join(h["where"] for h in hs[:4]) + (" …" if len(hs) > 4 else ""))
    if args.json:
        args.json.write_text(json.dumps({"terms": terms, "agent_visible": visible, "product": product}, indent=1))
    return 1 if visible else 0


if __name__ == "__main__":
    raise SystemExit(main())
