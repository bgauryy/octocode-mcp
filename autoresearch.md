# Autoresearch: speed up octocode-cli tool discovery flows

## Objective
Reduce the runtime of built `octocode-cli` tool-discovery flows (`--tool ... --help` and `--tools-context`) without changing visible behavior.

## Metrics
- **Primary**: `total_ms` (ms, lower is better) — combined median runtime of representative built tool-discovery invocations.
- **Secondary**: `stdout_bytes` — output size proxy for token cost.
- **Secondary**: `passes` — correctness signal; should remain 1.

## How to Run
`bash autoresearch.sh`

The harness rebuilds `packages/octocode-cli` in dev mode, then benchmarks:
- `node packages/octocode-cli/out/octocode-cli.js --tool localSearchCode --help`
- `node packages/octocode-cli/out/octocode-cli.js --tool githubSearchCode --help`
- `node packages/octocode-cli/out/octocode-cli.js --tool packageSearch --help`
- `node packages/octocode-cli/out/octocode-cli.js --tools-context`

## Files in Scope
- `packages/octocode-cli/src/cli/tool-command.ts`
- `packages/octocode-cli/src/cli/index.ts`
- `packages/octocode-cli/src/cli/main-help.ts`
- `packages/octocode-cli/build.mjs`
- `autoresearch.sh`
- `autoresearch.md`
- `autoresearch.ideas.md`

## Off Limits
- CLI output semantics and tool descriptions/schemas.
- Actual tool execution behavior.
- Benchmark cheating via canned output or skipping real metadata loading when the command should load it.

## Constraints
- Measure the built CLI, not tsx source execution.
- Keep `--tool ... --help` and `--tools-context` meaningfully equivalent.
- Do not fake metadata or bypass real schema/description generation unless output remains equivalent.
- Prefer startup/import reductions or repeated-work elimination over output/content changes.

## What We Suspect
- `tool-command.ts` eagerly defines a large tool table and metadata helpers that may dominate these flows.
- `showToolHelp()` and `printToolsContext()` may be paying avoidable MCP metadata initialization costs.
- There may be room to separate fast static help for common tool-help paths from the heavier full metadata/context path.
