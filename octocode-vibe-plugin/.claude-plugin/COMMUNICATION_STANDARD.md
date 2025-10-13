# Communication Log Standard Format

## Purpose
Standardized format for inter-agent communication to ensure consistency across all agent markdown files and debug logs.

## Standard Format

```markdown
### [HH:MM:SS] sender-agent → receiver-agent
**Type:** [Question | Response | Status | Issue | Assignment | Notification]
**Field:** Value
**Field:** Value
...

[Optional body content]
```

## Format Rules

1. **Timestamp**: Always use `[HH:MM:SS]` format (24-hour)
2. **Arrow**: Always use ` → ` (space-arrow-space) for direction
3. **Agent Names**: Use full agent-* format (e.g., `agent-architect`, not `architect`)
4. **Type Field**: MUST be first field after header, capitalized
5. **Bold Fields**: Use `**Field:**` format consistently
6. **Line Breaks**: Single line break between field and body, double between messages

## Message Types

### Question
Used when an agent needs information from another agent.

```markdown
### [14:15:32] agent-architect → agent-product
**Type:** Question
**Question:** Should caching be configurable per user?
**Context:** Designing caching strategy for API responses
**Reasoning:** Need to decide if cache TTL should be user-specific
```

### Response
Used to answer a question or provide requested information.

```markdown
### [14:16:15] agent-product → agent-architect
**Type:** Response
**Answer:** Not for MVP, keep it simple
**Impact:** Simplified caching design - global TTL only
**Reference:** See .octocode/requirements/prd.md section 5.3
```

### Status
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

### Issue
Used to report problems, blockers, or concerns.

```markdown
### [14:20:00] agent-design-verification → agent-architect
**Type:** Issue
**Issue:** No error handling strategy for database connection failures
**Severity:** High
**Impact:** Application will crash on DB disconnect
**Request:** Please add database connection error handling to design
```

### Assignment
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

### Notification
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

## Common Fields by Type

### Question
- `**Type:** Question` (required)
- `**Question:**` (required)
- `**Context:**` (recommended)
- `**Reasoning:**` (optional)
- `**Options:**` (optional - for multiple choice)

### Response
- `**Type:** Response` (required)
- `**Answer:**` (required)
- `**Impact:**` (optional)
- `**Reference:**` (optional)
- `**Updated:**` (optional - what docs were updated)

### Status
- `**Type:** Status` (required)
- `**Task ID:**` (required for implementation agents)
- `**Status:**` (required - use emojis: ✅ 🔄 ⏸️  ❌ ⚠️)
- `**Duration:**` (optional)
- `**Files Modified:**` (optional)
- `**Summary:**` (recommended)

### Issue
- `**Type:** Issue` (required)
- `**Issue:**` (required - brief description)
- `**Severity:**` (required - Critical/High/Medium/Low)
- `**Impact:**` (required)
- `**Request:**` (recommended)

### Assignment
- `**Type:** Assignment` (required)
- `**Task:**` (required)
- `**Files to Lock:**` (optional)
- `**Context:**` (optional)
- `**Estimated:**` (optional)
- `**Lock Status:**` (optional)

## Multi-Part Communication

For related exchanges, group them chronologically:

```markdown
### [14:15:00] agent-architect → agent-ux
**Type:** Question
**Topic:** Frontend Framework Recommendation
**Question:** Should we use Next.js or Vite+React?

I recommend **Next.js 14** with App Router for frontend because:
- Server components for better performance
- API routes for BFF pattern
- Excellent TypeScript support
- Aligns with tRPC backend

**Your input?**
```

```markdown
### [14:16:00] agent-ux → agent-architect
**Type:** Response
**Answer:** Agreed on Next.js 14

**API Requirements from UX:**
1. Need `/api/dashboard/summary` for portfolio stats
2. Real-time price updates via WebSocket preferred
3. Pagination for holdings (cursor-based)
4. Support for optimistic updates (return updated data)

**Question:** Can your API design support these?
```

```markdown
### [14:17:00] agent-architect → agent-ux
**Type:** Response
**Answer:** All supported

- Using tRPC subscriptions for real-time prices
- Cursor pagination implemented
- All mutations return updated state

**Updated:** .octocode/designs/api-design.md with your requirements
```

## Logging to communication-log.md

All communication should be logged to `.octocode/debug/communication-log.md` using this exact format.

## Anti-Patterns to Avoid

❌ **Inconsistent timestamps**:
- Bad: `[Time]`, `[14:15]`, `14:15:00`
- Good: `[14:15:00]`

❌ **Inconsistent arrows**:
- Bad: `agent-a->agent-b`, `agent-a > agent-b`, `agent-a to agent-b`
- Good: `agent-a → agent-b`

❌ **Missing Type field**:
- Bad: Starting with `**Question:**` directly
- Good: Always start with `**Type:** Question`

❌ **Inconsistent field formatting**:
- Bad: `Question:`, `*Question:*`, `QUESTION:`
- Good: `**Question:**`

❌ **Abbreviated agent names**:
- Bad: `architect → ux`, `impl-2 → manager`
- Good: `agent-architect → agent-ux`, `agent-implementation-2 → agent-manager`

## Benefits

1. **Parseable**: Easy to extract and analyze programmatically
2. **Searchable**: Consistent format makes grep/search reliable
3. **Readable**: Clear structure for humans
4. **Traceable**: Timestamps enable chronological analysis
5. **Typed**: Message types enable categorization
6. **Complete**: Standard fields ensure no missing information
