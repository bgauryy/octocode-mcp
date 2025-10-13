#!/usr/bin/env bash
set -euo pipefail

# Session Start Hook
# Triggered at session start
# Purpose: Check for existing .octocode state and notify about recovery options

OCTOCODE_DIR="${CLAUDE_PROJECT_DIR}/.octocode"
STATE_FILE="${OCTOCODE_DIR}/execution-state.json"
BACKUP_DIR="${OCTOCODE_DIR}/.backups"

# Check if .octocode directory exists
if [[ ! -d "$OCTOCODE_DIR" ]]; then
  exit 0
fi

# Check if there's a previous execution state
if [[ -f "$STATE_FILE" ]]; then
  # Read current phase if available
  if command -v jq &> /dev/null; then
    PHASE=$(jq -r '.currentPhase // "unknown"' "$STATE_FILE" 2>/dev/null || echo "unknown")
    TIMESTAMP=$(jq -r '.timestamp // "unknown"' "$STATE_FILE" 2>/dev/null || echo "unknown")

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
    echo "📋 Previous Octocode-Vibe Session Detected" >&2
    echo "" >&2
    echo "Last Phase: $PHASE" >&2
    echo "Last Update: $TIMESTAMP" >&2
    echo "" >&2
    echo "💡 To resume: Use '/octocode-generate --resume' command" >&2
    echo "💡 To start fresh: Use '/octocode-generate [your request]' command" >&2
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
  fi
fi

# Check for backups
if [[ -d "$BACKUP_DIR" ]]; then
  BACKUP_COUNT=$(find "$BACKUP_DIR" -name "execution-state_*.json" 2>/dev/null | wc -l)
  if [[ $BACKUP_COUNT -gt 0 ]]; then
    echo "💾 Found $BACKUP_COUNT backup(s) in .octocode/.backups/" >&2
  fi
fi

exit 0
