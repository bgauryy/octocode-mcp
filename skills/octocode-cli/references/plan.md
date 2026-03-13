# Plan & Implement

Adaptive research-driven planning and implementation using octocode-cli CLI.

## When to Use
- User asks to "plan & implement", "plan this work", "research & build"
- Needs a multi-step pipeline: Understand → Research → Plan → Implement → Verify
- For design documents without implementation, use rfc-generator.md instead

## Flow

`UNDERSTAND` → `RESEARCH` → `PLAN` → [`IMPLEMENT`] → `VERIFY`

## Phase 0: Understand

Clarify the problem before doing anything:
1. Classify goal: RESEARCH_ONLY | ANALYSIS | CREATION | FEATURE | BUG | REFACTOR
2. Assess complexity: Quick | Medium | Thorough
3. Define constraints: tech stack, style, testing requirements
4. Validate understanding with user

If scope is unclear — ask user. Do not proceed without clarity.

## Phase 1: Research

Use octocode-cli CLI for evidence-based research:

### Local Codebase Research
```bash
# Understand structure
npx -y octocode-cli local-tree --path . --depth 2

# Find relevant patterns
npx -y octocode-cli local-search --pattern "auth\|login\|session" --path ./src --type ts

# Trace definitions
npx -y octocode-cli lsp-definition --uri ./src/auth.ts --symbol-name "createSession" --line-hint 25

# Find all usages
npx -y octocode-cli lsp-references --uri ./src/auth.ts --symbol-name "createSession" --line-hint 25

# Trace call chain
npx -y octocode-cli lsp-call-hierarchy --uri ./src/auth.ts --symbol-name "createSession" --line-hint 25 --direction incoming
```

### External Research
```bash
# Find libraries/patterns
npx -y octocode-cli search-packages --name "express-rate-limit" --ecosystem npm --fetch-metadata

# Explore reference implementations
npx -y octocode-cli search-repos --keywords-to-search "rate,limiting,middleware" --sort stars --limit 5
npx -y octocode-cli tree --owner express-rate-limit --repo express-rate-limit --depth 2
npx -y octocode-cli search-code --keywords-to-search "rateLimit,middleware" --owner express-rate-limit --repo express-rate-limit

# Check PR patterns
npx -y octocode-cli search-prs --owner expressjs --repo express --query "rate limit" --merged
```

### Quality Bar
- Every finding needs a code reference (file:line) or URL
- Key claims need second source verification
- Prefer recently updated repos/docs

Present research TL;DR to user before documenting.

## Phase 2: Plan

Synthesize research into actionable plan:

```markdown
# Plan: {Title}

## Summary
[TL;DR of approach]

## Research Findings
[Key patterns with confidence levels]

## Implementation Steps
1. [ ] Step 1: [Description] - `path/to/file` (ref: research finding)
2. [ ] Step 2: [Description] - `path/to/file` (ref: research finding)

## Risk Areas
- [Potential issues and mitigations]

## Validation
- [ ] Build passes
- [ ] Tests pass
```

Every implementation step must reference a specific research finding. No step should exist without evidence.

Wait for explicit user approval before Phase 3.

## Phase 3: Implement

Execute the approved plan step by step:
1. Read file before modifying
2. Make minimal changes
3. Verify after each step

## Phase 4: Verify

- Build passes
- Tests pass
- No TypeScript errors
- Lint clean

Loop: Fail → Fix → Re-verify until green.

## Key Principles

- Research before code — every decision backed by evidence
- Evidence from CLI tools — use the funnel method
- Follow the plan — execute approved steps, don't improvise
- Escalate when stuck — summarize attempts, ask user
