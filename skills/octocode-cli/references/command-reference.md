# Command Reference

Complete flag reference for all 13 octocode-tools CLI commands.

## Table of Contents
- [GitHub Commands](#github-commands)
  - [search-code](#search-code)
  - [get-file](#get-file)
  - [tree](#tree)
  - [search-repos](#search-repos)
  - [search-prs](#search-prs)
  - [search-packages](#search-packages)
- [Local Commands](#local-commands)
  - [local-search](#local-search)
  - [local-file](#local-file)
  - [local-find](#local-find)
  - [local-tree](#local-tree)
- [LSP Commands](#lsp-commands)
  - [lsp-definition](#lsp-definition)
  - [lsp-references](#lsp-references)
  - [lsp-call-hierarchy](#lsp-call-hierarchy)

---

## GitHub Commands

### search-code

Search code across GitHub repositories using keyword matching.

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--keywords <words>` | string | Yes | — | Comma-separated keywords (max 5) |
| `--owner <owner>` | string | No | — | Repository owner |
| `--repo <repo>` | string | No | — | Repository name |
| `--extension <ext>` | string | No | — | File extension filter (e.g., ts, py) |
| `--filename <name>` | string | No | — | Filename filter |
| `--path <path>` | string | No | — | Path filter |
| `--match <type>` | string | No | file | Match type: file\|path |
| `--limit <n>` | number | No | 10 | Results per page (1-100) |
| `--page <n>` | number | No | 1 | Page number (1-10) |
| `--pretty` | boolean | No | false | Human-readable output |

```bash
npx -y octocode-tools search-code --keywords "useState,hook" --owner facebook --repo react --extension tsx --limit 5
```

### get-file

Get file content from a GitHub repository with pattern matching.

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--owner <owner>` | string | Yes | — | Repository owner |
| `--repo <repo>` | string | Yes | — | Repository name |
| `--path <path>` | string | Yes | — | File path |
| `--branch <branch>` | string | No | — | Branch name |
| `--type <type>` | string | No | file | Content type: file\|directory |
| `--full-content` | boolean | No | false | Get full file content |
| `--start-line <n>` | number | No | — | Start line number |
| `--end-line <n>` | number | No | — | End line number |
| `--match <string>` | string | No | — | Extract lines matching this string |
| `--context-lines <n>` | number | No | 5 | Context lines around match (1-50) |
| `--char-offset <n>` | number | No | — | Character offset for pagination |
| `--char-length <n>` | number | No | — | Character length for pagination |
| `--force-refresh` | boolean | No | false | Force refresh cached content |
| `--pretty` | boolean | No | false | Human-readable output |

```bash
npx -y octocode-tools get-file --owner expressjs --repo express --path lib/router/index.js --match "handle" --context-lines 10
```

### tree

View repository directory structure.

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--owner <owner>` | string | Yes | — | Repository owner |
| `--repo <repo>` | string | Yes | — | Repository name |
| `--branch <branch>` | string | No | — | Branch name |
| `--path <path>` | string | No | "" | Directory path |
| `--depth <n>` | number | No | 1 | Directory depth (1-2) |
| `--entries-per-page <n>` | number | No | 50 | Entries per page (1-200) |
| `--page <n>` | number | No | 1 | Page number |
| `--pretty` | boolean | No | false | Human-readable output |

```bash
npx -y octocode-tools tree --owner facebook --repo react --path packages --depth 2
```

### search-repos

Search GitHub repositories.

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--keywords <words>` | string | No | — | Comma-separated keywords |
| `--topics <topics>` | string | No | — | Comma-separated topics |
| `--owner <owner>` | string | No | — | Repository owner |
| `--stars <range>` | string | No | — | Stars filter (e.g., >100, 50..200) |
| `--size <range>` | string | No | — | Size filter in KB |
| `--created <range>` | string | No | — | Created date filter |
| `--updated <range>` | string | No | — | Updated date filter |
| `--match <fields>` | string | No | — | Match in: name,description,readme |
| `--sort <field>` | string | No | — | Sort by: forks\|stars\|updated\|best-match |
| `--limit <n>` | number | No | 10 | Results per page (1-100) |
| `--page <n>` | number | No | 1 | Page number (1-10) |
| `--pretty` | boolean | No | false | Human-readable output |

```bash
npx -y octocode-tools search-repos --keywords "react,state,management" --sort stars --limit 5
```

### search-prs

Search pull requests on GitHub.

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--query <text>` | string | No | — | Search query (max 256 chars) |
| `--owner <owner>` | string | No | — | Repository owner |
| `--repo <repo>` | string | No | — | Repository name |
| `--pr-number <n>` | number | No | — | Specific PR number |
| `--state <state>` | string | No | — | State: open\|closed |
| `--author <user>` | string | No | — | PR author |
| `--assignee <user>` | string | No | — | PR assignee |
| `--label <labels>` | string | No | — | Comma-separated labels |
| `--head <branch>` | string | No | — | Head branch |
| `--base <branch>` | string | No | — | Base branch |
| `--merged` | boolean | No | false | Only merged PRs |
| `--draft` | boolean | No | false | Only draft PRs |
| `--created <range>` | string | No | — | Created date filter |
| `--updated <range>` | string | No | — | Updated date filter |
| `--sort <field>` | string | No | — | Sort by: created\|updated\|best-match |
| `--order <dir>` | string | No | desc | Order: asc\|desc |
| `--limit <n>` | number | No | 5 | Results per page (1-10) |
| `--page <n>` | number | No | 1 | Page number (1-10) |
| `--with-comments` | boolean | No | false | Include PR comments |
| `--with-commits` | boolean | No | false | Include PR commits |
| `--content-type <type>` | string | No | metadata | Content: metadata\|fullContent\|partialContent |
| `--char-offset <n>` | number | No | — | Character offset for pagination |
| `--char-length <n>` | number | No | — | Character length for pagination |
| `--pretty` | boolean | No | false | Human-readable output |

```bash
npx -y octocode-tools search-prs --owner expressjs --repo express --query "security fix" --merged --limit 3
```

### search-packages

Search npm or PyPI packages.

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--name <name>` | string | Yes | — | Package name to search |
| `--ecosystem <type>` | string | Yes | — | Ecosystem: npm\|python |
| `--limit <n>` | number | No | 1 | Search result limit (1-10) |
| `--fetch-metadata` | boolean | No | false | Fetch detailed package metadata |
| `--pretty` | boolean | No | false | Human-readable output |

```bash
npx -y octocode-tools search-packages --name express --ecosystem npm --fetch-metadata
```

---

## Local Commands

### local-search

Search local code using ripgrep.

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--pattern <pattern>` | string | Yes | — | Search pattern (regex) |
| `--path <path>` | string | Yes | — | Directory or file path |
| `--mode <mode>` | string | No | — | Mode: discovery\|paginated\|detailed |
| `--fixed-string` | boolean | No | false | Treat pattern as literal string |
| `--smart-case` | boolean | No | true | Smart case matching |
| `--case-insensitive` | boolean | No | false | Case insensitive search |
| `--case-sensitive` | boolean | No | false | Case sensitive search |
| `--whole-word` | boolean | No | false | Match whole words only |
| `--invert-match` | boolean | No | false | Invert match |
| `--type <type>` | string | No | — | File type filter (e.g., ts, py, go) |
| `--include <patterns>` | string | No | — | Comma-separated include globs |
| `--exclude <patterns>` | string | No | — | Comma-separated exclude globs |
| `--exclude-dir <dirs>` | string | No | — | Comma-separated directories to exclude |
| `--no-ignore` | boolean | No | false | Don't respect .gitignore |
| `--hidden` | boolean | No | false | Search hidden files |
| `--files-only` | boolean | No | false | Return file paths only |
| `--count` | boolean | No | false | Return match counts only |
| `--context-lines <n>` | number | No | — | Context lines around matches (0-50) |
| `--max-files <n>` | number | No | — | Maximum files to search (1-1000) |
| `--files-per-page <n>` | number | No | 10 | Files per page (1-50) |
| `--file-page <n>` | number | No | 1 | File page number |
| `--multiline` | boolean | No | false | Enable multiline matching |
| `--sort <field>` | string | No | path | Sort: path\|modified\|accessed\|created |
| `--pretty` | boolean | No | false | Human-readable output |

```bash
npx -y octocode-tools local-search --pattern "handleAuth" --path ./src --type ts --context-lines 3
```

### local-file

Read local file content with targeted extraction.

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--path <path>` | string | Yes | — | File path |
| `--full-content` | boolean | No | false | Get full file content |
| `--start-line <n>` | number | No | — | Start line number |
| `--end-line <n>` | number | No | — | End line number |
| `--match <string>` | string | No | — | Extract lines matching this string |
| `--context-lines <n>` | number | No | 5 | Context lines around match (1-50) |
| `--match-regex` | boolean | No | false | Treat match string as regex |
| `--match-case-sensitive` | boolean | No | false | Case-sensitive match |
| `--char-offset <n>` | number | No | — | Character offset for pagination |
| `--char-length <n>` | number | No | — | Character length for pagination |
| `--pretty` | boolean | No | false | Human-readable output |

```bash
npx -y octocode-tools local-file --path ./src/auth.ts --match "validateToken" --context-lines 10
```

### local-find

Find local files by name, type, or metadata.

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--path <path>` | string | Yes | — | Directory path to search |
| `--name <pattern>` | string | No | — | Filename pattern (exact or glob) |
| `--iname <pattern>` | string | No | — | Case-insensitive filename pattern |
| `--names <patterns>` | string | No | — | Comma-separated filename patterns |
| `--regex <pattern>` | string | No | — | Regex pattern for filename |
| `--type <type>` | string | No | — | File type: f\|d\|l (file\|dir\|link) |
| `--empty` | boolean | No | false | Find empty files/dirs |
| `--max-depth <n>` | number | No | — | Max directory depth (1-10) |
| `--min-depth <n>` | number | No | — | Min directory depth (0-10) |
| `--modified-within <time>` | string | No | — | Modified within (e.g., 1h, 7d) |
| `--modified-before <time>` | string | No | — | Modified before |
| `--size-greater <size>` | string | No | — | Larger than (e.g., 1k, 1M) |
| `--size-less <size>` | string | No | — | Smaller than |
| `--exclude-dir <dirs>` | string | No | — | Comma-separated directories to exclude |
| `--sort-by <field>` | string | No | modified | Sort: modified\|size\|name\|path |
| `--limit <n>` | number | No | — | Max results |
| `--details` | boolean | No | true | Show file details |
| `--files-per-page <n>` | number | No | 20 | Files per page (1-50) |
| `--file-page <n>` | number | No | 1 | Page number |
| `--pretty` | boolean | No | false | Human-readable output |

```bash
npx -y octocode-tools local-find --path . --name "*.test.ts" --modified-within 7d --sort-by modified
```

### local-tree

View local directory structure.

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--path <path>` | string | Yes | — | Directory path |
| `--details` | boolean | No | false | Show file details |
| `--hidden` | boolean | No | false | Show hidden files |
| `--sort-by <field>` | string | No | time | Sort: name\|size\|time\|extension |
| `--reverse` | boolean | No | false | Reverse sort order |
| `--entries-per-page <n>` | number | No | 20 | Entries per page (1-50) |
| `--page <n>` | number | No | 1 | Page number |
| `--pattern <pattern>` | string | No | — | Glob pattern filter |
| `--dirs-only` | boolean | No | false | Show directories only |
| `--files-only` | boolean | No | false | Show files only |
| `--extension <ext>` | string | No | — | Filter by extension |
| `--extensions <exts>` | string | No | — | Comma-separated extensions |
| `--depth <n>` | number | No | — | Directory depth (1-5) |
| `--recursive` | boolean | No | false | Recursive listing |
| `--limit <n>` | number | No | — | Max entries |
| `--summary` | boolean | No | true | Show summary |
| `--pretty` | boolean | No | false | Human-readable output |

```bash
npx -y octocode-tools local-tree --path ./src --depth 2 --extension ts --sort-by name
```

---

## LSP Commands

All LSP commands require `--line-hint` obtained from a prior `local-search` result. The line hint is 1-indexed.

### lsp-definition

Go to symbol definition.

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--uri <path>` | string | Yes | — | File path |
| `--symbol <name>` | string | Yes | — | Symbol name |
| `--line-hint <n>` | number | Yes | — | Line number hint (1-indexed) |
| `--order-hint <n>` | number | No | 0 | Order hint for same-line symbols |
| `--context-lines <n>` | number | No | 5 | Context lines (0-20) |
| `--char-offset <n>` | number | No | — | Character offset for pagination |
| `--char-length <n>` | number | No | — | Character length for pagination |
| `--pretty` | boolean | No | false | Human-readable output |

```bash
npx -y octocode-tools lsp-definition --uri ./src/auth.ts --symbol "validateToken" --line-hint 42
```

### lsp-references

Find all references to a symbol.

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--uri <path>` | string | Yes | — | File path |
| `--symbol <name>` | string | Yes | — | Symbol name |
| `--line-hint <n>` | number | Yes | — | Line number hint (1-indexed) |
| `--order-hint <n>` | number | No | 0 | Order hint for same-line symbols |
| `--include-declaration` | boolean | No | true | Include declaration |
| `--no-include-declaration` | boolean | No | — | Exclude declaration |
| `--context-lines <n>` | number | No | 2 | Context lines (0-10) |
| `--refs-per-page <n>` | number | No | 20 | References per page (1-50) |
| `--page <n>` | number | No | 1 | Page number |
| `--include-pattern <patterns>` | string | No | — | Comma-separated include glob patterns |
| `--exclude-pattern <patterns>` | string | No | — | Comma-separated exclude glob patterns |
| `--pretty` | boolean | No | false | Human-readable output |

```bash
npx -y octocode-tools lsp-references --uri ./src/auth.ts --symbol "validateToken" --line-hint 42 --context-lines 3
```

### lsp-call-hierarchy

Trace call relationships (incoming/outgoing).

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--uri <path>` | string | Yes | — | File path |
| `--symbol <name>` | string | Yes | — | Symbol name |
| `--line-hint <n>` | number | Yes | — | Line number hint (1-indexed) |
| `--direction <dir>` | string | Yes | — | Direction: incoming\|outgoing |
| `--order-hint <n>` | number | No | 0 | Order hint for same-line symbols |
| `--depth <n>` | number | No | 1 | Call depth (1-3) |
| `--context-lines <n>` | number | No | 2 | Context lines (0-10) |
| `--calls-per-page <n>` | number | No | 15 | Calls per page (1-30) |
| `--page <n>` | number | No | 1 | Page number |
| `--char-offset <n>` | number | No | — | Character offset for pagination |
| `--char-length <n>` | number | No | — | Character length for pagination |
| `--pretty` | boolean | No | false | Human-readable output |

```bash
npx -y octocode-tools lsp-call-hierarchy --uri ./src/auth.ts --symbol "validateToken" --line-hint 42 --direction incoming --depth 2
```
