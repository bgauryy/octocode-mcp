# Octocode CLI architecture

`octocode` is the public Node launcher, installer, and interactive management package. All public tool execution is owned by the Rust runtime in [`../octocode-native`](../octocode-native).

## Runtime boundary

`src/cli/index.ts` delegates research commands, `schema`, and bare pipe invocation to the native binary, which owns catalog presentation, parsing, help, and validation. The launcher retains skill materialization, its package version display, and the bare TTY install picker. `config view` starts the bundled local server with a fixed native JSON transport. `src/cli/native-delegate.ts` resolves the platform binary through `@octocodeai/octocode-native/bin/resolve-binary.cjs` and runs it with inherited stdio and environment, forwarding signals through the native package's `bin/launch-native.cjs`. The `OCTOCODE_NATIVE_BIN` override is a development aid that, like MCP's `OCTOCODE_NATIVE_BINDING`, is ignored in production. There is no TypeScript execution registry or fallback for native-owned commands.

```text
npx octocode → Node launcher → native CLI → Rust ToolRuntime
```

The native path is mandatory for public tools. If its platform package cannot be resolved, the launcher fails closed with the resolver's own message (for example the missing platform package and its `npm install` fix). A binary that cannot start, a missing runtime and a Node crash all report as an execution failure, exit `5`: with `--json`, the native `{error, errorCode}` envelope on stdout, else text on stderr. Rust owns contract validation, availability, security, GitHub and artifact providers, local/AST/LSP behavior, bulk orchestration, pagination, response shaping, cancellation, and exit classification. `@octocodeai/octocode-core` authors public schemas and instructions; the CLI reads them through `@octocodeai/config` (`./schema`, `./mcp`), never from core directly.

## TypeScript management surface

TypeScript remains only for:

- `--version`, which prints the launcher's package version;
- `config view`, which lazily loads `src/cli/config-view/server.ts`; fixed native `config --manage` requests carry the expected contract fingerprint before any mutation;
- `skill`, backed by the shared skill installer; its env readiness asks native `config check` for a GitHub token stored outside the environment;
- the TTY picker for `install` without `--ide`, which discovers client ids from `native install --list --json` and delegates the selected id back to native.

Everything else—`config` (except `view`), `auth`, `lsp-server`, tool invocations (`<toolName> '<json>'`), and non-interactive `install`—is delegated to the native CLI. Interactive installation is a transport adapter, not a second installer. The native `skill` command shells back to this launcher; `OCTOCODE_SKILL_DELEGATED` guards that hop so a native binary on PATH cannot recurse.

## Build and packaging

- `build.mjs` bundles `src/index.ts` to `out/octocode.js` as an ESM launcher.
- `@octocodeai/octocode-native` is a runtime dependency; its optional platform packages supply the native binary and N-API addon.
- `@octocodeai/config` (a private workspace package) and `@octocodeai/octocode-core` are bundled at build time and supply public contracts and instructions; the skill installer is inlined the same way. Core is bundled rather than external because esbuild code splitting cannot link named imports through config's `export *` from an external module.
- `src/cli/config-view/` holds the temporary authenticated loopback server; its browser assets (`assets/`) are inlined as strings through `?raw` imports (Vite in tests, the `raw-text` esbuild plugin in `build.mjs`). Native owns paths, field policy, secret redaction, agent adapters, and file writes.
- The build fails when a bare external import is not declared.
- `__APP_VERSION__` is injected from `package.json`.

Publish native platform packages, the native root, contract/config prerequisites, and then this launcher. Exercise the built Node launcher against the packaged native binary before publishing.

## Rules

- Public tool behavior belongs in Rust.
- Public contract content belongs in core. Native `schema` joins the generated,
  embedded presentation with native availability.
- The Node launcher delegates or fails closed; it has no TypeScript tool fallback.
- Keep management-only TypeScript paths explicit and small.
- Do not add Node-side query batching, provider behavior, security policy, response shaping, or tool-specific error recovery.
- Validate both the direct native CLI and the built Node launcher, including CLI/MCP structured-result parity.

Global `.env` mutation (`config set KEY VALUE` or `config set KEY --stdin`) is native: it uses the native config module’s shared parser and protection policy, prints only mutation metadata, and replaces the file atomically under a lock.
