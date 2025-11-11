# 🔐 Authentication Guide (Concise)

Essential steps to authenticate Octocode‑MCP with GitHub quickly and safely.
Read‑only usage; no writes to GitHub.

---

## Required GitHub Scopes

| Scope | Why | Enables |
|------|-----|---------|
| `repo` (or fine‑grained: Contents: Read, Metadata: Read, Pull requests: Read) | Access private repos (read‑only) | Search code, fetch files, repo structure, PR search |
| `read:user` | Identify user, validate token | User context, rate‑limit checks |
| `read:org` | Org membership | Enterprise org/team validation |

Notes
- Public‑only: `public_repo` can replace full `repo`.
- Prefer fine‑grained PATs with read‑only permissions when possible.
- Recommended classic PAT scopes:
```json
["repo", "read:user", "read:org"]
```

---

## Setup Options

### Option 1 — GitHub CLI (Recommended)
1) Install GitHub CLI: see GitHub’s installation docs (`https://github.com/cli/cli#installation`).
2) Login:
```bash
gh auth login 
gh auth status
```
> **IMPORTANT:** Prefer web-based authentication flows if possible.
Follow GitHub’s interactive web sign-in when prompted

- The CLI will open your browser to authorize Octocode-MCP.
- Once complete, the CLI stores a token in your secure keychain.
- No need to copy any tokens manually.
- The flow supports SSO, enterprise domains, and MFA seamlessly.

If you have multiple accounts, you’ll be prompted to select or authenticate the correct one.


3) MCP config (no token needed; CLI token is used automatically):
```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp@latest"]
    }
  }
}
```

### Option 2 — Personal Access Token (PAT)
1) Create a PAT: `https://github.com/settings/tokens`
   - Scopes: `repo` (or `public_repo`), `read:user`, `read:org`
2) Provide to MCP (client config):
```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp@latest"],
      "env": { "GITHUB_TOKEN": "ghp_your_token_here" }
    }
  }
}
```

## Authentication Priority
1) GitHub CLI (`gh auth token`) — automatic and recommended  
2) `GITHUB_TOKEN` (then `GH_TOKEN`) — explicit token  
If none found, server runs with limited unauthenticated rate limits.
