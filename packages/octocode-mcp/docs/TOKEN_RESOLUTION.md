# Token Resolution in Octocode MCP

> How the MCP server obtains GitHub authentication tokens

## Overview

The Octocode MCP server requires a GitHub token to access the GitHub API. Rather than managing tokens directly, it delegates credential storage to the **`octocode-shared`** package, which provides a unified, secure storage layer used across the Octocode ecosystem.

## Token Resolution Priority

When the MCP server needs a GitHub token, it checks sources in this order:

```
┌─────────────────────────────────────────────────────────┐
│ Token Resolution (Priority Order)                       │
├─────────────────────────────────────────────────────────┤
│ 1. OCTOCODE_TOKEN env? → Return immediately             │ ← No storage interaction
│ 2. GH_TOKEN env?       → Return immediately             │ ← No storage interaction
│ 3. GITHUB_TOKEN env?   → Return immediately             │ ← No storage interaction
│ 4. Keychain?           → Read from OS secure storage    │ ← Only if env vars not set
│ 5. File?               → Read from encrypted file       │ ← Fallback storage
│ 6. gh auth token?      → External CLI call              │ ← Last resort
└─────────────────────────────────────────────────────────┘
```

### Why This Order?

1. **Environment variables first** — Fast, no I/O, allows CI/CD overrides
2. **Secure storage second** — OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service)
3. **Encrypted file third** — Fallback when keychain unavailable
4. **GitHub CLI last** — Compatibility with existing `gh` installations

---

## Setting Up a Token

### Option 1: Using Octocode CLI (Recommended)

The easiest way to authenticate is using the **`octocode-cli`** installer:

```bash
# Install Octocode (includes authentication setup)
npx octocode-cli@latest
```

During installation, select **"Login to GitHub"** from the menu. This will:

1. Start a secure OAuth flow in your browser
2. Store the token in your system keychain (or encrypted file as fallback)
3. Make the token available to the MCP server automatically

#### Manual Login After Installation

```bash
# Run the CLI again and select "Login to GitHub"
npx octocode-cli
```

#### Check Authentication Status

```bash
# Run the CLI and select "Check GitHub Auth Status"
npx octocode-cli
```

### Option 2: Environment Variables

Set one of these environment variables before starting your editor:

```bash
# Option A: Octocode-specific token
export OCTOCODE_TOKEN="ghp_xxxxxxxxxxxx"

# Option B: Standard GitHub token (also used by gh CLI)
export GH_TOKEN="ghp_xxxxxxxxxxxx"

# Option C: GitHub Actions compatible
export GITHUB_TOKEN="ghp_xxxxxxxxxxxx"
```

**Tip:** Add to your shell profile (`~/.zshrc`, `~/.bashrc`) for persistence.

### Option 3: GitHub CLI

If you already have the GitHub CLI (`gh`) installed and authenticated:

```bash
# Authenticate with GitHub CLI
gh auth login
```

The MCP server will automatically use `gh auth token` as a last resort.

---

## How It Works

### Architecture

```
┌─────────────────────┐
│   octocode-cli      │ ────── WRITES ──────┐
│  (OAuth + Storage)  │                      │
└─────────────────────┘                      ▼
                              ┌──────────────────────────────┐
                              │       octocode-shared        │
                              │                              │
                              │  credentials/storage.ts      │
                              │  ├─ resolveToken()           │
                              │  ├─ getToken()               │
                              │  └─ getCredentials()         │
                              │                              │
                              │  Storage Locations:          │
                              │  ├─ System Keychain          │
                              │  └─ ~/.octocode/credentials  │
                              └──────────────────────────────┘
                                             ▲
┌─────────────────────┐                      │
│   octocode-mcp      │ ────── READS ────────┘
│  (MCP Server)       │
└─────────────────────┘
```

### Storage Locations

| Storage | Location | Security |
|---------|----------|----------|
| **Keychain** | OS-managed (Keychain Access, Credential Manager, Secret Service) | Highest |
| **Encrypted File** | `~/.octocode/credentials.json` | AES-256-GCM encrypted |
| **Encryption Key** | `~/.octocode/.key` | File permissions 600 |

### Token Sources Returned

The `resolveToken()` function returns both the token and its source:

| Source | Meaning |
|--------|---------|
| `env:OCTOCODE_TOKEN` | From OCTOCODE_TOKEN environment variable |
| `env:GH_TOKEN` | From GH_TOKEN environment variable |
| `env:GITHUB_TOKEN` | From GITHUB_TOKEN environment variable |
| `keychain` | From OS secure storage |
| `file` | From encrypted credentials file |

---

## Troubleshooting

### "No GitHub token found"

1. **Check environment variables:**
   ```bash
   echo $OCTOCODE_TOKEN $GH_TOKEN $GITHUB_TOKEN
   ```

2. **Login via CLI:**
   ```bash
   npx octocode-cli
   # Select "Login to GitHub"
   ```

3. **Check stored credentials:**
   ```bash
   npx octocode-cli
   # Select "Check GitHub Auth Status"
   ```

### "Token expired"

The CLI automatically handles token refresh. Re-run:
```bash
npx octocode-cli
# Select "Login to GitHub"
```

### Keychain Access Denied

On macOS, you may see a keychain access prompt. Click "Always Allow" to prevent future prompts.

If keychain is unavailable, credentials fall back to the encrypted file at `~/.octocode/credentials.json`.

---

## Security Notes

- **Tokens are never logged** — The MCP server masks sensitive data in all logs
- **Keychain preferred** — Uses OS-level security when available
- **File encryption** — AES-256-GCM with a locally-stored key
- **Environment variables** — Useful for CI/CD but less secure on shared systems

---

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — Overall MCP server architecture
- [octocode-shared](../../../octocode-shared/README.md) — Shared credentials package
- [octocode-cli](../../../octocode-cli/README.md) — CLI installer documentation

---

*Created by Octocode MCP 🔍🐙*

