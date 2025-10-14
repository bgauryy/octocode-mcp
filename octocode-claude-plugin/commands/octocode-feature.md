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
**Output:** `.octocode/codebase-review/*` (tech stack, architecture, patterns)  
**Gate 1:** User approves codebase understanding

### Phase 2: Feature/Bug Analysis → Gate 2
**Agent:** `agent-feature-analyzer`  
**Output:** `.octocode/analysis/*` (understanding, impact, risks, plan)  
**Gate 2:** User approves implementation plan

### Phase 3: Research (Parallel)
**Agent:** `agent-research-context` (EXISTING)  
**Input:** Analysis + Codebase patterns  
**Output:** `.octocode/context/*` (implementation patterns from GitHub)  
**Note:** Runs while planning happens

### Phase 4: Planning
**Agent:** `agent-manager` (EXISTING)  
**Input:** Analysis + Context  
**Output:** Execution plan with file locks

### Phase 5: Implementation → Gate 3
**Agents:** Multiple `agent-implementation` instances (EXISTING)  
**Managed by:** `agent-manager` (file locks, progress tracking)  
**Gate 3:** Live dashboard with pause/continue/inspect controls

### Phase 6: Verification → Final Review
**Agent:** `agent-verification` (EXISTING)  
**Tests:** Build, tests, feature validation, regression checks  
**Output:** `.octocode/verification-report.md`  
**Final:** User approves for commit or requests fixes

## State Management

**Checkpoints:** `.octocode/execution-state.json` (updated after each phase)  
**File Locks:** `.octocode/locks.json` (managed by agent-manager)  
**Logs:** `.octocode/logs/*` and `.octocode/debug/*`  
**Resume:** `--resume` flag loads from execution-state.json

## Success Criteria

### For Features:
- ✅ Feature implemented as specified
- ✅ Tests added and passing
- ✅ No existing features broken
- ✅ Build passes

### For Bugs:
- ✅ Bug reproducible before fix
- ✅ Bug not reproducible after fix
- ✅ No regression in related features
- ✅ Tests added to prevent recurrence

## Start

Launch `agent-code-review` to analyze the existing codebase.

