# Octocode CLI Docs

Use the smallest doc that fits the task:

| If you want to... | Read |
|---|---|
| Understand what `octocode-cli` is, when to use interactive mode, and the main workflows | [README.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/README.md) |
| Find exact syntax for install, auth, sync, MCP, cache, and the tool contract | [CLI_REFERENCE.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/CLI_REFERENCE.md) |
| Install or remove bundled skills and understand targets and modes | [SKILLS_GUIDE.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/SKILLS_GUIDE.md) |
| Reproduce the CLI+skill vs MCP agent benchmark | [BENCHMARK.md](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/BENCHMARK.md) |

## Quick Paths

Interactive:

```bash
npx octocode-cli
```

Direct CLI:

```bash
octocode-cli install --ide cursor
octocode-cli sync --status
```

Agents and tools:

```bash
octocode-cli --tools-context
octocode-cli --tool localSearchCode '{"path":".","pattern":"runCLI"}'
```
