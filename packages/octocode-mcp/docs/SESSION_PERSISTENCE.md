# Session Persistence Architecture

> Technical documentation for session management and persistence in Octocode MCP.

## Overview

The Octocode MCP server maintains a persistent session that survives server restarts. This enables:

- **Session ID reuse** across multiple server invocations
- **Usage statistics tracking** (tool calls, prompts, errors, rate limits)
- **Telemetry correlation** for debugging and analytics

The persistence layer is implemented in the `octocode-shared` package and consumed by `octocode-mcp`.

---

## Storage Location

Sessions are stored as JSON files in the user's home directory:

| File | Purpose |
|------|---------|
| `~/.octocode/session.json` | Session data with ID and statistics |
| `~/.octocode/` | Base directory for all Octocode artifacts |

The directory is created with restricted permissions (0700) on first use.

---

## Session Data Structure

Each session contains:

| Field | Type | Description |
|-------|------|-------------|
| `version` | Number | Schema version for migrations |
| `sessionId` | UUID | Unique identifier, persisted across restarts |
| `createdAt` | ISO Timestamp | When the session was first created |
| `lastActiveAt` | ISO Timestamp | Last activity timestamp |
| `stats.toolCalls` | Number | Cumulative tool invocation count |
| `stats.promptCalls` | Number | Cumulative prompt invocation count |
| `stats.errors` | Number | Cumulative error count |
| `stats.rateLimits` | Number | Cumulative rate limit hit count |

---

## Architecture

### Component Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                      octocode-mcp                               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   SessionManager                          │  │
│  │  • Wraps persistence layer                                │  │
│  │  • Provides logging methods (logToolCall, logError, etc.) │  │
│  │  • Sends telemetry to remote endpoint                     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
├─────────────────────────────────────────────────────────────────┤
│                      octocode-shared                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   Session Storage                         │  │
│  │  • In-memory cache for fast reads                         │  │
│  │  • Deferred writes with 60-second batching                │  │
│  │  • Atomic file operations                                 │  │
│  │  • Exit handlers for safe shutdown                        │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
├─────────────────────────────────────────────────────────────────┤
│                      File System                                │
│                ~/.octocode/session.json                         │
└─────────────────────────────────────────────────────────────────┘
```

### Dual Responsibility

The `SessionManager` class serves two purposes:

1. **Local Persistence** - Maintains session state on disk via `octocode-shared`
2. **Remote Telemetry** - Sends session events to a remote logging endpoint

These are independent operations - telemetry failures do not affect persistence.

---

## Initialization Flow

When the MCP server starts, session initialization follows this sequence:

```
Server Start
    │
    ▼
┌─────────────────────────────────────┐
│        initializeSession()          │
│   Creates singleton SessionManager  │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│       SessionManager Constructor    │
│   Calls getOrCreateSession()        │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│         getOrCreateSession()        │
│   (in octocode-shared)              │
└─────────────────────────────────────┘
    │
    ├─── Check in-memory cache
    │         │
    │         ▼
    ├─── If no cache, read from disk
    │         │
    │         ▼
    ├─── Validate session structure
    │         │
    │         ▼
    ├─── If valid: Update lastActiveAt
    │    If invalid/missing: Create new session with UUID
    │         │
    │         ▼
    └─── Flush to disk immediately
              │
              ▼
        Session Ready
```

### Key Behavior: Session ID Reuse

The session ID is **not regenerated** on each server start. Instead:

1. The system reads the existing session file
2. If valid, the same `sessionId` is reused
3. Only `lastActiveAt` is updated
4. The session ID only changes if:
   - The session file is deleted
   - The file is corrupted
   - `forceNew: true` option is passed

This ensures consistent session tracking across server restarts.

---

## Write Flow (Deferred Writes)

Statistics updates are batched for performance. The write flow is:

```
Tool Call / Prompt / Error / Rate Limit
    │
    ▼
┌─────────────────────────────────────┐
│      increment*() Functions         │
│   incrementToolCalls()              │
│   incrementPromptCalls()            │
│   incrementErrors()                 │
│   incrementRateLimits()             │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│        updateSessionStats()         │
│   Reads current session             │
│   Increments counters               │
│   Updates lastActiveAt              │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│          writeSession()             │
│   Updates in-memory cache           │
│   Marks session as "dirty"          │
│   Registers exit handlers (once)    │
│   Starts flush timer (if needed)    │
└─────────────────────────────────────┘
    │
    │  (Deferred - does NOT write to disk immediately)
    │
    ▼
┌─────────────────────────────────────┐
│         Flush Timer (60s)           │
│   Checks if session is dirty        │
│   Writes to disk if dirty           │
│   Clears dirty flag                 │
└─────────────────────────────────────┘
```

### Why Deferred Writes?

- **Performance**: Avoids disk I/O on every tool call
- **Batching**: Multiple updates are consolidated into single writes
- **Reduced Wear**: Fewer writes to disk/SSD
- **Non-blocking**: Main thread is not blocked by I/O

---

## Exit Safety

To prevent data loss on shutdown, exit handlers are registered:

```
Process Termination Signals
    │
    ├─── SIGINT (Ctrl+C)
    │         │
    │         ▼
    │    flushSessionSync()
    │
    ├─── SIGTERM
    │         │
    │         ▼
    │    flushSessionSync()
    │
    └─── exit
              │
              ▼
         flushSessionSync()
              │
              ▼
        Synchronous disk write
              │
              ▼
        Process exits safely
```

The synchronous flush ensures all pending session data is written before the process terminates.

---

## Atomic File Operations

To prevent corruption, file writes use a temporary file pattern:

```
Write Operation
    │
    ▼
┌─────────────────────────────────────┐
│   Create temp file                  │
│   ~/.octocode/session.json.tmp      │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│   Write JSON content to temp file   │
│   (with secure permissions 0600)    │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│   Atomic rename()                   │
│   temp file → session.json          │
│   (OS guarantees atomicity)         │
└─────────────────────────────────────┘
```

This ensures the session file is never in a partial/corrupted state.

---

## Caching Strategy

The session storage uses a write-through cache:

| Operation | Behavior |
|-----------|----------|
| **Read** | Return from in-memory cache if available; otherwise read from disk and populate cache |
| **Write** | Update in-memory cache immediately; defer disk write |
| **Flush** | Write cache to disk if dirty; clear dirty flag |

### Cache Lifecycle

```
┌────────────────────────────────────────────────────────────────────┐
│                     IN-MEMORY CACHE                                │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  First Read ──────► Load from disk ──────► Populate cache         │
│                                                                    │
│  Subsequent Reads ──────► Return cache directly (fast)            │
│                                                                    │
│  Write ──────► Update cache ──────► Mark dirty ──────► Defer I/O  │
│                                                                    │
│  Timer/Exit ──────► If dirty: write cache to disk                 │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## Telemetry Integration

The `SessionManager` also handles remote telemetry:

```
Session Event (init, tool_call, error, rate_limit)
    │
    ▼
┌─────────────────────────────────────┐
│   Check isLoggingEnabled()          │
│   (Controlled by LOG env var)       │
└─────────────────────────────────────┘
    │
    ├─── Logging disabled → Return early (no-op)
    │
    └─── Logging enabled
              │
              ▼
        ┌─────────────────────────────────────┐
        │   Build payload with:               │
        │   • sessionId (from persistence)    │
        │   • intent (init/tool_call/         │
        │            prompt_call/error/       │
        │            rate_limit)              │
        │   • data (event-specific)           │
        │   • timestamp                       │
        │   • version                         │
        └─────────────────────────────────────┘
              │
              ▼
        ┌─────────────────────────────────────┐
        │   POST to telemetry endpoint        │
        │   5-second timeout                  │
        │   Best-effort (failures ignored)    │
        └─────────────────────────────────────┘
```

### Telemetry vs Persistence Independence

| Aspect | Telemetry | Persistence |
|--------|-----------|-------------|
| **Failure handling** | Logs to stderr (best-effort, non-fatal) | Mandatory (critical path) |
| **Timeout** | 5 seconds | None (sync operations) |
| **Disable option** | `LOG=false` env var | Always enabled |
| **Network required** | Yes | No (local file only) |

---

## Error Handling

### Session File Corruption

If the session file is corrupted or has an invalid version:

1. Internal `readSessionFromDisk()` returns `null`
2. `getOrCreateSession()` creates a fresh session
3. New session is written to disk
4. No error is thrown - system self-heals

### Missing Directory

If `~/.octocode/` doesn't exist:

1. `ensureOctocodeDir()` creates it with mode 0700
2. Session file is created normally

### Write Failures

If disk write fails during flush:

- Exit handlers use try/catch with empty catch block
- This prevents crash-on-exit scenarios
- Data loss is accepted in extreme edge cases (disk full, permissions changed)

---

## Session Management Utilities

The `octocode-shared` package exports additional utilities for session management:

| Function | Description |
|----------|-------------|
| `deleteSession()` | Deletes the session file and clears all state |
| `resetSessionStats()` | Resets all statistics to zero while preserving sessionId |
| `flushSession()` | Manually flushes pending changes to disk (async) |
| `flushSessionSync()` | Synchronously flushes pending changes (for shutdown) |

These are primarily used for testing and administrative purposes.

---

## Configuration

| Environment Variable | Effect |
|---------------------|--------|
| `LOG` (unset) | Enable telemetry logging (default behavior) |
| `LOG=false` or `LOG=0` | Disable telemetry (persistence still works) |
| `OCTOCODE_TELEMETRY_DISABLED=1` | **Preferred:** Standard way to disable telemetry |

## Privacy

Octocode collects de-identified usage data to improve the tool. We do NOT collect source code or PII.
See [PRIVACY.md](../../../PRIVACY.md) for full details.

No configuration is needed for session persistence itself - it's always enabled.

---

## Related Documentation

- [AUTHENTICATION_SETUP.md](./AUTHENTICATION_SETUP.md) - GitHub token resolution flow
- [HINTS_ARCHITECTURE.md](./HINTS_ARCHITECTURE.md) - Dynamic hints system
- [octocode-shared AGENTS.md](../../octocode-shared/AGENTS.md) - Shared package documentation

---

*Session Persistence Architecture for Octocode MCP v11.x*

