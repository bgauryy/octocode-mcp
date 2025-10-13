#!/usr/bin/env bash
set -euo pipefail

# Prompt Submit Hook
# Triggered when user submits a prompt
# Purpose: Detect octocode-vibe usage and ensure proper environment

# Get user prompt if available
USER_PROMPT="${TOOL_INPUT_prompt:-${1:-}}"

# Check if this is an octocode-vibe command
if [[ ! "$USER_PROMPT" =~ /octocode-vibe ]]; then
  exit 0
fi

OCTOCODE_DIR="${CLAUDE_PROJECT_DIR}/.octocode"

# Check for --resume flag
if [[ "$USER_PROMPT" =~ --resume ]]; then
  # Verify state file exists
  if [[ ! -f "${OCTOCODE_DIR}/execution-state.json" ]]; then
    echo "⚠️  Warning: --resume flag used but no previous state found" >&2
    echo "💡 Tip: Start a new session without --resume" >&2
  else
    echo "✓ Resuming from previous state" >&2
  fi
fi

# Ensure .octocode directory will be created
if [[ ! -d "$OCTOCODE_DIR" ]]; then
  echo "💡 Initializing .octocode directory for state management" >&2
fi

exit 0
