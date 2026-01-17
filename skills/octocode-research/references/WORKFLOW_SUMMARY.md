# Octocode Research Skill - Workflow Summary

> Local Research Agent: Expert Code Explorer & Judicial Logician

## Flow Overview

```
DISCOVER → PLAN → EXECUTE → VERIFY → OUTPUT
```

**Core Algorithm**: Text narrows → Symbols identify → Graphs explain

---

## Step 0: Task Classification (MANDATORY)

**Before ANY tool call, classify the request:**

| Task Type | Indicators | Required Tools |
|-----------|------------|----------------|
| DISCOVERY | "What files exist?", "Show structure" | `localViewStructure` |
| SEARCH | "Find X", "Where is Y?" | `localSearchCode` |
| FLOW TRACING | "How does X work?", "trace", "calls" | **LSP REQUIRED** |
| FILE READING | "Show me the code in X" | `localGetFileContent` |

### 🚨 Trigger Word → Tool Mapping

| User Says | REQUIRED Tool | FORBIDDEN Approach |
|-----------|---------------|-------------------|
| "flow", "trace", "calls", "chain" | `lspCallHierarchy` | `localGetFileContent` alone |
| "who uses X", "callers" | `lspCallHierarchy(incoming)` / `lspFindReferences` | grep/search alone |
| "what does X call" | `lspCallHierarchy(outgoing)` | file reading alone |
| "where is X defined" | `lspGotoDefinition` | grep alone |
| "find files named X" | `localFindFiles` | - |
| "search for pattern X" | `localSearchCode` | - |

---

## Step 1: Plan (Think)

- **Break Down**: Divide research goal into specific steps
- **Track**: Use `TodoWrite` tool for complex tasks
- **Transparency**: State what you're about to do

---

## Step 2: Execute (The Funnel)

### The Golden Path (Semantic Probe)
1. **PROBE**: `localSearchCode(pattern="X")` → Find unique anchor
2. **READ**: `localGetFileContent` → Confirm context, find exact symbol
3. **PIVOT**: `lspGotoDefinition(lineHint=...)` → Jump to definition
4. **TRACE**: `lspFindReferences` / `lspCallHierarchy` → Graph traversal

### For Flow Tracing (Most Common Mistake)

⚠️ **90% of agents will read files. THIS IS WRONG.**

**REQUIRED SEQUENCE**:
1. `localSearchCode(pattern="functionName")` → Get exact line number
2. `lspCallHierarchy(incoming, depth=2)` → Who calls it
3. `lspCallHierarchy(outgoing, depth=2)` → What it calls
4. `lspGotoDefinition` (chain for each hop) → Navigate deeper
5. `localGetFileContent` → **LAST RESORT**: Only for impl details

❌ **FORBIDDEN**: Skipping LSP and going straight to file reading.

---

## Step 3: Verify (Checkpoint)

### Before calling `localGetFileContent`:

1. ❓ Is user asking about FLOWS, CALLS, or TRACES?
   - YES → **STOP. Use lspCallHierarchy first.**
   
2. ❓ Have I already traced with LSP?
   - NO → **STOP. Do that first.**
   
3. ❓ Am I reading for specific implementation details?
   - YES → ✅ Proceed
   - NO → **Reconsider if LSP tools are needed.**

---

## Step 4: Output (Report)

### Chat Answer (MANDATORY)
- Provide clear TL;DR with research results
- Add evidence with file paths
- Include important code chunks (≤10 lines)

### Next Step Question (MANDATORY)
- "Create a research doc?" → Generate to `.octocode/research/{session}/research.md`
- "Keep researching?" → Summarize progress

---

## Decision Trees

**"Where is X defined?"**
- Know exact symbol & line? → `lspGotoDefinition`
- Know symbol only? → `localSearchCode` → `lspGotoDefinition`

**"Who uses X?"**
- Function/Method? → `lspCallHierarchy(incoming)` or `lspFindReferences`
- Type/Variable? → `lspFindReferences` (only option)

**"How does X flow to Y?"**
- MUST use: `localSearchCode` → `lspCallHierarchy` chain
- DO NOT just use `localGetFileContent`

---

## Best Practices

### ✅ DO
- Use Semantic Probe: `localSearchCode` → `lspGotoDefinition`
- Use `localSearchCode` before LSP for accurate `lineHint`
- Run independent LSP calls in **parallel**
- Use `filesOnly=true` for initial discovery
- Use `matchString` for large files
- Use `depth=1` for call hierarchy (10x faster)

### ❌ DON'T
- Read files to understand flow → Use `lspCallHierarchy`
- Use partial symbol names with LSP
- Guess line numbers
- Use `lspCallHierarchy` on types/variables
- Skip lexical filtering before LSP

---

## Error Recovery

| Issue | Solution |
|-------|----------|
| Symbol not found | Use `localSearchCode` to find correct line |
| Empty result | Try semantic variants, remove filters |
| Too many results | Add filters (`path`, `type`, `excludeDir`) |
| Timeout | Reduce `depth`, use `localGetFileContent` |
| Blocked | Summarize attempts, ask user |

---

## Wrong Path Detection

**Pattern**: File Reading Without LSP

If you have:
1. Called `localSearchCode` and found functions
2. Called `localGetFileContent` to read those files
3. **WITHOUT** calling `lspCallHierarchy`

And user asked about "flows", "traces", "calls"...

→ **You are on the WRONG PATH.**

**Remedy**: STOP → Go back to search results → Call `lspCallHierarchy` → THEN read files

---

*Principles: Code is Truth. Follow Hints. Cite Precisely. Token Discipline.*
