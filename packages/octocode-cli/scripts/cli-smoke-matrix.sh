#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

run() {
  echo ""
  echo ">>> $*"
  "$@"
}

run_expect_fail() {
  echo ""
  echo ">>> (expect fail) $*"
  if "$@"; then
    echo "Expected command to fail, but it succeeded"
    exit 1
  fi
}

run yarn lint
run yarn build:dev

run node out/octocode-cli.js --help
run node out/octocode-cli.js skills --help
run node out/octocode-cli.js mcp --help

run node out/octocode-cli.js skills list
run node out/octocode-cli.js skills install --skill octocode-plan --targets opencode --mode copy --force
run node out/octocode-cli.js skills remove --skill octocode-plan --targets opencode
run_expect_fail node out/octocode-cli.js skills install --skill octocode-plan --mode invalid

run node out/octocode-cli.js mcp list --search browser
run node out/octocode-cli.js mcp status --client opencode
run node out/octocode-cli.js mcp install --id playwright-mcp --client opencode --force
run node out/octocode-cli.js mcp remove --id playwright-mcp --client opencode
run_expect_fail node out/octocode-cli.js mcp install --id missing-mcp-id --client opencode

echo ""
echo "CLI smoke matrix completed successfully"
