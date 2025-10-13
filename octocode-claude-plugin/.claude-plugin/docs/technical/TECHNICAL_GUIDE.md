# Octocode Vibe Technical Guide

**Plugin Architecture and Implementation Documentation**

This document provides technical documentation for developers and contributors who want to understand the internal workings of the Octocode Vibe plugin.

---

## Table of Contents

1. [Plugin Architecture](#plugin-architecture)
2. [Command Flow](#command-flow)
3. [Agent System](#agent-system)
4. [Agent Invocation & Task Tool](#agent-invocation--task-tool)
5. [Communication Protocol](#communication-protocol)
6. [File Locking Implementation](#file-locking-implementation)
7. [State Management](#state-management)
8. [Directory Structure](#directory-structure)
9. [Agent Implementation Details](#agent-implementation-details)
10. [Extending the Plugin](#extending-the-plugin)

---

## Plugin Architecture

### Overview

Octocode Vibe is a Claude Code plugin that orchestrates 8 specialized agents through a 7-phase workflow to transform user ideas into production-ready code.

**Core Components:**
- **Command Handler** (`octocode-generate.md`) - Entry point and workflow orchestrator
- **8 Specialized Agents** (`agents/*.md`) - Autonomous workers with specific roles
- **State Manager** - Persistent execution state across phases
- **File Lock Manager** - Prevents concurrent file modifications
- **Communication Layer** - Inter-agent message routing
- **Observability System** - Decision, communication, and research logging

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      User / Claude Code                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   /octocode-generate Command                     │
│              (commands/octocode-generate.md)                     │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┴───────────────┐
         │     Phase Orchestrator         │
         │  (7-phase workflow control)    │
         └───────────────┬───────────────┘
                         │
      ┌──────────────────┼──────────────────┐
      │                  │                  │
      ▼                  ▼                  ▼
┌──────────┐      ┌──────────┐      ┌──────────┐
│ Phase 1  │      │ Phase 2  │      │ Phase 3  │
│ Product  │      │ Arch+UX  │      │Validation│
│  Agent   │      │(Parallel)│      │  Agent   │
└──────────┘      └──────────┘      └──────────┘
      │                  │                  │
      ▼                  ▼                  ▼
┌──────────┐      ┌──────────┐      ┌──────────┐
│ Phase 4  │      │ Phase 5  │      │ Phase 6  │
│ Research │      │ Manager  │      │Implement │
│  Agent   │      │  Agent   │      │  Agents  │
└──────────┘      └────┬─────┘      └──────────┘
      │                │                  │
      │                ▼                  │
      │         ┌──────────────┐         │
      │         │ File Locking │         │
      │         │    System    │         │
      │         └──────────────┘         │
      │                                   │
      └───────────────┬───────────────────┘
                      ▼
            ┌──────────────────┐
            │    Phase 7        │
            │  Verification     │
            │     Agent         │
            └──────────────────┘
                      │
                      ▼
            ┌──────────────────┐
            │  .octocode/       │
            │  ├─ requirements/ │
            │  ├─ designs/      │
            │  ├─ ux/           │
            │  ├─ context/      │
            │  ├─ debug/        │
            │  └─ logs/         │
            └──────────────────┘
```

### Technology Stack

- **Claude Code Plugin System** - Plugin infrastructure
- **Markdown-based Agent Definitions** - Agent specifications in frontmatter
- **Task Tool** - Agent spawning and orchestration
- **MCP (Model Context Protocol)** - octocode-mcp and chrome-devtools-mcp integrations
- **JSON State Files** - Execution state, locks, decisions, research
- **Markdown Documentation** - Requirements, designs, context guides

---

## Command Flow

### Entry Point: `/octocode-generate`

**File:** `commands/octocode-generate.md`

**Command Signature:**
```markdown
---
name: octocode-generate
description: Transform your idea into production-ready code
arguments:
  - name: project_idea
    description: Your application idea
    required: true
  - name: --resume
    description: Resume from previous session
    required: false
---
```

### Workflow State Machine

```
┌─────────────────────────────────────────────────────────────┐
│                    Initial State                             │
│  User runs: /octocode-generate [project idea]                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │ Initialize Session    │
         │ - Generate session ID │
         │ - Create .octocode/   │
         │ - Setup state file    │
         └───────────┬───────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────────┐
│                 Phase 1: Requirements                       │
│  Invoke: agent-product (Opus)                              │
│  Tools: Read, Write, WebSearch, TodoWrite, octocode-mcp    │
│  Output: .octocode/requirements/*.md                       │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ▼
            ┌────────────────┐
            │   Gate 1: PRD  │
            │   User Approval│
            │   [Approve?]   │
            └────────┬───────┘
                     │ Yes
                     ▼
┌────────────────────────────────────────────────────────────┐
│            Phase 2: Architecture & UX (Parallel)            │
│  ┌─────────────────────────┬─────────────────────────┐     │
│  │ agent-architect (Opus)  │   agent-ux (Opus)       │     │
│  │ Backend architecture    │   Frontend/UX design    │     │
│  │ Output: .octocode/      │   Output: .octocode/    │     │
│  │         designs/*.md    │           ux/*.md       │     │
│  └─────────────────────────┴─────────────────────────┘     │
│              ↕ Coordination Messages ↕                      │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ▼
            ┌────────────────────┐
            │   Gate 2: Design   │
            │   User Approval    │
            │   [Approve?]       │
            └────────┬───────────┘
                     │ Yes
                     ▼
┌────────────────────────────────────────────────────────────┐
│              Phase 3: Design Validation                     │
│  Invoke: agent-design-verification (Sonnet)                │
│  - Validate requirements coverage                          │
│  - Create task breakdown                                   │
│  - Detect file conflicts                                   │
│  Output: .octocode/tasks.md                                │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ▼
            ┌────────────────────┐
            │   Gate 3: Tasks    │
            │   User Approval    │
            │   [Approve?]       │
            └────────┬───────────┘
                     │ Yes
                     ▼
┌────────────────────────────────────────────────────────────┐
│              Phase 4: Context Research                      │
│  Invoke: agent-research-context (Sonnet)                   │
│  - Parallel research queries                               │
│  - Extract code examples                                   │
│  Output: .octocode/context/*.md                            │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────────┐
│              Phase 5: Task Orchestration                    │
│  Invoke: agent-manager (Sonnet)                            │
│  - Analyze dependencies                                    │
│  - Setup file locks                                        │
│  - Spawn 4-5 agent-implementation instances                │
│  Output: .octocode/locks.json, progress dashboard          │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────────┐
│            Phase 6: Implementation (Parallel)               │
│  Multiple agent-implementation instances (Sonnet)          │
│  ┌────────────┬────────────┬────────────┬────────────┐    │
│  │  Agent 1   │  Agent 2   │  Agent 3   │  Agent 4   │    │
│  │  Task 1.1  │  Task 1.2  │  Task 1.3  │  Task 1.4  │    │
│  └────────────┴────────────┴────────────┴────────────┘    │
│         ↓            ↓            ↓            ↓           │
│       File Lock Manager (atomic locks)                     │
│         ↓            ↓            ↓            ↓           │
│       Codebase modifications                               │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ▼
            ┌────────────────────┐
            │   Gate 4: Monitor  │
            │   Live Dashboard   │
            │   [Continue?]      │
            └────────┬───────────┘
                     │ Yes
                     ▼
┌────────────────────────────────────────────────────────────┐
│              Phase 7: Quality Assurance                     │
│  Invoke: agent-verification (Sonnet)                       │
│  - Build, lint, test verification                          │
│  - Feature coverage validation                             │
│  - Static code analysis                                    │
│  - Runtime testing (chrome-devtools-mcp)                   │
│  Output: .octocode/verification-report.md                  │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ▼
            ┌────────────────────┐
            │   Gate 5: Final    │
            │   User Approval    │
            │   [Ship It?]       │
            └────────┬───────────┘
                     │ Yes
                     ▼
            ┌────────────────────┐
            │  Production-Ready  │
            │     Codebase       │
            └────────────────────┘
```

### Phase Transitions

Each phase transition involves:
1. **State Checkpoint** - Update `execution-state.json`
2. **Observability Logging** - Record phase completion
3. **Gate Presentation** (if applicable) - User approval
4. **Agent Cleanup** - Release resources
5. **Next Phase Initiation** - Spawn next agent(s)

---

## Agent System

### Agent Definition Format

Agents are defined in markdown files with YAML frontmatter:

```markdown
---
name: agent-product
description: Product Manager - Creates comprehensive PRD
model: opus
tools:
  - Read
  - Write
  - WebSearch
  - TodoWrite
---

# Agent Instructions

Your role is...
[Detailed instructions follow]
```

### Agent Properties

**Frontmatter Fields:**
- `name` (required) - Unique agent identifier
- `description` (required) - Brief role description
- `model` (required) - `opus` or `sonnet`
- `tools` (required) - Array of allowed tools

**Model Selection Strategy:**
- **Opus** - Strategy/critical thinking (agents 1-3)
- **Sonnet** - Execution/implementation (agents 4-8)

### The 8 Agents

#### 1. agent-product (Product Manager)
**File:** `agents/agent-product.md`
**Model:** Opus
**Tools:** Read, Write, WebSearch, TodoWrite, octocode-mcp
**Phase:** 1
**Input:** User's project idea
**Output:** `.octocode/requirements/`
- `prd.md` - Product Requirements Document
- `user-stories.md` - User flows
- `features.md` - Feature specifications
- `error-handling.md` - Error scenarios
- `performance.md` - Performance criteria

**Key Responsibilities:**
- Ask clarifying questions
- Research similar projects on GitHub
- Create comprehensive PRD
- Define success metrics

**Implementation Notes:**
- Uses octocode-mcp for competitive analysis
- Logs all user communications
- Creates decision logs for requirement choices

---

#### 2. agent-architect (Solution Architect)
**File:** `agents/agent-architect.md`
**Model:** Opus
**Tools:** Read, Write, Grep, Glob, TodoWrite, octocode-mcp, WebSearch
**Phase:** 2A (runs in parallel with agent-ux)
**Input:** `.octocode/requirements/`
**Output:** `.octocode/designs/`
- `architecture.md` - System architecture
- `tech-stack.md` - Technology choices
- `api-design.md` - API endpoints
- `database-schema.md` - Database design
- `tradeoffs.md` - Design decisions

**Key Responsibilities:**
- Backend architecture design
- Critical thinking framework
- Research-driven tech stack selection
- API design and database schema

**Critical Thinking Framework:**
1. **Self-Questioning Phase**
   - What am I trying to optimize for?
   - What are critical constraints?
   - What assumptions am I making?

2. **Research Phase**
   - Search GitHub for similar projects (>1000 stars)
   - Analyze tech stack patterns
   - Extract architecture patterns

3. **Alternative Evaluation**
   - Minimum 3 alternatives per decision
   - Score each option (1-10)
   - Document pros/cons

4. **Devil's Advocate**
   - Challenge own reasoning
   - Identify failure scenarios
   - Risk analysis

5. **Decision Documentation**
   - Log to `.octocode/debug/agent-decisions.json`
   - Include research links
   - Confidence score

**Coordination Protocol:**
- Communicates with agent-ux on frontend framework
- Shares API requirements
- Aligns on real-time data strategy

---

#### 3. agent-ux (UX Engineer)
**File:** `agents/agent-ux.md`
**Model:** Opus
**Tools:** Read, Write, WebSearch, WebFetch, TodoWrite, octocode-mcp
**Phase:** 2B (runs in parallel with agent-architect)
**Input:** `.octocode/requirements/`, `.octocode/designs/architecture.md`
**Output:** `.octocode/ux/`
- `user-flows.md` - User journeys
- `wireframes.md` - ASCII wireframes
- `component-library.md` - UI components
- `design-system.md` - Colors, typography, spacing
- `accessibility.md` - WCAG 2.1 AA compliance
- `responsive-design.md` - Breakpoints
- `frontend-architecture.md` - Framework, state, routing

**Key Responsibilities:**
- Frontend architecture and UX design
- User empathy analysis
- Design system creation
- Accessibility-first approach

**UX Critical Thinking Framework:**
1. **User Empathy Phase**
   - Who are users? Context? Goals?
   - What assumptions about users?

2. **Problem Definition**
   - What problem does this UI solve?
   - Simplest solution?

3. **Design Alternatives**
   - 3+ design approaches
   - Accessibility validation
   - Mobile-first validation

4. **Research Phase**
   - UI patterns from successful apps
   - Component library analysis
   - Design system examples

**Coordination Protocol:**
- Receives backend architecture from agent-architect
- Communicates API requirements from UX
- Agrees on frontend framework

---

#### 4. agent-design-verification (Technical Lead)
**File:** `agents/agent-design-verification.md`
**Model:** Sonnet
**Tools:** Read, Write, Grep, Glob, TodoWrite
**Phase:** 3
**Input:** `.octocode/requirements/`, `.octocode/designs/`, `.octocode/ux/`
**Output:** `.octocode/tasks.md`

**Key Responsibilities:**
- Requirements coverage validation
- Architecture soundness review
- Task breakdown creation
- File conflict detection

**Task Format:**
```markdown
- [ ] Task 1.1: Setup Next.js
      Files: [package.json, tsconfig.json]
      Complexity: low
      Estimated: 15min
      [can-run-parallel-with: 1.2]
```

**File Conflict Detection Algorithm:**
```
For each task pair (task_i, task_j):
  files_i = task_i.files
  files_j = task_j.files

  if intersection(files_i, files_j) is not empty:
    mark task_j as [blocked-by: task_i]
  else:
    mark task_j as [can-run-parallel-with: task_i]
```

---

#### 5. agent-research-context (Research Specialist)
**File:** `agents/agent-research-context.md`
**Model:** Sonnet
**Tools:** Read, Write, TodoWrite, octocode-mcp (PRIMARY)
**Phase:** 4 (can overlap with Phase 3)
**Input:** `.octocode/designs/`, `.octocode/tasks.md`
**Output:** `.octocode/context/*.md`

**Key Responsibilities:**
- GitHub research for implementation patterns
- Code example extraction
- Anti-pattern documentation
- Context guide creation

**Research Process:**
1. Identify research topics from designs
2. Parallel repository search (5-10 repos per topic, >500 stars)
3. Analyze structures
4. Extract code examples (50-100 lines)
5. Document patterns

**Context Guide Format:**
```markdown
# [Topic] Patterns

## Research Sources
- owner/repo (15K stars, 2025-09)

## Pattern 1: [Name]
### Implementation Example
```typescript
[Code example]
```
### Key Learnings
- Point 1
### When to Use
- Use case 1
### Tradeoffs
**Pros:** ...
**Cons:** ...
```

---

#### 6. agent-manager (Engineering Manager)
**File:** `agents/agent-manager.md`
**Model:** Sonnet
**Tools:** Read, Write, TodoWrite, Bash, Task
**Phase:** 5 & 6
**Input:** `.octocode/tasks.md`, `.octocode/context/`
**Output:** `.octocode/locks.json`, `.octocode/logs/progress-dashboard.md`

**Key Responsibilities:**
- Task dependency analysis
- File lock management (atomic)
- Agent spawning and orchestration
- Progress tracking

**File Lock Management:**

```typescript
interface Lock {
  lockedBy: string;      // agent-implementation-N
  taskId: string;        // "3.1"
  acquiredAt: string;    // ISO timestamp
  expiresAt: string;     // ISO timestamp (5 min default)
}

interface LocksFile {
  locks: Record<string, Lock>;
  lockHistory: Lock[];
}

class LockManager {
  acquireLock(agentId: string, files: string[]): boolean {
    // Atomic operation: lock ALL files or NONE
    if (all files available) {
      lock all files atomically
      return true
    }
    return false
  }

  releaseLock(agentId: string): void {
    // Release ALL locks for this agent
    move locks to lockHistory
    notify waiting agents
  }

  detectStaleLocks(): void {
    // Check for locks older than 5 minutes
    for (lock in locks) {
      if (lock age > 5 min) {
        if (agent still active) extend lock
        else release lock and reassign task
      }
    }
  }
}
```

**Agent Spawning:**
```typescript
for (let i = 1; i <= 4; i++) {
  Task({
    description: `Implementation agent ${i}`,
    prompt: `
      You are agent-implementation-${i}.
      Follow the implementation protocol:
      1. Request locks from agent-manager
      2. Wait for GRANTED
      3. Implement task
      4. Self-test
      5. Report completion
    `,
    subagent_type: "agent-implementation"
  })
}
```

---

#### 7. agent-implementation (Software Engineer)
**File:** `agents/agent-implementation.md`
**Model:** Sonnet
**Tools:** Read, Write, Edit, Bash, Grep, Glob, TodoWrite, octocode-mcp (optional)
**Phase:** 6 (4-5 instances in parallel)
**Input:** Task assignment, `.octocode/designs/`, `.octocode/context/`
**Output:** Production code with tests

**Key Responsibilities:**
- Feature implementation
- File lock protocol compliance
- Self-testing
- Quality checklist enforcement

**Implementation Protocol:**
```
1. Receive task assignment from agent-manager
2. Request file locks: [file1, file2, ...]
3. Wait for agent-manager response:
   - GRANTED → proceed
   - WAIT → retry after 5s (max 30s)
   - TIMEOUT → request different task
4. Study context:
   - Read design docs
   - Study context guides
   - Check existing codebase
5. Implement solution:
   - Follow design patterns
   - TypeScript strict types
   - Proper error handling
   - Write tests
6. Self-test:
   - Run unit tests
   - Run integration tests
   - Run linting
   - Fix auto-fixable issues
7. Report completion to agent-manager:
   - Duration
   - Files modified
   - Tests added
8. Agent-manager releases locks
9. Receive next task assignment
```

**Quality Standards:**
- No `any` types
- All functions have tests
- Linting passes
- Error handling present
- Follows existing code style

---

#### 8. agent-verification (QA Engineer)
**File:** `agents/agent-verification.md`
**Model:** Sonnet
**Tools:** Read, Bash, Grep, Glob, TodoWrite, chrome-devtools-mcp
**Phase:** 7
**Input:** Complete codebase, all requirements/designs
**Output:** `.octocode/verification-report.md`

**Key Responsibilities:**
- Build, lint, test verification
- Feature coverage validation
- Static code analysis
- Production readiness checks
- Runtime testing in Chrome

**Verification Checklist:**

```yaml
Build:
  - npm run build (no errors)
  - Output files generated
  - No critical warnings

Linting:
  - npm run lint (no critical errors)
  - Code style consistent

Tests:
  - Unit tests: all passing
  - Integration tests: all passing
  - E2E tests: all passing
  - Coverage: meets requirements (80%+)

Feature Verification:
  - For each must-have feature:
    - UI component exists
    - API endpoint exists
    - Database table exists
    - Tests cover feature
    - Error handling present

Static Code Analysis:
  - TypeScript strict mode: enabled
  - No @ts-ignore without justification
  - Function length: <100 lines
  - Nesting depth: <5 levels
  - No circular dependencies
  - No unused dependencies

Production Readiness:
  - Environment variables documented (.env.example)
  - Logging configured
  - Error tracking setup
  - Database migrations ready
  - Health check endpoints
  - Rate limiting implemented
  - Security headers configured
  - CI/CD pipeline exists
  - No hardcoded secrets

Runtime Testing (Chrome):
  - Development server starts
  - Application loads in Chrome
  - No console errors
  - All network requests succeed
  - UI renders correctly
  - Interactions work (forms, buttons)
  - Performance metrics (LCP <2.5s, FID <100ms, CLS <0.1)
```

**Report Format:**
```markdown
# Verification Report

**Status:** ✅ PASSED / ⚠️ PASSED WITH WARNINGS / ❌ FAILED

## Summary
[Table of all checks]

## Critical Issues
[Must-fix issues]

## Warnings
[Should-fix issues]

## Next Steps
[Recommendations]
```

---

## Agent Invocation & Task Tool

### The Task Tool

Agents are spawned using the `Task` tool available in Claude Code:

```typescript
Task({
  description: "Brief description",
  prompt: "Detailed instructions for the agent",
  subagent_type: "agent-name"
})
```

### Parallel Agent Invocation

**Phase 2 Example (Architecture + UX in Parallel):**
```typescript
// Single message with multiple Task calls
[
  Task({
    description: "Backend architecture design",
    prompt: `
      You are agent-architect.
      Read: .octocode/requirements/
      Output: .octocode/designs/

      Follow the critical thinking framework:
      1. Self-question assumptions
      2. Research similar projects (>1000 stars)
      3. Evaluate 3+ alternatives per decision
      4. Play devil's advocate
      5. Document all decisions

      Coordinate with agent-ux on:
      - Frontend framework selection
      - API requirements
      - Real-time data strategy
    `,
    subagent_type: "agent-architect"
  }),

  Task({
    description: "Frontend architecture and UX design",
    prompt: `
      You are agent-ux.
      Read: .octocode/requirements/, .octocode/designs/architecture.md
      Output: .octocode/ux/

      Follow the UX critical thinking framework:
      1. User empathy analysis
      2. Problem definition
      3. Design alternatives (3+)
      4. Research UI patterns

      Coordinate with agent-architect on:
      - Communicate API requirements from UX
      - Agree on frontend framework
      - Align on real-time data strategy
    `,
    subagent_type: "agent-ux"
  })
]
```

### Sequential Agent Invocation

**Standard Phase Transition:**
```typescript
// Phase 1 completes
agent-product finishes → writes .octocode/requirements/

// Command orchestrator checks Gate 1
if (user_approves) {
  // Invoke Phase 2 agents in parallel
  Task({ ... agent-architect })
  Task({ ... agent-ux })
}
```

---

## Communication Protocol

### Message Format

Agents communicate by updating markdown files in `.octocode/debug/communication-log.md`:

```markdown
### [14:27:15] agent-implementation-2 → agent-architect
**Topic:** WebSocket vs Polling
**Context:** Task 3.5 - Real-time price feed
**Question:** Should we use WebSocket or polling for price updates?

### [14:28:00] agent-architect → agent-implementation-2
**Response:** WebSocket with polling fallback
**Reasoning:** WebSocket for live updates, polling every 30s as fallback
**Updated:** .octocode/designs/api-design.md
```

### Communication Routing Table

| From Agent | Question Type | Route To | Response Time |
|------------|---------------|----------|---------------|
| agent-implementation | Requirements | agent-product | Immediate |
| agent-implementation | Backend/API | agent-architect | Immediate |
| agent-implementation | Frontend/UX | agent-ux | Immediate |
| agent-architect | Requirements | agent-product | Immediate |
| agent-architect | UX coordination | agent-ux | Immediate |
| agent-ux | Backend coordination | agent-architect | Immediate |
| agent-design-verification | Requirements | agent-product | Immediate |
| agent-design-verification | Design issues | agent-architect | Immediate |
| agent-manager | Any | Relevant agent | Immediate |
| agent-verification | Critical issues | agent-manager | Immediate |

### Implementation

Agents read from and write to the communication log:

```typescript
// Agent reads communication log
const log = await Read('.octocode/debug/communication-log.md')
const messagesForMe = parseMessages(log).filter(m => m.to === myAgentId)

// Agent writes to communication log
await Write('.octocode/debug/communication-log.md', `
### [${timestamp}] ${myAgentId} → ${targetAgent}
**Topic:** ${topic}
**Message:** ${message}
`, { append: true })
```

---

## File Locking Implementation

### Lock File Structure

**File:** `.octocode/locks.json`

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
    "src/api/routes.ts": {
      "lockedBy": "agent-implementation-2",
      "taskId": "3.2",
      "acquiredAt": "2025-10-12T14:30:05Z",
      "expiresAt": "2025-10-12T14:35:05Z"
    }
  },
  "lockHistory": [
    {
      "file": "package.json",
      "lockedBy": "agent-implementation-1",
      "taskId": "1.1",
      "acquiredAt": "2025-10-12T14:10:00Z",
      "releasedAt": "2025-10-12T14:12:00Z",
      "duration": "2m"
    }
  ]
}
```

### Lock Protocol

#### Acquire Lock Request
```typescript
// Agent requests locks
const request = {
  agentId: "agent-implementation-3",
  taskId: "3.3",
  files: ["src/auth/auth.ts", "src/types/user.ts"]
}

// Agent-manager processes request
function acquireLock(request: LockRequest): LockResponse {
  const locks = readLocks()

  // Check if ALL files are available
  for (const file of request.files) {
    if (locks[file] !== undefined) {
      return {
        status: "WAIT",
        message: `${file} locked by ${locks[file].lockedBy}`,
        estimatedWait: calculateWaitTime(locks[file])
      }
    }
  }

  // Atomic lock: ALL files or NONE
  const timestamp = new Date().toISOString()
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

  for (const file of request.files) {
    locks[file] = {
      lockedBy: request.agentId,
      taskId: request.taskId,
      acquiredAt: timestamp,
      expiresAt: expiresAt
    }
  }

  writeLocks(locks)

  return {
    status: "GRANTED",
    files: request.files
  }
}
```

#### Release Lock
```typescript
// Agent completes task
const completion = {
  agentId: "agent-implementation-1",
  taskId: "3.1",
  status: "completed"
}

// Agent-manager releases locks
function releaseLock(agentId: string): void {
  const locks = readLocks()
  const history = readLockHistory()

  // Find all locks held by this agent
  for (const [file, lock] of Object.entries(locks)) {
    if (lock.lockedBy === agentId) {
      // Move to history
      history.push({
        file,
        ...lock,
        releasedAt: new Date().toISOString(),
        duration: calculateDuration(lock.acquiredAt)
      })

      // Remove from active locks
      delete locks[file]
    }
  }

  writeLocks(locks)
  writeLockHistory(history)

  // Notify waiting agents
  notifyWaitingAgents(filesReleased)
}
```

#### Stale Lock Detection
```typescript
function detectAndHandleStaleLocks(): void {
  const locks = readLocks()
  const now = new Date()

  for (const [file, lock] of Object.entries(locks)) {
    const lockAge = now - new Date(lock.acquiredAt)

    if (lockAge > 5 * 60 * 1000) { // 5 minutes
      // Check if agent is still active
      if (isAgentActive(lock.lockedBy)) {
        // Extend lock
        lock.expiresAt = new Date(now + 5 * 60 * 1000).toISOString()
      } else {
        // Agent crashed - release lock
        console.log(`Releasing stale lock on ${file} from ${lock.lockedBy}`)
        delete locks[file]
        // Reassign task
        reassignTask(lock.taskId)
      }
    }
  }

  writeLocks(locks)
}

// Run every 30 seconds
setInterval(detectAndHandleStaleLocks, 30000)
```

---

## State Management

### Execution State File

**File:** `.octocode/execution-state.json`

```json
{
  "version": "1.0",
  "sessionId": "uuid-v4-here",
  "timestamp": "2025-10-12T14:30:00Z",
  "currentPhase": "implementation",
  "phaseStatus": {
    "requirements": "completed",
    "architecture": "completed",
    "validation": "completed",
    "research": "completed",
    "orchestration": "completed",
    "implementation": "in-progress",
    "verification": "pending"
  },
  "tasks": {
    "total": 35,
    "completed": 23,
    "inProgress": 3,
    "pending": 9
  },
  "completedTasks": ["1.1", "1.2", "1.3", "..."],
  "activeTasks": {
    "3.1": {
      "agentId": "agent-implementation-1",
      "startedAt": "2025-10-12T14:28:00Z",
      "lockedFiles": ["src/api/portfolio.ts"]
    },
    "3.2": {
      "agentId": "agent-implementation-2",
      "startedAt": "2025-10-12T14:28:05Z",
      "lockedFiles": ["src/components/AlertList.tsx"]
    },
    "3.3": {
      "agentId": "agent-implementation-3",
      "startedAt": "2025-10-12T14:29:00Z",
      "lockedFiles": ["src/components/Chart.tsx"]
    }
  },
  "lastCheckpoint": "2025-10-12T14:30:00Z"
}
```

### Atomic State Updates

```typescript
function updateExecutionState(update: Partial<ExecutionState>): void {
  // 1. Read current state
  const state = readState('.octocode/execution-state.json')

  // 2. Apply updates
  const newState = { ...state, ...update, timestamp: new Date().toISOString() }

  // 3. Write to temporary file
  writeState('.octocode/execution-state.tmp.json', newState)

  // 4. Verify JSON is valid
  const verification = readState('.octocode/execution-state.tmp.json')
  if (!verification) {
    throw new Error('State verification failed')
  }

  // 5. Atomic rename (atomic operation at OS level)
  rename('.octocode/execution-state.tmp.json', '.octocode/execution-state.json')

  // 6. Backup previous state
  backup('.octocode/execution-state.json', '.octocode/backups/execution-state-${timestamp}.json')
}
```

### Resume Functionality

```typescript
function resumeSession(): void {
  // 1. Load state
  const state = readState('.octocode/execution-state.json')

  if (!state) {
    throw new Error('No session to resume')
  }

  console.log(`Resuming session ${state.sessionId}`)
  console.log(`Current phase: ${state.currentPhase}`)
  console.log(`Progress: ${state.tasks.completed}/${state.tasks.total} tasks`)

  // 2. Determine resume point
  switch (state.currentPhase) {
    case 'requirements':
      if (state.phaseStatus.requirements === 'completed') {
        startPhase2()
      } else {
        resumePhase1()
      }
      break

    case 'implementation':
      // Resume with active tasks
      resumeImplementation(state.activeTasks)
      break

    // ... handle other phases
  }
}
```

---

## Directory Structure

### Generated Directory Layout

```
.octocode/
├── requirements/           # Phase 1 output
│   ├── prd.md
│   ├── user-stories.md
│   ├── features.md
│   ├── error-handling.md
│   └── performance.md
│
├── designs/                # Phase 2A output (agent-architect)
│   ├── architecture.md
│   ├── tech-stack.md
│   ├── component-structure.md
│   ├── api-design.md
│   ├── database-schema.md
│   ├── data-flow.md
│   ├── auth-strategy.md
│   ├── testing-strategy.md
│   ├── deployment.md
│   └── tradeoffs.md
│
├── ux/                     # Phase 2B output (agent-ux)
│   ├── user-flows.md
│   ├── wireframes.md
│   ├── component-library.md
│   ├── design-system.md
│   ├── interaction-patterns.md
│   ├── accessibility.md
│   ├── responsive-design.md
│   └── frontend-architecture.md
│
├── context/                # Phase 4 output (agent-research-context)
│   ├── nextjs-realtime-patterns.md
│   ├── trpc-prisma-integration.md
│   ├── redis-caching-strategies.md
│   ├── websocket-patterns.md
│   ├── authentication-patterns.md
│   └── testing-patterns.md
│
├── logs/                   # Runtime logs
│   ├── progress-dashboard.md
│   └── issues-log.md
│
├── debug/                  # Observability
│   ├── agent-decisions.json
│   ├── communication-log.md
│   ├── research-queries.json
│   └── phase-timeline.json
│
├── backups/                # State backups
│   └── execution-state-*.json
│
├── tasks.md                # Phase 3 output (agent-design-verification)
├── locks.json              # Phase 5/6 (agent-manager)
├── execution-state.json    # State management
└── verification-report.md  # Phase 7 output (agent-verification)
```

---

## Agent Implementation Details

### Agent Prompt Engineering

Each agent's markdown file contains highly specific instructions:

**Structure:**
1. **Role Definition** - Clear identity and purpose
2. **Inputs** - What files to read
3. **Outputs** - What files to create
4. **Tools Usage** - How to use each tool
5. **Process** - Step-by-step workflow
6. **Quality Standards** - What "done" looks like
7. **Communication** - How to interact with other agents
8. **Examples** - Concrete examples of expected output

**Example: agent-architect.md excerpt**
```markdown
## Critical Thinking Framework

Before designing ANYTHING, ask yourself:

1. **Self-Questions**
   - What am I trying to optimize for?
   - What are the critical constraints?
   - What assumptions am I making?
   - What questions need answers?
   - What would make this decision wrong?

2. **Research Phase**
   Use octocode-mcp to:
   - Search GitHub for similar projects (>1000 stars)
   - Analyze tech stack patterns
   - Extract architecture patterns

3. **Alternative Evaluation**
   For EVERY major decision:
   - Minimum 3 alternatives
   - Score each (1-10) with justification
   - Document pros/cons

4. **Devil's Advocate**
   Challenge your own reasoning:
   - What could go wrong?
   - Why might this be the WRONG choice?
   - What am I missing?

5. **Decision Logging** (CRITICAL)
   Log to `.octocode/debug/agent-decisions.json`:
   ```json
   {
     "id": "decision-arch-001",
     "decision": {
       "area": "Database Selection",
       "chosen": "PostgreSQL + Prisma ORM",
       "alternatives": [...],
       "reasoning": "...",
       "researchLinks": [...],
       "confidence": 9
     }
   }
   ```
```

### Agent Resources

**agent-architect-resources.md:**
- Pre-curated list of 220+ GitHub repositories
- Organized by category (Frontend, Backend, Database, etc.)
- Stars, descriptions, use cases
- Loaded into agent context for faster research

**Purpose:**
- Speeds up research phase
- Provides curated starting points
- Ensures high-quality references
- Reduces API calls to octocode-mcp

---

## Extending the Plugin

### Adding a New Agent

1. **Create Agent File**
```markdown
# agents/agent-custom.md
---
name: agent-custom
description: Custom Agent - Does something specific
model: sonnet
tools:
  - Read
  - Write
  - Bash
---

# Your Agent Instructions
...
```

2. **Update Command Flow**

Edit `commands/octocode-generate.md` to invoke your agent:

```markdown
## Phase X: Custom Phase

Invoke agent-custom:
Task({
  description: "Custom agent task",
  prompt: `
    You are agent-custom.
    [Instructions]
  `,
  subagent_type: "agent-custom"
})
```

3. **Add State Tracking**

Update `execution-state.json` structure to include your phase:

```json
{
  "phaseStatus": {
    ...
    "custom": "pending"
  }
}
```

### Adding a New Phase

1. **Design Phase Flow**
   - Input requirements
   - Output artifacts
   - Dependencies (runs after which phase?)
   - Parallelization opportunities

2. **Update State Machine**

Add phase to command orchestrator:

```markdown
### Phase X: [Name]

**Input:** ...
**Output:** ...
**Agent:** agent-name

Invoke: Task({ ... })

**Gate X** (if needed): User approval
```

3. **Update Observability**

Add logging for your phase:
- Phase timeline entry
- Decision logs
- Communication logs

### Customizing Agents

**Modify Agent Instructions:**

Each agent's behavior is defined entirely in its markdown file. To customize:

1. Edit `agents/agent-[name].md`
2. Update instructions, examples, quality standards
3. No code changes needed - purely prompt engineering

**Example: Make agent-architect more verbose**

```markdown
## Communication Protocol

After EVERY decision, immediately communicate to relevant agents:

### To agent-ux
After choosing frontend framework:
```
🚨 URGENT: Framework Decision Made

I've selected [Framework] based on:
1. [Reason 1]
2. [Reason 2]

This impacts your UX design because:
- [Impact 1]
- [Impact 2]

Please confirm this aligns with your UX requirements.
```
```

---

## Performance Considerations

### Parallel Execution

**Phase 2 Parallelization:**
- Saves ~50% time (15 min vs 30 min sequential)
- Requires coordination messages
- Agents must handle async responses

**Phase 6 Parallelization:**
- 4-5 agents simultaneously
- Saves ~60% time (2-4 hours vs 6-8 hours sequential)
- File locking prevents conflicts
- Task queue managed by agent-manager

### Token Optimization

**Model Selection:**
- Opus ($15/$75 per M tokens) - Strategy/critical thinking only (3 agents)
- Sonnet ($3/$15 per M tokens) - Execution (5 agents)
- Estimated cost per full app: $20-50 depending on complexity

**Prompt Compression:**
- Context guides in Phase 4 reduce repetitive research
- Agent-architect-resources.md reduces MCP calls
- Task-specific prompts avoid unnecessary context

---

## Troubleshooting

### Common Issues

**Issue: Agent hangs waiting for lock**
- Check `.octocode/locks.json` for stale locks
- Run stale lock detection
- Check agent-manager logs

**Issue: Agent asks irrelevant questions**
- Review agent's input files (ensure previous phase completed)
- Check communication log for context
- Verify agent has access to required tools

**Issue: Gate not presenting to user**
- Check execution-state.json for phase status
- Verify gate logic in command orchestrator
- Ensure previous phase marked completed

**Issue: Resume fails**
- Verify execution-state.json is valid JSON
- Check for corrupted state (restore from backup)
- Ensure .octocode/ directory intact

---

## Contributing

### Development Workflow

1. **Fork Repository**
2. **Create Feature Branch**
3. **Make Changes**
   - Update agent markdown files
   - Update command orchestrator
   - Add tests (if applicable)
4. **Test Locally**
   - Install plugin in Claude Code
   - Run full workflow
   - Verify outputs
5. **Submit Pull Request**

### Testing

**Manual Testing:**
```bash
# In Claude Code
/plugin add /path/to/octocode-vibe-plugin
/restart
/octocode-generate Build a simple todo app
```

**Validate:**
- All phases complete
- All gates present
- Files generated correctly
- No agent errors

---

## References

- **Claude Code Plugin Documentation**: https://docs.claude.com/claude-code/plugins
- **MCP Documentation**: https://modelcontextprotocol.io
- **Task Tool Reference**: Claude Code internal documentation

---

**Last Updated:** October 13, 2025
**Plugin Version:** 1.0.0
**Maintainer:** Guy Bary (bgauryy@gmail.com)
