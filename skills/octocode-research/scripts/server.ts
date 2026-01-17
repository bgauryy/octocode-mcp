#!/usr/bin/env npx tsx
/**
 * Cross-platform server management for octocode-research
 * Usage: npx tsx scripts/server.ts [start|stop|restart|status|health|logs|build]
 */

import { spawn, execSync } from 'child_process';
import {
  writeFileSync,
  readFileSync,
  unlinkSync,
  existsSync,
  openSync,
  closeSync,
  rmSync,
  readdirSync,
} from 'fs';
import { createServer } from 'net';
import { tmpdir, homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Token and session management from octocode-shared
import {
  resolveTokenFull,
  type GhCliTokenGetter,
  getOrCreateSession,
  getSessionId,
} from 'octocode-shared';

// === CONSTANTS ===
const PORT = 1987;
const PID_FILE = join(tmpdir(), 'octocode-research.pid');
const LOG_FILE = join(tmpdir(), 'octocode-research.log');
const OCTOCODE_LOGS_DIR = join(homedir(), '.octocode', 'logs');
const LOG_ENDPOINT = 'https://octocode-mcp-host.onrender.com/log';
const SKILL_NAME = 'octocode-research';
const SKILL_VERSION = '2.0.0';

// === COLORS ===
const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

// === UTILITY FUNCTIONS ===

function getProjectRoot(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  return join(__dirname, '..');
}

function checkNodeVersion(): void {
  const version = process.versions.node.split('.')[0];
  if (parseInt(version, 10) < 20) {
    console.error(colors.red(`Node.js 20+ required (found: v${process.versions.node})`));
    process.exit(1);
  }
}

function needsBuild(): boolean {
  return !existsSync(join(getProjectRoot(), 'dist', 'server.js'));
}

function isMonorepo(): boolean {
  const parentPkg = join(getProjectRoot(), '..', '..', 'package.json');
  if (!existsSync(parentPkg)) return false;
  try {
    return readFileSync(parentPkg, 'utf8').includes('"octocode-mcp"');
  } catch {
    return false;
  }
}

function installDependencies(): void {
  const root = getProjectRoot();
  if (existsSync(join(root, 'node_modules'))) return;

  console.log(colors.cyan('[INFO] Installing dependencies...'));
  if (isMonorepo()) {
    execSync('yarn install', { cwd: join(root, '..', '..'), stdio: 'inherit' });
  } else {
    execSync('npm install --omit=dev', { cwd: root, stdio: 'inherit' });
  }
}

function buildProject(): void {
  if (!needsBuild()) return;

  console.log(colors.cyan('[INFO] Building project...'));
  const root = getProjectRoot();
  execSync(isMonorepo() ? 'yarn run build' : 'npm run build', { cwd: root, stdio: 'inherit' });
}

async function isServerRunning(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`http://localhost:${PORT}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

async function isPortInUse(): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
      .once('error', () => resolve(true))
      .once('listening', () => {
        server.close();
        resolve(false);
      })
      .listen(PORT);
  });
}

function getPid(): number | null {
  if (!existsSync(PID_FILE)) return null;
  try {
    const pid = parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const getGhCliToken: GhCliTokenGetter = () => {
  try {
    return execSync('gh auth token', { encoding: 'utf8', timeout: 5000 }).trim();
  } catch {
    return null;
  }
};

async function resolveAndSetTokens(): Promise<void> {
  try {
    const result = await resolveTokenFull({ getGhCliToken });
    if (result?.token) {
      process.env.GITHUB_TOKEN = result.token;
      console.log(colors.cyan(`[INFO] GitHub token resolved from: ${result.source}`));
    }
  } catch {
    // Token resolution is optional
  }

  if (process.env.GITLAB_TOKEN) {
    console.log(colors.cyan('[INFO] GitLab token found in environment'));
  } else if (process.env.GL_TOKEN) {
    console.log(colors.cyan('[INFO] GL_TOKEN found in environment'));
  }
}

function cleanupLogs(): void {
  writeFileSync(LOG_FILE, '');
  if (existsSync(OCTOCODE_LOGS_DIR)) {
    try {
      for (const file of readdirSync(OCTOCODE_LOGS_DIR)) {
        if (file.endsWith('.log')) rmSync(join(OCTOCODE_LOGS_DIR, file), { force: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

function logSkillInstall(sessionId: string): void {
  fetch(LOG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      intent: 'skill_install',
      data: { skill_name: SKILL_NAME, skill_version: SKILL_VERSION },
      timestamp: new Date().toISOString(),
      version: SKILL_VERSION,
    }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}

function killProcessOnPort(): boolean {
  try {
    if (process.platform === 'win32') {
      const output = execSync(`netstat -ano | findstr :${PORT}`, { encoding: 'utf8' });
      const match = output.match(/LISTENING\s+(\d+)/);
      if (match) {
        execSync(`taskkill /PID ${match[1]} /F`, { stdio: 'ignore' });
        return true;
      }
    } else {
      const pid = execSync(`lsof -ti :${PORT}`, { encoding: 'utf8' }).trim();
      if (pid) {
        process.kill(parseInt(pid, 10), 'SIGKILL');
        return true;
      }
    }
  } catch {
    // No process on port
  }
  return false;
}

// === COMMANDS ===

async function start(): Promise<void> {
  checkNodeVersion();

  if (await isServerRunning()) {
    console.log(colors.green(`Server already running on port ${PORT}`));
    const sessionId = await getSessionId();
    if (sessionId) logSkillInstall(sessionId);
    return;
  }

  if (await isPortInUse()) {
    console.error(colors.red(`Port ${PORT} is already in use by another process!`));
    console.error(colors.yellow(`   Check with: lsof -i :${PORT}`));
    console.error(colors.cyan(`   Or use: npm run server stop --force`));
    process.exit(1);
  }

  installDependencies();
  buildProject();
  await resolveAndSetTokens();
  cleanupLogs();

  console.log(colors.cyan(`[SERVER] Starting Octocode Research Server on port ${PORT}...`));

  const root = getProjectRoot();
  const logFd = openSync(LOG_FILE, 'a');

  const child = spawn('node', ['dist/server.js'], {
    cwd: root,
    detached: process.platform !== 'win32',
    windowsHide: true,
    stdio: ['ignore', logFd, logFd],
    env: process.env,
  });

  closeSync(logFd);
  child.unref();
  writeFileSync(PID_FILE, String(child.pid));

  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isServerRunning()) {
      console.log(colors.green(`Server started successfully! (PID: ${child.pid})`));
      console.log(colors.cyan(`[SERVER] Health check: http://localhost:${PORT}/health`));
      console.log(colors.green(`\n[INFO] API ready at http://localhost:${PORT}`));
      const session = await getOrCreateSession();
      logSkillInstall(session.sessionId);
      return;
    }
  }

  console.error(colors.red('Server failed to start. Check logs:'));
  console.error(colors.yellow(`   ${LOG_FILE}`));
  process.exit(1);
}

function stop(force = false): void {
  const pid = getPid();

  if (force) {
    if (killProcessOnPort()) {
      console.log(colors.green(`Killed process on port ${PORT}`));
    } else {
      console.log(colors.yellow(`No process found on port ${PORT}`));
    }
  } else if (pid && isProcessRunning(pid)) {
    try {
      process.kill(pid, 'SIGTERM');
      console.log(colors.green(`Stopped server (PID: ${pid})`));
    } catch {
      console.log(colors.yellow('Process already stopped'));
    }
  } else {
    console.log(colors.yellow('Server not running'));
  }

  if (existsSync(PID_FILE)) {
    try {
      unlinkSync(PID_FILE);
    } catch {
      // Ignore
    }
  }
}

async function restart(): Promise<void> {
  stop();
  await new Promise((r) => setTimeout(r, 1000));
  await start();
}

async function status(): Promise<void> {
  const running = await isServerRunning();
  const pid = getPid();

  if (running) {
    console.log(colors.green(`Server running on port ${PORT}${pid ? ` (PID: ${pid})` : ''}`));
    return;
  }

  const portInUse = await isPortInUse();
  if (portInUse) {
    console.log(colors.yellow(`Port ${PORT} is in use, but NOT by our server!`));
    console.log(colors.cyan(`   Check with: lsof -i :${PORT}`));
    console.log(colors.cyan(`   Force stop: npm run server stop --force`));
  } else if (pid && isProcessRunning(pid)) {
    console.log(colors.yellow(`PID ${pid} exists but server not responding`));
    console.log(colors.cyan('   Try: npm run server restart'));
  } else {
    console.log(colors.red('Server not running'));
    console.log(colors.cyan('   Start with: npm run server:start'));
  }
}

async function health(): Promise<void> {
  try {
    const res = await fetch(`http://localhost:${PORT}/health`);
    console.log(JSON.stringify(await res.json(), null, 2));
  } catch {
    console.error(colors.red('Server not responding'));
    process.exit(1);
  }
}

function logs(follow = false): void {
  if (!existsSync(LOG_FILE)) {
    console.log(colors.yellow(`No logs found at ${LOG_FILE}`));
    return;
  }

  if (follow) {
    const tail = spawn('tail', ['-f', LOG_FILE], { stdio: 'inherit' });
    process.on('SIGINT', () => {
      tail.kill();
      process.exit(0);
    });
  } else {
    console.log(readFileSync(LOG_FILE, 'utf8') || colors.yellow('(empty log file)'));
  }
}

function build(): void {
  checkNodeVersion();
  installDependencies();
  buildProject();
  console.log(colors.green('Build complete'));
}

function showUsage(): void {
  console.log(`
Octocode Research Server - HTTP API on port ${PORT}

Usage: npm run server [command] [options]

Commands:
  start         Start server (install & build if needed) [default]
  stop          Stop running server
  stop --force  Kill any process on port ${PORT}
  restart       Restart server
  status        Check server status
  health        Health check (JSON output)
  logs          Show server logs
  logs -f       Follow logs (live tail)
  build         Build without starting

Quick Start:
  npm run server:start      # Start server
  npm run server:stop       # Stop server
  npm run server status     # Check status
  curl http://localhost:${PORT}/health
`);
}

// === MAIN ===

const commands: Record<string, () => Promise<void> | void> = {
  start,
  stop: () => stop(process.argv.includes('--force')),
  restart,
  status,
  health,
  logs: () => logs(process.argv.includes('-f') || process.argv.includes('--follow')),
  build,
  '--help': showUsage,
  '-h': showUsage,
  help: showUsage,
};

const cmd = process.argv[2] || 'start';
const handler = commands[cmd];

if (!handler) {
  console.error(colors.red(`Unknown command: ${cmd}`));
  showUsage();
  process.exit(1);
}

Promise.resolve(handler()).catch((err) => {
  console.error(colors.red(`Error: ${err.message}`));
  process.exit(1);
});
