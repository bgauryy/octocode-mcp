# Task Tool Integration Guide

Integration patterns for using octocode-research with Claude Code's Task tool.

---

## Usage Patterns

| Pattern | When to Use | Method |
|---------|-------------|--------|
| **Direct Skill** | Simple research questions | `/octocode-research` or `Skill(skill="octocode-research")` |
| **Task + Explore** | Complex codebase exploration | `Task(subagent_type="Explore", prompt="...")` |
| **Parallel Tasks** | Multi-axis research | Multiple `Task()` calls in single message |
| **Direct HTTP** | Programmatic/scripted access | `curl http://localhost:1987/...` |

---

## Pattern Selection Guide

| Question Complexity | Recommended Approach |
|---------------------|---------------------|
| Simple lookup ("where is X defined?") | Direct skill call |
| Single flow trace ("how does auth work?") | Task + Explore subagent |
| Multi-part question (2+ independent axes) | Parallel Task calls |
| Comparison ("compare X vs Y") | Parallel Tasks, then merge |
| Deep dive with follow-ups | Task with resume capability |

---

## Single-Axis Research

For focused research on one topic:

```javascript
Task(
  subagent_type: "Explore",
  prompt: "Research how authentication works in this codebase.
           Server: http://localhost:1987
           Flow: /local/search → get lineHint → /lsp/calls → /local/content
           Goal: Trace the complete auth flow from entry to token validation"
)
```

---

## Multi-Axis Research (Parallel Tasks)

For questions with multiple independent parts, spawn Tasks in parallel.
**MUST be in single message** to run concurrently:

```javascript
// All three run concurrently
Task({
  subagent_type: "Explore",
  prompt: "Research checkout orchestration flow..."
})
Task({
  subagent_type: "Explore",
  prompt: "Research payment processing integration..."
})
Task({
  subagent_type: "Explore",
  prompt: "Research inventory management..."
})
// Then merge findings from all three
```

### Example

```
User: "How does checkout work including payment and inventory?"

→ Identify axes: Checkout, Payment, Inventory
→ Spawn 3 parallel Tasks
→ Each follows: DISCOVER → PLAN → EXECUTE → VERIFY
→ Merge findings into unified summary
```

---

## Task Prompt Best Practices

Include these 5 elements in research Task prompts:

| Element | Purpose | Example |
|---------|---------|---------|
| **Server URL** | Where to send requests | `http://localhost:1987` |
| **Research type** | Local vs External | "Local Research (user's codebase)" |
| **Flow pattern** | Tool sequence | `/local/search → /lsp/calls → /local/content` |
| **Specific goal** | What evidence needed | "Trace auth flow from entry to validation" |
| **Output format** | Expected structure | "Summary with call flow diagram" |

### Complete Prompt Example

```
Research the payment processing flow in this codebase.

Server: http://localhost:1987 (octocode-research)
Type: Local Research (user's codebase)

Steps:
1. /local/search?pattern=payment&path=/project/src → find entry points
2. Use lineHint from search for LSP calls
3. /lsp/calls?direction=incoming → who triggers payment
4. /lsp/calls?direction=outgoing → what payment calls
5. /local/content → read key implementations

Output: Summary with call flow diagram and key file references
```

---

## Resume Capability

For iterative research with follow-up questions:

```javascript
// Initial research
const result = Task({
  subagent_type: "Explore",
  prompt: "Research how caching works..."
});
// Returns: { agentId: "abc123", findings: "..." }

// Follow-up (preserves full context)
Task({
  resume: "abc123",
  prompt: "Now trace what invalidates the cache"
});
```

**When to use resume:**
- Drilling deeper into initial findings
- Exploring related areas
- Answering follow-up questions
- Verifying or cross-referencing

---

## Parallel HTTP Calls

The server handles concurrent requests. Use parallel calls for speed:

```javascript
// Parallel LSP calls (3x faster than sequential)
const [definition, references, calls] = await Promise.all([
  fetch('http://localhost:1987/lsp/definition?...'),
  fetch('http://localhost:1987/lsp/references?...'),
  fetch('http://localhost:1987/lsp/calls?...')
]);

// Parallel structure exploration
const [srcStructure, libStructure] = await Promise.all([
  fetch('http://localhost:1987/local/structure?path=/project/src'),
  fetch('http://localhost:1987/local/structure?path=/project/lib')
]);
```

**Parallelize when:**
- Multiple independent searches
- Exploring multiple directories
- LSP queries for different symbols
- GitHub searches across different repos
- Comparing multiple packages
