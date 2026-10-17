# Local build after the fix round vs published 19.1.0 (pi runner), Oct 12 2026

All three arms used the same 30 GitHub questions and one pass each. The runner was pi (`RUNNER=pi`) with `guy-provider-anthropic-x/claude-sonnet-5-5`, at parallelism 4 with only the MCP arm in the batch, the same setup as local-before. Clasify was off. All 30 local-now runs were valid.

The detailed report below retains its findings, scope and limitations.

- [report.md](report.md)

See the [run instructions](../../README.md) for reproducing campaigns. Compare quality before efficiency; missing usage stays unknown.
