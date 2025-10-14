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

**ALL `.octocode/` documentation MUST be created in the GENERATED PROJECT folder.**

Example: If generating project "my-app", all docs go in `my-app/.octocode/`, NOT in the root repository.

## Important: Git Operations

**NO GIT COMMANDS:** Agents only modify local files. User handles all git operations (commits, pushes, branches, etc.).

## Testing Approach

**Implementation-first, tests later:**
1. Phases 1-6 focus on implementation and functionality
2. Verification flows (not test code) created in test-plan.md
3. Automated tests are NOT written during initial implementation
4. After Gate 4 approval, user can request automated test addition as a separate phase
5. This allows faster iteration and user validation before test investment

## 6-Phase Waterfall Flow

```
Phase 1: Requirements    → ✋ Gate 1 (User Approval Required)
Phase 2: Architecture    → ✋ Gate 2 (User Approval Required)
      ↓ (agent-quality creates test-plan.md with verification flows)
                        → ✋ Gate 2.5 (User Approval Required)
Phase 3: Research        (Runs in parallel with Phase 4)
Phase 4: Planning + Task Breakdown
Phase 5: Implementation  → 🔄 Gate 3 (Live Monitor - Pause/Continue)
Phase 6: Verification    → ✋ Gate 4 (User Approval Required)
```

**Human-in-the-Loop:** 4 approval gates ensure you control every major decision

### Phase 1: Requirements → Gate 1
**Agent:** `agent-product`  
**Output:** `<project>/.octocode/requirements.md`  
**Gate 1:** User approves requirements

### Phase 2: Architecture → Gate 2
**Agent:** `agent-architect`  
**Output:** `<project>/.octocode/design.md` + `<project>/README.md`  
**Then:** Creates initial project structure  
**Gate 2:** User approves architecture  
**Then:** Triggers `agent-quality` to create verification plan
**Gate 2.5:** User approves verification flows (test-plan.md)

### Phase 3: Research (Parallel with Phase 4)
**Agent:** `agent-research-context`  
**Input:** design.md  
**Output:** `<project>/.octocode/patterns.md`  
**Note:** Runs while planning happens, excludes testing patterns

### Phase 4: Planning + Task Breakdown
**Agent:** `agent-manager`  
**Input:** design.md + patterns.md  
**Output:** `<project>/.octocode/tasks.md` - Task breakdown with execution plan

### Phase 5: Implementation → Gate 3
**Agents:** Multiple `agent-implementation` instances  
**Managed by:** `agent-manager` (smart task distribution, progress in tasks.md)  
**Gate 3:** Live dashboard with pause/continue/inspect controls

### Phase 6: Verification → Gate 4
**Agent:** `agent-verification`  
**Checks:** Build, linting, features, performance, security, runtime behavior  
**Output:** `<project>/.octocode/verification.md`  
**Gate 4:** User approves for deployment or requests fixes  
**Note:** Uses verification flows from test-plan.md, but no automated tests expected

## Documentation Structure

**Simple & focused** - All docs in `<project>/.octocode/`:

| File | Owner | Purpose | Human Gate |
|------|-------|---------|------------|
| `requirements.md` | agent-product | Product requirements | ✋ Gate 1 |
| `design.md` | agent-architect | Architecture & tech stack | ✋ Gate 2 |
| `test-plan.md` | agent-quality | Verification flows (not test code) | ✋ Gate 2.5 |
| `tasks.md` | agent-manager | Task breakdown + progress | (no gate) |
| `patterns.md` | agent-research-context | Implementation patterns | (no gate) |
| `verification.md` | agent-verification | Quality report | ✋ Gate 4 |

**5 single files, clear ownership, human approval at key gates**

## Success Criteria

- ✅ Build passes  
- ✅ Existing tests pass (if any)
- ✅ All PRD features implemented  
- ✅ Runtime verification passes
- ✅ User approves at Gate 4

## Post-Approval: Adding Automated Tests

After Gate 4 approval, user can request automated test addition:
1. Research testing patterns
2. Add "Testing Patterns" section to verification.md
3. Generate test tasks (append to tasks.md)
4. Implement tests
5. Re-verify with full test coverage

## Start

Launch `agent-product` with the user's request.

