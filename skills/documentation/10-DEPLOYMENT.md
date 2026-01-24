# Deployment

## Overview

The octocode-research skill is deployed as a long-running HTTP server using **PM2** process manager. The deployment process involves building the TypeScript source into standalone ESM bundles using **tsdown**, then managing the server lifecycle with PM2 for production reliability.

---

## Production Build

### Build Command

Build the project for production using the tsdown bundler:

```bash
npm run build
```

This command runs `tsdown` as defined in `octocode-research/package.json:41`.

**Evidence:**
- `octocode-research/package.json:41` - Build command configuration

---

## Tsdown Configuration

### Build Settings

The build configuration is defined in `octocode-research/tsdown.config.ts`:

```typescript
entry: {
  server: 'src/server.ts',
  'server-init': 'src/server-init.ts',
},
format: ['esm'],
outDir: 'scripts',
clean: true,
target: 'node20',
platform: 'node',
```

**Evidence:**
- `octocode-research/tsdown.config.ts:5` - Entry points (server.ts and server-init.ts)
- `octocode-research/tsdown.config.ts:9` - ESM format, output to scripts/, target Node 20

### Entry Points

Two entry points are bundled separately:

1. **server.ts** → `scripts/server.js` - Main Express server
2. **server-init.ts** → `scripts/server-init.js` - Server initialization script with health checks and mutex

**Evidence:**
- `octocode-research/tsdown.config.ts:5` - Dual entry point configuration

### Bundling Strategy

**All Dependencies Bundled:**

```typescript
// Bundle ALL dependencies for standalone execution
noExternal: [/.*/],
// Keep Node.js built-ins and native modules external
external: [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
],
```

**Why This Approach:**
- **Standalone Executables:** No need to install node_modules in production
- **Fast Startup:** All code is pre-resolved and bundled
- **Consistent Behavior:** Eliminates dependency resolution issues
- **Node.js Builtins External:** Keeps `fs`, `path`, `http`, etc. as native modules

**Evidence:**
- `octocode-research/tsdown.config.ts:16` - Bundle all dependencies, keep Node builtins external

### Optimization Features

```typescript
splitting: false,
treeshake: true,
minify: true,
shims: true,  // ESM shims for __dirname, etc.
dts: true,    // Generate type declarations (crucial for TypeScript consumers)
sourcemap: false,
```

**Optimization Details:**
- **Tree-shaking:** Removes unused code to reduce bundle size
- **Minification:** Compresses code for smaller file size
- **ESM Shims:** Provides `__dirname` and `__filename` in ESM context
- **Type Declarations:** Generates `.d.ts` files for library consumers
- **No Source Maps:** Production builds exclude source maps for smaller size

**Evidence:**
- `octocode-research/tsdown.config.ts:25` - Optimization settings

### Shebang for Direct Execution

```typescript
// Shebang for direct execution
banner: '#!/usr/bin/env node',
```

The bundled files can be executed directly:

```bash
./scripts/server.js
./scripts/server-init.js
```

**Evidence:**
- `octocode-research/tsdown.config.ts:37` - Shebang banner for executable scripts

---

## PM2 Deployment

### PM2 Commands

Manage the server lifecycle using PM2 commands defined in `octocode-research/package.json:44`:

```bash
# Start the server
npm run pm2:start

# Stop the server
npm run pm2:stop

# Restart the server (with downtime)
npm run pm2:restart

# Reload the server (zero-downtime)
npm run pm2:reload

# Remove from PM2 process list
npm run pm2:delete

# View logs
npm run pm2:logs

# Monitoring dashboard
npm run pm2:monit
```

**Evidence:**
- `octocode-research/package.json:44` - PM2 management scripts

### PM2 vs Direct Execution

| Feature | PM2 | Direct (`npm start`) |
|---------|-----|---------------------|
| Auto-restart on crash | ✅ Yes | ❌ No |
| Memory limit enforcement | ✅ 500MB | ❌ No |
| Graceful shutdown | ✅ 120s timeout | ⚠️ Manual handling |
| Process monitoring | ✅ Built-in | ❌ No |
| Log management | ✅ Configurable | ⚠️ Manual |
| Zero-downtime reload | ✅ Yes | ❌ No |

**Recommendation:** Use PM2 for production deployments, direct execution for development.

---

## PM2 Configuration

### Ecosystem Configuration

The PM2 configuration is defined in `octocode-research/ecosystem.config.cjs`:

```javascript
module.exports = {
  apps: [{
    name: 'octocode-research',
    script: './scripts/server-init.js',
    interpreter: 'node',
    cwd: './octocode-research',
    // ... other settings
  }]
};
```

**Key Configuration Points:**

1. **Entry Script:** Uses `server-init.js` which handles mutex locking and health checks
2. **Working Directory:** `./octocode-research` (relative to skills root)
3. **Interpreter:** Node.js (not node_modules/.bin)

**Evidence:**
- `octocode-research/ecosystem.config.cjs:30` - PM2 application configuration

### Memory Management

**Automatic Restart on Memory Limit:**

```javascript
max_memory_restart: '500M',
```

PM2 automatically restarts the server if memory usage exceeds 500MB. This prevents memory leaks from causing system-wide issues.

**Evidence:**
- `octocode-research/ecosystem.config.cjs:30` - 500MB memory restart threshold

### Graceful Shutdown

**Shutdown Configuration:**

```javascript
// Allow 2 minutes for connection draining during shutdown
// This gives long-running requests time to complete
kill_timeout: 120000,
// Wait for process.send('ready') before marking as online
wait_ready: true,
// Timeout for ready signal (15s for MCP initialization)
listen_timeout: 15000,
```

**Shutdown Flow:**
1. PM2 sends SIGINT signal to server
2. Server stops accepting new connections
3. Existing connections have 120 seconds to complete
4. Server closes gracefully after all connections drain
5. If timeout expires, PM2 sends SIGKILL

**Why 120 Seconds:**
- GitHub API calls can take 30-60 seconds
- LSP operations may require multiple round-trips
- Research operations with multiple tool calls need time

**Evidence:**
- `octocode-research/ecosystem.config.cjs:38` - Graceful shutdown configuration with 2-minute kill timeout

### Restart Behavior

**Auto-Restart Configuration:**

```javascript
// Auto-restart on crash
autorestart: true,
// Max consecutive restarts before stopping
max_restarts: 10,
// Delay between restarts
restart_delay: 1000,
// Exponential backoff on repeated crashes
exp_backoff_restart_delay: 100,
// Minimum uptime to consider app started successfully
min_uptime: 5000,
```

**Restart Logic:**
- **Auto-restart enabled:** Server automatically restarts on crashes
- **Max 10 consecutive restarts:** Prevents infinite restart loops
- **1-second delay:** Initial restart delay
- **Exponential backoff:** Delay increases by 100ms on each consecutive crash
- **5-second minimum uptime:** Server must run for 5s to reset restart counter

**Example Restart Timeline:**
1. Crash 1 → Wait 1s → Restart
2. Crash 2 (within 5s) → Wait 1.1s → Restart
3. Crash 3 (within 5s) → Wait 1.2s → Restart
4. ... continues until 10 restarts or 5s uptime achieved

**Evidence:**
- `octocode-research/ecosystem.config.cjs:51` - Restart behavior configuration

### Environment Variables

**Production vs Development:**

```javascript
env: {
  NODE_ENV: 'production',
},
// Development environment (pm2 start --env development)
env_development: {
  NODE_ENV: 'development',
},
```

**Starting with Specific Environment:**

```bash
# Production (default)
npm run pm2:start

# Development mode
pm2 start ecosystem.config.cjs --env development
```

**Evidence:**
- `octocode-research/ecosystem.config.cjs:80` - Environment variable configuration

### Log Management

**PM2 Logs Disabled:**

```javascript
// PM2 logs disabled - app handles logging in ~/.octocode/logs/
out_file: '/dev/null',
error_file: '/dev/null',
```

The application handles its own logging to `~/.octocode/logs/` (see [Logging](#logging) section below). PM2's built-in logging is disabled to avoid duplication.

**Evidence:**
- `octocode-research/ecosystem.config.cjs:70` - PM2 logs disabled, app logs to ~/.octocode/logs/

---

## Logging

### Log Directory

Application logs are stored in the user's home directory:

```
~/.octocode/logs/
├── errors.log          # All errors and warnings
└── tools.log           # Tool invocation data and results
```

**Platform-Specific Paths:**
- **macOS/Linux:** `~/.octocode/logs/`
- **Windows:** `%USERPROFILE%\.octocode\logs`

**Evidence:**
- `octocode-research/src/utils/logger.ts:22` - Log directory ~/.octocode/logs/ with errors.log and tools.log
- `octocode-research/SKILL.md:54` - Log location documented in skill definition

### Log Files

**errors.log:**
- All errors (HTTP errors, tool failures, validation errors)
- Warnings (circuit breaker state changes, retry attempts)
- Server startup/shutdown events

**tools.log:**
- Tool invocation records
- Request/response metadata
- Performance metrics (duration, success rate)
- Request ID correlation

**Evidence:**
- `octocode-research/src/utils/logger.ts:22` - Two log files: errors.log and tools.log

### Log Rotation

**Rotation Policy:**

```typescript
// Max log file size before rotation (10MB)
const MAX_LOG_SIZE = 10 * 1024 * 1024;
```

**Rotation Behavior:**
1. When a log file exceeds 10MB, it is rotated
2. Original file renamed with timestamp: `errors.2024-01-23T10-30-00.log`
3. New log file created with original name
4. Only 5 most recent rotations kept per log type
5. Older rotations automatically deleted

**Example Rotation Sequence:**
```
errors.log (10.2 MB) → rotation triggered
errors.log (0 KB, new file)
errors.2024-01-23T10-30-00.log (10.2 MB, rotated)
errors.2024-01-22T14-15-00.log (10.1 MB, older)
... (up to 5 total rotated files)
```

**Evidence:**
- `octocode-research/src/utils/logger.ts:28` - 10MB rotation threshold
- `octocode-research/src/utils/logger.ts:97` - Rotation logic with timestamp naming
- `octocode-research/src/utils/logger.ts:117` - Cleanup keeps 5 most recent rotations

### Asynchronous Logging

**Non-Blocking Logging:**

```typescript
function writeLogAsync(logPath: string, entry: string): void {
  if (!fileLoggingEnabled) return;
  // Fire and forget - don't await
  (async () => {
    try {
      await ensureLogsDirAsync();
      await rotateIfNeededAsync(logPath);
      await fsAsync.appendFile(logPath, entry, { encoding: 'utf-8' });
    } catch (error) {
      // ... error handling
    }
  })();
}
```

**Why Fire-and-Forget:**
- **Never Blocks Event Loop:** Logging operations run asynchronously
- **No Performance Impact:** Request handling doesn't wait for disk I/O
- **High Throughput:** Server can handle thousands of requests without logging bottlenecks

**Evidence:**
- `octocode-research/src/utils/logger.ts:207` - Asynchronous fire-and-forget logging

### Viewing Logs

**PM2 Log Commands:**

```bash
# Tail all logs for octocode-research
npm run pm2:logs

# Tail only error logs
pm2 logs octocode-research --err

# Tail only output logs
pm2 logs octocode-research --out

# Show last 100 lines
pm2 logs octocode-research --lines 100
```

**Direct File Access:**

```bash
# View errors
tail -f ~/.octocode/logs/errors.log

# View tool calls
tail -f ~/.octocode/logs/tools.log

# Search for specific error
grep "CIRCUIT_OPEN" ~/.octocode/logs/errors.log
```

**Evidence:**
- `octocode-research/package.json:44` - PM2 logs command
- `octocode-research/src/server.ts:222` - Server logs the log directory path on startup

---

## Deployment Workflow

### Full Deployment Process

**Step-by-step deployment:**

```bash
# 1. Build the project
npm run build

# 2. Stop existing server (if running)
npm run pm2:stop

# 3. Start the server with PM2
npm run pm2:start

# 4. Verify server is running
curl http://localhost:1987/health

# 5. Monitor logs
npm run pm2:logs
```

### Zero-Downtime Deployment

For production systems requiring no downtime:

```bash
# 1. Build the project
npm run build

# 2. Reload with zero downtime
npm run pm2:reload
```

**How Reload Works:**
1. PM2 starts a new server instance
2. New instance waits for 'ready' signal (15s timeout)
3. Once ready, PM2 sends SIGINT to old instance
4. Old instance drains connections (120s timeout)
5. Old instance shuts down gracefully
6. New instance handles all new requests

**Evidence:**
- `octocode-research/ecosystem.config.cjs:38` - wait_ready and listen_timeout for graceful transitions

### Rollback Strategy

If deployment fails, rollback using PM2:

```bash
# 1. Stop the failed deployment
npm run pm2:stop

# 2. Restore previous build from backup
# (Assumes you backed up scripts/ before building)
rm -rf scripts/
cp -r scripts.backup/ scripts/

# 3. Restart with previous version
npm run pm2:start
```

**Best Practice:** Keep a backup of the `scripts/` directory before each build.

---

## Production Checklist

Before deploying to production:

- [ ] Run tests: `npm test`
- [ ] Build project: `npm run build`
- [ ] Verify build output in `scripts/` directory
- [ ] Check `ecosystem.config.cjs` memory limits
- [ ] Ensure log directory has write permissions
- [ ] Test health endpoint: `curl http://localhost:1987/health`
- [ ] Verify PM2 auto-restart works (kill process and check restart)
- [ ] Monitor logs for first 5 minutes: `npm run pm2:logs`
- [ ] Verify graceful shutdown (send SIGINT and watch connection drain)

---

## Troubleshooting

### Server Won't Start

**Check PM2 Status:**

```bash
pm2 status
```

**Common Issues:**
- Port 1987 already in use (check with `lsof -i :1987`)
- Missing dependencies (run `npm install`)
- Build failed (check `scripts/` directory exists)
- Permission issues on log directory (check `~/.octocode/logs/`)

### High Memory Usage

**Monitor Memory:**

```bash
pm2 monit
```

**If approaching 500MB:**
- Check for memory leaks in circuit breaker (stale circuits not cleaned up)
- Verify log rotation is working (large log files can consume memory)
- Review retry configurations (too many retries can queue operations)

### Restart Loops

**Check PM2 Logs:**

```bash
pm2 logs octocode-research --err --lines 50
```

**Common Causes:**
- Server crashes immediately (check errors.log)
- MCP initialization timeout (increase `listen_timeout`)
- Port conflict (server can't bind to 1987)

### Log Files Not Rotating

**Manual Rotation Check:**

```bash
# Check log file sizes
ls -lh ~/.octocode/logs/

# Manually trigger rotation (restart server)
npm run pm2:restart
```

**If logs grow unbounded:**
- Check file permissions on `~/.octocode/logs/`
- Verify rotation logic in `src/utils/logger.ts:97`

---

## Related Documentation

- **[03-GETTING-STARTED.md](03-GETTING-STARTED.md)** - Initial setup and development server
- **[05-CONFIGURATION.md](05-CONFIGURATION.md)** - Environment variables and PM2 configuration details
- **[09-TESTING.md](09-TESTING.md)** - Run tests before deployment
- **[06-DATA-FLOWS.md](06-DATA-FLOWS.md)** - Server initialization flow with mutex and health checks
