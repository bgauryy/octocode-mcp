---
name: octocode-research
description: Code research for external (GitHub) and local code exploration. Initiate when user wants to research some code or implementation or finding docs anywhere
---

# Octocode Research Skill

HTTP API server for code research at `http://localhost:1987`

> **Local Server**: Runs on user's machine with direct filesystem and LSP access.

---

## How to Use This Skill

**Before starting research, read the relevant guides:**

| Research Type | Read First |
|---------------|------------|
| **Local codebase** | [research_local_prompt.md](./references/research_local_prompt.md) - Task classification, flow patterns, LSP usage |
| **GitHub/packages** | [research_external_prompt.md](./references/research_external_prompt.md) - Package lookup, repo exploration, PR search |
| **Presenting results** | [output_protocol.md](./references/output_protocol.md) - Quality standards, adaptive output, when to save docs |

**When using specific endpoints**, consult the endpoint reference for parameters and examples:
- Each endpoint has a dedicated doc in `./references/` with HTTP examples and response structure

**The reference docs explain:**
- Which tools to use for which questions (task classification)
- Required workflows (e.g., search → get lineHint → LSP tools)
- Common mistakes to avoid
- How to present findings based on question complexity

---

## CRITICAL: Always Check Server Health First

**BEFORE making ANY API request**, you MUST verify the server is running:

```bash
# Step 1: ALWAYS check health first
curl -s http://localhost:1987/health || echo "SERVER_NOT_RUNNING"

# Step 2: If not running, start the server
cd /path/to/octocode-research && ./install.sh start

# Step 3: Verify it's running
curl -s http://localhost:1987/health
# Expected: {"status":"ok","port":1987,"version":"2.0.0"}

# Step 4: NOW you can make API calls

```

**Why this matters**: The server runs locally and may not be started. Making API calls without checking health first will result in connection errors (exit code 7).

---

## LSP + Local Tools Coordination (CRITICAL)

<critical-coordination>
**THE GOLDEN RULE**: Search first → Get lineHint → Then LSP

```
/local/search(pattern="X") → Response contains line numbers
                ↓
         Extract lineHint from matches[].line
                ↓
/lsp/definition OR /lsp/references OR /lsp/calls (with lineHint)
```

**NEVER**:
- Call LSP tools without lineHint from search
- Use `/lsp/calls` for types/variables (use `/lsp/references` instead)
- Read files to understand flow (use `/lsp/calls`)

**Full guide**: [lsp_local_coordination.md](./references/lsp_local_coordination.md)
</critical-coordination>

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

<decision-tree>
<condition test="Is it LOCAL codebase?">
<yes>Use /local/* + /lsp/* tools
  <condition test="Flow question?">
  <yes>/lsp/calls REQUIRED - see research_local_prompt.md</yes>
  </condition>
</yes>
<no>Use /github/* or /package/* - see research_external_prompt.md</no>
</condition>
</decision-tree>

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

<critical-rules>
<rule id="thinking">
**IMPORTANT!** Always show your thinking and reasoning steps during research. Explain what you're looking for, why you chose specific tools/endpoints, and how findings connect to the research goal.
</rule>
<rule id="health-check">
**Health check FIRST** - Server may not be running. Check /health before ANY request.
</rule>
<rule id="linehint">
**Search first → get lineHint → LSP** - LSP tools need accurate line numbers from search results.
</rule>
<rule id="flow-tracing">
**Use /lsp/calls for flow tracing** - File reading alone misses call relationships.
</rule>
<rule id="parallel">
**Parallel calls for speed** - Server handles concurrent requests (3x faster).
</rule>
<rule id="no-guessing">
**Never guess line numbers** - Always get lineHint from search results.
</rule>
</critical-rules>

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

**Adaptive output based on question complexity:**

| Question Type | Output | Save Doc? |
|---------------|--------|-----------|
| Quick lookup | Direct answer + path | No |
| Flow trace | Structured summary | Offer |
| Multi-axis / Complex | Full research doc | Recommend |

**Quality bar (all research)**:
- **Fact-based**: Every claim backed by actual code
- **Evidence-linked**: Path + line number for every finding
- **Verified**: Cross-referenced where possible

**Complex research**: Use multi-agent orchestration (spawn parallel Tasks)

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

## Best Practices

<best-practices>
<do>
- **Search first** → get `lineHint` → then LSP tools
- **Use `/lsp/calls`** for flow/trace questions
- **Run parallel calls** for independent queries
- **Use `mode=discovery`** for fast initial file discovery
- **Use `matchString`** for large files instead of `fullContent`
- **Use `depth=1`** for call hierarchy, chain manually
- **Start `/github/structure` at root** with `depth=1`, drill into subdirs
</do>
<dont>
- Don't read files to understand flow → Use `/lsp/calls`
- Don't guess line numbers → Always search first
- Don't use `/lsp/calls` on types/variables → Use `/lsp/references`
- Don't use `fullContent=true` on large files
- Don't combine too many filters in `/github/search`
</dont>
</best-practices>

---

## Error Recovery

<error-recovery>
<error type="server-not-running">
<symptom>Connection refused, exit code 7</symptom>
<solution>Check /health first, run `./install.sh start`</solution>
</error>
<error type="symbol-not-found">
<symptom>Symbol not found in LSP response</symptom>
<solution>Use `/local/search` to find correct line number</solution>
</error>
<error type="empty-result">
<symptom>Empty result set from search</symptom>
<solution>Try semantic variants (auth→login→credentials→session)</solution>
</error>
<error type="too-many-results">
<symptom>Result set too large to process</symptom>
<solution>Add filters (`path`, `type`, `excludeDir`, `owner`/`repo`)</solution>
</error>
<error type="file-too-large">
<symptom>FILE_TOO_LARGE error</symptom>
<solution>Use `matchString` or `startLine`/`endLine`</solution>
</error>
<error type="lsp-timeout">
<symptom>LSP timeout on deep call hierarchy</symptom>
<solution>Reduce `depth`, chain manually with `depth=1`</solution>
</error>
<error type="lsp-fails">
<symptom>LSP returns error or empty</symptom>
<solution>Fall back to `/local/search` results</solution>
</error>
<error type="rate-limited">
<symptom>Rate limit exceeded (GitHub API)</symptom>
<solution>Reduce batch size, wait</solution>
</error>
<error type="blocked">
<symptom>Research blocked, no progress</symptom>
<solution>Summarize attempts and ask user</solution>
</error>
</error-recovery>

---

## Reference Guides

| Guide | Purpose |
|-------|---------|
| [research_local_prompt.md](./references/research_local_prompt.md) | Local codebase research patterns |
| [research_external_prompt.md](./references/research_external_prompt.md) | GitHub/package research patterns |
| [lsp_local_coordination.md](./references/lsp_local_coordination.md) | **LSP + Local tools coordination (CRITICAL)** |
| [task_integration.md](./references/task_integration.md) | Claude Code Task tool integration |
| [output_protocol.md](./references/output_protocol.md) | Output format and document templates |

## Technical Documentation

| Doc | Purpose |
|-----|---------|
| [IMPROVEMENTS.md](./docs/IMPROVEMENTS.md) | Context propagation, retry logic, resilience patterns |
| [RESPONSE_FORMAT_IMPROVEMENT.md](./docs/RESPONSE_FORMAT_IMPROVEMENT.md) | Response formatting enhancements |
