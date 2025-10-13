#!/usr/bin/env bash
set -euo pipefail

# Log Progress Hook
# Triggered after TodoWrite operations to track agent progress
# Purpose: Log todo state changes for debugging and progress tracking

OCTOCODE_DIR="${CLAUDE_PROJECT_DIR}/.octocode"
LOGS_DIR="${OCTOCODE_DIR}/logs"
PROGRESS_LOG="${LOGS_DIR}/todo-history.log"

# Only run if .octocode directory exists
if [[ ! -d "$OCTOCODE_DIR" ]]; then
  exit 0
fi

# Create logs directory
mkdir -p "$LOGS_DIR"

# Create progress log entry
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")
echo "[${TIMESTAMP}] TodoWrite executed - state updated" >> "$PROGRESS_LOG"

# Keep log size manageable (last 1000 lines)
if [[ -f "$PROGRESS_LOG" ]]; then
  tail -n 1000 "$PROGRESS_LOG" > "${PROGRESS_LOG}.tmp"
  mv "${PROGRESS_LOG}.tmp" "$PROGRESS_LOG"
fi

exit 0
