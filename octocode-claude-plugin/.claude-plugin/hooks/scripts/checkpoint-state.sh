#!/usr/bin/env bash
set -eo pipefail

# Checkpoint State Hook
# Triggered after Write tool operations to ensure state persistence
# Purpose: Automatically checkpoint .octocode/execution-state.json for recovery

# Trap errors to ensure hook doesn't block Claude Code
trap 'echo "⚠️ Checkpoint hook error (non-blocking)" >&2; exit 0' ERR

# Debug logging
[[ "${CLAUDE_DEBUG:-}" == "true" ]] && echo "[DEBUG] Hook: checkpoint-state.sh" >&2

OCTOCODE_DIR="${CLAUDE_PROJECT_DIR:-.}/.octocode"
STATE_FILE="${OCTOCODE_DIR}/execution-state.json"
BACKUP_DIR="${OCTOCODE_DIR}/.backups"

# Only run if .octocode directory exists
if [[ ! -d "$OCTOCODE_DIR" ]]; then
  exit 0
fi

# Only checkpoint if execution-state.json exists
if [[ ! -f "$STATE_FILE" ]]; then
  exit 0
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Create timestamped backup
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/execution-state_${TIMESTAMP}.json"

# Copy current state to backup
cp "$STATE_FILE" "$BACKUP_FILE"

# Keep only last 10 backups
ls -t "$BACKUP_DIR"/execution-state_*.json | tail -n +11 | xargs -r rm --

# Update latest symlink
ln -sf "$(basename "$BACKUP_FILE")" "${BACKUP_DIR}/latest.json"

# Log checkpoint (silent success)
echo "✓ State checkpointed: $TIMESTAMP" >&2

exit 0
