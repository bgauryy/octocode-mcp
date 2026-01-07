# Research Flows Reference

This document contains detailed research flow guidelines and tool transition patterns for PR review.

---

## Research Dimensions

Use Octocode tools to understand full context beyond the diff.

| Dimension | Goal | Tools |
|-----------|------|-------|
| **IN REPO** | Existing patterns, conventions | `localViewStructure`, `localSearchCode`, `githubViewRepoStructure` |
| **NEW (PR)** | Analyze changes, verify logic | `localGetFileContent`, `githubSearchCode`, `githubGetFileContent` |
| **OLD (History)** | Why things exist, commit progression | `githubSearchPullRequests`, `githubGetFileContent` |
| **EXTERNAL** | Library usage, security | `packageSearch`, `githubSearchCode` (across orgs) |

---

## Tool Transition Matrix

When to switch between tools based on what you need next:

| From Tool | Need... | Go To Tool |
|-----------|---------|------------|
| `githubSearchCode` | Context/Content | `githubGetFileContent` |
| `githubSearchCode` | More Patterns | `githubSearchCode` |
| `githubSearchCode` | Package Source | `packageSearch` |
| `githubSearchPullRequests` | File Content | `githubGetFileContent` |
| `githubGetFileContent` | More Context | `githubGetFileContent` (widen) |
| `githubGetFileContent` | New Pattern | `githubSearchCode` |
| `import` statement | External Definition | `packageSearch` then `githubViewRepoStructure` |

---

## Structural Code Vision

**Think Like a Parser**: Visualize AST (Entry then Functions then Imports/Calls).

Key principles:
- Trace `import {X} from 'Y'` - GO TO 'Y'
- Follow flow: Entry then Propagation then Termination
- Ignore noise - focus on the critical path

---

## Key Principles for Research

- **Align**: Tool supports hypothesis
- **Validate**: Real code only (not dead/test/deprecated). Check `updated` dates.
- **Links**: Use full GitHub links for code references (https://github.com/OWNER/REPO/blob/BRANCH/PATH)
- **Refine**: Weak reasoning? Change tool/query.
- **Efficiency**: Batch queries (1-3). Metadata before content.
- **User Checkpoint**: Unclear scope or blocked? Ask user.
- **Tasks**: Use `TodoWrite` to track progress.
- **No Time Estimates**: Never provide timing/duration estimates.

---

## Common Research Patterns

### Pattern: Trace Function Usage
1. `githubSearchCode` - find function definition
2. `githubSearchCode` - find all callers
3. `githubGetFileContent` - read implementation details

### Pattern: Understand External Dependency
1. `packageSearch` - get package info and repo URL
2. `githubViewRepoStructure` - explore package structure
3. `githubGetFileContent` - read relevant source

### Pattern: Check Historical Context
1. `githubSearchPullRequests` - find related PRs
2. Review PR discussions and decisions
3. `githubGetFileContent` - compare before/after states
