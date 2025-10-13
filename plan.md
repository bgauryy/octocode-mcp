# Octocode-Vibe Plugin Design

## Overview

I want to create a plugin for generating code
https://docs.claude.com/en/docs/claude-code/plugins

It will use octocode-mcp under the hood for context fetching 

## MCP

octocode-mcp 
https://github.com/bgauryy/octocode-mcp

code context research MCP

## Prerequisites

- node >20
- gh cli installed with login (https://cli.github.com/)
    ```
    brew install gh
    gh auth login
    ```

## Command

### `/octocode-vibe`

A complete development command that transforms a user request into production-ready code using a coordinated team of AI agents.

#### Input Format

```bash
/octocode-vibe "<your development request>" [--resume]
```

**Examples:**
```bash
/octocode-vibe "create full-stack application that shows stock prices"
/octocode-vibe "build a REST API for managing tasks with authentication"
/octocode-vibe "create a React dashboard with real-time analytics"
/octocode-vibe --resume  # Resume from last checkpoint after interruption
```

**Flags:**
- `--resume`: Resume execution from the last saved checkpoint (useful after crashes or interruptions)

#### What Happens

The command initiates a **7-phase development lifecycle** with specialized agents working together like a real software team:

```
User Request → Product Discovery → Architecture Design → Design Validation 
→ Context Research → Implementation Orchestration → Parallel Development → QA Verification
```

#### Agent Orchestration Flow

**Phase 1: Requirements Gathering**
- `agent-product` activates
- Asks clarifying questions to the user
- Researches similar projects using octocode-mcp
- Creates comprehensive PRD
- **Output:** `.octocode/requirements/`

**Phase 2: Architecture Design**
- `agent-architect` activates
- Reads requirements from Phase 1
- Uses octocode-mcp to research tech stacks and patterns
- Designs system architecture, tech stack, database schema
- **Can ask:** `agent-product` for clarifications
- **Output:** `.octocode/designs/`

**Phase 3: Design Validation**
- `agent-design-verification` activates
- Validates requirements ↔ design alignment
- Checks technical feasibility
- Creates task breakdown with dependencies
- **If issues found:** Notifies `agent-product` or `agent-architect` for fixes
- **Loop until:** All issues resolved
- **Output:** `.octocode/tasks.md`

**Phase 4: Context Research** (can run in parallel)
- `agent-research-context` activates
- Uses octocode-mcp to research implementation patterns
- Gathers best practices from GitHub repositories
- Can run multiple research queries in parallel
- **Output:** `.octocode/context/` (implementation guides)

**Phase 5: Task Orchestration**
- `agent-manager` activates
- Analyzes task dependencies
- Identifies tasks that can run in parallel
- Spawns multiple `agent-implementation` instances
- Monitors progress and handles failures
- Updates task statuses
- **Output:** Live progress tracking + logs

**Phase 6: Implementation** (parallel execution)
- Multiple `agent-implementation` instances activate
- Each picks up assigned tasks
- Uses context from `agent-research-context`
- Writes code, runs tests, fixes issues
- **Can ask:** 
  - `agent-architect` for technical questions
  - `agent-product` for requirements clarification
  - `octocode-mcp` directly for missing context
- **Managed by:** `agent-manager` (reassigns failed tasks, tracks progress)
- **Output:** Working codebase

**Phase 7: Quality Assurance**
- `agent-verification` activates
- Runs build, linting, tests
- Verifies all features against PRD
- Checks performance criteria
- Scans for critical bugs
- **If critical issues:** Reassigns to `agent-implementation` or `agent-architect`
- **Loop until:** All critical issues resolved
- **Output:** `.octocode/verification-report.md`

#### Agent Communication Patterns

**Question Flow:**
```
agent-implementation: "What should happen if API rate limit is hit?"
  ↓ Routes to agent-product
agent-product: "Use cached data and show warning message"
  ↓ Updates requirements
agent-implementation: Implements the solution
```

**Design Issue Flow:**
```
agent-design-verification: "No error handling for API failures"
  ↓ Notifies agent-architect with specific issue
agent-architect: Adds retry logic and fallback strategies to design
  ↓ Updates design documents
agent-design-verification: Re-validates → ✅ Passes
```

**Failed Task Flow:**
```
agent-implementation-2: Task 3.2 fails (missing Prisma migration)
  ↓ Reports to agent-manager
agent-manager: Analyzes error, reassigns to agent-implementation-4
agent-implementation-4: Fixes and completes Task 3.2
  ↓ Notifies agent-manager
agent-manager: Updates task status → ✅ Completed
```

#### Parallel Execution

The system maximizes efficiency by running independent tasks in parallel:

```
Phase 1 (Foundation):
  agent-implementation-1 → Setup Next.js
  agent-implementation-2 → Configure TypeScript
  agent-implementation-3 → Setup TailwindCSS
  agent-implementation-4 → Configure Database
  agent-implementation-5 → Setup Redis
  [All run simultaneously - significantly faster than sequential]

Phase 3 (Backend Features):
  agent-implementation-1 → Stock service
  agent-implementation-2 → Portfolio service
  agent-implementation-3 → Alert service
  [All run simultaneously - significantly faster than sequential]
```

#### Context Sharing

All agents share a common workspace:

```
.octocode/
  requirements/          # Product Manager's output
  designs/              # Architect's output
  context/              # Research Specialist's output
  tasks.md              # Task breakdown with statuses
  summary/              # Final project summary
  logs/                 # Execution logs
```

Every agent can read from previous phases but only writes to their designated output location.

#### Human Interaction Points

The system includes **4 explicit approval gates** where you maintain control:

1. **Gate 1 - After Requirements (Phase 1):** Approve PRD
2. **Gate 2 - After Architecture (Phase 2):** Approve technical design
3. **Gate 3 - After Design Verification (Phase 3):** Approve task breakdown
4. **Gate 4 - After Implementation (Phase 6):** Live monitoring with pause/resume
5. **Gate 5 - After Verification (Phase 7):** Approve final deliverable

See "Human-in-the-Loop Controls" section below for detailed interaction options.

#### Example Complete Run

```
User: /octocode-vibe "create stock prices app"

[Phase 1: Requirements]
agent-product: "Should we support real-time updates?"
User: "Yes, but 15-min delay is fine for MVP"
agent-product: ✅ PRD created

[Phase 2: Architecture]
agent-architect: ✅ Architecture designed (Next.js + tRPC + PostgreSQL)

[Phase 3: Validation]
agent-design-verification: ⚠️ "No caching strategy for API"
agent-architect: ✅ Added Redis caching
agent-design-verification: ✅ Design approved, tasks created (35 tasks)

[Phase 4: Research]
agent-research-context: ✅ Context gathered (7 implementation guides)

[Phase 5: Orchestration]
agent-manager: ✅ Task distribution planned

[Phase 6: Implementation]
agent-manager: Spawned 4 agent-implementation instances
Progress: [████████████████████████████] 100% (35/35 tasks)
- 1 task retry (Prisma migration issue, resolved)

[Phase 7: Verification]
agent-verification: ⚠️ Found 2 critical bugs
agent-implementation: ✅ Fixed security issue
agent-implementation: ✅ Fixed cascade delete
agent-verification: ✅ All tests passing

✅ PROJECT COMPLETE
- Lines of code: ~2,500
- Test coverage: 87%
- All features working
```

#### Success Criteria

Project is complete when:
- ✅ Build passes
- ✅ All tests pass (unit, integration, e2e)
- ✅ Linting passes
- ✅ All PRD features implemented
- ✅ Performance criteria met
- ✅ No critical bugs
- ✅ Code quality standards met

---

## State Persistence & Recovery

To ensure reliability and enable recovery from interruptions, the system implements a comprehensive checkpoint mechanism.

### Checkpoint Strategy

**Checkpoint Triggers:**
1. After each phase completion
2. After every task completion (by agent-manager)
3. Before spawning new agent-implementation instances
4. Every 5 minutes during long-running operations
5. On graceful shutdown

**State File Location:**
```
.octocode/execution-state.json
```

### Execution State Schema

```json
{
  "version": "1.0",
  "timestamp": "2025-10-12T14:30:00Z",
  "sessionId": "uuid-v4",
  "currentPhase": "implementation",
  "phaseStatus": {
    "requirements": "completed",
    "architecture": "completed",
    "design-verification": "completed",
    "research": "completed",
    "orchestration": "in-progress",
    "implementation": "in-progress",
    "verification": "pending"
  },
  "completedPhases": [
    {
      "phase": "requirements",
      "completedAt": "2025-10-12T14:10:00Z",
      "outputs": [".octocode/requirements/"]
    },
    {
      "phase": "architecture",
      "completedAt": "2025-10-12T14:15:00Z",
      "outputs": [".octocode/designs/"]
    }
  ],
  "tasks": {
    "total": 35,
    "completed": 12,
    "inProgress": 4,
    "pending": 19,
    "failed": 0
  },
  "activeAgents": [
    {
      "agentId": "agent-implementation-1",
      "taskId": "3.1",
      "startedAt": "2025-10-12T14:25:00Z",
      "status": "in-progress"
    },
    {
      "agentId": "agent-implementation-2",
      "taskId": "3.2",
      "startedAt": "2025-10-12T14:25:00Z",
      "status": "in-progress"
    }
  ],
  "completedTasks": [
    {
      "taskId": "1.1",
      "description": "Setup Next.js project",
      "assignedTo": "agent-implementation-1",
      "completedAt": "2025-10-12T14:20:00Z",
      "filesModified": ["package.json", "next.config.js"]
    }
  ],
  "failedTasks": [
    {
      "taskId": "2.3",
      "description": "Configure Prisma migrations",
      "assignedTo": "agent-implementation-3",
      "failedAt": "2025-10-12T14:22:00Z",
      "error": "Missing DATABASE_URL",
      "retries": 1,
      "status": "reassigned"
    }
  ],
  "pendingTasks": ["4.1", "4.2", "5.1"],
  "taskDependencies": {
    "4.1": ["3.1", "3.2"],
    "5.1": ["4.1", "4.2"]
  },
  "userInputs": {
    "clarificationAnswers": [
      {
        "question": "Should we support real-time updates?",
        "answer": "Yes, 15-min delay is fine",
        "timestamp": "2025-10-12T14:05:00Z"
      }
    ]
  },
  "lastCheckpoint": "2025-10-12T14:30:00Z"
}
```

### Recovery Process

When running `/octocode-vibe --resume`:

1. **Load Checkpoint:**
   - Read `.octocode/execution-state.json`
   - Validate checkpoint integrity
   - Display recovery summary to user

2. **Phase Recovery:**
   ```
   ✅ Requirements: Completed
   ✅ Architecture: Completed
   ✅ Design Verification: Completed
   ✅ Research: Completed
   🔄 Implementation: In Progress (12/35 tasks completed)
   ⏸️  Verification: Not Started
   
   Resuming from: Implementation Phase
   Active tasks found: 4
   ```

3. **Task Recovery:**
   - Mark in-progress tasks as `pending` (assume they didn't complete)
   - Verify completed tasks are still valid (files exist, no corruption)
   - Reload task dependencies
   - Resume from the current phase

4. **Agent State Recovery:**
   - agent-manager reads execution state
   - Reassigns in-progress tasks to new agent-implementation instances
   - Respects task dependencies
   - Continues execution

### Transaction Safety

**File Operations:**
- All critical state writes use atomic operations (write to temp → rename)
- State updates include versioning
- Backup previous state before overwriting

**Task Completion:**
```
1. Agent completes task
2. Write task results to disk
3. Update execution-state.json (atomic)
4. Notify agent-manager
5. Only then mark task as completed in .octocode/tasks.md
```

### Failure Scenarios

**Scenario 1: Claude Code Crashes Mid-Task**
```
Before crash: agent-implementation-2 working on Task 3.2
After resume:
  - Task 3.2 marked as pending (not completed)
  - agent-manager spawns new agent-implementation-5
  - Task 3.2 reassigned to agent-implementation-5
```

**Scenario 2: Crash During Phase Transition**
```
State shows: architecture=completed, design-verification=in-progress
After resume:
  - Re-run agent-design-verification from start
  - Previous partial work in .octocode/ preserved
  - Agent can read previous partial outputs
```

**Scenario 3: User Force Quits During Parallel Tasks**
```
State shows: 4 agent-implementation instances active
After resume:
  - All in-progress tasks → pending
  - agent-manager analyzes dependencies
  - Spawns new agents for the 4 tasks
  - Continues execution
```

### Checkpoint Validation

On resume, validate:
- ✅ `.octocode/execution-state.json` exists and is valid JSON
- ✅ Referenced output files exist (e.g., `.octocode/requirements/prd.md`)
- ✅ No file corruption
- ✅ Task dependency graph is valid
- ✅ Version compatibility

If validation fails:
- Display error to user
- Offer to restart from last valid phase
- Preserve corrupted state for debugging

### Progress Persistence

**During Long Operations:**
```
agent-implementation-1: Installing dependencies...
  → Checkpoint: task started
  → Execute: npm install
  → Checkpoint: task completed (atomic update)
```

**During Research:**
```
agent-research-context: Researching 7 topics...
  → Checkpoint: research started
  → Complete topic 1 → Update state
  → Complete topic 2 → Update state
  → [Crash]
  → Resume: Continue from topic 3
```

### State Cleanup

After successful project completion:
- Keep `execution-state.json` as history
- Mark status as `completed`
- Add project summary metadata

---

## Concurrency Control

When multiple agent-implementation instances work in parallel, file-level locking prevents conflicts and ensures consistency.

### The Problem

**Without Locking:**
```
Time T1: agent-implementation-1 reads auth.ts (adds login function)
Time T2: agent-implementation-2 reads auth.ts (adds logout function)
Time T3: agent-implementation-1 writes auth.ts (only has login)
Time T4: agent-implementation-2 writes auth.ts (only has logout, overwrites login!) ❌
```

**Result:** Lost updates, inconsistent codebase.

### Lock Strategy

**File-Level Locking:**
- Each file can only be modified by one agent at a time
- Locks are acquired before any write operation
- Locks are released after write completes
- Other agents wait or work on different tasks

**Lock Registry Location:**
```
.octocode/locks.json
```

### Lock Registry Schema

```json
{
  "version": "1.0",
  "locks": {
    "src/auth/auth.ts": {
      "lockedBy": "agent-implementation-1",
      "taskId": "3.1",
      "acquiredAt": "2025-10-12T14:30:00Z",
      "expiresAt": "2025-10-12T14:35:00Z"
    },
    "src/api/api.ts": {
      "lockedBy": "agent-implementation-2",
      "taskId": "3.2",
      "acquiredAt": "2025-10-12T14:30:00Z",
      "expiresAt": "2025-10-12T14:35:00Z"
    }
  },
  "lockHistory": [
    {
      "file": "package.json",
      "lockedBy": "agent-implementation-1",
      "taskId": "1.1",
      "acquiredAt": "2025-10-12T14:20:00Z",
      "releasedAt": "2025-10-12T14:21:00Z",
      "status": "completed"
    }
  ]
}
```

### Lock Lifecycle

**1. Task Assignment (agent-manager):**
```
agent-manager analyzes task:
  - Task 3.1: "Implement user login" → Files: [auth.ts, types.ts]
  - Task 3.2: "Add API endpoints" → Files: [api.ts, routes.ts]
  - Task 3.3: "Add logout" → Files: [auth.ts] ⚠️ Conflicts with 3.1!

Decision:
  - Task 3.1 and 3.2 can run in parallel (no file overlap) ✅
  - Task 3.3 must wait for 3.1 to complete (both need auth.ts)
  - Mark 3.3 as "blocked-by: 3.1"
```

**2. Lock Acquisition (agent-implementation):**
```
agent-implementation-1 starts Task 3.1:
  1. Request locks for [auth.ts, types.ts] from agent-manager
  2. agent-manager checks locks.json:
     - auth.ts: not locked ✅
     - types.ts: not locked ✅
  3. agent-manager acquires locks (atomic write to locks.json)
  4. agent-implementation-1 receives lock grant
  5. Proceed with file modifications
```

**3. Lock Wait & Retry:**
```
agent-implementation-3 starts Task 3.3:
  1. Request lock for [auth.ts]
  2. agent-manager checks locks.json:
     - auth.ts: locked by agent-implementation-1 ❌
  3. agent-manager responds: WAIT
  4. agent-implementation-3 retries every 5 seconds (max 30s)
  5. If timeout: task marked as "blocked", agent picks different task
  6. When lock available: agent-manager notifies waiting agents
```

**4. Lock Release:**
```
agent-implementation-1 completes Task 3.1:
  1. Writes all file changes
  2. Notifies agent-manager: task complete
  3. agent-manager releases locks [auth.ts, types.ts] (atomic update)
  4. agent-manager notifies waiting agents
  5. agent-implementation-3 retries, acquires lock, proceeds
```

### Atomic Lock Operations

**Lock Acquisition (Atomic):**
```
1. Read locks.json
2. Check all requested files are available
3. If available:
   - Create temp file with new locks
   - Atomic rename temp → locks.json ✅
4. If not available:
   - Return WAIT with estimated time
```

**Lock Release (Atomic):**
```
1. Read locks.json
2. Remove locks for completed task
3. Move to lockHistory
4. Atomic rename temp → locks.json ✅
5. Notify waiting agents
```

### Lock Timeout & Recovery

**Stale Lock Detection:**
- Every lock has `expiresAt` (default: 5 minutes from acquisition)
- agent-manager checks for stale locks every 1 minute
- If lock expired and task still in-progress:
  - Check if agent is still alive
  - If agent crashed: Release lock, reassign task
  - If agent active: Extend lock by 5 minutes

**Deadlock Prevention:**
- Locks acquired in deterministic order (alphabetical by file path)
- Example: Task needs [db.ts, auth.ts]
  - Always acquire in order: [auth.ts, db.ts] (alphabetical)
  - Prevents circular wait conditions

### Task Assignment with File Dependencies

**Enhanced Task Format:**
```markdown
## Phase 3: Authentication [parallel-group-auth]

- [ ] Task 3.1: Implement user login
      Files: [src/auth/auth.ts, src/types/user.ts]
      Complexity: medium
      [assigned-to: agent-implementation-1]

- [ ] Task 3.2: Add API endpoints
      Files: [src/api/api.ts, src/api/routes.ts]
      Complexity: medium
      [assigned-to: agent-implementation-2]

- [ ] Task 3.3: Implement logout
      Files: [src/auth/auth.ts]
      Complexity: low
      [blocked-by: 3.1] (shares auth.ts)
      [assigned-to: pending]
```

**agent-manager Assignment Logic:**
```
For each pending task:
  1. Check file dependencies
  2. Check if files are locked
  3. If locked:
     - Mark task as "blocked"
     - Add to wait queue
  4. If available:
     - Assign to available agent
     - Acquire locks
     - Start execution
```

### Parallel Execution Example

**Scenario: 5 tasks, 3 agents**

```
T0: Initial state
├─ Task 1: Update package.json → agent-1 (locks: [package.json])
├─ Task 2: Create auth.ts → agent-2 (locks: [auth.ts])
├─ Task 3: Create api.ts → agent-3 (locks: [api.ts])
├─ Task 4: Update auth.ts → BLOCKED (waits for Task 2)
└─ Task 5: Update package.json → BLOCKED (waits for Task 1)

T1: Task 1 completes
├─ agent-1 releases [package.json]
├─ Task 5 unblocked → agent-1 (locks: [package.json])
├─ agent-2, agent-3 still working...

T2: Task 2 completes
├─ agent-2 releases [auth.ts]
├─ Task 4 unblocked → agent-2 (locks: [auth.ts])
├─ agent-1, agent-3 still working...

T3: All tasks complete ✅
```

### Lock-Free Operations

**These operations don't require locks:**
- Reading files (multiple agents can read simultaneously)
- Creating new files (unique file names per task)
- Running tests (read-only)
- Running linting (read-only)
- Searching codebase (read-only)

**These operations require locks:**
- Modifying existing files
- Deleting files
- Moving/renaming files
- Updating package.json, tsconfig.json, etc. (shared config files)

### Integration with Checkpoints

**Checkpoint Includes Lock State:**
```json
{
  "currentLocks": {
    "src/auth/auth.ts": {
      "lockedBy": "agent-implementation-1",
      "taskId": "3.1"
    }
  }
}
```

**On Resume:**
- All locks are released (agents are no longer active)
- Tasks that were in-progress → marked as pending
- Lock registry reset
- Fresh task assignment based on current state

### Configuration

**Lock Settings (.octocode/config.json):**
```json
{
  "concurrency": {
    "lockTimeout": 300000,        // 5 minutes (ms)
    "lockRetryInterval": 5000,    // 5 seconds (ms)
    "maxLockRetries": 6,          // 30 seconds total wait
    "staleCheckInterval": 60000,  // 1 minute (ms)
    "maxParallelAgents": 5
  }
}
```

---

## Human-in-the-Loop Controls

The system provides explicit approval gates at critical decision points, ensuring you maintain control over the development process.

### Overview of Gates

```
Phase 1: Requirements → [GATE 1: Approve PRD] 
  ↓
Phase 2: Architecture → [GATE 2: Approve Design]
  ↓
Phase 3: Validation → [GATE 3: Approve Tasks]
  ↓
Phase 4: Research (runs automatically)
  ↓
Phase 5: Orchestration (runs automatically)
  ↓
Phase 6: Implementation → [GATE 4: Live Monitoring]
  ↓
Phase 7: Verification → [GATE 5: Approve Deliverable]
```

### Gate 1: PRD Approval (After Phase 1)

**When:** After agent-product completes requirements gathering

**Display:**
```
📋 REQUIREMENTS REVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Requirements gathering complete!

📄 Documents Created:
  • Product Requirements Document (PRD)
  • User stories and flows
  • Feature list (12 must-have, 5 nice-to-have)
  • KPIs and success metrics
  • Performance criteria

🔍 Quick Summary:
  • Target: Stock prices application with real-time updates
  • Users: Retail investors
  • Key Features: Portfolio tracking, price alerts, historical charts
  • Tech Constraints: 15-min data delay, <2s page load
  • MVP Timeline: 2-3 weeks estimated

📂 Full documents: .octocode/requirements/

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your options:
  [1] ✅ Approve - Continue to architecture design
  [2] 📝 Modify - Request changes to requirements
  [3] ❓ Ask Questions - Clarify specific points
  [4] 📖 Review Documents - Read full PRD before deciding

Your choice:
```

**Actions:**
- **Approve:** Proceeds to Phase 2 (Architecture)
- **Modify:** 
  - You specify what needs to change
  - agent-product updates requirements
  - Re-presents Gate 1 for approval
- **Ask Questions:**
  - You ask clarifying questions
  - agent-product answers
  - Returns to Gate 1
- **Review Documents:**
  - System displays PRD sections
  - Returns to Gate 1 for decision

### Gate 2: Architecture Approval (After Phase 2)

**When:** After agent-architect completes technical design

**Display:**
```
🏗️  ARCHITECTURE REVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Technical design complete!

🎯 Tech Stack:
  • Frontend: Next.js 14 (App Router), TailwindCSS, tRPC
  • Backend: Node.js, tRPC server
  • Database: PostgreSQL + Prisma ORM
  • Cache: Redis
  • Auth: NextAuth.js
  • Deployment: Vercel

📊 Database Schema:
  • 5 tables (users, portfolios, holdings, alerts, price_cache)
  • Full schema: .octocode/designs/database-schema.md

🔌 API Design:
  • 12 tRPC procedures
  • REST fallback for webhooks
  • Full spec: .octocode/designs/api-design.md

⚡ Key Decisions:
  • Server-side rendering for SEO
  • Redis caching (5-min TTL) for API responses
  • WebSocket for real-time price updates
  • Rationale: .octocode/designs/tradeoffs.md

📂 Full documents: .octocode/designs/

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your options:
  [1] ✅ Approve - Continue to task breakdown
  [2] 📝 Modify - Request design changes
  [3] ❓ Ask Questions - Clarify technical decisions
  [4] 🔄 Alternative - Request different tech stack
  [5] 📖 Review Documents - Read full architecture docs

Your choice:
```

**Actions:**
- **Approve:** Proceeds to Phase 3 (Design Verification)
- **Modify:** 
  - You specify changes (e.g., "Use MongoDB instead of PostgreSQL")
  - agent-architect updates design
  - Re-presents Gate 2
- **Ask Questions:**
  - agent-architect explains technical decisions
  - Returns to Gate 2
- **Alternative:**
  - agent-architect explores alternative approaches
  - Presents comparison
  - Returns to Gate 2
- **Review Documents:** Displays full design docs

### Gate 3: Task Breakdown Approval (After Phase 3)

**When:** After agent-design-verification creates task breakdown

**Display:**
```
📋 TASK BREAKDOWN REVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Task breakdown complete!

📊 Overview:
  • Total tasks: 35
  • Phases: 6
  • Can run in parallel: 18 tasks
  • Sequential: 17 tasks

⏱️  Estimates:
  • Sequential execution: ~8-12 hours
  • Parallel execution: ~3-5 hours (with 4-5 agents)
  • Complexity: 8 high, 15 medium, 12 low

💰 Estimated Cost:
  • API calls (Claude): ~$15-25 (Sonnet for implementation)
  • GitHub Research: ~$2-5 (octocode-mcp)
  • Total: ~$17-30

📦 Phases:
  Phase 1: Project Setup (5 tasks) - 30min [parallel]
  Phase 2: Database & Auth (8 tasks) - 1.5hr [parallel]
  Phase 3: Backend Services (12 tasks) - 2hr [parallel]
  Phase 4: Frontend Components (6 tasks) - 1hr [parallel]
  Phase 5: Integration & Testing (3 tasks) - 1hr [sequential]
  Phase 6: Deployment Setup (1 task) - 20min

📂 Full breakdown: .octocode/tasks.md

⚠️  Validation Results:
  ✅ All PRD features covered
  ✅ All design components accounted for
  ✅ Dependencies properly mapped
  ✅ No missing critical tasks

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your options:
  [1] ✅ Approve - Start implementation
  [2] 📝 Modify Priorities - Change task order/importance
  [3] ⏱️  Adjust Scope - Add/remove tasks
  [4] 🔍 Review Tasks - See detailed task list
  [5] 💡 Optimize - Ask for more parallelization
  [6] ❓ Ask Questions

Your choice:
```

**Actions:**
- **Approve:** Proceeds to Phase 4 & 5 (Research + Orchestration)
- **Modify Priorities:** 
  - You specify priority changes
  - agent-design-verification adjusts task order
  - Re-presents Gate 3
- **Adjust Scope:**
  - Add/remove specific features
  - agent-design-verification updates tasks
  - May loop back to agent-architect if major changes
- **Review Tasks:** Displays full task breakdown
- **Optimize:** agent-design-verification analyzes for more parallelization
- **Ask Questions:** Clarify task details

### Gate 4: Live Implementation Monitoring (During Phase 6)

**When:** Throughout implementation phase

**Display:**
```
⚡ IMPLEMENTATION IN PROGRESS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Progress: [████████████░░░░░░░░░░░] 65% (23/35 tasks)

🤖 Active Agents:
  agent-implementation-1 → Task 4.2: Portfolio API [2min elapsed]
  agent-implementation-2 → Task 4.3: Price alerts [5min elapsed]
  agent-implementation-3 → Task 4.5: Chart component [1min elapsed]
  agent-implementation-4 → Idle (waiting for Task 4.6 unlock)

✅ Completed (23 tasks):
  Phase 1: ████████ 100% (5/5) ✅
  Phase 2: ████████ 100% (8/8) ✅
  Phase 3: ██████░░ 75% (9/12) [3 in progress]
  Phase 4: █░░░░░░░ 16% (1/6) [2 in progress]

📊 Stats:
  • Time elapsed: 2h 15min
  • Estimated remaining: 45min
  • Tests passed: 87/87
  • Files created: 52
  • Lines of code: ~1,800

🔒 Current Locks:
  • src/api/portfolio.ts (agent-implementation-1)
  • src/components/AlertList.tsx (agent-implementation-2)
  • src/components/Chart.tsx (agent-implementation-3)

⚠️  Recent Issues:
  • Task 3.7: Retry #1 (Redis connection timeout) ✅ Resolved
  • Task 3.9: Blocked by Task 3.8 (waiting for DB migration)

📂 Live logs: .octocode/logs/progress-dashboard.md

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Controls:
  [1] ⏸️  Pause - Stop all agents, save state
  [2] 📊 Details - See detailed task status
  [3] 🔍 Inspect - View specific agent's work
  [4] ⚠️  Issues - Review recent errors
  [5] 🔄 Continue - Keep monitoring (auto-refresh)
  [6] 🛑 Stop - Stop all agents, go to verification

Current: Auto-refresh every 30s | Last update: 10s ago
```

**Actions:**
- **Pause:**
  - All agents finish current atomic operations
  - State saved to checkpoint
  - You can inspect code, review progress
  - Options: Resume, Stop, or Modify Plan
- **Details:** Show full task list with statuses
- **Inspect:**
  - Choose agent to inspect
  - See current file being modified
  - View recent commits
- **Issues:** Display error log with details
- **Continue:** Auto-refresh monitoring
- **Stop:** Graceful shutdown, proceed to verification early

**Pause Options:**
```
⏸️  IMPLEMENTATION PAUSED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ State saved: .octocode/execution-state.json
✅ All locks released
✅ 23/35 tasks completed

You can now:
  [1] 🔍 Inspect Code - Review what's been built
  [2] 📝 Modify Plan - Adjust remaining tasks
  [3] ▶️  Resume - Continue implementation
  [4] 🛑 Stop - End implementation, go to verification

Your choice:
```

### Gate 5: Verification Results (After Phase 7)

**When:** After agent-verification completes QA

**Display:**
```
✅ VERIFICATION COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Status: ⚠️  PASSED WITH WARNINGS

🏗️  Build: ✅ PASSED
  • Production build: successful
  • Dependencies: all installed
  • No build errors

🧪 Tests: ✅ PASSED
  • Unit tests: 124/124 passed
  • Integration tests: 18/18 passed
  • E2E tests: 12/12 passed
  • Coverage: 87% (target: 80%)

📋 Features: ✅ ALL IMPLEMENTED
  • Portfolio tracking: ✅ Working
  • Price alerts: ✅ Working
  • Historical charts: ✅ Working
  • Real-time updates: ✅ Working (15-min delay)
  • User authentication: ✅ Working

⚡ Performance: ✅ PASSED
  • Page load: 1.2s (target: <2s) ✅
  • API response: 180ms avg (target: <500ms) ✅
  • Cache hit rate: 92% ✅

⚠️  Warnings (3):
  1. Missing error boundary in Chart component
  2. API rate limiting not tested under load
  3. Some TypeScript 'any' types remain

🐛 Critical Issues: 0

📊 Code Quality: 8.5/10
  • Clean architecture followed
  • Good test coverage
  • Minor TypeScript improvements needed

📂 Full report: .octocode/verification-report.md

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your options:
  [1] 🚀 Ship It - Project complete, ready for deployment
  [2] 🔧 Fix Warnings - Address non-critical issues
  [3] 🔄 Iterate - Add features or improvements
  [4] 📖 Review Report - See detailed verification results
  [5] ❓ Ask Questions

Your choice:
```

**Actions:**
- **Ship It:** 
  - Project marked as complete
  - Final summary generated
  - Deployment instructions provided
- **Fix Warnings:**
  - agent-implementation assigned to fix warnings
  - Re-run verification
  - Return to Gate 5
- **Iterate:**
  - Specify new features or changes
  - Return to appropriate phase (usually Phase 3 or 6)
- **Review Report:** Display full verification details
- **Ask Questions:** agent-verification explains findings

### Mid-Implementation Modifications

**Scenario:** User wants to change design during Phase 6 (Implementation)

**Flow:**
```
User: "Actually, I want to use Supabase instead of PostgreSQL + Redis"

System Response:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  DESIGN CHANGE REQUEST DETECTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Current progress: 23/35 tasks completed (65%)

Impact analysis:
  🔴 Affects completed tasks: 8 (database layer)
  🟡 Affects in-progress tasks: 3 (API endpoints)
  🟢 Unaffected tasks: 12

Options:
  [1] 🔄 Redesign & Restart - agent-architect redesigns, 
      keeps unaffected work, redoes affected tasks
      Estimated: +2-3 hours

  [2] 🎯 Hybrid Approach - Keep PostgreSQL, add Supabase
      features alongside. agent-architect evaluates.
      Estimated: +1 hour

  [3] 💾 Save & Pivot - Checkpoint current work, 
      start new project with Supabase
      Current work saved to: .octocode/checkpoint-v1/

  [4] ❌ Cancel - Continue with current design

Your choice:
```

**If user chooses "Redesign & Restart":**
1. Pause all agents
2. Save checkpoint
3. agent-architect creates new design with Supabase
4. Present Gate 2 for approval
5. agent-design-verification updates task list (only affected tasks)
6. Present Gate 3 showing delta
7. Resume implementation with updated plan

### Configuration

**Control Settings (.octocode/config.json):**
```json
{
  "humanInTheLoop": {
    "enableApprovalGates": true,
    "autoApproveGates": [],           // e.g., ["gate1", "gate3"] to skip
    "pauseOnWarnings": false,         // Pause at Gate 4 if warnings found
    "pauseOnErrors": true,            // Pause at Gate 4 if errors found
    "dashboardRefreshInterval": 30000, // 30 seconds
    "notifyOnPhaseComplete": true
  }
}
```

**Silent Mode:**
For fully automated runs (e.g., in CI/CD):
```bash
/octocode-vibe "create app" --auto-approve-all --no-gates
```

---

## Observability & Debugging

The system provides comprehensive traceability of all decisions, agent communications, and research queries for debugging and transparency.

### Debug Folder Structure

```
.octocode/debug/
  ├── agent-decisions.json       # All decisions with reasoning
  ├── communication-log.md       # Inter-agent questions/answers
  ├── research-queries.json      # All octocode-mcp queries with results
  ├── phase-timeline.json        # Timeline of phase transitions
  └── error-traces/              # Detailed error traces
      ├── task-3.2-failure.json
      └── verification-errors.json
```

### Decision Traceability

Every agent decision is logged with:
- **What** was decided
- **Why** it was chosen (reasoning)
- **Alternatives** considered
- **Research** that informed the decision (octocode-mcp links)
- **Timestamp** and agent ID

### Agent Decisions Schema

**`.octocode/debug/agent-decisions.json`:**
```json
{
  "version": "1.0",
  "decisions": [
    {
      "id": "decision-arch-001",
      "timestamp": "2025-10-12T14:15:00Z",
      "phase": "architecture",
      "agent": "agent-architect",
      "category": "tech-stack",
      "decision": {
        "area": "Database Selection",
        "chosen": "PostgreSQL + Prisma ORM",
        "alternatives": [
          {
            "option": "MongoDB + Mongoose",
            "pros": ["Flexible schema", "JSON native"],
            "cons": ["No ACID for complex queries", "Harder to ensure data integrity"],
            "score": 6
          },
          {
            "option": "Supabase",
            "pros": ["Managed PostgreSQL", "Built-in auth", "Real-time"],
            "cons": ["Vendor lock-in", "Higher cost at scale"],
            "score": 7
          }
        ],
        "reasoning": "PostgreSQL chosen for ACID guarantees needed for financial data (portfolio holdings, transactions). Prisma provides type-safe queries and excellent DX. Supabase considered but avoided due to vendor lock-in concerns.",
        "researchLinks": [
          {
            "query": "Financial application database patterns",
            "tool": "octocode-mcp",
            "repositories": [
              "maybe-finance/maybe (PostgreSQL + Prisma)",
              "actualbudget/actual-server (PostgreSQL)"
            ],
            "keyFindings": "All major open-source finance apps use PostgreSQL for data integrity"
          }
        ],
        "impactedComponents": ["database", "api", "data-models"],
        "confidence": 9
      }
    },
    {
      "id": "decision-arch-002",
      "timestamp": "2025-10-12T14:18:00Z",
      "phase": "architecture",
      "agent": "agent-architect",
      "category": "caching",
      "decision": {
        "area": "Caching Strategy",
        "chosen": "Redis with 5-minute TTL",
        "alternatives": [
          {
            "option": "In-memory caching",
            "pros": ["Simpler", "No extra service"],
            "cons": ["Lost on restart", "Not shared across instances"],
            "score": 4
          },
          {
            "option": "Database caching table",
            "pros": ["Persistent", "No extra service"],
            "cons": ["Slower than Redis", "DB overhead"],
            "score": 5
          }
        ],
        "reasoning": "Redis chosen for fast external API response caching. 5-min TTL balances fresh data with API rate limits. Critical for reducing costs and latency.",
        "researchLinks": [
          {
            "query": "Stock price API caching strategies",
            "tool": "octocode-mcp",
            "repositories": ["IEXCloud examples", "alpaca-finance patterns"],
            "keyFindings": "Standard practice: 5-15 min cache for delayed quotes"
          }
        ],
        "impactedComponents": ["api", "infrastructure"],
        "confidence": 8
      }
    }
  ]
}
```

### Communication Log Schema

**`.octocode/debug/communication-log.md`:**
```markdown
# Agent Communication Log

## Session: uuid-v4
## Started: 2025-10-12T14:00:00Z

---

### [14:05:23] agent-product → User
**Question:** Should we support real-time updates?
**Context:** Designing stock price refresh strategy
**User Response [14:06:15]:** Yes, but 15-min delay is fine for MVP

---

### [14:22:45] agent-implementation-2 → agent-architect
**Question:** Should we use WebSocket or polling for price updates?
**Context:** Task 3.5 - Implementing real-time price feed
**agent-architect Response [14:23:10]:** 
Use WebSocket with fallback to polling. WebSocket for live updates, 
polling every 30s as fallback if WebSocket fails.
**Reasoning:** Better UX with WebSocket, polling ensures reliability
**Updated Design:** .octocode/designs/api-design.md (section 3.2)

---

### [14:35:12] agent-implementation-4 → agent-product
**Question:** What should happen if user's API key for price data is invalid?
**Context:** Task 4.2 - Portfolio API error handling
**agent-product Response [14:36:00]:**
Show clear error message: "Invalid API key. Please check settings."
Provide link to settings page. Allow viewing cached portfolio data.
**Reasoning:** Don't block all functionality, maintain user engagement
**Updated Requirements:** .octocode/requirements/error-handling.md (section 2.3)

---
```

### Research Queries Schema

**`.octocode/debug/research-queries.json`:**
```json
{
  "version": "1.0",
  "queries": [
    {
      "id": "research-001",
      "timestamp": "2025-10-12T14:12:00Z",
      "agent": "agent-architect",
      "phase": "architecture",
      "query": {
        "tool": "octocode-mcp",
        "operation": "githubSearchRepositories",
        "parameters": {
          "keywords": ["stock", "portfolio", "tracker"],
          "stars": ">100",
          "language": "TypeScript"
        },
        "reasoning": "Need to understand common architectural patterns for stock portfolio apps"
      },
      "results": {
        "repositoriesFound": 12,
        "topResults": [
          {
            "repo": "maybe-finance/maybe",
            "stars": 15234,
            "techStack": "Next.js, PostgreSQL, Prisma, tRPC",
            "keyPatterns": ["tRPC for type safety", "Server components for SSR"],
            "relevance": "high"
          },
          {
            "repo": "actualbudget/actual",
            "stars": 8912,
            "techStack": "React, Node.js, SQLite",
            "keyPatterns": ["Local-first architecture", "Sync engine"],
            "relevance": "medium"
          }
        ],
        "keyTakeaways": [
          "tRPC is standard for type-safe APIs in modern finance apps",
          "PostgreSQL preferred over MongoDB for financial data",
          "Server-side rendering common for SEO and initial load"
        ],
        "influencedDecisions": ["decision-arch-001", "decision-arch-003"]
      }
    },
    {
      "id": "research-002",
      "timestamp": "2025-10-12T14:20:00Z",
      "agent": "agent-research-context",
      "phase": "research",
      "query": {
        "tool": "octocode-mcp",
        "operation": "githubGetFileContent",
        "parameters": {
          "owner": "maybe-finance",
          "repo": "maybe",
          "path": "apps/server/src/trpc/routers/portfolio.ts"
        },
        "reasoning": "Extract portfolio API patterns from high-quality repo"
      },
      "results": {
        "patterns": [
          "Input validation with Zod schemas",
          "Transaction wrapping for data consistency",
          "Error handling with tRPC error codes"
        ],
        "codeExamples": "Saved to .octocode/context/trpc-prisma-integration.md",
        "influencedTasks": ["3.1", "3.2", "3.4"]
      }
    }
  ]
}
```

### Phase Timeline Schema

**`.octocode/debug/phase-timeline.json`:**
```json
{
  "version": "1.0",
  "session": "uuid-v4",
  "phases": [
    {
      "phase": "requirements",
      "status": "completed",
      "startedAt": "2025-10-12T14:00:00Z",
      "completedAt": "2025-10-12T14:10:00Z",
      "duration": "10m 0s",
      "agent": "agent-product",
      "userInteractions": 3,
      "decisionsCount": 5,
      "outputFiles": [
        ".octocode/requirements/prd.md",
        ".octocode/requirements/user-stories.md",
        ".octocode/requirements/features.md"
      ]
    },
    {
      "phase": "architecture",
      "status": "completed",
      "startedAt": "2025-10-12T14:10:00Z",
      "completedAt": "2025-10-12T14:20:00Z",
      "duration": "10m 0s",
      "agent": "agent-architect",
      "researchQueries": 8,
      "decisionsCount": 12,
      "outputFiles": [
        ".octocode/designs/architecture.md",
        ".octocode/designs/tech-stack.md",
        ".octocode/designs/database-schema.md"
      ]
    }
  ]
}
```

### Debug Command

#### `/octocode-debug <phase|task|agent>`

**Purpose:** Inspect decisions, reasoning, and communications for any phase, task, or agent.

**Examples:**

```bash
# View all decisions from architecture phase
/octocode-debug architecture

# View specific task details
/octocode-debug task:3.2

# View all decisions by specific agent
/octocode-debug agent:agent-architect

# View communication between two agents
/octocode-debug communication agent-implementation-2 agent-architect

# View all research queries
/octocode-debug research

# View error traces
/octocode-debug errors
```

**Output Example - `/octocode-debug architecture`:**

```
🔍 DEBUG: Architecture Phase
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Overview:
  • Duration: 10m 0s
  • Agent: agent-architect
  • Decisions Made: 12
  • Research Queries: 8
  • Communications: 2 (with agent-product)

🎯 Key Decisions:

[1] Database Selection (14:15:00)
  ✅ Chosen: PostgreSQL + Prisma ORM
  📊 Score: 9/10 confidence
  
  ❓ Why?
  PostgreSQL chosen for ACID guarantees needed for financial data.
  Prisma provides type-safe queries and excellent DX.
  
  🔬 Research:
  • Analyzed: maybe-finance/maybe, actualbudget/actual
  • Finding: All major finance apps use PostgreSQL
  • Query ID: research-001
  
  🔄 Alternatives Considered:
  • MongoDB + Mongoose (score: 6) - Rejected: No ACID
  • Supabase (score: 7) - Rejected: Vendor lock-in
  
  📂 Details: .octocode/debug/agent-decisions.json#decision-arch-001

[2] Caching Strategy (14:18:00)
  ✅ Chosen: Redis with 5-min TTL
  📊 Score: 8/10 confidence
  
  ❓ Why?
  Fast external API caching. 5-min TTL balances fresh data with rate limits.
  
  🔬 Research:
  • Query: "Stock price API caching strategies"
  • Repositories: IEXCloud, alpaca-finance
  • Finding: 5-15 min cache standard for delayed quotes
  
  📂 Details: .octocode/debug/agent-decisions.json#decision-arch-002

... (10 more decisions)

💬 Communications:

[14:15:32] agent-architect → agent-product
  Q: "Should caching be configurable per user?"
  A: "Not for MVP, keep simple"
  Impact: Simplified caching design

[14:18:45] agent-architect → agent-product
  Q: "Support multiple API providers (IEX, Alpha Vantage)?"
  A: "Yes, but start with one for MVP"
  Impact: Designed provider abstraction layer

🔬 Research Queries: 8 total
  View details: /octocode-debug research --phase architecture

📂 Full details: .octocode/debug/phase-timeline.json
```

**Output Example - `/octocode-debug task:3.2`:**

```
🔍 DEBUG: Task 3.2 - Add API endpoints
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Task Info:
  • Status: ✅ Completed
  • Agent: agent-implementation-2
  • Started: 14:25:00
  • Completed: 14:32:15
  • Duration: 7m 15s
  • Retries: 0

📝 Implementation Details:
  • Files Modified: 3
    - src/api/routes.ts (created, 124 lines)
    - src/api/portfolio.ts (created, 89 lines)
    - src/api/index.ts (modified, +12 lines)
  
  • Tests: 12 added, all passing
  • Linting: ✅ Passed

🤔 Decisions Made:

[1] Error Handling Strategy (14:26:30)
  Chose: tRPC error codes with custom messages
  Why: Type-safe errors, better client handling
  Research: Based on maybe-finance/maybe patterns
  
[2] Input Validation (14:28:00)
  Chose: Zod schemas for all inputs
  Why: Runtime + compile-time safety
  Context: From .octocode/context/trpc-prisma-integration.md

💬 Communications:

[14:27:15] agent-implementation-2 → agent-architect
  Q: "Should we use WebSocket or polling for price updates?"
  A: "WebSocket with polling fallback"
  Impact: Added WebSocket endpoint + fallback logic

[14:30:00] agent-implementation-2 → agent-product
  Q: "What if API rate limit exceeded?"
  A: "Show cached data + warning message"
  Impact: Updated error handling to allow graceful degradation

🔒 Locks:
  • Acquired: 14:25:05
    - src/api/routes.ts
    - src/api/portfolio.ts
    - src/api/index.ts
  • Released: 14:32:20
  • Conflicts: None
  • Wait time: 0s

🔬 Research Used:
  • Context doc: trpc-prisma-integration.md
  • Patterns applied: 3
    - Zod input validation
    - Transaction wrapping
    - tRPC error codes

📂 Checkpoint: .octocode/execution-state.json @ 14:32:20
📂 Full trace: .octocode/debug/task-traces/task-3.2.json
```

### Real-Time Decision Logging

Each agent logs decisions as they happen:

**agent-architect:**
```typescript
logDecision({
  category: "tech-stack",
  area: "Database Selection",
  chosen: "PostgreSQL + Prisma ORM",
  alternatives: [...],
  reasoning: "...",
  researchLinks: [...],
  confidence: 9
});
```

**agent-implementation:**
```typescript
logImplementation({
  taskId: "3.2",
  decision: "Error handling strategy",
  chosen: "tRPC error codes",
  reasoning: "Type-safe, better DX",
  researchUsed: ["trpc-prisma-integration.md"]
});
```

### Error Tracing

**`.octocode/debug/error-traces/task-3.2-failure.json`:**
```json
{
  "taskId": "3.2",
  "agent": "agent-implementation-3",
  "failedAt": "2025-10-12T14:22:00Z",
  "error": {
    "type": "DatabaseConnectionError",
    "message": "Connection to Redis failed: ECONNREFUSED",
    "stack": "...",
    "context": {
      "attemptingOperation": "Cache initialization",
      "redisConfig": {
        "host": "localhost",
        "port": 6379,
        "password": "[REDACTED]"
      },
      "envVarsPresent": ["REDIS_URL", "DATABASE_URL"],
      "servicesRunning": ["postgresql", "node"]
    }
  },
  "diagnosisSteps": [
    "Checked REDIS_URL env var - Present ✅",
    "Attempted connection to Redis - Failed ❌",
    "Checked if Redis service running - Not found ❌",
    "Root cause: Redis not installed/running"
  ],
  "resolution": {
    "action": "Added Redis installation to task prerequisites",
    "reassignedTo": "agent-implementation-4",
    "outcome": "Completed successfully on retry"
  },
  "preventionAdded": {
    "check": "Verify Redis running before cache initialization",
    "location": "src/lib/cache.ts"
  }
}
```

### Debug Dashboard

When `/octocode-debug` is run without arguments, show overview:

```
🔍 OCTOCODE DEBUG DASHBOARD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Session Overview:
  • Session ID: uuid-v4
  • Started: 2025-10-12T14:00:00Z
  • Current Phase: Implementation (Phase 6)
  • Duration: 2h 30m

📈 Progress:
  ✅ Phase 1: Requirements (10m)
  ✅ Phase 2: Architecture (10m)
  ✅ Phase 3: Validation (5m)
  ✅ Phase 4: Research (8m)
  ✅ Phase 5: Orchestration (2m)
  🔄 Phase 6: Implementation (1h 55m, 65% complete)
  ⏸️  Phase 7: Verification (pending)

🤖 Agent Activity:
  • agent-product: 1 session (10m) - 5 decisions
  • agent-architect: 1 session (10m) - 12 decisions
  • agent-design-verification: 1 session (5m) - 35 tasks created
  • agent-research-context: 1 session (8m) - 7 guides created
  • agent-manager: Active - 23/35 tasks completed
  • agent-implementation (4 instances): Active
    - agent-implementation-1: 6 tasks ✅
    - agent-implementation-2: 7 tasks ✅
    - agent-implementation-3: 5 tasks ✅, 1 retry
    - agent-implementation-4: 5 tasks ✅

💬 Communications: 18 total
  • User ↔ Agents: 5
  • Inter-agent: 13

🔬 Research: 15 queries
  • Repository searches: 8
  • File inspections: 7
  • Influenced 24 decisions

🎯 Decisions: 42 total
  • Requirements: 5
  • Architecture: 12
  • Design: 8
  • Implementation: 17

⚠️  Issues: 3 total
  • Failures: 1 (Task 3.2, resolved)
  • Retries: 1
  • Warnings: 1 (lock timeout)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Commands:
  /octocode-debug <phase>              View phase details
  /octocode-debug task:<id>            View task trace
  /octocode-debug agent:<name>         View agent decisions
  /octocode-debug research             View research queries
  /octocode-debug communications       View all agent comms
  /octocode-debug errors               View error traces
  /octocode-debug timeline             View phase timeline

📂 Debug files: .octocode/debug/
```

### Configuration

**Debug Settings (.octocode/config.json):**
```json
{
  "debugging": {
    "enableDetailedLogging": true,
    "logAllDecisions": true,
    "logCommunications": true,
    "logResearchQueries": true,
    "captureErrorTraces": true,
    "retentionDays": 30,
    "redactSensitiveData": true
  }
}
```

## Agents

**General Notes:**
- All agents can read/write files under `.octocode/` folder
- All agents have access to octocode-mcp for GitHub research
- Each agent has specific tools based on least privilege principle
- Agents communicate through Claude's reasoning engine (not direct calls)

---

### 1. agent-product (Product Manager)

**Role:**
Acts as your **Product Manager** who ensures everyone understands what needs to be built and why. Clarifies requirements, asks questions, and creates comprehensive product documentation.

**Model:** `opus` (requires complex reasoning and ambiguity resolution)

**Tools:**
- `Read` - Read existing files and context
- `Write` - Create PRD and requirement documents
- `WebSearch` - Research similar products and features
- `TodoWrite` - Track requirement gathering tasks
- `octocode-mcp` - Research similar projects on GitHub

**Inputs:**
- User's initial request
- User's answers to clarifying questions
- Existing project context (if any)

**Responsibilities:**
1. Ask clarifying questions to understand user needs:
   - Target audience and use cases
   - Technical constraints (budget, scale, performance)
   - Feature priorities and MVP scope
   - Integration requirements
   - Error handling expectations
2. Research similar projects using octocode-mcp
3. Define comprehensive requirements:
   - Product Requirements Document (PRD)
   - User stories and flows
   - Feature list with priorities (must-have, nice-to-have)
   - KPIs and success metrics
   - Error handling scenarios
   - Performance criteria
   - Monitoring and observability needs
4. Respond to clarification requests from other agents
5. Update requirements based on feedback
6. **Logging (Critical):**
   - Log all requirements decisions with reasoning
   - Record all user interactions in communication log
   - Document feature prioritization rationale
   - Track requirement changes and their triggers

**Communication:**
- Can be asked questions by: `agent-architect`, `agent-implementation`
- Suggests escalation to: N/A (top-level requirements authority)

**Outputs:**
```
.octocode/requirements/
  ├── prd.md                # Product Requirements Document
  ├── user-stories.md       # User flows and scenarios
  ├── features.md           # Feature list with priorities
  ├── kpis.md               # Success metrics
  ├── error-handling.md     # Error scenarios and handling
  └── performance.md        # Performance criteria and SLAs
.octocode/debug/
  ├── agent-decisions.json  # Requirements decisions with reasoning
  └── communication-log.md  # User interactions logged
```

---

### 2. agent-architect (Solution Architect)

**Role:**
Acts as your **Lead Architect** who designs how the system will be built, choosing technologies, patterns, and creating technical specifications.

**Model:** `opus` (requires complex architectural reasoning and tradeoff analysis)

**Tools:**
- `Read` - Read requirements and existing codebase
- `Write` - Create design documents
- `Grep` - Search codebase for patterns
- `Glob` - Find files by pattern
- `TodoWrite` - Track design tasks
- `octocode-mcp` - Research architectural patterns and tech stacks

**Inputs:**
- `.octocode/requirements/*` (from agent-product)
- Existing project structure (if any)
- Technology constraints from user

**Responsibilities:**
1. Analyze requirements and constraints thoroughly
2. Research best practices and patterns using octocode-mcp:
   - Framework and library options
   - Architectural patterns for the use case
   - Database design patterns
   - API design patterns
   - Real-time/async communication strategies
   - Deployment and infrastructure options
3. Make architectural decisions:
   - Tech stack selection (frontend, backend, database, infrastructure)
   - Component architecture and structure
   - API design and endpoints
   - Database schema and relationships
   - Data flow and state management
   - Authentication and authorization strategy
   - Caching strategy
   - Real-time updates approach
   - Testing strategy
   - Deployment and CI/CD approach
4. Document tradeoffs and alternatives considered
5. Ask agent-product for clarifications when requirements are ambiguous
6. Update design based on feedback from agent-design-verification
7. **Logging (Critical):**
   - Log every architectural decision with full reasoning
   - Document all alternatives considered with pros/cons/scores
   - Link to octocode-mcp research that informed decisions
   - Record confidence level for each decision
   - Log all inter-agent communications

**Communication:**
- Can ask questions to: `agent-product` (for requirement clarifications)
- Can be asked questions by: `agent-design-verification`, `agent-implementation`
- When unclear, suggest: "We should use agent-product to clarify [specific requirement]"

**Outputs:**
```
.octocode/designs/
  ├── architecture.md          # System architecture overview
  ├── tech-stack.md           # Technology choices with rationale
  ├── component-structure.md  # Component/module organization
  ├── api-design.md           # API endpoints and contracts
  ├── database-schema.md      # Database tables and relationships
  ├── data-flow.md            # State management and data flow
  ├── auth-strategy.md        # Authentication/authorization design
  ├── testing-strategy.md     # Test approach and frameworks
  ├── deployment.md           # Deployment and infrastructure
  └── tradeoffs.md            # Decisions and alternatives
.octocode/debug/
  ├── agent-decisions.json    # All architectural decisions with reasoning
  ├── research-queries.json   # All octocode-mcp queries and findings
  └── communication-log.md    # Inter-agent communications
```

---

### 3. agent-design-verification (Technical Lead)

**Role:**
Acts as your **Technical Lead** who reviews the design to ensure it meets requirements, is technically sound, and is ready for implementation. Creates the task breakdown.

**Model:** `sonnet` (good at pattern matching and validation)

**Tools:**
- `Read` - Read requirements and design documents
- `Write` - Create task breakdown and issue reports
- `TodoWrite` - Create implementation todos
- `Grep` - Verify design completeness

**Inputs:**
- `.octocode/requirements/*` (from agent-product)
- `.octocode/designs/*` (from agent-architect)

**Responsibilities:**
1. **Requirements Coverage Validation:**
   - Verify all features from PRD are addressed in design
   - Check performance criteria can be met
   - Ensure error handling covers all scenarios
   - Validate monitoring/observability strategy exists
2. **Architecture Soundness Validation:**
   - Verify tech stack choices are appropriate
   - Check database schema supports all features
   - Validate API design follows best practices
   - Assess scalability and performance design
3. **Technical Feasibility Check:**
   - Confirm all dependencies are available
   - Validate deployment strategy is viable
   - Check for missing critical components
4. **Task Breakdown Creation:**
   - Identify logical implementation phases
   - Define tasks with clear boundaries
   - Specify task dependencies
   - Mark tasks that can run in parallel
   - Estimate task complexity
5. **Issue Management:**
   - Flag critical gaps or issues
   - Assign issues to appropriate agents
   - Track issue resolution
   - Re-validate after fixes

**Communication:**
- Can notify: `agent-product` (requirement issues), `agent-architect` (design issues)
- Loop behavior: Re-validates after receiving fixes until all issues resolved
- When issues found: Provides specific questions/concerns to appropriate agent

**Outputs:**
```
.octocode/tasks.md              # Task breakdown with dependencies and statuses
.octocode/design-issues.md      # Issues found during validation (if any)
```

**Task Format:**
```markdown
## Phase N: [Phase Name] [parallel-group-X or depends: Phase Y]
- [ ] Task N.M: [Description]
      Files: [file1.ts, file2.ts]  # Files to be modified
      Complexity: low|medium|high
      [assigned-to: agent-implementation-X]
      [blocked-by: Task N.Y] (if file conflict exists)
```

**Example:**
```markdown
## Phase 3: Authentication [parallel-group-auth]

- [ ] Task 3.1: Implement user login
      Files: [src/auth/auth.ts, src/types/user.ts]
      Complexity: medium
      [assigned-to: agent-implementation-1]

- [ ] Task 3.2: Add API endpoints
      Files: [src/api/api.ts, src/api/routes.ts]
      Complexity: medium
      [assigned-to: agent-implementation-2]
      [can-run-parallel-with: 3.1] ✅

- [ ] Task 3.3: Implement logout
      Files: [src/auth/auth.ts]
      Complexity: low
      [blocked-by: 3.1] ⚠️ (both modify auth.ts)
      [assigned-to: pending]
```

---

### 4. agent-research-context (Research Specialist)

**Role:**
Acts as your **Research Specialist** who gathers best practices, code examples, and implementation patterns from GitHub to guide the development team.

**Model:** `sonnet` (good at research synthesis and pattern extraction)

**Tools:**
- `Read` - Read design and task documents
- `Write` - Create context documentation
- `octocode-mcp` - Primary tool for GitHub research

**Inputs:**
- `.octocode/designs/*` (from agent-architect)
- `.octocode/tasks.md` (from agent-design-verification)

**Responsibilities:**
1. Identify research topics based on tech stack and features:
   - Framework-specific patterns (e.g., "Next.js 14 App Router")
   - Integration patterns (e.g., "tRPC with Prisma")
   - Domain-specific patterns (e.g., "stock price APIs")
   - Infrastructure patterns (e.g., "Redis caching strategies")
   - Testing patterns (e.g., "E2E testing for financial apps")
2. Use octocode-mcp to research each topic:
   - Find high-quality repositories
   - Extract implementation patterns
   - Document best practices
   - Note common pitfalls
   - Gather code examples
3. Run multiple research queries in parallel when possible
4. Synthesize findings into practical implementation guides
5. Document tradeoffs and alternatives
6. **Logging (Critical):**
   - Log all research queries with parameters and reasoning
   - Record repositories analyzed and key findings
   - Document which decisions were influenced by research
   - Track research quality and relevance scores

**Parallelization:**
Can run multiple research queries simultaneously for faster context gathering.

**Communication:**
- Works independently (no agent communication needed)
- Reads from: `agent-architect`, `agent-design-verification`

**Outputs:**
```
.octocode/context/
  ├── [framework]-patterns.md        # e.g., nextjs-realtime-patterns.md
  ├── [integration]-patterns.md      # e.g., trpc-prisma-integration.md
  ├── [domain]-patterns.md           # e.g., stock-api-patterns.md
  ├── [infrastructure]-patterns.md   # e.g., redis-caching-strategies.md
  ├── testing-patterns.md            # Testing strategies
  ├── authentication-patterns.md     # Auth patterns
  └── deployment-best-practices.md   # Deployment guides
.octocode/debug/
  └── research-queries.json          # All queries with results and findings
```

**Document Structure:**
```markdown
# [Topic] Patterns

## Research Sources
- Repository: owner/repo
- Stars: X
- Last updated: Date

## Pattern: [Pattern Name]
[Implementation example with code]

## Key Learnings
[Bullet points]

## Tradeoffs
[Pros and cons]

## Alternatives
[Other approaches]
```

---

### 5. agent-manager (Engineering Manager)

**Role:**
Acts as your **Engineering Manager** who coordinates the development team, distributes tasks, monitors progress, handles failures, and ensures quality gates are met.

**Model:** `sonnet` (good at orchestration and progress tracking)

**Tools:**
- `Read` - Read tasks, context, and progress
- `Write` - Update task statuses and logs
- `TodoWrite` - Manage implementation todos
- `Bash` - Run status checks

**Inputs:**
- `.octocode/tasks.md` (from agent-design-verification)
- `.octocode/context/*` (from agent-research-context)
- Progress updates from agent-implementation instances

**Responsibilities:**
1. **Task Distribution:**
   - Analyze task dependencies
   - Analyze file dependencies for each task
   - Identify tasks that can run in parallel (no file conflicts)
   - Create execution plan respecting file locks
   - Assign tasks to agent-implementation instances
2. **Parallel Execution Management:**
   - Spawn multiple agent-implementation instances
   - Track which agent is working on which task
   - Ensure task dependencies are respected
   - Ensure file locks prevent conflicts
3. **File Lock Management (Critical):**
   - Maintain lock registry in `.octocode/locks.json`
   - Handle lock acquisition requests from agents
   - Check file availability before granting locks
   - Acquire locks atomically (all-or-nothing per task)
   - Release locks when task completes
   - Track lock wait queues
   - Detect and handle stale locks (5-minute timeout)
   - Notify waiting agents when locks become available
   - Prevent deadlocks using alphabetical lock ordering
4. **Progress Monitoring:**
   - Track task completion status
   - Update `.octocode/tasks.md` with statuses
   - Log execution progress
   - Create live progress dashboard
   - Show locked files and waiting agents
5. **Issue and Failure Management:**
   - Detect blocked or failed tasks
   - Analyze failure reasons (including lock timeouts)
   - Reassign failed tasks to other agents
   - Release locks if agent crashes
   - Escalate to agent-architect or agent-product if design/requirement issues
6. **Quality Gates:**
   - Ensure tests pass before marking tasks complete
   - Run linting on completed code
   - Verify no breaking changes
   - Trigger agent-verification when all tasks done
7. **State Persistence (Critical):**
   - Write checkpoint to `.octocode/execution-state.json` after every task completion
   - Use atomic file operations (write to temp → rename)
   - Save state before spawning new agents
   - Checkpoint every 5 minutes during long operations
   - On resume: Load state, validate, release all locks, and continue
   - Track all active agents and their assigned tasks
   - Maintain task dependency graph in state
8. **Logging (Critical):**
   - Log all task assignments with reasoning
   - Record lock acquisitions, releases, and conflicts
   - Track phase transitions with timestamps
   - Document orchestration decisions
   - Log all agent spawning and termination events

**Communication:**
- Spawns: Multiple `agent-implementation` instances
- Can notify: `agent-architect`, `agent-product` (for escalations)
- Triggers: `agent-verification` (when implementation complete)

**Outputs:**
```
.octocode/execution-state.json  # Critical: Checkpoint state for recovery
.octocode/locks.json            # Critical: File lock registry
.octocode/tasks.md              # Updated with real-time statuses
.octocode/logs/
  ├── execution-log.md          # Detailed execution timeline
  ├── progress-dashboard.md     # Live progress view
  ├── issues-log.md             # Failures and resolutions
  └── lock-history.md           # Lock acquisition/release history
.octocode/debug/
  ├── phase-timeline.json       # Phase transitions with durations
  ├── agent-decisions.json      # Orchestration decisions
  └── communication-log.md      # Agent communications
```

**Task Status Values:**
- `pending` - Not yet started
- `in-progress` - Currently being worked on
- `completed` - Successfully finished
- `failed` - Failed (includes reason)
- `blocked` - Waiting on dependency

---

### 6. agent-implementation (Software Engineer)

**Role:**
Acts as a **Software Engineer** on the development team. Multiple instances work in parallel on different tasks, writing code, running tests, and fixing issues.

**Model:** `sonnet` (good balance of speed and code quality) or `haiku` (for simple tasks)

**Tools:**
- `Read` - Read designs, context, and existing code
- `Write` - Create new files
- `Edit` - Modify existing files
- `Bash` - Run builds, tests, linting
- `Grep` - Search codebase
- `Glob` - Find files
- `TodoWrite` - Track task progress
- `octocode-mcp` - Research missing context on-demand

**Inputs:**
- Assigned task from agent-manager
- `.octocode/designs/*` (from agent-architect)
- `.octocode/context/*` (from agent-research-context)
- `.octocode/requirements/*` (from agent-product)
- Existing codebase

**Responsibilities:**
1. **Task Execution:**
   - Read assigned task description
   - Review relevant design documents
   - Study context guides for implementation patterns
   - Identify files that need modification
2. **Lock Acquisition:**
   - Request file locks from agent-manager before writing
   - Provide list of files to be modified
   - Wait for lock grant (retry up to 30 seconds)
   - If lock timeout: Report blocked to agent-manager, pick different task
3. **Code Implementation:**
   - After locks acquired: proceed with modifications
   - Check existing codebase structure
   - Follow architecture patterns from design
   - Apply best practices from context docs
   - Write clean, maintainable code
   - Add appropriate comments
4. **Self-Testing:**
   - Run unit tests for new code (no lock needed - read-only)
   - Run integration tests
   - Fix test failures
   - Run linting and fix issues
   - Verify no breaking changes
5. **Issue Resolution:**
   - If technical question arises → Ask agent-architect
   - If requirement unclear → Ask agent-product
   - If missing context → Use octocode-mcp directly
   - If task blocked by locks → Notify agent-manager
   - If lock timeout → Report to agent-manager, work on different task
6. **Task Completion:**
   - Verify all changes are saved to disk
   - Run self-tests to confirm success
   - Notify agent-manager with completion details
   - agent-manager releases locks and updates checkpoint atomically
   - Only then mark task as completed
   - Provide summary of what was implemented
7. **Logging (Critical):**
   - Log all implementation decisions with reasoning
   - Record which context docs/patterns were applied
   - Document any deviations from design with rationale
   - Log inter-agent communications
   - Track files modified and tests added

**Parallelization:**
Multiple instances can work simultaneously on independent tasks.

**Communication:**
- Can ask questions to: `agent-architect` (technical), `agent-product` (requirements)
- Can use: `octocode-mcp` directly (for missing implementation details)
- Reports to: `agent-manager` (progress, completion, failures)

**Outputs:**
- Implementation code (in project directories)
- Updated `.octocode/tasks.md` (task status)
- Implementation notes (if needed)
.octocode/debug/
  ├── agent-decisions.json      # Implementation decisions
  ├── task-traces/              # Detailed task execution traces
  └── communication-log.md      # Inter-agent communications

---

### 7. agent-verification (QA Engineer)

**Role:**
Acts as your **QA Engineer** who verifies that everything works, tests pass, requirements are met, and quality standards are upheld.

**Model:** `sonnet` (good at systematic validation and pattern detection)

**Tools:**
- `Read` - Read code, requirements, and design
- `Bash` - Run builds, tests, linting
- `TodoWrite` - Track verification issues
- `Grep` - Scan for anti-patterns and issues

**Inputs:**
- Complete implemented codebase
- `.octocode/requirements/*` (from agent-product)
- `.octocode/designs/*` (from agent-architect)
- `.octocode/tasks.md` (from agent-manager)

**Responsibilities:**
1. **Build Verification:**
   - Run production build
   - Check for build errors
   - Verify all dependencies installed
2. **Lint Verification:**
   - Run linting tools
   - Fix auto-fixable issues
   - Report critical lint errors
3. **Test Verification:**
   - Run unit tests
   - Run integration tests
   - Run E2E tests
   - Check test coverage meets requirements
4. **Feature Verification (against PRD):**
   - Verify all must-have features work
   - Test each user flow from PRD
   - Validate error handling
   - Check edge cases
5. **Performance Verification:**
   - Check page load times
   - Verify API response times
   - Test under expected load
   - Compare against performance criteria
6. **Critical Bug Scan:**
   - Security vulnerabilities (API keys exposed, etc.)
   - Data integrity issues
   - Logic bugs in critical flows
   - Missing error handling
7. **Code Quality Review:**
   - Check for over-engineering
   - Verify design patterns followed
   - Assess code maintainability
   - Look for code smells

**Communication:**
- If critical issues found: Notify `agent-implementation` (for code fixes) or `agent-architect` (for design issues)
- Loop behavior: Re-verify after fixes until all critical issues resolved

**Outputs:**
```
.octocode/verification-report.md    # Comprehensive verification results
.octocode/issues/                   # Detailed issue reports (if any)
  ├── critical-issues.md
  ├── warnings.md
  └── recommendations.md
```

**Verification Report Structure:**
```markdown
# Verification Report

## Summary
Status: ✅ PASSED | ⚠️ PASSED WITH ISSUES | ❌ FAILED
Critical Issues: N
Warnings: N

## Build Status
✅/❌ [details]

## Test Results
✅/❌ Unit: X/Y passed
✅/❌ Integration: X/Y passed
✅/❌ E2E: X/Y passed
Coverage: N%

## Feature Verification
✅/❌ Feature 1: [status]
...

## Performance Results
✅/⚠️/❌ Metric: [actual] (target: [expected])

## Critical Issues
1. ❌ [Issue description]
   File: [path]
   Fix: [recommendation]
   Assigned: [agent]

## Warnings
[Non-critical issues]

## Next Steps
[Action items]
``` 
