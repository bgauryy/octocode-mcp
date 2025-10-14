# Octocode Claude Plugin - Complete Guide

**The Complete AI Development Team for Claude Code**

Transform your ideas into production-ready code through a structured 7-phase workflow powered by 8 specialized AI agents.

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Complete Workflow](#complete-workflow)
4. [The 8 Agents](#the-8-agents)
5. [Technical Architecture](#technical-architecture)
6. [Communication Protocol](#communication-protocol)
7. [File Locking System](#file-locking-system)
8. [State Management](#state-management)
9. [Testing Guide](#testing-guide)
10. [Examples](#examples)

---

## Overview

### What is Octocode Claude Plugin?

Octocode transforms Claude into **8 specialized AI agents** working together through a **7-phase workflow** with **5 human approval gates** to create production-ready applications.

**Timeline:** 30-70 minutes (depending on project complexity)

**Key Innovation:** Parallel execution where possible (Phase 2 runs architecture + UX simultaneously, Phase 6 runs multiple implementation agents in parallel).

### The Complete Flow

```
USER REQUEST
     ↓
[Phase 1] Requirements Gathering (agent-product)
     ↓
[Gate 1] PRD Approval
     ↓
[Phase 2] Architecture & UX Design (agent-architect + agent-ux IN PARALLEL)
     ↓
[Gate 2] Design Approval
     ↓
[Phase 3] Design Validation (agent-design-verification)
     ↓
[Gate 3] Task Breakdown Approval
     ↓
[Phase 4] Context Research (agent-research-context)
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
- **🔬 Research-Driven Decisions** - Analyzes 100k+ GitHub repositories for best practices
- **🧠 Critical Thinking Framework** - Self-questioning, devil's advocate, alternatives evaluation
- **🎨 Parallel Architecture + UX** - Backend architect and UX engineer work simultaneously
- **🔒 Production-Ready** - File locking, state persistence, comprehensive observability, runtime testing

### Curated Resources

**📚 All agents access curated development resources:**
- Resources: https://github.com/bgauryy/octocode-mcp/tree/main/resources
- README: https://github.com/bgauryy/octocode-mcp/blob/main/resources/README.md
- Includes: Architecture, Frontend, Backend, Database, Testing, Security, Infrastructure, Tooling, Project Examples, Frameworks, AI Agents, Learning resources

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

### Phase 1: Requirements Gathering (2-5 minutes)

**Agent:** `agent-product` (Opus model)  
**Duration:** 2-5 minutes

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

### Phase 2: Architecture & UX Design (5-10 minutes, PARALLEL)

**Agents:** `agent-architect` + `agent-ux` (Both Opus)  
**Duration:** 5-10 minutes  
**🔥 Innovation:** Both agents run **simultaneously** with active coordination

#### Parallel Execution

```
                    Requirements Approved
                            │
                            ▼
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▼
    ┌──────────────────┐        ┌──────────────────┐
    │ agent-architect  │◄──────►│    agent-ux      │
    │    (Backend)     │  Chat  │   (Frontend)     │
    └──────────────────┘        └──────────────────┘
              │                           │
              │    Coordination Topics:   │
              │    • Frontend framework   │
              │    • API contracts        │
              │    • Real-time strategy   │
              │    • Performance needs    │
              │                           │
              ▼                           ▼
    .octocode/designs/        .octocode/ux/
```

#### 2A: Backend Architecture (agent-architect)

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
│     • Analyze tech stack patterns                        │
│     • Extract architecture patterns                      │
│     • Study database designs                             │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  3. Alternative Evaluation                               │
│     • Minimum 3 alternatives per major decision          │
│     • Score each option (1-10) with justification        │
│     • Document pros/cons                                 │
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
│  5. Create Architecture Documentation                    │
│     • architecture.md - System overview                  │
│     • tech-stack.md - Technology choices with rationale  │
│     • api-design.md - API endpoints                      │
│     • database-schema.md - Database design               │
│     • tradeoffs.md - Decisions and alternatives          │
└─────────────────────────────────────────────────────────┘
```

#### 2B: Frontend Architecture & UX (agent-ux)

```
┌─────────────────────────────────────────────────────────┐
│  1. User Empathy Phase                                   │
│     • Who are the users and what do they need?           │
│     • What's their context and goals?                    │
│     • Is this design inclusive?                          │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  2. Research Phase (octocode-mcp)                       │
│     • ACCESS CURATED RESOURCES FIRST (priority!)        │
│       https://github.com/bgauryy/octocode-mcp/resources │
│     • UI patterns in successful apps                     │
│     • Component library analysis                         │
│     • Design systems                                     │
│     • Accessibility implementations                      │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  3. UX Critical Thinking                                 │
│     • What problem does this UI solve?                   │
│     • Evaluate 3+ design alternatives                    │
│     • WCAG 2.1 AA accessibility validation               │
│     • Mobile-first approach                              │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  4. Create UX Documentation                              │
│     • user-flows.md - User journeys                      │
│     • wireframes.md - ASCII wireframes                   │
│     • component-library.md - UI components               │
│     • design-system.md - Colors, typography, spacing     │
│     • accessibility.md - WCAG compliance                 │
│     • frontend-architecture.md - Framework, state        │
└─────────────────────────────────────────────────────────┘
```

#### Coordination Example

```markdown
[14:15:00] agent-architect → agent-ux
Topic: Frontend Framework Recommendation
Message: I recommend Next.js 14 with App Router. Your input?

[14:16:00] agent-ux → agent-architect
Response: Agreed on Next.js 14
API Requirements:
1. Need /api/dashboard/summary for portfolio stats
2. Real-time price updates via WebSocket
3. Cursor-based pagination for holdings

[14:17:00] agent-architect → agent-ux
Confirmed: All supported
- Using tRPC subscriptions for real-time
- Cursor pagination implemented
Updated: .octocode/designs/api-design.md
```

#### Output
- `.octocode/designs/` - Complete backend architecture
- `.octocode/ux/` - Complete UX design

#### 🚪 Gate 2: Combined Architecture & UX Review

**User reviews:**
- Backend architecture and tech stack
- Database schema and API design
- UX design and component library
- Frontend-backend alignment

**Options:**
1. ✅ Approve - Continue to validation
2. 📝 Modify Backend - Request architecture changes
3. 🎨 Modify UX - Request UX changes
4. ❓ Ask Questions - Clarify decisions
5. 🔄 Alternative - Request different approach

---

### Phase 3: Design Validation (2-3 minutes)

**Agent:** `agent-design-verification` (Sonnet model)  
**Duration:** 2-3 minutes

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

### Phase 4: Context Research (3-5 minutes)

**Agent:** `agent-research-context` (Sonnet model)  
**Duration:** 3-5 minutes (runs in parallel)

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

### Phase 5: Task Orchestration (1-2 minutes)

**Agent:** `agent-manager` (Sonnet model)  
**Duration:** 1-2 minutes

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

### Phase 6: Implementation (15-40 minutes, PARALLEL)

**Agent:** `agent-implementation` (Sonnet model, 4-5 instances)  
**Duration:** 15-40 minutes

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
│     • Write tests for new code                           │
│     • Follow existing code style                         │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  5. Self-Testing (REQUIRED)                              │
│     • Run unit tests                                     │
│     • Run integration tests                              │
│     • Run linting                                        │
│     • Fix auto-fixable issues                            │
│     • Must pass all checks before completion             │
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

### Phase 7: Quality Assurance (3-5 minutes)

**Agent:** `agent-verification` (Sonnet model)  
**Duration:** 3-5 minutes

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
│  3. Test Verification                                    │
│     • Unit tests: all passing                            │
│     • Integration tests: all passing                     │
│     • E2E tests: all passing                             │
│     • Coverage: meets requirements (80%+)                │
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

## The 8 Agents

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

**When:** Phase 2A (runs in parallel with agent-ux)  
**Tools:** Read, Write, Grep, Glob, TodoWrite, octocode-mcp, WebSearch  
**Key Responsibility:** Design backend architecture with critical thinking

**Input:** `.octocode/requirements/`  
**Output:** `.octocode/designs/`
- `architecture.md` - System architecture
- `tech-stack.md` - Technology choices
- `api-design.md` - API endpoints
- `database-schema.md` - Database design
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

**Coordination Protocol:**
- Communicates with agent-ux on frontend framework
- Shares API requirements
- Aligns on real-time data strategy

---

### 3. agent-ux (UX Engineer) - Opus

**When:** Phase 2B (runs in parallel with agent-architect)  
**Tools:** Read, Write, WebSearch, WebFetch, TodoWrite, octocode-mcp  
**Key Responsibility:** Design frontend architecture and UX

**Input:** `.octocode/requirements/`, `.octocode/designs/architecture.md`  
**Output:** `.octocode/ux/`
- `user-flows.md` - User journeys
- `wireframes.md` - ASCII wireframes
- `component-library.md` - UI components
- `design-system.md` - Colors, typography, spacing
- `accessibility.md` - WCAG 2.1 AA compliance
- `responsive-design.md` - Breakpoints
- `frontend-architecture.md` - Framework, state, routing

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

### 4. agent-design-verification (Technical Lead) - Sonnet

**When:** Phase 3  
**Tools:** Read, Write, Grep, Glob, TodoWrite  
**Key Responsibility:** Validate designs and create task breakdown

**Input:** `.octocode/requirements/`, `.octocode/designs/`, `.octocode/ux/`  
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

### 5. agent-research-context (Research Specialist) - Sonnet

**When:** Phase 4 (can run in parallel)  
**Tools:** Read, Write, TodoWrite, octocode-mcp (primary tool)  
**Key Responsibility:** Gather implementation patterns from GitHub

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

### 6. agent-manager (Engineering Manager) - Sonnet

**When:** Phase 5 & 6  
**Tools:** Read, Write, TodoWrite, Bash, Task  
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

### 7. agent-implementation (Software Engineer) - Sonnet

**When:** Phase 6 (4-5 instances in parallel)  
**Tools:** Read, Write, Edit, Bash, Grep, Glob, TodoWrite, octocode-mcp (optional)  
**Key Responsibility:** Implement features following designs

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
- All functions have tests
- Linting passes
- Error handling present
- Follows existing code style

---

### 8. agent-verification (QA Engineer) - Sonnet

**When:** Phase 7  
**Tools:** Read, Bash, Grep, Glob, TodoWrite, chrome-devtools-mcp  
**Key Responsibility:** Comprehensive quality assurance

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
**Tests:** 12 added, all passing
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
| agent-implementation | Backend/API | agent-architect | Immediate |
| agent-implementation | Frontend/UX | agent-ux | Immediate |
| agent-architect | Requirements | agent-product | Immediate |
| agent-architect | UX coordination | agent-ux | Immediate |
| agent-ux | Backend coordination | agent-architect | Immediate |

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

**Resume Command:**
```bash
# If interrupted, resume with:
/octocode-generate --resume

# System will:
# 1. Load .octocode/execution-state.json
# 2. Determine current phase
# 3. Load all previous work
# 4. Continue from last checkpoint
```

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
- ✅ Logs decisions to `.octocode/debug/agent-decisions.json`
- ✅ Presents Gate 1 approval

**agent-architect + agent-ux (parallel):**
```
Launch agent-architect and agent-ux in parallel for the todo app
```

Expected:
- ✅ Both agents run simultaneously
- ✅ Agents communicate with each other
- ✅ UX creates documents in `.octocode/ux/`
- ✅ Frontend architecture aligns with backend
- ✅ Combined Gate 2 presentation

### End-to-End Testing

**Complete workflow test:**

```
/octocode-generate Build a simple todo app with React frontend and Express backend
```

**Verify all phases complete:**
- Phase 1: Requirements (2-5 min)
- Phase 2: Architecture & UX (5-10 min)
- Phase 3: Validation (2-3 min)
- Phase 4: Research (3-5 min)
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
#   ├── ux/
#   ├── context/
#   ├── tasks.md
#   ├── logs/
#   ├── debug/
#   ├── execution-state.json
#   ├── locks.json
#   └── verification-report.md
```

### Resume Functionality Test

```bash
# After Phase 3, simulate interruption
# (manually stop or kill Claude Code session)

# Restart Claude Code
claude

# Should see session-start hook notification

# Resume
/octocode-generate --resume
```

Expected:
- ✅ Hook detects previous state
- ✅ Loads from `.octocode/execution-state.json`
- ✅ Continues from last phase
- ✅ No duplicate work

---

## Examples

### Example 1: Simple Todo App

**User Request:**
```
/octocode-generate Build a todo app with React frontend and Express backend
```

**Phase 1: Requirements (5 min)**
- agent-product asks clarifying questions
- Creates PRD with features:
  1. User authentication
  2. Create/edit/delete todos
  3. Mark as complete
  4. Filter by status
- **Gate 1:** User approves PRD ✅

**Phase 2: Architecture & UX (10 min, parallel)**
- agent-architect: Next.js + Express + PostgreSQL
- agent-ux: Clean UI with cards
- **Gate 2:** User approves both ✅

**Phase 3: Validation (3 min)**
- 20 tasks created, 12 can run in parallel
- **Gate 3:** User approves ✅

**Phase 4: Research (5 min)**
- 4 context guides created

**Phase 5-6: Implementation (25 min)**
- 4 agents work in parallel
- All 20 tasks completed
- **Gate 4:** Live dashboard monitored

**Phase 7: Verification (5 min)**
- ✅ Build passes
- ✅ 85 tests pass (88% coverage)
- ✅ All features verified
- **Gate 5:** User approves ✅

**Total Time:** ~53 minutes

---

### Example 2: Stock Portfolio Tracker

**User Request:**
```
/octocode-generate Build a stock portfolio tracker with real-time price updates,
multiple portfolios, price alerts, and performance charts. Use React and PostgreSQL.
```

**Phase 1: Requirements (10 min)**
- PRD with must-have features:
  1. User authentication (email + OAuth)
  2. Create/edit multiple portfolios
  3. Add/remove holdings
  4. Real-time price updates via WebSocket
  5. Price alert notifications
  6. Performance charts
  7. Transaction history
- **Gate 1:** User approves ✅

**Phase 2: Architecture & UX (15 min, parallel)**
- agent-architect: Next.js 14 + tRPC + Prisma + PostgreSQL
- agent-ux: Dashboard with large chart, card-based stats
- **Gate 2:** User approves ✅

**Phase 3: Validation (7 min)**
- 35 tasks, 18 can run in parallel
- **Gate 3:** User approves ✅

**Phase 4: Research (12 min)**
- 6 context guides created

**Phase 5-6: Implementation (150 min)**
- 4 agents work in parallel
- All 35 tasks completed
- **Gate 4:** Live dashboard monitored

**Phase 7: Verification (35 min)**
- ✅ Build passes
- ✅ 142 tests pass (89% coverage)
- ✅ All 7 features verified
- ✅ Runtime testing: No errors
- **Gate 5:** User approves ✅

**Total Time:** 3 hours 42 minutes  
**(Traditional sequential: 8-10 hours)**

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

### Estimated Timeline

- **Small Project (Todo App):** 30-40 minutes
- **Medium Project (Dashboard):** 40-60 minutes
- **Large Project (E-commerce):** 60-90 minutes

**Time Saved:** 50-60% faster vs sequential execution

### Quality Metrics

- **Test Coverage:** 80-90% (enforced)
- **Code Quality:** 8.5/10 average
- **Production Ready:** All features verified
- **Accessibility:** WCAG 2.1 AA compliant

---

**Made with ❤️ by Guy Bary**

🏗️ **Octocode** - Where research meets execution

