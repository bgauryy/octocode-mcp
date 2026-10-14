/** Environment switches: one spelling rule for every `OCTOCODE_*` flag and number. */

/** Set in a `visibleBrowser` profile's child (webLive): `browser` opens a visible Chrome on a persistent profile. */
export const BROWSER_VISIBLE_ENV = 'OCTOCODE_BROWSER_VISIBLE';

/** Set in a subagent: the session id of the Pi session that started it, whose backlog claims the subagent may update. */
export const PARENT_SESSION_ENV = 'OCTOCODE_PARENT_SESSION';

/** `1` runs Claude Code / Codex command hooks (off by default; subagents run them only when their profile opts in). */
export const HOOKS_ENV = 'OCTOCODE_HOOKS';

/** `0` keeps the Octocode MCP server unregistered (set for a profile with `mcp: false`, e.g. the browser subagents). */
export const MCP_ENV = 'OCTOCODE_MCP';

/** `0` turns automatic memory injection off for this process (`/octocode memory auto off` turns it off everywhere). */
export const MEMORY_AUTO_ENV = 'OCTOCODE_MEMORY_AUTO';

/** Days kept output and bash logs survive in a kept session folder (default 30); `0` turns the session sweep off. */
export const CLEANUP_DAYS_ENV = 'OCTOCODE_CLEANUP_DAYS';

/** Set in child processes so a subagent cannot spawn further subagents (and skips the root session's extras). */
export const SUBAGENT_ENV = 'OCTOCODE_SUBAGENT';

/** Set for an isolated subagent: the parent's repository root, whose stored trust decision the worktree follows. */
export const TRUST_ROOT_ENV = 'OCTOCODE_TRUST_ROOT';

/** `off`, `unfocused` (default: only while the terminal is in the background) or `always`: answer-ready notifications. */
export const NOTIFY_ENV = 'OCTOCODE_NOTIFY';

/** `osc9`, `osc777`, `osc99` or `bel`; unset picks one from the terminal's variables. */
export const NOTIFY_METHOD_ENV = 'OCTOCODE_NOTIFY_METHOD';

/** `0` turns the extra skill directories off everywhere. */
export const EXTRA_SKILLS_ENV = 'OCTOCODE_EXTRA_SKILLS';

/** `manual`, `workspace` or `full`: the permission mode a session starts in (unset: full). Owned by the parent in a subagent. */
export const PERMISSION_ENV = 'OCTOCODE_PERMISSION';

/** Set by the parent in a subagent: the action classes its `agent` spawn was allowed (comma-separated). */
export const PERMISSION_GRANTS_ENV = 'OCTOCODE_PERMISSION_GRANTS';

/** Set by the parent in a subagent whose parent can ask a person: the child sends its approval dialogs to the parent (RPC) instead of denying them. */
export const PERMISSION_RELAY_ENV = 'OCTOCODE_PERMISSION_RELAY';

/**
 * Pi's prompt-cache retention for session requests (read by pi-ai at each request and by Pi's cache warmer): `long` asks
 * Anthropic for a 1-hour cache entry, anything else is short (5 minutes). A value the user exported always wins.
 */
export const CACHE_RETENTION_ENV = 'PI_CACHE_RETENTION';

/** The retention Octocode set in this process, kept on `globalThis` so a `/reload` (a fresh module) still tells it from a user's. */
const CHOSEN_RETENTION = Symbol.for('octocode.cacheRetentionChosen');
const chosenStore = globalThis as Record<symbol, string | undefined>;

/** The retention the user exported, not one Octocode chose for this process; undefined when unset. */
function userCacheRetention(env: NodeJS.ProcessEnv): string | undefined {
  const value = env[CACHE_RETENTION_ENV];
  return value === undefined || value === chosenStore[CHOSEN_RETENTION] ? undefined : value;
}

/**
 * Sets the retention of this session's requests, before its first one, unless the user chose one: `long` for an
 * interactive session (its user idles between prompts longer than a 5-minute entry lives; a 1-hour write costs 2× input
 * instead of 1.25×), `short` for a headless run, which sends its requests back to back.
 */
export function chooseSessionCacheRetention(interactive: boolean, env: NodeJS.ProcessEnv = process.env): void {
  if (userCacheRetention(env) !== undefined) return;
  const value = interactive ? 'long' : 'short';
  env[CACHE_RETENTION_ENV] = value;
  chosenStore[CHOSEN_RETENTION] = value;
}

/** A subagent's retention: the user's exported value, else `short` (a child runs briefly and back to back). */
export function childCacheRetention(env: NodeJS.ProcessEnv = process.env): string {
  return userCacheRetention(env) ?? 'short';
}

const TRUE = /^(1|true|on|yes)$/i;
const FALSE = /^(0|false|off|no)$/i;

/** `1|true|on|yes` → true, `0|false|off|no` → false (any case, surrounding space ignored); unset or anything else → `fallback`. */
export function envFlag(env: NodeJS.ProcessEnv, name: string, fallback = false): boolean {
  const value = env[name]?.trim() ?? '';
  if (TRUE.test(value)) return true;
  if (FALSE.test(value)) return false;
  return fallback;
}

/**
 * One of `choices` from the environment (any case, surrounding space ignored): `{ value }`, `{ invalid }` with the raw
 * text when it is none of them, or undefined when unset or empty.
 */
export function envChoice<T extends string>(env: NodeJS.ProcessEnv, name: string, choices: readonly T[]): { value: T } | { invalid: string } | undefined {
  const raw = env[name]?.trim() ?? '';
  if (raw === '') return undefined;
  const value = choices.find((choice) => choice === raw.toLowerCase());
  return value ? { value } : { invalid: raw };
}

/** A whole number from the environment, clamped to `[min, max]`; unset or not an integer → `fallback`. */
export function envInt(env: NodeJS.ProcessEnv, name: string, fallback: number, bounds: { min?: number; max?: number } = {}): number {
  const value = env[name]?.trim() ?? '';
  if (!/^[+-]?\d+$/.test(value)) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Math.min(bounds.max ?? Number.POSITIVE_INFINITY, Math.max(bounds.min ?? Number.NEGATIVE_INFINITY, parsed));
}
