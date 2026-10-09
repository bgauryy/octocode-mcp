#!/usr/bin/env bash
# One isolated runner: a fresh headless `claude -p` for one (arm, pass, question). The arm
# decides which tools the agent gets; nothing else is loaded (no user/project settings,
# CLAUDE.md, skills, hooks, memory). The stream-json transcript is the measurement
# (transcript_to_log.py), identical for every arm.
#
#   run_arm.sh <campaign-dir> <arm> <pass> <Qn>
#
# Arms (brief in compare/arms/<arm>.md, shared brief compare/arms/runner.md):
#   mcp           Octocode MCP, clasify off       OCTO_MCP_CMD picks the server (default: local
#   mcp-clasify   Octocode MCP, clasify offered   build; e.g. "npx -y octocode-mcp@20.1.1")
#   mcp-<variant> Octocode MCP; clasify offered when the name contains "clasify".
#                 OCTO_MCP_CMD_<arm> (dashes as underscores) overrides OCTO_MCP_CMD
#   gh-lean       read-only gh + --json/--jq/--limit + text filters
#   gh            read-only gh, no filters
#   rtk           rtk gh …
#   headroom      ghc … (gh → Headroom compressor; needs HR_PY)
# Env: RUNNER_MODEL (default claude-sonnet-5-5), RUNNER_MAX_TURNS (default 60).
set -euo pipefail

CAMP="$(mkdir -p "$1" && cd "$1" && pwd)"; ARM="$2"; PASS="$3"; Q="$4"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG="$(cd "$HERE/../.." && pwd)"
REPO="$(cd "$PKG/../.." && pwd)"
QFILE="$PKG/compare/github-questions/$Q.md"
[ -f "$QFILE" ] || { echo "missing $QFILE" >&2; exit 2; }
[ -f "$PKG/compare/arms/$ARM.md" ] || [ "${ARM#mcp}" != "$ARM" ] || { echo "unknown arm $ARM" >&2; exit 2; }

ID="$ARM-p$PASS-$Q"
RUN="$CAMP/runs/$ID"
WORK="$CAMP/work/$ARM"   # empty cwd: no repo context leaks in
rm -rf "$RUN"; mkdir -p "$RUN" "$WORK"

FLAGS=()
case "$ARM" in
  mcp|mcp-*)
    ARM_CMD_VAR="OCTO_MCP_CMD_${ARM//-/_}"
    read -r -a CMD <<< "${!ARM_CMD_VAR:-${OCTO_MCP_CMD:-node $REPO/packages/octocode-mcp/dist/index.js}}"
    python3 - "$RUN/mcp.json" "$ARM" "${CMD[@]}" <<'PY'
import json, sys
path, arm, cmd = sys.argv[1], sys.argv[2], sys.argv[3:]
env = {"OCTOCODE_ALLOW_CONTRACT_DRIFT": "1", "NODE_ENV": "development"}
if "clasify" not in arm:
    env["OCTOCODE_CLASSIFICATION_API"] = ""   # explicitly blank = clasify off
json.dump({"mcpServers": {"octocode": {"type": "stdio", "command": cmd[0], "args": cmd[1:], "env": env}}},
          open(path, "w"), indent=1)
PY
    BRIEF="$PKG/compare/arms/mcp.md"
    FLAGS=(--tools "" --mcp-config "$RUN/mcp.json" --strict-mcp-config --allowedTools "mcp__octocode") ;;
  gh-lean)
    BRIEF="$PKG/compare/arms/gh-lean.md"
    FLAGS=(--tools Bash --strict-mcp-config --allowedTools "Bash(gh:*)" "Bash(grep:*)" "Bash(sed -n:*)" "Bash(head:*)" \
           "Bash(tail:*)" "Bash(wc:*)" "Bash(sort:*)" "Bash(uniq:*)" "Bash(cut:*)" "Bash(jq:*)") ;;
  gh)
    BRIEF="$PKG/compare/arms/gh.md"
    FLAGS=(--tools Bash --strict-mcp-config --allowedTools "Bash(gh:*)") ;;
  rtk)
    BRIEF="$PKG/compare/arms/rtk.md"
    FLAGS=(--tools Bash --strict-mcp-config --allowedTools "Bash(rtk gh:*)") ;;
  headroom)
    BRIEF="$PKG/compare/arms/headroom.md"
    FLAGS=(--tools Bash --strict-mcp-config --allowedTools "Bash(ghc:*)") ;;
esac

PROMPT="$(cat "$PKG/compare/arms/runner.md")

$(cat "$BRIEF")

---

$(cat "$QFILE")"

# gh, rtk and ghc all resolve `gh` through the read-only guard.
export REAL_GH="${REAL_GH:-$(command -v gh)}"
export PATH="$HERE/guard:$HERE:$PATH"
export GHC_LOG="$RUN/ghc.jsonl"   # headroom wrapper's own log (diagnostic only)

cd "$WORK"
set +e
claude -p "$PROMPT" \
  --model "${RUNNER_MODEL:-claude-sonnet-5-5}" \
  "${FLAGS[@]}" \
  --setting-sources "" \
  --disable-slash-commands \
  --no-session-persistence \
  --max-turns "${RUNNER_MAX_TURNS:-60}" \
  --output-format stream-json --verbose \
  > "$RUN/transcript.jsonl" 2> "$RUN/stderr.log"
STATUS=$?
set -e

python3 "$HERE/transcript_to_log.py" --transcript "$RUN/transcript.jsonl" \
  --log "$CAMP/$ID.jsonl" --run-dir "$RUN" --question "$Q" | sed "s/^/$ID /"
exit "$STATUS"
