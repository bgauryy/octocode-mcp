# Output Protocol & Research Documents

How to present findings and generate research documents.

---

## Quality Checklist

Research is complete when you have:

- [ ] **Clear answer** to the user's question
- [ ] **Multiple evidence points** (not just one file)
- [ ] **Call flows traced** (if flow-related question)
- [ ] **Key code snippets** identified (up to 10 lines each)
- [ ] **Edge cases noted** (limitations, uncertainties)

---

## Step 1: Present Summary (MANDATORY)

When research is complete, present findings:

```markdown
## Research Summary: {topic}

**TL;DR**: [1-2 sentence answer]

**Key Findings**:
1. [Finding with file path/link]
2. [Finding with file path/link]
3. [Finding with file path/link]

**Code Flow**:
[Brief description or simple diagram]

**Evidence**:
- [Path/link]: [what it shows]
- [Path/link]: [what it shows]
```

---

## Step 2: Ask User (MANDATORY)

After presenting summary, always ask:

> "Would you like me to:
> 1. **Save this research** to `.octocode/research/{session-name}/research.md`?
> 2. **Continue researching** specific areas?
> 3. **Something else**?"

---

## Step 3: Generate Document (if requested)

### Output Location

| Path | Purpose |
|------|---------|
| `.octocode/context/context.md` | User preferences & project context |
| `.octocode/research/{session-name}/research_summary.md` | Ongoing research summary |
| `.octocode/research/{session-name}/research.md` | Final research document |

### Session Naming

Derive `{session-name}` from the user's question (kebab-case):

| User Question | Session Name |
|---------------|--------------|
| "How does authentication work?" | `auth-flow` |
| "Trace the payment processing" | `payment-processing` |
| "What calls the UserService?" | `user-service-callers` |
| "Compare express vs fastify" | `express-fastify-comparison` |

### Document Template

**Location**: `.octocode/research/{session-name}/research.md`

```markdown
# Research Goal
[User's question / research objective]

# Answer
[Overview TL;DR of findings]

# Details

## Visual Flows
[Mermaid diagrams for code/data flows]

## Code Flows
[High-level flow between files/functions/modules/services]

## Key Findings
[Detailed evidence with code snippets - up to 10 lines each]

## Edge Cases / Caveats
[Limitations, uncertainties, areas needing more research]

# References
- [Full file paths for local / GitHub links for external]

---
Created by Octocode Research Skill | https://octocode.ai
```

---

## GitHub Link Format

For external research, include full GitHub links:

```markdown
## References
- [Router implementation](https://github.com/expressjs/express/blob/master/lib/router/index.js#L42)
- [Middleware chain](https://github.com/expressjs/express/blob/master/lib/router/route.js#L15-L30)
- [PR #1234: Added async support](https://github.com/expressjs/express/pull/1234)
```

**Format**: `https://github.com/{owner}/{repo}/blob/{branch}/{path}#L{line}` or `#L{start}-L{end}` for ranges.

---

## Local Path Format

For local research, use absolute paths with line numbers:

```markdown
## References
- `/project/src/auth/middleware.ts:15` - authenticate function entry
- `/project/src/auth/service.ts:42-58` - token validation logic
- `/project/src/utils/jwt.ts:10` - JWT helper
```
