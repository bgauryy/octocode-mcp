# Publishing `@octocodeai/octocode-native`

This package owns one distribution for three artifacts on six platforms:

- the native CLI (binary file `octocode`; npm bin `octocode-native`, so the `octocode` command stays the launcher's);
- `octocode-regex-worker`;
- `NativeRuntime` addon exposed by `.` and `./runtime`.

Five internal Rust crates compile into the same three artifacts; no Rust crate is published to a Cargo registry.

## Package map

```text
packages/octocode-native/
├── Cargo.toml
├── crates/runtime/             pure runtime library
├── crates/cli/                 CLI and regex worker
├── crates/runtime-napi/        runtime Node adapter
├── crates/github/              GitHub protocol services
├── crates/engine/              reusable primitives (Rust library)
├── js/                         runtime loader/types
├── bin/                        Node launchers
├── npm/<platform>/             three release artifacts per platform
├── scripts/                    build, copy, size, and version checks
└── package.json
```

Supported platform suffixes are:

| Suffix | Rust target |
|---|---|
| `darwin-arm64` | `aarch64-apple-darwin` |
| `darwin-x64` | `x86_64-apple-darwin` |
| `linux-arm64-gnu` | `aarch64-unknown-linux-gnu` |
| `linux-x64-gnu` | `x86_64-unknown-linux-gnu` |
| `linux-x64-musl` | `x86_64-unknown-linux-musl` |
| `win32-x64-msvc` | `x86_64-pc-windows-msvc` |

## Build

For the current host during development:

```sh
yarn workspace @octocodeai/octocode-native build:dev
```

Every build script runs `scripts/build-native.cjs`. It builds both host crates
in one Cargo invocation, then stages atomically: CLI binaries and the runtime
addon into `npm/<platform>/`, the addon also into the package root. `build` is
the same in release mode.

For one release target:

```sh
yarn workspace @octocodeai/octocode-native build:target darwin-arm64
```

The platform argument is one of `darwin-arm64`, `darwin-x64`, `linux-arm64-gnu`, `linux-x64-gnu`, `linux-x64-musl`, `win32-x64-msvc`.

For a complete release matrix (platforms build concurrently, each in
`target/platforms/<platform>/`; Linux targets cross-link with cargo-zigbuild and
Windows with cargo-xwin, mirroring napi's `--cross-compile`):

```sh
yarn workspace @octocodeai/octocode-native build:all
```

`build:target <platform>` produces and stages all three artifacts using the committed lockfile. The internal runtime adapter library is named `octocode_runtime_napi`; staging preserves the published `octocode-native.<platform>.node` filename. Darwin staging replaces linker-generated ad-hoc addon signatures with fresh ad-hoc signatures. When the target matches the host, staging loads the addon and runs the CLI in a subprocess immediately.

Cross-target presence is not runtime proof. CI builds no native artifacts; runtime proof is `npm/<platform>/octocode --version` (it must print the package version) run on a machine of that platform.

## Version contract

The coordinator, all six platform packages, and all five internal Rust crates use one version. Rust crates inherit `workspace.package.version`; Cargo metadata supplies the membership and resolved versions for validation.

Bump the version before building release artifacts: `version` in `package.json` and every `npm/*/package.json`, the exact `optionalDependencies` pins, and `workspace.package.version` in `Cargo.toml`; then `cargo metadata --offline` updates `Cargo.lock` without regenerating it. A binary built before the bump reports the old version, so build after it. Do not hand-publish mixed root/platform versions: exact optional dependencies intentionally turn a mismatch into a loader failure rather than silently selecting another ABI.

## Preflight

From the repository root:

```sh
node skills-dev/octocode-dev/scripts/prepublish.mjs
yarn workspace @octocodeai/octocode-native verify
npm pack --dry-run --workspace @octocodeai/octocode-native
```

Required evidence:

- Rust formatting, clippy, type checks, and tests pass (including GitHub protocol, CLI, and runtime adapter tests);
- Node runtime tests pass;
- all 18 artifacts exist;
- the host addon loads;
- each staged `npm/<platform>/octocode --version` prints the package version on its matching runner;
- dry-run tarballs contain only intended release files.

The generated-contract provenance test also requires a clean, current Core source receipt. Do not regenerate a provenance receipt merely to hide a dirty source tree.

## Publish order

Use a prerelease version and dist-tag first.

1. Publish all six platform packages.
2. Publish `@octocodeai/octocode-native` at the exact same version.
3. Install from the registry in clean platform-specific jobs.
4. Publish canary CLI and MCP consumers with exact native dependencies.
5. Promote platform packages, then the root package, then consumers.

Example platform loop after all platform artifacts have been collected and verified:

```sh
for platform in darwin-arm64 darwin-x64 linux-arm64-gnu linux-x64-gnu linux-x64-musl win32-x64-msvc; do
  npm publish "packages/octocode-native/npm/$platform" --access public --tag next
done
npm publish packages/octocode-native --access public --tag next
```

Platform packages have no `prepublishOnly` hook; check the staged binaries yourself before publishing.

## Registry acceptance

On every supported platform, install from the registry rather than from the workspace and verify:

```sh
node -e "const n=require('@octocodeai/octocode-native/runtime'); const r=new n.NativeRuntime(); console.log(r.abiVersion); r.close()"
npx @octocodeai/octocode-native@next --version
npx @octocodeai/octocode-native@next catalog
```

Also start the packaged regex worker and run direct CLI, Node launcher, and real stdio MCP smoke paths.

## Rollback

npm artifacts are immutable. Record previous dist-tags before promotion. If a canary fails, leave `latest` unchanged and publish a corrected prerelease. If a promoted release fails, first restore consumer dist-tags, then restore the native root and platform tags where dependency constraints permit. Keep failed artifacts available for reproduction.

Pre-consolidation `@octocodeai/octocode-engine` versions remain on npm for old consumers, but this repository no longer publishes that package or any engine addon.
