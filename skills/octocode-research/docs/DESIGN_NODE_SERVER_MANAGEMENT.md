# Design: Cross-Platform Server Management

> **Status**: ✅ APPROVED  
> **Effort**: 30 minutes  
> **Lines of Code**: ~50

## Problem

`install.sh` doesn't work on Windows (uses `lsof`, `kill`, bash syntax).

## Solution

Add a simple Node.js script that works everywhere. Keep `install.sh` for Mac/Linux users.

---

## Implementation

### New File: `scripts/server.ts`

```typescript
#!/usr/bin/env npx tsx
/**
 * Cross-platform server management
 * Usage: npx tsx scripts/server.ts [start|stop|status|health]
 */
import { spawn, execSync } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const PORT = 1987;
const PID_FILE = join(tmpdir(), 'octocode-research.pid');
const LOG_FILE = join(tmpdir(), 'octocode-research.log');

const cmd = process.argv[2] || 'start';

async function isServerRunning(): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${PORT}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

function getPid(): number | null {
  if (existsSync(PID_FILE)) {
    return Number(readFileSync(PID_FILE, 'utf8').trim());
  }
  return null;
}

async function start() {
  if (await isServerRunning()) {
    console.log(`✅ Server already running on port ${PORT}`);
    return;
  }

  const isWindows = process.platform === 'win32';
  const child = spawn('node', ['dist/server.js'], {
    detached: !isWindows,
    windowsHide: true,
    stdio: 'ignore',
    env: process.env, // Tokens already in env (GITHUB_TOKEN, etc.)
  });
  child.unref();
  writeFileSync(PID_FILE, String(child.pid));

  // Wait for server to be ready
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (await isServerRunning()) {
      console.log(`✅ Server started on http://localhost:${PORT}`);
      return;
    }
  }
  console.error('❌ Server failed to start');
  process.exit(1);
}

function stop() {
  const pid = getPid();
  if (pid) {
    try {
      process.kill(pid);
      console.log(`✅ Stopped server (PID: ${pid})`);
    } catch {
      console.log('⚠️ Process already stopped');
    }
    unlinkSync(PID_FILE);
  } else {
    console.log('⚠️ No PID file found');
  }
}

async function status() {
  const running = await isServerRunning();
  const pid = getPid();
  console.log(running 
    ? `✅ Server running on port ${PORT}${pid ? ` (PID: ${pid})` : ''}`
    : `❌ Server not running`
  );
}

async function health() {
  try {
    const res = await fetch(`http://localhost:${PORT}/health`);
    console.log(await res.json());
  } catch {
    console.error('❌ Server not responding');
    process.exit(1);
  }
}

// Main
const commands: Record<string, () => Promise<void> | void> = {
  start,
  stop,
  restart: async () => { stop(); await start(); },
  status,
  health,
};

const handler = commands[cmd];
if (!handler) {
  console.log(`Usage: npx tsx scripts/server.ts [start|stop|restart|status|health]`);
  process.exit(1);
}
Promise.resolve(handler());
```

### Fallback Logic in `install.sh`

Modify `install.sh` to attempt using the Node.js script if the bash-based server startup fails:

```bash
# ... inside start_server ...
    log_warn "Bash startup failed. Attempting fallback to Node.js server script..."
    
    # Try the Node.js script
    if npm run server:start; then
        log_server "Server started successfully using Node.js fallback!"
        return 0
    fi

    log_error "Server failed to start (both bash and node). Check logs:"
    cat "$LOG_FILE" 2>/dev/null || true
    exit 1
}
```

---

## package.json Updates

```json
{
  "scripts": {
    "server": "npx tsx scripts/server.ts",
    "server:start": "npx tsx scripts/server.ts start",
    "server:stop": "npx tsx scripts/server.ts stop"
  }
}
```

---

## Token Passing

**Already works** - tokens flow through `process.env`:

| Source | How It Works |
|--------|--------------|
| `GITHUB_TOKEN` env var | Passed automatically via `env: process.env` |
| `GH_TOKEN` env var | Passed automatically |
| `gh auth token` | User runs this before starting, sets GITHUB_TOKEN |

No special token handling needed in the Node script.

---

## Platform Support

| Platform | `install.sh` | `scripts/server.ts` |
|----------|--------------|---------------------|
| macOS | ✅ (with fallback) | ✅ |
| Linux | ✅ (with fallback) | ✅ |
| Windows | ❌ | ✅ |

---

## Migration

1. Keep `install.sh` as-is (Mac/Linux users keep working)
2. Add `scripts/server.ts` (Windows users get support)
3. Update `install.sh` to use `scripts/server.ts` as fallback
4. Update docs to mention both options

---

## Success Criteria

- [x] `npx tsx scripts/server.ts start` works on Windows
- [x] `npx tsx scripts/server.ts stop` works on Windows  
- [x] Existing `./install.sh` still works on Mac/Linux
- [x] `install.sh` falls back to Node script on failure
- [x] GITHUB_TOKEN passed correctly to server

---

**Total: ~90 lines including comments. Ships in 30 minutes.**
