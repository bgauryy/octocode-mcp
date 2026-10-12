# Developing Octocode

This page owns the native crate map, the contract pipeline, build commands, development-only environment variables, and ownership rules. Repository-wide agent rules are in `<repo>/AGENTS.md`. The tool concept is in `<repo>/docs/OCTOCODE_PROTOCOL.md`.

Other dev docs: [ADDING_CONFIG.md](ADDING_CONFIG.md) (new settings), [TOOL_QUALITY.md](TOOL_QUALITY.md) (acceptance criteria), [RELEASE.md](RELEASE.md) (release gates), [scripts/README.md](../scripts/README.md) (root automation), and the [benchmark results](../../../packages/octocode-benchmark/results/SUMMARY.md).

## Runtime flow

```text
octocode CLI launcher ─┐
octocode-mcp (stdio) ──┼──▶ octocode-native (Rust ToolRuntime: validate → execute → secure → shape)
octocode-mcp-vscode ───┘          ├──▶ embedded contract from @octocodeai/config (generated from octocode-core)
                                  └──▶ configuration resolved in Rust, same rules as @octocodeai/config
```

`octocode-native` is the one owner of public tool validation, providers, security, batching, pagination, response shaping, and cancellation. Interfaces register, delegate, render, or offer interactive selection.

## Native crates

The package map is in `<repo>/AGENTS.md`. Native Cargo crates under `crates/`:

| Crate dir | Cargo name | Owns |
|---|---|---|
| `runtime` | `octocode-native` | Tool catalog, validation, config resolution, GitHub auth, providers, security, response shaping, pagination, `clasify`; `build.rs` embeds `packages/octocode-config/contract/` |
| `engine` | `octocode-engine` | Primitives: text search, tree-sitter AST and rewrite, LSP client pool, minification, secret scanning, code graph |
| `github` | `octocode-github` | GitHub REST/GraphQL transport, bounded provider operations, credential traits |
| `cli` | `octocode-cli` | The native `octocode` binary: tool commands, `schema`, `config`, `auth`, `graph`, `skill`, `install` |
| `runtime-napi` | `octocode-runtime-napi` | N-API adapter the MCP server loads in-process |

## Concept to code

Where each part of [the protocol](../../../docs/OCTOCODE_PROTOCOL.md) lives. Native paths are under `packages/octocode-native/`.

| Concept | Where |
|---|---|
| Contracts, descriptions, instructions, budgets | core `src/toolContract/` (`instructions.ts`, `descriptions.ts`, `publishedSchema.ts`, `validation/`, `outputSchemas.ts`, `limits.ts`) → `packages/octocode-config/contract/` |
| MCP startup, fingerprint gate, registration | `packages/octocode-mcp/src/native/index.ts` |
| CLI dispatch and exit codes | `crates/cli/src/cli/mod.rs` |
| Validation and row isolation | `crates/runtime/src/contracts/` (`validate.rs`, `mod.rs`) |
| Gate, dispatch, row shaping | `crates/runtime/src/runtime/engine.rs`, `domain_dispatch.rs` |
| Minimal output, next-step filtering | `crates/runtime/src/response/rows.rs` |
| Continuation compaction and brief inheritance | `crates/runtime/src/response/continuations.rs` |
| Page and lead split (`next` and `hints`) | `crates/runtime/src/response/channels.rs` |
| Rendering and response paging | `crates/runtime/src/response/render.rs`, `stage.rs`, `pager.rs` |
| Snapshot identity | `crates/runtime/src/tools/local_search/cursor.rs`; response tokens in `crates/runtime/src/response/pager.rs` |
| Path sandbox and directory pruning | `crates/runtime/src/policy/path.rs`, `policy/prune.rs` |
| Secret scanning and redaction | `crates/engine/src/security/`, `crates/runtime/src/security/content.rs` |
| Search and ranking | `crates/engine/src/search/` (`text_search.rs`, `relevance.rs`) |
| Minification | `crates/engine/src/minify/` |
| AST and rewrite | `crates/engine/src/structural/`, `crates/runtime/src/tools/ast_*` |
| LSP | `crates/engine/src/lsp/`, `crates/runtime/src/tools/lsp_search/` |
| Dependency graph | `crates/engine/src/graph/`, `crates/runtime/src/tools/ast_graph/` |
| GitHub client, rate-limit breaker, cache | `crates/github/src/` (`budget.rs`), `crates/runtime/src/runtime/github.rs`, `github_cache.rs` |
| `clasify` | `crates/runtime/src/tools/clasify/` (including `run/` and `cache.rs`) |
| End-to-end harness | `octocode-local-testing/harness/` |

## Contract pipeline

1. **Author** in core: Zod schema, description, instructions, limits.
2. **Build core**, then run `yarn contracts:regen` at the repo root. It refreshes the `file:` copy of core (`yarn install`) and runs `@octocodeai/config generate:tool-contract`, the only generator. It needs `cargo install cargo-typify --version 0.8.0 --locked`.
3. **Output** lands in `packages/octocode-config/contract/` and `src/contracts/toolTypes.generated.ts`. It is committed and never hand-edited. `check:tool-contract` fails when it is stale.
4. **Rebuild native** (`yarn workspace @octocodeai/octocode-native build:dev`). `crates/runtime/build.rs` embeds `contract/` in place and fails on a fingerprint mismatch.

Until native is rebuilt, the MCP server refuses to start and CLI `schema` refuses to describe tools. `OCTOCODE_ALLOW_CONTRACT_DRIFT=1` downgrades that to a warning outside production. Release order: [RELEASE.md](RELEASE.md).

### Adding a tool field

1. Add it in core and regenerate as above.
2. Declare and implement it in `crates/runtime/src/contracts/field-effect-coverage.json`.
3. A public limit change trips the `public_response_and_tree_limits_are_pinned` test by design. Update it deliberately.
4. Check the result against [TOOL_QUALITY.md](TOOL_QUALITY.md), then update `<repo>/docs/OCTOCODE_TOOLS.md`.

A new configuration setting follows [ADDING_CONFIG.md](ADDING_CONFIG.md).

## Build, test, lint

Run from the repo root. Repo-wide tasks run through `node skills-dev/octocode-dev/scripts/dev.mjs <task>`; the task table is in [SKILL.md](../SKILL.md#task-runner).

- `yarn workspace @octocodeai/octocode-native build:all`: release native binaries for all platforms (clears old binaries first). Root `yarn build:native:all` runs it.
- `yarn contracts:regen`: regenerate the tool contract from core.

| Package | Test | Lint / format |
|---|---|---|
| native | `test` (scripts + vitest + `test:rust`), `test:rust` alone | `lint` (clippy `-D warnings`), `fmt:rust`, `fmt:rust:check` |
| config | `test`, `check:tool-contract`, `check:config-contract` | `lint` |
| mcp | `test` | `lint`, `format:check` |
| octocode, vscode, skill-installer, benchmark | `test` | `lint` |

### Tool health

`$DEV test:tools` (`octocode-local-testing/harness/tool-health.mjs`) is the quick end-to-end alarm for every tool in the contract. It runs each tool through the built CLI (`--json`) and the MCP stdio server and checks:

- **happy**: the primary operation exits 0, returns rows with the key fields, and validates against the contract `outputSchema`;
- **continuation**: replaying the `next.*` page lead to the end gives non-empty pages, no duplicate rows, and exactly the unpaged rows;
- **empty**: exit 1 with a hint or lead on both surfaces;
- **invalid**: a typed contract `errorCode`, exit 2;
- **parity**: the CLI and MCP evidence, page leads and status class match (`hints` are surface guidance and leads to CLI-only tools are excluded, since MCP omits those tools);
- **latency**: every call fits the tool's budget; all timings are recorded.

It is hermetic: a temp `OCTOCODE_HOME`/`HOME`, no user token, fixtures in `octocode-local-testing/fixtures/tool-health/`, and a loopback mock (`harness/tool-health/mock-server.mjs`) for GitHub REST (`GITHUB_API_URL`), git smart HTTP, an npm registry (`registryUrl` with `OCTOCODE_ALLOW_PRIVATE_REGISTRY`) and the classification provider (`OCTOCODE_CLASSIFICATION_API_HOST`). Every proxy variable points at a dead loopback port, so a request that would leave the machine fails the run. It runs four tools at a time and takes under a minute. GitHub search tools share one lane, because the runtime spaces search requests 2 s apart. A contract tool without a case fails the run. Cases live in `harness/tool-health/cases.mjs`.

Run it after `build:dev`. It is not part of `test:ci`, because CI builds no native binary. To run some tools only, pass their names: `$DEV test:tools ghSearchCode,localFetch`.

Each tool prints one line, `PASS`/`FAIL`/`SKIP`, with its total and slowest-call time. A `FAIL` line names the first failing check, for example `FAIL ghSearchCode … — empty.hint.mcp: …`. A check name is `<phase>.<what>[.<surface>]`, with phase happy, continuation, empty, invalid, parity, latency or extra. A `SKIP` line states its reason, such as a missing TypeScript language server. Every check, its detail and per-call timings are in `octocode-local-testing/results/tool-health.json`. The run exits non-zero on any `FAIL`.

### Cargo builds

- `build:dev` (debug native + TypeScript, no clean or lint) is the default local build; use `build` only for release or performance artifacts. Check exit codes, not output paths.
- Rust integration tests are one binary per crate: `tests/main.rs` declares each `tests/*.rs` as a `mod`.
- Don't commit local lld or sccache Cargo configuration.
- One build lane uses the repo's warm `target/`. Parallel lanes share at most three Cargo target directories in total, each in a scratch directory (never `target/<name>`), deleted when done. Cargo's lock serializes builds in one directory, and the same `--features` keeps compiled units shared.
- Reset a bloated `target/` with `dev.mjs clean:cache` (stale native copies) or `dev.mjs clean` (all build outputs).

## Development environment variables

These are not user settings and are not read from `.octocoderc`. User settings are in `<repo>/docs/CONFIGURATION.md`.

| Variable | Read by | Effect |
|---|---|---|
| `OCTOCODE_NATIVE_BIN` | `octocode` launcher | Absolute path to a native `octocode` binary used instead of the platform package. Ignored when `NODE_ENV=production`; the bundled CLI honors it only with `NODE_ENV` `development` or `test` |
| `OCTOCODE_NATIVE_BINDING` | `octocode-mcp` | Path to a candidate `.node` addon. Ignored when `NODE_ENV=production`; the bundled `dist` honors it only with `NODE_ENV` `development` or `test` |
| `OCTOCODE_ALLOW_CONTRACT_DRIFT` | `octocode-mcp`, CLI `schema` | `1` turns the fingerprint mismatch into a stderr warning; same `NODE_ENV` limits |
| `OCTOCODE_SKILL_DELEGATED` | native `octocode skill` | Internal recursion guard set when native delegates `skill` to the npm CLI; do not set it |
| `XDG_CONFIG_HOME` | native `octocode install` (Linux) | Locates IDE config directories (default `~/.config`); never moves the Octocode home |

## Ownership rules

- `crates/engine` exposes primitives, not tool policy.
- Skill filesystem behavior comes from `@octocodeai/octocode-skill-installer`.
- Each doc topic has one owner; see `<repo>/docs/README.md`. Per-package invariants are in each package `ARCHITECTURE.md`.
