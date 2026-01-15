# Local Codebase Research

> **Mindset**: You're a detective solving a mystery. Follow evidence, not procedures.

---

## The Research Loop

Good research is iterative:

```
QUESTION → HYPOTHESIS → INVESTIGATE → LEARN → REFINE → REPEAT
```

Each API call should be driven by a question you're trying to answer. Share your thinking as you go.

---

## Choosing the Right Approach

### What Are You Trying to Learn?

| Question Type | Good Approach | Why |
|---------------|---------------|-----|
| "Where is X?" | Text search → location | You need to find something by name |
| "What is X?" | Definition lookup | You need to understand what X is |
| "Who uses X?" | References/calls | You need relationship information |
| "How does X work?" | Call tracing | You need to understand behavior |
| "What calls X?" | Incoming calls | You need caller relationships |
| "What does X call?" | Outgoing calls | You need callee relationships |

### Lexical vs Semantic

**Lexical (text search)** answers: "Where does this text appear?"
- Fast, finds patterns
- Can find comments, strings, partial matches
- Use: `/local/search`

**Semantic (LSP)** answers: "How is this symbol connected to other code?"
- Understands code structure
- Finds actual usages, not just text matches
- Use: `/lsp/definition`, `/lsp/references`, `/lsp/calls`

**Example**: Searching for "authenticate" might find comments like "// authenticate users here". LSP references for `authenticate` finds only actual calls to that function.

---

## Practical Patterns

### Pattern: Find → Navigate → Understand

When you need to find something specific:

```
Think: "I don't know where X is, but I can search for it"

1. /local/search for the pattern
2. Results show file:line locations
3. Use those line numbers with LSP tools
4. Read the code to understand details
```

The key insight: **search results give you coordinates for deeper analysis**.

### Pattern: Trace a Flow

When the user asks about how something works:

```
Think: "Understanding flow means understanding relationships"

1. Find the entry point (search)
2. Trace incoming calls (who triggers this?)
3. Trace outgoing calls (what does it do?)
4. Read implementation details last
```

Reading files shows you code. LSP shows you **connections between code**.

### Pattern: Explore Unknown Territory

When you're new to a codebase:

```
Think: "I need to orient before I dive"

1. View structure (what directories exist?)
2. Look at key files (package.json, main entry points)
3. Search for domain terms
4. Let patterns emerge
```

---

## Using the Response Hints

Every API response includes rich context from the MCP tools:

```yaml
# Research context in each result:
mainResearchGoal: "Your overall objective"
researchGoal: "This query's specific goal"
reasoning: "Why this approach was taken"

# Status-based hints guide next steps:
hasResultsStatusHints:
  - "Follow mainResearchGoal, researchGoal to navigate"
  - "Got 3+ examples? Consider stopping"
emptyStatusHints:
  - "Try broader terms or related concepts"
errorStatusHints:
  - "Check error details for recovery"
```

**Read the hints** - they adapt to your actual results and tell you:
- When you have enough data
- How to narrow or broaden your search
- What to try when things fail

The MCP tools track your research context automatically.

---

## Good Thinking Examples

### Example 1: "How does authentication work?"

```
My thinking: User is asking about a flow/process. I should trace relationships,
not just read files. Let me start by finding the authentication entry point.

→ Search for "authenticate" patterns
→ Found in middleware.ts at line 42
→ Trace incoming calls: who triggers authentication?
→ Trace outgoing calls: what does authentication do?
→ Now I understand the flow - let me read specific implementations
```

### Example 2: "Where is the User type defined?"

```
My thinking: This is a location question. I need to find a definition.
I'll search first to get the location, then verify with LSP.

→ Search for "type User" or "interface User"
→ Found at models/user.ts:15
→ Confirm with /lsp/definition
→ Simple answer: "The User type is defined at models/user.ts:15"
```

### Example 3: "What will break if I change this function?"

```
My thinking: This is an impact question. I need to find all dependencies.

→ Find the function location
→ Use /lsp/references to find all usages
→ Use /lsp/calls (incoming) to find all callers
→ Report: "This function is called from 5 places: [list with paths:lines]"
```

---

## Common Pitfalls to Avoid

**Pitfall 1: Reading files to understand flow**
- Why it's wrong: File content shows code, not connections
- Better: Use `/lsp/calls` to see relationships, then read for details

**Pitfall 2: Guessing line numbers**
- Why it's wrong: LSP needs accurate positions to resolve symbols
- Better: Always search first to get real line numbers

**Pitfall 3: Processing too many results**
- Why it's wrong: Wastes time and context
- Better: Narrow your search, then examine top matches

**Pitfall 4: Mechanical tool selection**
- Why it's wrong: "User said X so I must use tool Y" misses context
- Better: Think about what information you need, then choose appropriately

---

## Multi-Part Research

For complex questions with independent aspects:

```
"How does checkout work, including payment and inventory?"

This has three independent parts:
1. Checkout orchestration
2. Payment processing
3. Inventory management

Consider parallel investigation - spawn tasks for each axis,
then merge the findings.
```

See [task_integration.md](./task_integration.md) for patterns.

---

## Quality Standards

Every finding should have:
- **Evidence**: Actual code path:line references
- **Explanation**: What it means, not just what it is
- **Context**: How it relates to the user's question

Don't report what tools told you. Report what you **learned**.
