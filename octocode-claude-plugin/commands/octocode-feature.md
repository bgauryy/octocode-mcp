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

**ALL documentation goes in `<project>/docs/` folder, NOT `.octocode/` or root repository.**

Work with the current project's `docs/` directory.

**Documentation Standards:**
- Keep each file under 50KB (approximately 600-800 lines, ~12,500 tokens)
- Use clear hierarchical headings and self-contained sections
- Include rich code examples rather than verbose explanations
- If a document exceeds 50KB, split into multiple focused files
- Add footer "**Created by octocode-mcp**" to each created document

## Important: Git Operations

**NO GIT COMMANDS:** Agents only modify local files. User handles all git operations (commits, pushes, branches, etc.).

## Testing Approach

**Implementation-first, tests later:**
1. Phases 1-6 focus on implementation and functionality
2. Verification flows (not test code) guide manual testing
3. Automated tests are NOT written during initial implementation
4. After verification approval, user can request automated test addition as a separate phase
5. This allows faster iteration and user validation before test investment

## 6-Phase Workflow

```
Phase 1: Code Review      → ✋ Gate 1 (User Approval Required)
Phase 2: Analysis         → ✋ Gate 2 (User Approval Required)
Phase 3: Research         (Runs in parallel with Phase 4)
Phase 4: Planning + Task Breakdown
Phase 5: Implementation   → 🔄 Gate 3 (Live Monitor - Pause/Continue)
Phase 6: Verification     → ✋ Gate 4 (Final Review - User Approval Required)
```

**Human-in-the-Loop:** 4 approval gates (Gate 1, Gate 2, Gate 3 live, Gate 4) ensure safe changes

### Phase 1: Code Review → Gate 1
**Agent:** `agent-code-review`  
**Output:** `<project>/docs/codebase-review.md` (<50KB)  
**Gate 1:** User approves codebase understanding

### Phase 2: Feature/Bug Analysis → Gate 2
**Agent:** `agent-feature-analyzer`  
**Output:** `<project>/docs/analysis.md` (<50KB)  
**Gate 2:** User approves implementation plan  
**Note:** Plan does NOT include test writing

### Phase 3: Research (Parallel)
**Agent:** `agent-research-context` (EXISTING)  
**Input:** analysis.md + codebase-review.md  
**Output:** `<project>/docs/patterns.md` (<50KB)  
**Note:** Runs while planning happens, excludes testing patterns

### Phase 4: Planning
**Agent:** `agent-manager` (EXISTING)  
**Input:** analysis.md + patterns.md  
**Output:** `<project>/docs/tasks.md` (<50KB) with execution plan

### Phase 5: Implementation → Gate 3
**Agents:** Multiple `agent-implementation` instances (EXISTING)  
**Managed by:** `agent-manager` (smart task distribution, progress in tasks.md)  
**Gate 3:** Live dashboard with pause/continue/inspect controls

### Phase 6: Verification → Gate 4 (Final Review)
**Agent:** `agent-verification` (EXISTING)  
**Checks:** Build, linting, feature validation, regression checks, runtime behavior  
**Output:** `<project>/docs/verification.md` (<50KB)  
**Gate 4:** User approves for commit or requests fixes  
**Note:** Uses verification flows for manual testing; automated tests only if explicitly requested

## Documentation Structure

**Simple & focused** - All docs in `<project>/docs/`:

| File | Owner | Purpose | Size | Human Gate |
|------|-------|---------|------|------------|
| `codebase-review.md` | agent-code-review | Existing code analysis | <50KB | ✋ Gate 1 |
| `analysis.md` | agent-feature-analyzer | Feature/bug analysis | <50KB | ✋ Gate 2 |
| `tasks.md` | agent-manager | Task breakdown + progress | <50KB | (live) |
| `patterns.md` | agent-research-context | Implementation patterns | <50KB | (no gate) |
| `verification.md` | agent-verification | Quality report | <50KB | ✋ Gate 4 |

**4 single files (<50KB each), clear ownership, human approval at key gates**

**All files must include footer:** `**Created by octocode-mcp**`

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

## Post-Approval: Adding Automated Tests

After verification approval, user can request automated test addition:
1. Research testing patterns for the codebase
2. Add "Testing Patterns" section to verification.md
3. Generate test tasks (append to tasks.md)
4. Implement automated tests (unit + integration)
5. Re-verify with full test coverage

## Start

Launch `agent-code-review` to analyze the existing codebase.

