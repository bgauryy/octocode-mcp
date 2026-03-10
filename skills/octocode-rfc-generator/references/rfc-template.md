# RFC Template

Every section must include **evidence**. Proof is either a **code reference** (full GitHub link to file + line) or a **URL** (docs, articles, benchmarks). Each reference must explain **how it supports the RFC thesis** — not just "see this link" but "this proves X because Y".

---

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

---

## Reference-Level Explanation

Technical design detail. Architecture diagrams (Mermaid), API/interface
changes, interaction with existing features, corner cases by example.

For every design choice, include:
- **What** you chose and **why** (link to §Rationale)
- **What you considered and rejected** (link to §Alternatives)
- **What could go wrong** (link to §Drawbacks)

Enough detail for someone familiar with the codebase to implement it.

---

## Drawbacks

Why should we NOT do this? Implementation cost, maintenance burden,
performance impact, learning curve, migration cost, risk of bugs.

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

---

## Section Requirements

| # | Section | Required | Notes |
|---|---------|----------|-------|
| 1 | Summary | Yes | 1 paragraph max |
| 2 | Motivation | Yes | Most important — problem, current state, evidence, impact |
| 3 | Guide-Level Explanation | Yes | Teach it as if already implemented |
| 4 | Reference-Level Explanation | Yes | Technical detail for implementers, diagrams |
| 5 | Drawbacks | Yes | Honest cost/benefit — builds trust |
| 6 | Rationale & Alternatives | Yes | Minimum 2 alternatives + comparison matrix + trade-offs |
| 7 | Prior Art | Yes | N/A with rationale if none exists |
| 8 | Unresolved Questions | If any | Categorize: before/during/out-of-scope |
| 9 | Future Possibilities | Optional | Out-of-scope ideas, not a reason to accept |
| 10 | References | Yes | `file:line` local, full URLs external |
| 11 | Implementation Plan | Yes | Steps, risk mitigations, testing, rollout — traces to RFC |

---

## Thinking & Reasoning Hints

### Per-Section Self-Check

| # | Section | Ask Yourself | Evidence Required |
|---|---------|-------------|-------------------|
| 1 | Summary | "If someone reads ONLY this, do they get it?" | — |
| 2 | Motivation | "Am I describing the problem or jumping to my solution?" | `file:line` refs showing current pain, concrete use cases |
| 3 | Guide-Level | "Would a new team member understand without asking me?" | Examples, migration guidance |
| 4 | Reference-Level | "Could someone implement this without talking to me?" | Architecture diagram, API examples, corner cases |
| 5 | Drawbacks | "Am I honest, or protecting my proposal?" | Quantified costs where possible |
| 6 | Alternatives | "Did I seriously consider these, or list them to dismiss?" | External URLs proving each alternative is real and used |
| 7 | Prior Art | "What can I learn from others' mistakes, not just successes?" | Links to repos, PRs, post-mortems, blog posts |
| 8 | Unresolved Questions | "Am I hiding unknowns as assumptions?" | Categorized: before/during/out-of-scope |
| 9 | References | "Can a reader verify every claim by clicking a link?" | `file:line` + full URLs — no dead links |
| 10 | Implementation Plan | "Are steps ordered by dependency, not preference?" | `file:line` for every step, risk mitigations |

### Evidence & Proof Discipline

Proof is a **code reference** (full GitHub/GitLab/Bitbucket link) or a **URL** (docs, blog, benchmark). Each must explain **how it helps the RFC thesis**.

| Claim Type | Proof Type | Example | How It Helps Thesis |
|-----------|-----------|---------|---------------------|
| "Current code does X" | Code ref | [`src/auth/middleware.ts:42`](https://github.com/.../middleware.ts#L42) | Proves the coupling problem described in §Motivation |
| "Library Y solves this" | URL | [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit) (3k stars) | Validates §Proposed Solution — mature, battle-tested |
| "Approach Z is better" | Code ref + URL | §Comparison Matrix — wins 4/6 dimensions | Supports §Rationale recommendation over alternatives |
| "Risk is low/medium/high" | Code ref | 2 files affected ([link1], [link2]), tests exist ([link3]) | Quantifies §Drawbacks — bounded blast radius |
| "This is the standard pattern" | URL | [Redis docs](url), [Go stdlib](url) | Supports §Prior Art — industry-proven approach |
| "Performance claim" | URL | [Benchmark results](url) | Backs §Rationale with measured data, not assumptions |

**Rule: If you can't provide proof → mark it as an unresolved question, not a claim.**
**Rule: If a reference doesn't connect to an RFC section → it doesn't belong.**

### Trade-off Thinking

For every recommendation, explicitly state:

- **What we gain** — the benefit, with evidence
- **What we give up** — the cost, honestly
- **What we defer** — what this doesn't solve (see §Future Possibilities)
- **What could break** — risks, with mitigation plan (see §Drawbacks)

### Reasoning Traps to Avoid

- **Anchoring** — Don't fall in love with your first idea. Research alternatives with equal rigor.
- **Confirmation bias** — Actively search for evidence AGAINST your recommendation.
- **Sunk cost** — If research reveals your initial approach is wrong, pivot. The RFC is the place to change your mind.
- **False dichotomy** — "X or Y" is rarely complete. Look for hybrids, phased rollouts, or "do nothing".
- **Handwaving risks** — "Low risk" without evidence = unknown risk.
- **Appeal to popularity** — "Everyone uses X" is not a reason. WHY do they use it, and does that reason apply here?

### Strong RFC Signals

Aim for these — they indicate a well-reasoned RFC:

- Motivation section could survive even if the rest of the RFC is rejected
- A reader can disagree with your recommendation but still find the RFC valuable
- Alternatives section taught you something you didn't know before researching
- Drawbacks section would satisfy your biggest skeptic
- Every claim has a clickable reference — no reader needs to "trust you"

## References

- [Rust RFC template](https://github.com/rust-lang/rfcs/blob/master/0000-template.md) — Guide + Reference split, Prior Art
- [Go Proposal template](https://github.com/golang/proposal/blob/master/design/TEMPLATE.md) — concise, rationale-focused
- [npm RFC template](https://github.com/npm/rfcs/blob/main/accepted/0000-template.md) — mandates alternatives "even if it seems like a stretch"
