# Getting Started

This guide covers the prerequisites, installation, and basic usage for the skills repository.

## Prerequisites

### Node.js Version Requirement

The skills repository requires **Node.js 20.0.0 or higher**.

This requirement is enforced in the package.json:

```json
"engines": {
  "node": ">=20.0.0"
}
```

Reference: `octocode-research/package.json:13`

**Why Node.js 20+?**
- Native ESM support with stable import/export
- Performance improvements for async operations
- Modern JavaScript features (ES2022)
- Required by dependencies (Vitest 4.x, tsdown)

**Verify your Node.js version:**

```bash
node --version
# Should output v20.x.x or higher
```

### System Dependencies

- **Git**: For cloning the repository and version control
- **npm**: Package manager (comes with Node.js)
- **PM2** (optional): For production process management

```bash
# Install PM2 globally (optional, for production)
npm install -g pm2
```

Reference: `octocode-research/ecosystem.config.cjs:1-10`

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd skills
```

### 2. Install Dependencies

The repository uses a monorepo structure with workspace dependencies. Install all dependencies from the root or navigate to the octocode-research directory:

```bash
# From repository root
npm install

# Or from octocode-research directory
cd octocode-research
npm install
```

This will install:
- **Runtime dependencies**: express, zod, js-yaml, octocode-mcp, octocode-shared
- **Development dependencies**: typescript, vitest, eslint, tsdown, tsx, supertest

Reference: `octocode-research/package.json:58-79`

### 3. Build the Project

Build the TypeScript source code into executable JavaScript bundles:

```bash
# From octocode-research directory
npm run build
```

**What happens during build:**
- tsdown bundles `src/server.ts` → `scripts/server.js`
- tsdown bundles `src/server-init.ts` → `scripts/server-init.js`
- All dependencies bundled into standalone executables
- Type declarations (.d.ts) generated
- Output minified and tree-shaken
- Shebang added for direct execution

**Build configuration:**
- Entry points: `src/server.ts`, `src/server-init.ts`
- Output directory: `scripts/`
- Format: ESM
- Target: Node 20
- Minification: enabled
- Source maps: disabled

Reference: `octocode-research/tsdown.config.ts:1-40`, `octocode-research/package.json:41`

## Running the octocode-research Server

### Development Mode

Run the server in development mode with hot reload:

```bash
npm run dev
```

**What this does:**
- Uses `tsx` to run TypeScript directly without compilation
- Executes `src/server.ts`
- No build step required
- Suitable for development and testing

Reference: `octocode-research/package.json:42`

**Server startup output:**
```
[server-init] Server is ready!
🔍 Octocode Research Server running on http://localhost:1987
📂 Logs: /Users/<username>/.octocode/logs/
```

Reference: `octocode-research/src/server.ts:207-222`

### Production Mode (npm start)

Run the built server directly:

```bash
# First, build the project
npm run build

# Then start the server
npm start
```

**What this does:**
- Executes the built `scripts/server.js` file
- Uses the minified, optimized bundle
- Suitable for production environments

Reference: `octocode-research/package.json:43`

### Production Mode with Initialization (Recommended)

Use the initialization script for production deployments:

```bash
npm run server-init
```

**What this does:**
1. **Fast path health check**: Checks if server is already running
2. **Mutex lock acquisition**: Prevents concurrent server starts using atomic file creation
3. **Stale lock detection**: Checks process existence and timestamp
4. **Server spawn**: Starts server as detached background process if not running
5. **Health polling**: Waits for server to report "ok" status with exponential backoff (500ms → 2s)
6. **MCP cache initialization**: Ensures MCP tools are cached and ready

**Mutex lock location**: `~/.octocode/locks/octocode-research-init.lock`

Reference: `octocode-research/src/server-init.ts:1-280`, `octocode-research/package.json:51`

**Initialization flow:**
```
1. Check if server already running (fast path)
   ↓ If running: exit 0
2. Acquire mutex lock (atomic file creation)
   ↓ If lock exists: check staleness
3. Double-check health after lock
   ↓ If running: release lock, exit 0
4. Spawn server as detached process
5. Poll health with exponential backoff
   ↓ 500ms → 750ms → 1125ms → ... → 2000ms
6. Server reports "ok" status
   ↓ Release lock, exit 0
```

Reference: `octocode-research/src/server-init.ts:256-280`

### Production Mode with PM2 (Advanced)

For production deployments with auto-restart, monitoring, and graceful shutdown:

```bash
# Start with PM2
npm run pm2:start

# Check status
pm2 status

# View logs
npm run pm2:logs

# Restart (with downtime)
npm run pm2:restart

# Reload (zero-downtime)
npm run pm2:reload

# Stop server
npm run pm2:stop

# Remove from PM2
npm run pm2:delete

# Monitoring dashboard
npm run pm2:monit
```

Reference: `octocode-research/package.json:44-50`

**PM2 Configuration:**
- **Max memory**: 500MB (auto-restart if exceeded)
- **Kill timeout**: 120s (graceful shutdown for long-running requests)
- **Wait for ready**: Yes (waits for `process.send('ready')` signal)
- **Listen timeout**: 15s (for MCP initialization)
- **Auto-restart**: Enabled
- **Max restarts**: 10 consecutive
- **Restart delay**: 1s with exponential backoff
- **Min uptime**: 5s to consider successful start

Reference: `octocode-research/ecosystem.config.cjs:30-65`

**PM2 Logs:**
PM2 logs are disabled (sent to `/dev/null`) because the application handles logging to `~/.octocode/logs/`:
- `errors.log` - Errors and warnings
- `tools.log` - Tool invocation data

Reference: `octocode-research/ecosystem.config.cjs:70-75`

## Verifying Installation

### Health Check

Once the server is running, verify it's working:

```bash
curl http://localhost:1987/health
```

**Expected response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-23T10:30:00.000Z",
  "uptime": 123.456
}
```

Reference: `octocode-research/src/server.ts:149-160`

### List Available Tools

```bash
curl http://localhost:1987/tools/list
```

**Expected response:**
```json
{
  "tools": [
    "githubSearchCode",
    "githubGetFileContent",
    "githubViewRepoStructure",
    "githubSearchRepositories",
    "githubSearchPullRequests",
    "localSearchCode",
    "localGetFileContent",
    "localViewStructure",
    "localFindFiles",
    "lspGotoDefinition",
    "lspFindReferences",
    "lspCallHierarchy",
    "packageSearch"
  ],
  "count": 13
}
```

Reference: `octocode-research/src/routes/tools.ts:100-140`

### Initialize Context

Initialize the MCP cache (recommended before first tool execution):

```bash
curl http://localhost:1987/tools/initContext
```

**Expected response:**
```json
{
  "success": true,
  "cached_tools": 13,
  "cached_prompts": 5
}
```

Reference: `octocode-research/src/routes/tools.ts:180-220`

## Running Tests

### Run Test Suite

```bash
# Single run
npm test

# Watch mode (re-run on file changes)
npm run test:watch
```

Reference: `octocode-research/package.json:52-53`

**Test configuration:**
- Test runner: Vitest 4.0.16
- Test pattern: `src/__tests__/**/*.test.ts`
- Coverage provider: V8
- Coverage thresholds: 70% statements/functions/lines, 60% branches
- Coverage reporters: text, html, lcov

Reference: `octocode-research/vitest.config.ts:1-25`

**Test organization:**
- Unit tests: `src/__tests__/unit/`
- Integration tests: `src/__tests__/integration/`

Reference: `.context/analysis.json:32-35`

## Environment Configuration

### Environment Variables

The server supports the following environment variables:

| Variable | Default | Purpose | Where Used |
|----------|---------|---------|------------|
| `NODE_ENV` | `development` | Environment mode | `src/server.ts:10` |
| `OCTOCODE_PORT` | `1987` | Server port (init script only) | `src/server-init.ts:41` |

**Note**: The main server hardcodes port 1987 in `src/server.ts:15`. The `OCTOCODE_PORT` environment variable is only used by the initialization script for health checks.

Reference: `octocode-research/src/server.ts:15`, `octocode-research/src/server-init.ts:41`

**Set environment for PM2:**

```bash
# Production mode (default)
pm2 start ecosystem.config.cjs

# Development mode
pm2 start ecosystem.config.cjs --env development
```

Reference: `octocode-research/ecosystem.config.cjs:80-88`

## Log Files

Application logs are written to `~/.octocode/logs/`:

- `errors.log` - All errors and warnings
- `tools.log` - Tool invocation data and results

**Log rotation:**
- Files rotated when exceeding 10MB
- Rotated files named with timestamp: `errors.2024-01-23T10-30-00.log`
- Keeps 5 most recent rotations per log type
- Old rotations automatically cleaned up

Reference: `octocode-research/src/utils/logger.ts:22-120`

**View logs:**

```bash
# Tail error logs
tail -f ~/.octocode/logs/errors.log

# Tail tool logs
tail -f ~/.octocode/logs/tools.log

# PM2 logs (application logs, not PM2 internal logs)
npm run pm2:logs
```

## Troubleshooting

### Server won't start

1. **Check Node.js version**: Must be 20.0.0 or higher
   ```bash
   node --version
   ```

2. **Check if port 1987 is already in use**:
   ```bash
   lsof -i :1987
   ```

3. **Check for stale lock file**:
   ```bash
   ls -la ~/.octocode/locks/
   # Delete stale lock if server is not running
   rm ~/.octocode/locks/octocode-research-init.lock
   ```

4. **Check logs for errors**:
   ```bash
   tail -n 50 ~/.octocode/logs/errors.log
   ```

Reference: `octocode-research/src/server-init.ts:68-92`

### Build fails

1. **Clear node_modules and reinstall**:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. **Check TypeScript errors**:
   ```bash
   npx tsc --noEmit
   ```

3. **Check tsdown configuration**:
   ```bash
   cat tsdown.config.ts
   ```

### Tests fail

1. **Clear test cache**:
   ```bash
   npx vitest run --clearCache
   ```

2. **Run tests in verbose mode**:
   ```bash
   npx vitest run --reporter=verbose
   ```

## Next Steps

- Read [API Reference](04-API-REFERENCE.md) to learn about available endpoints
- Read [Configuration](05-CONFIGURATION.md) for advanced configuration options
- Read [Deployment](10-DEPLOYMENT.md) for production deployment guidance
