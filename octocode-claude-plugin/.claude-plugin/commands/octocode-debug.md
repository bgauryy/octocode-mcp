---
description: Debug and inspect agent decisions, communications, and research queries
---

# Octocode Debug Command

Inspect the observability data generated during development sessions.

## Usage

```bash
# Show debug dashboard
/octocode-debug

# View specific phase details
/octocode-debug architecture
/octocode-debug requirements
/octocode-debug implementation

# View specific task trace
/octocode-debug task:3.2

# View specific agent's decisions
/octocode-debug agent:agent-architect

# View all research queries
/octocode-debug research

# View communication log
/octocode-debug communications

# View error traces
/octocode-debug errors

# View phase timeline
/octocode-debug timeline
```

## Command Logic

Parse argument `$ARGUMENTS`:

### No Arguments → Dashboard

Read `.octocode/debug/` and display:

```markdown
🔍 OCTOCODE DEBUG DASHBOARD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Session Overview:
  • Session ID: [from execution-state.json]
  • Started: [timestamp]
  • Current Phase: [current phase]
  • Duration: [elapsed time]

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
  • agent-design-verification: 1 session (5m) - 35 tasks
  • agent-research-context: 1 session (8m) - 7 guides
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
  • Warnings: 1

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

### Phase Name → Phase Details

Read `.octocode/debug/agent-decisions.json` filtered by phase:

```markdown
🔍 DEBUG: Architecture Phase
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Overview:
  • Duration: 10m 0s
  • Agent: agent-architect
  • Decisions Made: 12
  • Research Queries: 8
  • Communications: 2

🎯 Key Decisions:

[1] Database Selection (14:15:00)
  ✅ Chosen: PostgreSQL + Prisma ORM
  📊 Confidence: 9/10

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
  ... [similar format]

💬 Communications: 2 total
  [Show communication excerpts]

🔬 Research Queries: 8 total
  [Link to research details]
```

### task:ID → Task Trace

Read `.octocode/debug/task-traces/task-{id}.json` (if exists) or filter from decisions:

```markdown
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

🤔 Decisions Made: 2

[1] Error Handling Strategy (14:26:30)
  Chose: tRPC error codes with custom messages
  Why: Type-safe errors, better client handling
  Context: .octocode/context/trpc-prisma-integration.md

💬 Communications: 2

[14:27:15] agent-implementation-2 → agent-architect
  Q: "Should we use WebSocket or polling?"
  A: "WebSocket with polling fallback"

🔒 Locks:
  • Acquired: 14:25:05
  • Files: [api.ts, routes.ts, index.ts]
  • Released: 14:32:20
  • Conflicts: None

📂 Full trace: .octocode/debug/task-traces/task-3.2.json
```

### agent:NAME → Agent Decisions

Filter decisions by agent:

```markdown
🔍 DEBUG: agent-architect
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Overview:
  • Sessions: 1
  • Duration: 10m 0s
  • Decisions: 12
  • Research Queries: 8
  • Communications: 2

🎯 Decisions (12 total):

[Show all decisions by this agent in chronological order]

💬 Communications (2 total):

[Show all communications involving this agent]

🔬 Research (8 queries):

[Show all research performed by this agent]
```

### research → All Research

Read `.octocode/debug/research-queries.json`:

```markdown
🔬 RESEARCH QUERIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Overview:
  • Total Queries: 15
  • Repository Searches: 8
  • Code Searches: 3
  • File Inspections: 4
  • Influenced Decisions: 24

🔍 Queries:

[1] Repository Search (14:12:00)
  • Agent: agent-architect
  • Query: "stock portfolio tracker TypeScript"
  • Results: 12 repositories
  • Top: maybe-finance/maybe (15,234 stars)
  • Influenced: decision-arch-001, decision-arch-003

[2] File Inspection (14:20:00)
  • Agent: agent-research-context
  • File: maybe-finance/maybe/apps/server/src/trpc/routers/portfolio.ts
  • Patterns Found: 3
  • Saved To: .octocode/context/trpc-prisma-integration.md

[Continue for all queries...]

📂 Full details: .octocode/debug/research-queries.json
```

### communications → Communication Log

Read `.octocode/debug/communication-log.md` and format:

```markdown
💬 AGENT COMMUNICATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Overview:
  • Total: 18 communications
  • User ↔ Agents: 5
  • Inter-agent: 13

📋 Log:

[14:05:23] agent-product → User
  **Q:** Should we support real-time updates?
  **Context:** Designing data refresh strategy
  **A:** Yes, but 15-min delay is fine for MVP

[14:15:32] agent-architect → agent-product
  **Q:** Should caching be configurable per user?
  **A:** Not for MVP, keep simple
  **Impact:** Simplified caching design

[14:22:45] agent-implementation-2 → agent-architect
  **Q:** WebSocket or polling for price updates?
  **A:** WebSocket with fallback to polling
  **Updated:** .octocode/designs/api-design.md

[Continue for all communications...]

📂 Full log: .octocode/debug/communication-log.md
```

### errors → Error Traces

Read `.octocode/debug/error-traces/`:

```markdown
⚠️  ERROR TRACES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Overview:
  • Total Errors: 3
  • Resolved: 3
  • Unresolved: 0

❌ Errors:

[1] Task 3.2 Failure - Redis Connection (14:22:00)
  • Task: 3.2 - Configure Redis cache
  • Agent: agent-implementation-3
  • Error: ECONNREFUSED - Redis not running
  • Diagnosis: Redis service not installed
  • Resolution: Added Redis to prerequisites, reassigned
  • Status: ✅ Resolved (retry successful)

[2] Task 3.7 Failure - Lock Timeout (14:35:00)
  • Task: 3.7 - Update auth.ts
  • Agent: agent-implementation-4
  • Error: Lock timeout (30s) waiting for auth.ts
  • Diagnosis: Task 3.1 taking longer than expected
  • Resolution: Reassigned to agent-implementation-5 after 3.1 completed
  • Status: ✅ Resolved

[Continue for all errors...]

📂 Error files: .octocode/debug/error-traces/
```

### timeline → Phase Timeline

Read `.octocode/debug/phase-timeline.json`:

```markdown
⏱️  PHASE TIMELINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Session: uuid-v4
Started: 2025-10-12T14:00:00Z

📈 Phases:

✅ Phase 1: Requirements (14:00:00 - 14:10:00)
  • Duration: 10m 0s
  • Agent: agent-product
  • Decisions: 5
  • User Interactions: 3
  • Output: .octocode/requirements/

✅ Phase 2: Architecture (14:10:00 - 14:20:00)
  • Duration: 10m 0s
  • Agent: agent-architect
  • Decisions: 12
  • Research: 8 queries
  • Output: .octocode/designs/

✅ Phase 3: Design Verification (14:20:00 - 14:25:00)
  • Duration: 5m 0s
  • Agent: agent-design-verification
  • Tasks Created: 35
  • Issues Found: 0
  • Output: .octocode/tasks.md

✅ Phase 4: Research (14:25:00 - 14:33:00)
  • Duration: 8m 0s
  • Agent: agent-research-context
  • Queries: 7
  • Guides Created: 7
  • Output: .octocode/context/

✅ Phase 5: Orchestration (14:33:00 - 14:35:00)
  • Duration: 2m 0s
  • Agent: agent-manager
  • Execution Plan: Created
  • Agents Spawned: 4

🔄 Phase 6: Implementation (14:35:00 - 16:30:00)
  • Duration: 1h 55m (in progress)
  • Progress: 23/35 tasks (65%)
  • Active Agents: 3
  • Failures: 1 (resolved)

⏸️  Phase 7: Verification (pending)

📂 Full timeline: .octocode/debug/phase-timeline.json
```

## Implementation Notes

Use Read tool to access:
- `.octocode/execution-state.json` - For session info and progress
- `.octocode/debug/agent-decisions.json` - For all decisions
- `.octocode/debug/communication-log.md` - For communications
- `.octocode/debug/research-queries.json` - For research
- `.octocode/debug/phase-timeline.json` - For timeline
- `.octocode/debug/error-traces/*.json` - For errors

Format output in clean, readable markdown with visual separators.

Help users understand what happened during development and why decisions were made!
