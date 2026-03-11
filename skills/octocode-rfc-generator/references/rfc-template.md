# RFC Template

## Template

```markdown
# RFC: {Title}

| Field | Value |
|-------|-------|
| **Status** | Draft / In Review / Accepted / Rejected / Superseded |
| **Author(s)** | {names} |
| **Created** | {YYYY-MM-DD} |
| **Last Updated** | {YYYY-MM-DD} |

---

## Summary

One paragraph. A reader understands the core idea after this section alone.

---

## Motivation

Why are we doing this? Focus on the problem, not the solution.

- **Problem**: The specific pain or gap
- **Current state**: How the codebase handles this today (include `file:line` refs)
- **Evidence**: Concrete proof the problem exists — logs, metrics, code smells, developer friction
- **Impact**: Who is affected and how
- **Use cases**: Concrete examples where this hurts

This is the most important section. It can be lengthy. If this RFC is not
accepted, the motivation should still be reusable for alternative proposals.

---

## Guide-Level Explanation

Explain the proposal as if it was already implemented and you were teaching
it to another engineer. New concepts, examples, migration guidance.

- What names and terminology work best for these concepts and why?
- How is this idea best presented — as a continuation of existing patterns, or wholly new?
- If applicable, provide sample error messages, deprecation warnings, or migration guidance.
- How should this be taught to existing users vs. new users?
- Would documentation need to be reorganized or altered? Consider API docs, guides, blog posts, tutorials.

---

## Reference-Level Explanation

Technical design detail. Architecture diagrams (Mermaid), API/interface
changes, interaction with existing features, corner cases by example.

For every design choice, include:
- **What** you chose and **why** (link to §Rationale)
- **What you considered and rejected** (link to §Alternatives)
- **What could go wrong** (link to §Drawbacks)
- **Compatibility**: Is this backward-compatible? Breaking changes? Do adopters need a new version? Can it be un-adopted later without breaking existing code?

Enough detail for someone familiar with the codebase to implement it.

---

## Drawbacks

Why should we NOT do this? Consider:

- Implementation cost, both in code size and complexity
- Can this be achieved with existing tools, a simpler approach, or configuration change?
- Maintenance burden and operational overhead
- Performance impact
- Learning curve and impact on teaching
- Migration cost — is this a breaking change? Can we write a codemod?
- Integration impact with other existing and planned features
- Risk of bugs and blast radius

Every proposal has costs. Being honest about them builds trust.

---

## Rationale and Alternatives

### Why This Design?
Why this is the best approach. Every claim must reference research evidence.
Link to specific files, external repos, or benchmarks that support the choice.

### Alternatives Considered (minimum 2)

#### Alternative A: {Name}
- **What**: {description}
- **Evidence**: {GitHub URL or package — where is this used?}
- **Pros / Cons**: {strengths and weaknesses}
- **Why not chosen**: {specific reason}

#### Alternative B: {Name}
- **What / Evidence / Pros / Cons / Why not chosen**

### Comparison Matrix

| Dimension | Proposed | Alt A | Alt B |
|-----------|----------|-------|-------|
| Codebase alignment | | | |
| Implementation complexity | | | |
| Maintenance burden | | | |
| Performance / scalability | | | |
| Community support / maturity | | | |
| Migration effort | | | |

### Trade-off Summary
What are we gaining and what are we giving up with each option? Be explicit.

### What If We Do Nothing?
Impact of not accepting this RFC. This is a valid alternative — give it honest consideration.

---

## Prior Art

What exists already — in the ecosystem, in the codebase, in the literature.
Lessons learned from others. If no prior art, state that explicitly.

---

## Unresolved Questions

**Before acceptance:**
- [ ] {question}

**During implementation:**
- [ ] {question}

**Out of scope:**
- [ ] {question}

**Bikeshedding** _(cosmetic/arbitrary decisions — syntax, naming, formatting — that should not block the proposal)_:
- [ ] {decision}

> **Tip:** Mark inline open questions anywhere in the RFC with: `> **Open Question:** {question}`

---

## Future Possibilities

_(Optional)_ Natural extensions of this proposal. Related ideas that are
out of scope but worth noting. Not a reason to accept the current RFC.

---

## References

Every reference must state **how it supports the RFC thesis**.

### Code References
- [`src/auth/middleware.ts:42`](https://github.com/owner/repo/blob/main/src/auth/middleware.ts#L42) — current token validation; proves §Motivation claim that auth is coupled to HTTP layer
- [`src/cache/store.ts:15-30`](https://github.com/owner/repo/blob/main/src/cache/store.ts#L15-L30) — existing cache pattern; supports §Reference-Level design choice to extend this abstraction

### URLs
- [Express rate-limit benchmarks](https://github.com/express-rate-limit/express-rate-limit/wiki/benchmarks) — proves §Rationale claim that middleware approach scales to 10k req/s
- [Redis vs Memcached comparison (ByteByteGo)](https://blog.bytebytego.com/p/redis-vs-memcached) — supports §Alternatives analysis of cache backends

### Related
- {Links to related RFCs, design docs, or ADRs}

---

## Implementation Plan

### Approach
{Which recommendation is being implemented and why — traces to §Rationale}

### Steps
#### Phase 1: {name}
- [ ] Step — `path/to/file` (ref: §Reference-Level)
- [ ] Step — `path/to/file`

#### Phase 2: {name}
- [ ] Step — `path/to/file`

### Risk Mitigations
{Concrete actions per risk — traces to §Drawbacks}

### Testing Strategy
| Type | Scope | Approach |
|------|-------|----------|
| Unit | {components} | {approach} |
| Integration | {flows} | {approach} |
| Performance | {metrics} | {approach} |

### Rollout Strategy
{Feature flags? Gradual? Big bang? Rollback plan?}
```
