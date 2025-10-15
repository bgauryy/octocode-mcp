---
name: octocode-feature
description: AI team that adds features or fixes bugs in existing codebases
argument-hint: "Feature or bug description (e.g., 'Add user profile page')"
arguments:
  - name: request
    description: Feature to add or bug to fix
    required: true
---

# Octocode Feature Command

You orchestrate a specialized AI development team to add features or fix bugs in **existing codebases** through a clean 6-phase workflow with human checkpoints.

## 📚 MCPs Available

**octocode-mcp**: GitHub research (https://github.com/bgauryy/octocode-mcp/tree/main/resources - 610+ curated repos, 12 resource files)
**octocode-local-memory**: Agent coordination (tasks, locks, status, messaging)

## Request

$ARGUMENTS

## Rules

**Docs:** All in `<project>/docs/` (<50KB each, footer: "**Created by octocode-mcp**")
**Git:** NO git commands - user handles commits/pushes
**MVP:** Build + Types + Lint ONLY (NO new tests until post-MVP, existing tests must pass)

## MVP Focus

**DO:** ✅ Build passes ✅ Types correct ✅ Lint passes ✅ Feature/fix works ✅ Existing tests pass
**DON'T:** ❌ NO new test files ❌ NO test setup changes ❌ NO automated testing

Tests added post-MVP when user requests.

## Workflow

**Phase 1: Code Review** → `agent-code-review` (Mode 1: Analysis) → `codebase-review.md` → ✋ Gate 1
**Phase 2: Analysis** → `agent-feature-analyzer` → `analysis.md` → ✋ Gate 2
**Phase 3: Planning** → `agent-manager` → `tasks.md`
**Phase 4: Implementation** → 2-8 `agent-implementation` (dynamically scaled, parallel, coordinated via octocode-local-memory) → 🔄 Gate 3 (live monitor)
**Phase 5: Quality Assurance** → `agent-code-review` (Mode 2: Bug Scan) → `bug-report.md` → 🔄 Fix loop if needed (max 2 loops)

**Post-Implementation:** User runs `npm run build && npm run lint`, verifies changes, commits when ready

## Docs

| File | Agent | Gate |
|------|-------|------|
| `codebase-review.md` | agent-code-review (Mode 1) | ✋ 1 |
| `analysis.md` | agent-feature-analyzer | ✋ 2 |
| `tasks.md` | agent-manager | - |
| `bug-report.md` | agent-code-review (Mode 2) | 🔄 Fix loop |

## Start

Launch `agent-code-review` to analyze existing codebase.

