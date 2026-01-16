#!/usr/bin/env npx tsx
/**
 * Cross-platform server management
 * Usage: npx tsx scripts/server.ts [start|stop|status|health]
 */
import { spawn } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync, existsSync, openSync } from 'fs';
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
  const logFd = openSync(LOG_FILE, 'a');
  const child = spawn('node', ['dist/server.js'], {
    detached: !isWindows,
    windowsHide: true,
    stdio: ['ignore', logFd, logFd],
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
