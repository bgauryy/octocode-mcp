#!/usr/bin/env bash
# Run a campaign: every (arm, pass, question) as its own isolated runner, interleaved so the
# arms share GitHub rate limits and time of day evenly. A run whose status.json says ok is
# skipped, so re-running the command retries only missing or invalid runs.
#
# MCP arms on the local build run a snapshot taken when the campaign starts (build/: the MCP
# bundle plus the native package and addon), so a rebuild in another session cannot swap or
# delete it mid-campaign. Set OCTO_MCP_CMD to run any other build or published version, or
# OCTO_MCP_CMD_<arm> (dashes as underscores) to give one mcp-* arm its own build: snapshot
# each variant with snapshot_build.sh and pass the command it prints.
#
#   run_campaign.sh <campaign-dir> <arm[,arm…]> [passes=1] [questions=1-30] [jobs=4]
#   run_campaign.sh campaigns/v20-vs-ghlean-2026-10-09 mcp,gh-lean 1 1-30 4
set -euo pipefail
mkdir -p "$1"; CAMP="$(cd "$1" && pwd)"   # absolute: runners and MCP servers start elsewhere
ARMS="$2"; PASSES="${3:-1}"; QRANGE="${4:-1-30}"; JOBS="${5:-4}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../../.." && pwd)"
if [[ ",$ARMS," == *",mcp"* ]] && [ -z "${OCTO_MCP_CMD:-}" ]; then
  export OCTO_MCP_CMD="$("$HERE/snapshot_build.sh" "$CAMP/build")"
fi
FIRST="${QRANGE%-*}"; LAST="${QRANGE#*-}"

for p in $(seq 1 "$PASSES"); do
  for q in $(seq "$FIRST" "$LAST"); do
    for arm in ${ARMS//,/ }; do
      id="$arm-p$p-Q$q"
      if grep -q '"ok": true' "$CAMP/runs/$id/status.json" 2>/dev/null; then
        continue
      fi
      echo "$arm $p Q$q"
    done
  done
done | xargs -P "$JOBS" -L 1 sh -c '"$0" "$1" "$2" "$3" "$4" || echo "FAILED $2-p$3-$4"' "$HERE/run_arm.sh" "$CAMP" \
  | tee -a "$CAMP/batch.log"
