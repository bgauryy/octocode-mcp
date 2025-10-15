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

**octocode-mcp**: Research + Boilerplates
- **🚀 START HERE:** `https://github.com/bgauryy/octocode-mcp/blob/main/resources/boilerplate_cli.md` - CLI commands for instant setup
- Architecture patterns: `https://github.com/bgauryy/octocode-mcp/tree/main/resources`
- Search GitHub for similar projects (>500★)

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

```
┌─────────────────────────────────────────────────────────────────┐
│ Phase 1: PLANNING                                               │
│ agent-rapid-planner                                             │
│ → Research boilerplates + architecture                          │
│ → Create PROJECT_SPEC.md                                        │
│ → Present to user                                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    ✋ SINGLE GATE (user approval)
                             │
┌────────────────────────────▼────────────────────────────────────┐
│ Phase 2: IMPLEMENTATION                                         │
│ 2-5 × agent-rapid-planner-implementation (parallel)             │
│ → Read PROJECT_SPEC.md tasks                                    │
│ → Execute in parallel (file locks coordination)                 │
│ → Build + Lint + Types during work                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│ Phase 3: QUALITY & CODE REVIEW                                  │
│ agent-rapid-quality-architect                                   │
│ → Build/Lint/Types validation                                   │
│ → Bug scan (8 categories)                                       │
│ → Browser testing (chrome)                                      │
│ → Append QA report to PROJECT_SPEC.md (Section 6) OR mark ✅    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                         ✅ DONE!
```

**Post-Implementation:** User runs `npm run build && npm run lint`, verifies, commits when ready

**Note:** Quick mode uses specialized rapid agents for speed. Standard mode has additional gates and documentation.

## Single Document Structure

**PROJECT_SPEC.md** contains everything:

```markdown
# [Project Name] - Project Specification

## 1. Overview & Requirements
- What we're building (2-3 sentences)
- Must-have features (P0/P1/P2 prioritized)
- Target users & scale (if relevant)

## 2. Architecture & Design

### 🚀 Quick Start Command
```bash
# Initialize project with boilerplate (USE THIS!)
npx create-next-app@latest my-app --typescript --tailwind --app
# OR: npx create-t3-app@latest
# OR: npm create vite@latest -- --template react-ts
```
**Why this boilerplate:** [1-line reason]

### Tech Stack
- Frontend/Backend/Database with 1-line rationale each
- Key libraries with reasons

### System Architecture
- Simple text diagram showing flow
- Key design decisions (why X over Y)
- Database schema (if needed)
- API endpoints (if needed)
- Project structure

## 3. Verification Plan
- Manual testing steps per feature
- Quality gates (build ✅ lint ✅ types ✅)
- NO automated tests (post-MVP)

## 4. Implementation Tasks
- Phase breakdown (setup/core/frontend/polish)
- Task: description, files, complexity (LOW/MED/HIGH)
- Parallelization opportunities marked

## 5. Implementation Progress
- Status tracking (updated by agents)
- Task completion percentages

---
**Created by Octocode**
```

## Phase Details

### Phase 1: Rapid Planning

**agent-rapid-planner** does ALL planning in one pass:

1. **Quick Questions** (2-3 only, if needed)
   - Core functionality unclear?
   - Tech preference (if not specified)?
   - Scale/performance critical?

2. **Research**
   - **🚀 FIRST:** Check `boilerplate_cli.md` for CLI command (10x faster!)
   - Find 2-3 similar projects (>500★)
   - Extract key patterns

3. **Design**
   - Choose boilerplate command
   - Design tech stack with rationale
   - Create architecture diagram
   - Database/API design (if needed)
   - Break into tasks with complexity

4. **Output:** Single `PROJECT_SPEC.md` (~80KB)

**✋ GATE 1 (ONLY GATE):** User reviews complete spec
- **[1] ✅ Approve & Build** → Start implementation immediately
- **[2] 📝 Modify** → What to change? → Update spec → Re-present
- **[3] ❓ Questions** → Answer → Re-present

### Phase 2: Implementation

**ORCHESTRATION: Spawn 2-5 parallel agents using Task tool**

After user approves the spec, **YOU (the orchestrator) must spawn multiple implementation agents in parallel** using a **SINGLE message with multiple Task tool calls**:

```
Example for 3 agents (medium project with 10 tasks):

<Task tool call 1>
  subagent_type: octocode-claude-plugin:agent-implementation
  description: Implementation agent 1
  prompt: You are implementation agent 1 of 3 working on this project.
          Read PROJECT_SPEC.md and follow the workflow in agent-rapid-planner-implementation.md.
          Self-coordinate with other agents via octocode-local-memory to claim and complete tasks.
          Generate your agent ID, then loop: claim task → implement → verify → repeat.
          Exit when all tasks in Section 4 are completed.
</Task>

<Task tool call 2>
  subagent_type: octocode-claude-plugin:agent-implementation
  description: Implementation agent 2
  prompt: You are implementation agent 2 of 3 working on this project...
</Task>

<Task tool call 3>
  subagent_type: octocode-claude-plugin:agent-implementation
  description: Implementation agent 3
  prompt: You are implementation agent 3 of 3 working on this project...
</Task>
```

**IMPORTANT:** All Task calls MUST be in a SINGLE message (true parallel execution).

**How agents work:**
- Each reads PROJECT_SPEC.md section 4 (Implementation Tasks)
- Agents self-coordinate: claim tasks, lock files, update progress
- File locks prevent conflicts (via octocode-local-memory)
- Progress tracked via storage: `task:{taskId}` with status
- Build + Lint + Types validated during work
- Loop until all tasks complete

**Auto-Scaling (how many agents to spawn):**
- Small project (<8 tasks): 2 agents
- Medium project (8-15 tasks): 3-4 agents
- Large project (15+ tasks): 5 agents

**🔄 Live Monitor:** Track progress via storage keys `task:*` and `agent:*`

### Phase 3: Quality & Code Review

**agent-rapid-quality-architect** runs validation + bug scan (Mode 3):

**Step 1: Build Validation**
1. Build check (`npm run build`) - must pass
2. Lint check (`npm run lint`) - must be clean
3. Types check (TypeScript strict) - no errors
4. Feature completeness - all P0 features implemented

**Step 2: Code Review (Bug Prevention)**
Scans for runtime bugs:
1. **Logic Flow** - Edge cases, async patterns, conditional logic
2. **Type Safety** - Input validation, API validation, type guards
3. **Error Handling** - Try-catch blocks, user-friendly errors
4. **Security** - No secrets, input sanitization, auth checks
5. **Performance** - Memory leaks, resource cleanup, efficient queries
6. **Common Bugs** - Array mutations, race conditions, React-specific issues

**Step 3: Browser Verification** (Optional - web apps only)
If dev server available, test critical flows in real browser

**If Issues Found:**
- Appends QA report to PROJECT_SPEC.md (Section 6) with specific fixes needed
- Back to implementation (agent-rapid-planner-implementation)
- Re-validate
- **Max 2 quality loops**

**If All Clean:**
- Appends clean QA report to PROJECT_SPEC.md (Section 6)
- Updates Section 5 status: ✅ Complete & Reviewed
- Ready for user verification!

## Speed Comparison

| Mode | Phases | Gates | Docs | Code Review |
|------|--------|-------|------|-------------|
| **Quick** | 3 | 1 | 1 file (PROJECT_SPEC.md with QA appended) | ✅ Phase 3 (rapid-quality-architect) |
| Standard | 5 | 3 | 5+ files (separate docs) | ✅ Phase 5 (quality-architect) |

**Quick mode is faster!** Both modes include automated code review for bug prevention. Quick mode keeps everything in a single consolidated document.

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

## Agent Instructions Summary

### Phase 1: agent-rapid-planner

**Role:** Create complete PROJECT_SPEC.md in single pass

**Key Actions:**
1. Greet & clarify (2-3 critical questions max)
2. Research boilerplates FIRST (boilerplate_cli.md)
3. Quick architecture research (2-3 similar projects if needed)
4. Create PROJECT_SPEC.md (~80KB, single file)
5. Present for approval (SINGLE GATE)

**See:** `agent-rapid-planner.md` for full workflow details

### Phase 2: agent-rapid-planner-implementation (2-5 parallel instances)

**Role:** Execute implementation tasks in parallel (self-coordinated)

**Key Actions:**
1. Each agent reads PROJECT_SPEC.md section 4 (tasks)
2. Self-assign tasks (first available, claim via storage)
3. Acquire file locks before editing (prevent conflicts)
4. Implement features following design patterns
5. Build + Lint + Types during work
6. Release locks + update status
7. Repeat until all tasks complete

**Coordination:** Self-coordinated via octocode-local-memory (no manager needed!)

**See:** `agent-rapid-planner-implementation.md` for full workflow details

### Phase 3: agent-rapid-quality-architect

**Role:** Validation + bug scan (Mode 3)

**Key Actions:**
1. Run build/lint/types checks
2. Comprehensive bug scan (8 categories)
3. Optional browser verification (web apps)
4. Append QA report to PROJECT_SPEC.md (Section 6)
5. Update Section 5 with ✅ status if clean

**See:** `agent-rapid-quality-architect.md` (Mode 3 section) for full workflow details

## Start

Launch `agent-rapid-planner` with user's request to begin Phase 1.

