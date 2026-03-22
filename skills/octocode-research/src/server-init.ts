/**
 * Server Init Script — Detached Daemon Launcher
 *
 * 1. Checks if server is already running (health check)
 * 2. If running → prints "ok" and exits
 * 3. If not → starts server as **detached** process, waits for health, prints "ok", exits
 *
 * Lifecycle: The server runs as an independent daemon (detached, unref'd).
 * No client owns the server — it self-terminates after 30 minutes of idle.
 * Every invocation of this script exits after confirming the server is healthy.
 *
 * Usage: npm run server-init
 * Exit codes: 0 = success, 1 = error
 */

import { spawn } from 'child_process';
import { join } from 'path';

// =============================================================================
// Configuration (Environment Variables)
// =============================================================================

const PORT = parseInt(process.env.OCTOCODE_RESEARCH_PORT || process.env.OCTOCODE_PORT || '1987', 10);
const HOST = process.env.OCTOCODE_RESEARCH_HOST || 'localhost';
const HEALTH_URL = `http://${HOST}:${PORT}/health`;
const MAX_WAIT_MS = parseInt(process.env.OCTOCODE_INIT_TIMEOUT || '30000', 10);
const POLL_INTERVAL_MS = parseInt(process.env.OCTOCODE_POLL_INTERVAL || '500', 10);

interface HealthResponse {
  status: 'ok' | 'initializing' | string;
}

// =============================================================================
// Health Check
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
    if (error instanceof Error && !error.message.includes('ECONNREFUSED')) {
      console.error(`[server-init] Health check error: ${error.message}`);
    }
    return null;
  }
}

// =============================================================================
// Server Start — detached daemon (survives parent exit)
// =============================================================================

function startServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const scriptDir = new URL('.', import.meta.url).pathname;
    const serverScript = join(scriptDir, 'server.js');

    const child = spawn('node', [serverScript], {
      stdio: 'ignore',
      cwd: scriptDir,
      detached: true,
    });

    child.on('error', (err) => {
      console.error(`[server-init] Failed to start server: ${err.message}`);
      reject(err);
    });

    child.unref();

    setTimeout(() => {
      console.log(`[server-init] Spawned detached server process (pid: ${child.pid})`);
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
    pollInterval = Math.min(pollInterval * 1.5, 2000);
  }

  return false;
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  // Fast path: server already running → exit immediately
  const initialHealth = await checkHealth();

  if (initialHealth?.status === 'ok') {
    console.log('ok');
    process.exit(0);
  }

  if (initialHealth?.status === 'initializing') {
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

  // Server not running — start it (detached)
  console.log('[server-init] Server not running, starting detached daemon...');

  try {
    await startServer();
  } catch {
    console.error('[server-init] ERROR: Failed to spawn server process');
    process.exit(1);
  }

  const ready = await waitForReady();
  if (!ready) {
    console.error('[server-init] ERROR: Server failed to start within timeout');
    process.exit(1);
  }

  console.log('ok');
  process.exit(0);
}

main();
