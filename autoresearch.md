# Autoresearch: speed up octocode-cli main local tool execution

## Objective
Reduce the runtime of built `octocode-cli` direct local tool execution flows without changing visible behavior.

## Metrics
- **Primary**: `total_ms` (ms, lower is better) — combined median runtime of representative built local-tool invocations.
- **Secondary**: `stdout_bytes` — output size proxy for token cost.
- **Secondary**: `passes` — correctness signal; should remain 1.

## How to Run
`bash autoresearch.sh`

The harness rebuilds `packages/octocode-cli` in dev mode, then benchmarks:
- `node packages/octocode-cli/out/octocode-cli.js --tool localSearchCode ...`
- `node packages/octocode-cli/out/octocode-cli.js --tool localGetFileContent ...`
- `node packages/octocode-cli/out/octocode-cli.js --tool localFindFiles ...`
- `node packages/octocode-cli/out/octocode-cli.js --tool localViewStructure ...`

## Files in Scope
- `packages/octocode-cli/src/cli/tool-command.ts`
- `packages/octocode-cli/src/cli/index.ts`
- `packages/octocode-cli/src/cli/agent-commands.ts`
- `packages/octocode-cli/build.mjs`
- `autoresearch.sh`
- `autoresearch.md`
- `autoresearch.ideas.md`

## Off Limits
- CLI output semantics.
- Actual tool execution results.
- Benchmark cheating via canned output or bypassing real tool execution.

## Constraints
- Measure the built CLI, not tsx source execution.
- Keep direct local tool execution meaningfully equivalent.
- Prefer startup/import reductions and unnecessary runtime-init elimination over output changes.
- Avoid network-dependent benchmarks for this target.

## What We Suspect
- `executeToolCommand()` may be initializing external providers even for purely local tools.
- Local tool execution may pay unnecessary startup costs that are irrelevant to filesystem-only commands.
- There may be room to split runtime initialization by tool category so local tools avoid GitHub/GitLab/Bitbucket setup.
