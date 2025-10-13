#!/usr/bin/env bash
set -euo pipefail

# Validate Changes Hook
# Triggered after Edit operations on critical plugin files
# Purpose: Validate YAML frontmatter in agent files and JSON in other config files

# Get the file path from TOOL_INPUT if available
FILE_PATH="${TOOL_INPUT_file_path:-}"

# Skip if not an agent or config file
if [[ ! "$FILE_PATH" =~ \.(md|json)$ ]]; then
  exit 0
fi

# Skip if file doesn't exist
if [[ ! -f "$FILE_PATH" ]]; then
  exit 0
fi

# Validate JSON files
if [[ "$FILE_PATH" =~ \.json$ ]]; then
  if ! jq empty "$FILE_PATH" 2>/dev/null; then
    echo "⚠️  Warning: Invalid JSON in $FILE_PATH" >&2
    exit 1
  fi
  echo "✓ JSON validated: $FILE_PATH" >&2
  exit 0
fi

# Validate markdown files with YAML frontmatter (agent definitions)
if [[ "$FILE_PATH" =~ agents/.*\.md$ ]]; then
  # Extract YAML frontmatter
  if grep -q "^---$" "$FILE_PATH"; then
    # Check for required fields
    if ! grep -q "^name:" "$FILE_PATH"; then
      echo "⚠️  Warning: Missing 'name' field in $FILE_PATH" >&2
      exit 1
    fi
    if ! grep -q "^description:" "$FILE_PATH"; then
      echo "⚠️  Warning: Missing 'description' field in $FILE_PATH" >&2
      exit 1
    fi
    if ! grep -q "^model:" "$FILE_PATH"; then
      echo "⚠️  Warning: Missing 'model' field in $FILE_PATH" >&2
      exit 1
    fi
    if ! grep -q "^tools:" "$FILE_PATH"; then
      echo "⚠️  Warning: Missing 'tools' field in $FILE_PATH" >&2
      exit 1
    fi
    echo "✓ Agent definition validated: $FILE_PATH" >&2
  fi
fi

exit 0
