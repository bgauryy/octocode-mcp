---
name: octocode-feature
description: AI team that adds features or fixes bugs in existing codebases
argument-hint: "Feature or bug description (e.g., 'Add user profile page')"
arguments:
  - name: request
    description: Feature to add or bug to fix
    required: true
  - name: --resume
    description: Resume from previous session
    required: false
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
**Output:** `<project>/.octocode/codebase-review/*` (tech stack, architecture, patterns)  
**Gate 1:** User approves codebase understanding

### Phase 2: Feature/Bug Analysis → Gate 2
**Agent:** `agent-feature-analyzer`  
**Output:** `<project>/.octocode/analysis/*` (understanding, impact, risks, plan)  
**Gate 2:** User approves implementation plan  
**Note:** Plan does NOT include test writing

### Phase 3: Research (Parallel)
**Agent:** `agent-research-context` (EXISTING)  
**Input:** Analysis + Codebase patterns  
**Output:** `<project>/.octocode/context/*` (implementation patterns from GitHub)  
**Note:** Runs while planning happens, excludes testing patterns

### Phase 4: Planning
**Agent:** `agent-manager` (EXISTING)  
**Input:** Analysis + Context  
**Output:** Execution plan with smart task distribution

### Phase 5: Implementation → Gate 3
**Agents:** Multiple `agent-implementation` instances (EXISTING)  
**Managed by:** `agent-manager` (smart task distribution, progress tracking)  
**Gate 3:** Live dashboard with pause/continue/inspect controls

### Phase 6: Verification → Final Review
**Agent:** `agent-verification` (EXISTING)  
**Tests:** Build, linting, feature validation, regression checks, runtime behavior  
**Output:** `<project>/.octocode/verification-report.md`  
**Final:** User approves for commit or requests fixes  
**Note:** Existing tests verified if present, but no new tests expected

## State Management

**Checkpoints:** `<project>/.octocode/execution-state.json` (updated after each phase)  
**Logs:** `<project>/.octocode/logs/*` and `<project>/.octocode/debug/*`  
**Resume:** `--resume` flag loads from execution-state.json

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
2. Create `<project>/.octocode/context/testing-patterns.md`
3. Generate test tasks
4. Implement tests (unit + integration)
5. Re-verify with full test coverage

## Start

Launch `agent-code-review` to analyze the existing codebase.

