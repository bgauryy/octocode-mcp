---
name: octocode-generate
description: AI development team that transforms your request into production-ready code
argument-hint: "Your application idea (e.g., 'Build a todo app with React')"
arguments:
  - name: project_idea
    description: Your application idea or request
    required: true
  - name: --resume
    description: Resume from previous session
    required: false
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
**Output:** `.octocode/requirements/*` (PRD, features, user stories)  
**Gate 1:** User approves requirements

### Phase 2: Architecture → Gate 2
**Agent:** `agent-architect`  
**Output:** `.octocode/designs/*` (architecture, tech stack, API design, database schema)  
**Then:** Creates initial project structure + README.md  
**Gate 2:** User approves architecture

### Phase 3: Validation → Gate 3
**Agent:** `agent-design-verification`  
**Input:** Requirements + Architecture  
**Output:** `.octocode/tasks.md` (task breakdown with dependencies)  
**Gate 3:** User approves task plan

### Phase 4: Research (Parallel)
**Agent:** `agent-research-context`  
**Input:** Architecture + Tasks  
**Output:** `.octocode/context/*` (implementation patterns from GitHub)  
**Note:** Runs while planning happens

### Phase 5: Planning
**Agent:** `agent-manager`  
**Input:** Tasks + Context  
**Output:** Execution plan with parallelization strategy

### Phase 6: Implementation → Gate 4
**Agents:** Multiple `agent-implementation` instances  
**Managed by:** `agent-manager` (file locks, progress tracking)  
**Gate 4:** Live dashboard with pause/continue/inspect controls

### Phase 7: Verification → Gate 5
**Agent:** `agent-verification`  
**Tests:** Build, tests, linting, features, performance, security  
**Output:** `.octocode/verification-report.md`  
**Gate 5:** User approves for deployment or requests fixes

## State Management

**Checkpoints:** `.octocode/execution-state.json` (updated after each phase)  
**File Locks:** `.octocode/locks.json` (managed by agent-manager)  
**Logs:** `.octocode/logs/*` and `.octocode/debug/*`  
**Resume:** `--resume` flag loads from execution-state.json

## Success Criteria

- ✅ Build passes  
- ✅ All tests pass  
- ✅ All PRD features implemented  
- ✅ User approves at Gate 5

## Start

Launch `agent-product` with the user's request.

