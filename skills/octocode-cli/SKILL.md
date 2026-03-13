---
name: octocode-cli
description: "CLI alternative to Octocode MCP tools. Use when Octocode MCP server is NOT available but the user needs code research, search, exploration, or analysis — on GitHub, local codebase, or packages. Run commands via `npx -y octocode-cli <command> [flags]` using the Bash tool. Triggers: 'find X on GitHub', 'search repo', 'explore library', 'trace definition', 'find PRs about', 'search packages', 'who calls function X', 'how does Y work in Z repo', 'find usages of X', 'what package does Y'. Also use this skill when another octocode skill (documentation-writer, plan, PR reviewer, RFC generator, roast) mentions Octocode MCP tools but MCP is not available — this CLI provides the same capabilities."
---

# Octocode CLI

CLI equivalent of the Octocode MCP tools. All commands run via:

```bash
npx -y octocode-cli <command> [flags]
```

Every command supports `--help` for full flag reference.

---

## When to Use

Use this CLI when Octocode MCP tools are **not available** as an MCP server. The CLI provides the same research capabilities:

| MCP Tool | CLI Command |
|----------|-------------|
| `localSearchCode` | `local-search` |
| `localGetFileContent` | `local-file` |
| `localViewStructure` | `local-tree` |
| `localFindFiles` | `local-find` |
| `lspGotoDefinition` | `lsp-definition` |
| `lspFindReferences` | `lsp-references` |
| `lspCallHierarchy` | `lsp-call-hierarchy` |
| `githubSearchCode` | `search-code` |
| `githubGetFileContent` | `get-file` |
| `githubViewRepoStructure` | `tree` |
| `githubSearchRepositories` | `search-repos` |
| `githubSearchPullRequests` | `search-prs` |
| `packageSearch` | `search-packages` |

---

## The Funnel Method

Progressive narrowing — each stage reduces scope. Never skip stages.

```
DISCOVER → EXPLORE → SEARCH → ANALYZE → READ (LAST)
```

| Stage | Commands | Purpose |
|-------|----------|---------|
| DISCOVER | `search-repos`, `search-packages` | Find the right repo/package |
| EXPLORE | `tree`, `local-tree` | Understand structure, narrow scope |
| SEARCH | `search-code`, `local-search` | Find patterns, get file locations |
| ANALYZE | `lsp-definition`, `lsp-references`, `lsp-call-hierarchy` | Semantic code intelligence |
| READ | `get-file`, `local-file` | Implementation details — **LAST** |

---

## Usage Patterns

### GitHub: Find and explore code

```bash
# Search code in a repo
npx -y octocode-cli search-code --keywords-to-search "useState,hook" --owner facebook --repo react

# Explore repo structure
npx -y octocode-cli tree --owner expressjs --repo express --path lib --depth 2

# Read a file with pattern matching
npx -y octocode-cli get-file --owner expressjs --repo express --path lib/router/index.js --match-string "handle"

# Search repositories
npx -y octocode-cli search-repos --keywords-to-search "react,state" --sort stars

# Search merged PRs
npx -y octocode-cli search-prs --owner expressjs --repo express --query "security" --merged

# Find a package
npx -y octocode-cli search-packages --name express --ecosystem npm --fetch-metadata
```

### Local: Search and read code

```bash
# Search for a pattern
npx -y octocode-cli local-search --pattern "handleAuth" --path ./src --type ts

# Read a file with targeted extraction
npx -y octocode-cli local-file --path ./src/auth.ts --match-string "validateToken" --match-string-context-lines 10

# Find files by name/metadata
npx -y octocode-cli local-find --path . --name "*.test.ts" --modified-within 7d

# View directory structure
npx -y octocode-cli local-tree --path ./src --depth 2 --extension ts
```

### LSP: Semantic analysis

All LSP commands require `--line-hint` from a prior `local-search`. Never guess line numbers.

```bash
# 1. Search first to get line hint
npx -y octocode-cli local-search --pattern "validateToken" --path ./src --type ts

# 2. Go to definition
npx -y octocode-cli lsp-definition --uri ./src/auth.ts --symbol-name "validateToken" --line-hint 42

# 3. Find all references
npx -y octocode-cli lsp-references --uri ./src/auth.ts --symbol-name "validateToken" --line-hint 42

# 4. Trace call hierarchy
npx -y octocode-cli lsp-call-hierarchy --uri ./src/auth.ts --symbol-name "validateToken" --line-hint 42 --direction incoming
```

### Common research flow

```bash
# Local: structure → search → LSP → read
npx -y octocode-cli local-tree --path . --depth 2
npx -y octocode-cli local-search --pattern "createSession" --path ./src --type ts
npx -y octocode-cli lsp-call-hierarchy --uri ./src/auth.ts --symbol-name "createSession" --line-hint 25 --direction incoming
npx -y octocode-cli local-file --path ./src/auth.ts --match-string "createSession"

# GitHub: discover → explore → search → read
npx -y octocode-cli search-packages --name zustand --ecosystem npm
npx -y octocode-cli tree --owner pmndrs --repo zustand --depth 2
npx -y octocode-cli search-code --keywords-to-search "createStore" --owner pmndrs --repo zustand
npx -y octocode-cli get-file --owner pmndrs --repo zustand --path src/vanilla.ts --match-string "createStore"
```

---

## Output

JSON to stdout by default. Add `--pretty` for human-readable format. Errors go to stderr.

---

## Principles

- **Funnel method** — discover → explore → search → analyze → read
- **LSP requires search first** — never guess `--line-hint`
- **Read content LAST** — after search and LSP analysis
- **Use `--match-string` for large files** — targeted extraction over full content
- **Use `--help` for details** — every command has full flag documentation
