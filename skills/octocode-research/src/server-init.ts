/**
 * Server Init Script
 *
 * Handles server initialization with mutex lock:
 * 1. Acquires atomic lock to prevent concurrent startups
 * 2. Checks if server is running (health check)
 * 3. Starts server if not running
 * 4. Waits for status "ok"
 * 5. Outputs "ok" on success
 *
 * Improvements:
 * - Atomic lock using O_CREAT | O_EXCL | O_WRONLY (no race condition)
 * - Exponential backoff retry for lock acquisition
 * - Environment variable configuration
 * - Spawn error handling
 * - Better health check error logging
 *
 * Usage: npm run server-init
 * Exit codes: 0 = success, 1 = error
 */

import { spawn } from 'child_process';
import {
  existsSync,
  mkdirSync,
  unlinkSync,
  readFileSync,
  constants,
  openSync,
  writeSync,
  closeSync,
  statSync,
} from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// =============================================================================
// Configuration (Environment Variables)
// =============================================================================

const PORT = parseInt(process.env.OCTOCODE_PORT || '1987', 10);
const HEALTH_URL = `http://localhost:${PORT}/health`;
const LOCK_DIR = join(homedir(), '.octocode');
const LOCK_FILE = join(LOCK_DIR, 'server-init.lock');
const LOCK_TIMEOUT_MS = parseInt(process.env.OCTOCODE_LOCK_TIMEOUT || '60000', 10);
const MAX_WAIT_MS = parseInt(process.env.OCTOCODE_INIT_TIMEOUT || '30000', 10);
const POLL_INTERVAL_MS = parseInt(process.env.OCTOCODE_POLL_INTERVAL || '500', 10);

interface LockData {
  pid: number;
  timestamp: number;
}

interface HealthResponse {
  status: 'ok' | 'initializing' | string;
}

// =============================================================================
// Atomic Mutex Lock (Based on Snyk pattern - O_EXCL for atomic creation)
// =============================================================================

function ensureLockDir(): void {
  if (!existsSync(LOCK_DIR)) {
    mkdirSync(LOCK_DIR, { recursive: true });
  }
}

function isLockStale(lockPath: string): boolean {
  if (!existsSync(lockPath)) return true;

  try {
    const content = readFileSync(lockPath, 'utf-8');
    if (content && content.trim().length > 0) {
      const data: LockData = JSON.parse(content);

      // Check timestamp
      if (Date.now() - data.timestamp > LOCK_TIMEOUT_MS) {
        return true;
      }

      // Check if process exists
      try {
        process.kill(data.pid, 0);
        return false; // Process exists, lock is valid
      } catch {
        return true; // Process doesn't exist
      }
    }
  } catch {
    // Fall back to mtime check
  }

  // Fallback: check file modification time
  try {
    const stats = statSync(lockPath);
    return Date.now() - stats.mtimeMs > LOCK_TIMEOUT_MS;
  } catch {
    return true;
  }
}

function safeUnlink(filePath: string): void {
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  } catch {
    // Ignore errors
  }
}

async function acquireLock(): Promise<boolean> {
  ensureLockDir();

  // Only retry for stale lock removal race condition, not for valid locks
  const STALE_RETRY_LIMIT = 3;

  for (let attempt = 0; attempt < STALE_RETRY_LIMIT; attempt++) {
    try {
      // Atomic create - fails with EEXIST if file exists
      const fd = openSync(LOCK_FILE, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY);

      const lockData: LockData = {
        pid: process.pid,
        timestamp: Date.now(),
      };

      writeSync(fd, JSON.stringify(lockData));
      closeSync(fd);
      return true;
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException;

      if (nodeErr.code === 'EEXIST') {
        // Lock exists - check if stale
        if (isLockStale(LOCK_FILE)) {
          safeUnlink(LOCK_FILE);
          // Small delay to avoid tight loop on stale lock race
          await new Promise((r) => setTimeout(r, 50));
          continue; // Retry after removing stale lock
        }

        // Lock is VALID - another process is starting server
        // Don't retry, let caller fall back to waiting for server
        return false;
      } else {
        // Unexpected error
        console.error(`[server-init] Lock error: ${nodeErr.message}`);
        return false;
      }
    }
  }

  return false; // Failed after stale lock retries
}

function releaseLock(): void {
  try {
    if (existsSync(LOCK_FILE)) {
      const data: LockData = JSON.parse(readFileSync(LOCK_FILE, 'utf-8'));
      // Only release if we own the lock
      if (data.pid === process.pid) {
        unlinkSync(LOCK_FILE);
      }
    }
  } catch {
    // Ignore errors during cleanup
  }
}

// =============================================================================
// Health Check (Improved error handling)
// =============================================================================

async function checkHealth(): Promise<HealthResponse | null> {
  try {
    const response = await fetch(HEALTH_URL, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as HealthResponse;
  } catch (error: unknown) {
    // Only log unexpected errors, not connection refused (expected when server down)
    if (error instanceof Error && !error.message.includes('ECONNREFUSED')) {
      console.error(`[server-init] Health check error: ${error.message}`);
    }
    return null;
  }
}

// =============================================================================
// Server Start (Improved with error handling)
// =============================================================================

function startServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const scriptDir = new URL('.', import.meta.url).pathname;
    const serverScript = join(scriptDir, 'server.js');

    const child = spawn('node', [serverScript], {
      detached: true,
      stdio: 'ignore',
      cwd: scriptDir,
    });

    // Handle spawn errors (e.g., ENOENT if node not found)
    child.on('error', (err) => {
      console.error(`[server-init] Failed to start server: ${err.message}`);
      reject(err);
    });

    // Give a small window for immediate spawn errors
    setTimeout(() => {
      child.unref();
      console.log(`[server-init] Started server process (pid: ${child.pid})`);
      resolve();
    }, 100);
  });
}

// =============================================================================
// Wait for Ready (with exponential backoff)
// =============================================================================

async function waitForReady(): Promise<boolean> {
  const startTime = Date.now();
  let pollInterval = POLL_INTERVAL_MS;

  while (Date.now() - startTime < MAX_WAIT_MS) {
    const health = await checkHealth();

    if (health?.status === 'ok') {
      return true;
    }

    if (health?.status === 'initializing') {
      console.log('[server-init] Server initializing...');
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
    // Gradual backoff up to 2s
    pollInterval = Math.min(pollInterval * 1.5, 2000);
  }

  return false;
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  // ==========================================================================
  // FAST PATH: Check if server is already running (no lock needed)
  // ==========================================================================
  const initialHealth = await checkHealth();

  if (initialHealth?.status === 'ok') {
    // Server is running - immediate success, no lock needed
    console.log('ok');
    process.exit(0);
  }

  if (initialHealth?.status === 'initializing') {
    // Server is starting - just wait for it, no lock needed
    console.log('[server-init] Server is initializing, waiting...');
    const ready = await waitForReady();
    if (ready) {
      console.log('ok');
      process.exit(0);
    } else {
      console.error('[server-init] ERROR: Server stuck in initializing state');
      process.exit(1);
    }
  }

  // ==========================================================================
  // SLOW PATH: Server not running - need lock to start it
  // ==========================================================================
  const lockAcquired = await acquireLock();

  if (!lockAcquired) {
    // Another process is starting the server - wait for it
    console.log('[server-init] Another process is starting server, waiting...');
    const ready = await waitForReady();
    if (ready) {
      console.log('ok');
      process.exit(0);
    } else {
      console.error('[server-init] ERROR: Timeout waiting for server');
      process.exit(1);
    }
  }

  try {
    // Double-check health after acquiring lock (another process may have started it)
    const health = await checkHealth();

    if (health?.status === 'ok') {
      console.log('ok');
      releaseLock();
      process.exit(0);
    }

    if (health?.status === 'initializing') {
      console.log('[server-init] Server is initializing, waiting...');
      const ready = await waitForReady();
      if (ready) {
        console.log('ok');
        releaseLock();
        process.exit(0);
      } else {
        console.error('[server-init] ERROR: Server stuck in initializing state');
        releaseLock();
        process.exit(1);
      }
    }

    // Server not running - start it
    console.log('[server-init] Server not running, starting...');

    try {
      await startServer();
    } catch {
      console.error('[server-init] ERROR: Failed to spawn server process');
      releaseLock();
      process.exit(1);
    }

    // Wait for server to be ready
    const ready = await waitForReady();
    if (ready) {
      console.log('ok');
      releaseLock();
      process.exit(0);
    } else {
      console.error('[server-init] ERROR: Server failed to start within timeout');
      releaseLock();
      process.exit(1);
    }
  } catch (error) {
    console.error('[server-init] ERROR:', error instanceof Error ? error.message : error);
    releaseLock();
    process.exit(1);
  }
}

// Cleanup on exit
process.on('SIGINT', () => {
  releaseLock();
  process.exit(130);
});

process.on('SIGTERM', () => {
  releaseLock();
  process.exit(143);
});

main();
