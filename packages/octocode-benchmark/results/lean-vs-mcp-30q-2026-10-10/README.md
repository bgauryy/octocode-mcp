# Octocode mcp-v9 vs gh-lean vs published 19.1.0 — 2026-10-10 (30 × 1)

mcp-v9 (today's build: Zod-only contract, lean `{tool, query}` leads, exact windows, static advice moved into descriptions) reaches **correctness parity with gh-lean (8.83 vs 8.87, wins 14–16)** at **0.80×** of its characters' inverse (gh-lean reads 0.80× of what v9 reads; the v20 arm sat at 0.71× and the published 19.1.0 at 0.59×), with higher depth (4.07 vs 3.93) and workflow (4.63 vs 4.33).

The detailed report below retains its findings, scope and limitations.

- [report.md](report.md)
- [run.json](run.json)

See the [run instructions](../../README.md) for reproducing campaigns. Compare quality before efficiency; missing usage stays unknown.
