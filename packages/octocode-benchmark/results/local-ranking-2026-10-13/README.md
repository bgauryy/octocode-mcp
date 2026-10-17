# Local relevance ranking: measured context savings

On 2026-10-13, five broad local lookups used **51,921 → 8,168 tool-response tokens (84.3% less)** when ranked evidence brought the frozen target forward. These are sums of per-case medians, using `o200k_base`. The same responses measured **83.9% less** with `cl100k_base`. Every final positive trial reached its target. This supports opt-in ranking for broad lookups; it does not establish lower combined token use, cost, or latency.

The detailed report below retains its findings, scope and limitations.

- [local-ranking-2026-10-13.json](local-ranking-2026-10-13.json)
- [report.md](report.md)

See the [run instructions](../../README.md) for reproducing campaigns. Compare quality before efficiency; missing usage stays unknown.
