---
name: octocode-generate-quick
description: FAST AI development - single agent, one spec, straight to code
argument-hint: "Your application idea (e.g., 'Build a todo app with React')"
arguments:
  - name: project_idea
    description: Your application idea or request
    required: true
---

# Octocode Quick Generate Command

**FAST MODE:** Single planning agent → One approval gate → Implementation → Quality loops

Perfect for MVPs, prototypes, small-to-medium projects when speed matters.

## 📚 MCPs Available

**octocode-mcp**: GitHub research (https://github.com/bgauryy/octocode-mcp/tree/main/resources)
**octocode-local-memory**: Agent coordination (tasks, locks, status, messaging)

## Request

$ARGUMENTS

## Rules

**Docs:** Single consolidated file `<project>/docs/PROJECT_SPEC.md` (~80KB)
**Git:** NO git commands - user handles commits/pushes
**MVP:** Build + Types + Lint ONLY (NO tests until post-MVP)

## MVP Focus

**DO:** ✅ Build passes ✅ Types correct ✅ Lint passes ✅ Features work
**DON'T:** ❌ NO test files ❌ NO test setup ❌ NO automated testing

Tests added post-MVP when user requests.

## Workflow (3 Simple Phases)

**Phase 1: Rapid Planning** → `agent-rapid-planner` → `PROJECT_SPEC.md` → ✋ **SINGLE GATE**
**Phase 2: Implementation** → 4-5 `agent-implementation` (parallel) → 🔄 Live monitor
**Phase 3: Quality Check** → `agent-rapid-planner` → Validation loops → ✅ Done

**Post-Implementation:** User runs `npm run build && npm run lint`, verifies, commits when ready

## Single Document Structure

**PROJECT_SPEC.md** contains everything:

```markdown
# Project Specification

## 1. Overview & Requirements
- What we're building
- Must-have features (prioritized)
- Target users
- Success criteria

## 2. Architecture & Design
- Tech stack with rationale
- System architecture
- Database schema (if needed)
- API design (if needed)
- Project structure

## 3. Verification Plan
- Manual testing steps
- Feature verification checklist
- Quality gates (build, lint, types)

## 4. Implementation Tasks
- Task breakdown by phase
- Complexity estimates
- Logical dependencies
- Parallelization strategy

---
**Created by octocode-mcp**
```

## Phase Details

### Phase 1: Rapid Planning (5-10 min)

**agent-rapid-planner** does ALL planning in one pass:
1. Ask 2-3 critical clarifying questions (brief!)
2. Research similar projects using octocode-mcp
3. Design architecture (backend + frontend if applicable)
4. Create verification approach
5. Break down into tasks
6. **Output:** Single `PROJECT_SPEC.md` file

**✋ GATE 1:** User reviews complete spec
- **Options:** [1] Approve & Build [2] Modify [3] Questions

### Phase 2: Implementation (15-40 min)

**agent-manager** orchestrates 4-5 `agent-implementation` instances:
- Task assignments via octocode-local-memory
- File locks prevent conflicts
- Progress updates inline in PROJECT_SPEC.md
- Parallel execution where possible

**🔄 Live Monitor:** [1] Pause [2] Details [3] Continue

### Phase 3: Quality Loops (5 min)

**agent-rapid-planner** runs validation:
1. Build check (`npm run build`)
2. Lint check (`npm run lint`)
3. Types check (TypeScript strict)
4. Feature completeness check
5. **If issues found:** Create fix tasks → Back to implementation
6. **If clean:** Mark complete ✅

**Max 3 loops** - if still failing, report issues to user

## Speed Comparison

| Mode | Phases | Gates | Docs | Time |
|------|--------|-------|------|------|
| **Quick** | 3 | 1 | 1 file | ~20-50 min |
| Standard | 6 | 4 | 4 files | ~60-120 min |

**Quick mode is 2-3x faster!**

## When to Use Quick Mode

✅ **Use Quick:**
- MVPs and prototypes
- Small-to-medium projects
- Personal projects
- When speed matters
- Learning/experimentation
- Projects with clear requirements

❌ **Use Standard:**
- Complex enterprise projects
- Projects needing extensive documentation
- Multiple stakeholder approvals required
- Uncertain requirements needing discovery

## Start

Launch `agent-rapid-planner` with user's request.

