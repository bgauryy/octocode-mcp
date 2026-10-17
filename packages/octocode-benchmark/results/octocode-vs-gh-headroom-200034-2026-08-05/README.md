# Octocode vs `gh` + Headroom — 200034-2026-08-05

The naive per-question preference count is A 10 / B 9 / tie 1, but that count is **dominated by char tiebreaks on questions where both arms were equally correct** (Q1–Q4, Q8): on those easy lookups Headroom-compressed `gh` output was smaller than Octocode's, so the judge broke the correctness tie toward A. Per `SCORING.md`, correctness decides first and a confidently-wrong answer cannot win — on that axis B is clearly ahead.

The detailed report below retains its findings, scope and limitations.

- [report.md](report.md)

See the [run instructions](../../README.md) for reproducing campaigns. Compare quality before efficiency; missing usage stays unknown.
