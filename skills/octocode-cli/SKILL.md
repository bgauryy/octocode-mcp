---
name: octocode-cli
description: "Code research and analysis using octocode-cli CLI (npx). Use when user asks to research, search, explore, find, trace, or analyze code — on GitHub, local codebase, or packages. Triggers: 'find X on GitHub', 'search repo', 'explore library', 'trace definition', 'find PRs about', 'search packages', 'who calls function X', 'how does Y work in Z repo', 'find usages of X', 'what package does Y'. Also provides documentation writing, PR review, RFC generation, planning, prompt optimization, and code roasting via reference skills. Use this skill even when the user doesn't explicitly mention 'octocode' — any code search, exploration, or research need across GitHub or local files should use these CLI tools."
---

# Octocode CLI — Code Research & Analysis

`DISCOVER` → `EXPLORE` → `SEARCH` → `ANALYZE` → `READ`

All commands run via `npx -y octocode-cli <command> [flags]` using the Bash tool.

---

## 1. Setup

**Authentication** (first match wins):

| Priority | Source | Setup |
|----------|--------|-------|
| 1 | `OCTOCODE_TOKEN` env var | `export OCTOCODE_TOKEN=ghp_xxx` |
| 2 | `GH_TOKEN` env var | `export GH_TOKEN=ghp_xxx` |
| 3 | `GITHUB_TOKEN` env var | `export GITHUB_TOKEN=ghp_xxx` |
| 4 | Octocode storage | `~/.octocode/credentials.json` |
| 5 | **gh CLI** (easiest) | `gh auth login` — no env vars needed after this |

If `gh` CLI is authenticated, no configuration is needed.

---

## 2. Quick Reference

| Question | Command |
|----------|---------|
| "Where is X defined?" | `local-search --pattern "X"` → `lsp-definition` |
| "Who calls function Y?" | `local-search --pattern "Y"` → `lsp-call-hierarchy --direction incoming` |
| "All usages of type Z?" | `local-search --pattern "Z"` → `lsp-references` |
| "Find X on GitHub" | `search-code --keywords-to-search "X" --owner O --repo R` |
| "Explore repo structure" | `tree --owner O --repo R --depth 2` |
| "Find library/package Z" | `search-packages --name Z --ecosystem npm` |
| "Read file from repo" | `get-file --owner O --repo R --path path/to/file` |
| "Search PRs about X" | `search-prs --owner O --repo R --query "X"` |
| "Find repos about X" | `search-repos --keywords-to-search "X" --sort stars` |
| "Search local code" | `local-search --pattern "X" --path ./src` |
| "Read local file" | `local-file --path ./src/file.ts --match-string "pattern"` |
| "Find files by name" | `local-find --path . --name "*.ts"` |
| "View local directory" | `local-tree --path ./src --depth 2` |

---

## 3. Invocation

All commands use the Bash tool:

```bash
npx -y octocode-cli <command> [flags]
```

**Output**: JSON to stdout by default. Add `--pretty` for human-readable format. Errors go to stderr.

Every command has `--help`:
```bash
npx -y octocode-cli --help
npx -y octocode-cli search-code --help
```

---

## 4. The Funnel Method

Progressive narrowing — each stage reduces scope. Never skip stages.

```
DISCOVER  →  EXPLORE  →  SEARCH  →  ANALYZE  →  READ (LAST)
    |           |           |           |           |
    v           v           v           v           v
 Repos &     Structure   Pattern    Semantic    Implementation
 Packages   & Scope     Matching   Analysis     Details
```

| Stage | Commands | Purpose |
|-------|----------|---------|
| DISCOVER | `search-repos`, `search-packages` | Find the right repo/package |
| EXPLORE | `tree`, `local-tree` | Understand structure, narrow scope |
| SEARCH | `search-code`, `local-search` | Find patterns, get file locations |
| ANALYZE | `lsp-definition`, `lsp-references`, `lsp-call-hierarchy` | Semantic code intelligence |
| READ | `get-file`, `local-file` | Implementation details — **LAST** |
| HISTORY | `search-prs` | Change context, why code changed |

**Golden Rule**: Search narrows → LSP identifies → Read confirms.

---

## 5. Commands

### GitHub

| Command | Key Flags | Example |
|---------|-----------|---------|
| `search-code` | `--keywords-to-search` (required, comma-sep), `--owner`, `--repo`, `--extension`, `--limit` | `search-code --keywords-to-search "useState,hook" --owner facebook --repo react` |
| `get-file` | `--owner`, `--repo`, `--path` (all required), `--match-string`, `--match-string-context-lines` | `get-file --owner expressjs --repo express --path lib/router/index.js --match-string "handle"` |
| `tree` | `--owner`, `--repo` (required), `--path`, `--depth` | `tree --owner expressjs --repo express --path lib --depth 2` |
| `search-repos` | `--keywords-to-search`, `--topics-to-search`, `--stars`, `--sort` | `search-repos --keywords-to-search "react,state" --sort stars --limit 5` |
| `search-prs` | `--owner`, `--repo`, `--query`, `--merged`, `--state` | `search-prs --owner expressjs --repo express --query "security" --merged` |

| `search-packages` | `--name` (required), `--ecosystem` (npm\|python) | `search-packages --name fastapi --ecosystem python` |

### Local

| Command | Key Flags | Example |
|---------|-----------|---------|
| `local-search` | `--pattern` (required), `--path` (required), `--type`, `--files-only` | `local-search --pattern "handleAuth" --path ./src --type ts` |
| `local-file` | `--path` (required), `--match-string`, `--start-line`, `--end-line` | `local-file --path ./src/auth.ts --match-string "validateToken"` |
| `local-find` | `--path` (required), `--name`, `--type`, `--modified-within` | `local-find --path . --name "*.test.ts" --modified-within 7d` |
| `local-tree` | `--path` (required), `--depth`, `--extension`, `--sort-by` | `local-tree --path ./src --depth 2 --extension ts` |

### LSP

All LSP commands require `--line-hint` from a prior `local-search` result. Never guess line numbers.

| Command | Key Flags | Example |
|---------|-----------|---------|
| `lsp-definition` | `--uri`, `--symbol-name`, `--line-hint` (all required) | `lsp-definition --uri ./src/auth.ts --symbol-name "validateToken" --line-hint 42` |
| `lsp-references` | `--uri`, `--symbol-name`, `--line-hint` (all required) | `lsp-references --uri ./src/auth.ts --symbol-name "validateToken" --line-hint 42` |
| `lsp-call-hierarchy` | `--uri`, `--symbol-name`, `--line-hint`, `--direction` (all required) | `lsp-call-hierarchy --uri ./src/auth.ts --symbol-name "validateToken" --line-hint 42 --direction incoming` |

> **Full command reference with all flags**: [references/command-reference.md](references/command-reference.md)

---

## 6. Research Flows

### Local Flow (LSP Triple Lock)

1. `local-search` first — get file path and line number
2. `lsp-definition` / `lsp-references` / `lsp-call-hierarchy` — use `--line-hint` from search
3. `local-file` — read implementation details **LAST**

Never call LSP commands without `--line-hint` from `local-search`.

### GitHub Flow

1. `search-packages` or `search-repos` — find the right repo
2. `tree` — understand repo layout
3. `search-code` — find specific patterns
4. `get-file` — read content **LAST**
5. `search-prs` — change history context

### Transition Matrix

| From | Need... | Go To |
|------|---------|-------|
| `local-tree` | Find pattern | `local-search` |
| `local-search` | Definition | `lsp-definition` (use --line-hint) |
| `local-search` | All usages | `lsp-references` (use --line-hint) |
| `local-search` | Call flow | `lsp-call-hierarchy` (use --line-hint) |
| `local-search` | Empty results | `local-find` or `local-tree` |
| `lsp-definition` | Usages | `lsp-references` |
| `lsp-definition` | Call graph | `lsp-call-hierarchy` |
| Any local | External repo | `tree` → `search-code` |
| Any local | Package source | `search-packages` → `tree` |
| Any local | PR history | `search-prs` |
| `search-packages` | Repo structure | `tree` |
| `tree` | Find pattern | `search-code` |
| `search-code` | Read file | `get-file` |

> **Full workflow patterns and recipes**: [references/workflow-patterns.md](references/workflow-patterns.md)

---

## 7. Error Recovery

| Situation | Action |
|-----------|--------|
| Empty results | Try semantic variants (auth → login → credentials → session) |
| Too many results | Add filters: `--extension`, `--path`, `--type` |
| Rate limit | Back off, batch fewer queries |
| Auth failure | Check `gh auth status` or set `GITHUB_TOKEN` |
| Large file | Use `--match-string` for targeted extraction, or `--start-line`/`--end-line` |
| LSP no results | Verify `--line-hint` from `local-search`; try broader search |
| 3 consecutive empties | Broaden: remove `--type`, try `--case-insensitive` |
| Blocked >2 attempts | Summarize what was tried, ask user |

---

## 8. Additional Capabilities

These reference skills provide specialized workflows. Read the relevant file when the user's request matches:

| Need | Reference File |
|------|---------------|
| Generate project documentation | [references/documentation-writer.md](references/documentation-writer.md) |
| Plan & implement a feature | [references/plan.md](references/plan.md) |
| Review a PR or local changes | [references/pr-reviewer.md](references/pr-reviewer.md) |
| Write an RFC / design doc | [references/rfc-generator.md](references/rfc-generator.md) |
| Optimize a prompt / SKILL.md | [references/prompt-optimizer.md](references/prompt-optimizer.md) |
| Roast code quality | [references/roast.md](references/roast.md) |

---

## 9. Principles

- **Evidence first** — find proof in code before claiming anything
- **Funnel method** — discover → explore → search → analyze → read
- **LSP requires search first** — never guess `--line-hint`
- **Read content LAST** — after search and LSP analysis
- **Use `--match-string` for large files** — targeted extraction over full content
- **Semantic variants** — when search is empty, try synonyms
- **Cite precisely** — include file paths and line numbers in answers
