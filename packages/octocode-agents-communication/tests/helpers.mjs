import * as childProcess from 'node:child_process';
import { runtimeCommand } from '../scripts/cli-command.mjs';
import { closeSync, existsSync, mkdtempSync, openSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

// Every runtime these tests start inherits a private Octocode home: a session on a test database registers itself under
// the home (scripts/docs/DB.md#active-database-registry), and a real home must not see temporary databases.
process.env.OCTOCODE_HOME = mkdtempSync(join(tmpdir(), 'communication-home-'));
process.on('exit', () => rmSync(process.env.OCTOCODE_HOME, { recursive: true, force: true }));

const python = childProcess.execFileSync(process.env.OCTOCODE_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8' }).trim();
function invocationFor(executable, args) {
  if (existsSync(executable) && realpathSync(executable).endsWith('/tests/vendor-fixture.sh')) return { command: '/bin/sh', args: [executable, ...args] };
  const invocation = runtimeCommand(executable, args);
  if (invocation.args[0] === '-B' && invocation.args[1]?.endsWith('.py')) invocation.command = python;
  return invocation;
}

/**
 * Runs a synchronous spawn with `options.input` delivered from a private file instead of a stdin pipe. On macOS,
 * Node's synchronous spawn writes `input` into a socketpair and can miss the write-ready wakeup: the child then waits in
 * read() and the call stalls until its timeout (about 1 in 100 one-MiB writes to python3; asynchronous stdin and file
 * stdin never stalled in 1500 runs each). A file gives the child the same bytes followed by EOF.
 */
export function withFileInput(options, run) {
  if (options?.input === undefined) return run(options);
  const { input, ...rest } = options;
  const directory = mkdtempSync(join(tmpdir(), 'communication-stdin-'));
  const path = join(directory, 'stdin');
  writeFileSync(path, input, { mode: 0o600 });
  const descriptor = openSync(path, 'r');
  try {
    const stdio = typeof rest.stdio === 'string' ? [rest.stdio, rest.stdio, rest.stdio] : [...(rest.stdio ?? ['pipe', 'pipe', 'pipe'])];
    stdio[0] = descriptor;
    return run({ ...rest, stdio });
  } finally {
    closeSync(descriptor);
    rmSync(directory, { recursive: true, force: true });
  }
}

export function execFileSync(executable, args = [], options) {
  const invocation = invocationFor(executable, args);
  return withFileInput(options, resolved => childProcess.execFileSync(invocation.command, invocation.args, resolved));
}
export function spawnSync(executable, args = [], options) {
  const invocation = invocationFor(executable, args);
  return withFileInput(options, resolved => childProcess.spawnSync(invocation.command, invocation.args, resolved));
}
export function execFile(executable, args = [], ...rest) {
  const invocation = invocationFor(executable, args);
  return childProcess.execFile(invocation.command, invocation.args, ...rest);
}
execFile[promisify.custom] = (executable, args = [], ...rest) => {
  const invocation = invocationFor(executable, args);
  return promisify(childProcess.execFile)(invocation.command, invocation.args, ...rest);
};
export function spawn(executable, args = [], ...rest) {
  const invocation = invocationFor(executable, args);
  return childProcess.spawn(invocation.command, invocation.args, ...rest);
}

export const root = fileURLToPath(new URL('../', import.meta.url));
const scripts = join(root, 'scripts');
/** COMMUNICATION_BINARY override, else the portable Python entry point. */
export const binary = process.env.COMMUNICATION_BINARY || join(scripts, 'communication.py');
/** Shipped POSIX launcher. */
export const launcher = join(scripts, 'agents-communication');
/** COMMUNICATION_BINARY override, else the shipped launcher. */
export const launcherCommand = process.env.COMMUNICATION_BINARY || launcher;

/** Child environment with a short heartbeat period so presence and lease-renewal tests skip real 15 s waits. */
export const fastHeartbeatEnv = (env = process.env, ms = 100) => ({...env, OCTOCODE_COMMUNICATION_HEARTBEAT_MS: String(ms)});

/** Polls `check` every `interval` ms until it returns truthy; fails with `message` after `timeout` ms. */
export async function waitFor(check, {timeout = 10000, interval = 20, message = 'Condition not reached'} = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() >= end) throw new Error(`${message} within ${timeout} ms`);
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

/** Fresh temporary directory; `real` resolves symlinked temp roots such as /var → /private/var. */
export function tempDir(prefix, { real = false, parent = tmpdir() } = {}) {
  const directory = mkdtempSync(join(parent, prefix));
  return real ? realpathSync(directory) : directory;
}

/** tempDir removed after test `t`. */
export function tempWorkspace(t, prefix, options) {
  const directory = tempDir(prefix, options);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

/** `command '<json input>' --workspace W --database D [--session S]` argv builder. */
export const commandArgs = (workspace, database) => (command, input = {}, session) =>
  [command, JSON.stringify(input), '--workspace', workspace, '--database', database, ...(session ? ['--session', session] : [])];

/** Synchronous JSON CLI call bound to one workspace and database. */
export function jsonCall(file, workspace, database, options = {}) {
  const args = commandArgs(workspace, database);
  return (command, input, session) => JSON.parse(execFileSync(file, args(command, input, session), { encoding: 'utf8', ...options }));
}

export const reasoningCommands = ['send_message', 'notify_all', 'lock', 'lock_many', 'share_document'];
/** Adds a default reasoning to commands that require one; explicit input wins. */
export const withReasoning = (command, input) => reasoningCommands.includes(command)
  ? { reasoning: `Verify ${command} behavior in this isolated regression fixture`, ...input }
  : input;
