# AGENTS.md - Octocode Monorepo

> AI agent guidance for the Octocode MCP monorepo. **Full guide**: [docs/DEVELOPMENT_GUIDE.md](./docs/DEVELOPMENT_GUIDE.md)

## Core Methodology


> **File Operations**: Use Linux commands for changes in files!
> Create commands and then implement on files.
> Use less tool calls for changes! (e.g. delete, sed,...)
>
> | Command | Use Case | Example |
> |---------|----------|----------|
> | `sed` | Find & replace, insert/delete lines | `sed -i '' 's/old/new/g' file.ts` |
> | `rm` | Delete files/directories | `rm -rf folder/` |
> | `mv` | Move or rename files | `mv old.ts new.ts` |
> | `cp` | Copy files/directories | `cp -r src/ backup/` |
> | `mkdir -p` | Create nested directories | `mkdir -p src/components/ui` |
> | `touch` | Create empty files | `touch src/utils/helper.ts` |
> | `cat <<EOF` | Create multi-line files | `cat > file.ts << 'EOF'` |
> | `echo >>` | Append text to files | `echo "export *" >> index.ts` |
> | `find -exec` | Batch operations | `find . -name "*.ts" -exec sed ...` |
> | `chmod` | Change permissions | `chmod +x script.sh` |
>
> **Power Combos:**
> ```bash
> # Rename all .js to .ts
> for f in *.js; do mv "$f" "${f%.js}.ts"; done
> # Find and replace across files
> find . -name "*.ts" -exec sed -i '' 's/oldFunc/newFunc/g' {} +
> # Delete all test snapshots
> find . -name "*.snap" -delete
> ```
1. **Task Management**: Review → Plan (use `todo` tool) → Track progress
2. **Research**: Prefer `octocode-local` MCP tools. LSP first, then local search, then GitHub
3. **TDD**: Write failing test → Run (`yarn test`) → Fix → Verify coverage (90%)
4. **ReAct Loop**: Reason → Act → Observe → Loop
5. **Quality**: Clean Code, run `yarn lint` + `yarn test`, use `npx knip` for dead code
6. **Efficiency**: Use Linux commands (`mv`, `cp`, `sed`) for file operations

## Repository Structure

```
octocode-mcp/
├── packages/
│   ├── octocode-mcp/      # MCP server: GitHub API, local tools, LSP
│   ├── octocode-cli/      # CLI installer & skills marketplace
│   ├── octocode-vscode/   # VS Code extension (OAuth, multi-editor)
│   └── octocode-shared/   # Shared utilities (credentials, platform, session)
└── package.json           # Workspace root (yarn workspaces)
```


## Access Control

| Path | Access |
|------|--------|
| `packages/*/src/`, `packages/*/tests/` | ✅ Auto |
| `packages/*/docs/` | ✅ Auto |
| `*.json`, `*.config.*` | ⚠️ Ask |
| `.env*`, `.octocode/`, `node_modules/`, `dist/` | ❌ Never |

## Quick Commands

```bash
yarn install    # Install all
yarn build      # Build all
yarn test       # Test with coverage
yarn lint       # Lint all
yarn lint:fix   # Auto-fix lint issues
```

## Package AGENTS.md

Each package has specific guidelines that **override** this root file:

| Package | Location |
|---------|----------|
| octocode-mcp | [packages/octocode-mcp/AGENTS.md](./packages/octocode-mcp/AGENTS.md) |
| octocode-cli | [packages/octocode-cli/AGENTS.md](./packages/octocode-cli/AGENTS.md) |
| octocode-vscode | [packages/octocode-vscode/AGENTS.md](./packages/octocode-vscode/AGENTS.md) |
| octocode-shared | [packages/octocode-shared/AGENTS.md](./packages/octocode-shared/AGENTS.md) |

## Key References

- **Development Standards**: [docs/DEVELOPMENT_GUIDE.md](./docs/DEVELOPMENT_GUIDE.md)
- **Skills Guide**: [packages/octocode-cli/docs/SKILLS_GUIDE.md](./packages/octocode-cli/docs/SKILLS_GUIDE.md)
- **GitHub Tools**: [packages/octocode-mcp/docs/GITHUB_TOOLS_REFERENCE.md](./packages/octocode-mcp/docs/GITHUB_TOOLS_REFERENCE.md)
- **Local Tools**: [packages/octocode-mcp/docs/LOCAL_TOOLS_REFERENCE.md](./packages/octocode-mcp/docs/LOCAL_TOOLS_REFERENCE.md)
- **LSP Tools**: [packages/octocode-mcp/docs/LSP_TOOLS.md](./packages/octocode-mcp/docs/LSP_TOOLS.md)
