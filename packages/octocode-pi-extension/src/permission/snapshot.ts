import { execFile } from 'node:child_process';
import { DAY_MS } from '../shared/util.js';

/**
 * A restore point taken before a destructive shell command: `git stash create` writes a commit of the tracked files'
 * current state (HEAD when nothing differs) without touching the working tree, the index or the stash list, and
 * `git update-ref` keeps it under `refs/octocode/snapshots/<ms>` so no garbage collection takes it. Untracked files are
 * not in it. Restore a path with `git checkout <ref> -- <path>`.
 */

const SNAPSHOT_NAMESPACE = 'refs/octocode/snapshots';
/** Target time for one snapshot; a slower one is abandoned. `git stash create` hashes every changed tracked file, so a large repository needs seconds, and the command waits for its restore point. */
const SNAPSHOT_TIMEOUT_MS = 5_000;
/** Snapshots older than this are pruned at session start. */
const SNAPSHOT_KEEP_MS = 7 * DAY_MS;

export type Snapshot = { ref: string } | { none: string };

/** Why no snapshot exists, as the card's undo line says it. */
const SNAPSHOT_TIMED_OUT = 'snapshot timed out';

class GitFailure extends Error {
  constructor(
    readonly timedOut: boolean,
    message: string,
  ) {
    super(message);
  }
}

/** Runs git in `cwd` (read-only locking, no prompts); resolves with trimmed stdout. */
function git(cwd: string, args: string[], timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' } }, (error, stdout) => {
      if (error) reject(new GitFailure('killed' in error && error.killed === true, error.message));
      else resolve(stdout.trim());
    });
  });
}

let counter = 0;

/**
 * Snapshots `cwd`'s repository, or says why it cannot (`none`): not a git work tree, no commit yet, or too slow. Never
 * throws and never changes the working tree or the index.
 */
export async function takeSnapshot(cwd: string, options: { now?: number; timeoutMs?: number } = {}): Promise<Snapshot> {
  const deadline = Date.now() + (options.timeoutMs ?? SNAPSHOT_TIMEOUT_MS);
  const left = () => Math.max(1, deadline - Date.now());
  try {
    if ((await git(cwd, ['rev-parse', '--is-inside-work-tree'], left())) !== 'true') return { none: 'not a git work tree' };
    const head = await git(cwd, ['rev-parse', '--verify', '-q', 'HEAD'], left()).catch((error: unknown) => {
      if (error instanceof GitFailure && error.timedOut) throw error;
      return undefined;
    });
    if (!head) return { none: 'no commit yet' };
    // An empty answer means the tracked files equal HEAD.
    const commit = (await git(cwd, ['stash', 'create'], left())) || head;
    const ref = `${SNAPSHOT_NAMESPACE}/${options.now ?? Date.now()}-${counter++}`;
    await git(cwd, ['update-ref', ref, commit], left());
    return { ref };
  } catch (error) {
    if (error instanceof GitFailure && error.timedOut) return { none: SNAPSHOT_TIMED_OUT };
    return error instanceof GitFailure && /not a git repository/i.test(error.message) ? { none: 'not a git work tree' } : { none: 'snapshot failed' };
  }
}

/** Deletes the snapshot refs older than `SNAPSHOT_KEEP_MS` (read from the ref name); returns how many. Never throws. */
export async function pruneSnapshots(cwd: string, now = Date.now()): Promise<number> {
  try {
    const listed = await git(cwd, ['for-each-ref', '--format=%(refname)', `${SNAPSHOT_NAMESPACE}/`], 5_000);
    const old = listed.split('\n').filter((ref) => {
      const at = Number(/\/(\d+)(?:-\d+)?$/.exec(ref)?.[1]);
      return Number.isFinite(at) && now - at > SNAPSHOT_KEEP_MS;
    });
    for (const ref of old) await git(cwd, ['update-ref', '-d', ref], 5_000);
    return old.length;
  } catch {
    return 0;
  }
}
