# octocode-tools

GitHub code research and analysis CLI. Search, explore, and analyze code across GitHub repos and local codebases.

Built on [octocode-mcp](https://github.com/bgauryy/octocode-mcp) — same engine, CLI interface.

## Quick Start

```bash
# If gh CLI is authenticated, no env vars needed
npx octocode-tools search-code --keywords "useState,hook" --owner facebook --repo react

# Or set a token explicitly
GITHUB_TOKEN=ghp_xxx npx octocode-tools search-code --keywords "test" --owner octokit --repo rest.js
```

## Authentication

Token is resolved in this order — first match wins:

| Priority | Source | Setup |
|----------|--------|-------|
| 1 | `OCTOCODE_TOKEN` env var | `export OCTOCODE_TOKEN=ghp_xxx` |
| 2 | `GH_TOKEN` env var | `export GH_TOKEN=ghp_xxx` |
| 3 | `GITHUB_TOKEN` env var | `export GITHUB_TOKEN=ghp_xxx` |
| 4 | Octocode storage | `~/.octocode/credentials.json` |
| 5 | **gh CLI** (easiest) | `gh auth login` |

**Recommended**: Just run `gh auth login` once. No env vars needed after that.

## Commands

### GitHub

| Command | Description |
|---------|-------------|
| `search-code` | Search code across GitHub repositories |
| `get-file` | Get file content with pattern matching |
| `tree` | View repository directory structure |
| `search-repos` | Search GitHub repositories |
| `search-prs` | Search pull requests |
| `search-packages` | Search npm/PyPI packages |

### Local

| Command | Description |
|---------|-------------|
| `local-search` | Search local code with ripgrep |
| `local-file` | Read local file content |
| `local-find` | Find local files by metadata |
| `local-tree` | View local directory structure |

### LSP

| Command | Description |
|---------|-------------|
| `lsp-definition` | Go to symbol definition |
| `lsp-references` | Find all symbol references |
| `lsp-call-hierarchy` | Trace call relationships (incoming/outgoing) |

## Output

- **Default**: JSON to stdout (machine-readable)
- **`--pretty`**: Human-readable format
- **Errors**: Always go to stderr

## Examples

### Search code on GitHub

```bash
npx octocode-tools search-code \
  --keywords "authentication,middleware" \
  --owner expressjs --repo express \
  --extension js --limit 5
```

### Read a specific file with pattern matching

```bash
npx octocode-tools get-file \
  --owner expressjs --repo express \
  --path lib/router/index.js \
  --match "handle" --context-lines 10
```

### Explore repository structure

```bash
npx octocode-tools tree \
  --owner expressjs --repo express \
  --path lib --depth 2
```

### Search repositories

```bash
npx octocode-tools search-repos \
  --keywords "react,state,management" \
  --sort stars --limit 5
```

### Search pull requests

```bash
npx octocode-tools search-prs \
  --owner expressjs --repo express \
  --query "security fix" --merged --limit 3
```

### Search packages

```bash
npx octocode-tools search-packages --name express --ecosystem npm
npx octocode-tools search-packages --name fastapi --ecosystem python
```

### Local code search (ripgrep)

```bash
npx octocode-tools local-search \
  --pattern "handleAuth" --path ./src --type ts
```

### LSP: Go to definition

```bash
npx octocode-tools lsp-definition \
  --uri ./src/auth.ts --symbol "validateToken" --line-hint 42
```

### LSP: Find all references

```bash
npx octocode-tools lsp-references \
  --uri ./src/auth.ts --symbol "validateToken" --line-hint 42
```

### LSP: Call hierarchy

```bash
npx octocode-tools lsp-call-hierarchy \
  --uri ./src/auth.ts --symbol "validateToken" --line-hint 42 \
  --direction incoming --depth 2
```

## Research Workflow

For effective code research, follow the **funnel method**:

```
DISCOVER  →  search-repos / search-packages
EXPLORE   →  tree
SEARCH    →  search-code / local-search
ANALYZE   →  lsp-definition / lsp-references / lsp-call-hierarchy
READ      →  get-file / local-file  (LAST)
HISTORY   →  search-prs
```

**Key principle**: Narrow scope progressively. Don't read files first — search and explore first, then read specific content.

## Per-command help

Every command has detailed `--help`:

```bash
npx octocode-tools --help
npx octocode-tools search-code --help
npx octocode-tools lsp-definition --help
```
