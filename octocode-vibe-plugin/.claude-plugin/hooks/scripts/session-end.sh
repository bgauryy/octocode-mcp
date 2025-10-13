#!/usr/bin/env bash
set -euo pipefail

# Session End Hook
# Triggered at session end
# Purpose: Create final checkpoint and summary

OCTOCODE_DIR="${CLAUDE_PROJECT_DIR}/.octocode"
STATE_FILE="${OCTOCODE_DIR}/execution-state.json"
LOGS_DIR="${OCTOCODE_DIR}/logs"

# Only run if .octocode directory exists
if [[ ! -d "$OCTOCODE_DIR" ]]; then
  exit 0
fi

# Create final checkpoint if state exists
if [[ -f "$STATE_FILE" ]]; then
  BACKUP_DIR="${OCTOCODE_DIR}/.backups"
  mkdir -p "$BACKUP_DIR"

  TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
  cp "$STATE_FILE" "${BACKUP_DIR}/execution-state_final_${TIMESTAMP}.json"

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
  echo "📦 Octocode-Vibe Session Ended" >&2
  echo "" >&2
  echo "Final checkpoint saved to:" >&2
  echo ".octocode/.backups/execution-state_final_${TIMESTAMP}.json" >&2
  echo "" >&2
  echo "💡 To resume next time: Use '/octocode-generate --resume'" >&2
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
fi

# Create session summary if logs exist
if [[ -d "$LOGS_DIR" ]]; then
  SUMMARY_FILE="${LOGS_DIR}/session-summary_$(date +"%Y%m%d_%H%M%S").txt"
  {
    echo "Octocode-Vibe Session Summary"
    echo "=============================="
    echo "End Time: $(date)"
    echo ""

    if [[ -f "$STATE_FILE" ]] && command -v jq &> /dev/null; then
      echo "Final State:"
      jq -r '"\(.currentPhase // "N/A") - \(.tasks.completed // 0) of \(.tasks.total // 0) tasks completed"' "$STATE_FILE" 2>/dev/null || echo "Unable to parse state"
    fi

    echo ""
    echo "Files generated in .octocode/"
  } > "$SUMMARY_FILE"

  echo "📊 Session summary: $SUMMARY_FILE" >&2
fi

exit 0
