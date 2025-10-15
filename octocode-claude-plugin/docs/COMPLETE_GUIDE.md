# Octocode Claude Plugin - Complete Guide

> **⚠️ NOTE: This document is being updated to reflect the new 5-phase workflow where research is integrated into each agent using Octocode MCP directly. References to agent-research-context are deprecated.**

**The Complete AI Development Team for Claude Code**

Transform your ideas into production-ready code through a structured 5-phase workflow powered by 7 specialized AI agents working together with human oversight at 4 critical approval gates.

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Complete Workflow](#complete-workflow)
4. [The 7 Agents](#the-7-agents)
5. [Technical Architecture](#technical-architecture)
6. [Communication Protocol](#communication-protocol)
7. [File Locking System](#file-locking-system)
8. [State Management](#state-management)
9. [Testing Guide](#testing-guide)
10. [Examples](#examples)

---

## Overview

### What is Octocode Claude Plugin?

Octocode transforms Claude into **7 specialized AI agents** working together through a **7-phase workflow** with **5 human approval gates** to create production-ready applications.

**Key Innovation:** Clean waterfall flow with human checkpoints, parallel implementation (Phase 6 runs multiple implementation agents simultaneously).

### The Complete Flow

```
USER REQUEST
     ↓
[Phase 1] Requirements Gathering (agent-product)
     ↓
[Gate 1] PRD Approval
     ↓
[Phase 2] Architecture Design (agent-architect)
     ↓
[Gate 2] Architecture Approval
     ↓
[Phase 3] Design Validation (agent-design-verification)
     ↓
[Gate 3] Task Breakdown Approval
     ↓
[Phase 4] Context Research (agent-research-context, can run parallel)
     ↓
[Phase 5] Task Orchestration (agent-manager)
     ↓
[Phase 6] Implementation (agent-implementation x4-5 IN PARALLEL)
     ↓
[Gate 4] Live Monitoring
     ↓
[Phase 7] Quality Assurance (agent-verification)
     ↓
[Gate 5] Final Approval
     ↓
PRODUCTION-READY CODE
```

### Key Features

- **🚪 5 Human Approval Gates** - Review and approve at critical decision points
- **🔬 Research-Driven Decisions** - Uses curated resources + 100k+ GitHub repositories for best practices
- **🧠 Critical Thinking Framework** - Self-questioning, devil's advocate, alternatives evaluation
- **🎯 Clean Waterfall Flow** - Sequential phases with clear checkpoints, parallel implementation
- **🔒 Production-Ready** - File locking, state persistence, comprehensive observability, runtime testing

### Important: Git Operations

**NO GIT COMMANDS:** All agents only modify local files. The user is responsible for all git operations including commits, pushes, branch management, and merges. Agents focus solely on code implementation and file modifications.

### Curated Resources

**📚 All agents access curated development resources:**
- **Resources:** https://github.com/bgauryy/octocode-mcp/tree/main/resources
- **Contains:** 610+ curated Node.js/TypeScript repositories in 12 specialized files
- **Files:** project-examples, architecture, frontend-libs, fullstack-frameworks, backend, database, auth, testing, security, tooling, ai-agents, mcp-typescript
- **Usage:** Agents read resources first, then validate with GitHub search via octocode-mcp

---

## Quick Start

### Prerequisites

- ✅ Claude Code installed (version >= 1.0.0)
- ✅ Node.js installed (version >= 18.0.0)
- ✅ Git repository initialized in your project

### Installation

**Option 1: From GitHub (Recommended)**
```bash
# In Claude Code
/plugin add bgauryy/octocode-mcp/octocode-claude-plugin
/restart
```

**Option 2: From Local Directory**
```bash
# Clone repository
git clone https://github.com/bgauryy/octocode-mcp.git
cd octocode-mcp/octocode-claude-plugin

# In Claude Code
/plugin add .
/restart
```

### Verify Installation

```bash
# In Claude Code
/plugin list
# Should show "octocode" plugin v1.0.0
```

### Your First Project

```bash
# In Claude Code
/octocode-generate Build a todo app with React frontend and Express backend
```

**What happens:** The plugin guides you through 7 phases with 5 approval gates to create production-ready code!

---

## Complete Workflow

### Phase 1: Requirements Gathering

**Agent:** `agent-product` (Opus model)

#### What Happens

```
┌─────────────────────────────────────────────────────────┐
│                    agent-product                         │
│                  (Product Manager)                       │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  1. Ask Clarifying Questions                            │
│     • Target audience                                    │
│     • Use cases and user stories                         │
│     • Technical constraints                              │
│     • Feature priorities (must-have vs nice-to-have)     │
│     • Performance requirements                           │
│     • Success metrics                                    │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  2. Research Similar Projects (octocode-mcp)            │
│     • Search GitHub for similar apps (>500 stars)        │
│     • Analyze feature sets                               │
│     • Study common patterns                              │
│     • Validate assumptions with production evidence      │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  3. Create Comprehensive Documentation                   │
│     • prd.md - Product Requirements Document             │
│     • user-stories.md - User flows                       │
│     • features.md - Feature specifications               │
│     • error-handling.md - Error scenarios                │
│     • performance.md - Performance criteria              │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  4. Log All Decisions                                    │
│     • .octocode/debug/agent-decisions.json               │
│     • .octocode/debug/communication-log.md               │
└─────────────────────────────────────────────────────────┘
```

#### Output
- `.octocode/requirements/` with complete PRD

#### 🚪 Gate 1: PRD Approval

**User reviews:**
- Product Requirements Document
- User stories and flows
- Feature list (must-have vs nice-to-have)
- Success metrics

**Options:**
1. ✅ Approve - Continue to architecture
2. 📝 Modify - Request changes
3. ❓ Ask Questions - Clarify points
4. 📖 Review Documents - Read full PRD

---

### Phase 2: Architecture Design

**Agent:** `agent-architect` (Opus)  
**Responsibility:** Complete system architecture (backend + frontend framework selection)

#### Architecture Process

```
┌─────────────────────────────────────────────────────────┐
│  1. Self-Questioning Phase (Critical Thinking)          │
│     • What am I trying to optimize for?                  │
│     • What are the critical constraints?                 │
│     • What assumptions am I making?                      │
│     • What would make this decision wrong?               │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  2. Research Phase (octocode-mcp)                       │
│     • ACCESS CURATED RESOURCES FIRST (priority!)        │
│       https://github.com/bgauryy/octocode-mcp/resources │
│     • Search GitHub for similar projects (>1000 stars)   │
│     • Analyze tech stack patterns (backend + frontend)   │
│     • Extract architecture patterns                      │
│     • Study database designs + UI patterns               │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  3. Alternative Evaluation                               │
│     • Minimum 3 alternatives per major decision          │
│     • Score each option (1-10) with justification        │
│     • Document pros/cons                                 │
│     • Evaluate both backend AND frontend choices         │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  4. Devil's Advocate                                     │
│     • Challenge own reasoning                            │
│     • Identify failure scenarios                         │
│     • Risk analysis                                      │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  5. Create Complete Architecture Documentation           │
│     • architecture.md - System overview (full stack)     │
│     • tech-stack.md - All technology choices             │
│     • api-design.md - API endpoints                      │
│     • database-schema.md - Database design               │
│     • ui-approach.md - Frontend framework & UI library   │
│     • tradeoffs.md - Decisions and alternatives          │
└─────────────────────────────────────────────────────────┘
```

#### Output
- `.octocode/designs/` - Complete system architecture (backend + frontend)
  - `architecture.md` - Full system design
  - `tech-stack.md` - Backend + Frontend choices with rationale
  - `api-design.md` - API endpoints and contracts
  - `database-schema.md` - Database design
  - `ui-approach.md` - Frontend framework, UI library, design approach
  - `tradeoffs.md` - All decisions with alternatives

#### 🚪 Gate 2: Architecture Review

**User reviews:**
- Complete system architecture (backend + frontend)
- Technology stack (full stack)
- Database schema and API design
- Frontend framework and UI approach

**Options:**
1. ✅ Approve - Continue to validation (architect creates project structure)
2. 📝 Modify - Request architecture changes
3. ❓ Ask Questions - Clarify decisions
4. 🔄 Alternative - Request different approach

---

### Phase 3: Design Validation

**Agent:** `agent-design-verification` (Sonnet model)

#### What Happens

```
┌─────────────────────────────────────────────────────────┐
│  1. Requirements Coverage Validation                     │
│     • Read all PRD features                              │
│     • Verify each feature is covered in designs          │
│     • Check performance criteria can be met              │
│     • Validate error handling is comprehensive           │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  2. Architecture Soundness Validation                    │
│     • Tech stack choices are appropriate                 │
│     • Database schema supports all features              │
│     • API design follows best practices                  │
│     • Frontend-backend alignment verified                │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  3. Issue Detection and Resolution                       │
│     • If gaps found, communicate with relevant agents    │
│     • Loop until all issues resolved                     │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  4. Task Breakdown Creation                              │
│     • Analyze all work needed (30-50 tasks typically)    │
│     • List ALL files each task will modify               │
│     • Detect file conflicts                              │
│     • Identify parallelization opportunities             │
│     • Group tasks into logical phases                    │
│     • Estimate complexity and time                       │
└─────────────────────────────────────────────────────────┘
```

#### Task Format

```markdown
- [ ] Task 1.1: Setup Next.js
      Files: [package.json, tsconfig.json]
      Complexity: low
      [can-run-parallel-with: 1.2]

- [ ] Task 2.1: Implement auth
      Files: [src/auth/auth.ts]
      Complexity: medium

- [ ] Task 2.2: Add API routes
      Files: [src/api/routes.ts]
      Complexity: medium
      [can-run-parallel-with: 2.1] ✅

- [ ] Task 2.3: Implement logout
      Files: [src/auth/auth.ts]
      Complexity: low
      [blocked-by: 2.1] ⚠️ (both need auth.ts)
```

#### Output
- `.octocode/tasks.md` - Comprehensive task breakdown

#### 🚪 Gate 3: Task Breakdown Approval

**User reviews:**
- Total tasks and phases
- Time estimates
- Parallelization strategy
- Feature coverage validation

**Options:**
1. ✅ Approve - Start implementation
2. 📝 Modify Priorities - Change task order
3. ⏱️ Adjust Scope - Add/remove tasks
4. 💡 Optimize - Ask for more parallelization

---

### Phase 4: Context Research

**Agent:** `agent-research-context` (Sonnet model)  
**Note:** Can run in parallel with other phases

#### What Happens

```
┌─────────────────────────────────────────────────────────┐
│  1. Identify Research Topics                             │
│     • Framework-specific patterns                        │
│     • Integration patterns (e.g., Prisma + tRPC)         │
│     • Domain patterns (e.g., Stock price API)            │
│     • Infrastructure (e.g., Redis caching)               │
│     • Testing patterns                                   │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  2. Parallel Research (octocode-mcp PRIMARY TOOL)       │
│     For each topic:                                      │
│     • ACCESS CURATED RESOURCES FIRST (priority!)        │
│       https://github.com/bgauryy/octocode-mcp/resources │
│     • Search 5-10 high-quality repos (>500 stars)        │
│     • Analyze repository structures                      │
│     • Extract actual code examples (50-100 lines)        │
│     • Search for specific patterns                       │
│     • Identify common pitfalls                           │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  3. Create Context Guides                                │
│     One guide per research topic with:                   │
│     • Research sources (repo links, stars)               │
│     • Implementation examples (copy-paste ready)         │
│     • Key learnings and when to use                      │
│     • Tradeoffs (pros/cons)                              │
│     • Common pitfalls                                    │
│     • Alternatives considered                            │
└─────────────────────────────────────────────────────────┘
```

#### Example Context Guide

```markdown
# tRPC + Prisma Integration Patterns

## Research Sources
### Repository: maybe-finance/maybe
- Stars: 15,234
- Tech stack: Next.js, tRPC, Prisma
- Relevance: High - Production finance app

## Pattern 1: Type-Safe API with Zod Validation
```typescript
export const portfolioRouter = router({
  getAll: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input, ctx }) => {
      return await ctx.prisma.portfolio.findMany({
        where: { userId: input.userId },
        include: { holdings: true }
      });
    }),
});
```

## Key Learnings
- Always validate input with Zod schemas
- Use protectedProcedure for authenticated endpoints
- Include related data with Prisma include

## Common Pitfalls
- ❌ Not validating inputs
- ❌ Missing error handling
```

#### Output
- `.octocode/context/` - Practical implementation guides

---

### Phase 5: Task Orchestration

**Agent:** `agent-manager` (Sonnet model)

#### What Happens

```
┌─────────────────────────────────────────────────────────┐
│  1. File Dependency Analysis                             │
│                                                          │
│     Task 3.1: Files [auth.ts, types.ts]                 │
│     Task 3.2: Files [api.ts, routes.ts]                 │
│     Task 3.3: Files [auth.ts]                           │
│                                                          │
│     Analysis:                                            │
│     • 3.1 and 3.2: No shared files → Can run parallel ✅ │
│     • 3.1 and 3.3: Both need auth.ts → Cannot parallel ❌│
│     • Decision: Start 3.1+3.2, queue 3.3 after 3.1      │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  2. File Lock System Setup                               │
│     • Create .octocode/locks.json                        │
│     • Implement atomic file locking                      │
│     • Prevent simultaneous file modifications            │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  3. Spawn Implementation Agents (4-5 instances)          │
│     Using Task tool:                                     │
│     • agent-implementation-1 → Task 1.1                  │
│     • agent-implementation-2 → Task 1.2                  │
│     • agent-implementation-3 → Task 1.3                  │
│     • agent-implementation-4 → Task 1.4                  │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  4. Create Progress Dashboard                            │
│     • .octocode/logs/progress-dashboard.md               │
│     • Updates every 10-30 seconds                        │
│     • Shows: active agents, completed tasks, locks       │
└─────────────────────────────────────────────────────────┘
```

#### File Lock Protocol

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

**Lock Operations:**
1. **Request:** Agent requests lock for files
2. **Check:** All files must be available (atomic)
3. **Grant:** Lock all files atomically or none
4. **Release:** After task completion, release all locks
5. **Stale Detection:** Auto-release locks older than 5 minutes

#### Output
- `.octocode/locks.json` - Active file locks
- `.octocode/logs/progress-dashboard.md` - Real-time progress

---

### Phase 6: Implementation (PARALLEL)

**Agent:** `agent-implementation` (Sonnet model, 4-5 instances running simultaneously)

#### What Happens (Per Agent Instance)

```
┌─────────────────────────────────────────────────────────┐
│  1. Receive Task Assignment from agent-manager          │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  2. Request File Locks                                   │
│     • List all files needed                              │
│     • Wait for agent-manager to grant locks              │
│     • If timeout (30s), request different task           │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  3. Study Context                                        │
│     • Read design documents                              │
│     • Study context guides                               │
│     • Review requirements                                │
│     • Check existing codebase patterns                   │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  4. Implement Solution                                   │
│     • Follow design patterns from context guides         │
│     • Use TypeScript with strict types                   │
│     • Add proper error handling                          │
│     • Follow existing code style                         │
│     • NO TESTS YET - Focus on working MVP                │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  5. Verify Build & Lint (REQUIRED)                       │
│     • Run build to ensure no errors                      │
│     • Run linting                                        │
│     • Fix auto-fixable issues                            │
│     • Must pass build + lint before completion           │
│     • NO TESTS - Tests added after MVP approval          │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  6. Report Completion                                    │
│     To agent-manager:                                    │
│     • Duration, files modified, tests added              │
│     • Agent-manager releases locks                       │
│     • Agent-manager assigns next task                    │
└─────────────────────────────────────────────────────────┘
```

#### Parallel Execution Timeline

```
Time    Agent 1         Agent 2         Agent 3         Agent 4
────────────────────────────────────────────────────────────────
00:00   Task 1.1 ✓     Task 1.2 ✓     Task 1.3 ✓     Task 1.4 ✓
15:00   Task 2.1 🔄    Task 2.2 ✓     Task 2.4 ✓     Idle (wait)
30:00   Task 2.1 ✓     Task 3.1 🔄    Task 3.2 🔄    Task 2.3 ✓
45:00   Task 3.3 ✓     Task 3.1 ✓     Task 3.2 ✓     Task 4.1 🔄
60:00   Done           Task 4.2 ✓     Task 4.3 ✓     Task 4.1 ✓

Legend: ✓ Complete  🔄 In Progress
```

#### Output
- Complete implementation with all features coded and tested

#### 🚪 Gate 4: Live Monitoring

**User can view:**
- Real-time progress dashboard
- Active agents and current tasks
- Completed vs pending tasks
- Any issues or failures

**Options:**
1. ⏸️ Pause - Stop all agents, save state
2. 📊 Details - See detailed task status
3. 🔍 Inspect - View specific agent's work
4. 🔄 Continue - Keep monitoring

---

### Phase 7: Quality Assurance

**Agent:** `agent-verification` (Sonnet model)

#### What Happens

```
┌─────────────────────────────────────────────────────────┐
│  1. Build Verification                                   │
│     • npm run build (no errors)                          │
│     • Output files generated                             │
│     • No critical warnings                               │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  2. Lint Verification                                    │
│     • npm run lint (no critical errors)                  │
│     • Code style consistent                              │
│     • Auto-fix issues                                    │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  3. Test Verification (ONLY IF TESTS EXIST)              │
│     • MVP: Skip this step - no tests required            │
│     • If existing tests: Verify they still pass          │
│     • Tests added AFTER MVP approval                     │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  4. Feature Verification (CRITICAL)                      │
│     For each must-have feature from PRD:                 │
│     • UI component exists                                │
│     • API endpoint exists                                │
│     • Database table exists                              │
│     • Tests cover feature                                │
│     • Error handling present                             │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  5. Static Code Analysis                                 │
│     • TypeScript strict mode enabled                     │
│     • No @ts-ignore without justification                │
│     • Function length < 100 lines                        │
│     • Nesting depth < 5 levels                           │
│     • No circular dependencies                           │
│     • No unused dependencies                             │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  6. Production Readiness                                 │
│     • Environment variables documented                   │
│     • Logging configured                                 │
│     • Error tracking setup                               │
│     • Database migrations ready                          │
│     • Health check endpoints                             │
│     • Rate limiting implemented                          │
│     • Security headers configured                        │
│     • No hardcoded secrets                               │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  7. Runtime Testing (chrome-devtools-mcp)               │
│     • Start development server                           │
│     • Open app in Chrome browser                         │
│     • Test key user flows interactively                  │
│     • Monitor console for errors/warnings                │
│     • Check network requests                             │
│     • Verify UI rendering                                │
│     • Test interactions (forms, buttons, navigation)     │
│     • Capture performance metrics (LCP, FID, CLS)        │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  8. Create Comprehensive Report                          │
│     • Summary of all checks                              │
│     • Feature verification status                        │
│     • Performance results                                │
│     • Critical issues (must fix)                         │
│     • Warnings (should fix)                              │
│     • Code quality score                                 │
│     • Production readiness status                        │
└─────────────────────────────────────────────────────────┘
```

#### Output
- `.octocode/verification-report.md` - Complete quality assessment

#### 🚪 Gate 5: Final Approval

**User reviews:**
- Verification report with all checks
- Feature verification status
- Performance results
- Critical issues (if any)
- Production readiness

**Options:**
1. 🚀 Ship It - Accept and deploy
2. 🔧 Fix Critical Issues - Address must-fix items
3. 🔄 Iterate - Add improvements
4. 📖 Review Report - See full details

---

## The 7 Agents

### 1. agent-product (Product Manager) - Opus

**When:** Phase 1  
**Tools:** Read, Write, WebSearch, TodoWrite, octocode-mcp  
**Key Responsibility:** Transform user's idea into comprehensive PRD

**Input:** User's project idea  
**Output:** `.octocode/requirements/`
- `prd.md` - Product Requirements Document
- `user-stories.md` - User flows
- `features.md` - Feature specifications
- `error-handling.md` - Error scenarios
- `performance.md` - Performance criteria

**Key Features:**
- Asks clarifying questions
- Research similar projects on GitHub
- Creates comprehensive PRD
- Defines success metrics

**Implementation Notes:**
- Uses octocode-mcp for competitive analysis
- Logs all user communications
- Creates decision logs for requirement choices

---

### 2. agent-architect (Solution Architect) - Opus

**When:** Phase 2  
**Tools:** Read, Write, Grep, Glob, LS, TodoWrite  
**Key Responsibility:** Design complete system architecture (backend + frontend framework selection) with critical thinking

**Input:** `.octocode/requirements/`  
**Output:** `.octocode/designs/`
- `architecture.md` - System architecture (full stack)
- `tech-stack.md` - Technology choices (backend + frontend)
- `api-design.md` - API endpoints
- `database-schema.md` - Database design
- `ui-approach.md` - Frontend framework, UI library choice
- `tradeoffs.md` - Design decisions

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

**Key Features:**
- Handles BOTH backend AND frontend architecture
- Selects frontend framework and UI component library
- Creates initial project structure after Gate 2 approval
- Documents all decisions with alternatives

---

### 3. agent-design-verification (Technical Lead) - Sonnet

**When:** Phase 3  
**Tools:** Read, Write, Grep, Glob, LS, TodoWrite  
**Key Responsibility:** Validate designs and create task breakdown

**Input:** `.octocode/requirements/`, `.octocode/designs/`  
**Output:** `.octocode/tasks.md`

**Key Features:**
- Requirements coverage validation
- Architecture soundness review
- Task breakdown creation
- File conflict detection

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

### 4. ~~agent-research-context~~ (Research Specialist) - DEPRECATED

> **⚠️ DEPRECATED:** This agent has been removed. Research is now integrated directly into other agents using Octocode MCP (Product Manager researches during requirements, Architect researches during design, etc.)

**Previously When:** Phase 4 (could run in parallel with Phase 5)
**Previously Tools:** Read, Write, LS, TodoWrite
**Previous Responsibility:** Gather implementation patterns from GitHub using octocode-mcp

**Input:** `.octocode/designs/`, `.octocode/tasks.md`  
**Output:** `.octocode/context/*.md`

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
[Code example]
### Key Learnings
- Point 1
### When to Use
- Use case 1
### Tradeoffs
**Pros:** ...
**Cons:** ...
```

---

### 5. agent-manager (Engineering Manager) - Sonnet

**When:** Phase 5 & 6  
**Tools:** Read, Write, TodoWrite, Bash, BashOutput, Task, KillShell  
**Key Responsibility:** Orchestrate parallel implementation

**Input:** `.octocode/tasks.md`, `.octocode/context/`  
**Output:** `.octocode/locks.json`, `.octocode/logs/progress-dashboard.md`

**Key Features:**
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

---

### 6. agent-implementation (Software Engineer) - Sonnet

**When:** Phase 6 (4-5 instances in parallel)  
**Tools:** Read, Write, Edit, Bash, BashOutput, Grep, Glob, LS, TodoWrite  
**Key Responsibility:** Implement features following designs and context guides

**Important:** NO GIT COMMANDS - Only modify local files. User handles all git operations.

**Input:** Task assignment, `.octocode/designs/`, `.octocode/context/`  
**Output:** Production code with tests

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
- TypeScript strict mode
- Build passes without errors
- Linting passes
- Error handling present
- Follows existing code style
- NO TESTS during MVP (tests come after approval)

---

### 7. agent-verification (QA Engineer) - Sonnet

**When:** Phase 7  
**Tools:** Read, Bash, BashOutput, Grep, Glob, LS, TodoWrite, KillShell  
**Key Responsibility:** Comprehensive quality assurance including runtime testing

**Important:** NO GIT COMMANDS - Only run build/test/lint commands. User handles all git operations.

**Input:** Complete codebase, all requirements/designs  
**Output:** `.octocode/verification-report.md`

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
  - MVP: Skip - no tests required
  - Existing tests: verify they still pass
  - New tests: add after MVP approval

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

---

## Technical Architecture

### Plugin Architecture Overview

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

### Command Flow State Machine

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

### Directory Structure

```
.octocode/
├── requirements/           # Phase 1 output
│   ├── prd.md
│   ├── user-stories.md
│   ├── features.md
│   ├── error-handling.md
│   └── performance.md
│
├── designs/                # Phase 2 output (agent-architect)
│   ├── architecture.md
│   ├── tech-stack.md
│   ├── component-structure.md
│   ├── api-design.md
│   ├── database-schema.md
│   ├── data-flow.md
│   ├── ui-approach.md
│   ├── auth-strategy.md
│   ├── testing-strategy.md
│   ├── deployment.md
│   └── tradeoffs.md
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
├── tasks.md                # Phase 3 output (agent-design-verification, updated inline with progress)
├── locks.json              # Phase 5/6 (agent-manager)
└── verification-report.md  # Phase 7 output (agent-verification)
```

---

## Communication Protocol

### Standard Message Format

```markdown
### [HH:MM:SS] sender-agent → receiver-agent
**Type:** [Question | Response | Status | Issue | Assignment | Notification]
**Field:** Value
**Field:** Value
...

[Optional body content]
```

### Format Rules

1. **Timestamp**: Always use `[HH:MM:SS]` format (24-hour)
2. **Arrow**: Always use ` → ` (space-arrow-space) for direction
3. **Agent Names**: Use full agent-* format (e.g., `agent-architect`, not `architect`)
4. **Type Field**: MUST be first field after header, capitalized
5. **Bold Fields**: Use `**Field:**` format consistently
6. **Line Breaks**: Single line break between field and body, double between messages

### Message Types

#### Question
Used when an agent needs information from another agent.

```markdown
### [14:15:32] agent-architect → agent-product
**Type:** Question
**Question:** Should caching be configurable per user?
**Context:** Designing caching strategy for API responses
**Reasoning:** Need to decide if cache TTL should be user-specific
```

#### Response
Used to answer a question or provide requested information.

```markdown
### [14:16:15] agent-product → agent-architect
**Type:** Response
**Answer:** Not for MVP, keep it simple
**Impact:** Simplified caching design - global TTL only
**Reference:** See .octocode/requirements/prd.md section 5.3
```

#### Status
Used to report task/work status updates.

```markdown
### [14:28:00] agent-implementation-2 → agent-manager
**Type:** Status
**Task ID:** 3.2
**Status:** ✅ COMPLETED
**Duration:** 28min
**Files Modified:**
  - src/api/api.ts (created, 124 lines)
  - src/api/routes.ts (created, 89 lines)
**Build:** ✅ Passed
**Linting:** ✅ Passed
**Summary:** Implemented portfolio API endpoints with full CRUD operations
```

#### Issue
Used to report problems, blockers, or concerns.

```markdown
### [14:20:00] agent-design-verification → agent-architect
**Type:** Issue
**Issue:** No error handling strategy for database connection failures
**Severity:** High
**Impact:** Application will crash on DB disconnect
**Request:** Please add database connection error handling to design
```

#### Assignment
Used by manager to assign work.

```markdown
### [14:25:00] agent-manager → agent-implementation-1
**Type:** Assignment
**Task:** 3.1 - Implement user login
**Files to Lock:** [src/auth/auth.ts, src/types/user.ts]
**Context:** Read .octocode/context/authentication-patterns.md
**Estimated:** 45min
**Lock Status:** ✅ Granted
```

#### Notification
Used for general information sharing.

```markdown
### [14:30:00] agent-architect → agent-ux
**Type:** Notification
**Topic:** API contracts updated
**Changes:**
  - Added pagination to /api/holdings
  - Added cursor-based navigation
**Updated:** .octocode/designs/api-design.md
**Please Review:** Sections 3.2 and 3.3
```

### Communication Routing

| From Agent | Question Type | Route To | Response Time |
|------------|---------------|----------|---------------|
| agent-implementation | Requirements | agent-product | Immediate |
| agent-implementation | Architecture/Design | agent-architect | Immediate |
| agent-architect | Requirements | agent-product | Immediate |
| agent-manager | Task assignment | agent-implementation | Immediate |
| agent-design-verification | Design issues | agent-architect | Immediate |

### Communication Logging

All communications logged to `.octocode/debug/communication-log.md` using this exact format.

---

## File Locking System

### Why File Locking?

When multiple `agent-implementation` instances run in parallel, they could modify the same file simultaneously, causing conflicts. The file locking system prevents this.

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

## Progress Tracking

### Task Status in tasks.md

Progress is tracked inline in `.octocode/tasks.md` with status markers:

```markdown
## Phase 2: Backend
- [x] 2.1: Auth logic ✅ (completed, agent-impl-1)
- [⏳] 2.2: API routes (in-progress, agent-impl-2)
- [⏸️] 2.3: Auth middleware (waiting for 2.1)
- [ ] 2.4: Database migrations (pending)

## Phase 3: Frontend  
- [x] 3.1: Login component ✅ (completed, agent-impl-3)
- [ ] 3.2: Dashboard UI (pending)

Status: 23/35 tasks complete (65%)
Active: impl-2 on 2.2, impl-4 on 3.2
```

**Status Markers:**
- `[ ]` - Pending
- `[⏳]` - In progress
- `[⏸️]` - Blocked/waiting
- `[x]` - Completed (with ✅)

This provides:
- Single source of truth for progress
- Human-readable status at a glance
- Agent assignments visible
- No duplicate state management

---

## Testing Guide

### Pre-Testing Checklist

- [ ] Claude Code version >= 1.0.0 installed
- [ ] Node.js version >= 18.0.0 installed
- [ ] Git repository initialized in test project
- [ ] You have an Anthropic API key configured

### Installation Testing

**Local Directory Installation**

```bash
cd /path/to/octocode-mcp/octocode-claude-plugin
```

In Claude Code:
```
/plugin add .
/restart
```

**Verification:**
```
/plugin list
```
Should show "octocode" plugin with version 1.0.0

### Agent Testing

Test each agent independently:

**agent-product:**
```
Use the agent-product agent to create a PRD for a simple todo app
```

Expected:
- ✅ Agent asks clarifying questions
- ✅ Creates documents in `.octocode/requirements/`
- ✅ Presents Gate 1 approval

**agent-architect:**
```
Launch agent-architect to design architecture for the todo app
```

Expected:
- ✅ Creates complete system architecture (backend + frontend)
- ✅ Documents in `.octocode/designs/`
- ✅ Includes frontend framework and UI library choices
- ✅ Presents Gate 2 for approval
- ✅ Creates initial project structure after approval

### End-to-End Testing

**Complete workflow test:**

```
/octocode-generate Build a simple todo app with React frontend and Express backend
```

**Verify all phases complete:**
- Phase 1: Requirements (2-5 min)
- Phase 2: Architecture (5-10 min)
- Phase 3: Validation (2-3 min)
- Phase 4: Research (3-5 min, can run parallel)
- Phase 5-6: Implementation (15-40 min)
- Phase 7: Verification (3-5 min)

**Final verification:**
```bash
# Check all output files exist
ls -R .octocode/

# Expected structure:
# .octocode/
#   ├── requirements/
#   ├── designs/
#   ├── context/
#   ├── tasks.md
#   ├── logs/
#   ├── debug/
#   ├── locks.json
#   └── verification-report.md
```

---

## Examples

### Example 1: Simple Todo App

**User Request:**
```
/octocode-generate Build a todo app with React frontend and Express backend
```

**Phase 1: Requirements**
- agent-product asks clarifying questions
- Creates PRD with features:
  1. User authentication
  2. Create/edit/delete todos
  3. Mark as complete
  4. Filter by status
- **Gate 1:** User approves PRD ✅

**Phase 2: Architecture**
- agent-architect: Next.js + Express + PostgreSQL + UI library selection
- **Gate 2:** User approves architecture ✅
- Architect creates initial project structure

**Phase 3: Validation**
- 20 tasks created, 12 can run in parallel
- **Gate 3:** User approves ✅

**Phase 4: Research (parallel)**
- 3 context guides created

**Phase 5-6: Implementation**
- 4 agents work in parallel
- All 20 tasks completed
- **Gate 4:** Live dashboard monitored

**Phase 7: Verification**
- ✅ Build passes
- ✅ Linting passes
- ✅ All features verified
- ✅ Runtime testing passes
- **Gate 5:** User approves MVP ✅
- ⏸️ Tests to be added post-approval

---

### Example 2: Stock Portfolio Tracker

**User Request:**
```
/octocode-generate Build a stock portfolio tracker with real-time price updates,
multiple portfolios, price alerts, and performance charts. Use React and PostgreSQL.
```

**Phase 1: Requirements**
- PRD with must-have features:
  1. User authentication (email + OAuth)
  2. Create/edit multiple portfolios
  3. Add/remove holdings
  4. Real-time price updates via WebSocket
  5. Price alert notifications
  6. Performance charts
  7. Transaction history
- **Gate 1:** User approves ✅

**Phase 2: Architecture**
- agent-architect: Next.js 14 + tRPC + Prisma + PostgreSQL + UI library
- Creates dashboard architecture with charts and stats
- **Gate 2:** User approves ✅
- Creates initial project structure

**Phase 3: Validation**
- 35 tasks, 18 can run in parallel
- **Gate 3:** User approves ✅

**Phase 4: Research (parallel)**
- 5 context guides created

**Phase 5-6: Implementation**
- 4 agents work in parallel
- All 35 tasks completed
- **Gate 4:** Live dashboard monitored

**Phase 7: Verification**
- ✅ Build passes
- ✅ Linting passes
- ✅ All 7 features verified
- ✅ Runtime testing: No errors
- **Gate 5:** User approves MVP ✅
- ⏸️ Tests to be added post-approval

---

## Summary

### Is This Good for Creating Applications?

**✅ YES, EXCELLENT for:**

1. **Full-Stack Web Applications**
   - CRUD apps with authentication
   - Dashboards and admin panels
   - E-commerce platforms
   - SaaS products
   - Financial applications
   - Social networks

2. **Applications Requiring Best Practices**
   - Type safety (TypeScript)
   - Testing (unit, integration, E2E)
   - Accessibility (WCAG 2.1 AA)
   - Performance optimization
   - Security best practices

3. **Projects with Clear Requirements**
   - MVP development
   - Proof of concepts
   - Internal tools
   - Client projects with defined scope

4. **Teams Wanting to Learn Best Practices**
   - Research-driven decisions
   - Copy-paste ready code examples
   - Complete observability
   - Learn why decisions were made

### Key Strengths

1. **Research-Driven Decisions**
   - Every tech choice backed by production evidence
   - Learn from apps with >1000 stars

2. **Critical Thinking Framework**
   - Agents question own assumptions
   - Evaluates 3+ alternatives
   - Plays devil's advocate
   - Documents reasoning

3. **Parallel Execution**
   - 50% faster than sequential
   - Multiple implementation agents
   - Smart file locking prevents conflicts

4. **Comprehensive Observability**
   - Every decision logged
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
   - Can pause/modify/iterate
   - Never proceeds on wrong direction
   - User stays informed throughout

### Development Process

**Benefits:** 
- Clean waterfall flow with clear phase transitions
- Parallel implementation with multiple agents
- Human checkpoints at 5 critical gates
- File locking prevents conflicts
- Complete observability and state persistence

### Quality Metrics

- **Working MVP:** Focus on functionality first
- **Code Quality:** 8.5/10 average (TypeScript + Linting)
- **Type Safety:** Strict mode enforced
- **Tests:** Added post-MVP after user approval

---

**Made with ❤️ by Guy Bary**

🏗️ **Octocode** - Where research meets execution

