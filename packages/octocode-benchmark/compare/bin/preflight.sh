#!/usr/bin/env bash
# Check what a campaign needs before spending on runs. Non-zero exit = fix first.
#   preflight.sh <arm[,arm…]>
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../../.." && pwd)"
fail=0
ok() { printf '  ok    %s\n' "$1"; }
bad() { printf '  FAIL  %s\n' "$1"; fail=1; }

command -v claude >/dev/null && ok "claude $(claude --version 2>/dev/null | head -1)" || bad "claude CLI not found"
gh auth status >/dev/null 2>&1 && ok "gh authenticated ($(gh --version | head -1))" || bad "gh not authenticated (gh auth login)"
command -v pi >/dev/null && ok "pi (judge runner)" || bad "pi not found (judge_pair.sh needs it)"
[ "$(ls "$HERE/../github-questions"/Q*.md | wc -l | tr -d ' ')" -gt 0 ] && ok "questions" || bad "no questions"

for arm in ${1//,/ }; do
  case "$arm" in
    mcp|mcp-*)
      ARM_CMD_VAR="OCTO_MCP_CMD_${arm//-/_}"
      read -r -a CMD <<< "${!ARM_CMD_VAR:-${OCTO_MCP_CMD:-node $REPO/packages/octocode-mcp/dist/index.js}}"
      env=(OCTOCODE_ALLOW_CONTRACT_DRIFT=1 NODE_ENV=development)
      [[ "$arm" != *clasify* ]] && env+=(OCTOCODE_CLASSIFICATION_API=)
      tools="$( (printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"preflight","version":"1"}}}' \
        '{"jsonrpc":"2.0","method":"notifications/initialized"}' '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'; sleep 10) \
        | env "${env[@]}" "${CMD[@]}" 2>/dev/null | python3 -c '
import json, sys
for line in sys.stdin:
    msg = json.loads(line)
    if msg.get("id") == 2:
        names = [t["name"] for t in msg["result"]["tools"]]
        size = len(json.dumps(msg["result"]))
        print("%d tools, tools/list %s chars, clasify=%s" % (len(names), format(size, ","), "clasify" in names))
')"
      [ -n "$tools" ] && ok "$arm: ${CMD[*]} → $tools" || bad "$arm: MCP server did not answer tools/list (${CMD[*]})" ;;
    gh-lean|gh) ok "$arm: read-only guard $HERE/guard/gh" ;;
    rtk) command -v rtk >/dev/null && ok "rtk $(rtk --version 2>/dev/null | head -1)" || bad "rtk not found" ;;
    headroom) [ -x "${HR_PY:-$HOME/.local/share/uv/tools/headroom-ai/bin/python}" ] && ok "headroom python" || bad "HR_PY not found" ;;
    *) bad "unknown arm $arm" ;;
  esac
done
exit $fail
