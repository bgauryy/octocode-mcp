# Octocode Vibe Workflow Guide

## Overview

This document explains the complete flow of the `/octocode-generate` command, how the 8 specialized agents work together, and how the system transforms your idea into production-ready code through a structured 7-phase workflow.

---

## Table of Contents

1. [Quick Summary](#quick-summary)
2. [The 7 Phases Explained](#the-7-phases-explained)
3. [The 8 Agents and Their Roles](#the-8-agents-and-their-roles)
4. [Flow Coherence Analysis](#flow-coherence-analysis)
5. [Human Gates (5 Approval Points)](#human-gates-5-approval-points)
6. [Agent Communication Protocol](#agent-communication-protocol)
7. [Observability System](#observability-system)
8. [File Locking System](#file-locking-system)
9. [State Persistence and Resume](#state-persistence-and-resume)
10. [Example Walkthrough](#example-walkthrough)
11. [Is This Good for Creating Applications?](#is-this-good-for-creating-applications)

---

## Quick Summary

**What happens when you run `/octocode-generate [your project idea]`:**

```
User Request → Requirements → Architecture & UX → Validation → Research →
Orchestration → Implementation → Verification → Production-Ready Code
```

**Timeline (estimated):**
- Traditional sequential: 8-12 hours
- Octocode Vibe parallel: 3-5 hours (50-60% faster)

**Key Innovation:** Phase 2 runs **agent-architect** and **agent-ux** in parallel, reducing development time and ensuring frontend-backend alignment from the start.

---

## The 7 Phases Explained

### Phase 1: Requirements Gathering (10-15 minutes)

**Agent:** `agent-product` (Opus model)

**What Happens:**
1. Agent introduces itself and asks clarifying questions about:
   - Target audience
   - Use cases
   - Technical constraints
   - Feature priorities (must-have vs nice-to-have)
   - Performance requirements
   - Error handling expectations
   - Success metrics

2. Uses **octocode-mcp** to research similar successful projects:
   - Searches GitHub for similar apps (>500 stars)
   - Analyzes feature sets
   - Studies common patterns
   - Validates assumptions with production evidence

3. Creates comprehensive documentation:
   - `prd.md` - Product Requirements Document
   - `user-stories.md` - User flows and scenarios
   - `features.md` - Detailed feature specifications
   - `error-handling.md` - Error scenarios
   - `performance.md` - Performance criteria

4. Logs all decisions to `.octocode/debug/agent-decisions.json`
5. Logs all user communications to `.octocode/debug/communication-log.md`

**Gate 1 - PRD Approval:**
User reviews and approves the requirements before proceeding to architecture.

**Output:** `.octocode/requirements/` with complete PRD

---

### Phase 2: Architecture & UX Design (15-20 minutes)

**CRITICAL: These agents run IN PARALLEL**

#### 2A: Backend Architecture
**Agent:** `agent-architect` (Opus model)

**What Happens:**
1. **Self-Questions** before making decisions:
   - What am I trying to optimize for?
   - What are the critical constraints?
   - What assumptions am I making?
   - What questions need answers?
   - What would make this decision wrong?

2. Uses **octocode-mcp** extensively to research:
   - Similar projects (>1000 stars)
   - Tech stack combinations in production
   - Database design patterns
   - API design patterns (REST vs GraphQL vs tRPC)
   - Authentication/authorization strategies
   - Caching and performance patterns
   - Testing strategies

3. **Critical Thinking Framework** for every major decision:
   - Evaluates minimum 3 alternatives
   - Plays devil's advocate against own choices
   - Documents reasoning with production evidence
   - Scores each option (1-10) with justification

4. Creates architecture documentation:
   - `architecture.md` - System architecture overview
   - `tech-stack.md` - Technology choices with rationale
   - `component-structure.md` - Module organization
   - `api-design.md` - API endpoints and contracts
   - `database-schema.md` - Database tables and relationships
   - `data-flow.md` - State management
   - `auth-strategy.md` - Authentication/authorization
   - `testing-strategy.md` - Test approach
   - `deployment.md` - Deployment and infrastructure
   - `tradeoffs.md` - Decisions and alternatives

5. **Coordinates with agent-ux** on:
   - Frontend framework selection
   - API contracts that meet UX needs
   - Real-time data strategy
   - Performance requirements

6. Logs decisions and research to `.octocode/debug/`

#### 2B: Frontend Architecture & UX
**Agent:** `agent-ux` (Opus model)

**What Happens:**
1. **User Empathy Phase** before designing:
   - Who are the users and what do they need?
   - What's their context and goals?
   - What assumptions am I making?
   - Is this design inclusive?

2. Uses **octocode-mcp** to research:
   - UI patterns in successful apps
   - Component library analysis
   - Design systems
   - Accessibility implementations
   - Responsive design strategies
   - Animation patterns

3. **UX Critical Thinking** for every design decision:
   - What problem does this UI solve?
   - Evaluates 3+ design alternatives
   - Tests accessibility for all users
   - Validates mobile-first approach
   - Considers error states and edge cases

4. Creates UX documentation:
   - `user-flows.md` - Complete user journeys
   - `wireframes.md` - ASCII wireframes for all screens
   - `component-library.md` - All UI components needed
   - `design-system.md` - Colors, typography, spacing
   - `interaction-patterns.md` - Micro-interactions
   - `accessibility.md` - WCAG 2.1 AA compliance plan
   - `responsive-design.md` - Breakpoints and mobile-first
   - `frontend-architecture.md` - Framework, state, routing

5. **Coordinates with agent-architect** on:
   - Communicates API requirements from UX
   - Agrees on frontend framework
   - Aligns on real-time data strategy
   - Ensures backend supports UX performance needs

6. Logs decisions and research to `.octocode/debug/`

**Gate 2 - Combined Architecture & UX Review:**
User reviews both backend architecture AND UX design together, ensuring alignment.

**Output:**
- `.octocode/designs/` with complete backend architecture
- `.octocode/ux/` with complete UX design

---

### Phase 3: Design Validation (5-10 minutes)

**Agent:** `agent-design-verification` (Sonnet model)

**What Happens:**
1. **Requirements Coverage Validation:**
   - Reads all PRD features
   - Verifies each feature is covered in designs
   - Checks performance criteria can be met
   - Validates error handling is comprehensive

2. **Architecture Soundness Validation:**
   - Tech stack choices are appropriate
   - Database schema supports all features
   - API design follows best practices
   - No missing critical components
   - Frontend-backend alignment verified

3. **Issue Detection and Resolution:**
   - If gaps found, communicates with relevant agents
   - `agent-product` for requirement issues
   - `agent-architect` for design issues
   - Loops until all issues resolved

4. **Task Breakdown Creation:**
   - Analyzes all work needed
   - Creates comprehensive task list (30-50 tasks typically)
   - Lists ALL files each task will modify
   - Detects file conflicts (multiple tasks need same file)
   - Identifies parallelization opportunities
   - Groups tasks into logical phases
   - Estimates complexity and time

5. Outputs `.octocode/tasks.md` with format:
```markdown
- [ ] Task 1.1: Setup Next.js
      Files: [package.json, tsconfig.json]
      Complexity: low
      Estimated: 15min
      [can-run-parallel-with: 1.2]

- [ ] Task 2.1: Implement auth
      Files: [src/auth/auth.ts]
      Complexity: medium
      Estimated: 45min

- [ ] Task 2.2: Add API routes
      Files: [src/api/routes.ts]
      Complexity: medium
      Estimated: 30min
      [can-run-parallel-with: 2.1] ✅

- [ ] Task 2.3: Implement logout
      Files: [src/auth/auth.ts]
      Complexity: low
      Estimated: 20min
      [blocked-by: 2.1] ⚠️ (both need auth.ts)
```

**Gate 3 - Task Breakdown Approval:**
User reviews the task breakdown, can adjust priorities or scope.

**Output:** `.octocode/tasks.md` with comprehensive task list

---

### Phase 4: Context Research (10-15 minutes, runs in parallel)

**Agent:** `agent-research-context` (Sonnet model)

**What Happens:**
1. **Identifies Research Topics** from design documents:
   - Framework-specific patterns
   - Integration patterns (e.g., "Prisma + tRPC integration")
   - Domain-specific patterns (e.g., "Stock price API integration")
   - Infrastructure patterns (e.g., "Redis caching strategies")
   - Testing patterns

2. **Uses octocode-mcp extensively** (this is the PRIMARY tool):
   - Searches for 5-10 high-quality repositories per topic (>500 stars)
   - Analyzes repository structures
   - Extracts actual code examples (50-100 lines)
   - Searches for specific patterns across GitHub
   - Identifies common pitfalls and anti-patterns

3. **Runs queries in parallel** for maximum efficiency:
   - Multiple research topics simultaneously
   - No sequential waiting

4. **Creates Context Guides** in `.octocode/context/`:
   - One guide per research topic
   - Each guide contains:
     - Research sources (repo links, stars, relevance)
     - Implementation examples (copy-paste ready code)
     - Key learnings and when to use
     - Tradeoffs (pros/cons)
     - Common pitfalls
     - Alternatives considered

5. Example guides:
   - `nextjs-realtime-patterns.md`
   - `trpc-prisma-integration.md`
   - `redis-caching-strategies.md`
   - `websocket-patterns.md`
   - `authentication-patterns.md`
   - `testing-patterns.md`

6. Logs all research queries to `.octocode/debug/research-queries.json`

**Output:** `.octocode/context/` with practical implementation guides

---

### Phase 5: Task Orchestration (2-5 minutes)

**Agent:** `agent-manager` (Sonnet model)

**What Happens:**
1. **Reads and Analyzes Tasks:**
   - Reads `.octocode/tasks.md`
   - Analyzes all dependencies (logical and file-based)
   - Creates execution plan

2. **File Dependency Analysis:**
```markdown
Example:
- Task 3.1: Files [auth.ts, types.ts]
- Task 3.2: Files [api.ts, routes.ts]
- Task 3.3: Files [auth.ts]

Analysis:
- 3.1 and 3.2: No shared files → CAN run in parallel ✅
- 3.1 and 3.3: Both need auth.ts → CANNOT run in parallel ❌
- Decision: Start 3.1 and 3.2 together, queue 3.3 for after 3.1
```

3. **File Lock System Setup:**
   - Creates `.octocode/locks.json`
   - Implements atomic file locking
   - Prevents multiple agents from modifying same file

4. **Spawns Implementation Agents:**
   - Launches 4-5 `agent-implementation` instances
   - Assigns initial tasks respecting dependencies
   - Monitors progress in real-time

5. **Creates Progress Dashboard:**
   - `.octocode/logs/progress-dashboard.md`
   - Updates every 10-30 seconds
   - Shows active agents, completed tasks, current locks

6. **State Persistence:**
   - Updates `.octocode/execution-state.json` after every task
   - Enables resume functionality

**Gate 4 - Live Monitoring:**
User can view live progress dashboard and pause/inspect/continue.

**Output:** Orchestrated implementation with real-time progress tracking

---

### Phase 6: Implementation (2-4 hours with parallel agents)

**Agent:** `agent-implementation` (Sonnet model, multiple instances)

**What Happens (per instance):**
1. **Receives Task Assignment** from agent-manager
2. **Requests File Locks:**
   - Lists all files needed
   - Waits for agent-manager to grant locks
   - If timeout (30s), requests different task

3. **Studies Context:**
   - Reads design documents (`.octocode/designs/`)
   - Studies context guides (`.octocode/context/`)
   - Reviews requirements (`.octocode/requirements/`)
   - Checks existing codebase for patterns

4. **Implements Solution:**
   - Follows design patterns from context guides
   - Uses TypeScript with strict types
   - Adds proper error handling
   - Writes tests for new code
   - Follows existing code style

5. **Self-Testing:**
   - Runs unit tests
   - Runs integration tests
   - Runs linting
   - Fixes auto-fixable issues
   - Must pass all checks before completion

6. **Asks Questions if Needed:**
   - Technical questions → `agent-architect`
   - Requirement clarifications → `agent-product`
   - UX questions → `agent-ux`
   - Can use **octocode-mcp** for additional code examples

7. **Reports Completion:**
   - Duration, files modified, tests added
   - Agent-manager releases locks
   - Agent-manager assigns next task

8. **Logs Implementation Decisions** to `.octocode/debug/`

**Parallelization:**
- Multiple instances work simultaneously
- File locks prevent conflicts
- Typical: 4-5 agents running in parallel
- Can complete 30-50 tasks in 2-4 hours

**Failure Handling:**
- If agent fails, agent-manager reassigns task
- If design issue, escalates to agent-architect
- If requirement unclear, escalates to agent-product

**Output:** Complete implementation with all features coded and tested

---

### Phase 7: Quality Assurance (30-60 minutes)

**Agent:** `agent-verification` (Sonnet model)

**What Happens:**
1. **Build Verification:**
   - Runs production build (`npm run build`)
   - Checks for errors and warnings
   - Verifies output files generated

2. **Lint Verification:**
   - Runs linting (`npm run lint`)
   - Reports critical errors
   - Auto-fixes if possible

3. **Test Verification:**
   - Runs all unit tests
   - Runs all integration tests
   - Runs E2E tests
   - Checks coverage against requirements

4. **Feature Verification (Critical):**
   - Reads every must-have feature from PRD
   - Verifies each feature is implemented
   - Checks UI components exist
   - Verifies API endpoints exist
   - Confirms database tables exist
   - Validates tests cover the feature
   - Checks error handling implemented

5. **Performance Verification:**
   - Tests against performance criteria from PRD
   - Page load times
   - API response times
   - Cache hit rates

6. **Static Code Analysis:**
   - TypeScript strict mode enforcement
   - Complexity analysis (function length, nesting depth)
   - Dead code detection
   - Dependency analysis (circular deps, unused deps)
   - Security scanning (hardcoded secrets, vulnerabilities)

7. **Production Readiness Verification:**
   - Environment variables documented
   - Logging and monitoring setup
   - Error tracking configured
   - Database migrations ready
   - Health check endpoints exist
   - Rate limiting implemented
   - Security headers configured
   - CI/CD pipeline exists
   - No hardcoded secrets

8. **Runtime Testing (Chrome DevTools):**
   - Uses **chrome-devtools-mcp**
   - Starts development server
   - Opens app in Chrome browser
   - Tests key user flows interactively
   - Monitors console for errors/warnings
   - Checks network requests
   - Verifies UI renders correctly
   - Tests interactions (forms, buttons, navigation)
   - Captures performance metrics (LCP, FID, CLS)
   - Documents any runtime errors found

9. **Creates Comprehensive Report:**
   - `.octocode/verification-report.md`
   - Summary of all checks
   - Feature verification status
   - Performance results
   - Critical issues (must fix)
   - Warnings (should fix)
   - Code quality score
   - Production readiness status
   - Runtime testing results
   - Next steps and recommendations

**Gate 5 - Final Approval:**
User reviews verification report and decides:
- Ship It (accept and deploy)
- Fix Critical Issues
- Iterate (add improvements)

**Output:** `.octocode/verification-report.md` with complete quality assessment

---

## The 8 Agents and Their Roles

### 1. agent-product (Product Manager) - Opus
- **When:** Phase 1
- **Tools:** Read, Write, WebSearch, TodoWrite, octocode-mcp
- **Key Responsibility:** Transform user's idea into comprehensive PRD
- **Innovation:** Research-driven requirements using GitHub analysis
- **Output:** `.octocode/requirements/`

### 2. agent-architect (Solution Architect) - Opus
- **When:** Phase 2 (runs in parallel with agent-ux)
- **Tools:** Read, Write, Grep, Glob, TodoWrite, octocode-mcp, WebSearch
- **Key Responsibility:** Design backend architecture with critical thinking
- **Innovation:** Self-questioning framework, devil's advocate, 3+ alternatives
- **Output:** `.octocode/designs/`

### 3. agent-ux (UX Engineer) - Opus
- **When:** Phase 2 (runs in parallel with agent-architect)
- **Tools:** Read, Write, WebSearch, WebFetch, TodoWrite, octocode-mcp
- **Key Responsibility:** Design frontend architecture and UX
- **Innovation:** User-centric critical thinking, accessibility-first
- **Output:** `.octocode/ux/`

### 4. agent-design-verification (Technical Lead) - Sonnet
- **When:** Phase 3
- **Tools:** Read, Write, Grep, Glob, TodoWrite
- **Key Responsibility:** Validate designs and create task breakdown
- **Innovation:** File conflict detection for safe parallelization
- **Output:** `.octocode/tasks.md`

### 5. agent-research-context (Research Specialist) - Sonnet
- **When:** Phase 4 (can run in parallel)
- **Tools:** Read, Write, TodoWrite, octocode-mcp (primary tool)
- **Key Responsibility:** Gather implementation patterns from GitHub
- **Innovation:** Copy-paste ready code examples from production apps
- **Output:** `.octocode/context/`

### 6. agent-manager (Engineering Manager) - Sonnet
- **When:** Phase 5 & 6
- **Tools:** Read, Write, TodoWrite, Bash, Task
- **Key Responsibility:** Orchestrate parallel implementation
- **Innovation:** Atomic file locking prevents conflicts
- **Output:** Task coordination and progress tracking

### 7. agent-implementation (Software Engineer) - Sonnet
- **When:** Phase 6 (4-5 instances in parallel)
- **Tools:** Read, Write, Edit, Bash, Grep, Glob, TodoWrite, octocode-mcp (optional)
- **Key Responsibility:** Implement features following designs
- **Innovation:** File lock protocol, self-testing requirement
- **Output:** Production code with tests

### 8. agent-verification (QA Engineer) - Sonnet
- **When:** Phase 7
- **Tools:** Read, Bash, Grep, Glob, TodoWrite, chrome-devtools-mcp
- **Key Responsibility:** Comprehensive quality assurance
- **Innovation:** Runtime testing in Chrome browser, static analysis
- **Output:** `.octocode/verification-report.md`

---

## Flow Coherence Analysis

### ✅ Is the flow coherent?

**YES, HIGHLY COHERENT.** Here's why:

#### 1. Logical Progression
Each phase builds naturally on the previous:
```
Idea → Requirements → Design → Validation → Research →
Implementation → Verification
```

#### 2. Proper Information Flow
- **Phase 1** gathers user needs → feeds into
- **Phase 2** which creates technical design → feeds into
- **Phase 3** which validates and creates tasks → feeds into
- **Phase 4** which provides implementation patterns → feeds into
- **Phase 5 & 6** which implement the solution → feeds into
- **Phase 7** which verifies against original requirements

#### 3. Human Approval Gates
- Placed at critical decision points
- Prevents wasted work on wrong direction
- User stays informed and in control

#### 4. Parallel Execution Where Possible
- Phase 2: Architecture + UX in parallel (50% time savings)
- Phase 4: Research can run while validation happens
- Phase 6: Multiple implementation agents in parallel

#### 5. Agent Communication
- Agents can ask each other questions
- Questions routed to the right expert
- All communication logged for observability

#### 6. Error Handling
- File locks prevent conflicts
- Failures are caught and reassigned
- Issues escalated to appropriate agents
- System recovers gracefully

#### 7. Observability
- Every decision logged with reasoning
- All research queries documented
- Agent communications tracked
- Complete audit trail

#### 8. State Persistence
- Checkpoints after every phase and task
- Can resume if interrupted
- State always consistent

#### 9. Realistic Expectations
- Uses Sonnet for execution (cost-effective)
- Uses Opus only for critical thinking (strategy)
- Acknowledges limitations (no perfect code)
- Focuses on production-ready, not perfect

---

## Human Gates (5 Approval Points)

### Gate 1: PRD Approval (After Phase 1)
**When:** After requirements gathering
**Reviews:**
- Product Requirements Document
- User stories and flows
- Feature list (must-have vs nice-to-have)
- Success metrics

**User Options:**
1. ✅ Approve - Continue to architecture
2. 📝 Modify - Request requirement changes
3. ❓ Ask Questions - Clarify specific points
4. 📖 Review Documents - Read full PRD

**Why Important:** Ensures everyone agrees on WHAT to build

---

### Gate 2: Architecture & UX Approval (After Phase 2)
**When:** After both architecture and UX design complete
**Reviews:**
- Backend architecture and tech stack
- Database schema and API design
- UX design and component library
- Design system and interaction patterns
- Frontend-backend alignment

**User Options:**
1. ✅ Approve - Continue to validation
2. 📝 Modify Backend - Request architecture changes
3. 🎨 Modify UX - Request UX changes
4. ❓ Ask Questions - Clarify decisions
5. 🔄 Alternative - Request different approach
6. 📖 Review Documents - Read full designs

**Why Important:** Ensures everyone agrees on HOW to build it

---

### Gate 3: Task Breakdown Approval (After Phase 3)
**When:** After design validation
**Reviews:**
- Complete task breakdown (30-50 tasks)
- Time estimates and complexity
- Parallelization strategy
- All PRD features covered

**User Options:**
1. ✅ Approve - Start implementation
2. 📝 Modify Priorities - Change task order
3. ⏱️ Adjust Scope - Add/remove tasks
4. 🔍 Review Tasks - See detailed list
5. 💡 Optimize - Ask for more parallelization
6. ❓ Ask Questions

**Why Important:** Ensures execution plan is agreed upon

---

### Gate 4: Live Monitoring (During Phase 6)
**When:** Throughout implementation
**Reviews:**
- Real-time progress dashboard
- Active agents and current tasks
- Completed vs pending tasks
- Any issues or failures

**User Options:**
1. ⏸️ Pause - Stop all agents, save state
2. 📊 Details - See detailed task status
3. 🔍 Inspect - View specific agent's work
4. ⚠️ Issues - Review recent errors
5. 🔄 Continue - Keep monitoring
6. 🛑 Stop - Graceful shutdown

**Why Important:** User stays informed, can intervene if needed

---

### Gate 5: Final Approval (After Phase 7)
**When:** After quality verification
**Reviews:**
- Verification report with all checks
- Feature verification status
- Performance results
- Critical issues (if any)
- Production readiness

**User Options:**
1. 🚀 Ship It - Accept and deploy
2. 🔧 Fix Critical Issues - Address must-fix items
3. 🔄 Iterate - Add improvements
4. 📖 Review Report - See full details
5. ❓ Ask Questions

**Why Important:** Final sign-off before deployment

---

## Agent Communication Protocol

### Why Communication Matters
Agents need to ask each other questions during the workflow to resolve ambiguities and coordinate decisions.

### Communication Routing

**Requirements Questions** → `agent-product`
```markdown
Example:
agent-implementation-2 → agent-product
Q: "What should happen if user's API key is invalid?"
A: "Show error: 'Invalid API key. Please check settings.' Allow cached data."
```

**Backend/API Technical Questions** → `agent-architect`
```markdown
Example:
agent-implementation-2 → agent-architect
Q: "Should we use WebSocket or polling for price updates?"
A: "WebSocket with fallback to polling. WebSocket for live, polling every 30s as fallback."
```

**Frontend/UX Questions** → `agent-ux`
```markdown
Example:
agent-implementation-3 → agent-ux
Q: "How should loading state look for the dashboard?"
A: "Use skeleton screens (see wireframes.md section 4.2)"
```

**Phase 2 Coordination** → `agent-architect` ↔ `agent-ux`
```markdown
Example:
agent-architect → agent-ux
"I recommend Next.js 14 with App Router. Your input?"

agent-ux → agent-architect
"Agreed on Next.js. API Requirements: /api/dashboard/summary, real-time via WebSocket"

agent-architect → agent-ux
"Confirmed: Using tRPC subscriptions for real-time. Updated api-design.md"
```

### Communication Logging
All communications logged to `.octocode/debug/communication-log.md`:
```markdown
### [14:27:15] agent-implementation-2 → agent-architect
**Q:** "Should we use WebSocket or polling?"
**Context:** Task 3.5 - Implementing real-time price feed
**A:** "WebSocket with polling fallback"
**Updated:** .octocode/designs/api-design.md
```

---

## Observability System

### 1. Decision Logging
**File:** `.octocode/debug/agent-decisions.json`

Every architectural or implementation decision is logged with:
- Decision area (e.g., "Database Selection")
- Chosen option
- Alternatives considered with scores
- Reasoning (based on evidence, not popularity)
- Research links (which repos influenced this)
- Confidence level (1-10)

**Example:**
```json
{
  "id": "decision-arch-001",
  "agent": "agent-architect",
  "phase": "architecture",
  "decision": {
    "area": "Database Selection",
    "chosen": "PostgreSQL + Prisma ORM",
    "alternatives": [
      {
        "option": "MongoDB + Mongoose",
        "score": 6,
        "reasoning": "Flexible schema but no ACID for complex queries"
      },
      {
        "option": "Supabase",
        "score": 7,
        "reasoning": "Managed PostgreSQL but vendor lock-in"
      }
    ],
    "reasoning": "PostgreSQL chosen for ACID guarantees needed for financial data",
    "researchLinks": [
      {
        "repo": "maybe-finance/maybe",
        "finding": "All major finance apps use PostgreSQL"
      }
    ],
    "confidence": 9
  }
}
```

### 2. Communication Logging
**File:** `.octocode/debug/communication-log.md`

All agent-to-agent and agent-to-user communications logged:
```markdown
### [14:15:32] agent-architect → agent-ux
**Topic:** Frontend Framework Recommendation
**Message:** I recommend Next.js 14 with App Router. Your input?

### [14:16:00] agent-ux → agent-architect
**Response:** Agreed on Next.js
**API Requirements:** ...
```

### 3. Research Logging
**File:** `.octocode/debug/research-queries.json`

All octocode-mcp research queries logged with:
- Query parameters
- Repositories found
- Key takeaways
- Which decisions this influenced

**Example:**
```json
{
  "id": "research-001",
  "agent": "agent-architect",
  "query": {
    "tool": "octocode-mcp repository search",
    "parameters": {
      "keywords": ["portfolio", "tracker"],
      "stars": ">1000"
    },
    "reasoning": "Understanding architectural patterns"
  },
  "results": {
    "repositoriesFound": 12,
    "topResults": [
      {
        "repo": "maybe-finance/maybe",
        "stars": 15234,
        "techStack": "Next.js, PostgreSQL, Prisma, tRPC"
      }
    ],
    "keyTakeaways": [
      "tRPC is standard for type-safe APIs in finance apps"
    ],
    "influencedDecisions": ["decision-arch-001"]
  }
}
```

### 4. Timeline Logging
**File:** `.octocode/debug/phase-timeline.json`

Tracks time spent in each phase:
```json
{
  "phases": [
    {
      "name": "Phase 1: Requirements",
      "startedAt": "14:00:00",
      "completedAt": "14:10:00",
      "duration": "10m 0s",
      "agent": "agent-product",
      "decisions": 5
    }
  ]
}
```

---

## File Locking System

### Why File Locking?
When multiple `agent-implementation` instances run in parallel, they could modify the same file simultaneously, causing conflicts. The file locking system prevents this.

### How It Works

#### 1. Lock File
**File:** `.octocode/locks.json`
```json
{
  "locks": {
    "src/auth/auth.ts": {
      "lockedBy": "agent-implementation-1",
      "taskId": "3.1",
      "acquiredAt": "2025-10-12T14:30:00Z",
      "expiresAt": "2025-10-12T14:35:00Z"
    }
  }
}
```

#### 2. Lock Request Protocol
```
agent-implementation-2 wants to work on Task 3.3

Task 3.3 needs files: [src/auth/auth.ts, src/types/user.ts]

agent-implementation-2 → agent-manager:
  "Request lock for [auth.ts, types.ts]"

agent-manager checks locks.json:
  - auth.ts: LOCKED by agent-implementation-1
  - types.ts: Available

agent-manager → agent-implementation-2:
  "WAIT - auth.ts locked by agent-implementation-1"
  "Estimated: 2 minutes remaining"

agent-implementation-2:
  Waits or requests different task
```

#### 3. Lock Grant (Atomic)
```
ALL requested files must be available
Lock ALL files atomically (all or nothing)
Update locks.json
Respond to agent: "GRANTED"
```

#### 4. Lock Release
```
Task completes

agent-implementation-1 → agent-manager:
  "Task 3.1 completed"

agent-manager:
  - Releases ALL locks for agent-implementation-1
  - Moves locks to lockHistory
  - Notifies waiting agents
  - Assigns next task to agent-implementation-1
```

#### 5. Stale Lock Detection
```
Check for locks older than 5 minutes
If agent still active: Extend lock
If agent crashed: Release lock, reassign task
```

### Example Scenario
```
Tasks:
- Task 3.1: Files [auth.ts, types.ts]
- Task 3.2: Files [api.ts, routes.ts]
- Task 3.3: Files [auth.ts]

Timeline:
14:30:00 - agent-implementation-1 requests lock for 3.1 → GRANTED
14:30:00 - agent-implementation-2 requests lock for 3.2 → GRANTED (different files)
14:30:05 - agent-implementation-3 requests lock for 3.3 → WAIT (auth.ts locked)
14:35:00 - agent-implementation-1 completes 3.1 → Releases locks
14:35:05 - agent-implementation-3 requests lock for 3.3 → GRANTED (now available)
```

---

## State Persistence and Resume

### State File
**File:** `.octocode/execution-state.json`

Updated after EVERY phase and task completion:
```json
{
  "sessionId": "uuid-v4",
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
  "completedTasks": ["1.1", "1.2", "..."],
  "lastCheckpoint": "2025-10-12T14:30:00Z"
}
```

### Resume Functionality
```bash
# If interrupted, resume with:
/octocode-generate --resume

# System will:
1. Load .octocode/execution-state.json
2. Determine current phase
3. Load all previous work
4. Continue from last checkpoint
```

### Atomic Updates
```
1. Write to execution-state.tmp.json
2. Verify JSON is valid
3. Atomic rename to execution-state.json
4. Backup previous state
```

---

## Example Walkthrough

### User Request
```
/octocode-generate Build a stock portfolio tracker with real-time price updates,
multiple portfolios, price alerts, and performance charts. Use React and PostgreSQL.
```

### Phase 1: Requirements (10 min)
- agent-product asks clarifying questions
- Researches similar apps on GitHub (Robinhood, Personal Capital, etc.)
- Creates PRD with must-have features:
  1. User authentication (email + OAuth)
  2. Create/edit multiple portfolios
  3. Add/remove holdings
  4. Real-time price updates via WebSocket
  5. Price alert notifications
  6. Performance charts (line, pie)
  7. Transaction history
- **Gate 1:** User approves PRD ✅

### Phase 2: Architecture & UX (15 min, parallel)
**agent-architect:**
- Self-questions: Scale? Team? Constraints?
- Researches: Next.js + tRPC + Prisma apps (>1000 stars)
- Evaluates alternatives:
  - Option A: Next.js + tRPC (score 9)
  - Option B: Express + REST (score 7)
  - Option C: NestJS + GraphQL (score 6)
- Chooses: Next.js 14 + tRPC + Prisma + PostgreSQL
- Designs: API endpoints, DB schema, WebSocket strategy
- Creates: architecture.md, tech-stack.md, api-design.md, database-schema.md

**agent-ux (parallel):**
- User empathy: Traders need quick glance, clean UI
- Researches: Financial app UIs (Robinhood, Fidelity)
- Designs: Dashboard with large chart, card-based stats
- Creates: wireframes.md, component-library.md, design-system.md
- Coordinates with architect: "Need /api/dashboard/summary endpoint"

- **Gate 2:** User approves both architecture and UX ✅

### Phase 3: Validation (7 min)
- agent-design-verification validates all features covered
- Creates task breakdown: 35 tasks across 6 phases
- Identifies 18 tasks can run in parallel
- Detects file conflicts (tasks 2.1 and 2.3 both need auth.ts)
- **Gate 3:** User approves task breakdown ✅

### Phase 4: Research (12 min, parallel)
- agent-research-context researches:
  1. Next.js 14 App Router patterns
  2. tRPC + Prisma integration
  3. WebSocket real-time patterns
  4. Redis caching strategies
  5. Chart.js / Recharts patterns
  6. Authentication with NextAuth
- Finds copy-paste ready code examples from production apps
- Creates context guides in `.octocode/context/`

### Phase 5: Orchestration (3 min)
- agent-manager analyzes task dependencies
- Sets up file locking system
- Spawns 4 agent-implementation instances
- Assigns initial tasks:
  - agent-impl-1: Task 1.1 (Next.js setup)
  - agent-impl-2: Task 1.2 (Prisma setup)
  - agent-impl-3: Task 1.3 (TypeScript config)
  - agent-impl-4: Task 1.4 (Testing setup)
- **Gate 4:** User sees live dashboard

### Phase 6: Implementation (2.5 hours)
- 4 agents work in parallel
- Progress dashboard updates in real-time:
  - 10 min: Phase 1 complete (5/5 tasks) ✅
  - 30 min: Phase 2 complete (8/8 tasks) ✅
  - 60 min: Phase 3 in progress (9/12 tasks)
  - 90 min: Phase 3 complete, Phase 4 started
  - 120 min: Phase 4 complete (6/6 tasks) ✅
  - 150 min: Phase 5 & 6 complete (5/5 tasks) ✅
- One failure occurs: Task 3.7 (Redis timeout)
  - agent-manager reassigns to different agent
  - Retry succeeds
- All 35 tasks completed
- All tests passing

### Phase 7: Verification (35 min)
- agent-verification runs comprehensive checks:
  - ✅ Build passes
  - ✅ All tests pass (142 tests, 89% coverage)
  - ✅ Linting passes
  - ✅ All 7 must-have features verified
  - ✅ Performance criteria met (page load 1.3s)
  - ✅ Static analysis passes
  - ✅ Production readiness checks pass
  - ✅ Runtime testing in Chrome: No errors
- Creates verification report
- **Gate 5:** User reviews report and approves ✅

### Total Time: 3 hours 42 minutes
(Traditional sequential: 8-10 hours)

---

## Is This Good for Creating Applications?

### ✅ YES, EXCELLENT for:

#### 1. Full-Stack Web Applications
- CRUD apps with authentication
- Dashboards and admin panels
- E-commerce platforms
- SaaS products
- Financial applications
- Social networks

**Why:** Complete coverage from requirements to deployment, research-driven architecture, parallel execution speeds up development.

#### 2. Applications Requiring Best Practices
- Type safety (TypeScript)
- Testing (unit, integration, E2E)
- Accessibility (WCAG 2.1 AA)
- Performance optimization
- Security best practices

**Why:** agent-architect uses critical thinking framework, agent-ux ensures accessibility, agent-verification enforces quality standards.

#### 3. Projects with Clear Requirements
- MVP development
- Proof of concepts
- Internal tools
- Client projects with defined scope

**Why:** Gate-based workflow ensures alignment, prevents wasted work on wrong direction.

#### 4. Teams Wanting to Learn Best Practices
- Research-driven decisions with GitHub evidence
- Copy-paste ready code examples from production apps
- Complete observability (every decision documented)
- Learn why decisions were made

**Why:** All decisions logged with reasoning, research queries documented, alternatives explained.

### ⚠️ LIMITATIONS:

#### 1. Novel/Experimental Features
If building something truly novel without production examples on GitHub, the research phase provides less value (still works, but less guidance available).

#### 2. Non-Standard Tech Stacks
The system works best with popular tech stacks (React, Next.js, Node.js, PostgreSQL, etc.). Obscure technologies have fewer examples to research.

#### 3. Large Existing Codebases
System is optimized for new projects or greenfield features. Refactoring large legacy codebases requires more careful planning.

#### 4. Real-Time Collaboration Requirements
Gates require human approval, which adds time. Not ideal if you need code RIGHT NOW with zero review.

### 🎯 Ideal Use Cases:

1. **Startup MVP Development**
   - Get production-ready code in 3-5 hours
   - Research-driven architecture (avoid common pitfalls)
   - Comprehensive testing and quality

2. **Prototyping with Production Quality**
   - Not just a prototype - production-ready from start
   - Can ship to real users immediately
   - All best practices included

3. **Learning Platform**
   - Understand why decisions were made
   - Learn from production app examples
   - Study architecture patterns

4. **Client Projects**
   - Clear documentation at every phase
   - Human gates for client approval
   - Comprehensive verification report

### 💪 Key Strengths:

1. **Research-Driven Decisions**
   - Every tech choice backed by production evidence
   - Not popularity-based, requirement-based
   - Learn from apps with >1000 stars

2. **Critical Thinking Framework**
   - agent-architect questions own assumptions
   - Evaluates 3+ alternatives for every major decision
   - Plays devil's advocate
   - Documents reasoning

3. **Parallel Execution**
   - 50% faster than sequential (Phase 2 parallel)
   - Multiple implementation agents work simultaneously
   - Smart file locking prevents conflicts

4. **Comprehensive Observability**
   - Every decision logged with reasoning
   - All research queries documented
   - Agent communications tracked
   - Complete audit trail

5. **Production-Ready from Start**
   - Not just code - includes tests, linting, docs
   - Security best practices
   - Performance optimization
   - Deployment configuration
   - Runtime testing in actual browser

6. **Human Control Points**
   - 5 gates for approval
   - Can pause/modify/iterate at any point
   - Never proceeds on wrong direction
   - User stays informed throughout

### 🎓 Educational Value:

Even if you don't use the final code, the workflow itself teaches:
- How to structure requirements
- How to evaluate architecture alternatives
- How to break down complex projects into tasks
- How to implement features incrementally
- How to verify quality comprehensively

---

## Conclusion

**Is the flow coherent?** ✅ YES - Highly logical, well-structured, each phase builds on previous.

**Is it good for creating applications?** ✅ YES - Excellent for full-stack web apps, especially when you want production-ready code with best practices, research-driven architecture, and comprehensive quality assurance.

**Key Innovation:** Parallel architecture + UX design (Phase 2) is unique - saves 50% time and ensures frontend-backend alignment from the start.

**Observability:** Best-in-class - complete audit trail of all decisions, research, and communications.

**Quality:** Production-ready from start - not just code, but tests, docs, security, performance, accessibility, and runtime verification.

**Perfect For:**
- Startup MVPs
- Client projects
- Internal tools
- Learning platform
- Prototypes that need to ship

**Use It When:**
- Building full-stack web applications
- Want research-driven architecture
- Need production-ready quality
- Willing to approve at 5 gates (adds 5-10 min total)
- Using popular tech stacks (React, Node.js, PostgreSQL, etc.)

---

**Total Estimated Time:** 3-5 hours (vs 8-12 hours traditional)
**Cost Optimization:** 3 Opus agents for strategy, 5 Sonnet agents for execution
**Quality:** Production-ready with 80-90% test coverage, WCAG AA compliance
**Observability:** Complete audit trail of all decisions and research

🏗️ **Octocode Vibe** - Where research meets execution.
