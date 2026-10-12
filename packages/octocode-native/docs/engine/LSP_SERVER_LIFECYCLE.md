# LSP lifecycle and provisioning

For the public query contract, see [`lspSearch`](../../../../docs/OCTOCODE_TOOLS.md#lspsearch). For grammar and feature coverage, see [Supported languages and features](SUPPORTED_LANGUAGES_AND_FEATURES.md).

## Semantic boundary

Tree-sitter and Oxc answer syntactic questions from embedded parsers. LSP operations launch a real language server over stdio to resolve cross-file identity, definitions, references, types, implementations, and call relationships. These evidence classes are not interchangeable.

When an operation requires an unavailable server, `lspSearch` returns an error row with `errorCode:"serverUnavailable"` and valid recovery calls. It never labels same-file or syntactic guesses as semantic results. A running server that lacks the requested capability returns `capabilityUnavailable`. A supported server returning no rows establishes only an empty result within that server's indexed scope and configuration.

`documentSymbols` may use native Oxc or Markdown outline support without a server. Other semantic operations require their corresponding negotiated LSP capability.

Public positions, input and output, are one-based, and servers communicate in UTF-16. A server selecting an unsupported encoding fails startup.

## Resolution

The Rust engine owns command discovery and launch configuration. For a known extension it resolves, in priority order:

1. an explicit `lsp.configPath` / `$OCTOCODE_LSP_CONFIG` entry;
2. `<workspace>/.octocode/lsp-servers.json` only when `lsp.trustProjectConfig` (`OCTOCODE_TRUST_PROJECT_LSP_CONFIG=true`) is set;
3. `~/.octocode/lsp-servers.json`;
4. a known command on `PATH`, in the managed cache or an ecosystem location, or (TypeScript only, see below) in a `node_modules` tree.

Project configuration is untrusted by default because it controls executable startup. Generic interpreter eval forms such as `node -e` or `python -c` are rejected even when project configuration is trusted. Absolute commands must exist, be regular executable files, and must not be shell wrappers.

The built-in routing table includes:

| Files | Command |
|---|---|
| TypeScript | octocode's bundled `tsgo --lsp -stdio` (a trusted workspace's own `node_modules/.bin/tsgo` first), else `typescript-language-server --stdio` |
| JavaScript | `typescript-language-server --stdio` |
| Python | `basedpyright-langserver --stdio`, else `pyright-langserver --stdio`, else `pylsp` |
| Rust | `rust-analyzer` |
| Go | `gopls serve` |
| Java | `jdtls` |
| C / C++ | `clangd` |
| C# | `csharp-ls` |
| Scala (`scala`, `sc`, `sbt`) | `metals` |

A `lsp-servers.json` entry for an extension replaces its built-in server, for example `{"languageServers":{".ts":{"command":"tsgo","args":["--lsp","-stdio"],"languageId":"typescript"}}}`.

Python picks the first installed server in that order. Pyright-family servers are looked up on `PATH` only, so a checkout cannot swap in a server it ships in `node_modules/.bin`; add an `lsp-servers.json` entry to use a workspace-local server. `pylsp` is the fallback. basedpyright and pyright implement call hierarchy, `workspace/symbol`, and implementation, and pylsp implements none of them. Custom configuration still wins over this order.

rust-analyzer starts headless: whenever the resolved server is rust-analyzer, `initializationOptions` default to `cargo.buildScripts.enable:false`, `procMacro.enable:false`, `checkOnSave:false`, `cachePriming.enable:false`, and `cargo.targetDir:true`, so it runs no `build.rs`, proc-macro, or `cargo check` from the repository. User-supplied options merge on top and win key by key. `lspSearch` `rustContext` opts back in to build scripts and proc-macros.

clangd, jdtls, and Metals also start headless, on every launch path, with user arguments and options winning:

- **clangd** gets `--background-index=false` (no `.cache/clangd/` index written into the repository), `--clang-tidy=false`, `--log=error`, and `--pch-storage=memory`. A flag the user already passes, by name, is not added again.
- **jdtls** gets `-data <octocode home>/lsp-workspaces/jdtls/<sha256(workspace)[..16]>` (octocode home is `OCTOCODE_HOME` when absolute, else `~/.octocode`), so its workspace data never lands in the repository, unless the user passes `-data`. Its `initializationOptions.settings` default to `java.autobuild.enabled:false` and `java.import.generatesMetadataFilesAtProjectRoot:false`.
- **Metals** gets `initializationOptions` `isHttpEnabled:false` and `statusBarProvider:"off"`. Metals may still create `.metals/` and `.bloop/` in the workspace; that is its documented project layout.

TypeScript: when `typescript-language-server` is not on `PATH`, the engine runs `node <cli.mjs>` from the first `node_modules/typescript-language-server/lib/cli.mjs` it finds, in this order: an explicit `cli.mjs` command path; octocode's own install tree (ancestors of the running executable); the workspace's `node_modules` tree, **only** when the workspace is trusted; the invocation directory's `node_modules` tree. The workspace is trusted when `lsp.trustProjectConfig` is set (or the caller's trusted project config) or when it is the directory octocode was started in, or inside it — the user's own project. An arbitrary scanned checkout (a clone under the clone cache, say) cannot supply the executable. An invocation directory that is `/` or the home directory never trusts the checkouts under it.

Known routing does not imply that a server is installed. The engine npm package no longer bundles JavaScript language servers. Install servers in the workspace or toolchain, expose them on `PATH`, add an `lsp-servers.json` entry, or use native managed provisioning where supported.

TypeScript files (not JavaScript: tsgo drops constructor functions and `this` expandos) go to a native `tsgo` whenever one can be found, whatever the trust state: the trusted workspace's own `node_modules/.bin/tsgo`, else the `@typescript/native-preview` package in octocode's own install tree (the ancestors of the running addon or executable, isolated or hoisted, with its per-platform executable package). `octocode-mcp` and `octocode` depend on that package, pinned exactly because it is a nightly prerelease. A scanned, untrusted checkout never supplies a `tsgo`. When no `tsgo` is found, or the one found fails to start, the request falls back to `typescript-language-server`, and the answer says so. A `lsp-servers.json` entry for `.ts` always wins and gets no substitute. tsgo answers independent requests in parallel, so importer verification pipelines up to 8 files at once on it; `typescript-language-server` is asked one request at a time.

If `typescript-language-server` cannot be started, the error names where it looked and that `lib/cli.mjs` must be readable (a package manager may install it mode 644; octocode runs it under `node`, so it needs no execute bit).

### Subtypes and implementations without an answer in time

`subtypes` on a server with no `typeHierarchyProvider` asks `textDocument/implementation`; `implementation` on a type declaration (class, interface, struct, trait) asks it directly. A syntax scan of the files that spell the name (declarations whose `extends`/`implements` clause names it) starts at the same time and costs no extra wait. The server's rows win when they arrive: while the scan is running, and for up to 5 s after it finishes. If the request fails (timeout, crash, rejected) or is still silent after that grace, the scan's rows are the answer, labelled `lsp.source: "native-graph-facts"`, partial (`serverUnanswered`) with `next.retry`, and a note that they are unverified (the base is matched by name, not resolved to the declaration) and direct only. A server answer is labelled `lsp.source: "implementation"`; for `subtypes` it does not tell direct from transitive subtypes. `implementation` on a member (function, method, field) has no scan, so its timeout stays an error. On the VS Code corpus (`octocode-local-testing/repos/huge-ts`) `implementation` of `IDisposable` exceeds the 30 s request timeout on both tsgo and typescript-language-server, cold or warm; the scan answers in about 12 to 17 s.

## Managed provisioning

The native CLI owns a pinned managed manifest for `rust-analyzer` and `clangd`:

```bash
npx octocode lsp-server list
npx octocode lsp-server status path/to/file.ts
npx octocode lsp-server install rust-analyzer --yes
npx octocode lsp-server install clangd --yes
```

Managed installation is explicit. `lsp.autoInstall` (`OCTOCODE_LSP_AUTO_INSTALL`: `prompt` by default, `off`, or `auto`) controls whether an install command may fetch without additional confirmation, and `lsp.cacheDir` (`OCTOCODE_LSP_CACHE_DIR`) moves the managed installs from `<octocode home>/lsp`; normal `lspSearch` execution does not download executables.

Provisioning permits only allowed HTTPS hosts, follows the same restriction across redirects, requires a pinned SHA-256, supports bounded `none`, `gz`, and `zip` extraction, uses per-target locks, and atomically publishes a completion-marked executable. Unsupported platforms fail with an installation hint.

## Custom configuration

A configuration maps file extensions to launch specs:

```json
{
  "languageServers": {
    ".php": {
      "command": "intelephense",
      "args": ["--stdio"],
      "languageId": "php"
    }
  }
}
```

`command` and `languageId` are required. `args` defaults to an empty array and `initializationOptions` is passed to `initialize`. The example restores an explicit user-owned route for a language with no built-in route; it does not make PHP first-class. A custom entry overrides built-in routing for that extension but does not bypass executable validation.

## Pool ownership

`packages/octocode-native/crates/engine/src/lsp/pool.rs` owns the complete pool lifecycle. One key identifies the server command, arguments, workspace, initialization options, and effective environment.

- Concurrent starts and health checks deduplicate.
- Active requests prevent idle shutdown.
- Successful use renews idle expiry and drives least-recently-used eviction.
- Clearing a key invalidates pending starts and waiters; late completions cannot publish stale clients.
- The sampled resident memory of all pooled servers together has a budget (`LspPoolOptions::max_resident_bytes`, the default per-server cap). While the total is over it, the pool stops idle least-recently-used servers; it never stops the server being acquired or a busy one, and overflows instead.
- Failed health checks evict the client so the next acquisition starts a replacement.
- A live client whose readiness wait ended in `timeout` stays pooled (it keeps indexing); the next acquisition waits for readiness again, so the stored `timeout` never fails every later call.
- Runtime shutdown stops every client and joins owned work.

Long-lived MCP sessions reuse warm servers. The CLI shares them through `octocode serve`: the first `lspSearch` call of a workspace starts a detached server behind a private Unix socket in `<octocode home>/run`, and later calls send their query there. The server is keyed by binary build, working directory, every env name the config contract binds plus the `OCTOCODE_*`/`GITHUB_*`/`GH_*` variables, and config file versions, so a call under different settings never reaches a server holding old ones. It exits after 10 minutes idle; with `storage.mode = memory`, on Windows, or when the socket cannot be reached, the call runs in process.

## Resource containment

Language-server frames, writes, notifications, stderr, cancellation, and process teardown are bounded. Spawned servers run under a child-memory cap: a quarter of host RAM, between 4 and 8 GiB by default. The `lsp.maxMemoryMb` setting (`OCTOCODE_LSP_MAX_MEMORY_MB`) or a `maxMemoryMb` entry in `lsp-servers.json` overrides it; `0` disables it. No tool input reaches it. The cap bounds memory the server tree uses, not address space it only reserves. On macOS and Linux an RSS watchdog samples the resident memory of the server and all its descendants every 2 s; over the cap it fails the connection with a typed `ResourceExhausted` error (`language server exceeded memory cap (… MiB resident > … MiB)`) and SIGKILLs the whole tree. The pool then replaces the server on the next acquisition. `lspSearch` reports it as a final `serverCrashed` row (not retryable) that leads to an unverified text search of the symbol. Windows keeps a Job Object with `JOB_OBJECT_LIMIT_JOB_MEMORY` (committed memory) and kill-on-close behavior. Other Unix targets have no watchdog and apply `RLIMIT_AS` before `exec` as their only bound.

`RLIMIT_AS` is not used on macOS or Linux. It limits reserved virtual address space, and servers reserve far more than they touch: a JVM (jdtls) reserves its maximum heap (a quarter of host RAM by default) plus class space and code cache, V8 reserves WebAssembly memory cages, and Go and glibc reserve arenas. A 4 GiB address-space cap stops such servers from starting on large hosts while they use a fraction of it. On macOS it cannot be lowered at all (Darwin processes inherit virtual mappings that exceed the cap before `exec`, so `pre_exec` fails every spawn with `EINVAL`).

Teardown sweeps the server's process group while the leader is still unreaped: `stop` waits for the leader's exit with `waitid(WNOWAIT)`, signals the group, and reaps the leader last. The unreaped leader keeps its pid, which is also the group id, reserved, so the sweep can never reach an unrelated process that received a recycled pid.

Availability probes (for example `rust-analyzer --version`, which a rustup proxy may turn into a toolchain install) are bounded at 3 s. On timeout the probe's process group **and** every descendant found through parent links are frozen and SIGKILLed, so a child that called `setsid` does not escape.

### Verifying Linux-only paths

The `/proc` parsing and tree walk in `lsp/process_tree.rs` are platform-independent and unit-tested on every host against a synthetic `/proc` directory (hostile `comm` fields, vanished and zombie pids, cycles, deep and oversized trees); only the `/proc` path and `sysconf` call are Linux-gated. The Linux `cfg` code itself (the `/proc` readers, the watchdog, their tests) can be compile- and lint-checked from macOS with [`cargo-zigbuild`](https://github.com/rust-cross/cargo-zigbuild) and zig, no extra C flags needed:

```sh
rustup target add aarch64-unknown-linux-gnu
cargo-zigbuild clippy -p octocode-engine --all-targets --all-features --target aarch64-unknown-linux-gnu -- -D warnings
cargo-zigbuild test -p octocode-engine --all-features --target aarch64-unknown-linux-gnu --lib --no-run
cargo-zigbuild clippy -p octocode-native --no-default-features --all-targets --target aarch64-unknown-linux-gnu -- -D warnings
```

Running the Linux tests (kernel `/proc`, address-space reservations past the cap, the RSS watchdog, SIGSTOP/SIGKILL of a `setsid` grandchild) still needs a real Linux kernel; run `cargo test -p octocode-engine --all-features` on a Linux host (CI does not run Rust).

`start` and `stop` take the client's locks in one order (`child` → `connection` → `stderr_task`) and hold `child` throughout, so a `stop` that overlaps a `start` waits for it and then shuts down the server it published.

## Readiness and diagnostics

Timed-out and dropped requests emit `$/cancelRequest` when possible. One request that uses its whole 30 s timeout is cancelled and the server is kept. The connection is retired (and the pool starts a replacement on the next acquisition) on a second consecutive timeout with no answered request between, or when the cancel cannot be written.

Progress-aware servers must reach a full quiet interval before readiness is confirmed. New progress restarts that interval. Servers without progress use a bounded settle state (2 s at startup), which does not prove indexing completion. A first `didOpen` waits a short settle (400 ms) for a project load the open starts; it is skipped when the startup wait already confirmed the project load (`progressIdle`), and only progress already under way is drained. Empty results with unconfirmed readiness remain partial.

Pull-capable servers use `textDocument/diagnostic`. Push diagnostics are retained in a bounded per-document cache; content updates clear stale entries, versions reject older publications, and notifications for another document cannot satisfy a waiter.

Semantic results are sorted and deduplicated before pagination. Continuations bind to the query, server identity, workspace/configuration fingerprints, and result snapshot. A changed result set produces a restart rather than combining pages from different semantic states.

## Rust context

The public `rustContext` fields map natively to rust-analyzer initialization options. They control Cargo features, default features, target, cfg values, build scripts, and procedural macros. Procedural macros require build scripts. Enabling either permits workspace code execution by rust-analyzer; Octocode does not sandbox that execution.

Effective Rust context participates in pool and continuation identity, so clients with different build configurations cannot share semantic state.
