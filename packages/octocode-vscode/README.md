# Octocode MCP for VS Code

`octocode-mcp-vscode` is the management extension for installing and operating
Octocode MCP from VS Code-compatible editors. It manages GitHub OAuth, reports
server status, and writes MCP configuration for supported clients.

The extension does not implement research tools. It installs and controls the
`octocode-mcp` server.

## Requirements

- VS Code 1.107 or later
- Node.js `^24.15.0` for the MCP server it runs (`npx -y octocode-mcp@latest`)

## Commands

Open the command palette and search for `Octocode MCP`:

- Sign in to or sign out of GitHub.
- Show authentication or server status.
- Start or stop the MCP server.
- Install the MCP server for supported clients.
- Install for Cline, Roo Code, Trae, or every detected client.

`octocode.autoInstallMcp` controls automatic configuration. Prefer the OAuth
sign-in command over storing a token in `octocode.githubToken`. The extension
writes the signed-in token as `GH_TOKEN` into the Octocode entry's `env` block of
each configured client (files are written owner-only), and removes it on sign-out.

## Development

From the repository root:

```bash
yarn workspace octocode-mcp-vscode build
yarn workspace octocode-mcp-vscode test
yarn workspace octocode-mcp-vscode lint
yarn workspace octocode-mcp-vscode typecheck
```

Create a local VSIX with:

```bash
yarn workspace octocode-mcp-vscode package
```

See the repository [MCP guide](../../docs/OCTOCODE_MCP.md) and
[configuration reference](../../docs/CONFIGURATION.md).

## License

MIT
