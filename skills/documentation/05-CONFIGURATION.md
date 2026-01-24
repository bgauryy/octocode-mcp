# Configuration

This document covers environment variables, PM2 configuration, and server port settings for the octocode-research server.

## Environment Variables

The octocode-research server supports minimal environment variables to keep configuration simple.

### NODE_ENV

**Default**: `development`
**Used in**: `src/server.ts:10`
**Purpose**: Sets the runtime environment mode

**Values:**
- `development` - Development mode (verbose logging, no optimizations)
- `production` - Production mode (optimized performance, production logging)

**Setting NODE_ENV:**

```bash
# Via command line
NODE_ENV=production npm start

# Via PM2 (default)
pm2 start ecosystem.config.cjs

# Via PM2 (development mode)
pm2 start ecosystem.config.cjs --env development
```

Reference: `octocode-research/src/server.ts:10`, `octocode-research/ecosystem.config.cjs:80-88`

**Effect on server behavior:**
- Logging verbosity
- Error stack traces in responses
- Performance optimizations

### OCTOCODE_PORT

**Default**: `1987`
**Used in**: `src/server-init.ts:41`
**Purpose**: Server port for health checks in initialization script only

**Important**: The main server hardcodes port 1987 in `src/server.ts:15`. The `OCTOCODE_PORT` environment variable is **only used by the initialization script** (`server-init.ts`) for health check requests.

**Setting OCTOCODE_PORT:**

```bash
# For server-init health checks
OCTOCODE_PORT=1987 npm run server-init
```

Reference: `octocode-research/src/server-init.ts:41`, `octocode-research/src/server.ts:15`

**Why is port hardcoded?**
- Simplicity: Single well-known port for all deployments
- Consistency: Same port in development and production
- SKILL.md documentation: Port 1987 is part of the skill definition

Reference: `octocode-research/SKILL.md:31`

## PM2 Process Manager Configuration

PM2 provides production-grade process management with auto-restart, monitoring, and graceful shutdown.

### Configuration File

**Location**: `octocode-research/ecosystem.config.cjs`
**Format**: CommonJS (required by PM2)

Reference: `octocode-research/ecosystem.config.cjs:1-10`

### PM2 Configuration Options

#### Basic Settings

```javascript
{
  name: 'octocode-research',
  script: './scripts/server.js',
  interpreter: 'node',
  node_args: '--no-warnings',
  cwd: __dirname,
}
```

**Fields:**
- `name`: Process name shown in `pm2 list`
- `script`: Path to built server script
- `interpreter`: Node.js interpreter
- `node_args`: Node.js command-line arguments (suppress warnings)
- `cwd`: Working directory (repository root)

Reference: `octocode-research/ecosystem.config.cjs:15-28`

#### Memory Management

```javascript
{
  max_memory_restart: '500M',
}
```

**Purpose**: Automatic restart if memory usage exceeds 500MB
**Rationale**:
- Prevents memory leaks from crashing the system
- MCP tools can consume significant memory on large repositories
- 500MB is sufficient for normal operation with safety margin

Reference: `octocode-research/ecosystem.config.cjs:30-32`

**Monitor memory usage:**
```bash
npm run pm2:monit
# Or
pm2 status
```

#### Graceful Shutdown

```javascript
{
  // Allow 2 minutes for connection draining during shutdown
  kill_timeout: 120000,

  // Wait for process.send('ready') before marking as online
  wait_ready: true,

  // Timeout for ready signal (15s for MCP initialization)
  listen_timeout: 15000,
}
```

**Fields:**
- `kill_timeout`: Time to wait before forcefully killing process (120 seconds)
- `wait_ready`: Wait for explicit ready signal from server
- `listen_timeout`: Maximum time to wait for ready signal (15 seconds)

**Why 120s kill timeout?**
- Long-running tool executions (GitHub search, LSP analysis) may take 30-60s
- Allows in-flight requests to complete gracefully
- Prevents partial responses or corrupted state

**Ready Signal Flow:**
```
1. PM2 spawns server process
2. Server initializes MCP cache (5-10s)
3. Server sends process.send('ready')
4. PM2 marks process as "online"
5. If no ready signal in 15s, PM2 considers startup failed
```

Reference: `octocode-research/ecosystem.config.cjs:38-46`, `octocode-research/src/server.ts:210-215`

#### Auto-Restart Configuration

```javascript
{
  // Auto-restart on crash
  autorestart: true,

  // Max consecutive restarts before stopping
  max_restarts: 10,

  // Delay between restarts (milliseconds)
  restart_delay: 1000,

  // Exponential backoff on repeated crashes
  exp_backoff_restart_delay: 100,

  // Minimum uptime to consider app started successfully (milliseconds)
  min_uptime: 5000,
}
```

**Fields:**
- `autorestart`: Enable automatic restart on crash (default: true)
- `max_restarts`: Stop trying after 10 consecutive restart attempts
- `restart_delay`: Wait 1 second between restart attempts
- `exp_backoff_restart_delay`: Exponential backoff multiplier (100ms)
- `min_uptime`: Server must stay up 5s to reset restart counter

**Restart Behavior:**
```
Crash → Wait 1s → Restart (attempt 1)
Crash < 5s → Wait 1.1s → Restart (attempt 2)
Crash < 5s → Wait 1.21s → Restart (attempt 3)
...
After 10 attempts → Stop auto-restart, require manual intervention
```

**Why exponential backoff?**
- Prevents restart loops from overloading the system
- Gives time for transient issues (network, disk) to resolve
- Avoids rapid-fire crashes consuming CPU

Reference: `octocode-research/ecosystem.config.cjs:51-63`

**Manual restart after max_restarts:**
```bash
npm run pm2:restart
```

#### Signal Handling

```javascript
{
  // Reload will gracefully restart workers
  // (sends SIGINT to trigger graceful shutdown)
  kill_signal: 'SIGINT',
}
```

**Purpose**: Use SIGINT for graceful shutdown instead of SIGTERM
**Effect**: Server's shutdown handlers are triggered properly

Reference: `octocode-research/ecosystem.config.cjs:65-68`

**Shutdown handler in server:**
```typescript
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  // Close HTTP server
  // Drain connections
  // Cleanup resources
  process.exit(0);
});
```

Reference: `octocode-research/src/server.ts:225-235`

#### Logging Configuration

```javascript
{
  // PM2 logs disabled - app handles logging in ~/.octocode/logs/
  out_file: '/dev/null',
  error_file: '/dev/null',
  combine_logs: false,
  merge_logs: false,
}
```

**Rationale**:
- Application handles logging to `~/.octocode/logs/` with rotation
- PM2 logs are redundant and complicate log management
- All logs (stdout, stderr) redirected to `/dev/null`
- Application logs provide structured, rotated, and queryable output

Reference: `octocode-research/ecosystem.config.cjs:70-77`

**Application log locations:**
- `~/.octocode/logs/errors.log` - Errors and warnings
- `~/.octocode/logs/tools.log` - Tool invocations and results

Reference: `octocode-research/src/utils/logger.ts:22-27`

#### Environment Variables

```javascript
{
  env: {
    NODE_ENV: 'production',
  },
  env_development: {
    NODE_ENV: 'development',
  },
}
```

**Default**: `production` environment
**Override**: Use `--env development` flag

```bash
# Production (default)
pm2 start ecosystem.config.cjs

# Development
pm2 start ecosystem.config.cjs --env development
```

Reference: `octocode-research/ecosystem.config.cjs:80-88`

### PM2 Management Commands

All PM2 commands are available as npm scripts:

```bash
# Start server with PM2
npm run pm2:start

# Stop server
npm run pm2:stop

# Restart server (with downtime)
npm run pm2:restart

# Reload server (zero-downtime)
npm run pm2:reload

# Remove from PM2
npm run pm2:delete

# View logs
npm run pm2:logs

# Monitoring dashboard
npm run pm2:monit
```

Reference: `octocode-research/package.json:44-50`

**Restart vs Reload:**
- `restart`: Stops then starts (brief downtime)
- `reload`: Graceful reload with zero-downtime (uses SIGINT)

**View PM2 status:**
```bash
pm2 status
pm2 describe octocode-research
```

**Monitor PM2 metrics:**
```bash
pm2 monit
# Shows real-time CPU, memory, logs
```

## Port Configuration

### Default Port

**Value**: 1987
**Location**: `octocode-research/src/server.ts:15`
**Type**: Hardcoded constant

```typescript
const PORT = 1987;
```

Reference: `octocode-research/src/server.ts:15`

### Why Port 1987?

- **Consistent**: Same port in development and production
- **Documented**: Part of SKILL.md specification
- **Memorable**: Easy to remember (1987 = year)
- **Unprivileged**: Above 1024, doesn't require root

Reference: `octocode-research/SKILL.md:31`

### Changing the Port (Not Recommended)

If you need to change the port, you must modify the source code:

**1. Edit server.ts:**
```typescript
// Change this line
const PORT = 1987;  // Change to your desired port
```

**2. Edit server-init.ts:**
```typescript
// Change this line
const PORT = parseInt(process.env.OCTOCODE_PORT || '1987', 10);
```

**3. Update SKILL.md:**
```xml
<port>YOUR_NEW_PORT</port>
```

**4. Rebuild:**
```bash
npm run build
```

**5. Restart:**
```bash
npm run pm2:restart
```

**Note**: Changing the port is not recommended because:
- Breaks SKILL.md specification
- Requires code changes instead of configuration
- May confuse users expecting port 1987

### Verifying Port

Check which port the server is listening on:

```bash
# Check server logs
tail -f ~/.octocode/logs/errors.log | grep "running on"

# Or use lsof
lsof -i :1987

# Or use netstat
netstat -an | grep 1987
```

Expected output:
```
🔍 Octocode Research Server running on http://localhost:1987
```

Reference: `octocode-research/src/server.ts:207`

## Health Check Configuration

The `/health` endpoint provides readiness checks:

```bash
curl http://localhost:1987/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-23T10:30:00.000Z",
  "uptime": 123.456
}
```

Reference: `octocode-research/src/server.ts:149-160`

**Health check uses:**
- PM2 readiness detection
- Load balancer health checks
- Monitoring systems
- Server initialization verification

**Initialization health checks:**

The `server-init.ts` script uses health checks with exponential backoff:

```typescript
// Poll health endpoint until status is "ok"
// 500ms → 750ms → 1125ms → ... → 2000ms
// Max wait: 30 seconds
```

Reference: `octocode-research/src/server-init.ts:229-250`

## Log Configuration

### Log Directory

**Location**: `~/.octocode/logs/`
**Windows**: `%USERPROFILE%\.octocode\logs\`

Reference: `octocode-research/src/utils/logger.ts:22-26`

### Log Files

- `errors.log` - All errors and warnings
- `tools.log` - Tool invocation data and results

Reference: `octocode-research/src/utils/logger.ts:27-28`

### Log Rotation Settings

```typescript
// Max log file size before rotation
const MAX_LOG_SIZE = 10 * 1024 * 1024;  // 10MB

// Keep 5 most recent rotations per log type
const ROTATION_KEEP = 5;
```

**Rotation behavior:**
1. Log file exceeds 10MB
2. Rename to `errors.2024-01-23T10-30-00.log`
3. Create new `errors.log`
4. Delete old rotations, keeping 5 most recent

Reference: `octocode-research/src/utils/logger.ts:28-120`

### Disabling File Logging

File logging is always enabled in production. To disable for testing:

```typescript
// In src/utils/logger.ts
const fileLoggingEnabled = false;  // Change to false
```

**Not recommended** - logs are essential for debugging production issues.

## Configuration Summary

| Setting | Location | Default | Configurable |
|---------|----------|---------|--------------|
| Port | `src/server.ts:15` | 1987 | No (hardcoded) |
| NODE_ENV | Environment | development | Yes (env var) |
| PM2 Memory Limit | `ecosystem.config.cjs` | 500MB | Yes (config file) |
| PM2 Kill Timeout | `ecosystem.config.cjs` | 120s | Yes (config file) |
| PM2 Max Restarts | `ecosystem.config.cjs` | 10 | Yes (config file) |
| Log Directory | `src/utils/logger.ts` | ~/.octocode/logs/ | No (hardcoded) |
| Log Rotation Size | `src/utils/logger.ts` | 10MB | No (hardcoded) |
| Log Rotation Keep | `src/utils/logger.ts` | 5 files | No (hardcoded) |
| GitHub Timeout | `src/utils/resilience.ts` | 60s | No (hardcoded) |
| Other Timeouts | `src/utils/resilience.ts` | 30s | No (hardcoded) |

**Philosophy**: Configuration through code (not environment variables) provides:
- Type safety
- Documentation in source
- Compile-time validation
- Fewer runtime errors from misconfiguration
