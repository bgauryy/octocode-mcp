# Octocode Command Flows

This document explains the complete workflows for all three Octocode commands: `/octocode-generate-quick` (fast build), `/octocode-generate` (thorough build), and `/octocode-feature` (enhance existing code).

---

## Overview

Octocode provides **three specialized workflows**:

1. **`/octocode-generate-quick`** ⚡ - Fast build from scratch (3 agents, 1 gate)
2. **`/octocode-generate`** - Thorough build from scratch (5 agents, 3 gates)
3. **`/octocode-feature`** - Add features or fix bugs in existing code (3 agents, 2 gates)

All workflows follow the **MVP-first approach**:
- ✅ Build passes
- ✅ Types correct
- ✅ Lint passes
- ✅ Features work
- ❌ NO tests until post-MVP (user request only)

### Important: Git Operations

**NO GIT COMMANDS:** All agents only modify local files. You (the user) are responsible for all git operations including commits, pushes, branch management, and merges.

---

## Command 1: `/octocode-generate-quick` ⚡ - Fast Build from Scratch

**Purpose:** Quickly transform an idea into production-ready code
**Agents:** 3 specialized agents (agent-rapid-planner, agent-rapid-planner-implementation, agent-rapid-quality-architect)
**Gates:** 1 human approval checkpoint
**Output:** `docs/PROJECT_SPEC.md` (~80KB consolidated doc), working codebase

### Workflow Diagram

```mermaid
flowchart TD
    Start([User Request]) --> P1[Phase 1: Rapid Planning<br/>agent-rapid-planner]
    P1 --> Output1[docs/PROJECT_SPEC.md ~80KB]
    Output1 --> G1{Gate 1: Approve Spec?}
    G1 -->|No - Modify| P1
    G1 -->|Yes - Approved| P2[Phase 2: Implementation<br/>2-5 × agent-rapid-planner-implementation<br/>self-coordinated parallel]
    P2 --> Monitor{🔄 Monitor Progress}
    Monitor -->|Pause| P2
    Monitor -->|Continue| P3[Phase 3: Quality & Code Review<br/>agent-rapid-quality-architect]
    P3 --> BuildCheck[Build/Lint/Types Validation]
    BuildCheck --> CodeReview[Bug Scan & Code Review]
    CodeReview --> Browser[Optional: Browser Testing]
    Browser --> Issues{Issues Found?}
    Issues -->|Yes - 1-5 issues<br/>Loop 1-2| P2
    Issues -->|6+ issues| UserDecision{User Decision}
    UserDecision -->|Fix| P2
    UserDecision -->|Accept| End
    Issues -->|No - Clean| End([✅ Complete & Reviewed])
    End --> Manual[User: npm run build/lint<br/>Manual testing]
    Manual --> Commit[User: git commit when ready]

    style Start fill:#e1f5ff
    style End fill:#d4edda
    style G1 fill:#fff3cd
    style Monitor fill:#e3f2fd
    style Issues fill:#fff3cd
    style UserDecision fill:#fff3cd
```

### Phase 1: Rapid Planning

**Agent:** `agent-rapid-planner` (Rapid Planner)
**Model:** Claude Opus
**Tools:** Read, Write, Edit, Grep, Glob, LS, Bash, BashOutput, TodoWrite, WebFetch, WebSearch, ListMcpResourcesTool, ReadMcpResourceTool

**What Happens:**
1. Asks 2-3 critical questions (if needed)
2. Researches boilerplate commands and 2-3 similar projects using **octocode-mcp**
3. Creates single consolidated PROJECT_SPEC.md with:
   - Overview & Requirements
   - Architecture & Design (with boilerplate CLI command)
   - Verification Plan
   - Implementation Tasks

**Output:** `<project>/docs/PROJECT_SPEC.md` (~80KB)
- Everything in one file for speed
- Includes 🚀 Quick Start Command with CLI boilerplate
- Task breakdown with complexity and parallelization
- Footer: "**Created by octocode-mcp**"

**✋ Gate 1: Specification Review (ONLY GATE)**

User reviews complete spec and can:
- ✅ **Approve & Start Building** → Continue to Implementation
- 📝 **Modify** → Request changes
- ❓ **Questions** → Clarify sections

### Phase 2: Implementation

**Agent:** `agent-rapid-planner-implementation` (Software Engineer)
**Model:** Claude Sonnet
**Tools:** Read, Write, Edit, MultiEdit, Bash, BashOutput, Grep, Glob, LS, TodoWrite, Task, octocode-mcp (GitHub tools), octocode-local-memory (coordination)

**Parallel Execution:** 2-5 agents spawn automatically based on task count (auto-scaling)
- Small project (<8 tasks): 2 agents
- Medium project (8-15 tasks): 3-4 agents
- Large project (15+ tasks): 5 agents

**Self-Coordination via octocode-local-memory:**
- **Task claiming:** Atomic claim-verify pattern prevents race conditions
- **File locking:** MANDATORY locks before any edit (5-min TTL)
- **Progress tracking:** Real-time status updates via storage
- **Getting help:** Task tool spawns Explore agents when blocked
- **Stale recovery:** Auto-reclaim tasks abandoned >10 min

**What Happens:**
1. Each agent reads PROJECT_SPEC.md (sections 1, 2, 4)
2. Agents self-coordinate to claim available tasks
3. Acquire file locks before editing (prevents conflicts)
4. Implement features following design patterns
5. Validate Build + Lint + Types with retry logic (1 retry)
6. Release locks immediately after editing
7. Update task status and loop until all complete

**Quality Standards (Per Task):**
- ✅ Build passes with retry logic
- ✅ Types correct
- ✅ Lint passes
- ✅ File locks released properly
- ✅ Can delegate research via Task tool

**Output:**
- Complete feature implementation
- Updated `docs/PROJECT_SPEC.md` with progress

**🔄 Live Monitoring:** User can pause/continue/inspect

### Phase 3: Quality Check & Code Review

**Agent:** `agent-rapid-quality-architect` (Quality Architect - Mode 3)
**Model:** Claude Opus
**Tools:** Read, Write, Grep, Glob, LS, TodoWrite, Bash, BashOutput, chrome-devtools (browser testing), octocode-local-memory (coordination)

**What Happens:**
1. **Build Validation:**
   - Run `npm run build` - must pass
   - Run `npm run lint` - must pass
   - TypeScript strict mode check
   - Feature completeness check

2. **Code Review (Bug Scan - 8 Categories):**
   - Logic flow analysis (edge cases, async patterns)
   - Type safety & validation
   - Error handling review
   - Security scan (secrets, XSS, SQL injection, auth)
   - Performance & resources (memory leaks, cleanup)
   - React-specific bugs (hooks, state mutations)
   - Common JavaScript/TypeScript pitfalls
   - API integration verification

3. **Browser Verification (Optional - Web Apps Only):**
   - Start dev server if available
   - Test critical user flows in real browser
   - Monitor console errors, network failures
   - Check runtime exceptions

4. **If Issues Found:**
   - Create `docs/bug-report.md` with specific fixes
   - Back to implementation (max 2 loops)

5. **If All Clean:**
   - Update PROJECT_SPEC.md with ✅ Complete & Reviewed status

**Output:** Validated, bug-scanned, production-ready code + optional bug-report.md

### Post-Implementation

**User Actions:**
1. Run `npm run build && npm run lint` - Verify
2. Follow manual testing steps from section 3
3. Test edge cases and scenarios
4. Commit when ready (user controls git)

**Tests added post-MVP only when user requests.**

---

## Command 2: `/octocode-generate` - Thorough Build from Scratch

**Purpose:** Transform an idea into production-ready code
**Agents:** 4 specialized agents
**Gates:** 3 human approval checkpoints
**Output:** `docs/requirements.md`, `docs/design.md`, `docs/test-plan.md`, `docs/tasks.md`, README.md, `docs/bug-report.md`, working codebase

### Workflow Diagram

```mermaid
flowchart TD
    Start([User Request]) --> P1[Phase 1: Requirements<br/>agent-product]
    P1 --> Output1[docs/requirements.md]
    Output1 --> G1{Gate 1: Approve Requirements?}
    G1 -->|No - Modify| P1
    G1 -->|Yes - Approved| P2A[Phase 2 Part 1: Architecture Design<br/>agent-architect]
    P2A --> Output2[docs/design.md]
    Output2 --> G2{Gate 2: Approve Architecture?}
    G2 -->|No - Modify| P2A
    G2 -->|Yes - Approved| P2B[Phase 2 Part 2: Foundation Creation<br/>agent-architect]
    P2B --> Output3[Project scaffold + README]
    Output3 --> P2_5[Phase 2.5: Verification Planning<br/>agent-quality-architect]
    P2_5 --> Output4[docs/test-plan.md]
    Output4 --> G2_5{Gate 2.5: Approve Test Plan?}
    G2_5 -->|No - Adjust| P2_5
    G2_5 -->|Yes - Approved| P3[Phase 3: Task Planning<br/>agent-manager]
    P3 --> Output5[docs/tasks.md]
    Output5 --> P4[Phase 4: Implementation<br/>agent-manager + 2-8 x agent-implementation]
    P4 --> Monitor{🔄 Gate 3: Monitor Progress}
    Monitor -->|Pause| P4
    Monitor -->|Continue| P5[Phase 5: Quality Assurance<br/>agent-quality-architect]
    P5 --> BuildCheck[Build/Lint/Types Validation]
    BuildCheck --> CodeReview[Bug Scan & Code Review]
    CodeReview --> Output6[docs/bug-report.md if issues]
    Output6 --> Issues{Issues Found?}
    Issues -->|Yes - 1-5 issues<br/>Loop 1-2| P4
    Issues -->|6+ issues| UserDecision{User Decision}
    UserDecision -->|Fix| P4
    UserDecision -->|Accept| End
    Issues -->|No - Clean| End([✅ Complete & Reviewed])
    End --> Manual[User: npm run build/lint<br/>Follow test-plan.md]
    Manual --> Commit[User: git commit when ready]

    style Start fill:#e1f5ff
    style End fill:#d4edda
    style G1 fill:#fff3cd
    style G2 fill:#fff3cd
    style G2_5 fill:#fff3cd
    style Monitor fill:#e3f2fd
    style Issues fill:#fff3cd
    style UserDecision fill:#fff3cd
```

### Phase 1: Requirements Gathering

**Agent:** `agent-product` (Product Manager)
**Model:** Claude Opus
**Tools:** Read, Write, Grep, Glob, LS, TodoWrite, WebFetch, WebSearch, ListMcpResourcesTool, ReadMcpResourceTool

**What Happens:**
1. Asks clarifying questions about the project
2. Researches similar projects using **octocode-mcp** (610+ curated repos)
3. Creates comprehensive requirements document

**Output:** `<project>/docs/requirements.md` (<50KB)
- Product overview and value proposition
- Feature list with priorities and acceptance criteria
- User stories (if UX is complex)
- Performance/scale criteria (if critical)
- Footer: "**Created by octocode-mcp**"

**✋ Gate 1: Requirements Review**

User reviews and can:
- ✅ **Approve** → Continue to Architecture
- 📝 **Modify** → Request changes
- ❓ **Questions** → Clarify specific points

---

### Phase 2: Architecture Design + Foundation Creation

**Agent:** `agent-architect` (Solution Architect)
**Model:** Claude Opus
**Tools:** Read, Write, Edit, Bash, BashOutput, Grep, Glob, LS, TodoWrite, WebFetch, WebSearch, ListMcpResourcesTool, ReadMcpResourceTool

**Two-Part Process:**

```mermaid
flowchart TD
    Start([Requirements Approved]) --> Part1[Part 1: Architecture Design]
    Part1 --> Design[Create design.md]
    Design --> G2{Gate 2: Approve Architecture?}
    G2 -->|No - Modify| Part1
    G2 -->|Yes - Approved| Part2[Part 2: Foundation Creation]
    Part2 --> Scaffold[Execute boilerplate CLI]
    Scaffold --> Config[Configure build/lint/TypeScript]
    Config --> Verify[Verify foundation]
    Verify --> Phase25([Proceed to Phase 2.5])

    style Start fill:#e1f5ff
    style G2 fill:#fff3cd
    style Phase25 fill:#d4edda
```

**Part 1: Architecture Design**
1. Studies requirements document
2. **🚀 Prioritizes boilerplate commands:** Checks `https://github.com/bgauryy/octocode-mcp/blob/main/resources/boilerplate_cli.md` FIRST
3. Researches proven architectures using **octocode-mcp** (>1000★ repos)
4. Applies critical thinking framework to design decisions
5. Creates comprehensive design document

**Critical Thinking Questions:**
- What am I optimizing for? (performance/maintainability/cost)
- What are the constraints? (scale/budget/expertise)
- What could go wrong?
- What's the evidence? (proven at scale)

**Output:** `<project>/docs/design.md` (<50KB)
- **Boilerplate command** - CLI command to initialize project (if applicable)
- Tech stack with rationale
- Architecture overview (system flow, components)
- Key decisions with context, options, tradeoffs
- Database schema, API design, auth strategy (as needed)
- Project structure and organization
- Build and lint setup
- Footer: "**Created by octocode-mcp**"

**✋ Gate 2: Architecture Review**

User reviews tech stack and can:
- ✅ **Approve** → Architect continues to create foundation
- 📝 **Modify** → Request changes
- ❓ **Questions** → Clarify decisions

**Part 2: Foundation Creation** (runs AFTER Gate 2 approval)

5. Executes boilerplate CLI command (e.g., `npx create-next-app@latest`)
6. Scaffolds project structure per design.md
7. Configures build system, linting, TypeScript
8. Creates README.md with setup instructions
9. Verifies foundation (`npm install`, `npm run build`, `npm run lint`)

**Output:**
- Complete project scaffold
- README.md in project root
- All dependencies installed
- Build + lint passing

**Proceeds directly to Phase 2.5**

---

### Phase 2.5: Verification Planning

**Agent:** `agent-quality-architect` (Quality Architect - Mode 1)
**Model:** Claude Opus
**Tools:** Read, Write, Grep, Glob, LS, TodoWrite, Bash, BashOutput, WebFetch, WebSearch, ListMcpResourcesTool, ReadMcpResourceTool

**Mode:** Verification Planning (Mode 1 of 3)

**🚨 IMPORTANT: Creates VERIFICATION GUIDES, NOT TEST CODE**

**What Happens:**
1. Studies requirements and design documents
2. Researches testing approaches using **octocode-mcp** (>500★ repos)
3. Creates manual verification plan (NOT test code)

**Output:** `<project>/docs/test-plan.md` (<50KB)
- Verification strategy (what needs verification, manual steps)
- Feature verification flows (step-by-step user flows)
- Component verification mapping (API, DB, UI interactions)
- Test data scenarios (sample data, edge cases)
- Quality checklist (build, lint, performance, security)
- Verification guidance (how to verify, what to look for)
- Footer: "**Created by octocode-mcp**"

**This is a MANUAL VERIFICATION GUIDE:**
- ✅ What features to check
- ✅ How to verify each works
- ✅ What scenarios to test
- ❌ NOT .test.ts files
- ❌ NOT Jest/Vitest setup

**✋ Gate 2.5: Verification Plan Review**

User reviews and can:
- ✅ **Approve** → Proceed to Task Planning
- 📝 **Adjust Coverage** → Modify plan
- ❓ **Questions** → Clarify approach

---

### Phase 3: Task Planning

**Agent:** `agent-manager` (Engineering Manager)
**Model:** Claude Sonnet
**Tools:** Read, Write, Edit, Grep, Glob, LS, TodoWrite, Bash, BashOutput, Task, KillShell, ListMcpResourcesTool, ReadMcpResourceTool

**What Happens:**
1. Reads design.md and patterns (if exists)
2. Creates comprehensive task breakdown
3. Identifies logical dependencies
4. Plans parallelization strategy

**Output:** `<project>/docs/tasks.md` (<50KB)
- Logical phases (setup, core, integrations, polish)
- Individual tasks with descriptions
- Complexity estimates (low/medium/high)
- Logical dependencies only
- Footer: "**Created by octocode-mcp**"

**No Gate** - Manager proceeds directly to implementation

---

### Phase 4: Implementation

**Agents:** 2-8 instances of `agent-implementation` (Software Engineers, dynamically scaled)
**Managed by:** `agent-manager`
**Model:** Claude Sonnet
**Tools:** Read, Write, Edit, MultiEdit, Bash, BashOutput, Grep, Glob, LS, TodoWrite, ListMcpResourcesTool, ReadMcpResourceTool

**Dynamic Scaling:** Manager analyzes task complexity and spawns optimal agent count (2-8)

**Coordination via octocode-local-memory:**
- Task assignments: `setStorage("task:{id}", taskData, ttl: 3600)`
- Status updates: `setStorage("status:agent-{id}:{taskId}", statusData, ttl: 3600)`
- File locks: `setStorage("lock:{filepath}", lockData, ttl: 300)` → `deleteStorage("lock:{filepath}")`
- Inter-agent messages: `setStorage("question:impl-{id}:{target}:{topic}", questionData, ttl: 1800)`

**Implementation Workflow:**
```mermaid
sequenceDiagram
    participant Manager as agent-manager
    participant Impl1 as agent-implementation-1
    participant Impl2 as agent-implementation-2
    participant Storage as octocode-local-memory

    Manager->>Storage: setStorage("task:1", taskData)
    Manager->>Storage: setStorage("task:2", taskData)

    Impl1->>Storage: getStorage("task:1")
    Impl2->>Storage: getStorage("task:2")

    Impl1->>Storage: setStorage("lock:src/auth.ts", lockData)
    Impl1->>Impl1: Write code
    Impl1->>Storage: deleteStorage("lock:src/auth.ts")

    Impl1->>Storage: setStorage("status:agent-1:task-1", {status: "completed"})

    Manager->>Storage: getStorage("status:agent-1:task-1")
    Manager->>Manager: Update tasks.md
    Manager->>Storage: setStorage("task:3", nextTaskData)
```

**Quality Standards (Per Task):**
- ✅ Follow design patterns from docs
- ✅ TypeScript strict mode, minimize `any`
- ✅ Validate inputs (Zod, etc.)
- ✅ Handle errors gracefully
- ✅ Build passes
- ✅ Lint passes
- ❌ NO console.log (use proper logging)
- ❌ NO hardcoded values (use env vars)
- ❌ NO TESTS yet

**Output:**
- Complete feature implementation
- Updated `docs/tasks.md` with progress

**🔄 Gate 3: Live Implementation Monitoring**

User can monitor in real-time:
- ⏸️ **Pause** - Stop all agents, save state
- 📊 **Details** - View task status
- 🔍 **Inspect** - View agent's work
- ⚠️ **Issues** - Review errors
- 🔄 **Continue** - Keep monitoring

---

### Phase 5: Quality Assurance

**Agent:** `agent-quality-architect` (Quality Architect - Mode 3)
**Model:** Claude Opus
**Tools:** Read, Write, Grep, Glob, LS, TodoWrite, Bash, BashOutput, WebFetch, WebSearch, ListMcpResourcesTool, ReadMcpResourceTool

**Mode:** Bug Scanning (Mode 3 of 3)

**What Happens:**

**Step 1: Build Validation**
1. Run `npm run build` (or equivalent) - must pass
2. Run `npm run lint` (or equivalent) - must be clean
3. Check TypeScript compilation - no type errors
4. Verify feature completeness against requirements/design docs

**Step 2: Code Review for Runtime Bugs**

Scan all newly implemented code for common bug patterns:

1. **Logic Flow Issues** - Edge cases, conditionals, loops, async/await, state updates
2. **Type Safety Issues** - Input validation, API response validation, type guards
3. **Error Handling** - Try-catch blocks, user-friendly errors, no silent failures
4. **Security Issues** - No hardcoded secrets, input sanitization, auth checks
5. **Performance & Memory** - Event listeners cleanup, resource cleanup, efficient queries
6. **Common Pitfalls** - Array mutations, race conditions, state issues

**Output:** `<project>/docs/bug-report.md` (~20KB)

**Decision Tree:**

- **If Build/Lint/Types Fail:** Create bug report → Manager spawns fix tasks
- **If 1-5 Critical Issues:** Create bug report → Manager spawns fix tasks → Re-scan (max 2 loops)
- **If 6+ Critical Issues:** Create bug report → User decision point
- **If Clean (0 critical):** Update docs with ✅ Quality Reviewed status → Done!

**Communication with Manager:**
```bash
setStorage("qa:status", "complete", ttl: 3600)
setStorage("qa:result", "{critical: N, warnings: N, status: 'clean'|'issues'}", ttl: 3600)
```

**Key Principles:**
- Focus on runtime bugs (what breaks in production)
- Provide specific file:line references
- Suggest concrete fixes
- Keep scan time under 5 minutes

---

### Post-Implementation

**User Actions:**
1. Run `npm run build` - Verify build passes
2. Run `npm run lint` - Verify lint passes
3. Follow `docs/test-plan.md` - Manual verification
4. Commit changes when ready (user controls git)

**Tests added post-MVP only when user requests.**

---

## Command 3: `/octocode-feature` - Enhance Existing Code

**Purpose:** Add features or fix bugs in existing codebases
**Agents:** 3 specialized agents
**Gates:** 2 human approval checkpoints
**Output:** `docs/codebase-review.md`, `docs/analysis.md`, `docs/tasks.md`, modified codebase

### Workflow Diagram

```mermaid
flowchart TD
    Start([User Request:<br/>Feature or Bug Fix]) --> P1[Phase 1: Codebase Analysis<br/>agent-quality-architect]
    P1 --> Output1[docs/codebase-review.md]
    Output1 --> P2[Phase 2: Feature Analysis<br/>agent-feature-analyzer]
    P2 --> Output2[docs/analysis.md]
    Output2 --> G2{Gate 2: Approve Analysis?}
    G2 -->|No - Adjust| P2
    G2 -->|Yes - Implement| P3[Phase 3: Task Planning<br/>agent-manager]
    P3 --> Output3[docs/tasks.md]
    Output3 --> P4[Phase 4: Implementation<br/>agent-manager + 2-8 x agent-implementation]
    P4 --> Monitor{🔄 Gate 3: Monitor Progress}
    Monitor -->|Pause| P4
    Monitor -->|Continue| P5[Phase 5: Quality Assurance<br/>agent-quality-architect]
    P5 --> BuildCheck[Build/Lint/Types Validation]
    BuildCheck --> CodeReview[Bug Scan & Code Review]
    CodeReview --> Output4[docs/bug-report.md if issues]
    Output4 --> Issues{Issues Found?}
    Issues -->|Yes - 1-5 issues<br/>Loop 1-2| P4
    Issues -->|6+ issues| UserDecision{User Decision}
    UserDecision -->|Fix| P4
    UserDecision -->|Accept| End
    Issues -->|No - Clean| End([✅ Complete & Reviewed])
    End --> Manual[User: npm run build/lint<br/>Run existing tests]
    Manual --> Commit[User: git commit when ready]

    style Start fill:#e1f5ff
    style End fill:#d4edda
    style G2 fill:#fff3cd
    style Monitor fill:#e3f2fd
    style Issues fill:#fff3cd
    style UserDecision fill:#fff3cd
```

### Phase 1: Codebase Analysis

**Agent:** `agent-quality-architect` (Quality Architect - Mode 2)
**Model:** Claude Opus
**Tools:** Read, Write, Grep, Glob, LS, TodoWrite, Bash, BashOutput, WebFetch, WebSearch, ListMcpResourcesTool, ReadMcpResourceTool

**Mode:** Codebase Analysis (Mode 2 of 3)

**What Happens:**
1. Analyzes package files and configs
2. Studies code to identify patterns and conventions
3. Assesses quality (linting, TypeScript, build)
4. Creates comprehensive review document

**Output:** `<project>/docs/codebase-review.md` (<50KB)
- Summary: project type, framework, quality score (1-10)
- Full tech stack with versions
- Code patterns with examples
- Build and lint setup
- Project structure and organization
- Recommendations for new code
- Footer: "**Created by octocode-mcp**"

**No Gate 1** - Proceeds directly to Feature Analysis

---

### Phase 2: Feature Analysis

**Agent:** `agent-feature-analyzer` (Feature Analyst)
**Model:** Claude Opus
**Tools:** Read, Write, Grep, Glob, LS, TodoWrite, WebFetch, WebSearch, ListMcpResourcesTool, ReadMcpResourceTool

**What Happens:**
1. Reads codebase-review.md and user request
2. Applies critical thinking framework
3. Researches implementation patterns using **octocode-mcp** (>500★ repos)
4. Analyzes impact and creates implementation plan

**Critical Thinking Questions:**
- What's the simplest solution?
- What could go wrong?
- What am I assuming?
- Is there production evidence?

**Red Flags:** No similar implementations, HIGH complexity + LOW confidence, >10 files
**Green Flags:** Similar feature exists, pattern proven (>500★), low risk

**Output:** `<project>/docs/analysis.md` (<50KB)
- Clear understanding and acceptance criteria
- Impact assessment (files, DB, API, UI)
- Risks with mitigation
- Solution options with recommendation
- High-level task breakdown
- Build and lint considerations
- Footer: "**Created by octocode-mcp**"

**✋ Gate 2: Analysis Complete**

User reviews and can:
- ✅ **Implement** → Continue to Planning
- 📝 **Adjust** → Modify approach
- 🔍 **Review** → Deep dive into analysis

---

### Phase 3: Task Planning

**Agent:** `agent-manager` (Engineering Manager)
**Model:** Claude Sonnet
**Tools:** Read, Write, Edit, Grep, Glob, LS, TodoWrite, Bash, BashOutput, Task, KillShell, ListMcpResourcesTool, ReadMcpResourceTool

**What Happens:**
1. Reads design.md, patterns.md (if exists), and analysis.md
2. Creates task breakdown
3. Identifies dependencies
4. Plans parallelization

**Output:** `<project>/docs/tasks.md` (<50KB)
- Logical phases
- Individual tasks with descriptions
- Complexity estimates
- Logical dependencies
- Footer: "**Created by octocode-mcp**"

**No Gate** - Manager proceeds directly to implementation

---

### Phase 4: Implementation

**Same as `/octocode-generate` Phase 4:**

- 2-8 `agent-implementation` instances work in parallel (dynamically scaled)
- Coordinate via **octocode-local-memory** (task assignments, file locks, status updates)
- Follow existing code patterns from codebase-review.md
- Update tasks.md with progress

**Quality Standards:**
- ✅ Build passes
- ✅ Types correct
- ✅ Lint passes
- ✅ Existing tests pass (if any)
- ✅ Feature/fix works
- ❌ NO new test files (until post-MVP)

**🔄 Gate 3: Live Implementation Monitoring**

User can monitor in real-time:
- ⏸️ **Pause** - Stop all agents
- 📊 **Details** - View status
- 🔍 **Inspect** - View work
- ⚠️ **Issues** - Review errors
- 🔄 **Continue** - Keep monitoring

---

### Phase 5: Quality Assurance

**Agent:** `agent-quality-architect` (Quality Architect - Mode 3)
**Model:** Claude Opus
**Tools:** Read, Write, Grep, Glob, LS, TodoWrite, Bash, BashOutput, WebFetch, WebSearch, ListMcpResourcesTool, ReadMcpResourceTool

**Mode:** Bug Scanning (Mode 3 of 3)

**What Happens:**
Same as Phase 5 in `/octocode-generate` (see above) - scans modified code for runtime bugs, validates build/lint/types, creates bug report if issues found.

**Output:** `<project>/docs/bug-report.md`

**Decision Tree:**
- **If Issues Found (1-5):** Manager spawns fix tasks → Re-scan (max 2 loops)
- **If Issues Found (6+):** User decision point
- **If Clean:** Update docs with ✅ Quality Reviewed status → Done!

---

### Post-Implementation

**User Actions:**
1. Run `npm run build` - Verify build passes
2. Run `npm run lint` - Verify lint passes
3. Run existing tests (if any) - Ensure no regressions
4. Verify changes manually
5. Commit when ready (user controls git)

**New tests added only when user requests.**

---

## Agent Communication (All Commands)

Agents communicate using **octocode-local-memory MCP** (storage-based, NOT files):

```mermaid
flowchart LR
    Manager[agent-manager] -->|setStorage task:id| Storage[(octocode-local-memory)]
    Storage -->|getStorage task:id| Impl1[agent-implementation-1]
    Storage -->|getStorage task:id| Impl2[agent-implementation-2]

    Impl1 -->|setStorage lock:file| Storage
    Impl1 -->|deleteStorage lock:file| Storage
    Impl2 -->|setStorage lock:file| Storage
    Impl2 -->|deleteStorage lock:file| Storage

    Impl1 -->|setStorage status:agent-1:task| Storage
    Impl2 -->|setStorage status:agent-2:task| Storage
    Storage -->|getStorage status:*| Manager

    Impl1 -->|setStorage question:impl-1:architect| Storage
    Storage -->|getStorage question:*| Architect[agent-architect]
    Architect -->|setStorage answer:impl-1:architect| Storage
    Storage -->|getStorage answer:*| Impl1

    QA[agent-quality-architect] -->|setStorage qa:status| Storage
    QA -->|setStorage qa:result| Storage
    Storage -->|getStorage qa:*| Manager

    style Storage fill:#ffe6cc
    style Manager fill:#d4edda
    style QA fill:#cce5ff
    style Architect fill:#cce5ff
```

### Task Assignment & Claiming

**Manager-Based (Standard Mode):**
```javascript
// Manager assigns task
setStorage("task:3.1", JSON.stringify({
  taskId: "3.1",
  agentId: "agent-implementation-1",
  description: "Implement user authentication",
  files: ["src/auth/login.ts"],
  complexity: "medium"
}), ttl: 3600);
```

**Self-Coordinated (Quick Mode):**
```javascript
// Agent attempts to claim task (atomic pattern)
setStorage("task:3.1", JSON.stringify({
  status: "claimed",
  agentId: "agent-impl-xyz123",
  claimedAt: Date.now()
}), ttl: 3600);

// Verify claim succeeded (prevent race conditions)
const verify = getStorage("task:3.1");
if (verify.agentId === myAgentId) {
  // Successfully claimed! Proceed with implementation
} else {
  // Another agent claimed it first, try next task
}

// Stale task recovery (>10 min old)
if (Date.now() - taskStatus.claimedAt > 600000) {
  // Reclaim abandoned task
  setStorage("task:3.1", JSON.stringify({
    status: "claimed",
    agentId: myAgentId,
    claimedAt: Date.now(),
    reclaimedFrom: taskStatus.agentId
  }), ttl: 3600);
}
```

### Status Updates (Implementation → Manager)
```javascript
setStorage("status:agent-1:task-3.1", JSON.stringify({
  status: "in_progress",
  progress: 65,
  currentStep: "Writing auth logic"
}), ttl: 3600);
```

### File Locks (Prevent Conflicts)
```javascript
// Before editing (MANDATORY - 5 min TTL)
setStorage("lock:src/auth/login.ts", JSON.stringify({
  lockedBy: "agent-implementation-1",
  taskId: "3.1",
  timestamp: Date.now()
}), ttl: 300);

// Perform edits

// After editing (CRITICAL - release immediately!)
deleteStorage("lock:src/auth/login.ts");
```

**Best Practices:**
- ⚠️ NEVER edit without acquiring lock first
- ⚠️ ALWAYS release locks immediately after editing
- ⚠️ Lock TTL is 300 seconds (5 min) - complete edits quickly
- ✅ Check for existing locks before claiming

### Build/Lint Retry Logic (Quick Mode)
```javascript
// Automatic retry on build/lint failure
let buildSuccess = false;
let retryCount = 0;
const maxRetries = 1;

while (!buildSuccess && retryCount <= maxRetries) {
  try {
    await runBuildAndLint();
    buildSuccess = true;
  } catch (buildError) {
    if (retryCount < maxRetries) {
      // First failure - try to fix immediate issues
      await analyzeBuildError(buildError);
      await fixImmediateIssues(); // e.g., missing imports, type errors
      retryCount++;
    } else {
      // Second failure - mark as blocked
      setStorage(`task:blocked:${taskId}`, JSON.stringify({
        agentId: myAgentId,
        error: buildError,
        files: files,
        needsHelp: true
      }), ttl: 1800);

      // Release locks and return to task loop
      break;
    }
  }
}
```

### Getting Help When Blocked

**Option 1: Task Tool (Preferred for Quick Mode)**
```javascript
// Spawn Explore agent for research
Task({
  subagent_type: "Explore",
  prompt: "Research React hook patterns for authentication"
});
```

**Option 2: Storage-Based Questions**
```javascript
// Implementation asks architect
setStorage("question:impl-1:architect:auth-approach", JSON.stringify({
  question: "Should we use JWT or sessions?",
  context: "Working on task 3.1"
}), ttl: 1800);

// Architect responds
setStorage("answer:impl-1:architect:auth-approach", JSON.stringify({
  answer: "Use JWT tokens",
  reasoning: "Better scalability"
}), ttl: 3600);
```

**Why storage instead of files?**
- **50x faster** (< 1ms vs 10-50ms per operation)
- Built-in concurrency safety
- Automatic TTL-based cleanup
- Simple key-value API

📖 **Full patterns:** [AGENT_COMMUNICATION.md](./AGENT_COMMUNICATION.md)

---

## MCPs Used by Agents

### octocode-mcp: Code Research & Planning
**Purpose:** Finding proven patterns, researching implementations

**Used by:**
- ✅ agent-rapid-planner (quick mode: all research in one pass)
- ✅ agent-rapid-planner-implementation (via Task tool for research when blocked)
- ✅ agent-product (requirements research)
- ✅ agent-architect (architecture research + **boilerplate commands - CHECK FIRST!**)
- ✅ agent-quality-architect (Mode 1: testing patterns, Mode 2: codebase patterns, Mode 3: bug patterns)
- ✅ agent-feature-analyzer (implementation patterns research)
- ⚠️ agent-implementation (only for missing patterns, or via Task tool)

**Usage:**
- Search 100M+ GitHub repositories
- Access curated resources (610+ repos, 12 files)
- Extract proven patterns
- Find similar projects

📚 **Resources:** https://github.com/bgauryy/octocode-mcp/tree/main/resources

### octocode-local-memory: Agent Coordination
**Purpose:** Fast inter-agent communication during parallel implementation

**Used by:**
- ✅ agent-manager (task assignment, progress tracking)
- ✅ agent-rapid-planner-implementation (self-coordination: task claiming, file locks, status updates)
- ✅ agent-implementation (status updates, file locks, questions)

**Operations:**
- Task claiming (atomic claim-verify pattern)
- File locks (< 1ms, 5-min TTL)
- Status updates (< 1ms)
- Inter-agent messages (1-2ms)
- Stale task recovery (>10 min timeout)

**Performance:** 50x faster than file-based coordination

### Task Tool: Dynamic Agent Delegation
**Purpose:** Allow implementation agents to spawn sub-agents for research/help

**Used by:**
- ✅ agent-rapid-planner-implementation (NEW! spawns Explore agents when blocked)
- ✅ agent-implementation (can delegate research tasks)
- ✅ agent-manager (spawns implementation agents)

**Benefits:**
- Prevents agents from blocking on unclear patterns
- Enables parallel research while maintaining implementation flow
- Improves resilience and autonomy

---

## Summary Tables

### `/octocode-generate-quick` Flow ⚡

| Phase | Agent | Output | Gate |
|-------|-------|--------|------|
| 1. Rapid Planning | agent-rapid-planner | `docs/PROJECT_SPEC.md` (~80KB) | ✋ Gate 1 (ONLY) |
| 2. Implementation | 2-5 × agent-rapid-planner-implementation (self-coordinated, parallel) | Code + updated PROJECT_SPEC.md | 🔄 Monitor |
| 3. Quality & Review | agent-rapid-quality-architect | Validation + bug scan + optional browser test | - |

**Result:** 1 consolidated doc (~80KB), working codebase, 1 approval gate, automated code review

**Key Features:**
- ⚡ Auto-scaling: 2-5 parallel agents based on task count
- 🔒 Self-coordinated: Atomic task claiming + mandatory file locks
- 🔄 Retry logic: Automatic build/lint retry (1 attempt)
- 🆘 Task tool: Can spawn Explore agents when blocked
- ♻️ Stale recovery: Auto-reclaim abandoned tasks >10 min

### `/octocode-generate` Flow (Standard)

| Phase | Agent | Output | Gate |
|-------|-------|--------|------|
| 1. Requirements | agent-product | `docs/requirements.md` | ✋ Gate 1 |
| 2. Architecture + Foundation | agent-architect | `docs/design.md` + Scaffold + README | ✋ Gate 2 |
| 2.5. Verification | agent-quality-architect (Mode 1) | `docs/test-plan.md` | ✋ Gate 2.5 |
| 3. Planning | agent-manager | `docs/tasks.md` | - |
| 4. Implementation | 2-8 × agent-implementation (dynamic) | Code + updated tasks.md | 🔄 Gate 3 |
| 5. Quality Assurance | agent-quality-architect (Mode 3) | `docs/bug-report.md` | 🔄 Fix loop |

**Result:** 5 docs (<50KB each), working codebase, 3 approval gates, automated QA

### `/octocode-feature` Flow

| Phase | Agent | Output | Gate |
|-------|-------|--------|------|
| 1. Codebase Analysis | agent-quality-architect (Mode 2) | `docs/codebase-review.md` | ✋ Gate 1 |
| 2. Feature Analysis | agent-feature-analyzer | `docs/analysis.md` | ✋ Gate 2 |
| 3. Planning | agent-manager | `docs/tasks.md` | - |
| 4. Implementation | 2-8 × agent-implementation (dynamic) | Code + updated tasks.md | 🔄 Gate 3 |
| 5. Quality Assurance | agent-quality-architect (Mode 3) | `docs/bug-report.md` | 🔄 Fix loop |

**Result:** 4 docs (<50KB each), modified codebase, 2 approval gates, automated QA

---

## Quality Standards (All Commands)

**MVP-First Approach:**
- ✅ Build passes (`npm run build`)
- ✅ Types correct (TypeScript strict, minimal `any`)
- ✅ Lint passes (`npm run lint`)
- ✅ Features work as designed
- ✅ Existing tests pass (for `/octocode-feature`)
- ❌ NO new test files until post-MVP
- ❌ NO automated testing during MVP

**Post-MVP:**
- User runs build/lint checks
- User follows test-plan.md for manual verification (generate) or tests changes (feature)
- User commits when ready (user controls git)
- Tests added only when user requests

**Documentation:**
- All docs in `<project>/docs/`
- All docs <50KB each
- All docs include footer: "**Created by octocode-mcp**"

---

## Success Metrics

**At completion, you have:**

✅ **Clear documentation** - 3-4 concise files explaining everything
✅ **Working code** - Build + lint + types all pass
✅ **Human approval** - You approved 3-4 times during workflow
✅ **Production-ready** - Manual verification complete
✅ **Version control** - You commit when ready (agents don't touch git)
✅ **Efficient process** - Parallel execution, research-driven decisions
✅ **Quality-focused** - MVP first, tests when you request

---

**Made with ❤️ by Guy Bary**

🏗️ **Octocode** - Transform Claude into a complete AI development team
