# 3-arm campaign — Octocode vs gh+RTK vs gh+Headroom (25×1, 2026-08-06)

Paired (correctness): Octocode vs RTK **3 win / 16 tie / 6 loss** (RTK marginally higher, near-ceiling, n.s.); Octocode vs Headroom **5 / 16 / 4**. Correctness is a three-way tie within noise. Octocode's losses cluster on the hardest flow/graph questions (Q19, Q21, Q23, Q24) and one over-terse answer (Q10); Headroom's one real miss was **Q13** (answered a different Redis BITFIELD bug → corr 2).

The detailed report below retains its findings, scope and limitations.

- [report.md](report.md)

See the [run instructions](../../README.md) for reproducing campaigns. Compare quality before efficiency; missing usage stays unknown.
