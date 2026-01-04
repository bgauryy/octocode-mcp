---
name: octocode-pr-review
description: Reviews pull requests for bugs, security vulnerabilities, architecture problems, performance issues, and code quality. Use when reviewing PRs, analyzing diffs, checking code changes, or performing code review.
---

# Octocode PR Review

Defects-first PR review using Octocode MCP tools.

## Core Principle

```
FOCUS ON CHANGED CODE ONLY ('+' prefix lines)
```

1. **Defects First**: Prioritize bugs, security, and breaking changes
2. **Unique Suggestions**: Check existing PR comments to avoid duplicates
3. **Cite Precisely**: Reference exact file paths and line numbers

## Flow

```
CONTEXT → USER CHECKPOINT → ANALYSIS → FINALIZE → REPORT
```

## Tools

| Tool | Purpose |
|------|---------|
| `githubSearchPullRequests` | Fetch PR metadata, diffs, comments |
| `githubGetFileContent` | Read full file context |
| `githubSearchCode` | Find patterns in repo |
| `localSearchCode` | Search local codebase |
| `localGetFileContent` | Read local files |
| `packageSearch` | Check dependency info |

## Domain Reviewers

### Bug Domain
**Detect**: Runtime errors, logic flaws, null access, race conditions, type violations
**Priority**:
- HIGH: Crashes, data corruption, security breach
- MED: Edge-case errors, uncertain race conditions
- LOW: Theoretical issues without evidence

### Architecture Domain
**Detect**: Pattern violations, tight coupling, circular dependencies, wrong module placement
**Priority**:
- HIGH: Breaking public API, circular dependencies causing bugs
- MED: Significant pattern deviations, tech debt increase
- LOW: Minor inconsistencies

### Performance Domain
**Detect**: O(n²) where O(n) possible, blocking operations, memory leaks, missing cache
**Priority**:
- HIGH: O(n²) on large datasets, memory leaks, blocking main thread
- MED: Moderate inefficiency in frequent paths
- LOW: Micro-optimizations

### Code Quality Domain
**Detect**: Naming violations, convention breaks, visible typos, magic numbers
**Priority**:
- HIGH: Typos in public API/endpoints
- MED: Internal naming issues, DRY violations
- LOW: Comment typos, minor readability

### Error Handling Domain
**Detect**: Swallowed exceptions, unclear error messages, missing debugging context
**Priority**:
- HIGH: Swallowed exceptions hiding critical failures
- MED: Unclear error messages, missing context in logs
- LOW: Verbose logging improvements

### Flow Impact Domain
**Detect**: How changed code alters existing execution flows
**Priority**:
- HIGH: Changes that break existing callers, alter critical paths
- MED: Flow changes requiring updates in dependent code
- LOW: Internal refactors with same external behavior

## Execution

### Phase 1: Context
1. Fetch PR metadata and diff: `githubSearchPullRequests(prNumber, type="metadata")`
2. Review existing PR comments first (avoid duplicates!)
3. Classify risk: High (Logic/Auth/API/Data) vs Low (Docs/CSS)
4. Flag large PRs (>500 lines) → suggest splitting

### Phase 2: User Checkpoint (MANDATORY)
Present to user:
- **PR Overview**: What this PR does (1-2 sentences)
- **Files Changed**: Count and key areas
- **Risk Assessment**: HIGH / MEDIUM / LOW
- **Key Areas**: List 3-5 main functional areas

Ask: "Which areas would you like me to focus on?"

### Phase 3: Analysis
For each changed file:
1. Read full context with `githubGetFileContent`
2. Apply domain reviewers (Bug, Security, Architecture, Performance, Quality)
3. Search for patterns in repo with `githubSearchCode`
4. Check local impact with `localSearchCode`

### Phase 4: Report
Generate structured review with:
- Summary of changes
- Findings by priority (HIGH → MED → LOW)
- Each finding: Domain, File, Line, Issue, Suggested Fix

## What to Skip

- Compiler/TypeScript/Linter errors (tooling catches these)
- Unchanged code (no '+' prefix)
- Test implementation details (unless broken)
- Generated/vendor files
- Style preferences (use linters)
- Issues already raised in existing PR comments

## Research Flows

| From | Need | Go To |
|------|------|-------|
| PR Diff | Full file context | `githubGetFileContent` |
| Changed function | Existing callers | `githubSearchCode` |
| Import statement | External definition | `packageSearch` → `githubViewRepoStructure` |
| Changed API | Local impact | `localSearchCode` |

## Confidence Levels

| Level | Certainty | Action |
|-------|-----------|--------|
| HIGH | Verified issue exists | Include |
| MED | Likely issue, missing context | Include with caveat |
| LOW | Uncertain | Investigate more OR skip |

Note: Confidence ≠ Severity. HIGH confidence typo = Low Priority. LOW confidence security flaw = flag but mark uncertain.
