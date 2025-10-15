# Agent Communication Patterns

This document describes how agents in the octocode-claude-plugin communicate using the **octocode-local-memory MCP server**.

## Two MCPs, Two Purposes

**octocode-mcp**: Code research and GitHub exploration
- Use for: Finding proven patterns, researching implementations, planning decisions
- When: During requirements, architecture, analysis, and implementation planning
- NOT for: Agent coordination or communication

**octocode-local-memory**: Agent communication and coordination
- Use for: Task assignments, file locks, status updates, inter-agent messages
- When: During parallel implementation (agent-manager coordinating with agent-implementation instances)
- NOT for: Code research or planning

## Why Use Storage for Communication?

**Problem with file-based coordination:**
- Slow: 10-50ms per file I/O operation
- Race conditions on concurrent file access
- Complex manual file locking
- Bottlenecks with 4-5 parallel agents

**Solution: In-memory storage (octocode-local-memory):**
- **50x faster**: < 1ms operations
- Built-in concurrency safety
- Automatic TTL-based cleanup
- Simple key-value API

## Core Principle

**Use storage (MCP) for ALL agent coordination - NOT files.**

- ✅ Storage: Task assignments, file locks, status updates, questions/answers, workflow state
- ✅ Files: Code, documentation, permanent artifacts

## Key Naming Conventions

All keys follow namespace patterns for organization:

```
task:{taskId}                      # Task assignments
status:agent-{id}:{taskId}         # Progress updates
lock:{filepath}                    # File locks (e.g., lock:src/auth/login.ts)
question:impl-{id}:{target}:{topic} # Questions to other agents
answer:impl-{id}:{target}:{topic}  # Answers from other agents
workflow:{workflowId}              # Overall workflow state
agent:{agentId}:heartbeat          # Agent health checks
```

## Communication Patterns

### 1. Task Assignment (Manager → Implementation)

**Manager assigns task:**
```javascript
setStorage("task:3.1", JSON.stringify({
  taskId: "3.1",
  agentId: "agent-implementation-1",
  description: "Implement user authentication",
  files: ["src/auth/login.ts", "src/auth/session.ts"],
  complexity: "medium",
  assignedAt: Date.now()
}), ttl: 3600); // 1 hour
```

**Implementation agent reads task:**
```javascript
const result = getStorage("task:3.1");
if (result.exists) {
  const task = JSON.parse(result.value);
  // Start working on task...
}
```

### 2. Status Updates (Implementation → Manager)

**Implementation agent reports progress:**
```javascript
setStorage("status:agent-implementation-1:3.1", JSON.stringify({
  status: "in_progress",
  progress: 65,
  currentStep: "Writing authentication logic",
  completedFiles: ["src/auth/login.ts"],
  timestamp: Date.now()
}), ttl: 3600);
```

**Manager monitors progress:**
```javascript
const status = getStorage("status:agent-implementation-1:3.1");
if (status.exists) {
  const data = JSON.parse(status.value);
  console.log(`Agent progress: ${data.progress}% - ${data.currentStep}`);
}
```

### 3. File Lock Coordination

**Before editing a file:**
```javascript
// 1. Check if file is locked
const lock = getStorage("lock:src/auth/login.ts");

if (!lock.exists) {
  // 2. Acquire lock
  setStorage("lock:src/auth/login.ts", JSON.stringify({
    lockedBy: "agent-implementation-1",
    taskId: "3.1",
    acquiredAt: Date.now()
  }), ttl: 300); // 5 minutes - auto-releases if agent crashes

  // 3. Edit the file
  // ... do work ...

  // 4. Release lock when done
  deleteStorage("lock:src/auth/login.ts");
} else {
  // File is locked by another agent - wait or work on different files
  const lockData = JSON.parse(lock.value);
  console.log(`File locked by ${lockData.lockedBy}`);
}
```

### 4. Inter-Agent Questions

**Implementation agent asks architect:**
```javascript
setStorage("question:impl-1:architect:auth-approach", JSON.stringify({
  from: "agent-implementation-1",
  to: "agent-architect",
  question: "Should we use JWT or session-based auth?",
  context: "Working on task 3.1: user authentication",
  timestamp: Date.now()
}), ttl: 1800); // 30 minutes
```

**Architect monitors and responds:**
```javascript
// Check for questions
const q = getStorage("question:impl-1:architect:auth-approach");
if (q.exists) {
  const questionData = JSON.parse(q.value);

  // Provide answer
  setStorage("answer:impl-1:architect:auth-approach", JSON.stringify({
    answer: "Use JWT tokens for stateless authentication",
    reasoning: "Better scalability for your use case",
    timestamp: Date.now()
  }), ttl: 3600); // 1 hour
}
```

**Implementation agent checks for answer:**
```javascript
const a = getStorage("answer:impl-1:architect:auth-approach");
if (a.exists) {
  const answer = JSON.parse(a.value);
  console.log(`Architect says: ${answer.answer}`);
}
```

### 5. Workflow Progress Tracking

**Manager tracks overall workflow:**
```javascript
setStorage("workflow:build-feature", JSON.stringify({
  totalTasks: 5,
  completedTasks: 2,
  inProgressTasks: 3,
  phase: "implementation",
  timestamp: Date.now()
}), ttl: 7200); // 2 hours
```

## TTL Guidelines

Set appropriate TTL (time-to-live) based on data type:

| Data Type | TTL (seconds) | Duration |
|-----------|---------------|----------|
| File locks | 300 | 5 minutes |
| Task assignments | 3600 | 1 hour |
| Status updates | 3600 | 1 hour |
| Questions/Answers | 1800 | 30 minutes |
| Workflow state | 7200 | 2 hours |
| Heartbeats | 60 | 1 minute |

## Best Practices

1. **Always use JSON.stringify() for complex data**
   ```javascript
   setStorage(key, JSON.stringify(data), ttl)
   ```

2. **Always check `exists` before parsing**
   ```javascript
   const result = getStorage(key);
   if (result.exists) {
     const data = JSON.parse(result.value);
   }
   ```

3. **Use namespaced keys for organization**
   - Good: `lock:src/auth/login.ts`
   - Bad: `lock_src_auth_login_ts`

4. **Release locks explicitly with deleteStorage()**
   ```javascript
   deleteStorage("lock:src/auth/login.ts");
   ```

5. **Set appropriate TTLs**
   - Short TTL for locks (5 min) - auto-release if agent crashes
   - Longer TTL for workflow data (1-2 hours)

6. **Handle missing keys gracefully**
   ```javascript
   if (!result.exists) {
     // Key expired or doesn't exist - handle appropriately
   }
   ```

## Performance Impact

**Coordination overhead comparison:**

| Operation | File-Based | Storage-Based | Speedup |
|-----------|------------|---------------|---------|
| Task assignment | 10-50ms | < 1ms | **10-50x** |
| Status update | 10-50ms | < 1ms | **10-50x** |
| Lock check (5 files) | 50-250ms | ~5ms | **10-50x** |
| Progress tracking (5 agents) | 50-250ms | ~6ms | **8-42x** |

**Real-world impact:**
- 3 agents, 50 coordination events
- File-based: ~3.45 seconds overhead
- Storage-based: ~150ms overhead
- **Result: 95% more time on actual work!**

## Session Scope

**Important:** Data is session-scoped (by design)
- Data persists during workflow execution
- Cleared when server restarts
- Fresh state for each new workflow
- No stale data accumulation

For permanent artifacts (code, docs, config), use the file system.

## Summary

**Use storage MCP for:**
- ✅ Task coordination
- ✅ Status updates
- ✅ File locks
- ✅ Inter-agent messages
- ✅ Progress tracking
- ✅ Temporary workflow state

**Use files for:**
- ✅ Code
- ✅ Documentation
- ✅ Configuration
- ✅ Permanent artifacts

**Result:** Fast, reliable agent coordination with minimal overhead!
