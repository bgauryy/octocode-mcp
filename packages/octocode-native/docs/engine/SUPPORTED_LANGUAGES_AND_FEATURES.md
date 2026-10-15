# Supported languages and features

Which languages each native capability covers. Tool fields and behavior are in the [tools reference](../../../../docs/OCTOCODE_TOOLS.md); which evidence to choose is in [Text, AST, graph, and LSP](../../../../docs/OCTOCODE_TOOLS.md#text-ast-graph-and-lsp-choose-the-evidence-you-need). The shipped build prints its grammar inventory:

```bash
npx octocode schema | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).grammars))"
```

## Language matrix

The default build registers **28 extensions in 11 language families**, from one registry (`crates/engine/src/signatures/languages.rs`; the expected set is asserted in `languages_tests.rs`). Structural match, syntax trees, symbols, signatures, graph facts, and LSP grammar adapters all derive from it. Built-in language-server routes are a separate table (`crates/engine/src/lsp/config.rs`) covering **27 extensions**: Assembly has no route, and CUDA routes to `clangd` without a grammar.

| Language | Extensions | Native AST (match, tree, symbols, rewrite) | Cross-file graph links | Built-in LSP route |
|---|---|---|---|---|
| C | `c` `h` | Yes; `.h` defaults to C (see [C++ headers](#c-headers)) | Quoted relative includes | `clangd` |
| C++ | `cc` `cpp` `cxx` `hh` `hpp` `hxx` | Yes | Quoted relative includes | `clangd` |
| CUDA *(optional grammar)* | `cu` `cuh` | Only with `tree-sitter-cuda`; absent from the default build | Quoted relative includes, only with the grammar | `clangd` |
| Assembly | `asm` `assembly` `s` | Yes; symbols are labels and directives | None | Custom server only |
| C# | `cs` | Yes | None | `csharp-ls` |
| Go | `go` | Yes | None | `gopls` |
| Java | `java` | Yes | None | `jdtls` |
| Python | `py` `pyi` | Yes | Bounded absolute and relative modules | `basedpyright-langserver`, else `pyright-langserver`, else `pylsp` |
| Rust | `rs` | Yes | Modules; optional Cargo metadata | `rust-analyzer` |
| Scala | `sc` `sbt` `scala` | Yes | None | `metals` |
| JavaScript | `js` `jsx` `mjs` `cjs` | Yes | ESM and binding-safe CommonJS | `typescript-language-server` |
| TypeScript | `ts` `tsx` `mts` `cts` | Yes | ESM and binding-safe CommonJS | `tsgo`, else `typescript-language-server` |

`astTopology` (file links) is beta and CLI-only, and `astRewrite` is parked in this build; the matrix lists what their engine supports. A grammar does not install or guarantee a language server. Tree-sitter owns structural matching for every language, JS/TS included; OXC adds JS/TS symbols, in-file references, calls, and graph facts. Uppercase `.S` normalizes to `.s`.

Languages with no native grammar (Kotlin, PHP, CSS, HTML, JSON, TOML, YAML, Ruby, Swift, Shell, SQL, Lua, Zig, Vue, Svelte, Dart, and others) get a typed unsupported result from grammar-dependent operations; no other parser is substituted. Text search, reads, GitHub and history tools, `artifactSearch`, minification, and custom LSP routes work for any language.

### C++ headers

`.h` selects C. `astSearch match` with `language:"cpp"` parses `.h` files as C++ for a file or a directory; tree and symbols accept that override for a single file. For directory `symbols` and `astTopology`, pass `languageGlobs:{"cpp":["include/**/*.h"]}`: globs are relative to the scan root, win over the extension, carry into continuations, and report conflicting parser matches as skipped files. The override does not change clangd: for C++ header LSP, provide `compile_commands.json` or a `.clangd` fragment such as `If: { PathMatch: include/.*\.h }` with `CompileFlags: { Add: [-xc++] }` (`PathMatch` is a regular expression, not a glob).

### CUDA opt-in

`tree-sitter-cuda` is declared and locked. For one build, enable `--features octocode-engine/tree-sitter-cuda`; to ship it, add it to the engine's `portable-default` feature, update the expected set in `languages_tests.rs` and the counts here, and build and test all six platform packages. It costs about 6.8 MiB in the addon ([measurement](../DEPENDENCY_AUDIT.md#footprint-interpretation)).

## Structural matchers

`astSearch match` runs Octocode's own matcher (`crates/engine/src/structural/octo/`); `astRewrite` runs embedded ast-grep. Both read ast-grep pattern syntax over the same grammar registry, and `crates/engine/src/structural/parity_tests.rs` pins where they agree: single and multi metavariables (separators included in `$$$` captures), repeated captures, an empty `$$$` beside punctuation (`f($$$A, x)` matches `f(x)`), comments and trailing commas in candidates, `kind`, `regex`, `has`/`inside` (direct by default, any depth with `stopBy: end`), `all`/`any`/`not`, and UTF-16 columns. Differences:

- `astSearch` rule YAML accepts only `kind`, `pattern`, `regex`, `has`, `inside`, `all`, `any`, `not`, and `stopBy: end`; other ast-grep keys (`constraints`, `follows`, `precedes`, …) are rejected with the supported list.
- A statement pattern ending in `;` matches the expression anywhere in `astSearch` (span without `;`); ast-grep selects only that statement, `;` included.
- `$K: $V` selects object pairs in `astSearch`; ast-grep parses it as a labeled statement.
- A bare C call pattern (`foo($X)`) gets statement context in `astSearch`; ast-grep parses it as a declaration and selects nothing.
- A pattern with several top-level nodes (`a(); b()`) is rejected by both.
- Rewrite captures can include ast-grep's internal `secondary` node from relational rules.

C++ function patterns repair a narrow C++11 initializer-list ambiguity; C# member patterns get a synthetic class wrapper; Java method-call patterns get statement context. A search result never authorizes an apply: only an `astRewrite` preview's selection, snapshot, and hashes do.

## Signatures and graph facts

`localFetch minify:"symbols"` outlines every registered language with Tree-sitter body queries; Markdown has a heading fallback. Graph facts are syntax-derived and vary by language; an outline does not establish complete declaration or call extraction. Assembly exposes labels as declarations and claims no calls, containment, exports, or cross-file links.

Cross-file links cover JS/TS ESM and binding-safe CommonJS, Rust modules, bounded Python absolute and relative imports, and quoted relative C/C++/CUDA includes. Explicit relative `package.json` imports become bounded metadata leaves. CommonJS links need an unshadowed literal `require`, `module.require`, or `createRequire(import.meta.url)` binding; dynamic, shadowed, or reassigned loaders, Python wildcards, ambiguous package attributes and stub layouts stay coverage diagnostics. C/C++ system and macro includes are not linked. Other languages report unsupported linking rather than heuristic edges.

## Minification — file reads and search fragments

Minification is independent of grammar and LSP support. The engine configures **152 extensions** plus filename overrides; most entries strip comments and whitespace without a parser, JSON, Markdown, markup, and CSS have their own strategies, and Scala `.scala`, `.sc`, and `.sbt` share one. Output is the original input when the result is not smaller, processing fails, or the input exceeds 1 MiB, so a requested view does not prove which transformation ran. `crates/engine/src/minify/coverage_tests.rs` exercises every configured extension and filename override and checks that markers and string literals survive. View semantics and defaults per tool: [tools reference](../../../../docs/OCTOCODE_TOOLS.md#ghgetfilecontent).

## Language servers

Routing order, trust, provisioning, pooling, and memory caps are in [LSP_SERVER_LIFECYCLE.md](LSP_SERVER_LIFECYCLE.md). Managed installs (`npx octocode lsp-server install`) cover `rust-analyzer` and `clangd`; every other built-in route uses an installed executable. A custom `lsp-servers.json` entry adds or replaces a route for any extension. `documentSymbols` alone runs without a server (JS/TS native outlines and Markdown headings, labelled syntactic in `lsp.source`); every other operation needs a running server with the matching capability.

## Verify a build

Read the grammar inventory (above), then exercise the public path. Don't infer grammar support from an LSP route.

```bash
npx octocode astSearch '{"queries":[{"operation":"symbols","path":"src/file.ts"}]}'
npx octocode lspSearch '{"queries":[{"operation":"documentSymbols","path":"src/file.ts"}]}'
yarn workspace @octocodeai/octocode-native test:rust
yarn workspace @octocodeai/octocode-native test:node
```

Deterministic tests cover route resolution, uppercase extensions, unsupported file types, missing servers, startup failures, capabilities, readiness, cancellation, and pagination snapshots; they do not prove that an external server is installed or implements every operation.
