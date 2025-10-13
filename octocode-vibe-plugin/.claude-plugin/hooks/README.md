# Octocode-Vibe Plugin Hooks

This directory contains automated hooks that enhance the octocode-vibe workflow with automatic state management, validation, and progress tracking.

## Hooks Overview

### PostToolUse Hooks

#### 1. checkpoint-state.sh
**Trigger:** After `Write` tool operations
**Purpose:** Automatically checkpoint `.octocode/execution-state.json` for recovery
**Timeout:** 5 seconds

**What it does:**
- Creates timestamped backups of execution state
- Maintains last 10 backups in `.octocode/.backups/`
- Creates `latest.json` symlink for easy access
- Enables recovery from any point in the development process

**Benefits:**
- Never lose progress due to crashes or interruptions
- Easy rollback to previous states
- Automatic cleanup of old backups

---

#### 2. log-progress.sh
**Trigger:** After `TodoWrite` tool operations
**Purpose:** Log todo state changes for debugging and progress tracking
**Timeout:** 3 seconds

**What it does:**
- Appends entries to `.octocode/logs/todo-history.log`
- Maintains last 1000 log entries
- Tracks all todo state changes with timestamps

**Benefits:**
- Debug agent behavior by reviewing todo history
- Track when tasks were started and completed
- Analyze agent performance over time

---

#### 3. validate-changes.sh
**Trigger:** After `Edit` tool operations
**Purpose:** Validate critical files (agent definitions, config files)
**Timeout:** 5 seconds

**What it does:**
- Validates JSON files with `jq`
- Checks agent markdown files for required YAML frontmatter fields
- Warns about missing required fields (name, description, model, tools)

**Benefits:**
- Catch configuration errors immediately
- Prevent invalid agent definitions
- Ensure plugin integrity

---

### SessionStart Hook

#### 4. session-start.sh
**Trigger:** When Claude Code session starts
**Purpose:** Check for existing state and offer recovery options
**Timeout:** 10 seconds

**What it does:**
- Detects previous `.octocode/execution-state.json`
- Displays last phase and timestamp
- Shows available backups
- Suggests resume command

**Benefits:**
- Immediate awareness of previous sessions
- Easy resume workflow
- No manual state checking needed

**Example Output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Previous Octocode-Vibe Session Detected

Last Phase: implementation
Last Update: 2025-10-12T16:30:00Z

💡 To resume: Use '/octocode-vibe --resume' command
💡 To start fresh: Use '/octocode-vibe [your request]' command
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💾 Found 8 backup(s) in .octocode/.backups/
```

---

### SessionEnd Hook

#### 5. session-end.sh
**Trigger:** When Claude Code session ends
**Purpose:** Create final checkpoint and summary
**Timeout:** 10 seconds

**What it does:**
- Creates final state backup with `_final_` prefix
- Generates session summary in `.octocode/logs/`
- Lists all generated files
- Provides resume instructions

**Benefits:**
- Clean session closure
- Comprehensive session history
- Easy resume next session

**Example Output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 Octocode-Vibe Session Ended

Final checkpoint saved to:
.octocode/.backups/execution-state_final_20251012_163000.json

💡 To resume next time: Use '/octocode-vibe --resume'
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Session summary: .octocode/logs/session-summary_20251012_163000.txt
```

---

### UserPromptSubmit Hook

#### 6. prompt-submit.sh
**Trigger:** When user submits a prompt
**Purpose:** Detect octocode-vibe usage and ensure proper environment
**Timeout:** 3 seconds

**What it does:**
- Detects `/octocode-vibe` commands
- Validates `--resume` flag usage
- Checks for required state files
- Ensures `.octocode` directory initialization

**Benefits:**
- Early validation of resume attempts
- Helpful warnings for missing state
- Automatic environment setup

---

## File Structure

```
hooks/
├── hooks.json              # Hook configuration
├── README.md              # This file
└── scripts/
    ├── checkpoint-state.sh      # State persistence
    ├── log-progress.sh          # Progress tracking
    ├── validate-changes.sh      # File validation
    ├── session-start.sh         # Session initialization
    ├── session-end.sh          # Session cleanup
    └── prompt-submit.sh        # Prompt validation
```

## Environment Variables

All scripts have access to:
- `CLAUDE_PROJECT_DIR` - Project root directory
- `CLAUDE_PLUGIN_ROOT` - Plugin installation directory
- `TOOL_INPUT_*` - Tool-specific input parameters

## Security Considerations

✅ **Safe Practices:**
- All scripts use `set -euo pipefail` for error handling
- File paths are properly quoted
- Only operates within `.octocode/` directory
- No external network calls
- No sensitive data handling

⚠️ **User Responsibility:**
- Review scripts before enabling plugin
- Ensure adequate disk space for backups
- `.octocode/` directory should be in `.gitignore`

## Disabling Hooks

To disable specific hooks:

1. **Temporary (per-project):**
   Create `.claude/hooks.json` in your project with empty hooks

2. **Permanent:**
   Remove or comment out hooks in `.claude-plugin/hooks/hooks.json`

## Debugging Hooks

Enable hook debugging in Claude Code settings:
```json
{
  "hooks": {
    "debug": true
  }
}
```

Check hook output:
- Hooks write to stderr for visibility
- Look for ✓ (success) or ⚠️ (warning) symbols
- Check `.octocode/logs/` for detailed logs

## Troubleshooting

### Hook not executing
- Verify script is executable: `chmod +x hooks/scripts/*.sh`
- Check hook timeout (increase if needed)
- Review Claude Code hook logs

### Permission denied
- Ensure scripts have execute permissions
- Check `.octocode/` directory permissions

### JSON validation failing
- Install `jq`: `brew install jq` (macOS) or `apt install jq` (Linux)
- Scripts gracefully skip validation if `jq` unavailable

## Benefits Summary

| Hook | Benefit | Impact |
|------|---------|--------|
| checkpoint-state | Never lose progress | 🔒 High |
| log-progress | Debug agent behavior | 🔍 Medium |
| validate-changes | Catch errors early | ✅ High |
| session-start | Easy resume workflow | 🚀 High |
| session-end | Clean closure | 📊 Medium |
| prompt-submit | Early validation | ⚡ Low |

## Advanced Usage

### Custom Checkpoint Frequency

Edit `hooks.json` to add more PostToolUse triggers:
```json
{
  "matcher": "Write|Edit|TodoWrite",
  "hooks": [...]
}
```

### Backup Retention

Modify `checkpoint-state.sh` line 29 to change retention:
```bash
# Keep last 20 backups instead of 10
tail -n +21 | xargs -r rm --
```

### Custom Logging

Extend `log-progress.sh` to capture more information:
```bash
# Add current phase to log
PHASE=$(jq -r '.currentPhase' "$STATE_FILE" 2>/dev/null || echo "unknown")
echo "[${TIMESTAMP}] Phase: $PHASE - TodoWrite executed" >> "$PROGRESS_LOG"
```

## Related Documentation

- [Claude Code Hooks Guide](https://docs.claude.com/en/docs/claude-code/hooks)
- [Plugin Development](https://docs.claude.com/en/docs/claude-code/plugins)
- [Octocode-Vibe README](../README.md)

---

**Note:** All hooks are designed to be non-blocking and fail-safe. If a hook fails, it won't interrupt the main workflow.
