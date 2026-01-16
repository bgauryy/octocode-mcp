# Octocode Research Skill - Improvements Roadmap

> **Purpose**: Technical improvements for context propagation, retry logic, and LSP+Local tool coordination.  
> **Audience**: Developers implementing changes AND AI agents reading skill docs.

---

## Table of Contents

1. [Context Propagation](#1-context-propagation)
2. [Retry Logic & Resilience](#2-retry-logic--resilience)
3. [LSP + Local Tools Integration](#3-lsp--local-tools-integration)
4. [Agent-Readable Coordination Rules](#4-agent-readable-coordination-rules)

---

## 1. Context Propagation

### Problem

Each HTTP call is stateless. Research context resets to defaults, losing the research thread across chained calls.

### Solution: Lightweight Context Token

**Implementation File**: `src/middleware/contextPropagation.ts`

```typescript
// Context flows via X-Research-Context header or _ctx query param
interface ResearchContext {
  sessionId: string;
  mainGoal: string;        // Truncated to 100 chars
  toolChain: string[];     // Last 5 tools called
  startTime: number;
}
```

**How it works**:
1. First request creates session, returns `X-Research-Context` header
2. Subsequent requests include header/param to maintain context
3. Hints are generated based on tool chain and goal

### Agent Instructions

<agent-instructions id="context-propagation">
**When making chained tool calls**:

1. **Capture context token** from first response header `X-Research-Context`
2. **Pass token** in subsequent calls via `_ctx` query param or header
3. **Benefits**: Better hints, loop detection, session correlation

```bash
# First call - capture context
RESPONSE=$(curl -i "http://localhost:1987/local/search?pattern=auth&path=/project")
CTX=$(echo "$RESPONSE" | grep "X-Research-Context" | cut -d' ' -f2)

# Subsequent calls - pass context
curl "http://localhost:1987/lsp/calls?uri=...&lineHint=42&_ctx=$CTX"
```

**If context is lost**: Calls still work, but hints become generic.
</agent-instructions>

---

## 2. Retry Logic & Resilience

### Problem

Transient failures (LSP cold start, rate limits, timeouts) cause immediate errors without recovery.

### Solution: Tiered Retry Strategy

**Implementation File**: `src/utils/retry.ts`

| Tool Category | Max Attempts | Initial Delay | Backoff | Retry On |
|---------------|--------------|---------------|---------|----------|
| LSP | 3 | 500ms | 2x | Not ready, timeout, connection refused |
| GitHub | 3 | 1000ms | 3x | Rate limit (403), 5xx, timeout |
| Local | 2 | 100ms | 2x | File busy, timeout |

### Agent Instructions

<agent-instructions id="retry-awareness">
**Understanding retry behavior**:

1. **Automatic retries** happen server-side - you may see slightly longer response times
2. **Check `_retryAfter`** in error responses - indicates when to retry manually
3. **Rate limit hints** appear in response when GitHub quota is low

**Error response structure**:
```json
{
  "success": false,
  "error": {
    "message": "Rate limit exceeded",
    "code": "RATE_LIMITED",
    "recoverable": true
  },
  "hints": [
    "GitHub rate limit hit - wait 60s or use /local/* tools",
    "Consider narrowing search with owner/repo filters"
  ],
  "_retryAfter": 60
}
```

**When you see `recoverable: true`**:
- Wait the `_retryAfter` seconds
- Or switch to alternative tools (see fallback patterns below)
</agent-instructions>

---

## 3. LSP + Local Tools Integration

### The Coordination Problem

LSP tools (`/lsp/definition`, `/lsp/references`, `/lsp/calls`) require precise `lineHint` values. These MUST come from local search results.

### The Golden Rule

<critical-rule id="lsp-local-coordination">
**NEVER call LSP tools without a lineHint from `/local/search`**

```
WRONG:  /lsp/definition?symbolName=auth&lineHint=1  ← Guessed line!
RIGHT:  /local/search → get line from match → /lsp/definition
```
</critical-rule>

### Coordination Patterns

#### Pattern 1: Search-to-LSP Bridge

```
/local/search(pattern="functionName")
    ↓
Response: { files: [{ path: "src/api.ts", matches: [{ line: 42, ... }] }] }
    ↓
Extract: lineHint = 42, uri = "src/api.ts"
    ↓
/lsp/definition(uri="src/api.ts", symbolName="functionName", lineHint=42)
```

#### Pattern 2: Parallel LSP Calls (After Search)

Once you have lineHint, you CAN parallelize LSP calls:

```bash
# After getting lineHint=42 from search, run these in parallel:
/lsp/definition?uri=...&symbolName=auth&lineHint=42 &
/lsp/calls?uri=...&symbolName=auth&lineHint=42&direction=incoming &
/lsp/calls?uri=...&symbolName=auth&lineHint=42&direction=outgoing &
wait
```

#### Pattern 3: LSP Fallback to Search

If LSP fails (symbol not found, timeout), fall back to search:

```
/lsp/definition(symbolName="X", lineHint=N) → ERROR: Symbol not found
    ↓
Fallback: /local/search(pattern="function X|class X|const X")
    ↓
Use search results as definition location
```

### Agent Instructions

<agent-instructions id="lsp-local-coordination">
**LSP + Local Tool Coordination Rules**:

1. **ALWAYS search first**:
   ```
   /local/search?pattern=<symbol>&path=<scope>
   ```
   
2. **Extract lineHint from matches**:
   - Response contains `files[].matches[].line` 
   - This is your lineHint (1-indexed)
   
3. **Use lineHint in LSP calls**:
   ```
   /lsp/definition?uri=<path>&symbolName=<name>&lineHint=<line>
   /lsp/references?uri=<path>&symbolName=<name>&lineHint=<line>
   /lsp/calls?uri=<path>&symbolName=<name>&lineHint=<line>&direction=incoming|outgoing
   ```

4. **Parallelize after search**:
   - Search must complete first (to get lineHint)
   - Then LSP calls can run in parallel

5. **Handle LSP failures**:
   - If "symbol not found" → verify lineHint matches search result
   - If timeout → retry with smaller scope or fall back to search
   - If LSP unavailable → use `/local/search` + `/local/content` as fallback

**Decision Matrix**:

| Question | Primary Tool | Requires lineHint? | Fallback |
|----------|--------------|-------------------|----------|
| "Where is X defined?" | /lsp/definition | YES (from search) | /local/search |
| "Who uses X?" (function) | /lsp/calls incoming | YES | /local/search for pattern |
| "Who uses X?" (type/var) | /lsp/references | YES | /local/search |
| "What does X call?" | /lsp/calls outgoing | YES | Read file + parse |
| "Find files with X" | /local/search | NO | - |
| "Show directory structure" | /local/structure | NO | - |
</agent-instructions>

### Tool Synergy Table

<tool-synergy>
| First Tool | Provides | Enables | Example Flow |
|------------|----------|---------|--------------|
| `/local/structure` | File paths | Scoped search | structure → search in specific dir |
| `/local/search` | lineHint, file paths | ALL LSP tools | search → definition/references/calls |
| `/local/find` | File paths by metadata | Content reading | find *.test.ts → read test files |
| `/lsp/definition` | Definition location | Follow references | definition → references at that location |
| `/lsp/references` | All usage locations | Impact analysis | references → read each usage |
| `/lsp/calls` | Call graph | Flow tracing | calls incoming → calls outgoing (chain) |
</tool-synergy>

---

## 4. Agent-Readable Coordination Rules

### Pre-Flight Checklist

<checklist id="before-any-tool-call">
Before making ANY tool call, verify:

- [ ] **Classified the question** (DISCOVERY / SEARCH / FLOW / FILE_READ / IMPACT)
- [ ] **Checked for trigger words** (flow, trace, calls → requires /lsp/calls)
- [ ] **Have lineHint?** (required for LSP tools)
- [ ] **Server running?** (check /health if uncertain)
</checklist>

### Flow Enforcement Rules

<flow-rules>
**RULE 1: Search Before LSP**
```
IF calling /lsp/*
THEN must have called /local/search first (in this session)
UNLESS you have lineHint from a previous /lsp/* result
```

**RULE 2: LSP for Flow Questions**
```
IF question contains: flow, trace, calls, chain, "how does X work"
THEN /lsp/calls is REQUIRED
AND /local/content alone is FORBIDDEN for answering
```

**RULE 3: Structure Before Deep Dive**
```
IF exploring unfamiliar codebase
THEN start with /local/structure (depth=1)
THEN drill into relevant directories
THEN search within those directories
```

**RULE 4: Parallel When Independent**
```
IF multiple searches/LSP calls are independent
THEN run them in parallel (3x faster)
EXAMPLE: After search, run definition + incoming + outgoing in parallel
```

**RULE 5: Content Last**
```
IF reading file content
THEN only after understanding structure via LSP
EXCEPTION: User explicitly asks "show me the code in file X"
```
</flow-rules>

### Error Recovery Playbook

<error-recovery-playbook>
| Error | Symptom | Recovery Action |
|-------|---------|-----------------|
| `SYMBOL_NOT_FOUND` | LSP can't find symbol | Re-search with exact pattern, verify lineHint |
| `LSP_TIMEOUT` | Call takes >10s | Reduce scope, use /local/search fallback |
| `RATE_LIMITED` | GitHub 403 | Wait `_retryAfter` seconds, or use local tools |
| `CONNECTION_REFUSED` | Server not running | Run `./install.sh start`, check /health |
| `EMPTY_RESULTS` | Search returns nothing | Try semantic variants (auth→login→session) |
| `FILE_TOO_LARGE` | Can't read full file | Use `matchString` or `startLine/endLine` |
</error-recovery-playbook>

### Semantic Variants for Empty Results

<semantic-variants>
When search returns empty, try these semantic alternatives:

| Original | Try Also |
|----------|----------|
| auth | login, session, credentials, token, jwt |
| user | account, profile, member, identity |
| error | exception, failure, fault, issue |
| config | settings, options, preferences, env |
| api | endpoint, route, handler, controller |
| database | db, store, repository, persistence |
| cache | memo, buffer, store, redis |
| validate | verify, check, assert, ensure |
</semantic-variants>

---

## Implementation Files

### New Files to Create

```
src/
├── middleware/
│   └── contextPropagation.ts   # Session-based context
├── utils/
│   ├── retry.ts                # Retry with backoff
│   ├── circuitBreaker.ts       # LSP circuit breaker
│   └── rateLimitHandler.ts     # GitHub rate limit tracking
```

### Files to Modify

```
src/
├── routes/
│   ├── local.ts    # Add retry wrapper
│   ├── lsp.ts      # Add retry + circuit breaker
│   └── github.ts   # Add rate limit handling
├── middleware/
│   └── errorHandler.ts  # Enhanced error responses with hints
└── server.ts       # Register context middleware
```

---

## Quick Reference Card

<quick-reference>
```
┌─────────────────────────────────────────────────────────────┐
│                    TOOL COORDINATION                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  /local/structure ──┐                                       │
│                     ├──► /local/search ──► lineHint ──┐    │
│  /local/find ───────┘                                  │    │
│                                                        ▼    │
│                              ┌─────────────────────────────┐│
│                              │  /lsp/definition            ││
│                              │  /lsp/references            ││
│                              │  /lsp/calls (in/out)        ││
│                              └─────────────────────────────┘│
│                                         │                   │
│                                         ▼                   │
│                              ┌─────────────────────────────┐│
│                              │  /local/content (LAST)      ││
│                              └─────────────────────────────┘│
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  PARALLEL OK: After search, LSP calls can run together     │
│  SERIAL REQUIRED: Search → LSP (need lineHint first)       │
└─────────────────────────────────────────────────────────────┘
```
</quick-reference>

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-15 | 1.0.0 | Initial improvements roadmap |

