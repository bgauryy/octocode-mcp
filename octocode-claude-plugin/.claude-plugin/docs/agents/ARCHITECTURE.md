# 🤖 Agent Architecture

Understanding the 8-agent system and how they work together.

---

## Overview

Octocode Vibe uses **8 specialized agents** working in a coordinated workflow to transform your idea into production-ready code.

### The Team

```
┌─────────────────────────────────────────────────────────────┐
│                    USER REQUEST                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  PHASE 1: Requirements                                       │
│  ┌───────────────────────────────────────────────────┐      │
│  │  agent-product (Opus)                             │      │
│  │  Product Manager - Gathers requirements          │      │
│  └───────────────────────────────────────────────────┘      │
│                        [Gate 1]                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  PHASE 2: Architecture & UX (PARALLEL)                       │
│  ┌────────────────────────┐  ┌────────────────────────┐    │
│  │ agent-architect (Opus) │  │ agent-ux (Opus)        │    │
│  │ Solution Architect     │◄─┤ UX Engineer            │    │
│  │ Backend & APIs         │  │ Frontend & UX          │    │
│  └────────────────────────┘  └────────────────────────┘    │
│                        [Gate 2]                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  PHASE 3: Validation                                         │
│  ┌───────────────────────────────────────────────────┐      │
│  │  agent-design-verification (Sonnet)               │      │
│  │  Technical Lead - Validates & breaks down tasks  │      │
│  └───────────────────────────────────────────────────┘      │
│                        [Gate 3]                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  PHASE 4: Research (Background)                              │
│  ┌───────────────────────────────────────────────────┐      │
│  │  agent-research-context (Sonnet)                  │      │
│  │  Research Specialist - Finds patterns & examples │      │
│  └───────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  PHASE 5-6: Orchestration & Implementation                   │
│  ┌───────────────────────────────────────────────────┐      │
│  │  agent-manager (Sonnet)                           │      │
│  │  Engineering Manager - Coordinates team          │      │
│  │         ↓         ↓         ↓         ↓          │      │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐   │      │
│  │  │ impl-1 │ │ impl-2 │ │ impl-3 │ │ impl-4 │   │      │
│  │  └────────┘ └────────┘ └────────┘ └────────┘   │      │
│  │  agent-implementation (Sonnet) - Software Engineers     │
│  └───────────────────────────────────────────────────┘      │
│                        [Gate 4]                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  PHASE 7: Verification                                       │
│  ┌───────────────────────────────────────────────────┐      │
│  │  agent-verification (Sonnet)                      │      │
│  │  QA Engineer - Tests & validates everything      │      │
│  └───────────────────────────────────────────────────┘      │
│                        [Gate 5]                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
                   PRODUCTION-READY CODE
```

---

## Agent Details

### 1. agent-product (Product Manager)

**Model:** Claude Opus
**Phase:** 1 (Requirements)
**Duration:** 2-5 minutes

**Responsibilities:**
- Ask clarifying questions
- Create comprehensive PRD
- Define features and priorities
- Set success metrics
- Research similar products (GitHub)

**Inputs:**
- User request
- User answers to questions

**Outputs:**
- `.octocode/requirements/prd.md`
- `.octocode/requirements/features.md`
- `.octocode/requirements/user-stories.md`
- `.octocode/requirements/error-handling.md`
- `.octocode/requirements/performance.md`

**Tools:**
- Read, Write, WebSearch, TodoWrite
- octocode-mcp (for GitHub research)

**Critical Thinking:**
- User-focused questioning
- Domain research
- Priority setting

---

### 2. agent-architect (Solution Architect)

**Model:** Claude Opus
**Phase:** 2 (Architecture - runs in parallel with agent-ux)
**Duration:** 5-10 minutes

**Responsibilities:**
- Design system architecture
- Choose tech stack (with research)
- Design database schema
- Design API contracts
- Security & performance strategy
- Coordinate with agent-ux

**Inputs:**
- `.octocode/requirements/*`

**Outputs:**
- `.octocode/designs/architecture.md`
- `.octocode/designs/tech-stack.md`
- `.octocode/designs/database-schema.md`
- `.octocode/designs/api-design.md`
- `.octocode/designs/tradeoffs.md`

**Tools:**
- Read, Write, Grep, Glob, TodoWrite
- octocode-mcp (for architecture research)

**Critical Thinking:**
- Self-questioning (What am I optimizing for?)
- Devil's advocate (What could go wrong?)
- Alternatives evaluation (3+ options per decision)
- Research-driven decisions

**Key Innovation:** Doesn't just pick popular tech - evaluates based on requirements and evidence.

---

### 3. agent-ux (UX Engineer)

**Model:** Claude Opus
**Phase:** 2 (UX Design - runs in parallel with agent-architect)
**Duration:** 5-10 minutes

**Responsibilities:**
- Design user flows
- Create wireframes
- Define component library
- Establish design system
- Plan frontend architecture
- Coordinate with agent-architect

**Inputs:**
- `.octocode/requirements/*`

**Outputs:**
- `.octocode/ux/user-flows.md`
- `.octocode/ux/wireframes.md`
- `.octocode/ux/component-library.md`
- `.octocode/ux/design-system.md`
- `.octocode/ux/frontend-architecture.md`
- `.octocode/ux/accessibility.md`

**Tools:**
- Read, Write, WebSearch, WebFetch, TodoWrite
- octocode-mcp (for UI/UX research)

**Critical Thinking:**
- User empathy (Who is this for? What do they need?)
- Accessibility first (Can everyone use this?)
- Mobile-first design
- Interaction patterns

**Key Innovation:** Runs in parallel with backend architect, ensuring frontend-backend alignment from the start.

---

### 4. agent-design-verification (Technical Lead)

**Model:** Claude Sonnet
**Phase:** 3 (Validation)
**Duration:** 2-3 minutes

**Responsibilities:**
- Validate requirements coverage
- Check architecture soundness
- Create task breakdown
- Identify file dependencies
- Mark parallelization opportunities

**Inputs:**
- `.octocode/requirements/*`
- `.octocode/designs/*`
- `.octocode/ux/*`

**Outputs:**
- `.octocode/tasks.md` (comprehensive task list)

**Tools:**
- Read, Write, Grep, Glob, TodoWrite

**Key Responsibility:** Ensures all requirements are covered and creates parallelizable task breakdown.

---

### 5. agent-research-context (Research Specialist)

**Model:** Claude Sonnet
**Phase:** 4 (Research - runs in background)
**Duration:** 3-5 minutes

**Responsibilities:**
- Research GitHub for implementation patterns
- Extract code examples
- Create context guides
- Document best practices
- Find anti-patterns to avoid

**Inputs:**
- `.octocode/designs/*`
- `.octocode/tasks.md`

**Outputs:**
- `.octocode/context/[topic]-patterns.md` (multiple guides)

**Tools:**
- Read, Write, TodoWrite
- octocode-mcp (PRIMARY tool - GitHub code search)

**Key Innovation:** Creates copy-paste ready code examples from production repositories (>500 stars).

---

### 6. agent-manager (Engineering Manager)

**Model:** Claude Sonnet
**Phase:** 5 (Orchestration) & 6 (Implementation monitoring)
**Duration:** Entire implementation phase

**Responsibilities:**
- Analyze task dependencies
- Create execution plan
- Spawn implementation agents (4-5 in parallel)
- Manage file locks
- Monitor progress
- Handle failures and reassignments
- Update live dashboard

**Inputs:**
- `.octocode/tasks.md`
- `.octocode/context/*`

**Outputs:**
- `.octocode/locks.json` (file lock management)
- `.octocode/logs/progress-dashboard.md`
- `.octocode/execution-state.json` (checkpoints)

**Tools:**
- Read, Write, TodoWrite, Bash, Task

**Key Innovation:** Atomic file locking prevents conflicts when multiple agents work in parallel.

---

### 7. agent-implementation (Software Engineer)

**Model:** Claude Sonnet
**Phase:** 6 (Implementation)
**Duration:** 15-40 minutes total (4-5 instances in parallel)

**Responsibilities:**
- Request file locks
- Implement assigned tasks
- Follow patterns from context guides
- Write tests
- Run linting
- Report completion

**Inputs:**
- Assigned task from agent-manager
- `.octocode/context/*` (implementation patterns)
- `.octocode/designs/*`

**Outputs:**
- Application code (src/*)
- Tests (tests/*)

**Tools:**
- Read, Write, Edit, Bash, Grep, Glob, TodoWrite
- octocode-mcp (for additional examples if needed)

**Key Innovation:** Multiple instances work in parallel without conflicts thanks to file locking.

---

### 8. agent-verification (QA Engineer)

**Model:** Claude Sonnet
**Phase:** 7 (Verification)
**Duration:** 3-5 minutes

**Responsibilities:**
- Run build
- Run all tests
- Run linting
- Verify all features implemented
- Static code analysis
- Runtime testing (Chrome DevTools)
- Create verification report

**Inputs:**
- Complete codebase
- `.octocode/requirements/*`
- `.octocode/designs/*`

**Outputs:**
- `.octocode/verification-report.md`

**Tools:**
- Read, Bash, Grep, Glob, TodoWrite
- chrome-devtools-mcp (for runtime testing)

**Key Innovation:** Tests application in real Chrome browser, not just unit tests.

---

## Agent Communication

### Communication Protocol

Agents communicate through messages logged to `.octocode/debug/communication-log.md`:

```markdown
### [14:15:32] agent-architect → agent-ux
**Topic:** Frontend Framework Recommendation
**Message:** I recommend Next.js 14 with App Router...
**Your input?**

### [14:16:12] agent-ux → agent-architect
**Response:** Agreed on Next.js 14
**API Requirements:** Need these endpoints...
```

### Communication Patterns

**1. Coordination (Phase 2):**
- agent-architect ↔ agent-ux
- Agree on framework, API contracts, real-time strategy

**2. Clarification:**
- agent-implementation → agent-product (requirements)
- agent-implementation → agent-architect (technical)

**3. Task Assignment:**
- agent-manager → agent-implementation (x5)

**4. Progress Updates:**
- agent-implementation → agent-manager

**5. Issue Escalation:**
- agent-verification → agent-manager (critical issues)

---

## Model Selection Strategy

### Why Opus for Strategy (3 agents)
- **agent-product:** Complex requirements analysis
- **agent-architect:** Critical tech decisions
- **agent-ux:** User-centric design thinking

**Benefits:**
- Better at reasoning through tradeoffs
- Critical thinking and self-questioning
- Evaluating multiple alternatives

### Why Sonnet for Execution (5 agents)
- **agent-design-verification:** Task breakdown
- **agent-research-context:** Code extraction
- **agent-manager:** Orchestration logic
- **agent-implementation:** Code writing (x5)
- **agent-verification:** Testing and validation

**Benefits:**
- Faster execution
- Cost-effective for parallel work
- Still excellent at implementation

---

## Parallelization Strategy

### Parallel Execution Points

**Phase 2:** agent-architect + agent-ux (2 parallel)
- **Time saved:** ~50% (10 min → 5-7 min)
- **Benefit:** Frontend-backend alignment from start

**Phase 6:** Multiple agent-implementation (4-5 parallel)
- **Time saved:** ~75% (40 min → 10-15 min)
- **Benefit:** Fast implementation without conflicts

### File Locking System

```json
{
  "locks": {
    "src/auth/auth.ts": {
      "lockedBy": "agent-implementation-1",
      "taskId": "3.1",
      "acquiredAt": "2025-10-13T14:30:00Z"
    }
  }
}
```

**Rules:**
1. Agent requests locks for ALL files before starting
2. If ANY file is locked, agent waits
3. Timeout after 30 seconds → report to manager
4. On completion, atomically release all locks

---

## State Management

### Checkpointing

After every major milestone:
- Phase completion
- Task completion
- Gate approval

**State file:** `.octocode/execution-state.json`

```json
{
  "version": "1.0",
  "timestamp": "2025-10-13T14:30:00Z",
  "currentPhase": "implementation",
  "phaseStatus": { "implementation": "in-progress" },
  "tasks": { "total": 35, "completed": 23 },
  "activeAgents": [...]
}
```

**Benefits:**
- Resume after interruption
- Track progress
- Debug issues
- Audit trail

---

## Observability

### Decision Logging

Every architectural or UX decision logged to `.octocode/debug/agent-decisions.json`:

```json
{
  "id": "decision-arch-001",
  "timestamp": "2025-10-13T14:15:00Z",
  "agent": "agent-architect",
  "decision": {
    "area": "Database Selection",
    "chosen": "PostgreSQL + Prisma ORM",
    "alternatives": [...],
    "reasoning": "...",
    "confidence": 9
  }
}
```

### Research Logging

All GitHub research logged to `.octocode/debug/research-queries.json`:

```json
{
  "id": "research-001",
  "agent": "agent-research-context",
  "query": {
    "tool": "octocode-mcp",
    "parameters": { "keywords": ["tRPC", "Prisma"] }
  },
  "results": {
    "repositoriesFound": 12,
    "topResults": [...]
  }
}
```

---

## Quality Assurance

### Agent-Level Quality

Each agent has a quality checklist before completing:
- ✅ All inputs processed
- ✅ All outputs created
- ✅ Decisions logged
- ✅ Communication documented

### System-Level Quality

- **Requirements coverage:** agent-design-verification validates
- **Code quality:** agent-verification checks linting, tests
- **Production readiness:** agent-verification comprehensive checks
- **Runtime verification:** Chrome DevTools testing

---

## Failure Handling

### Agent Failures

**If agent reports error:**
1. agent-manager analyzes cause
2. Determines action:
   - Technical issue → Reassign to different agent
   - Design issue → Escalate to agent-architect
   - Requirement unclear → Escalate to agent-product
3. Logs to `.octocode/logs/issues-log.md`
4. Continues with other tasks

### File Lock Timeouts

**If agent can't acquire lock (30s):**
1. Reports blocked to agent-manager
2. Gets assigned different task
3. Returns to blocked task when lock available

### Build/Test Failures

**If agent-verification finds issues:**
1. Creates detailed issue report
2. Notifies agent-manager
3. Tasks created to fix issues
4. Re-runs verification after fixes

---

## Performance Metrics

### Speed

| Phase | Sequential Time | Parallel Time | Speedup |
|-------|----------------|---------------|---------|
| Phase 1 | 5 min | 5 min | 1x |
| Phase 2 | 15 min | 7 min | 2.1x |
| Phase 3 | 3 min | 3 min | 1x |
| Phase 4 | 5 min | 5 min | 1x |
| Phase 5-6 | 40 min | 12 min | 3.3x |
| Phase 7 | 5 min | 5 min | 1x |
| **Total** | **73 min** | **37 min** | **2x** |

### Quality

- **Test Coverage:** 80-90% (enforced)
- **Code Quality:** 8.5/10 average
- **Production Ready:** All features verified
- **Accessibility:** WCAG 2.1 AA compliance

---

## Best Practices

### For Plugin Users

1. **Review at Gates:** Don't rush through approvals
2. **Provide Context:** More detail = better results
3. **Trust the Process:** Agents know what they're doing
4. **Monitor Progress:** Check Gate 4 dashboard

### For Agent Developers

1. **Logging:** Log all decisions with reasoning
2. **Communication:** Clear, structured messages
3. **Error Handling:** Always handle failures gracefully
4. **Testing:** Verify before reporting complete

### For Contributors

1. **Agent Focus:** Each agent has clear responsibility
2. **Model Selection:** Use Opus for strategy, Sonnet for execution
3. **Parallelization:** Identify opportunities for parallel work
4. **State Management:** Checkpoint frequently

---

## Future Enhancements

### Planned for v1.1
- [ ] Workflow templates (quick-prototype, mvp, production-grade)
- [ ] Performance metrics collection
- [ ] Real-time dashboard streaming

### Planned for v1.2
- [ ] Message queue for agent coordination (Redis)
- [ ] Dynamic workflow modification
- [ ] Cost tracking and optimization

### Planned for v2.0
- [ ] Visual architecture diagram generation (Mermaid)
- [ ] Pattern validation sandbox
- [ ] Multi-language support

---

**The 8-agent architecture enables production-ready code generation with quality, speed, and reliability! 🤖🏗️**
