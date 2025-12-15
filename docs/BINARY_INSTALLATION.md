# Standalone Binary Installation

> **No Node.js Required** — Download and run octocode-mcp as a standalone executable.

## Quick Install

### One-Line Install (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/bgauryy/octocode-mcp/main/install/install.sh | sh
```

This script:
- Auto-detects your platform (macOS/Linux) and architecture (x64/arm64)
- Downloads the correct binary from GitHub Releases
- Installs to `~/.local/bin/octocode-mcp`
- Makes it executable

---

## Manual Download

Download the binary for your platform from [GitHub Releases](https://github.com/bgauryy/octocode-mcp/releases):

| Platform | Binary | Download |
|----------|--------|----------|
| **macOS Apple Silicon** (M1/M2/M3) | `octocode-mcp-darwin-arm64` | [Download](https://github.com/bgauryy/octocode-mcp/releases/latest/download/octocode-mcp-darwin-arm64) |
| **macOS Intel** | `octocode-mcp-darwin-x64` | [Download](https://github.com/bgauryy/octocode-mcp/releases/latest/download/octocode-mcp-darwin-x64) |
| **Linux x64** | `octocode-mcp-linux-x64` | [Download](https://github.com/bgauryy/octocode-mcp/releases/latest/download/octocode-mcp-linux-x64) |
| **Linux ARM64** | `octocode-mcp-linux-arm64` | [Download](https://github.com/bgauryy/octocode-mcp/releases/latest/download/octocode-mcp-linux-arm64) |
| **Linux Alpine/musl** | `octocode-mcp-linux-x64-musl` | [Download](https://github.com/bgauryy/octocode-mcp/releases/latest/download/octocode-mcp-linux-x64-musl) |
| **Windows x64** | `octocode-mcp-windows-x64.exe` | [Download](https://github.com/bgauryy/octocode-mcp/releases/latest/download/octocode-mcp-windows-x64.exe) |

### Manual Install Steps

```bash
# Example for macOS Apple Silicon
curl -fsSL https://github.com/bgauryy/octocode-mcp/releases/latest/download/octocode-mcp-darwin-arm64 -o ~/.local/bin/octocode-mcp
chmod +x ~/.local/bin/octocode-mcp
```

---

## MCP Configuration

### After Installing Binary

Configure your MCP client to use the installed binary:

```json
{
  "mcpServers": {
    "octocode": {
      "command": "~/.local/bin/octocode-mcp"
    }
  }
}
```

### With GitHub Token

```json
{
  "mcpServers": {
    "octocode": {
      "command": "~/.local/bin/octocode-mcp",
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here"
      }
    }
  }
}
```

---

## Download & Run Directly (No Install)

For environments where you can't persist files, download and run in a single command:

### macOS Apple Silicon

```json
{
  "mcpServers": {
    "octocode": {
      "command": "bash",
      "args": ["-c", "curl -fsSL https://github.com/bgauryy/octocode-mcp/releases/latest/download/octocode-mcp-darwin-arm64 -o /tmp/octocode-mcp && chmod +x /tmp/octocode-mcp && /tmp/octocode-mcp"]
    }
  }
}
```

### macOS Intel

```json
{
  "mcpServers": {
    "octocode": {
      "command": "bash",
      "args": ["-c", "curl -fsSL https://github.com/bgauryy/octocode-mcp/releases/latest/download/octocode-mcp-darwin-x64 -o /tmp/octocode-mcp && chmod +x /tmp/octocode-mcp && /tmp/octocode-mcp"]
    }
  }
}
```

### Linux x64

```json
{
  "mcpServers": {
    "octocode": {
      "command": "bash",
      "args": ["-c", "curl -fsSL https://github.com/bgauryy/octocode-mcp/releases/latest/download/octocode-mcp-linux-x64 -o /tmp/octocode-mcp && chmod +x /tmp/octocode-mcp && /tmp/octocode-mcp"]
    }
  }
}
```

### Auto-Detect Platform (Advanced)

```json
{
  "mcpServers": {
    "octocode": {
      "command": "bash",
      "args": [
        "-c",
        "curl -fsSL \"https://github.com/bgauryy/octocode-mcp/releases/latest/download/octocode-mcp-$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m | sed 's/x86_64/x64/;s/aarch64/arm64/')\" -o /tmp/octocode-mcp && chmod +x /tmp/octocode-mcp && /tmp/octocode-mcp"
      ]
    }
  }
}
```

> **Note**: This one-liner works for macOS and standard Linux (glibc). For Alpine Linux (musl), please use the [manual download](#manual-download) method to get the correct `linux-x64-musl` binary.

---

## Comparison: Binary vs npm

| Aspect | Standalone Binary | npm (`npx octocode-mcp`) |
|--------|-------------------|--------------------------|
| **Dependencies** | None (self-contained) | Requires Node.js ≥18 |
| **Startup Time** | ~50-100ms | ~500-800ms |
| **Size** | ~50-80MB | ~5MB (code only) |
| **Updates** | Manual or script | `@latest` auto-fetches |
| **Best For** | Production, CI/CD, minimal environments | Development, quick testing |

---

## Verify Installation

```bash
# Check binary exists
ls -la ~/.local/bin/octocode-mcp

# Check it runs
~/.local/bin/octocode-mcp --help
```

---

## Troubleshooting

### Binary not in PATH

Add `~/.local/bin` to your PATH:

```bash
# Add to ~/.bashrc or ~/.zshrc
export PATH="$PATH:$HOME/.local/bin"
```

### Permission Denied

Make sure the binary is executable:

```bash
chmod +x ~/.local/bin/octocode-mcp
```

### macOS Security Warning

If macOS blocks the binary, allow it in System Preferences → Security & Privacy, or run:

```bash
xattr -d com.apple.quarantine ~/.local/bin/octocode-mcp
```

---

## Checksums

Each release includes `checksums-sha256.txt` for verification:

```bash
# Download checksums
curl -fsSL https://github.com/bgauryy/octocode-mcp/releases/latest/download/checksums-sha256.txt

# Verify binary
sha256sum -c checksums-sha256.txt
```

