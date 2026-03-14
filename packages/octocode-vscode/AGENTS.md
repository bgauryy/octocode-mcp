# AGENTS.md - Octocode VS Code Extension

> **Location**: `packages/octocode-vscode/AGENTS.md`

AI agent guidance for the `octocode-vscode` package - VS Code extension for Octocode MCP server management and GitHub authentication.

This file **overrides** the root [`AGENTS.md`](https://github.com/bgauryy/octocode-mcp/blob/main/AGENTS.md) for work within this package.

---

## Overview

Octocode VS Code Extension is the management hub for Octocode MCP:

- **GitHub Authentication**: OAuth device flow for secure GitHub login
- **MCP Installation**: Auto-configure MCP server in supported editors
- **Multi-Client Support**: Works with Cursor, Windsurf, Antigravity, Trae, Cline, Roo Code
- **Token Sync**: Automatically syncs GitHub tokens across all MCP configurations

**Key Docs**: See the Documentation table below.

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [`docs/README.md`](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-vscode/docs/README.md) | VS Code package docs index and quick reference |
| [`README.md`](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-vscode/README.md) | Extension overview, installation, and usage |
| [Authentication Setup](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/AUTHENTICATION_SETUP.md) | Shared authentication setup details |

---

## 🛠️ Commands

All commands run from this package directory (`packages/octocode-vscode/`).

| Task | Command | Description |
|------|---------|-------------|
| **Build** | `yarn build` | Bundle with esbuild (minified) |
| **Lint** | `yarn lint` | ESLint check |
| **Test** | `yarn test` | Run Vitest unit coverage for extracted helpers |
| **Test (Quiet)** | `yarn test:quiet` | Minimal test output |
| **Typecheck** | `yarn typecheck` | TypeScript type checking |
| **Verify** | `yarn verify` | Lint + typecheck + tests + build |
| **Package** | `yarn package` | Create `.vsix` package |
| **Publish** | `yarn publish` | Publish to VS Code Marketplace |
| **Watch** | `yarn watch` | Watch mode for development |

---

## 📂 Package Structure

```
src/
├── extension.ts          # Extension activation + VS Code wiring
├── configPaths.ts        # Editor detection and MCP client config paths
└── jsonUtils.ts          # Shared JSON file read helper

tests/
├── configPaths.test.ts   # Cross-platform path and editor detection coverage
└── jsonUtils.test.ts     # JSON file handling coverage

images/
└── icon.png              # Extension icon

out/
└── extension.js          # Bundled output (esbuild)
```

### Key Components

| Component | Purpose |
|-----------|---------|
| `getEditorInfo()` | Detect current editor (Cursor, Windsurf, etc.) |
| `loginToGitHub()` | OAuth device flow authentication |
| `syncTokenToAllConfigs()` | Update token in all MCP configs |
| `installMcpServer()` | Configure MCP server in editor config |
| `startMcpServer()` | Spawn MCP server process |
| `MCP_CLIENTS` | Registry of supported MCP clients |
| `configPaths.ts` | Pure path logic extracted for unit testing |
| `jsonUtils.ts` | Safe JSON parsing shared across config operations |

---

## 🖥️ Extension Commands

| Command | ID | Description |
|---------|-----|-------------|
| Sign in to GitHub | `octocode.loginGitHub` | OAuth authentication |
| Sign out of GitHub | `octocode.logoutGitHub` | Clear tokens from configs |
| Show Auth Status | `octocode.showAuthStatus` | Check authentication state |
| Install MCP Server | `octocode.installMcp` | Configure for current editor |
| Start Server | `octocode.startServer` | Run MCP server process |
| Stop Server | `octocode.stopServer` | Terminate server process |
| Install for Cline | `octocode.installForCline` | Configure for Cline extension |
| Install for Roo Code | `octocode.installForRooCode` | Configure for Roo Code |
| Install for Trae | `octocode.installForTrae` | Configure for Trae editor |
| Install for All | `octocode.installForAll` | Configure all clients |

---

## 🎨 Supported Editors

| Editor | Config Path (macOS) | Detection |
|--------|---------------------|-----------|
| **Cursor** | `~/.cursor/mcp.json` | `appName.includes('cursor')` |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` | `appName.includes('windsurf')` |
| **Antigravity** | `~/.gemini/antigravity/mcp_config.json` | `appName.includes('antigravity')` |
| **Trae** | `~/Library/Application Support/Trae/mcp.json` | `appName.includes('trae')` |
| **VS Code** | Claude Desktop config | Default fallback |

### MCP Client Extensions

| Client | Config Location |
|--------|-----------------|
| **Cline** | `Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` |
| **Roo Code** | `Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json` |

---

## 📦 Package Guidelines

These are the core principles for this VS Code extension:

1. **Thin Entry Point**: Keep VS Code wiring in `extension.ts`, but extract pure helpers when logic becomes testable outside the editor runtime.
2. **Cross-Platform**: Support macOS, Linux, and Windows config paths.
3. **Non-Invasive**: Only modify MCP configs, never editor settings.
4. **Graceful Degradation**: Handle missing configs, failed auth, and errors gracefully.
5. **Token Security**: Use VS Code's built-in authentication API for OAuth.

---

## 🏗️ Architecture Patterns

### Authentication Flow

```
User triggers "Sign in to GitHub"
    ↓
vscode.authentication.getSession(GITHUB_SCOPES, createIfNone)
    ↓
OAuth device flow (VS Code handles UI)
    ↓
syncTokenToAllConfigs(session.accessToken)
    ↓
Update all detected MCP configs with GITHUB_TOKEN env
```

### Editor Detection Flow

```
vscode.env.appName
    ↓
Match against known editors (cursor, windsurf, antigravity, trae)
    ↓
Return editor-specific config path
    ↓
Fallback to Claude Desktop config for VS Code
```

---

## 🛡️ Safety & Permissions

### Package-Level Access

| Path | Access | Description |
|------|--------|-------------|
| `src/` | ✅ FULL | Source code |
| `images/` | ✅ EDIT | Extension assets |
| `*.json`, `*.config.*` | ⚠️ ASK | Package configs |
| `out/`, `node_modules/` | ❌ NEVER | Generated files |

### Protected Files

- **Never Modify**: `out/`, `node_modules/`
- **Ask Before Modifying**: `package.json`, `tsconfig.json`

### Security Considerations

- **Token Handling**: Tokens are stored via VS Code's secure authentication API
- **No Credential Logging**: Never log tokens or sensitive data to output channel
- **Config Validation**: Always validate JSON before writing to config files

---

## 🧪 Testing Protocol

This package now has lightweight automated coverage for cross-platform path detection and JSON config parsing. The current suite is intentionally narrow; full extension-host integration tests are still a follow-up.

### Current Test Structure

```
tests/
├── configPaths.test.ts   # Editor detection + MCP client path coverage
└── jsonUtils.test.ts     # JSON config parsing and error handling
```

### Next Recommended Additions

```
tests/
├── extension.test.ts     # Extension activation tests
└── auth.test.ts          # OAuth flow mocking
```

### Manual Testing Checklist

- [ ] Extension activates on startup
- [ ] GitHub OAuth flow completes successfully
- [ ] Token syncs to all detected MCP configs
- [ ] MCP server starts and responds
- [ ] Works in Cursor, Windsurf, and VS Code

---

## 📝 Development Notes

### Build Process

The extension uses **esbuild** for fast bundling:

```bash
esbuild src/extension.ts \
  --bundle \
  --outfile=out/extension.js \
  --external:vscode \
  --format=cjs \
  --platform=node \
  --minify
```

### Key Dependencies

- **vscode**: VS Code Extension API (external)
- **No runtime deps**: All functionality uses Node.js built-ins

### Publishing

```bash
yarn package   # Create .vsix
yarn publish   # Publish to marketplace (requires PAT)
```
