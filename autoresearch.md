# Autoresearch: speed up octocode-cli help startup

## Objective
Reduce the runtime and output size of lightweight `octocode-cli` help/version flows without changing visible behavior.

## Metrics
- **Primary**: `total_ms` (ms, lower is better) — combined median runtime of representative built CLI help/version invocations.
- **Secondary**: `stdout_bytes` — output size proxy for token cost.
- **Secondary**: `passes` — correctness signal; should remain 1.

## How to Run
`bash autoresearch.sh`

The harness rebuilds `packages/octocode-cli` in dev mode, then benchmarks:
- `node packages/octocode-cli/out/octocode-cli.js --help`
- `node packages/octocode-cli/out/octocode-cli.js search-code --help`
- `node packages/octocode-cli/out/octocode-cli.js --version`

## Files in Scope
- `packages/octocode-cli/src/cli/index.ts`
- `packages/octocode-cli/src/cli/parser.ts`
- `packages/octocode-cli/src/cli/help.ts`
- `packages/octocode-cli/src/cli/commands.ts`
- `packages/octocode-cli/src/cli/agent-commands.ts`
- `autoresearch.sh`
- `autoresearch.md`
- `autoresearch.ideas.md`

## Off Limits
- CLI output semantics and help text content.
- Networked command behavior.
- Benchmark cheating via caching fake outputs or skipping real bundle execution.

## Constraints
- Measure the built CLI, not tsx source execution.
- Keep help/version behavior equivalent.
- Avoid optimizations that only help one command while regressing the others badly.
- Prefer startup/import reductions over command-specific hacks.

## What We Suspect
- `--help` and `--version` likely pay too much eager module-import cost.
- `findCommand()` currently pulls in a very large `commands.ts` graph even for lightweight flows.
- Dynamic imports or separating command metadata from handlers may reduce cold-start cost without changing behavior.
