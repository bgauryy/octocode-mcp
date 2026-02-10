# Server Flows - Octocode Research Server

> Comprehensive documentation of startup, restart, health, and shutdown flows.
> **v2.1.0**: Now powered by PM2 process manager.

## Table of Contents

- [Overview](#overview)
- [Architecture Diagram](#architecture-diagram)
- [1. Startup Flow](#1-startup-flow)
- [2. Request Flow](#2-request-flow)
- [3. Health Check Flow](#3-health-check-flow)
- [4. PM2 Restart Strategies](#4-pm2-restart-strategies)
- [5. Graceful Shutdown Flow](#5-graceful-shutdown-flow)
- [Component Reference](#component-reference)
- [PM2 Commands Reference](#pm2-commands-reference)

---

## Overview

| Attribute | Value |
|-----------|-------|
| **Port** | 1987 |
| **Version** | 2.1.0 |
| **Process Manager** | PM2 |
| **Restart Strategy** | Cron (hourly) + Memory threshold |
| **Max Memory** | 500MB |
| **Kill Timeout** | 10 seconds |

### Key Design Patterns

- **Warm Start**: Server accepts requests immediately, MCP initializes in background
- **PM2 Process Management**: Automatic restarts, monitoring, and log management
- **Cron Restart**: Server restarts hourly for memory hygiene (via PM2)
- **Memory Guard**: Auto-restart if memory exceeds 500MB (via PM2)
- **Circuit Breaker**: Protects external calls with failure thresholds
- **Fire-and-Forget**: Background telemetry doesn't block responses
- **Readiness Gate**: `/tools` and `/prompts` routes blocked until MCP ready
- **Ready Signal**: PM2 waits for `process.send('ready')` before considering app online

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SERVER LIFECYCLE (PM2)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │   STARTUP    │───▶│   RUNNING    │───▶│  SHUTDOWN    │                  │
│  └──────────────┘    └──────────────┘    └──────────────┘                  │
│         │                   │                   ▲                           │
│         │                   │                   │                           │
│         ▼                   ▼                   │                           │
│  ┌──────────────┐    ┌──────────────┐    ┌─────┴────────┐                  │
│  │ INITIALIZING │    │  PM2 CRON    │───▶│ CRON_RESTART │                  │
│  │ wait_ready   │    │ (every hour) │    │  (hourly)    │                  │
│  └──────────────┘    └──────────────┘    └──────────────┘                  │
│         │                                       │                           │
│         │                                       │                           │
│         │            ┌──────────────┐           │                           │
│         │            │ MEMORY CHECK │───────────┤                           │
│         │            │ (> 500MB)    │           │                           │
│         │            └──────────────┘           │                           │
│         │                                       │                           │
│         └────────── process.send('ready') ─────▶│                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           REQUEST FLOW                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Request ──▶ [requestLogger] ──▶ [Route Handler]                            │
│                                        │                                    │
│                       ┌────────────────┴───────┐                            │
│                       ▼                        ▼                            │
│                 /health              /tools, /prompts                       │
│                 (always)             [checkReadiness]                       │
│                    │                        │                               │
│                    ▼                        ▼                               │
│               JSON Response          503 if !initialized                    │
│                                      200 if ready                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Startup Flow

### Sequence Diagram

```
┌──────────┐  ┌───────────┐  ┌────────────┐  ┌──────────────┐  ┌───────────┐
│   PM2    │  │ createSvr │  │ startSvr   │  │ Background   │  │  Ready    │
└────┬─────┘  └─────┬─────┘  └─────┬──────┘  └──────┬───────┘  └─────┬─────┘
     │              │              │                │                │
     │ pm2 start    │              │                │                │
     │─────────────▶│              │                │                │
     │              │              │                │                │
     │              │ createServer()                │                │
     │              │─────────────▶│                │                │
     │              │              │                │                │
     │              │ ┌────────────┴────────────┐   │                │
     │              │ │ 1. initializeLogger()   │   │                │
     │              │ │ 2. initializeSession()  │   │                │
     │              │ │ 3. Setup middleware     │   │                │
     │              │ │ 4. Mount routes         │   │                │
     │              │ │ 5. Error handlers       │   │                │
     │              │ └────────────┬────────────┘   │                │
     │              │              │                │                │
     │              │◀─────────────│                │                │
     │              │   app        │                │                │
     │              │              │                │                │
     │              │              │ app.listen(1987)               │
     │              │              │───────────────▶│                │
     │              │              │                │                │
     │              │              │  'listening'   │                │
     │              │              │◀───────────────│                │
     │              │              │                │                │
     │              │              │ ┌──────────────┴──────────────┐ │
     │              │              │ │ BACKGROUND (async):         │ │
     │              │              │ │ 1. initializeMcpContent()   │ │
     │              │              │ │ 2. initializeProviders()    │ │
     │              │              │ │ 3. process.send('ready')    │ │
     │              │              │ │ 4. logSessionInit()         │ │
     │              │              │ └──────────────┬──────────────┘ │
     │              │              │                │                │
     │◀──────────── process.send('ready') ─────────│                │
     │  (PM2 marks app 'online')   │                │   MCP Ready!   │
     │              │              │                │───────────────▶│
     │              │              │                │                │
```

### Phase 1: Synchronous Setup (`createServer`)

```typescript
// Order matters! These run synchronously before server accepts requests

1. initializeLogger()           // Creates log directory, sets up file logging
2. initializeSession()          // Generates session ID for telemetry
3. Express middleware stack:
   ├── express.json()           // Parse JSON bodies
   └── requestLogger            // Log all requests with timing
4. Route mounting:
   ├── GET /health              // Always available (no readiness check)
   ├── /tools/*                 // checkReadiness middleware applied
   └── /prompts/*               // checkReadiness middleware applied
5. Error handlers:
   ├── 404 handler              // Unknown routes
   └── errorHandler middleware  // Catch-all error formatting
```

### Phase 2: HTTP Server Start (`startServer`)

```typescript
app.listen(PORT)
  .on('listening', () => {
    // Server is now accepting connections
    // Status: 'initializing' (health check returns this)
  });
```

### Phase 3: Background Initialization (Warm Start)

```typescript
// These run async AFTER server is listening
// Requests to /tools/* return 503 until complete

1. initializeMcpContent()       // Load MCP tools, schemas, prompts from octocode-mcp
   ├── await initialize()       // Core MCP initialization
   └── await loadToolContent()  // Cache tool metadata
   
2. initializeProviders()        // Initialize GitHub token, providers
   └── Resolves token from env/keychain/CLI

3. process.send('ready')        // Signal PM2 that app is ready
   └── PM2 marks process as 'online'

4. logSessionInit()             // Fire-and-forget telemetry
   └── 5s timeout, errors queued
```

### State Transitions

| State | Health Status | `/tools` Available | PM2 Status | Duration |
|-------|---------------|-------------------|------------|----------|
| Starting | N/A | No | starting | ~100ms |
| Listening | `'initializing'` | 503 | waiting ready | ~1-3s |
| Ready | `'ok'` | Yes | online | Until shutdown |

---

## 2. Request Flow

### Middleware Chain

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           REQUEST MIDDLEWARE CHAIN                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Incoming Request                                                           │
│         │                                                                   │
│         ▼                                                                   │
│  ┌──────────────────┐                                                       │
│  │  express.json()  │  Parse JSON body                                      │
│  └────────┬─────────┘                                                       │
│           │                                                                 │
│           ▼                                                                 │
│  ┌──────────────────┐                                                       │
│  │  requestLogger   │  Log request, attach x-request-id                     │
│  └────────┬─────────┘                                                       │
│           │                                                                 │
│           ├───────────────────────────────────┐                             │
│           │                                   │                             │
│           ▼                                   ▼                             │
│    ┌─────────────┐                   ┌────────────────┐                     │
│    │  /health    │                   │ /tools, /prompts│                    │
│    │  (direct)   │                   │ checkReadiness  │                    │
│    └──────┬──────┘                   └───────┬────────┘                     │
│           │                                  │                              │
│           │                     ┌────────────┴────────────┐                 │
│           │                     │                         │                 │
│           │                     ▼                         ▼                 │
│           │            MCP Initialized?            Not Initialized          │
│           │                  YES                         NO                 │
│           │                   │                          │                  │
│           │                   ▼                          ▼                  │
│           │            Route Handler            503 + retry hint            │
│           │                   │                                             │
│           ▼                   ▼                                             │
│    ┌─────────────────────────────────────────────────────┐                  │
│    │                   Response                          │                  │
│    │  - requestLogger logs on 'finish' event             │                  │
│    │  - logToolCall() fired async (non-blocking)         │                  │
│    └─────────────────────────────────────────────────────┘                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Request Logger Details

```typescript
// Attaches to response 'finish' event
res.on('finish', () => {
  const duration = Date.now() - start;
  const status = res.statusCode;
  
  // Console log (colored)
  console.log(status >= 400 ? errorLog(...) : resultLog(...));
  
  // File log (async, non-blocking)
  if (req.path !== '/health') {
    logToolCall({ tool, route, duration, success, requestId });
  }
});
```

### Readiness Check Middleware

```typescript
// Applied to /tools/* and /prompts/* routes
export const checkReadiness = (_req, res, next) => {
  if (!isMcpInitialized()) {
    res.status(503).json({
      success: false,
      error: {
        message: 'Server is initializing',
        code: 'SERVER_INITIALIZING',
        hint: 'Please retry in a few seconds',
      },
    });
    return;
  }
  next();
};
```

---

## 3. Health Check Flow

### Endpoint: `GET /health`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           HEALTH CHECK FLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  GET /health                                                                │
│       │                                                                     │
│       ├──▶ process.memoryUsage()         // Heap, RSS stats                 │
│       │                                                                     │
│       ├──▶ errorQueue.getRecent(5)       // Last 5 queued errors            │
│       │                                                                     │
│       ├──▶ isMcpInitialized()            // true = 'ok', false = 'init'     │
│       │                                                                     │
│       ├──▶ getAllCircuitStates()         // Circuit breaker health          │
│       │                                                                     │
│       └──▶ Response                                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Response Schema

```typescript
{
  status: 'ok' | 'initializing',
  port: 1987,
  version: '2.1.0',
  uptime: number,                    // seconds since process start
  processManager: 'pm2',
  memory: {
    heapUsed: number,                // MB
    heapTotal: number,               // MB
    rss: number,                     // MB (Resident Set Size)
  },
  circuits: {
    [circuitName]: {
      state: 'closed' | 'open' | 'half-open',
      failures: number,
      lastFailure: Date | null,
    }
  },
  errors: {
    queueSize: number,
    recentErrors: [{
      timestamp: string,             // ISO 8601
      context: string,
      message: string,
    }]
  }
}
```

### Health Check Behavior

| Condition | Status | Notes |
|-----------|--------|-------|
| MCP not initialized | `'initializing'` | Background init in progress |
| MCP initialized | `'ok'` | All routes available |
| Circuit open | `'ok'` | Degraded but functional |
| Errors in queue | `'ok'` | Errors are informational |

---

## 4. PM2 Restart Strategies

### Overview

PM2 manages all restart logic via `ecosystem.config.cjs`:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PM2 RESTART STRATEGIES                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐        ┌──────────────┐        ┌──────────────┐          │
│  │ CRON RESTART │        │MEMORY RESTART│        │CRASH RESTART │          │
│  │  (hourly)    │        │  (> 500MB)   │        │ (on error)   │          │
│  └──────┬───────┘        └──────┬───────┘        └──────┬───────┘          │
│         │                       │                       │                   │
│         ▼                       ▼                       ▼                   │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │                     SIGINT → gracefulShutdown()             │           │
│  │                                                             │           │
│  │  1. stopCircuitCleanup()    ✅ Intervals cleared            │           │
│  │  2. clearAllCircuits()      ✅ Circuit breakers reset       │           │
│  │  3. server.close()          ✅ HTTP connections drained     │           │
│  │  4. process.exit(0)         ✅ Clean exit                   │           │
│  │                                                             │           │
│  └─────────────────────────────────────────────────────────────┘           │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │                     PM2 Auto-Restart                        │           │
│  │                                                             │           │
│  │  - restart_delay: 1000ms                                    │           │
│  │  - exp_backoff_restart_delay: 100ms (on crashes)            │           │
│  │  - max_restarts: 10 (before stopping)                       │           │
│  │                                                             │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Restart Triggers

| Trigger | Condition | Behavior |
|---------|-----------|----------|
| **Cron** | Every hour (`0 * * * *`) | Graceful restart for memory hygiene |
| **Memory** | RSS > 500MB | Automatic restart when threshold exceeded |
| **Crash** | `process.exit(1)` | Restart with exponential backoff |
| **Manual** | `pm2 restart` | Graceful reload |

### Ecosystem Configuration

```javascript
// ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'octocode-research',
    script: './scripts/server.js',
    
    // Restart strategies
    cron_restart: '0 * * * *',        // Every hour
    max_memory_restart: '500M',        // Memory threshold
    
    // Graceful shutdown
    kill_timeout: 10000,               // 10s before SIGKILL
    wait_ready: true,                  // Wait for process.send('ready')
    listen_timeout: 15000,             // Timeout for ready signal
    
    // Restart behavior
    autorestart: true,
    max_restarts: 10,
    restart_delay: 1000,
    exp_backoff_restart_delay: 100,
  }]
};
```

---

## 5. Graceful Shutdown Flow

### Triggers

| Signal | Source |
|--------|--------|
| `SIGTERM` | `pm2 stop`, `pm2 restart`, `kill <pid>` |
| `SIGINT` | Ctrl+C in terminal, PM2 graceful reload |

### Sequence Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           GRACEFUL SHUTDOWN FLOW                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PM2 sends SIGINT (graceful) or SIGTERM                                     │
│         │                                                                   │
│         ▼                                                                   │
│  ┌──────────────────┐                                                       │
│  │ gracefulShutdown │                                                       │
│  │    (signal)      │                                                       │
│  └────────┬─────────┘                                                       │
│           │                                                                 │
│           ├──▶ stopCircuitCleanup()      // Clear circuit cleanup interval  │
│           │         │                                                       │
│           │         └──▶ clearInterval(cleanupIntervalId)                   │
│           │                                                                 │
│           ├──▶ clearAllCircuits()        // Reset all circuit breakers      │
│           │         │                                                       │
│           │         └──▶ circuits.clear(), configs.clear()                  │
│           │                                                                 │
│           └──▶ server.close()            // Stop accepting new connections  │
│                     │                                                       │
│           ┌─────────┴─────────┐                                            │
│           │                   │                                            │
│           ▼                   ▼                                            │
│     Success (< 10s)    Timeout (10s)                                       │
│           │                   │                                            │
│           ▼                   ▼                                            │
│     process.exit(0)    PM2 sends SIGKILL                                   │
│           │                   │                                            │
│           └─────────┬─────────┘                                            │
│                     │                                                       │
│                     ▼                                                       │
│              PM2 Auto-Restart                                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Cleanup Order

```typescript
function gracefulShutdown(signal: string): void {
  console.log(`🛑 Received ${signal}. Starting graceful shutdown...`);

  // 1. Stop periodic cleanup interval
  stopCircuitCleanup();               // ✅ Circuit cleanup interval stopped

  // 2. Clear circuit breaker state
  clearAllCircuits();                 // ✅ Circuit breakers cleared

  // 3. Close HTTP server (drain existing connections)
  if (server) {
    server.close((err) => {
      if (err) {
        console.error('❌ Error closing server:', err);
        process.exit(1);
      }
      console.log('✅ HTTP server closed');
      process.exit(0);               // PM2 handles restart
    });
  } else {
    process.exit(0);
  }
}
```

### Exit Codes

| Code | Meaning | PM2 Behavior |
|------|---------|--------------|
| 0 | Clean shutdown | Restart (unless `autorestart: false`) |
| 1 | Error during shutdown | Restart with backoff |

---

## Component Reference

### Files & Responsibilities

| File | Purpose |
|------|---------|
| `ecosystem.config.cjs` | PM2 process configuration |
| `server.ts` | Main entry, lifecycle management |
| `mcpCache.ts` | MCP content singleton, initialization |
| `index.ts` | Re-exports from octocode-mcp |
| `middleware/readiness.ts` | Blocks routes until MCP ready |
| `middleware/logger.ts` | Request/response logging |
| `middleware/errorHandler.ts` | Error response formatting |
| `utils/circuitBreaker.ts` | External call protection |
| `utils/asyncTimeout.ts` | Fire-and-forget with timeout |
| `utils/errorQueue.ts` | Error tracking for health |
| `utils/logger.ts` | File-based logging |
| `routes/tools.ts` | Tool execution endpoints |
| `routes/prompts.ts` | Prompt discovery endpoints |

### State Variables

| Variable | Type | Purpose |
|----------|------|---------|
| `server` | `Server \| null` | HTTP server instance |
| `mcpContent` | `CompleteMetadata \| null` | Cached MCP tool metadata |

### Configuration (ecosystem.config.cjs)

| Option | Value | Purpose |
|--------|-------|---------|
| `cron_restart` | `'0 * * * *'` | Hourly restart for memory hygiene |
| `max_memory_restart` | `'500M'` | Memory threshold for restart |
| `kill_timeout` | 10000 | Graceful shutdown timeout (ms) |
| `wait_ready` | true | Wait for ready signal |
| `listen_timeout` | 15000 | Ready signal timeout (ms) |
| `max_restarts` | 10 | Max consecutive restarts |
| `restart_delay` | 1000 | Delay between restarts (ms) |

---

## PM2 Commands Reference

### NPM Scripts

```bash
# Start/Stop/Restart
npm run pm2:start          # Start with PM2
npm run pm2:stop           # Stop gracefully
npm run pm2:restart        # Restart (full)
npm run pm2:reload         # Reload (zero-downtime)
npm run pm2:delete         # Remove from PM2

# Monitoring
npm run pm2:logs           # View logs (tail -f)
npm run pm2:monit          # TUI dashboard
```

### Direct PM2 Commands

```bash
# Process management
pm2 start ecosystem.config.cjs          # Start
pm2 stop octocode-research              # Stop
pm2 restart octocode-research           # Restart
pm2 reload octocode-research            # Zero-downtime reload
pm2 delete octocode-research            # Remove

# Monitoring
pm2 status                              # List all processes
pm2 logs octocode-research              # View logs
pm2 logs octocode-research --lines 100  # View last 100 lines
pm2 monit                               # Interactive dashboard

# Debugging
pm2 describe octocode-research          # Detailed process info
pm2 env octocode-research               # Environment variables
pm2 reset octocode-research             # Reset restart counter

# Log management
pm2 flush                               # Clear all logs
pm2 reloadLogs                          # Reload log files
```

### Development vs Production

```bash
# Development (direct Node, with watch)
npm run dev                # tsx watch src/server.ts

# Production (PM2 managed)
npm run build              # Build TypeScript
npm run pm2:start          # Start with PM2
```

---

## Migration from v2.0.0

### Removed Features (Handled by PM2)

| Feature | Old Implementation | PM2 Equivalent |
|---------|-------------------|----------------|
| Idle restart | `checkIdleRestart()` | `cron_restart: '0 * * * *'` |
| Idle timer | `lastRequestTime` | N/A |
| Idle check interval | `setInterval(..., 300000)` | N/A |
| Shutdown timeout | Manual `setTimeout` | `kill_timeout: 10000` |

### New Features

- **Ready Signal**: `process.send('ready')` for accurate startup tracking
- **Memory Guard**: `max_memory_restart: '500M'`
- **Exponential Backoff**: `exp_backoff_restart_delay: 100`
- **PM2 Logs**: Disabled (app handles logging in `~/.octocode/logs/`)
- **PM2 Monitoring**: `pm2 monit` dashboard
