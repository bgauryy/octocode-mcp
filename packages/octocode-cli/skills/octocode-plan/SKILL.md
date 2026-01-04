---
name: octocode-plan
description: This skill should be used when planning complex implementations that require research, multiple steps, or architectural decisions.
version: 1.0.0
---

# Octocode Plan

Research-driven planning and implementation using Octocode MCP tools.

## Core Principle

```
RESEARCH BEFORE CODE. VERIFY PATTERNS. FOLLOW THE PLAN.
```

1. **Research First**: Validate patterns in high-quality repos before writing code
2. **Plan Before Implement**: Break down tasks, identify risks
3. **Green Build Required**: All changes must pass build/lint/test

## Flow

```
UNDERSTAND → RESEARCH → PLAN → [IMPLEMENT] → VERIFY
```

## Tools

**Research**:
| Tool | Purpose |
|------|---------|
| `packageSearch` | Find libs/metadata |
| `githubSearchRepositories` | Find reference repos |
| `githubViewRepoStructure` | Map layout |
| `githubSearchCode` | Find implementations |
| `githubGetFileContent` | Read code |
| `localSearchCode` | Search local codebase |
| `localGetFileContent` | Read local files |

**Execution**: `Read`, `Write`, `Edit`, `Bash`

## Goal Classification

| Type | Description | Action |
|------|-------------|--------|
| `RESEARCH_ONLY` | No code changes | Research → Report |
| `ANALYSIS` | Understand existing code | Research → Document |
| `CREATION` | New files/features | Research → Plan → Implement |
| `FEATURE` | Add to existing | Research → Plan → Implement |
| `BUG` | Fix issue | Research → Plan → Implement |
| `REFACTOR` | Improve structure | Research → Plan → Implement |

## Execution Phases

### Phase 0: Understand
1. Classify goal type (above)
2. Assess complexity: Quick | Medium | Thorough
3. Gather context: existing code, patterns, dependencies
4. Define constraints: tech stack, style, testing requirements

**User Checkpoint**: If scope unclear or >2 repos involved → STOP & ASK

### Phase 1: Research
**Progressive Discovery**: PKG → REPO → STRUCT → PATTERN → READ

| Stage | Tool | Goal |
|-------|------|------|
| PKG | `packageSearch` | Find libs/metadata |
| REPO | `githubSearchRepositories` | Find reference repos |
| STRUCT | `githubViewRepoStructure` | Map layout |
| PATTERN | `githubSearchCode` | Find implementations |
| READ | `githubGetFileContent` | Read code |

**Research Loop (ReAct)**:
1. **THOUGHT**: What do I need to know next?
2. **ACTION**: Execute Octocode tool
3. **OBSERVATION**: Analyze results - hypothesis confirmed?
4. **DECISION**: Use finding | Research more | Ask user

**Quality Guards**:
- Key findings need second source unless primary is definitive
- Prefer repos updated within last year
- Real code only (no dead code, deprecated, tests unless researching tests)

### Phase 2: Plan
Write plan with:
- Summary of approach
- Step-by-step tasks with file paths
- Dependencies/prerequisites
- Risk areas and mitigations
- Validation checklist

**Plan Template**:
```markdown
# Plan: {Title}

## Summary
[TL;DR of approach]

## Research Findings
[Key patterns with confidence levels]

## Implementation Steps
1. [ ] Step 1: [Description] - `path/to/file`
2. [ ] Step 2: [Description] - `path/to/file`

## Risk Areas
- [Potential issues and mitigations]

## Validation
- [ ] Build passes
- [ ] Tests pass
- [ ] [Custom checks]
```

**CRITICAL**: Wait for explicit user approval before implementing

### Phase 3: Implement
Prerequisite: Approved plan from Phase 2

**Execution Loop**:
1. **THOUGHT**: Next plan step? Dependencies resolved?
2. **ACTION**: Read file → Write/Edit → Verify
3. **OBSERVATION**: Success? Errors? Side effects?
4. **LOOP**: Success → Next step; Fail → Fix

**Guidelines**:
- Follow plan sequentially
- Use explicit file paths
- Add TypeScript types
- Handle errors appropriately
- Minimal changes only

### Phase 4: Verify
**For Code Changes**:
- [ ] `npm run build` passes
- [ ] `npm run lint` clean
- [ ] `npm test` passes
- [ ] No TypeScript errors

**Loop**: Fail → Fix → Re-verify until all green

## Confidence Framework

| Finding | Confidence | Action |
|---------|------------|--------|
| Single authoritative source | HIGH | Use directly |
| Multiple consistent sources | HIGH | Use with references |
| Single non-authoritative source | MED | Seek second source |
| Conflicting sources | LOW | Ask user |
| No sources found | LOW | Try semantic variants OR ask user |

## When to Skip Planning

- Single-file, obvious fix
- User provides exact implementation
- Trivial changes (typo, comment, formatting)

## Error Recovery

| Situation | Action |
|-----------|--------|
| Research returns empty | Try semantic variants, broaden scope |
| Too many results | Add filters (path, extension, owner/repo) |
| Conflicting patterns | Find authoritative source OR ask user |
| Build fails | Check error, fix, re-verify |
| Blocked >2 attempts | Summarize → Ask user for guidance |
