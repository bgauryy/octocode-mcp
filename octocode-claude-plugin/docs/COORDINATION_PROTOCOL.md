# Agent Coordination Protocol

**Version:** 1.0  
**Updated:** 2025-10-16

## Overview

This document defines the **standard protocol** for agent coordination using `octocode-local-memory`. All agents MUST follow these patterns to avoid race conditions, file conflicts, and coordination failures.

## Core Principles

1. **Atomic Operations**: Use storage as source of truth (not files)
2. **File Locking**: MANDATORY before ANY file edit
3. **Immediate Cleanup**: Release locks within 5 minutes
4. **Consistent Keys**: Follow exact namespace patterns
5. **TTL Management**: Specify appropriate expiration times

---

## Storage Key Namespaces

### 1. Task Coordination

#### Task Metadata (Manager → Implementation Agents)
**Created by**: Manager  
**Read by**: Implementation agents  
**Purpose**: Task definition and scope

```typescript
Key: "task:meta:{taskId}"
Value: {
  description: string,           // What to implement
  files: string[],               // Files to modify/create
  complexity: "LOW" | "MEDIUM" | "HIGH",
  dependencies?: string[],       // Other task IDs that must complete first
  phase: string                  // e.g., "setup", "core", "integration"
}
TTL: 7200 (2 hours)
```

**Example**:
```javascript
setStorage("task:meta:1.1", {
  description: "Initialize project with boilerplate",
  files: ["package.json", "tsconfig.json"],
  complexity: "LOW",
  phase: "setup"
}, 7200)
```

#### Task Execution Status (Implementation Agents)
**Created by**: Implementation agents  
**Read by**: Manager, other agents  
**Purpose**: Track execution state

```typescript
Key: "task:status:{taskId}"
Value: {
  status: "available" | "claimed" | "in_progress" | "completed" | "blocked",
  agentId: string,               // Who owns this task
  progress: number,              // 0-100
  timestamp: number,             // Unix timestamp
  claimedAt?: number,            // When claimed (for stale detection)
  completedAt?: number,          // When completed
  filesChanged?: string[],       // Files actually modified
  error?: string                 // Error message if blocked
}
TTL: 7200 (2 hours)
```

**Example**:
```javascript
// Claim task
setStorage("task:status:1.1", {
  status: "claimed",
  agentId: "impl-x7k3p9",
  progress: 0,
  timestamp: Date.now(),
  claimedAt: Date.now()
}, 7200)

// Update progress
setStorage("task:status:1.1", {
  status: "in_progress",
  agentId: "impl-x7k3p9",
  progress: 50,
  timestamp: Date.now(),
  claimedAt: 1697456789000
}, 7200)

// Mark complete
setStorage("task:status:1.1", {
  status: "completed",
  agentId: "impl-x7k3p9",
  progress: 100,
  timestamp: Date.now(),
  completedAt: Date.now(),
  filesChanged: ["package.json", "tsconfig.json"]
}, 7200)
```

#### Blocked Task Signals
**Purpose**: Signal need for help when task fails

```typescript
Key: "task:blocked:{taskId}"
Value: {
  agentId: string,
  error: string,
  files: string[],
  timestamp: number
}
TTL: 1800 (30 minutes)
```

---

### 2. File Locking (CRITICAL)

**Purpose**: Prevent concurrent edits to same file  
**Rule**: NEVER edit a file without acquiring its lock first

```typescript
Key: "lock:{filepath}"
Value: {
  agentId: string,
  taskId: string,
  timestamp: number
}
TTL: 300 (5 minutes - MUST complete edits within this time!)
```

#### File Lock Protocol (MANDATORY)

```javascript
// BEFORE editing ANY file
const filepath = "src/components/Auth.tsx";
const lockKey = `lock:${filepath}`;

// 1. Check if locked
const lock = getStorage(lockKey);

if (lock && lock.agentId !== myAgentId) {
  // File is locked by another agent
  console.log(`File ${filepath} locked by ${lock.agentId}, waiting...`);
  // Wait or skip to another file
  return;
}

// 2. Acquire lock
setStorage(lockKey, {
  agentId: myAgentId,
  taskId: currentTaskId,
  timestamp: Date.now()
}, 300); // 5 minute TTL

// 3. Edit file
await editFile(filepath, changes);

// 4. IMMEDIATELY release lock (CRITICAL!)
deleteStorage(lockKey);
```

**⚠️ CRITICAL RULES:**
- ❌ NEVER edit without acquiring lock
- ❌ NEVER forget to release lock
- ❌ NEVER hold lock longer than 5 minutes
- ✅ ALWAYS release lock after editing (even if error occurs)
- ✅ USE try/finally to guarantee lock release

```javascript
// BEST PRACTICE: Use try/finally
const lockKey = `lock:${filepath}`;
try {
  setStorage(lockKey, {agentId: myAgentId, taskId, timestamp: Date.now()}, 300);
  await editFile(filepath, changes);
} finally {
  deleteStorage(lockKey); // ALWAYS releases, even on error
}
```

---

### 3. Agent Registration & Status

#### Agent Status
**Purpose**: Track agent lifecycle

```typescript
Key: "agent:{agentId}:status"
Value: {
  status: "ready" | "working" | "completed" | "failed",
  timestamp: number,
  currentTaskId?: string,
  tasksCompleted?: number
}
TTL: 7200 (2 hours)
```

**Example**:
```javascript
// On startup
const agentId = "impl-" + Math.random().toString(36).substr(2, 9);
setStorage(`agent:${agentId}:status`, {
  status: "ready",
  timestamp: Date.now(),
  tasksCompleted: 0
}, 7200);

// When working
setStorage(`agent:${agentId}:status`, {
  status: "working",
  timestamp: Date.now(),
  currentTaskId: "1.1",
  tasksCompleted: 0
}, 7200);

// On completion
setStorage(`agent:${agentId}:status`, {
  status: "completed",
  timestamp: Date.now(),
  tasksCompleted: 3
}, 7200);
```

#### Agent Progress (Optional - for monitoring)
**Purpose**: Fine-grained progress tracking

```typescript
Key: "status:agent-{agentId}:{taskId}"
Value: {
  status: string,
  progress: number,
  message?: string
}
TTL: 3600 (1 hour)
```

---

### 4. QA Coordination

#### QA Status
**Purpose**: Signal QA completion to manager

```typescript
Key: "qa:status"
Value: "complete" | "in_progress" | "failed"
TTL: 3600 (1 hour)
```

#### QA Results
**Purpose**: Detailed QA findings

```typescript
Key: "qa:result"
Value: JSON.stringify({
  critical: number,
  warnings: number,
  status: "clean" | "issues",
  filesScanned: number,
  timestamp: number
})
TTL: 3600 (1 hour)
```

#### QA Fix Signal
**Purpose**: Signal need for bug fixes

```typescript
Key: "qa:fix-needed"
Value: "true"
TTL: 3600 (1 hour)
```

**Example**:
```javascript
// QA Agent signals completion
setStorage("qa:status", "complete", 3600);
setStorage("qa:result", JSON.stringify({
  critical: 2,
  warnings: 5,
  status: "issues",
  filesScanned: 15,
  timestamp: Date.now()
}), 3600);
setStorage("qa:fix-needed", "true", 3600);

// Manager reads results
const qaStatus = getStorage("qa:status");
const qaResult = JSON.parse(getStorage("qa:result"));
if (qaResult.critical > 0) {
  spawnFixAgents();
}

// Cleanup after handling
deleteStorage("qa:status");
deleteStorage("qa:result");
deleteStorage("qa:fix-needed");
```

---

### 5. Workflow Coordination (Manager Only)

#### Workflow Status
**Purpose**: Track overall workflow state

```typescript
Key: "workflow:status"
Value: "planning" | "implementation" | "qa" | "qa-passed" | "complete"
TTL: 3600 (1 hour)
```

#### Workflow Completion
**Purpose**: Signal final completion

```typescript
Key: "workflow:complete"
Value: "true"
TTL: 3600 (1 hour)
```

#### QA Iteration Counter
**Purpose**: Track QA loops (max 2)

```typescript
Key: "qa:iteration"
Value: number (1 or 2)
TTL: 3600 (1 hour)
```

---

### 6. Questions & Answers

#### Question Pattern
**Purpose**: Ask for help/clarification

```typescript
Key: "question:{source}-{sourceId}:{target}:{topic}"
Value: {
  question: string,
  context: any,
  timestamp: number
}
TTL: 1800 (30 minutes)
```

#### Answer Pattern
**Purpose**: Respond to questions

```typescript
Key: "answer:{source}-{sourceId}:{target}:{topic}"
Value: {
  answer: string,
  timestamp: number
}
TTL: 1800 (30 minutes)
```

**Example**:
```javascript
// Implementation agent asks architect
setStorage("question:impl-x7k3p9:architect:auth-pattern", {
  question: "Should I use JWT or session-based auth?",
  context: {taskId: "2.1", files: ["src/auth.ts"]},
  timestamp: Date.now()
}, 1800);

// Check for answer (poll every 10 seconds, max 2 minutes)
const answer = getStorage("answer:impl-x7k3p9:architect:auth-pattern");
if (answer) {
  console.log(answer.answer);
}
```

---

## Stale Task Recovery

**Problem**: What if an agent crashes after claiming a task?

**Solution**: Detect stale tasks and reclaim them

```javascript
const taskStatus = getStorage("task:status:1.1");
const now = Date.now();
const staleThreshold = 600000; // 10 minutes in milliseconds

if (taskStatus.status === "claimed" || taskStatus.status === "in_progress") {
  if (now - taskStatus.claimedAt > staleThreshold) {
    // Task is stale - reclaim it
    console.log(`Task 1.1 stale (claimed by ${taskStatus.agentId}), reclaiming...`);
    setStorage("task:status:1.1", {
      status: "claimed",
      agentId: myAgentId,
      progress: 0,
      timestamp: Date.now(),
      claimedAt: Date.now(),
      reclaimedFrom: taskStatus.agentId
    }, 7200);
  }
}
```

---

## Race Condition Prevention

### Atomic Task Claiming

**Problem**: Two agents try to claim same task simultaneously

**Solution**: Claim → Verify ownership pattern

```javascript
// 1. Attempt to claim
setStorage("task:status:1.1", {
  status: "claimed",
  agentId: myAgentId,
  timestamp: Date.now(),
  claimedAt: Date.now()
}, 7200);

// 2. IMMEDIATELY verify we own it (re-read)
const verify = getStorage("task:status:1.1");

if (verify.agentId === myAgentId) {
  // SUCCESS - we own it
  console.log("Task claimed successfully");
  proceedWithTask();
} else {
  // FAILED - another agent claimed it first
  console.log(`Task claimed by ${verify.agentId}, trying next task`);
  findNextTask();
}
```

---

## TTL Guidelines

| Data Type | TTL | Reason |
|-----------|-----|--------|
| **File locks** | 300s (5 min) | Force release if agent crashes |
| **Questions/Answers** | 1800s (30 min) | Temporary coordination |
| **Agent status** | 7200s (2 hrs) | Persist through workflow |
| **Task metadata** | 7200s (2 hrs) | Persist through workflow |
| **Task status** | 7200s (2 hrs) | Need final status for reporting |
| **QA signals** | 3600s (1 hr) | Medium-term coordination |
| **Workflow status** | 3600s (1 hr) | Active workflow tracking |

**Rule**: Always specify TTL explicitly - never rely on defaults!

---

## Common Patterns

### Pattern 1: Implementation Agent Main Loop

```javascript
const agentId = "impl-" + Math.random().toString(36).substr(2, 9);

// Register
setStorage(`agent:${agentId}:status`, {
  status: "ready",
  timestamp: Date.now()
}, 7200);

// Main loop
while (true) {
  // Find available task
  const tasks = readTasksFromSpec();
  let claimed = false;
  
  for (const taskId of tasks) {
    const status = getStorage(`task:status:${taskId}`);
    
    if (!status || status.status === "available") {
      // Try to claim
      setStorage(`task:status:${taskId}`, {
        status: "claimed",
        agentId: agentId,
        timestamp: Date.now(),
        claimedAt: Date.now()
      }, 7200);
      
      // Verify
      const verify = getStorage(`task:status:${taskId}`);
      if (verify.agentId === agentId) {
        claimed = true;
        await executeTask(taskId);
        break;
      }
    }
  }
  
  if (!claimed) {
    // Check if all tasks complete
    const allComplete = tasks.every(id => {
      const s = getStorage(`task:status:${id}`);
      return s && s.status === "completed";
    });
    
    if (allComplete) {
      // Done!
      setStorage(`agent:${agentId}:status`, {
        status: "completed",
        timestamp: Date.now()
      }, 7200);
      break;
    }
    
    // Wait and retry
    await sleep(10000); // 10 seconds
  }
}
```

### Pattern 2: Safe File Editing

```javascript
async function editFileSafely(filepath, changes) {
  const lockKey = `lock:${filepath}`;
  
  try {
    // Check lock
    const existing = getStorage(lockKey);
    if (existing && existing.agentId !== myAgentId) {
      throw new Error(`File locked by ${existing.agentId}`);
    }
    
    // Acquire lock
    setStorage(lockKey, {
      agentId: myAgentId,
      taskId: currentTaskId,
      timestamp: Date.now()
    }, 300);
    
    // Edit file
    await writeFile(filepath, changes);
    
    // Verify build
    await runBuild();
    
  } finally {
    // ALWAYS release lock
    deleteStorage(lockKey);
  }
}
```

### Pattern 3: QA Agent Workflow

```javascript
// Run QA checks
const results = await scanForBugs();

// Write report
await writeFile("PROJECT_SPEC.md", appendQAReport(results));

// Signal completion
setStorage("qa:status", "complete", 3600);
setStorage("qa:result", JSON.stringify({
  critical: results.critical.length,
  warnings: results.warnings.length,
  status: results.critical.length > 0 ? "issues" : "clean",
  filesScanned: results.filesScanned,
  timestamp: Date.now()
}), 3600);

if (results.critical.length > 0 && results.critical.length <= 5) {
  // Signal fix needed
  setStorage("qa:fix-needed", "true", 3600);
}

// Manager will read these keys and decide next action
```

---

## Debugging Tips

### View All Active Tasks
```javascript
// Check all task statuses
for (let i = 1; i <= 15; i++) {
  const status = getStorage(`task:status:1.${i}`);
  if (status) {
    console.log(`Task 1.${i}: ${status.status} by ${status.agentId}`);
  }
}
```

### View All File Locks
```javascript
// Check which files are locked
const files = ["src/auth.ts", "src/api/routes.ts", "src/components/Login.tsx"];
for (const file of files) {
  const lock = getStorage(`lock:${file}`);
  if (lock) {
    console.log(`${file}: locked by ${lock.agentId}`);
  }
}
```

### View Agent Status
```javascript
// Check all agents
const agentIds = ["impl-x7k3p9", "impl-m2n8q5", "impl-r4t7k1"];
for (const id of agentIds) {
  const status = getStorage(`agent:${id}:status`);
  if (status) {
    console.log(`${id}: ${status.status}`);
  }
}
```

---

## Error Handling

### Lock Acquisition Failure
```javascript
const maxRetries = 3;
const retryDelay = 5000; // 5 seconds

for (let i = 0; i < maxRetries; i++) {
  const lock = getStorage(lockKey);
  if (!lock || lock.agentId === myAgentId) {
    // Can proceed
    break;
  }
  
  if (i < maxRetries - 1) {
    console.log(`File locked, waiting... (${i+1}/${maxRetries})`);
    await sleep(retryDelay);
  } else {
    // Skip this file, work on others
    console.log(`File locked after ${maxRetries} retries, skipping`);
    return;
  }
}
```

### Task Claim Failure (Race Condition)
```javascript
// Just move to next task - don't retry same task
// (Another agent successfully claimed it)
const verify = getStorage(`task:status:${taskId}`);
if (verify.agentId !== myAgentId) {
  console.log(`Task ${taskId} claimed by another agent, trying next task`);
  continue; // Try next task in list
}
```

---

## Migration from Old Patterns

If you see these old patterns in code, update them:

### ❌ Old Pattern
```javascript
// Single "task" key with mixed data
setStorage("task:1.1", {description: "...", status: "claimed"})
```

### ✅ New Pattern
```javascript
// Separate metadata and status
setStorage("task:meta:1.1", {description: "...", files: [...]}, 7200)
setStorage("task:status:1.1", {status: "claimed", agentId: "..."}, 7200)
```

### ❌ Old Pattern
```javascript
// Missing TTL
setStorage("qa:status", "complete")
```

### ✅ New Pattern
```javascript
// Always specify TTL
setStorage("qa:status", "complete", 3600)
```

### ❌ Old Pattern
```javascript
// Inconsistent agent keys
setStorage("agent:impl-x7k3p9:registered", {...})
setStorage("agent:impl-x7k3p9:status", "complete")
```

### ✅ New Pattern
```javascript
// Single consistent pattern
setStorage("agent:impl-x7k3p9:status", {status: "ready", ...}, 7200)
setStorage("agent:impl-x7k3p9:status", {status: "completed", ...}, 7200)
```

---

## Quick Reference Card

```
TASK COORDINATION
  task:meta:{id}        → Task definition (manager creates)
  task:status:{id}      → Execution state (agents update)
  task:blocked:{id}     → Blocked task signal

FILE LOCKING (CRITICAL!)
  lock:{filepath}       → Lock before edit, release after (TTL: 300s)

AGENT STATUS
  agent:{id}:status     → Agent lifecycle tracking

QA COORDINATION
  qa:status             → "complete" | "in_progress" | "failed"
  qa:result             → JSON results (critical, warnings, status)
  qa:fix-needed         → "true" if fixes needed

WORKFLOW (Manager)
  workflow:status       → Overall workflow state
  workflow:complete     → "true" when done
  qa:iteration          → QA loop counter (max 2)

QUESTIONS
  question:{source}-{id}:{target}:{topic}  → Ask for help
  answer:{source}-{id}:{target}:{topic}    → Respond
```

---

**Created by Octocode**

