#!/usr/bin/env bash
# Copy the local MCP build into <dest> so another session's rebuild can't swap or delete it
# mid-campaign: the MCP bundle, and next to it every package that carries the tool contract
# (native with its addon, config, core: descriptions and instructions come from core).
# Node resolves those from <dest>/node_modules first; every other dependency still resolves
# from the repo's root node_modules. Prints the command that runs the snapshot.
#
#   snapshot_build.sh <dest>
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../../.." && pwd)"
mkdir -p "$1"; SNAP="$(cd "$1" && pwd)"
if [ ! -f "$SNAP/octocode-mcp/dist/index.js" ]; then
  PLATFORM="$(node -p 'process.platform+"-"+process.arch')"
  NATIVE="$REPO/packages/octocode-native"
  ADDON="$(ls "$NATIVE"/npm/*/octocode-native.*.node 2>/dev/null | grep "$PLATFORM" | head -1)"
  [ -n "$ADDON" ] || { echo "native addon missing (a build in progress?): rebuild, then retry" >&2; exit 2; }
  mkdir -p "$SNAP/octocode-mcp" "$SNAP/node_modules/@octocodeai/octocode-native"
  cp -R "$REPO/packages/octocode-mcp/dist" "$REPO/packages/octocode-mcp/package.json" "$SNAP/octocode-mcp/"
  cp -R "$NATIVE/js" "$NATIVE/bin" "$NATIVE/package.json" "$SNAP/node_modules/@octocodeai/octocode-native/"
  cp "$ADDON" "$SNAP/node_modules/@octocodeai/octocode-native/"
  CONFIG="$REPO/packages/octocode-config"
  CORE="$(cd "$REPO/node_modules/@octocodeai/octocode-core" && pwd -P)"
  mkdir -p "$SNAP/node_modules/@octocodeai/config" "$SNAP/node_modules/@octocodeai/octocode-core"
  cp -R "$CONFIG/dist" "$CONFIG/contract" "$CONFIG/package.json" "$SNAP/node_modules/@octocodeai/config/"
  cp -R "$CORE/dist" "$CORE/package.json" "$SNAP/node_modules/@octocodeai/octocode-core/"
  # LSP discovery walks addon install ancestors; freeze its bundled TS server too.
  TSGO="$REPO/node_modules/@typescript/native-preview-$PLATFORM"
  [ -d "$TSGO" ] || { echo "bundled TypeScript LSP missing: $PLATFORM" >&2; exit 2; }
  mkdir -p "$SNAP/node_modules/@typescript"
  cp -R "$(cd "$TSGO" && pwd -P)" "$SNAP/node_modules/@typescript/native-preview-$PLATFORM"
  { shasum -a 256 "$ADDON" "$REPO/packages/octocode-mcp/dist/index.js"; git -C "$REPO" rev-parse HEAD; } > "$SNAP/fingerprint.txt"
  shasum -a 256 "$SNAP/node_modules/@typescript/native-preview-$PLATFORM/lib/tsgo"* >> "$SNAP/fingerprint.txt"
  for module in @octocodeai/octocode-native/runtime @octocodeai/config @octocodeai/octocode-core/mcp; do
    resolved="$(cd "$SNAP/octocode-mcp/dist" && node --input-type=module -e "console.log(import.meta.resolve('$module'))")"
    case "$resolved" in "file://$SNAP"/*) ;; *) echo "snapshot not used for $module ($resolved)" >&2; exit 2 ;; esac
  done
fi
echo "node $SNAP/octocode-mcp/dist/index.js"
