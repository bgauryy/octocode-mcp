# Output Protocol & Research Documents

Adaptive output based on question complexity. Quality over ceremony.

<critical>
**Show your reasoning**: When presenting findings, explain how you arrived at conclusions and what evidence supports each claim.
</critical>

---

## Step 0: Classify Output Complexity

**Before presenting findings, assess the question type:**

<output-classification>
<output-type complexity="quick" example="Where is X defined?">
<format>Direct answer + path</format>
<save-doc>No</save-doc>
<template>
**Answer**: The `{symbol}` is defined at `{path}:{line}`
{brief description}
</template>
</output-type>

<output-type complexity="simple" example="What does function X do?">
<format>Brief summary + snippet</format>
<save-doc>Ask if needed</save-doc>
</output-type>

<output-type complexity="medium" example="How does X flow work?">
<format>Structured summary + flow</format>
<save-doc>Offer to save</save-doc>
</output-type>

<output-type complexity="complex" example="Trace X including Y and Z">
<format>Full research doc</format>
<save-doc>Recommend saving</save-doc>
</output-type>
</output-classification>

| Question Type | Complexity | Output Format | Save Doc? |
|---------------|------------|---------------|-----------|
| "Where is X defined?" | Quick | Direct answer + path | No |
| "What does function X do?" | Simple | Brief summary + snippet | Ask if needed |
| "How does X flow work?" | Medium | Structured summary + flow | Offer to save |
| "Trace X including Y and Z" | Complex | Full research doc | Recommend saving |
| Multi-axis comparison | Complex | Parallel research + merge | Recommend saving |

**Principle**: Match output depth to question depth. Don't create ceremony for simple lookups.

---

## Quality Standards (ALL Research)

<quality-standards>
<requirement id="fact-based">Every finding backed by actual code, not assumptions</requirement>
<requirement id="evidence-linked">Path + line number for every claim</requirement>
<requirement id="verified">Cross-referenced where possible</requirement>
<requirement id="current">From the actual codebase state</requirement>

<checklist>
<item>Clear answer to the user's question</item>
<item>Multiple evidence points (not just one file)</item>
<item>Call flows traced (if flow-related question)</item>
<item>Key code snippets identified (up to 10 lines each)</item>
<item>Edge cases noted (limitations, uncertainties)</item>
</checklist>
</quality-standards>

---

## Quick Lookups (Simple Questions)

For simple questions, respond directly without ceremony:

```
**Answer**: The `authenticate` function is defined at `/src/auth/middleware.ts:15`

It validates JWT tokens and attaches user context to the request.
```

**No need to**: Create documents, offer to save, or ask follow-up questions.

---

## Structured Findings (Medium Complexity)

For flow traces and multi-file investigations:

```markdown
## Research: {topic}

**TL;DR**: [1-2 sentence answer]

**Flow**:
1. Entry: `path/file.ts:line` - [what happens]
2. Calls: `path/file.ts:line` - [what happens]
3. Result: `path/file.ts:line` - [what happens]

**Evidence**:
- `path:line`: [what it shows]
- `path:line`: [what it shows]
```

**Then ask**: "Would you like me to save this research to a markdown file?"

---

## Complex Research (Multi-Axis / Deep Dives)

For complex questions with multiple independent aspects:

### When to Use Multi-Agent Orchestration

Spawn parallel agents when:
- Question has **2+ independent research axes** (e.g., "auth AND caching AND logging")
- Comparing **multiple implementations** (e.g., "express vs fastify routing")
- Tracing **cross-system flows** (e.g., "frontend → API → database")

### Orchestration Pattern

```
1. DECOMPOSE: Break question into independent axes
2. SPAWN: Launch parallel Task agents (one per axis)
3. MONITOR: Track progress via TodoWrite
4. MERGE: Synthesize findings when all complete
5. OUTPUT: Present unified summary
```

**Example**:
```
User: "How does checkout work, including payment and inventory?"

→ Axis 1: Checkout orchestration (Agent 1)
→ Axis 2: Payment processing (Agent 2)
→ Axis 3: Inventory management (Agent 3)
→ Merge: Combined flow diagram + unified findings
```

### Agent Spawn Template

```javascript
// Spawn in single message for parallel execution
Task({
  subagent_type: "Explore",
  prompt: "Research [AXIS 1]. Server: http://localhost:1987.
           Goal: [specific goal]. Output: Summary with evidence."
})
Task({
  subagent_type: "Explore",
  prompt: "Research [AXIS 2]. Server: http://localhost:1987.
           Goal: [specific goal]. Output: Summary with evidence."
})
```

---

## Asking User About Saving

**Conditional prompting based on complexity:**

<save-decision>
<condition test="Quick lookup?">
<action>Don't ask - just answer</action>
</condition>
<condition test="Simple finding?">
<action>Ask only if user seems to want docs</action>
</condition>
<condition test="Medium research?">
<action>Ask: "Would you like me to save this?"</action>
</condition>
<condition test="Complex research?">
<action>Recommend: "I recommend saving this. Create .octocode/research/{name}/research.md?"</action>
</condition>

<recommend-saving-when>
- Research took multiple tool calls
- Findings span 3+ files
- User might need to reference later
- Complex flow was traced
</recommend-saving-when>
</save-decision>

---

## Document Template (When Saving)

<document-template name="research-doc">
<location>.octocode/research/{session-name}/research.md</location>
<structure>
# Research: {Topic}

## Question
[User's original question]

## Answer
[TL;DR - 2-3 sentences max]

## Detailed Findings

### Flow Overview
[Mermaid diagram or step-by-step flow]

### Key Components
| Component | Location | Role |
|-----------|----------|------|
| [Name] | `path:line` | [Description] |

### Evidence
[Code snippets with context - max 10 lines each]

## Edge Cases / Caveats
- [Limitations discovered]
- [Areas needing more investigation]

## References
- [Full paths for local / GitHub links for external]

---
Created by Octocode Research | https://octocode.ai
</structure>
</document-template>

---

## Session Naming

Derive `{session-name}` from user's question (kebab-case):

| Question | Session Name |
|----------|--------------|
| "How does authentication work?" | `auth-flow` |
| "Trace payment processing" | `payment-processing` |
| "Compare express vs fastify" | `express-fastify-comparison` |

---

## Link Formats

**GitHub** (external research):
```
https://github.com/{owner}/{repo}/blob/{branch}/{path}#L{line}
https://github.com/{owner}/{repo}/blob/{branch}/{path}#L{start}-L{end}
```

**Local** (codebase research):
```
/absolute/path/to/file.ts:line
/absolute/path/to/file.ts:start-end
```

**Always include line numbers** - vague references are not evidence.
