---
name: octocode-research
description: Code research for external (GitHub) and local code exploration. Initiate when user wants to research some code or implementation or finding docs anywhere
---

# Octocode Research Skill

HTTP API server for intelligent code research at `http://localhost:1987`

> **Philosophy**: Research is discovery, not procedure. Let the data guide you.

---

## How This Skill Works

This skill provides tools for code exploration. Your job is to **think like a researcher**:

1. **Understand the question** - What does the user really want to know?
2. **Choose tools based on context** - Match tools to the information needed
3. **Adapt based on results** - Let findings guide next steps
4. **Explain your reasoning** - Show how you're thinking and reassoning steps, not just what you're doing

### ⚠️ IMPORTANT: Think About User Intent & Context

**Before making any tool calls**, you MUST think about what the user wants and load the correct context:

- **Local Research**: [research_local_prompt.md](./references/research_local_prompt.md)
- **External Research**: [research_external_prompt.md](./references/research_external_prompt.md)

Determine what type of research the user needs:

| User Intent | Read This First | Focus |
|-------------|-----------------|-------|
| Explore **local codebase** | [research_local_prompt.md](./references/research_local_prompt.md) | LSP tools, local search, file content |
| Explore **external code** (GitHub, packages) | [research_external_prompt.md](./references/research_external_prompt.md) | GitHub API, package search, repo exploration |
| Both local and external | Read **both** prompts | Combine approaches |

**Think first**: "Is the user asking about code in their workspace, or external libraries/repos?"

### Reference Guides

- [research_local_prompt.md](./references/research_local_prompt.md) - **Local codebase** patterns, LSP flows, semantic analysis
- [research_external_prompt.md](./references/research_external_prompt.md) - **GitHub/package** patterns, external exploration
- [output_protocol.md](./references/output_protocol.md) - How to present findings

---

## Quick Start

```bash
# Check server is running
curl -s http://localhost:1987/health

# If not running
./install.sh start
```

---

## Available Tools

### Thinking About Which Tool to Use

**Text search** (`/local/search`, `/github/search`)
- Good for: Finding where code patterns appear
- Returns: File paths, line numbers, match counts
- Think: "I need to find where X is mentioned"

**Semantic analysis** (`/lsp/*` tools)
- Good for: Understanding relationships between code
- Returns: Definitions, references, call graphs
- Think: "I need to understand how X connects to Y"

**File reading** (`/local/content`, `/github/content`)
- Good for: Understanding specific implementation details
- Returns: Actual code content
- Think: "I found the location, now I need to read it"

**Structure exploration** (`/local/structure`, `/github/structure`)
- Good for: Understanding codebase organization
- Returns: Directory trees, file lists
- Think: "I need to orient myself in this codebase"

### Endpoints Reference

| Category | Endpoint | What It Does |
|----------|----------|--------------|
| **Local** | `/local/search` | Find code patterns with ripgrep |
| | `/local/content` | Read file contents |
| | `/local/structure` | View directory tree |
| | `/local/find` | Find files by name/metadata |
| **LSP** | `/lsp/definition` | Jump to where symbol is defined |
| | `/lsp/references` | Find all usages of a symbol |
| | `/lsp/calls` | Trace call relationships |
| **GitHub** | `/github/search` | Search code on GitHub |
| | `/github/content` | Read file from GitHub |
| | `/github/structure` | View repo tree |
| | `/github/repos` | Search repositories |
| | `/github/prs` | Search pull requests |
| **Package** | `/package/search` | Search npm/PyPI packages |

---

## Research Principles

### 1. Let Results Guide You

Each API response includes rich context from the MCP tools:

```yaml
# In every result:
mainResearchGoal: "Your overall research objective"
researchGoal: "This specific query's goal"
reasoning: "Why this approach was taken"

# Status-based hints:
hasResultsStatusHints:
  - "Follow 'mainResearchGoal', 'researchGoal', 'reasoning' to navigate"
  - "Got 3+ examples? Consider stopping to avoid over-research"
emptyStatusHints:
  - "Try broader terms or related concepts"
  - "Remove filters one at a time"
errorStatusHints:
  - "Check error details for recovery strategies"
```

**Use these hints** - they adapt to your actual results and research context.

### 2. Think Before Acting

Before calling a tool, ask yourself:
- What information am I looking for?
- Why will this tool help me get it?
- How will this move me toward answering the user's question?

Share this reasoning with the user - it builds trust and helps them understand your approach.

### 3. Semantic vs Lexical

| Approach | When to Use | Tools |
|----------|-------------|-------|
| **Lexical** (text search) | Find where patterns appear | `/local/search`, `/github/search` |
| **Semantic** (LSP) | Understand code relationships | `/lsp/definition`, `/lsp/references`, `/lsp/calls` |

**Example thinking**: "The user asks 'who calls this function?' - that's a relationship question, so I should use semantic tools like `/lsp/calls` rather than just searching for the function name."

### 4. The lineHint Pattern

LSP tools work best with a `lineHint` - a line number where the symbol appears:

```bash
# Step 1: Search to find where symbol appears
curl "http://localhost:1987/local/search?pattern=authenticate"
# Response shows: line 15 in auth.ts

# Step 2: Use that line as a hint for LSP
curl "http://localhost:1987/lsp/calls?uri=auth.ts&symbolName=authenticate&lineHint=15"
```

This isn't a rigid rule - it's a practical pattern because LSP resolves symbols more accurately when it knows where to look.

---

## Common Research Patterns

### Exploring a New Codebase

```
Think: "I need to orient myself before diving deep"

→ /local/structure (depth=1) - See the lay of the land
→ /local/structure (src, depth=2) - Drill into source
→ /local/search (key terms) - Find entry points
```

### Understanding How Something Works

```
Think: "I need to trace the flow, not just read files"

→ /local/search - Find the function/class
→ /lsp/calls (incoming) - Who calls it?
→ /lsp/calls (outgoing) - What does it call?
→ /local/content - Read the implementation details last
```

### Finding All Usages

```
Think: "I need comprehensive coverage, not just examples"

→ /lsp/references - Get all usages semantically
→ /local/search - Verify with text search if needed
```

### Investigating External Code

```
Think: "I'm exploring unfamiliar territory"

→ /github/structure - Understand repo layout
→ /github/search - Find relevant code
→ /github/content - Read specific files
```

---

## Adaptive Output

**Match your response to the question complexity:**

| Question | Response |
|----------|----------|
| "Where is X defined?" | Direct answer with path:line |
| "What does X do?" | Brief explanation with code snippet |
| "How does X work?" | Flow trace with evidence |
| Complex multi-part question | Offer to save research doc |

See [output_protocol.md](./references/output_protocol.md) for details.

---

## Research Context Parameters

All requests accept optional context parameters that help track research:

| Parameter | Purpose |
|-----------|---------|
| `mainResearchGoal` | The overall objective (stays constant) |
| `researchGoal` | This specific query's goal |
| `reasoning` | Why you're making this request |

These are optional but helpful for:
- Logging and debugging
- Maintaining research context
- Helping the skill understand intent

---

## Error Recovery

**When things don't work, adapt:**

| Situation | Try Instead |
|-----------|-------------|
| LSP returns empty | Fall back to text search |
| Search returns too many results | Add filters, narrow scope |
| Rate limited (GitHub) | Switch to local if possible, or wait |
| File too large | Use `startLine`/`endLine` or `matchString` |

The `_reasoning` block in responses includes recovery suggestions.

---

## Parallel Execution

For independent queries, make them in parallel:

```bash
# These don't depend on each other - run together
curl ".../lsp/calls?direction=incoming" &
curl ".../lsp/calls?direction=outgoing" &
wait
```

The server handles concurrent requests efficiently.

---

## Complex Research

For questions with multiple independent aspects, consider spawning parallel research agents:

```javascript
// Parallel investigation
Task({ prompt: "Research payment flow..." })
Task({ prompt: "Research inventory management..." })
// Then merge findings
```

See [task_integration.md](./references/task_integration.md) for orchestration patterns.

---

## Console Output Colors

The skill uses a consistent color scheme for terminal output:

| Category | Color | Purpose |
|----------|-------|---------|
| **Agent** | 🟣 Purple | Server messages, startup, shutdown, agent status |
| **Results** | 🔵 Blue | Tool output, API responses, skill results |
| **Success** | 🟢 Green | Successful operations |
| **Error** | 🔴 Red | Errors and failures |
| **Warning** | 🟡 Yellow | Warnings, rate limits |
| **Dim** | Gray | Secondary info, route lists |

This helps distinguish:
- **What the agent is doing** (purple) vs **what the tools returned** (blue)
- Quick visual scanning of logs for issues

---

## Logs

```bash
# View recent tool calls
tail -50 ~/.octocode/logs/tools.log

# View errors
cat ~/.octocode/logs/errors.log
```

---

## The Right Mindset

**Good research thinking:**
- "The user asked about flow, so I should trace relationships, not just read files"
- "I got 50 results - I should narrow my search before continuing"
- "This tool suggested reading the top match - that makes sense because it has the most matches"
- "I found the definition, but the user wants to know who uses it - I should trace references"

**Avoid mechanical thinking:**
- "User said 'flow' so I must use /lsp/calls" ← Too rigid
- "I'll read all these files" ← Not strategic
- "The documentation says I should do X" ← Following procedure, not thinking

Research is about **discovery and understanding**, not following procedures. Let the data guide you, explain your reasoning, and adapt as you learn.
