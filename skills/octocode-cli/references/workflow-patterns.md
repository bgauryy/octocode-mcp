# Workflow Patterns

Research flow recipes using octocode-cli CLI. Each pattern shows when to use it and the exact command sequence.

## Table of Contents
- [Local Patterns](#local-patterns)
- [External (GitHub) Patterns](#external-github-patterns)
- [Combined Patterns](#combined-patterns)
- [Transition Matrix](#transition-matrix)

---

## Local Patterns

### Explore-First
**When**: Unknown codebase, need to understand structure before searching.

```bash
# 1. Survey the structure
npx -y octocode-cli local-tree --path . --depth 2

# 2. Drill into interesting directory
npx -y octocode-cli local-tree --path ./src --depth 2 --extension ts

# 3. Search for specific patterns
npx -y octocode-cli local-search --pattern "handleAuth" --path ./src --type ts
```

### Search-First
**When**: Know WHAT you're looking for, not WHERE it is.

```bash
# 1. Find files containing the pattern
npx -y octocode-cli local-search --pattern "handleAuth" --path . --files-only --type ts

# 2. Read the relevant section
npx -y octocode-cli local-file --path ./src/auth/handler.ts --match "handleAuth" --context-lines 10
```

### Trace-from-Match (LSP Flow)
**When**: Need impact analysis, call graph, or usage tracking.

```bash
# 1. Search to get line hint (REQUIRED before any LSP command)
npx -y octocode-cli local-search --pattern "validateToken" --path ./src --type ts

# 2. Go to definition
npx -y octocode-cli lsp-definition --uri ./src/auth.ts --symbol "validateToken" --line-hint 42

# 3. Find all references
npx -y octocode-cli lsp-references --uri ./src/auth.ts --symbol "validateToken" --line-hint 42

# 4. Trace incoming calls (who calls this?)
npx -y octocode-cli lsp-call-hierarchy --uri ./src/auth.ts --symbol "validateToken" --line-hint 42 --direction incoming

# 5. Trace outgoing calls (what does this call?)
npx -y octocode-cli lsp-call-hierarchy --uri ./src/auth.ts --symbol "validateToken" --line-hint 42 --direction outgoing

# 6. Read implementation LAST
npx -y octocode-cli local-file --path ./src/auth.ts --match "validateToken" --context-lines 20
```

### Metadata Sweep
**When**: Looking for recent changes, regressions, or files by attributes.

```bash
# 1. Find recently modified files
npx -y octocode-cli local-find --path ./src --modified-within 7d --type f --sort-by modified

# 2. Search those files for patterns
npx -y octocode-cli local-search --pattern "TODO\|FIXME\|HACK" --path ./src --type ts

# 3. Confirm with content
npx -y octocode-cli local-file --path ./src/found-file.ts --match "TODO"
```

### Large File Navigation
**When**: Dealing with large files, bundles, or generated code.

```bash
# Use matchString for targeted extraction
npx -y octocode-cli local-file --path ./src/large-file.ts --match "exportFunction" --context-lines 10

# Or use line ranges
npx -y octocode-cli local-file --path ./src/large-file.ts --start-line 100 --end-line 150

# Or paginate with character offsets
npx -y octocode-cli local-file --path ./src/large-file.ts --char-offset 0 --char-length 4000
```

### node_modules Investigation
**When**: Need to check dependency internals.

```bash
# Search inside node_modules (bypasses .gitignore)
npx -y octocode-cli local-search --pattern "createServer" --path ./node_modules/express --no-ignore --type js

# Read the implementation
npx -y octocode-cli local-file --path ./node_modules/express/lib/express.js --match "createServer"
```

---

## External (GitHub) Patterns

### Package Discovery
**When**: Finding or comparing libraries/packages.

```bash
# 1. Search for packages
npx -y octocode-cli search-packages --name "state-management" --ecosystem npm --limit 5

# 2. Explore the top result's repo
npx -y octocode-cli tree --owner pmndrs --repo zustand --depth 2

# 3. Read the implementation
npx -y octocode-cli get-file --owner pmndrs --repo zustand --path src/vanilla.ts --match "createStore"
```

### Repo Exploration
**When**: Understanding how another project works.

```bash
# 1. Find relevant repos
npx -y octocode-cli search-repos --keywords "react,testing,library" --sort stars --limit 5

# 2. Explore structure
npx -y octocode-cli tree --owner testing-library --repo react-testing-library --path src --depth 2

# 3. Search for patterns
npx -y octocode-cli search-code --keywords "render,screen" --owner testing-library --repo react-testing-library --extension ts

# 4. Read key files
npx -y octocode-cli get-file --owner testing-library --repo react-testing-library --path src/pure.ts
```

### Dependency Source
**When**: Understanding library internals via GitHub.

```bash
# 1. Find the package and its repo
npx -y octocode-cli search-packages --name express --ecosystem npm --fetch-metadata

# 2. Explore repo structure
npx -y octocode-cli tree --owner expressjs --repo express --path lib --depth 2

# 3. Search for implementation
npx -y octocode-cli search-code --keywords "Router,handle" --owner expressjs --repo express --extension js

# 4. Read specific implementation
npx -y octocode-cli get-file --owner expressjs --repo express --path lib/router/index.js --match "handle"
```

### PR Archaeology
**When**: Understanding why code changed.

```bash
# 1. Search for relevant merged PRs
npx -y octocode-cli search-prs --owner expressjs --repo express --query "security middleware" --merged --limit 5

# 2. Get PR details with commits
npx -y octocode-cli search-prs --owner expressjs --repo express --pr-number 5678 --with-commits --content-type fullContent

# 3. Read the changed files
npx -y octocode-cli get-file --owner expressjs --repo express --path lib/security.js
```

---

## Combined Patterns

### Cross-Boundary (Local + External)
**When**: Local code uses an external library — need to understand both sides.

```bash
# 1. Find local usage
npx -y octocode-cli local-search --pattern "from 'express'" --path ./src --type ts

# 2. Find the package source
npx -y octocode-cli search-packages --name express --ecosystem npm

# 3. Search the library's implementation
npx -y octocode-cli search-code --keywords "Router,use" --owner expressjs --repo express --extension js

# 4. Read the relevant source
npx -y octocode-cli get-file --owner expressjs --repo express --path lib/router/index.js --match "use"
```

### Full Research Funnel
**When**: Comprehensive research from discovery to understanding.

```bash
# 1. DISCOVER — Find repos
npx -y octocode-cli search-repos --keywords "authentication,jwt,middleware" --sort stars --limit 5

# 2. EXPLORE — Understand structure
npx -y octocode-cli tree --owner auth0 --repo express-jwt --depth 2

# 3. SEARCH — Find patterns
npx -y octocode-cli search-code --keywords "verify,middleware" --owner auth0 --repo express-jwt --extension ts

# 4. READ — Get implementation (LAST)
npx -y octocode-cli get-file --owner auth0 --repo express-jwt --path src/index.ts --match "verify"

# 5. HISTORY — Why did it change?
npx -y octocode-cli search-prs --owner auth0 --repo express-jwt --query "breaking change" --merged
```

---

## Transition Matrix

Complete decision table for what to do next based on current state and need.

| From | Need... | Go To |
|------|---------|-------|
| `local-tree` | Find pattern | `local-search` |
| `local-tree` | Drill deeper | `local-tree` (increase depth) |
| `local-tree` | File content | `local-file` |
| `local-search` | Definition | `lsp-definition` (use --line-hint) |
| `local-search` | All usages | `lsp-references` (use --line-hint) |
| `local-search` | Call flow | `lsp-call-hierarchy` (use --line-hint) |
| `local-search` | More patterns | `local-search` (refine query) |
| `local-search` | Empty results | `local-find` or `local-tree` |
| `local-find` | Content | `local-search` on returned paths |
| `lsp-definition` | Usages | `lsp-references` |
| `lsp-definition` | Call graph | `lsp-call-hierarchy` |
| `lsp-definition` | Read def | `local-file` (LAST) |
| `lsp-references` | Call flow | `lsp-call-hierarchy` (functions) |
| `lsp-call-hierarchy` | Deeper | `lsp-call-hierarchy` on caller/callee |
| Any local | External repo | `tree` → `search-code` |
| Any local | Package source | `search-packages` → `tree` |
| Any local | PR history | `search-prs` |
| `search-packages` | Repo structure | `tree` |
| `tree` | Find pattern | `search-code` |
| `search-code` | Read file | `get-file` |
| `search-code` | Related PRs | `search-prs` |

### LSP Tool Selection

| Symbol Type | Tool | Why |
|-------------|------|-----|
| Function/Method | `lsp-call-hierarchy --direction incoming` | Call relationships |
| Type/Interface/Class | `lsp-references` | All usages (call-hierarchy fails for types) |
| Variable/Constant | `lsp-references` | All usages (call-hierarchy fails for variables) |
