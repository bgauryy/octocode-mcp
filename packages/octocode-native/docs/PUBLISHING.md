# Publishing `@octocodeai/octocode-native`

This package ships two artifacts on every platform in `bin/platform.cjs` (`PLATFORMS`):

- the native CLI (file `octocode`, `octocode.exe` on Windows; npm bin `octocode-native`, so the `octocode` command stays the launcher's);
- the `NativeRuntime` addon (`octocode-native.<platform>.node`), exposed by `.` and `./runtime`.

The six internal Rust crates compile into those two artifacts; none is published to a Cargo registry. Release order, version bumps, and gates for the whole release line: [release guide](../../../skills-dev/octocode-dev/docs/RELEASE.md).

## Platforms

| Suffix | Rust target |
|---|---|
| `darwin-arm64` | `aarch64-apple-darwin` |
| `darwin-x64` | `x86_64-apple-darwin` |
| `linux-arm64-gnu` | `aarch64-unknown-linux-gnu` |
| `linux-x64-gnu` | `x86_64-unknown-linux-gnu` |
| `linux-x64-musl` | `x86_64-unknown-linux-musl` |
| `win32-arm64-msvc` | `aarch64-pc-windows-msvc` |
| `win32-x64-msvc` | `x86_64-pc-windows-msvc` |

## Build

```sh
yarn workspace @octocodeai/octocode-native build:dev                  # host, dev profile
yarn workspace @octocodeai/octocode-native build                      # host, release profile
yarn workspace @octocodeai/octocode-native build:target darwin-arm64  # one platform, release
yarn workspace @octocodeai/octocode-native build:all                  # every platform, concurrently (--jobs N)
yarn workspace @octocodeai/octocode-native check:target win32-x64-msvc  # one platform, type-check only
```

`check:target <platform>` (or `node scripts/build-native.cjs --check --all`) type-checks the same selection through the same cross tool, C build scripts included, and neither links nor stages. Use it while editing platform-specific code (`cfg(windows)`, `cfg(target_os = "linux")`): after a runtime edit it takes about 10s, a release target build about 40s (Apple Silicon host, warm `target/platforms/<platform>/`). CI's `native-platforms` job runs the same check for every platform: darwin on a macOS runner (Apple SDK), the rest on Linux.

Every script runs `scripts/build-native.cjs`, which builds both host crates (`octocode-cli`, `octocode-runtime-napi`) in one Cargo invocation with the committed lockfile, then stages atomically: the binary and the addon into `npm/<platform>/`, and the host addon also into the package root, where the local launcher and MCP server load it. Staging replaces each file's inode instead of overwriting it in place, so a running MCP server that has the addon mapped does not crash. Target builds use `target/platforms/<platform>/`; Linux targets cross-link with cargo-zigbuild and zig, Windows with cargo-xwin. Cross-linked gnu targets link against glibc 2.28, Node 24's own floor (`GLIBC_FLOOR` in the script), so the addon loads wherever Node does. Check the floor with `llvm-readelf -V npm/<platform>/octocode`: no `GLIBC_` version above 2.28. A native Linux build links the host's glibc instead. The internal library `octocode_runtime_napi` is staged as `octocode-native.<platform>.node`. Darwin staging re-signs the addon ad hoc. When the target is the host, staging loads the addon and runs the binary in a subprocess.

A cross-built artifact is not runtime proof. CI builds no native artifacts; on a machine of each platform, `npm/<platform>/octocode --version` must print the package version.

## Version

The root package, the platform packages, and the Rust workspace (`workspace.package.version` in `Cargo.toml`) share one version, and the root pins each platform package exactly in `optionalDependencies`, so a mismatch fails to load instead of selecting another ABI. Bump and build in the order the [release guide](../../../skills-dev/octocode-dev/docs/RELEASE.md#before-row-2) gives: a binary built before the bump reports the old version.

## Preflight

From the repository root:

```sh
node skills-dev/octocode-dev/scripts/prepublish.mjs
yarn workspace @octocodeai/octocode-native verify
npm pack --dry-run --workspace @octocodeai/octocode-native
```

Before publishing, confirm that all 12 artifacts exist, the host addon loads, each staged binary prints the package version on its own platform, and the dry-run tarballs hold only release files. Platform packages have no `prepublishOnly` hook. The generated-contract provenance test needs a clean, current Core source receipt; never regenerate it to hide a dirty source tree.

## Canary and promotion

Publish a prerelease under a dist-tag first: the platform packages, then the root at the same version, then the consumers.

```sh
for platform in darwin-arm64 darwin-x64 linux-arm64-gnu linux-x64-gnu linux-x64-musl win32-arm64-msvc win32-x64-msvc; do
  npm publish "packages/octocode-native/npm/$platform" --access public --tag next
done
npm publish packages/octocode-native --access public --tag next
```

On every platform, install from the registry, not the workspace, and check:

```sh
node -e "const n=require('@octocodeai/octocode-native/runtime'); const r=new n.NativeRuntime(); console.log(r.abiVersion); r.close()"
npx @octocodeai/octocode-native@next --version
npx @octocodeai/octocode-native@next schema
```

Also run the Node launcher and a real stdio MCP call. Then promote the platform packages, the root, and the consumers, in that order.

## Rollback

npm artifacts are immutable. Record the dist-tags before promotion. If a canary fails, leave `latest` unchanged and publish a corrected prerelease. If a promoted release fails, restore the consumers' dist-tags first, then the root and platform tags where the exact pins allow. Keep failed artifacts for reproduction.
