# RFC Generator

Research-driven RFC and design document generator using octocode-tools CLI.

## When to Use
- User asks to "create an RFC", "write a design doc", "propose a migration"
- "How should we architect X", "evaluate options for X", "compare approaches"
- Needs a technical decision document before coding
- For planning with implementation, use plan.md instead

## Flow

`UNDERSTAND` → `RESEARCH` → `DRAFT RFC` → `VALIDATE` → `DELIVER`

Output: `.octocode/rfc/RFC-{meaningful-name}.md`

## Principles

- Big picture first — understand the full system flow before zooming in
- Never fabricate — if you don't know, research. If research is empty, say "unknown"
- Architecture over patching — solve root causes
- Simple over clever — the best solution is the simplest one
- Alternatives are mandatory — never just "do X"
- Drawbacks build trust — honest cost analysis

## Phase 1: Understand

1. What is the problem? (1-2 sentences)
2. Why does it need an RFC?
3. Who is affected?
4. What are the constraints?

If trivial single-file change → suggest skipping RFC.

## Phase 2: Research

Dual-track research using CLI tools:

### Track A — Local Codebase

```bash
# How does the codebase handle this today?
npx -y octocode-tools local-search --pattern "current_approach" --path ./src --type ts

# Which modules are impacted?
npx -y octocode-tools lsp-references --uri ./src/module.ts --symbol "AffectedType" --line-hint 10

# What patterns exist?
npx -y octocode-tools local-search --pattern "middleware\|interceptor\|handler" --path ./src --files-only

# What dependencies are involved?
npx -y octocode-tools local-search --pattern "from '.*'" --path ./src/affected-area --type ts --files-only
```

### Track B — External Best Practices

```bash
# How do major projects solve this?
npx -y octocode-tools search-repos --keywords "caching,middleware,express" --sort stars --limit 5

# What packages exist?
npx -y octocode-tools search-packages --name "cache-manager" --ecosystem npm --fetch-metadata --limit 3

# Explore implementations
npx -y octocode-tools tree --owner owner --repo best-repo --path src --depth 2
npx -y octocode-tools search-code --keywords "cache,strategy" --owner owner --repo best-repo --extension ts

# Check PRs for patterns
npx -y octocode-tools search-prs --owner owner --repo best-repo --query "caching strategy" --merged
```

### When to Run Which Track

| Scenario | Tracks |
|----------|--------|
| Most RFCs | Both A + B |
| Internal refactor | A only |
| Greenfield, no existing code | B only |
| Technology evaluation | B heavy, A light |

### Quality Bar
- Every finding is a code reference (file:line) or URL
- Each reference explains how it supports the thesis
- Key claims verified with second source

## Phase 3: Draft RFC

### Template

```markdown
# RFC: {Title}

## 1. Summary
One paragraph — reader understands the core idea.

## 2. Motivation
Problem, current state (with file refs), evidence, impact.
This is the most important section.

## 3. Guide-Level Explanation
Teach it as if already implemented — examples, naming, adoption.

## 4. Reference-Level Explanation
Technical design, diagrams, API changes, corner cases.

## 5. Drawbacks
Honest costs — simpler alternatives? Breaking changes? Blast radius?

## 6. Rationale & Alternatives
Minimum 2 alternatives + comparison matrix + trade-offs.

| Criteria | Option A | Option B | Option C |
|----------|----------|----------|----------|
| Complexity | Low | Medium | High |
| Performance | Good | Best | Good |
| Migration Cost | None | Medium | High |

## 7. Prior Art
What exists already — lessons from others.

## 8. Unresolved Questions
- Before acceptance: [questions]
- During implementation: [questions]
- Out of scope: [questions]

## 9. References
### Local
- `src/module.ts:42` — current implementation
### External
- https://github.com/owner/repo — reference implementation

## 10. Implementation Plan
Phased steps with risk mitigations and testing strategy.
```

## Phase 4: Validate

Self-review checklist:
- [ ] Problem statement is specific
- [ ] Current state documented with file references
- [ ] At least 2 alternatives with evidence-backed trade-offs
- [ ] Recommendation follows logically from comparison
- [ ] Drawbacks are honest
- [ ] All references are real (from research)
- [ ] No claims without evidence

## Phase 5: Deliver

Present summary to user. Ask: "Do you want to start implementing this RFC?"
- Yes → Save RFC, switch to plan mode
- No → Save RFC only
