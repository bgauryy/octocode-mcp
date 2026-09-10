# Octocode extension Rust primitives

Dedicated native package for `@octocodeai/pi-extension` and Awareness file operations. This package is independent
of `octocode-engine`, which owns Octocode research tools. It ports the relevant
descriptor-relative filesystem algorithms from the MIT-licensed local
`octocode-agent/packages/octocode-agent-core-rust/src/fs_service.rs` into N-API
workers; it does not depend on that host or its service protocol.

Native ownership includes bounded read/hash snapshots, identity preconditions,
descriptor-relative mutation, synchronization, cancellation, and line diff.
Awareness adds bounded, asynchronous v1 file fingerprints; history restores share
the snapshot and mutation implementation and preserve committed receipts when a
follow-up observation fails.
Private history Git objects use native streaming zlib reads with compressed and
decoded byte ceilings, deadline/cancellation checks, exact framing and SHA-1
validation. isomorphic-git still serializes writes, which publish through native
private file replacement and explicit flush barriers.
TypeScript owns path authorization/canonicalization, schemas, edit matching,
newline preservation, preflight planning, context, tools, and UI.

```sh
yarn workspace @octocodeai/octocode-extension-rust build
yarn workspace @octocodeai/octocode-extension-rust verify
```

`build` produces an optimized host addon; `build:dev` produces a debug addon.
Published installs select an exact-version prebuilt optional package; they do not
need Cargo or run a source-build fallback. The supported targets match the tools
engine:

| OS | Architecture | Runtime |
| --- | --- | --- |
| macOS | arm64, x64 | Darwin |
| Linux | x64 | glibc, musl |
| Linux | arm64 | glibc |
| Windows | x64 | MSVC |

`platforms.cjs` owns the target table used by the loader, builds, metadata and
release checks. `build:all` stages all six platform packages. Cross-compiling
Linux requires Zig and cargo-zigbuild; cross-compiling Windows requires cargo-xwin.
Apple targets require macOS and the Apple SDK. Install the matching Rust targets
with rustup before cross-building. `platforms:check` verifies binary architecture,
exact versions and tarball contents. `version:sync` updates generated metadata.

The dedicated Extension Rust workflow executes Rust and N-API tests, including
installation of actual package tarballs without a Rust runtime dependency, on
all six target runtimes. Local cross-build success alone is not runtime evidence.
Windows uses handle-relative NT operations and ACLs; explicit private mode 0600
creates a protected owner/SYSTEM DACL. Its receipts report `durable: false` because
portable directory-entry persistence cannot be guaranteed there.

Bundlers must keep this package external and deploy it with its matching addon.
Inlining its native loader into a relocated JavaScript bundle loses the binary's
package-relative location. Pi's production TypeScript build uses the installed
package directly; the worker subprocess test preserves that same boundary.

See [architecture and limits](ARCHITECTURE.md) and the public [types](index.d.ts).
