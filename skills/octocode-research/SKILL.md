---
name: octocode-research
description: Code research HTTP server (localhost:1987) for local and external (GitHub) code exploration with LSP support.
---

# Octocode Research Skill

HTTP API server for code research at `http://localhost:1987`.

> **Local Server**: Runs on user's machine with direct filesystem and LSP access.

---

## Quick Start

```bash
./install.sh start          # Install and start
curl http://localhost:1987/health   # Verify running
./install.sh logs           # View logs
```

---

## Available Endpoints

**Base URL**: `http://localhost:1987`

### Local Tools
| Endpoint | Description | Docs |
|----------|-------------|------|
| `/local/search` | Search code patterns (ripgrep) | [ref](./references/localSearchCode.md) |
| `/local/content` | Read file content | [ref](./references/localGetFileContent.md) |
| `/local/structure` | Directory tree | [ref](./references/localViewStructure.md) |
| `/local/find` | Find files by metadata | [ref](./references/localFindFiles.md) |

### LSP Tools (Semantic)
| Endpoint | Description | Docs |
|----------|-------------|------|
| `/lsp/definition` | Go to definition | [ref](./references/lspGotoDefinition.md) |
| `/lsp/references` | Find all usages | [ref](./references/lspFindReferences.md) |
| `/lsp/calls` | Call hierarchy | [ref](./references/lspCallHierarchy.md) |

### GitHub Tools
| Endpoint | Description | Docs |
|----------|-------------|------|
| `/github/search` | Search code | [ref](./references/githubSearchCode.md) |
| `/github/content` | Read file | [ref](./references/githubGetFileContent.md) |
| `/github/structure` | Repo tree | [ref](./references/githubViewRepoStructure.md) |
| `/github/repos` | Search repos | [ref](./references/githubSearchRepositories.md) |
| `/github/prs` | Search PRs | [ref](./references/githubSearchPullRequests.md) |

### Package Tools
| Endpoint | Description | Docs |
|----------|-------------|------|
| `/package/search` | npm/PyPI search | [ref](./references/packageSearch.md) |

---

## Decision Tree

```
Is it LOCAL codebase?
├── YES → /local/* + /lsp/*
│   └── Flow question? → /lsp/calls REQUIRED
│       📖 See: research_local_prompt.md
└── NO  → /github/* or /package/*
        📖 See: research_external_prompt.md
```

---

## Research Flows

### Local: `DISCOVER → EXECUTE → VERIFY → OUTPUT`

```
/local/structure → understand layout
/local/search → find symbols, get lineHint
/lsp/calls → trace flow (incoming/outgoing)
/local/content → read implementation (LAST)
```

### External: `PREPARE → DISCOVER → ANALYZE → OUTPUT`

```
/package/search → get repo URL
/github/structure → explore layout
/github/search → find code
/github/content → read details
```

**Detailed guides**: [Local](./references/research_local_prompt.md) | [External](./references/research_external_prompt.md)

---

## Critical Rules

| Rule | Why |
|------|-----|
| **Search first → get lineHint → LSP** | LSP needs accurate line numbers |
| **Use `/lsp/calls` for flow tracing** | File reading alone misses call relationships |
| **Parallel calls for speed** | Server handles concurrent requests (3x faster) |
| **Never guess line numbers** | Always get lineHint from search results |

---

## Required Parameters

All endpoints require research context:

| Parameter | Purpose |
|-----------|---------|
| `mainResearchGoal` | Overall objective (constant across session) |
| `researchGoal` | This query's specific goal |
| `reasoning` | Why this approach helps |

---

## Integration Patterns

| Pattern | When | How |
|---------|------|-----|
| **Direct Skill** | Simple questions | `/octocode-research` |
| **Task + Explore** | Complex exploration | `Task(subagent_type="Explore")` |
| **Parallel Tasks** | Multi-axis research | Multiple Tasks in one message |

**Full guide**: [Task Integration](./references/task_integration.md)

---

## Output Protocol

1. **Research until quality** - Multiple evidence points, flows traced
2. **Present summary** - TL;DR + findings + evidence
3. **Ask user** - Save? Continue? Something else?
4. **Save if requested** - `.octocode/research/{session-name}/`

**Full guide**: [Output Protocol](./references/output_protocol.md)

---

## Logging

Logs: `~/.octocode/logs/`

| File | Contents |
|------|----------|
| `tools.log` | All tool calls with params, duration |
| `errors.log` | Validation/server errors |

```bash
tail -50 ~/.octocode/logs/tools.log   # Recent calls
cat ~/.octocode/logs/errors.log       # Errors
```

---

## Quick Example

**Question**: "How does authentication work?"

```bash
# 1. Find entry points
curl "http://localhost:1987/local/search?pattern=authenticate&path=/project/src"
# → Found at line 15

# 2. Trace flow (parallel)
curl "http://localhost:1987/lsp/calls?uri=...&symbolName=authenticate&lineHint=15&direction=incoming" &
curl "http://localhost:1987/lsp/calls?uri=...&symbolName=authenticate&lineHint=15&direction=outgoing" &

# 3. Read implementation (after understanding flow)
curl "http://localhost:1987/local/content?path=...&startLine=10&endLine=30"

# 4. Present summary → Ask user → Save
```

---

## Reference Guides

| Guide | Purpose |
|-------|---------|
| [research_local_prompt.md](./references/research_local_prompt.md) | Local codebase research patterns |
| [research_external_prompt.md](./references/research_external_prompt.md) | GitHub/package research patterns |
| [task_integration.md](./references/task_integration.md) | Claude Code Task tool integration |
| [output_protocol.md](./references/output_protocol.md) | Output format and document templates |
