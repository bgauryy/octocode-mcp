# Native Rust dependency audit

Every direct dependency of the native crates and the job it owns. A passing unused-dependency scan does not prove that a dependency is needed, so each row names its job. Add a row when you add a dependency, and remove the row with it.

## Engine (`crates/engine`)

| Dependency | Owned job |
|---|---|
| `aho-corasick` | Literal prescans for secret detection and search classification |
| `ast-grep-core`, `ast-grep-config` | `astRewrite` matching, metavariables, replacement, and YAML rule documents |
| `grep-matcher`, `grep-regex`, `grep-pcre2`, `grep-searcher` | In-process text search: the Rust-regex lane, the opt-in PCRE2 lane (`regex:"pcre2"`), and per-file searching |
| `ignore` | Gitignore-aware traversal (the local walk policy) |
| `moka` | Bounded in-memory caches: parsed graph facts and language-server responses |
| `oxc_allocator`, `oxc_ast`, `oxc_ast_visit`, `oxc_parser`, `oxc_semantic`, `oxc_span` | JavaScript/TypeScript parsing, symbols, references, calls, and graph facts; complements Tree-sitter |
| `rayon` | Bounded parallel file scans |
| `regex`, `regex-syntax` | General matching and pre-validation of Rust-regex patterns |
| `serde`, `serde_json`, `serde_yaml_ng` | Typed DTOs, LSP and graph JSON, and YAML rule documents (not YAML source parsing) |
| `sha2`, `hex` | Content digests |
| `tokio` | Language-server processes, I/O, timeouts, and synchronization |
| `tree-sitter` and the grammars `-asm`, `-c`, `-c-sharp`, `-cpp`, `-go`, `-java`, `-javascript`, `-python`, `-rust`, `-scala`, `-typescript` | The parser API and the 11 first-class grammar families in the default build. Assembly, C++, C#, and Scala are optional dependencies that the default `portable-default` feature enables |
| `tree-sitter-cuda` | Optional CUDA grammar, outside `portable-default` (see [Footprint](#footprint-interpretation)) |
| `url` | LSP and file-URI handling |
| `which` | Language-server executable discovery |
| `libc` (Unix), `windows-sys` (Windows) | Language-server memory limits, process groups, and module paths |
| `criterion`, `proptest`, `tempfile` (development) | Benchmarks, property tests, and filesystem fixtures |

## Runtime (`crates/runtime`)

| Dependency | Owned job |
|---|---|
| `serde`, `serde_json`, `serde_yaml_ng`, `toml` | Contracts, configuration, provider payloads, rewrite rules, manifests, and output |
| `regex`, `regress` | Native patterns; `regress` runs the ECMAScript patterns of the generated contract types |
| `url` | Provider endpoint and URI validation |
| `base64`, `sha2`, `hex`, `getrandom` | Encodings, hashes, snapshots, receipts, and random nonces |
| `aes-gcm` | Encrypted home credential files |
| `reqwest`, `bytes`, `futures-util` | Bounded HTTP providers and streaming responses |
| `secrecy`, `keyring-core` | Credential secrecy and the platform credential-store abstraction |
| `ignore`, `globset` | Local scopes and path filters for GitHub trees and history |
| `semver` | Registry version ranges in `artifactSearch` |
| `flate2` | Release-archive reading in `artifactSearch` |
| `html5ever` | Text extraction from captured URL sources |
| `imagesize` | Dimensions of captured PNG and JPEG images |
| `octocode-io`, `octocode-engine`, `octocode-github` | Internal crates; the engine with its default features |
| `tokio`, `tokio-util` | Runtime lifecycle, cancellation, signals, and asynchronous tools |
| `libc` (Unix) | Process-group and low-level lifecycle controls |
| `apple-native-keyring-store` (macOS), `zbus-secret-service-keyring-store` (Linux), `windows-native-keyring-store` (Windows) | OS credential stores |
| `windows-sys` (Windows) | File-handle confinement and job-object process controls |
| `hyper`, `hyper-util`, `bitflags`, `fastrand`, `slab` (optional, `dev-unify` feature) | Unify development feature sets; `node skills-dev/octocode-dev/scripts/dev.mjs check:dev-unify` verifies they still do |
| `tempfile`, `wiremock` (development) | Filesystem and provider integration tests |

## Other crates

- `octocode-github`: GitHub transport (`reqwest`, `bytes`, `futures-util`, `tokio`, `tokio-util`), URL, encoding and hash helpers, `secrecy`, and payload serialization. Configuration, credential discovery, and keyrings stay in the runtime.
- `octocode-io`: `reqwest` client policy, `getrandom`, `hex`, `libc`, and `tokio`.
- `octocode-cli`: `clap` for arguments, `flate2` and `zip` for managed language-server installs, `reqwest` for their downloads.
- `octocode-runtime-napi`: `napi`, `napi-derive`, and `napi-build`. No other crate depends on N-API.

## Footprint interpretation

A same-source, same-profile N-API ablation on Darwin ARM64 (2026-09-20, release profile, stripped) measured the addon at 27,877,344 bytes without Assembly and CUDA. Enabling only Assembly added 16,528 bytes (+0.06%); enabling only CUDA added 7,116,704 bytes (+6.787 MiB, +25.53%). That cost for one niche language is why CUDA is outside `portable-default`; `.cu`/`.cuh` files still route to `clangd` for LSP. These are shipped-artifact sizes, not source or build-cache sizes.

## Duplicate versions

`cargo tree --workspace --all-features --duplicates` lists the version splits. They are transitive (for example `core-foundation` 0.9 and 0.10, `syn` 2 and 3) and no Tree-sitter grammar is duplicated; pinning cannot collapse them without patching upstream crates.
