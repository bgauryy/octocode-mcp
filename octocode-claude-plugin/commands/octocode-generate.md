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

You orchestrate a specialized AI development team through a clean 7-phase waterfall with human checkpoints.

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

## Testing Approach

**Implementation-first, tests later:**
1. Phases 1-7 focus on implementation and functionality
2. Tests are NOT written during initial implementation
3. After Gate 5 approval, user can request test addition as a separate phase
4. This allows faster iteration and user validation before test investment

## 7-Phase Waterfall Flow

```
Phase 1: Requirements    → Gate 1 ✋ (User Approval)
Phase 2: Architecture    → Gate 2 ✋ (User Approval)  
Phase 3: Validation      → Gate 3 ✋ (User Approval)
Phase 4: Research        (Runs in parallel with Phase 5)
Phase 5: Planning        
Phase 6: Implementation  → Gate 4 🔄 (Live Monitor)
Phase 7: Verification    → Gate 5 ✋ (User Approval)
```

### Phase 1: Requirements → Gate 1
**Agent:** `agent-product`  
**Output:** `<project>/.octocode/requirements.md`  
**Gate 1:** User approves requirements

### Phase 2: Architecture → Gate 2
**Agent:** `agent-architect`  
**Output:** `<project>/.octocode/design.md` + `<project>/README.md`  
**Then:** Creates initial project structure  
**Gate 2:** User approves architecture  
**Note:** No testing strategy defined yet

### Phase 3: Validation → Gate 3
**Agent:** `agent-design-verification`  
**Input:** requirements.md + design.md  
**Output:** `<project>/.octocode/tasks.md`  
**Gate 3:** User approves task plan  
**Note:** Tasks do NOT include test writing

### Phase 4: Research (Parallel)
**Agent:** `agent-research-context`  
**Input:** design.md + tasks.md  
**Output:** `<project>/.octocode/patterns.md`  
**Note:** Runs while planning happens, excludes testing patterns

### Phase 5: Planning
**Agent:** `agent-manager`  
**Input:** tasks.md + patterns.md  
**Output:** Execution plan with parallelization strategy

### Phase 6: Implementation → Gate 4
**Agents:** Multiple `agent-implementation` instances  
**Managed by:** `agent-manager` (smart task distribution, progress in tasks.md)  
**Gate 4:** Live dashboard with pause/continue/inspect controls

### Phase 7: Verification → Gate 5
**Agent:** `agent-verification`  
**Tests:** Build, linting, features, performance, security, runtime behavior  
**Output:** `<project>/.octocode/verification.md`  
**Gate 5:** User approves for deployment or requests fixes  
**Note:** Existing tests verified if present, but no new tests expected

## Documentation Structure

**All docs in** `<project>/.octocode/`:
- `requirements.md` - Product requirements
- `design.md` - Architecture & tech stack
- `tasks.md` - Task breakdown with progress
- `patterns.md` - Implementation patterns
- `verification.md` - Quality report

**Total: 5 files** (vs 20+ in previous approach)

## Success Criteria

- ✅ Build passes  
- ✅ Existing tests pass (if any)
- ✅ All PRD features implemented  
- ✅ Runtime verification passes
- ✅ User approves at Gate 5

## Post-Approval: Adding Tests

After Gate 5 approval, user can request test addition:
1. Research testing patterns
2. Add "Testing Patterns" section to verification.md
3. Generate test tasks (append to tasks.md)
4. Implement tests
5. Re-verify with full test coverage

## Start

Launch `agent-product` with the user's request.

