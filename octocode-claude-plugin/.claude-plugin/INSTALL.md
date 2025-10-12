# Quick Installation Guide

## Prerequisites

1. **Node.js** ≥18.12.0
2. **GitHub CLI** authenticated:
   ```bash
   brew install gh
   gh auth login
   ```

## Installation

### For Local Development/Testing

1. **Link the plugin to Claude Code:**

   ```bash
   # From the octocode-mcp/packages/octocode-mcp directory

   # Create marketplace directory if it doesn't exist
   mkdir -p ~/.claude/marketplaces/local

   # Create symlink to the plugin
   ln -s "$(pwd)/.claude-plugin" ~/.claude/marketplaces/local/octocode-vibe
   ```

2. **Enable the local marketplace in Claude Code:**

   Add to `~/.claude/config.json`:
   ```json
   {
     "marketplaces": [
       "~/.claude/marketplaces/local"
     ]
   }
   ```

3. **Verify installation:**

   In Claude Code, check that the plugin is available:
   ```bash
   # List available commands
   /help

   # You should see:
   # - /octocode-vibe
   # - /octocode-debug
   ```

## Usage

### Start a Development Project

```bash
/octocode-vibe "create a full-stack todo app with Next.js and PostgreSQL"
```

### View Debug Information

```bash
/octocode-debug
```

## Troubleshooting

### Plugin not found

If the plugin doesn't appear:

1. Verify the symlink:
   ```bash
   ls -la ~/.claude/marketplaces/local/
   ```

2. Restart Claude Code

3. Check the marketplace configuration in `~/.claude/config.json`

### MCP Connection Issues

If octocode-mcp doesn't connect:

1. Verify GitHub CLI auth:
   ```bash
   gh auth status
   ```

2. Re-authenticate if needed:
   ```bash
   gh auth login
   ```

## Next Steps

See [README.md](README.md) for complete documentation and usage examples.
