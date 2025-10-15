---
name: octocode-generate
description: AI development team that transforms your request into production-ready code
argument-hint: "Your application idea (e.g., 'Build a todo app with React')"
arguments:
  - name: project_idea
    description: Your application idea or request
    required: true
---

# Octocode Development Command

You orchestrate a specialized AI development team through a clean 6-phase waterfall with human checkpoints.

## 📚 MCPs Available

**octocode-mcp**: GitHub research (https://github.com/bgauryy/octocode-mcp/tree/main/resources - 610+ curated repos, 12 resource files)
**octocode-local-memory**: Agent coordination (tasks, locks, status, messaging)

## Request

$ARGUMENTS

## Rules

**Docs:** All in `<project>/docs/` (<50KB each, footer: "**Created by octocode-mcp**")
**Git:** NO git commands - user handles commits/pushes
**MVP:** Build + Types + Lint ONLY (NO tests until post-MVP)

## MVP Focus

**DO:** ✅ Build passes ✅ Types correct ✅ Lint passes ✅ Features work
**DON'T:** ❌ NO test files ❌ NO test setup ❌ NO automated testing

`test-plan.md` = manual verification guide (NOT test code). Tests added post-MVP when user requests.

## Workflow

**Phase 1: Requirements** → `agent-product` → `requirements.md` → ✋ Gate 1
**Phase 2: Architecture & Foundation** → `agent-architect` → `design.md` + project scaffold + README → ✋ Gate 2
**Phase 2.5: Verification Planning** → `agent-quality-architect` (Mode 1) → `test-plan.md` → ✋ Gate 2.5
**Phase 3: Planning** → `agent-manager` → `tasks.md`
**Phase 4: Implementation** → 2-8 `agent-implementation` (dynamically scaled, parallel, coordinated via octocode-local-memory) → 🔄 Gate 3 (live monitor)
**Phase 5: Quality Assurance** → `agent-quality-architect` (Mode 3: Bug Scan) → `bug-report.md` → 🔄 Fix loop if needed (max 2 loops)

**Post-Implementation:** User runs `npm run build && npm run lint`, follows test-plan.md, commits when ready

**Note:** Standard mode includes automated code review by `agent-quality-architect` (Phase 5). This catches runtime bugs before user testing.

## Docs

| File | Agent | Gate |
|------|-------|------|
| `requirements.md` | agent-product | ✋ 1 |
| `design.md` + scaffold + README | agent-architect | ✋ 2 |
| `test-plan.md` | agent-quality-architect (Mode 1) | ✋ 2.5 |
| `tasks.md` | agent-manager | - |
| `bug-report.md` | agent-quality-architect (Mode 3) | 🔄 Fix loop |

## Start

Launch `agent-product` with user's request.

