# Autoresearch: speed up octocode-cli help startup

## Objective
Reduce the runtime and output size of lightweight built `octocode-cli` help/version flows without changing visible behavior.

## Metrics
- **Primary**: `total_ms` (ms, lower is better) — combined median runtime of representative built CLI help/version invocations.
- **Secondary**: `stdout_bytes` — output size proxy for token cost.
- **Secondary**: `passes` — correctness signal; should remain 1.

## How to Run
`bash autoresearch.sh`

The harness rebuilds `packages/octocode-cli` in dev mode, then benchmarks:
- `node packages/octocode-cli/out/octocode-cli.js --help`
- `node packages/octocode-cli/out/octocode-cli.js search-code --help`
- `node packages/octocode-cli/out/octocode-cli.js install --help`
- `node packages/octocode-cli/out/octocode-cli.js skills --help`
- `node packages/octocode-cli/out/octocode-cli.js sync --help`
- `node packages/octocode-cli/out/octocode-cli.js mcp --help`
- `node packages/octocode-cli/out/octocode-cli.js token --help`
- `node packages/octocode-cli/out/octocode-cli.js cache --help`
- `node packages/octocode-cli/out/octocode-cli.js --version`

## Files in Scope
- `packages/octocode-cli/src/cli/index.ts`
- `packages/octocode-cli/src/cli/help.ts`
- `packages/octocode-cli/src/cli/commands.ts`
- `packages/octocode-cli/src/cli/command-help-specs.ts`
- `packages/octocode-cli/src/cli/agent-command-specs.ts`
- `packages/octocode-cli/src/cli/agent-commands.ts`
- `packages/octocode-cli/src/index.ts`
- `packages/octocode-cli/build.mjs`
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
- Be careful not to overfit to one help path: include both agent and multiple admin command help flows.

## What We Know So Far
- Current best on the earlier narrow workload (`--help`, `search-code --help`, `--version`) is 118.756ms total after:
  - code-splitting the CLI bundle
  - lazy-loading commands/tool/help modules
  - separating agent subcommand metadata from heavy handlers
  - buffering help output into one stdout write per screen
- Current best on the broader workload including `install --help` is 439.921ms after adding a static help-spec fast path for `install/setup`.
- Many micro-optimizations regressed because they worsened the emitted chunk graph even when source size shrank.
- The remaining promising path is reducing admin-command help overhead across more commands, not just `install --help`.
