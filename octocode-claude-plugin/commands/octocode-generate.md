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

## 📚 Resources Available

**Curated resources** at https://github.com/bgauryy/octocode-mcp/tree/main/resources:
- 610+ curated Node.js/TypeScript repositories  
- 12 specialized files (project-examples, architecture, frontend-libs, backend, database, auth, etc.)
- **Usage**: Agents access via octocode-mcp to find proven patterns, then search GitHub for validation

## Request

$ARGUMENTS

## Important: Documentation Location

**ALL documentation MUST be created in `<project>/docs/` folder.**

Example: If generating project "my-app", all docs go in `my-app/docs/`, NOT in root repository or `.octocode/`.

**Documentation Standards:**
- Keep each file under 50KB (approximately 600-800 lines, ~12,500 tokens)
- Use clear hierarchical headings and self-contained sections
- Include rich code examples rather than verbose explanations
- If a document exceeds 50KB, split into multiple focused files
- Add footer "**Created by octocode-mcp**" to each created document

## Important: Git Operations

**NO GIT COMMANDS:** Agents only modify local files. User handles all git operations (commits, pushes, branches, etc.).

## 🚨 MVP-First: NO TESTS During Initial Implementation

**Focus on WORKING CODE FIRST (Build + Types + Lint):**

✅ **What we DO during MVP:**
- ✅ Build passes (`npm run build` - no errors)
- ✅ TypeScript strict mode (strong types, minimal `any`)
- ✅ Lint passes (`npm run lint` - clean code)
- ✅ Features work as designed
- ✅ Code is clean and maintainable

❌ **What we DON'T do during MVP:**
- ❌ NO test files (.test.ts, .spec.ts, __tests__)
- ❌ NO test setup (Jest, Vitest, testing-library, etc.)
- ❌ NO test coverage requirements
- ❌ NO mocking or test utilities
- ❌ NO automated testing of any kind

**Why MVP-first?**
1. **Faster delivery** - See working product in hours, not days
2. **User validation first** - Validate approach before investing in tests
3. **Flexibility** - User may want changes before writing tests
4. **Better testing** - Test what actually works, not what's being built

**Manual Verification:**
- `test-plan.md` contains manual verification guide (NOT test code)
- User follows guide to verify features manually
- Just instructions for humans, not automated tests

**When tests ARE added** (post-MVP, user-requested):
1. User sees and approves working MVP
2. User explicitly requests automated tests
3. Use test-plan.md as test specification
4. Tests implemented as separate phase

## 4-Phase Workflow

```
Phase 1: Requirements    → ✋ Gate 1 (User Approval Required)
Phase 2: Architecture    → ✋ Gate 2 (User Approval Required)
      ↓ (agent-quality creates test-plan.md with verification flows)
                        → ✋ Gate 2.5 (User Approval Required)
Phase 3: Planning + Task Breakdown
Phase 4: Implementation  → 🔄 Gate 3 (Live Monitor - Final Gate)
```

**Human-in-the-Loop:** 3 approval gates ensure you control every major decision

**After Implementation:** User verifies using test-plan.md (manual verification flows) and runs build/lint checks

### Phase 1: Requirements → Gate 1
**Agent:** `agent-product`  
**Output:** `<project>/docs/requirements.md` (<50KB)  
**Gate 1:** User approves requirements

### Phase 2: Architecture → Gate 2
**Agent:** `agent-architect`
**Output:** `<project>/docs/design.md` (<50KB) + `<project>/README.md`
**Then:** Creates initial project structure
**Gate 2:** User approves architecture
**Then:** Triggers `agent-quality` to create verification plan
**Gate 2.5:** User approves verification flows (test-plan.md, <50KB)
**Note:** Architect uses Octocode MCP to research proven architectures during design.

### Phase 3: Planning + Task Breakdown
**Agent:** `agent-manager`
**Input:** design.md + test-plan.md + requirements.md
**Output:** `<project>/docs/tasks.md` (<50KB) - Task breakdown with execution plan

### Phase 4: Implementation → Gate 3 (Final)
**Agents:** Multiple `agent-implementation` instances
**Managed by:** `agent-manager` (smart task distribution, progress in tasks.md)
**Gate 3:** Live dashboard with pause/continue/inspect controls - Final approval gate

**After Implementation Completes:**
- User runs build/lint checks (`npm run build && npm run lint`)
- User follows test-plan.md for manual verification
- User decides when to commit/deploy based on their verification

## Documentation Structure

**Simple & focused** - All docs in `<project>/docs/`:

| File | Owner | Purpose | Size | Human Gate |
|------|-------|---------|------|------------|
| `requirements.md` | agent-product | Product requirements | <50KB | ✋ Gate 1 |
| `design.md` | agent-architect | Architecture & tech stack + patterns | <50KB | ✋ Gate 2 |
| `test-plan.md` | agent-quality | Verification flows (manual testing guide) | <50KB | ✋ Gate 2.5 |
| `tasks.md` | agent-manager | Task breakdown + progress | <50KB | (no gate) |

**4 single files (<50KB each), clear ownership, human approval at key gates**

**All files must include footer:** `**Created by octocode-mcp**`

## Success Criteria

- ✅ Build passes
- ✅ Existing tests pass (if any)
- ✅ All PRD features implemented
- ✅ User verifies using test-plan.md
- ✅ User approves at Gate 3 (Final)

## Post-Implementation: Adding Automated Tests

After Gate 3 approval and manual verification, user can request automated test addition:
1. Research testing patterns
2. Add "Testing Patterns" section to verification.md
3. Generate test tasks (append to tasks.md)
4. Implement tests
5. Re-verify with full test coverage

## Start

Launch `agent-product` with the user's request.

