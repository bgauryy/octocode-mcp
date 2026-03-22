/**
 * Integration test: detached daemon lifecycle.
 *
 * Spawns server-init.js on a random test port, verifies that:
 * 1. init exits after server is healthy (detached daemon behavior)
 * 2. server survives init exit
 * 3. second init detects running server and exits immediately
 * 4. PID file is created on startup and removed on shutdown
 */

import { describe, it, expect, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';

const SCRIPTS_DIR = join(import.meta.dirname, '..', '..', '..', 'scripts');
const SERVER_INIT_SCRIPT = join(SCRIPTS_DIR, 'server-init.js');

const TEST_PORT = 19871;
const HEALTH_URL = `http://localhost:${TEST_PORT}/health`;
const OCTOCODE_DIR = process.env.OCTOCODE_HOME || join(homedir(), '.octocode');
const PID_FILE = join(OCTOCODE_DIR, `research-server-${TEST_PORT}.pid`);

async function pollHealth(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const body = (await res.json()) as { status: string };
        if (body.status === 'ok') return true;
      }
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function isServerDown(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(HEALTH_URL, { signal: AbortSignal.timeout(1000) });
    } catch {
      return true;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

function spawnInitScript(): ChildProcess {
  return spawn('node', [SERVER_INIT_SCRIPT], {
    env: {
      ...process.env,
      OCTOCODE_PORT: String(TEST_PORT),
      OCTOCODE_RESEARCH_PORT: String(TEST_PORT),
    },
    stdio: 'pipe',
  });
}

function killListenersOnPort(port: number): Promise<void> {
  return new Promise((resolve) => {
    const proc = spawn('sh', ['-c', `lsof -sTCP:LISTEN -ti :${port} | xargs kill -9 2>/dev/null`], {
      stdio: 'ignore',
    });
    proc.on('close', () => resolve());
    setTimeout(() => resolve(), 2000);
  });
}

function waitForExit(proc: ChildProcess, timeoutMs: number): Promise<number | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      resolve(null);
    }, timeoutMs);
    proc.on('exit', (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
}

describe('Server Lifecycle (Detached Daemon)', () => {
  let initProc: ChildProcess | null = null;

  afterEach(async () => {
    if (initProc && !initProc.killed) {
      initProc.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          try { initProc?.kill('SIGKILL'); } catch { /* already dead */ }
          resolve();
        }, 5000);
        initProc!.on('exit', () => { clearTimeout(timeout); resolve(); });
      });
    }
    initProc = null;
    await killListenersOnPort(TEST_PORT);
    await new Promise((r) => setTimeout(r, 500));
  });

  it('init exits after server is healthy and server survives', async () => {
    initProc = spawnInitScript();

    let initOutput = '';
    initProc.stdout?.on('data', (chunk: Buffer) => { initOutput += chunk.toString(); });
    initProc.stderr?.on('data', (chunk: Buffer) => { initOutput += chunk.toString(); });

    // Init should exit on its own after server is ready
    const exitCode = await waitForExit(initProc, 45_000);
    expect(exitCode, `Init should exit 0. Output:\n${initOutput}`).toBe(0);
    expect(initOutput).toContain('ok');

    // Server should still be running after init exits
    const serverAlive = await pollHealth(5_000);
    expect(serverAlive, 'Server should survive init exit (detached daemon)').toBe(true);

    // Verify health response reflects detached mode
    const healthRes = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(3000) });
    const healthBody = (await healthRes.json()) as { status: string; port: number; processManager: string; pid: number };
    expect(healthBody.status).toBe('ok');
    expect(healthBody.port).toBe(TEST_PORT);
    expect(healthBody.processManager).toContain('detached');
    expect(healthBody.pid).toBeGreaterThan(0);
  }, 60_000);

  it('init exits immediately when server is already running', async () => {
    // Start first init → starts server
    initProc = spawnInitScript();

    let output1 = '';
    initProc.stdout?.on('data', (chunk: Buffer) => { output1 += chunk.toString(); });

    const exitCode1 = await waitForExit(initProc, 45_000);
    expect(exitCode1, `First init should exit 0. Output:\n${output1}`).toBe(0);

    // Server should be alive
    const ready = await pollHealth(5_000);
    expect(ready, 'Server should be running').toBe(true);

    // Start a SECOND init — should detect running server and exit fast
    const secondInit = spawnInitScript();

    let output2 = '';
    secondInit.stdout?.on('data', (chunk: Buffer) => { output2 += chunk.toString(); });

    const exitCode2 = await waitForExit(secondInit, 15_000);
    expect(exitCode2, `Second init should exit 0 (fast path). Output:\n${output2}`).toBe(0);
    expect(output2).toContain('ok');

    // Server should still be alive
    const stillAlive = await pollHealth(3_000);
    expect(stillAlive).toBe(true);
  }, 60_000);

  it('PID file is created on startup and cleaned up on shutdown', async () => {
    initProc = spawnInitScript();

    let initOutput = '';
    initProc.stdout?.on('data', (chunk: Buffer) => { initOutput += chunk.toString(); });

    const exitCode = await waitForExit(initProc, 45_000);
    expect(exitCode, `Init should exit 0. Output:\n${initOutput}`).toBe(0);

    // PID file should exist
    expect(existsSync(PID_FILE), 'PID file should exist after server starts').toBe(true);

    const pidContent = readFileSync(PID_FILE, 'utf-8').trim();
    const pid = parseInt(pidContent, 10);
    expect(pid).toBeGreaterThan(0);

    // Verify the PID matches the running server
    const healthRes = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(3000) });
    const healthBody = (await healthRes.json()) as { pid: number };
    expect(pid).toBe(healthBody.pid);

    // Kill the server via its PID
    process.kill(pid, 'SIGTERM');

    // Server should stop
    const serverDead = await isServerDown(10_000);
    expect(serverDead, 'Server should stop after SIGTERM').toBe(true);

    // PID file should be cleaned up
    await new Promise((r) => setTimeout(r, 1000));
    expect(existsSync(PID_FILE), 'PID file should be removed on shutdown').toBe(false);
  }, 60_000);
});
