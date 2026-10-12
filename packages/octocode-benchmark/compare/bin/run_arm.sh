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
# Local arms (name starts with `local-`) answer compare/local-questions against the pinned
# clones in octocode-local-testing/repos (LOCAL_REPOS) instead of the GitHub set:
#   local-shell       read-only Bash: rg, grep, find, ls, cat, sed -n, head, tail, wc, sort, uniq,
#                     cut, git (read-only via guard-local/git), ast-grep/sg
#   local-mcp[-<v>]   Octocode MCP started with the clones' root as cwd and WORKSPACE_ROOT;
#                     clasify offered when the name contains "clasify"; OCTO_MCP_CMD_<arm> as above
# Env: RUNNER_MODEL (default claude-sonnet-5-5), RUNNER_MAX_TURNS (default 60).
set -euo pipefail

CAMP="$(mkdir -p "$1" && cd "$1" && pwd)"; ARM="$2"; PASS="$3"; Q="$4"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG="$(cd "$HERE/../.." && pwd)"
REPO="$(cd "$PKG/../.." && pwd)"
QDIR="github-questions"; RUNNER_BRIEF="runner.md"
if [ "${ARM#local-}" != "$ARM" ]; then
  QDIR="local-questions"; RUNNER_BRIEF="local-runner.md"
  LOCAL_REPOS="${LOCAL_REPOS:-$REPO/octocode-local-testing/repos}"
fi
QFILE="$PKG/compare/$QDIR/$Q.md"
[ -f "$QFILE" ] || { echo "missing $QFILE" >&2; exit 2; }
[ -f "$PKG/compare/arms/$ARM.md" ] || [ "${ARM#mcp}" != "$ARM" ] || [ "${ARM#local-mcp}" != "$ARM" ] \
  || { echo "unknown arm $ARM" >&2; exit 2; }

ID="$ARM-p$PASS-$Q"
RUN="$CAMP/runs/$ID"
WORK="$CAMP/work/$ARM"   # empty cwd: no repo context leaks in
rm -rf "$RUN"; mkdir -p "$RUN" "$WORK"

FLAGS=()
EXTRA_PATH=""
case "$ARM" in
  local-mcp|local-mcp-*)
    ARM_CMD_VAR="OCTO_MCP_CMD_${ARM//-/_}"
    read -r -a CMD <<< "${!ARM_CMD_VAR:-${OCTO_MCP_CMD:-node $REPO/packages/octocode-mcp/dist/index.js}}"
    # The server starts in the clones' root (cwd and WORKSPACE_ROOT), so relative paths resolve there.
    python3 - "$RUN/mcp.json" "$ARM" "$LOCAL_REPOS" "${CMD[@]}" <<'PY'
import json, sys
path, arm, root, cmd = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:]
env = {"OCTOCODE_ALLOW_CONTRACT_DRIFT": "1", "NODE_ENV": "development", "WORKSPACE_ROOT": root}
if "clasify" not in arm:
    env["OCTOCODE_CLASSIFICATION_API"] = ""   # explicitly blank = clasify off
json.dump({"mcpServers": {"octocode": {"type": "stdio", "command": "sh",
                                       "args": ["-c", 'cd "$0" && exec "$@"', root, *cmd], "env": env}}},
          open(path, "w"), indent=1)
PY
    BRIEF="$PKG/compare/arms/mcp.md"
    FLAGS=(--tools "" --mcp-config "$RUN/mcp.json" --strict-mcp-config --allowedTools "mcp__octocode") ;;
  local-shell)
    BRIEF="$PKG/compare/arms/local-shell.md"
    export REAL_GIT="${REAL_GIT:-$(command -v git)}" REAL_FIND="${REAL_FIND:-$(command -v find)}"
    EXTRA_PATH="$HERE/guard-local"
    FLAGS=(--tools Bash --strict-mcp-config --add-dir "$LOCAL_REPOS" \
           --allowedTools "Bash(rg:*)" "Bash(grep:*)" "Bash(find:*)" "Bash(ls:*)" "Bash(cat:*)" "Bash(sed -n:*)" \
           "Bash(head:*)" "Bash(tail:*)" "Bash(wc:*)" "Bash(sort:*)" "Bash(uniq:*)" "Bash(cut:*)" \
           "Bash(git:*)" "Bash(ast-grep:*)" "Bash(sg:*)") ;;
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

PROMPT="$(cat "$PKG/compare/arms/$RUNNER_BRIEF")

$(cat "$BRIEF")

---

$(cat "$QFILE")"

# gh, rtk and ghc all resolve `gh` through the read-only guard.
export REAL_GH="${REAL_GH:-$(command -v gh)}"
export PATH="$HERE/guard:$HERE:$PATH"
[ -z "$EXTRA_PATH" ] || export PATH="$EXTRA_PATH:$PATH"   # local-shell: read-only git/find first
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
