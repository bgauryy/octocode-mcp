# Local release review: Octocode MCP versus lean gh

The current build does not demonstrate a context saving over lean `gh` on this public question set. Correctness rounds to **9/10 for both arms**; Octocode uses **1.31×** the observable characters (95% paired bootstrap interval **1.16–1.47×**) and is leaner on **5/30** questions. Deterministic correctness findings in the [release review](../../../../.octocode/octocode-architect/2026-10-16-release-readiness.md) independently block release.

The detailed report below retains its findings, scope and limitations.

- [report.md](report.md)
- [run.json](run.json)

See the [run instructions](../../README.md) for reproducing campaigns. Compare quality before efficiency; missing usage stays unknown.
