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

## 📚 Resources Available

**Curated resources** at https://github.com/bgauryy/octocode-mcp/tree/main/resources:
- 610+ curated Node.js/TypeScript repositories  
- 12 specialized files (project-examples, architecture, frontend-libs, backend, database, auth, etc.)
- **Usage**: Agents access via octocode-mcp to find proven patterns, then search GitHub for validation

## Request

$ARGUMENTS

## Important: Documentation Location

**ALL `.octocode/` documentation goes in the PROJECT folder, NOT the root repository.**

Work with the current project's `.octocode/` directory.

## Testing Approach

**Implementation-first, tests later:**
1. Phases 1-6 focus on implementation and functionality
2. Tests are NOT written during initial implementation
3. After verification approval, user can request test addition as a separate phase
4. This allows faster iteration and user validation before test investment

## 6-Phase Workflow

```
Phase 1: Code Review      → Gate 1 ✋ (Review Approval)
Phase 2: Analysis         → Gate 2 ✋ (Implementation Plan Approval)
Phase 3: Research         (Runs in parallel with Phase 4)
Phase 4: Planning         
Phase 5: Implementation   → Gate 3 🔄 (Live Monitor)
Phase 6: Verification     → Final Review
```

### Phase 1: Code Review → Gate 1
**Agent:** `agent-code-review`  
**Output:** `<project>/.octocode/codebase-review.md`  
**Gate 1:** User approves codebase understanding

### Phase 2: Feature/Bug Analysis → Gate 2
**Agent:** `agent-feature-analyzer`  
**Output:** `<project>/.octocode/analysis.md`  
**Gate 2:** User approves implementation plan  
**Note:** Plan does NOT include test writing

### Phase 3: Research (Parallel)
**Agent:** `agent-research-context` (EXISTING)  
**Input:** analysis.md + codebase-review.md  
**Output:** `<project>/.octocode/patterns.md`  
**Note:** Runs while planning happens, excludes testing patterns

### Phase 4: Planning
**Agent:** `agent-manager` (EXISTING)  
**Input:** analysis.md + patterns.md  
**Output:** `<project>/.octocode/tasks.md` with execution plan

### Phase 5: Implementation → Gate 3
**Agents:** Multiple `agent-implementation` instances (EXISTING)  
**Managed by:** `agent-manager` (smart task distribution, progress in tasks.md)  
**Gate 3:** Live dashboard with pause/continue/inspect controls

### Phase 6: Verification → Final Review
**Agent:** `agent-verification` (EXISTING)  
**Tests:** Build, linting, feature validation, regression checks, runtime behavior  
**Output:** `<project>/.octocode/verification.md`  
**Final:** User approves for commit or requests fixes  
**Note:** Existing tests verified if present, but no new tests expected

## Documentation Structure

**All docs in** `<project>/.octocode/`:
- `codebase-review.md` - Existing code analysis
- `analysis.md` - Feature/bug analysis
- `tasks.md` - Task breakdown with progress
- `patterns.md` - Implementation patterns
- `verification.md` - Quality report

**Total: 5 files** (vs 20+ in previous approach)

## Success Criteria

### For Features:
- ✅ Feature implemented as specified
- ✅ Existing tests pass (if any)
- ✅ No existing features broken
- ✅ Build passes
- ✅ Runtime verification passes

### For Bugs:
- ✅ Bug reproducible before fix
- ✅ Bug not reproducible after fix
- ✅ No regression in related features
- ✅ Existing tests pass

## Post-Approval: Adding Tests

After verification approval, user can request test addition:
1. Research testing patterns for the codebase
2. Add "Testing Patterns" section to verification.md
3. Generate test tasks (append to tasks.md)
4. Implement tests (unit + integration)
5. Re-verify with full test coverage

## Start

Launch `agent-code-review` to analyze the existing codebase.

