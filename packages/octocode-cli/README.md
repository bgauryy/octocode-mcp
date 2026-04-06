# Octocode CLI

<div align="center">

[![npm version](https://img.shields.io/npm/v/octocode-cli.svg?style=flat-square)](https://www.npmjs.com/package/octocode-cli)
[![npm downloads](https://img.shields.io/npm/dm/octocode-cli.svg?style=flat-square)](https://www.npmjs.com/package/octocode-cli)
[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/LICENSE)

Installer and management CLI for Octocode MCP, bundled skills, and direct Octocode tool usage.

[Website](https://octocode.ai) | [CLI Docs](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/README.md) | [GitHub](https://github.com/bgauryy/octocode-mcp)

<img src="https://raw.githubusercontent.com/bgauryy/octocode-mcp/main/packages/octocode-cli/assets/example.png" alt="Octocode CLI Demo" width="700" style="border-radius: 8px; margin: 20px 0;">

</div>

`octocode-cli` covers three jobs:

1. Install and sync `octocode-mcp` across supported clients.
2. Install and manage bundled Octocode skills.
3. Expose Octocode tools directly for agents, scripts, and terminal workflows.

## Quick Start

Guided setup:

```bash
npx octocode-cli
```

Direct commands:

```bash
octocode-cli install --ide cursor
octocode-cli auth
octocode-cli sync --status
```

Agent and tool usage:

```bash
octocode-cli --tools-context
octocode-cli --tool localSearchCode '{"path":".","pattern":"runCLI"}'
octocode-cli --tool githubSearchCode '{"owner":"bgauryy","repo":"octocode-mcp","keywordsToSearch":["tool"]}'
```

## Pick The Smallest Surface

Use interactive mode when you want guided setup, auth, marketplace browsing, skills management, or the built-in Tool Terminal.

Use direct commands when you want repeatable install, auth, sync, cache, or MCP workflows.

Use tool mode when you want only the Octocode tool layer. The public contract is:

```bash
octocode-cli --tools-context
octocode-cli --tool <toolName> '<json-stringified-input>'
```

The CLI validates the JSON input against the imported Octocode MCP tool schema and auto-fills shared research fields.

## Common Workflows

Install Octocode MCP:

```bash
octocode-cli install --ide cursor
octocode-cli install --ide claude-desktop --method direct
```

Manage auth:

```bash
octocode-cli auth
octocode-cli login
octocode-cli token --json
```

Manage MCP configs and marketplace:

```bash
octocode-cli sync --status
octocode-cli mcp list --search browser
octocode-cli mcp install --id playwright-mcp --client cursor --force
```

Manage bundled skills:

```bash
octocode-cli skills list
octocode-cli skills install --targets claude-code,cursor,codex
octocode-cli skills remove --skill octocode-researcher --targets claude-code,cursor
```

Run one tool directly:

```bash
octocode-cli --tool localSearchCode '{"path":".","pattern":"runCLI"}'
octocode-cli --tool localGetFileContent '{"path":"packages/octocode-cli/src/cli/index.ts"}'
```

## Docs Map

- [CLI Docs Index](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/README.md)
- [CLI Reference](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/CLI_REFERENCE.md)
- [Skills Guide](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/SKILLS_GUIDE.md)

## Supported Clients

`octocode-cli` supports MCP setup for:
`cursor`, `claude-desktop`, `claude-code`, `windsurf`, `zed`, `vscode-cline`, `vscode-roo`, `vscode-continue`, `opencode`, `trae`, `antigravity`, `codex`, `gemini-cli`, `goose`, and `kiro`.

## Troubleshooting

```bash
npx node-doctor
octocode-cli status
octocode-cli token --source
```

- If auth looks wrong, run `octocode-cli login`.
- If config state looks inconsistent, run `octocode-cli sync --status` before changing files manually.
- If an agent only needs the MCP instructions and schemas, use `octocode-cli --tools-context`.

## Privacy & Telemetry

De-identified telemetry such as command usage and error rates helps improve the CLI. Source code, environment variable values, and personal repository contents are not collected.

[Privacy Policy](https://github.com/bgauryy/octocode-mcp/blob/main/PRIVACY.md) | [Terms of Usage](https://github.com/bgauryy/octocode-mcp/blob/main/TERMS.md)

MIT. Copyright 2026 Octocode AI.
