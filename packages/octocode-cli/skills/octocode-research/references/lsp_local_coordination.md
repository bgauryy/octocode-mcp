# LSP + Local Tools Coordination Guide

> **Critical Rule**: LSP tools ALWAYS require `lineHint` from local search results. NEVER guess line numbers.

---

## The Golden Rule

```
SEARCH FIRST → GET lineHint → THEN LSP
```

Every LSP call (`/lsp/definition`, `/lsp/references`, `/lsp/calls`) **MUST** be preceded by `/local/search` to obtain an accurate `lineHint`.

---

## Tool Dependency Graph

```
┌─────────────────────────────────────────────────────────────┐
│                    TOOL DEPENDENCIES                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  DISCOVERY TOOLS (No dependencies)                          │
│  ├── /local/structure   → directory layout                  │
│  └── /local/find        → file metadata search              │
│                                                             │
│  SEARCH TOOL (Provides lineHint)                           │
│  └── /local/search      → pattern matching                  │
│           │                                                 │
│           ├──────────────┬──────────────┐                  │
│           ▼              ▼              ▼                  │
│  LSP TOOLS (Require lineHint)                              │
│  ├── /lsp/definition    /lsp/references    /lsp/calls      │
│  │                                                         │
│  └──────────────────────┬──────────────────────────────────┤
│                         ▼                                  │
│  CONTENT TOOL (Last step)                                  │
│  └── /local/content     → read implementation details      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Step-by-Step Coordination

### Step 1: Search to Get lineHint

```bash
curl "http://localhost:1987/local/search?pattern=authenticate&path=/project/src"
```

**Response contains lineHint:**
```json
{
  "files": [{
    "path": "/project/src/auth/middleware.ts",
    "matches": [{
      "line": 15,        ← THIS IS YOUR lineHint!
      "column": 10,
      "preview": "export async function authenticate(req, res, next) {"
    }]
  }]
}
```

### Step 2: Use lineHint in LSP Calls

```bash
# Definition
curl "http://localhost:1987/lsp/definition?uri=/project/src/auth/middleware.ts&symbolName=authenticate&lineHint=15"

# References  
curl "http://localhost:1987/lsp/references?uri=/project/src/auth/middleware.ts&symbolName=authenticate&lineHint=15"

# Call hierarchy
curl "http://localhost:1987/lsp/calls?uri=/project/src/auth/middleware.ts&symbolName=authenticate&lineHint=15&direction=incoming"
```

### Step 3: Parallelize After Search

Once you have lineHint, LSP calls can run **in parallel**:

```bash
# All three run concurrently (3x faster)
curl ".../lsp/definition?...&lineHint=15" &
curl ".../lsp/calls?...&lineHint=15&direction=incoming" &
curl ".../lsp/calls?...&lineHint=15&direction=outgoing" &
wait
```

---

## Decision Matrix: Which Tool to Use

| Question Type | Primary Tool | lineHint Required? | Fallback |
|---------------|--------------|-------------------|----------|
| "Where is X defined?" | /lsp/definition | YES | /local/search |
| "Who calls X?" (function) | /lsp/calls incoming | YES | /local/search pattern |
| "What does X call?" (function) | /lsp/calls outgoing | YES | Read file + parse |
| "All usages of X" (type/var) | /lsp/references | YES | /local/search pattern |
| "Find files containing X" | /local/search | NO | - |
| "Show directory structure" | /local/structure | NO | - |
| "Find files named X" | /local/find | NO | - |
| "Read file contents" | /local/content | NO | - |

---

## Common Mistakes to Avoid

### ❌ WRONG: Calling LSP Without Search

```bash
# BAD - guessing lineHint
curl "http://localhost:1987/lsp/definition?symbolName=auth&lineHint=1"
```

**Why it fails**: lineHint=1 is almost certainly wrong. LSP needs the exact line where the symbol appears.

### ❌ WRONG: Using /lsp/calls for Types/Variables

```bash
# BAD - /lsp/calls only works for functions/methods
curl "http://localhost:1987/lsp/calls?symbolName=UserType&lineHint=10&direction=incoming"
```

**Why it fails**: Call hierarchy only tracks function calls. For types, interfaces, variables → use `/lsp/references`.

### ❌ WRONG: Reading Files to Understand Flow

```bash
# BAD - file reading misses call relationships
curl "http://localhost:1987/local/content?path=/project/src/auth.ts"
# Then manually searching for function calls in text...
```

**Why it fails**: You'll miss dynamic calls, indirect references, and cross-file relationships. Use `/lsp/calls` for semantic flow analysis.

---

## Correct Patterns

### Pattern 1: Symbol Lookup

**Question**: "Where is `processRequest` defined?"

```
1. /local/search?pattern=processRequest
   → Response: { files: [{ path: "src/api.ts", matches: [{ line: 42 }] }] }
   
2. /lsp/definition?uri=src/api.ts&symbolName=processRequest&lineHint=42
   → Response: { definition: { uri: "src/handlers/request.ts", line: 15 } }
```

### Pattern 2: Flow Tracing

**Question**: "How does authentication work?"

```
1. /local/search?pattern=authenticate
   → lineHint=15 at src/auth/middleware.ts

2. PARALLEL:
   /lsp/calls?direction=incoming&lineHint=15  → Who calls authenticate?
   /lsp/calls?direction=outgoing&lineHint=15  → What does authenticate call?

3. For each result, chain:
   /lsp/definition?lineHint=<result.line>     → Navigate to called function
   /lsp/calls?direction=outgoing              → Continue trace
   
4. LAST: /local/content for implementation details
```

### Pattern 3: Impact Analysis

**Question**: "What breaks if I change `validateInput`?"

```
1. /local/search?pattern=validateInput
   → lineHint=30 at src/utils/validation.ts

2. /lsp/references?symbolName=validateInput&lineHint=30
   → All locations that reference this function

3. /lsp/calls?direction=incoming&lineHint=30
   → All call sites (may overlap with references)

4. For each caller:
   → Check if they depend on specific behavior
```

### Pattern 4: Type/Interface Usage

**Question**: "Where is `UserConfig` used?"

```
1. /local/search?pattern=UserConfig
   → lineHint=5 at src/types/config.ts

2. /lsp/references?symbolName=UserConfig&lineHint=5
   → All type annotations, imports, etc.

NOTE: Do NOT use /lsp/calls for types - it won't work!
```

---

## Error Recovery

### LSP Symbol Not Found

```
Error: "Symbol 'X' not found at line N"
```

**Recovery**:
1. Re-run `/local/search` with exact symbol name
2. Verify lineHint matches a match result exactly
3. Check if symbol is in a different file than expected

### LSP Timeout

```
Error: "Operation timed out after 10s"
```

**Recovery**:
1. Reduce scope (search in smaller directory)
2. Use `/local/search` as fallback for text-based discovery
3. Check if LSP server needs restart (cold start)

### Empty LSP Results

```
Response: { locations: [] }
```

**Recovery**:
1. Verify the symbol exists at lineHint location
2. Try `/local/search` to confirm pattern exists
3. For types/variables, ensure using `/lsp/references` not `/lsp/calls`

---

## Parallel Execution Rules

### ✅ CAN Parallelize

- Multiple `/local/search` calls (different patterns)
- Multiple `/local/structure` calls (different paths)
- LSP calls AFTER you have lineHint from search
- Exploration of different directories

### ❌ CANNOT Parallelize

- `/local/search` and `/lsp/*` for the SAME symbol (need search result first)
- Sequential flow tracing (need each hop's lineHint)
- Dependent queries (where one result determines next query)

---

## Context Propagation

When making chained calls, preserve research context:

```bash
# First call - get context token
RESPONSE=$(curl -i "http://localhost:1987/local/search?pattern=auth")
CTX=$(echo "$RESPONSE" | grep -i "X-Research-Context" | cut -d' ' -f2 | tr -d '\r')

# Subsequent calls - pass context
curl "http://localhost:1987/lsp/calls?...&_ctx=$CTX"
```

**Benefits**:
- Better hints (context-aware suggestions)
- Loop detection (warns if same tool called repeatedly)
- Session correlation in logs

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────┐
│        LSP + LOCAL COORDINATION                 │
├─────────────────────────────────────────────────┤
│                                                 │
│  1. SEARCH FIRST (get lineHint)                │
│     /local/search?pattern=X                     │
│                                                 │
│  2. USE lineHint FOR LSP                       │
│     /lsp/definition?lineHint=N                  │
│     /lsp/references?lineHint=N                  │
│     /lsp/calls?lineHint=N&direction=in|out     │
│                                                 │
│  3. PARALLELIZE after search                    │
│     Search must complete → then LSP in parallel │
│                                                 │
│  4. READ CONTENT LAST                          │
│     /local/content only for implementation      │
│                                                 │
├─────────────────────────────────────────────────┤
│  NEVER: Guess lineHint                         │
│  NEVER: /lsp/calls on types (use references)   │
│  NEVER: Read files to trace flow               │
└─────────────────────────────────────────────────┘
```
