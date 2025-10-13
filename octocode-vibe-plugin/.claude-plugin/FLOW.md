# Octocode Generation Flow

**Complete AI Development Team Workflow - From Idea to Production-Ready Code**

---

## 📊 Overview

Octocode transforms your idea into production-ready code through a **7-phase workflow** orchestrated by **8 specialized AI agents** with **5 human approval gates**.

**📚 All agents access curated development resources via octocode-mcp:**
- **Resources**: https://github.com/bgauryy/octocode-mcp/tree/main/resources
- **README**: https://github.com/bgauryy/octocode-mcp/blob/main/resources/README.md
- **Includes**: Architecture, Frontend, Backend, Database, Testing, Security, Infrastructure, Tooling, Project Examples, Frameworks, AI Agents, Learning resources

These curated resources provide expert guidance on best frameworks, tech stacks, patterns, and real-world implementations.

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

**Timeline:** 3-5 hours (vs 8-12 hours traditional sequential approach)

---

## 🎯 Command Usage

```bash
# Start new project
/octocode-generate Build a todo app with React and Express

# Resume interrupted session
/octocode-generate --resume
```

---

## 📋 Phase 1: Requirements Gathering

**Agent:** `agent-product` (Opus model)  
**Duration:** 10-15 minutes

### What Happens

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

### Output
- `.octocode/requirements/` with complete PRD

### 🚪 Gate 1: PRD Approval

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

## 🏗️ Phase 2: Architecture & UX Design (PARALLEL)

**Agents:** `agent-architect` + `agent-ux` (Both Opus)  
**Duration:** 15-20 minutes  
**🔥 Innovation:** Both agents run **simultaneously** with active coordination

### Parallel Execution

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

### 2A: Backend Architecture (agent-architect)

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

### 2B: Frontend Architecture & UX (agent-ux)

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

### Coordination Example

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

### Output
- `.octocode/designs/` - Complete backend architecture
- `.octocode/ux/` - Complete UX design

### 🚪 Gate 2: Combined Architecture & UX Review

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

## ✅ Phase 3: Design Validation

**Agent:** `agent-design-verification` (Sonnet model)  
**Duration:** 5-10 minutes

### What Happens

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

### Task Format

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

### Output
- `.octocode/tasks.md` - Comprehensive task breakdown

### 🚪 Gate 3: Task Breakdown Approval

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

## 🔬 Phase 4: Context Research

**Agent:** `agent-research-context` (Sonnet model)  
**Duration:** 10-15 minutes (runs in parallel)

### What Happens

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

### Example Context Guide

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

### Output
- `.octocode/context/` - Practical implementation guides

---

## 🎯 Phase 5: Task Orchestration

**Agent:** `agent-manager` (Sonnet model)  
**Duration:** 2-5 minutes

### What Happens

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

### File Lock Protocol

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

### Output
- `.octocode/locks.json` - Active file locks
- `.octocode/logs/progress-dashboard.md` - Real-time progress

---

## 💻 Phase 6: Implementation (PARALLEL)

**Agent:** `agent-implementation` (Sonnet model, 4-5 instances)  
**Duration:** 2-4 hours

### What Happens (Per Agent Instance)

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

### Parallel Execution Timeline

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

### Communication Example

```markdown
[14:27:15] agent-implementation-2 → agent-architect
Question: Should we use WebSocket or polling for price updates?
Context: Task 3.5 - Implementing real-time price feed

[14:28:00] agent-architect → agent-implementation-2
Response: WebSocket with fallback to polling
Reasoning: WebSocket for live updates, polling every 30s as fallback
Updated: .octocode/designs/api-design.md (section 3.2)
```

### Output
- Complete implementation with all features coded and tested

### 🚪 Gate 4: Live Monitoring

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

## ✅ Phase 7: Quality Assurance

**Agent:** `agent-verification` (Sonnet model)  
**Duration:** 30-60 minutes

### What Happens

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

### Output
- `.octocode/verification-report.md` - Complete quality assessment

### 🚪 Gate 5: Final Approval

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

## 🔄 Agent Communication

### Standardized Message Format

```markdown
### [HH:MM:SS] sender-agent → receiver-agent
**Type:** [Question | Response | Status | Issue]
**Field:** Value

[Body content]
```

### Communication Routing

| From Agent | Question Type | Route To |
|------------|---------------|----------|
| agent-implementation | Requirements | agent-product |
| agent-implementation | Backend/API | agent-architect |
| agent-implementation | Frontend/UX | agent-ux |
| agent-architect | Requirements | agent-product |
| agent-architect | UX coordination | agent-ux |
| agent-ux | Backend coordination | agent-architect |

### Communication Log

All messages logged to: `.octocode/debug/communication-log.md`

---

## 📊 Observability System

### 1. Decision Logging
**File:** `.octocode/debug/agent-decisions.json`

Logs every architectural or implementation decision with:
- Decision area
- Chosen option
- Alternatives considered with scores
- Reasoning based on evidence
- Research links
- Confidence level (1-10)

### 2. Communication Logging
**File:** `.octocode/debug/communication-log.md`

All agent-to-agent and agent-to-user communications

### 3. Research Logging
**File:** `.octocode/debug/research-queries.json`

All octocode-mcp research queries with:
- Query parameters
- Repositories found
- Key takeaways
- Which decisions this influenced

### 4. Timeline Tracking
**File:** `.octocode/debug/phase-timeline.json`

Time spent in each phase with performance metrics

---

## 🔒 File Locking System

### Why File Locking?

When 4-5 `agent-implementation` instances run in parallel, they could modify the same file simultaneously, causing conflicts. The file locking system prevents this.

### Lock Workflow

```
Agent needs to modify: [auth.ts, types.ts]
           │
           ▼
Request lock from agent-manager
           │
           ▼
agent-manager checks locks.json
           │
     ┌─────┴─────┐
     │           │
     ▼           ▼
Available?    Locked?
     │           │
     ▼           ▼
  GRANTED      WAIT
Lock files    (retry)
atomically       │
     │           │
     └─────┬─────┘
           ▼
    Implement task
           │
           ▼
  Report completion
           │
           ▼
Release all locks
```

### Atomic Locking

- **All or Nothing:** Lock ALL requested files or NONE
- **Prevents Deadlocks:** Can't acquire partial locks
- **Automatic Cleanup:** Stale locks (>5min) auto-released

---

## 🎯 Key Success Factors

### 1. Parallel Execution (50% Time Savings)
- **Phase 2:** Architecture + UX simultaneously
- **Phase 6:** 4-5 implementation agents simultaneously

### 2. Research-Driven Decisions
- Every tech choice backed by production evidence
- Analyze repos with >500-1000 stars
- Copy-paste ready code examples

### 3. Critical Thinking Framework
- **agent-architect:** Self-questioning, devil's advocate, 3+ alternatives
- **agent-ux:** User empathy, accessibility-first, mobile-first

### 4. Human Control
- 5 approval gates at critical decision points
- Can pause/modify/iterate at any point
- Live progress monitoring

### 5. Quality Assurance
- Self-testing by implementation agents
- Comprehensive verification by QA agent
- Runtime testing in actual browser

### 6. Complete Observability
- Every decision logged with reasoning
- All communications tracked
- Research queries documented
- Timeline tracking

---

## 🚀 Performance Metrics

### Speed
- **Traditional Sequential:** 8-12 hours
- **Octocode Parallel:** 3-5 hours
- **Time Savings:** 50-60% faster

### Quality
- **Test Coverage:** 80-90% (enforced)
- **Code Quality:** 8.5/10 average
- **Production Ready:** All features verified
- **Accessibility:** WCAG 2.1 AA compliance

### Cost Optimization
- **Opus:** 3 agents (strategy/critical thinking)
- **Sonnet:** 5 agents (execution)
- **Token Efficient:** Research-driven reduces trial-and-error

---

## 💡 Resume Functionality

### State Persistence

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
  }
}
```

### Resume Command

```bash
/octocode-generate --resume

# System will:
# 1. Load .octocode/execution-state.json
# 2. Determine current phase
# 3. Load all previous work
# 4. Continue from last checkpoint
```

---

## 📝 Example: Stock Portfolio Tracker

### User Request
```bash
/octocode-generate Build a stock portfolio tracker with real-time price updates,
multiple portfolios, price alerts, and performance charts. Use React and PostgreSQL.
```

### Flow Timeline

**Phase 1 (10 min):** Requirements
- Clarifying questions → PRD created
- **Gate 1:** User approves ✅

**Phase 2 (15 min):** Architecture & UX (Parallel)
- Backend: Next.js + tRPC + Prisma + PostgreSQL
- Frontend: Next.js 14 + Zustand + Recharts
- Coordination: API contracts aligned
- **Gate 2:** User approves both ✅

**Phase 3 (7 min):** Validation
- 35 tasks created, 18 can run in parallel
- **Gate 3:** User approves ✅

**Phase 4 (12 min):** Research
- 6 context guides created from GitHub research
- Copy-paste ready code examples extracted

**Phase 5 (3 min):** Orchestration
- 4 agents spawned
- File locks setup
- **Gate 4:** Live dashboard active

**Phase 6 (2.5 hrs):** Implementation
- 4 agents work in parallel
- All 35 tasks completed
- All tests passing

**Phase 7 (35 min):** Verification
- ✅ Build passes
- ✅ 142 tests pass (89% coverage)
- ✅ All 7 features verified
- ✅ Runtime testing: No errors
- **Gate 5:** User approves ✅

**Total Time:** 3 hours 42 minutes  
**Traditional Time:** 8-10 hours

---

## 🎉 Result

**Production-ready application with:**
- ✅ Complete implementation of all features
- ✅ 80-90% test coverage
- ✅ WCAG 2.1 AA accessible
- ✅ TypeScript strict mode
- ✅ Comprehensive error handling
- ✅ Performance optimized
- ✅ Security best practices
- ✅ Deployment ready
- ✅ Complete documentation

---

## 📚 Learn More

- **[README.md](./README.md)** - Plugin overview and quick start
- **[WORKFLOW_GUIDE.md](./WORKFLOW_GUIDE.md)** - Detailed phase-by-phase breakdown
- **[TECHNICAL_GUIDE.md](./TECHNICAL_GUIDE.md)** - Technical implementation details
- **[COMMUNICATION_STANDARD.md](./COMMUNICATION_STANDARD.md)** - Agent communication protocols

---

**Made with ❤️ by Guy Bary**

🏗️ **Octocode** - Where research meets execution

