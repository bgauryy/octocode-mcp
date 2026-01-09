# Token Resolution in Octocode MCP

> How the MCP server obtains GitHub authentication tokens

## Overview

The Octocode MCP server requires a GitHub token to access the GitHub API. Rather than managing tokens directly, it delegates credential storage to the **`octocode-shared`** package, which provides a unified, secure storage layer used across the Octocode ecosystem.

## Token Resolution Priority

When the MCP server needs a GitHub token, it checks sources in this order:

```
┌─────────────────────────────────────────────────────────────┐
│ Token Resolution (Priority Order)                           │
├─────────────────────────────────────────────────────────────┤
│ 1. OCTOCODE_TOKEN env? → Return immediately             │ ← No storage interaction
│ 2. GH_TOKEN env?       → Return immediately             │ ← No storage interaction
│ 3. GITHUB_TOKEN env?   → Return immediately             │ ← No storage interaction
│ 4. gh auth token?      → External CLI call              │ ← After env vars
│ 5. Keychain?           → Read from OS secure storage    │ ← Stored credentials
│ 6. File?               → Read from encrypted file       │ ← Fallback storage
└─────────────────────────────────────────────────────────────┘
```

### Why This Order?

1. **Environment variables first** — Fast, no I/O, allows CI/CD overrides
2. **GitHub CLI fourth** — Users who have authenticated with `gh auth login` work automatically
3. **Secure storage fifth** — OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service)
4. **Encrypted file last** — Fallback when keychain unavailable

### Why Keychain Storage?

The Keychain (OS secure storage) exists as a storage option for several important reasons:

| Storage Method | Security | Persistence | Drawbacks |
|----------------|----------|-------------|-----------|
| **Env vars** | ⚠️ Medium | ❌ Per-session | Can leak in `ps e`, stored as plain text in shell profiles |
| **`gh` CLI** | ✅ High | ✅ Yes | Requires installing GitHub CLI |
| **Keychain** | ✅ Highest | ✅ Yes | May prompt for access on first use |
| **Encrypted file** | ✅ High | ✅ Yes | Fallback when keychain unavailable |

**Key reasons for Keychain support:**

1. **Not everyone uses `gh` CLI** — Some users don't have GitHub CLI installed or prefer not to install additional tools just for Octocode

2. **OAuth tokens need secure storage** — When users authenticate via `npx octocode-cli` (OAuth flow), the token must be stored somewhere. Keychain provides OS-level encryption

3. **Environment variables have security limitations:**
   - Can be leaked in process listings (`ps auxe`)
   - Must be stored in shell profiles (`~/.zshrc`) as plain text
   - Visible to all child processes

4. **Cross-session persistence** — Unlike terminal environment variables, Keychain entries persist across sessions and reboots without requiring re-authentication

5. **OS-level protection** — Keychain entries are:
   - Encrypted at rest by the operating system
   - Protected by the user's login password
   - Isolated from other applications (on macOS, apps must be granted explicit access)

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

### Option 3: GitHub CLI (Recommended)

If you already have the GitHub CLI (`gh`) installed and authenticated:

```bash
# Authenticate with GitHub CLI
gh auth login
```

The MCP server will automatically use `gh auth token` as the **first priority**. This means if you're already authenticated with `gh`, no additional setup is needed!

> **Note:** After authenticating or changing tokens, you must **restart the MCP server** to apply changes. The server caches tokens at startup for performance.

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
| `gh` | From GitHub CLI (`gh auth token`) — highest priority |
| `env:OCTOCODE_TOKEN` | From OCTOCODE_TOKEN environment variable |
| `env:GH_TOKEN` | From GH_TOKEN environment variable |
| `env:GITHUB_TOKEN` | From GITHUB_TOKEN environment variable |
| `keychain` | From OS secure storage |
| `file` | From encrypted credentials file |

---

## Troubleshooting

### "No GitHub token found"

1. **Check GitHub CLI authentication (recommended):**
   ```bash
   gh auth status
   # If not authenticated, run:
   gh auth login
   ```

2. **Check environment variables:**
   ```bash
   echo $OCTOCODE_TOKEN $GH_TOKEN $GITHUB_TOKEN
   ```

3. **Login via Octocode CLI:**
   ```bash
   npx octocode-cli
   # Select "Login to GitHub"
   ```

4. **Check stored credentials:**
   ```bash
   npx octocode-cli
   # Select "Check GitHub Auth Status"
   ```

5. **Restart the MCP server** — After setting up authentication, you must restart the MCP server to apply changes. The token is cached at startup.

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

