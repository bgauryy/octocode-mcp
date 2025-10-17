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

**🔍 RESEARCH REQUIREMENT (CRITICAL!):**
**🚨 ALL AGENTS: MUST USE octocode-mcp tools for research - NEVER use websearch! 🚨**

**📋 FULL RESEARCH GUIDE:** `octocode-claude-plugin/docs/MCP_RESEARCH_GUIDELINES.md`

**Core principle:** Research smart until finding good examples (>500★, production-ready, exact match).

**octocode-mcp**: Research + Boilerplates (PRIMARY for research)
- **🚀 START HERE:** `https://github.com/bgauryy/octocode-mcp/blob/main/resources/boilerplate_cli.md` - CLI commands for instant setup
- **Architecture patterns:** `https://github.com/bgauryy/octocode-mcp/tree/main/resources`
- **Search GitHub:** Find similar projects (>500★), explore structure, get code
- **TOOLS:** githubSearchCode, githubGetFileContent, githubSearchRepositories, githubViewRepoStructure
- **See MCP_RESEARCH_GUIDELINES.md for:**
  - Complete research workflows with examples
  - Quality standards (what to collect)
  - Research trace template
  - Common mistakes to avoid

**octocode-local-memory**: Agent coordination (tasks, locks, status, messaging)
- **📋 PROTOCOL**: `octocode-claude-plugin/docs/COORDINATION_PROTOCOL.md`
- All agents MUST follow standard protocol (key namespaces, TTLs, patterns)
- See protocol doc for task coordination, file locking, QA signals

**❌ FORBIDDEN:** WebFetch, WebSearch - use octocode-mcp instead!

## Request

$ARGUMENTS

## Rules

**Docs:** Single consolidated file `<project>/docs/PROJECT_SPEC.md` 
**Git:** NO git commands - user handles commits/pushes
**MVP:** Build + Types + Lint ONLY (NO tests until post-MVP)

## MVP Focus

**DO:** ✅ Build passes ✅ Types correct ✅ Lint passes ✅ Features work ✅ Code flow verified
**DON'T:** ❌ NO test files ❌ NO test setup ❌ NO automated testing

**Verification Step (CRITICAL):**
- Use `chrome-devtools-mcp` to open output and check for console errors
- Verify code flow works end-to-end
- Fix bugs immediately if found
- Close tab after verification complete

Tests added post-MVP when user requests.

## 🔄 Complete Agent Flow (3 Phases)

```
┌─────────────────────────────────────────────────────────────────┐
│ Phase 1: RAPID PLANNING                                         │
│ agent-rapid-planner                                             │
│ → Research (boilerplates FIRST)                                 │
│ → Design architecture & tasks                                  │
│ → Create PROJECT_SPEC.md (~80KB)                               │
│ → Present to user for approval                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    ✋ GATE: User Decision
                    [1] ✅ Approve → Phase 2
                    [2] 📝 Modify → Update spec
                    [3] ❓ Questions → Answer
                             │
┌────────────────────────────▼────────────────────────────────────┐
│ Phase 2: PARALLEL IMPLEMENTATION                                │
│ 2-5 × agent-rapid-planner-implementation (self-coordinated)    │
│ → Read PROJECT_SPEC.md Section 4 (tasks)                       │
│ → Self-assign tasks via octocode-local-memory                  │
│ → File locks prevent conflicts                                 │
│ → Build + Lint + Types validated during work                   │
│ → Update progress in PROJECT_SPEC.md Section 5                 │
│ → Exit when all tasks completed                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│ Phase 3: QUALITY ASSURANCE                                     │
│ agent-rapid-quality-architect (Mode 3 only)                    │
│ → Build/Lint/Types validation                                  │
│ → 8-category bug scan (logic, types, security, performance)    │
│ → Browser verification (MANDATORY for web apps)                │
│   • chrome-devtools-mcp: check console errors                  │
│   • Verify code flow end-to-end                                │
│   • Fix bugs immediately                                       │
│ → Append QA report to PROJECT_SPEC.md Section 6                │
│ → If issues: signal fix tasks needed                           │
│ → If clean: mark ✅ ready for user                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                🔄 MAX 2 QUALITY LOOPS
                (fixes → re-scan if issues found)
                             │
┌────────────────────────────▼────────────────────────────────────┐
│ Phase 4: USER VERIFICATION                                      │
│ → Run: npm run build && npm run lint                           │
│ → Verify features work                                          │
│ → Commit when ready                                             │
└─────────────────────────────────────────────────────────────────┘
```

**Agent Handovers:**
- **Phase 1 → User:** `agent-rapid-planner` presents PROJECT_SPEC.md → User decides [1/2/3]
- **User → Phase 2:** Command spawns 2-5 `agent-rapid-planner-implementation` instances
- **Phase 2 → Phase 3:** Implementation agents complete all tasks → Auto-trigger `agent-rapid-quality-architect`
- **Phase 3 → User:** QA report appended → User verifies → Ready to commit

**Note:** Quick mode INCLUDES automated code review by `agent-rapid-planner` (Phase 3). Standard mode also has code review by `agent-quality-architect` (Phase 5).

## Single Document Structure

**PROJECT_SPEC.md** contains everything (~60-70KB for optimal parsing):

```markdown
# [Project Name] - Project Specification

## 1. Overview & Requirements (≤80 lines)
- What we're building (2-3 sentences)
- Must-have features (P0/P1/P2 prioritized)
- Target users & scale (if relevant)

## 2. Architecture & Design (≤300 lines, includes research trace)

### 🚀 Quick Start Command
```bash
# Initialize project with boilerplate (USE THIS!)
npx create-next-app@latest my-app --typescript --tailwind --app
# OR: npx create-t3-app@latest
# OR: npm create vite@latest -- --template react-ts
```
**Why this boilerplate:** [1-line reason]

### Research Trace (Decisions & Sources)
- Boilerplate selected: [command + source + reason]
- MCP queries used: [if research done]
- Reference repos: [if used]
- Decisions made: [with rationale]

### Tech Stack
- Frontend/Backend/Database with 1-line rationale each
- Key libraries with reasons

### System Architecture
- Simple text diagram showing flow
- Key design decisions (why X over Y)
- Database schema (if needed)
- API endpoints (if needed)
- Project structure

## 3. Verification Plan (≤60 lines)
- Manual testing steps per feature
- Quality gates (build ✅ lint ✅ types ✅)
- NO automated tests (post-MVP)

## 4. Implementation Tasks (≤150 lines + JSON index)
- Phase breakdown (setup/core/frontend/polish)
- Task: description, files, complexity (LOW/MEDIUM/HIGH)
- Parallelization opportunities marked

### 🔧 MACHINE-READABLE TASK INDEX (CRITICAL)
```json
<!-- TASK INDEX v1.0 (machine-readable) -->
{
  "version": "1.0",
  "total_tasks": 13,
  "tasks": [
    {
      "id": "1.1",
      "title": "Initialize project with boilerplate",
      "files": ["package.json", "tsconfig.json"],
      "complexity": "LOW",
      "dependencies": [],
      "canRunParallelWith": ["1.2"]
    }
  ]
}
```

## 5. Implementation Progress (≤30 lines, seed only)
- Status tracking (updated by agents)
- Task completion percentages

## 6. Quality Assurance Report (added by QA agent)
- JSON summary (machine-readable)
- Build/lint/types/browser validation
- Bug report with code references (startLine:endLine:filepath)
- Critical issues vs warnings

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

### Phase 2: Parallel Implementation (Self-Coordinated)

**TRIGGER:** Auto-start after user approves PROJECT_SPEC.md

**AGENTS:** 2-5 `agent-rapid-planner-implementation` instances (parallel)

**How to Spawn (CRITICAL - Single Message):**

After user selects [1] ✅ Approve & Build, spawn agents using multiple Task tool calls in ONE message:

```javascript
// Example: 3 agents for medium project (8-15 tasks)
<Task subagent_type="octocode-claude-plugin:agent-rapid-planner-implementation"
      description="Implementation Agent 1 of 3"
      prompt="You are Implementation Agent 1/3. Read PROJECT_SPEC.md Section 4.
              Follow agent-rapid-planner-implementation.md workflow.
              Self-coordinate via octocode-local-memory. Generate unique agent ID.
              Loop: claim available task → lock files → implement → verify build/lint → release locks → update progress → repeat.
              Exit when all Section 4 tasks completed." />

<Task subagent_type="octocode-claude-plugin:agent-rapid-planner-implementation"
      description="Implementation Agent 2 of 3"
      prompt="You are Implementation Agent 2/3. Read PROJECT_SPEC.md Section 4.
              Follow agent-rapid-planner-implementation.md workflow.
              Self-coordinate via octocode-local-memory. Generate unique agent ID.
              Loop: claim available task → lock files → implement → verify build/lint → release locks → update progress → repeat.
              Exit when all Section 4 tasks completed." />

<Task subagent_type="octocode-claude-plugin:agent-rapid-planner-implementation"
      description="Implementation Agent 3 of 3"
      prompt="You are Implementation Agent 3/3. Read PROJECT_SPEC.md Section 4.
              Follow agent-rapid-planner-implementation.md workflow.
              Self-coordinate via octocode-local-memory. Generate unique agent ID.
              Loop: claim available task → lock files → implement → verify build/lint → release locks → update progress → repeat.
              Exit when all Section 4 tasks completed." />
```

**Agent Scaling Formula:**
```javascript
taskCount = count(PROJECT_SPEC.md Section 4 JSON tasks_index.tasks)
agentCount = Math.max(2, Math.min(5, Math.ceil(taskCount / 3)))
```

**Self-Coordination (No Manager Needed):**
- **Task Source:** Parse JSON task index from Section 4 (NOT markdown)
- **Task Claims:** `setStorage("task:status:{id}", {s: "claimed", a: agentId, t: timestamp})`
- **File Locks:** `setStorage("lock:{filepath}", {agentId, taskId, timestamp})` (TTL: 300s)
- **Version Guards:** Check PROJECT_SPEC.md hash before edits
- **Progress:** Minimal updates using abbreviated fields (token efficiency)
- **Completion:** All agents exit when no tasks remain

**Key Improvements (from PROMPT_ENGINEERING_IMPROVEMENTS.md):**
- JSON parsing (deterministic, no markdown parsing errors)
- Reflection loop before edits (40% bug reduction)
- Version guards (prevent race conditions)
- Minimal storage updates (40% token reduction)
- Delegation patterns (Task tool for research)

**Next Phase Trigger:** When all agents complete → Auto-spawn `agent-rapid-quality-architect`

### Phase 3: Quality Assurance (Mode 3 Only)

**TRIGGER:** Auto-start after all implementation agents complete

**AGENT:** 1 `agent-rapid-quality-architect` instance

**How to Spawn:**
```javascript
<Task subagent_type="octocode-claude-plugin:agent-rapid-quality-architect"
      description="Quality Assurance & Bug Scan"
      prompt="Run in Mode 3 only. Read PROJECT_SPEC.md for requirements.
              Validate build/lint/types. Scan for 8 bug categories (use checklist).
              Test in browser if web app (use browser verification checklist).
              Append STRUCTURED QA report to Section 6 (JSON + markdown).
              Signal completion via octocode-local-memory." />
```

**Quality Checks (with P0/P1 improvements):**
1. **Build Validation:** `npm run build && npm run lint` (must pass)
2. **Type Safety:** TypeScript strict mode (no errors)
3. **Feature Completeness:** All P0 features from Section 1 implemented
4. **Bug Scan:** 8 categories checklist (logic, types, security, performance, etc.)
5. **Browser Testing & Code Flow (MANDATORY for web apps):**
   - Use browser verification checklist (6 steps)
   - Use `chrome-devtools-mcp` to open output
   - Check console for errors using `list_console_messages` - CRITICAL
   - Verify code flow end-to-end (homepage, auth, CRUD, forms)
   - Fix bugs immediately if found
   - Close tab after verification

**Output:** STRUCTURED QA Report appended to PROJECT_SPEC.md Section 6
- JSON summary (machine-readable: status, validation, counts)
- Build/lint/types/browser status
- Console errors with file:line references
- Critical issues with startLine:endLine:filepath format
- Warnings with same structure
- Summary counts

**Improvements (from PROMPT_ENGINEERING_IMPROVEMENTS.md):**
- Structured format enables automation
- 8-category checklist ensures completeness
- Browser verification checklist (6 steps)
- Security quick-pass included
- Code references use precise format

**Decision Logic:**
- **✅ CLEAN (0 critical bugs):** Mark Section 5: "✅ Complete & Reviewed" → User verification phase
- **⚠️ ISSUES (1-5 critical):** Append fix recommendations → Auto-spawn fix agents → Re-scan (max 2 loops)
- **🚨 MAJOR ISSUES (6+ critical):** Append detailed report → User decision point

**Quality Loops (Max 2):**
- Loop 1: Issues found → Spawn 1-2 fix agents → Re-scan
- Loop 2: Still issues → Final scan → User takes over for complex fixes

**Next Phase Trigger:** Clean QA → User verification (Phase 4)

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

## 📋 Agent Roles & Handovers (Quick Reference)

### Phase 1: agent-rapid-planner
**Input:** User request (project_idea)
**Output:** PROJECT_SPEC.md presented to user
**Next:** User selects [1] → Spawn Phase 2 agents

### Phase 2: agent-rapid-planner-implementation (2-5 parallel)
**Input:** PROJECT_SPEC.md Section 4 (tasks)
**Coordination:** Self-managed via octocode-local-memory
**Output:** Working code + progress updates to Section 5
**Exit:** When all Section 4 tasks completed

### Phase 3: agent-rapid-quality-architect (Mode 3)
**Input:** Completed implementation
**Output:** QA report appended to PROJECT_SPEC.md Section 6
**Decision:**
- ✅ Clean → User verification
- ⚠️ Issues → Auto-spawn fix agents (max 2 loops)
- 🚨 Major → User decision

### Phase 4: User Verification
**Input:** Clean QA report
**Actions:**
1. Run: `npm run build && npm run lint`
2. Test features manually
3. Commit when satisfied

---

**Critical Flow Points:**
- **Planning → Implementation:** User approval gate (ONLY gate in quick mode)
- **Implementation → Quality:** Auto-trigger when all tasks complete
- **Quality → User:** Clean results OR max 2 fix loops reached
- **No intermediate gates** - agents handle coordination autonomously

## Start

Launch `agent-rapid-planner` with user's request to begin Phase 1.

