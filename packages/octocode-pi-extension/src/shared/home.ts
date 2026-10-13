import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAgentDir } from '@earendil-works/pi-coding-agent';
import { processAlive } from './process.js';

/** The folder name Octocode uses at both levels: `~/.octocode` (global) and `<repo root>/.octocode` (workspace). */
const OCTOCODE_DIR = '.octocode';

/**
 * Octocode's home: `OCTOCODE_HOME` when set, else `~/.octocode` (the rule `@octocodeai/config` applies; this extension
 * is a standalone package, so it repeats the two-line rule instead of depending on it).
 */
export function octocodeHome(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): string {
  const override = env['OCTOCODE_HOME']?.trim();
  return override ? path.resolve(override) : path.join(home, OCTOCODE_DIR);
}

/**
 * A folder under the Octocode home for files a tool writes at runtime (logs, spilled output, browser profiles), so
 * nothing the agent produces lands in the shared temp directory. Created on first use.
 */
export function outputDir(name: string, env: NodeJS.ProcessEnv = process.env): string {
  return privateDir(path.join(octocodeHome(env), name));
}

/** Owner-only mode for runtime files (logs, spilled output, checkpoint blobs): they can hold source and secrets. */
export const PRIVATE_FILE_MODE = 0o600;

/**
 * Creates `dir` (and missing parents) owner-only (0700), and tightens an existing `dir` to 0700: runtime state is
 * not for other users on the machine. A folder this user does not own keeps its mode.
 */
export function privateDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    // Not ours to change (a shared OCTOCODE_HOME); the files in it are still owner-only.
  }
  return dir;
}

const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;

/**
 * Pi's `normalizePath` (utils/paths, not exported): with `tool`, Unicode spaces become spaces and a leading `@` is
 * dropped; then (Windows) `/c/x`, `/mnt/c/x`, `/cygdrive/c/x` become `C:\x`, `~` expands, and `file://` URLs convert.
 */
function normalizeToolPath(input: string, tool: boolean): string {
  let value = tool ? input.replace(UNICODE_SPACES, ' ') : input;
  if (tool && value.startsWith('@')) value = value.slice(1);
  if (process.platform === 'win32' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) {
    const drive = /^\/(?:mnt\/|cygdrive\/)?([a-z])(?:\/(.*))?$/i.exec(value);
    if (drive) value = `${drive[1]!.toUpperCase()}:\\${drive[2]?.replaceAll('/', '\\') ?? ''}`;
  }
  if (value === '~') return os.homedir();
  if (value.startsWith('~/') || (process.platform === 'win32' && value.startsWith('~\\'))) return path.join(os.homedir(), value.slice(2));
  return /^file:\/\//.test(value) ? fileURLToPath(value) : value;
}

/**
 * The absolute path a Pi tool (`read`, `write`, `edit`) acts on for the `path` argument `raw`, by Pi's own rule
 * (core/tools/path-utils `resolveToCwd`), so a file this extension tracks or reserves is the file Pi touches.
 */
export function resolveToolPath(cwd: string, raw: string): string {
  const normalized = normalizeToolPath(raw, true);
  return path.isAbsolute(normalized) ? path.resolve(normalized) : path.resolve(normalizeToolPath(cwd, false), normalized);
}

/**
 * The file Pi's `read` opens for `raw` (core/tools/path-utils `resolveReadPath`, not exported): `resolveToolPath`, or
 * when that does not exist, the first existing macOS variant: a narrow no-break space before AM/PM (screenshot names),
 * NFD (decomposed) form, a curly apostrophe (U+2019), or NFD with a curly apostrophe.
 */
export function resolveReadToolPath(cwd: string, raw: string): string {
  const resolved = resolveToolPath(cwd, raw);
  if (fs.existsSync(resolved)) return resolved;
  const nfd = resolved.normalize('NFD');
  const curly = (value: string) => value.replace(/'/g, '\u2019');
  const variants = [resolved.replace(/ (AM|PM)\./gi, '\u202F$1.'), nfd, curly(resolved), curly(nfd)];
  return variants.find((variant) => variant !== resolved && fs.existsSync(variant)) ?? resolved;
}

/**
 * The file a Pi `read` call showed the model (any range: Pi's own guard semantics); none for every other tool. For the
 * `file` tool's guard, the reads restored from a session's context (`files/reads`) and report-read tracking. MCP
 * tools are the server's own contract (Octocode's `localFetch` pages and minifies by its own rules), so the extension
 * does not parse their inputs or results.
 */
export function readPaths(toolName: string, input: Record<string, unknown>, cwd: string): string[] {
  return toolName === 'read' && typeof input['path'] === 'string' ? [resolveReadToolPath(cwd, input['path'])] : [];
}

/**
 * `<workspace>/.octocode/tmp/<name>`: where agents hand results to each other as files, so a long result is read on
 * demand instead of riding in a model's context. The `tmp` folder ignores itself (`.gitignore` of `*`), so nothing in
 * it is committed, in this repository or any other. Created on first use.
 */
export function workspaceScratchDir(workspace: string, name: string): string {
  const root = path.join(workspace, OCTOCODE_DIR, 'tmp');
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  const ignore = path.join(root, '.gitignore');
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, '*\n');
  return dir;
}

/** Removes entries of `dir` not modified for `maxAgeMs`, except those named in `keep`, with non-blocking calls. Never rejects. */
export async function sweepStaleOutputs(dir: string, maxAgeMs: number, keep: ReadonlySet<string> = new Set(), now = Date.now()): Promise<void> {
  let names: string[];
  try {
    names = await fs.promises.readdir(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (keep.has(name)) continue;
    const file = path.join(dir, name);
    try {
      if (now - (await fs.promises.stat(file)).mtimeMs > maxAgeMs) await fs.promises.rm(file, { recursive: true, force: true });
    } catch {
      // Removed meanwhile, or not ours to remove.
    }
  }
}

/**
 * Removes entries of `dir` named `<pid>-…` whose process is gone and that are older than `maxAgeMs` (a crashed
 * session's leftovers); entries of live processes stay whatever their age. Never throws.
 */
export function sweepDeadOutputs(dir: string, maxAgeMs: number, now = Date.now()): void {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const pid = Number(/^(\d+)-/.exec(name)?.[1]);
    if (!pid || pid === process.pid || processAlive(pid)) continue;
    const file = path.join(dir, name);
    try {
      if (now - fs.statSync(file).mtimeMs > maxAgeMs) fs.rmSync(file, { recursive: true, force: true });
    } catch {
      // Removed meanwhile, or not ours to remove.
    }
  }
}

/** Moves a file, copying across file systems; returns false when it could not. */
export function moveFile(from: string, to: string): boolean {
  try {
    fs.renameSync(from, to);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') return false;
    try {
      fs.copyFileSync(from, to);
      fs.rmSync(from, { force: true });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Where Octocode keeps things. `.octocode` is the one place, at two levels:
 *   global     `OCTOCODE_HOME` or `~/.octocode`: user config (skills/, agents/, hooks.json) and runtime state
 *              (`pi-*` folders: trust decisions, team DB, logs, spilled output, checkpoints, worktrees)
 *   workspace  `<repo root>/.octocode`: project config (loads only when the project is trusted) and `tmp/` scratch
 * Workspace paths resolve from the repository root, so a session started in a subfolder reads the same files.
 * Other agents' files (`.pi/…`, `.claude/…`, `.codex/…`) are read too; their names live here as well so
 * the loaders and the trust fingerprint (src/shared/trust.ts) always agree on the list.
 */

/** Entry names under the Octocode home. On-disk names are kept stable: existing files must keep resolving. */
export const HOME_NAMES = {
  skills: 'skills',
  agents: 'agents',
  hooks: 'hooks.json',
  trust: 'pi-trust.json',
  team: 'pi-team',
  api: 'pi-api',
  browser: 'pi-browser',
  browserProfile: 'pi-browser-profile',
  worktrees: 'pi-worktrees',
  /** Durable agent state: `octocode.db` and `sessions/<id>/{output,bash,checkpoints}`. */
  agentState: 'agent/pi',
} as const;

type GlobalPaths = { readonly [K in keyof typeof HOME_NAMES]: string } & { readonly home: string };

/** Every global Octocode path, under `OCTOCODE_HOME` or `<home>/.octocode`. Nothing is created. */
export function globalPaths(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): GlobalPaths {
  const base = octocodeHome(env, home);
  const entries = Object.entries(HOME_NAMES).map(([key, name]) => [key, path.join(base, name)]);
  return { home: base, ...Object.fromEntries(entries) } as GlobalPaths;
}

/** The durable agent database: `OCTOCODE_AGENT_DB`, else `<agentState>/octocode.db`. Nothing is created. */
export function agentDbPath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env['OCTOCODE_AGENT_DB']?.trim();
  return override ? path.resolve(override) : path.join(globalPaths(env).agentState, 'octocode.db');
}

/** A session id as a folder name. */
export const sessionDirName = (id: string): string => id.replace(/[^\w.-]/g, '_');

/** `<agentState>/sessions`: one folder per session. Nothing is created. */
export const sessionsRoot = (env: NodeJS.ProcessEnv = process.env): string => path.join(globalPaths(env).agentState, 'sessions');

/** `<agentState>/sessions/<sanitized id>`. Nothing is created. */
export const sessionDir = (id: string, env: NodeJS.ProcessEnv = process.env): string => path.join(sessionsRoot(env), sessionDirName(id));

let currentSession: string | undefined;

/** Sets the process-wide current session (the first `session_start` handler does, before anything writes output). */
export function setCurrentSession(id: string | undefined): void {
  currentSession = id?.trim() || undefined;
}

/** The process-wide current session id, if one is set. */
export const currentSessionId = (): string | undefined => currentSession;

/** Folder name for a process with no session yet (unit tests, before `session_start`); swept once the process is gone. */
export const PID_SESSION_PREFIX = '_pid-';

/**
 * The current session's private `output`, `bash` or `checkpoints` folder, created on use. With no session set it is
 * `<agentState>/sessions/_pid-<pid>/<kind>`.
 */
export function sessionOutputDir(kind: 'output' | 'bash' | 'checkpoints', env: NodeJS.ProcessEnv = process.env): string {
  const dir = currentSession ? sessionDir(currentSession, env) : path.join(sessionsRoot(env), `${PID_SESSION_PREFIX}${process.pid}`);
  privateDir(path.dirname(dir));
  privateDir(dir);
  return privateDir(path.join(dir, kind));
}

/** Pi's agent directory: `<home>/.pi/agent` for an explicit home (tests), else Pi's own (honors its env override). */
export const piAgentDir = (home?: string): string => (home === undefined ? getAgentDir() : path.join(home, '.pi', 'agent'));

interface WorkspacePaths {
  /** The repository root every workspace path hangs from. */
  root: string;
  dir: string;
  skills: string;
  agents: string;
  hooks: string;
  /** Scratch space for agent hand-offs (see `workspaceScratchDir`). */
  tmp: string;
}

/** `<repo root>/.octocode` paths for `cwd`. Nothing is created. */
export function workspacePaths(cwd: string): WorkspacePaths {
  const { root } = repoKey(cwd);
  const dir = path.join(root, OCTOCODE_DIR);
  return { root, dir, skills: path.join(dir, 'skills'), agents: path.join(dir, 'agents'), hooks: path.join(dir, 'hooks.json'), tmp: path.join(dir, 'tmp') };
}

/** Trust-gated project hook files: Claude Code, Codex, then Octocode's. */
export function projectHookFiles(cwd: string): string[] {
  const { root, hooks } = workspacePaths(cwd);
  return [path.join(root, '.claude', 'settings.json'), path.join(root, '.claude', 'settings.local.json'), path.join(root, '.codex', 'hooks.json'), hooks];
}

/** Trust-gated project subagent profile directories, least specific first. */
export function projectAgentDirs(cwd: string): string[] {
  const { root, agents } = workspacePaths(cwd);
  return [path.join(root, '.pi', 'agents'), agents];
}

/** Trust-gated project skill directories Pi does not load itself: `.claude/skills` from `cwd` up to the root, then Octocode's. */
export function projectSkillDirs(cwd: string): string[] {
  return [...dirsToRepoRoot(cwd).map((dir) => path.join(dir, '.claude', 'skills')), workspacePaths(cwd).skills];
}

/** `file` with the home directory shown as `~`. */
export function tildePath(file: string, home = os.homedir()): string {
  const relative = path.relative(home, file);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? `~${path.sep}${relative}` : file;
}

/**
 * One line per config file for a status report: `✓` when it exists, `·` when not; files missing from `userFiles` are
 * project files, which load only in a trusted project.
 */
export function configFileLines(files: string[], userFiles: string[], home = os.homedir()): string[] {
  const user = new Set(userFiles);
  return [...new Set(files)].map((file) => {
    const note = user.has(file) ? '' : ' (project: loads only when trusted, /octocode trust)';
    return `  ${fs.existsSync(file) ? '✓' : '·'} ${tildePath(file, home)}${note}`;
  });
}

/** Which repository a directory belongs to; the one answer every feature (team, backlog, memory, sessions, workspace files) uses. */
export interface RepoKey {
  /** realpath of the git common dir (worktrees share their main repo's key), else `root`. */
  key: string;
  /** realpath of the git toplevel; without git, of the nearest directory holding `.git`, else of cwd. */
  root: string;
  name: string;
}

const repoCache = new Map<string, RepoKey>();

/**
 * `file` with symlinks resolved, so one file reached through two paths has one name: the realpath of its deepest
 * existing ancestor joined with the rest (the file itself may not exist yet). A dangling symlink on the way is followed
 * to its target, so a write through it is placed where it would land; a symlink loop stops after 40 hops.
 */
export function canonicalPath(file: string, hops = 40): string {
  const absolute = path.resolve(file);
  const rest: string[] = [];
  for (let dir = absolute; ; dir = path.dirname(dir)) {
    try {
      return path.join(fs.realpathSync.native(dir), ...rest.reverse());
    } catch {
      const target = hops > 0 ? linkTarget(dir) : undefined;
      if (target !== undefined) return canonicalPath(path.join(path.resolve(path.dirname(dir), target), ...rest.reverse()), hops - 1);
      const parent = path.dirname(dir);
      if (parent === dir) return absolute;
      rest.push(path.basename(dir));
    }
  }
}

/** Where the symlink `file` points (as written in the link), or undefined when it is not a symlink. */
function linkTarget(file: string): string | undefined {
  try {
    return fs.lstatSync(file).isSymbolicLink() ? fs.readlinkSync(file) : undefined;
  } catch {
    return undefined;
  }
}

/** Whether `file` is `dir` or under it (both already resolved; no symlinks are followed here). */
export function isWithin(file: string, dir: string): boolean {
  const relative = path.relative(dir, file);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/**
 * `cwd` and its ancestors up to the repository root (the nearest directory holding `.git`), nearest first; just
 * `cwd` outside a repository.
 */
export function dirsToRepoRoot(cwd: string): string[] {
  const dirs: string[] = [];
  for (let dir = path.resolve(cwd); ; dir = path.dirname(dir)) {
    dirs.push(dir);
    if (fs.existsSync(path.join(dir, '.git'))) return dirs;
    if (path.dirname(dir) === dir) return [path.resolve(cwd)];
  }
}

/**
 * Which repository `cwd` belongs to, symlinks resolved, so one checkout reached through two paths is one repository.
 * Cached per cwd; never throws.
 */
export function repoKey(cwd: string): RepoKey {
  const cached = repoCache.get(cwd);
  if (cached) return cached;
  let result: RepoKey;
  try {
    const out = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir', '--show-toplevel'], { cwd, encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    const [common, top] = out.split(/\r?\n/).map((line) => line.trim());
    if (!common || !top) throw new Error('not a work tree');
    const root = canonicalPath(top);
    result = { key: canonicalPath(common), root, name: path.basename(root) };
  } catch {
    // No git (or not a work tree git can read): the nearest `.git` marker still names the repository.
    const root = canonicalPath(dirsToRepoRoot(cwd).at(-1) ?? cwd);
    result = { key: root, root, name: path.basename(root) };
  }
  repoCache.set(cwd, result);
  return result;
}
