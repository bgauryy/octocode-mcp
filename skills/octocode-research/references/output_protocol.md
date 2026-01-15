# Presenting Research Findings

> **Principle**: Match output depth to question depth. Explain what you learned, not what tools returned.

---

## The Core Idea

Your job isn't to dump tool output - it's to **answer the user's question** with evidence.

Good output:
- Answers the question directly
- Shows your reasoning
- Backs claims with code evidence
- Adapts to complexity

---

## Scaling Your Response

### Simple Questions → Simple Answers

**"Where is the auth middleware?"**

```
The auth middleware is at src/middleware/auth.ts:15

It validates JWT tokens and attaches the user to the request context.
```

That's it. No ceremony needed.

### Medium Questions → Structured Summary

**"How does authentication work?"**

```
## Authentication Flow

The auth system has three main parts:

1. **Token validation** (src/middleware/auth.ts:15)
   - Extracts JWT from Authorization header
   - Validates signature and expiry

2. **User lookup** (src/services/user.ts:42)
   - Fetches user from database by token subject
   - Caches result for request duration

3. **Context attachment** (src/middleware/auth.ts:28)
   - Attaches user to req.user
   - Passes to next middleware

Evidence:
- JWT handling: src/middleware/auth.ts:20-25
- User service call: src/middleware/auth.ts:26
```

### Complex Questions → Research Document

**"Trace the entire checkout flow including payment, inventory, and notifications"**

For multi-part investigations:
1. Present a summary first
2. Offer to save as a document
3. Structure findings by axis

---

## What Makes Good Evidence

**Good**: Specific path:line references
```
The validation happens at src/validators/user.ts:42
```

**Bad**: Vague references
```
It's somewhere in the validators folder
```

**Good**: Explains what code does
```
This function (src/auth.ts:15) checks the token signature
then calls the user service to fetch the full profile.
```

**Bad**: Just describes what tool said
```
The search found 5 matches in auth.ts
```

---

## Showing Your Thinking

Users trust research more when they understand your approach:

```
My approach:
1. I searched for authentication entry points
2. Found the main middleware at auth.ts:15
3. Traced the calls it makes to understand the flow
4. Verified with references to ensure I found all paths

Here's what I learned: [findings]
```

This transparency builds confidence in your conclusions.

---

## When to Offer Documents

**Don't offer to save** for:
- Quick lookups ("where is X?")
- Simple explanations ("what does Y do?")

**Offer to save** when:
- Research spans 3+ files
- Flow traces are complex
- User might need to reference later
- Investigation took significant effort

**Suggest saving** as:
```
This was a comprehensive investigation. Would you like me to save
this research to .octocode/research/auth-flow/research.md?
```

---

## Document Structure (When Saving)

```markdown
# Research: [Topic]

## Question
[What the user asked]

## Answer
[2-3 sentence summary - the key insight]

## Findings

### [Section 1]
[Explanation with evidence]

### [Section 2]
[Explanation with evidence]

## Evidence Summary
| Component | Location | Purpose |
|-----------|----------|---------|
| [name] | path:line | [role] |

## Notes
- [Caveats or limitations]
- [Areas for further investigation]
```

---

## Quality Checklist

Before presenting findings, verify:

- [ ] **Answers the question** - Does this actually help the user?
- [ ] **Has evidence** - Can I point to specific code?
- [ ] **Explains meaning** - Do I explain what the code does, not just where it is?
- [ ] **Appropriate depth** - Am I matching response to question complexity?
- [ ] **Shows reasoning** - Did I explain my approach?

---

## Adaptive Thinking

**Let the research guide your output:**

If you found exactly one match:
- Answer directly, cite the location

If you found a complex flow:
- Structure it as a sequence
- Show relationships

If you found multiple patterns:
- Organize by category
- Highlight the main pattern

If you're uncertain:
- Say so explicitly
- Explain what would help clarify

---

## Examples of Good Output

### Quick Lookup
```
The UserService is defined at src/services/user.ts:12

It provides methods for user CRUD operations and authentication.
```

### Flow Trace
```
## Login Flow

Request comes in → auth.ts validates → user.ts looks up profile → session.ts creates token

Key files:
- src/routes/auth.ts:25 - POST /login endpoint
- src/services/auth.ts:42 - validateCredentials()
- src/services/session.ts:18 - createSession()
```

### Impact Analysis
```
## Changing validateInput()

This function is used in 8 places:

Critical (will break):
- src/routes/user.ts:42 - user creation
- src/routes/product.ts:28 - product updates

Tests that will fail:
- tests/validation.test.ts (3 test cases)
- tests/user.test.ts (2 test cases)

Safe to change:
- The function has no side effects
- All callers expect the same signature
```

---

## The Goal

**You're not a tool proxy.** You're a researcher who uses tools to answer questions.

Present findings as insights, not as tool output. Help the user understand, not just know.
