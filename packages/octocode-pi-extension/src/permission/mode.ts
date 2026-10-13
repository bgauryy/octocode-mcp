import { envChoice, PERMISSION_ENV, PERMISSION_GRANTS_ENV } from '../shared/env.js';

/**
 * Permission modes: which agent actions run, which ask the user first. One table decides every class in every mode;
 * hard refusals (catastrophic shell, reservations, the Octocode home, hook denies) run before it and no mode skips them.
 * Modes are not a sandbox: they decide what Octocode asks about, while the OS user's rights stay what they are.
 */

export const PERMISSION_MODES = ['manual', 'workspace', 'full'] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];

export const ACTION_CLASSES = [
  'read.outside',
  'file.workspace',
  'file.outside',
  'shell',
  'web',
  'browser',
  'net.private',
  'upload.outside',
  'mcp.write',
  'mcp.destructive',
  'memory.shared',
  'agent.spawn',
] as const;
export type ActionClass = (typeof ACTION_CLASSES)[number];

type Rule = 'allow' | 'ask';

/**
 * Per class: what manual, workspace and full do, how the class reads in a message, and `all`, the kind a session grant
 * can cover ("Allow all shell commands for this session"). Destructive MCP has no kind: each call asks on its own.
 */
const MATRIX: Record<ActionClass, { rules: [Rule, Rule, Rule]; noun: string; all?: string }> = {
  'read.outside': { rules: ['ask', 'allow', 'allow'], noun: 'reading outside the workspace', all: 'reads outside the workspace' },
  'file.workspace': { rules: ['ask', 'allow', 'allow'], noun: 'the file change', all: 'file changes in the repository' },
  'file.outside': { rules: ['ask', 'ask', 'allow'], noun: 'changing a file outside the workspace', all: 'file changes outside the workspace' },
  shell: { rules: ['ask', 'allow', 'allow'], noun: 'the shell command', all: 'shell commands' },
  web: { rules: ['ask', 'allow', 'allow'], noun: 'the web request', all: 'web requests' },
  browser: { rules: ['ask', 'allow', 'allow'], noun: 'the browser action', all: 'browser actions' },
  'net.private': { rules: ['ask', 'ask', 'allow'], noun: 'opening a private or local address', all: 'private or local addresses' },
  'upload.outside': { rules: ['ask', 'ask', 'allow'], noun: 'uploading files from outside the workspace', all: 'uploads from outside the workspace' },
  'mcp.write': { rules: ['ask', 'allow', 'allow'], noun: 'the MCP tool call', all: 'MCP tool calls' },
  'mcp.destructive': { rules: ['ask', 'ask', 'allow'], noun: 'the destructive MCP tool call' },
  'memory.shared': { rules: ['ask', 'ask', 'allow'], noun: 'changing a global or pinned memory', all: 'global or pinned memory changes' },
  'agent.spawn': { rules: ['ask', 'allow', 'allow'], noun: 'starting a subagent', all: 'subagents' },
};

/**
 * Reasons tighten a call. They are not action classes and never a session grant. A provenance hit asks in manual and
 * workspace; full runs it. A hook ask asks in every mode. A reason forces one ask on the call's effect. It does not
 * replace that effect, and a session grant of the effect does not answer it.
 */
export const ASK_REASONS = ['hook.ask', 'provenance'] as const;
export type AskReason = (typeof ASK_REASONS)[number];

const REASON_RULES: Record<AskReason, [Rule, Rule, Rule]> = {
  'hook.ask': ['ask', 'ask', 'ask'],
  provenance: ['ask', 'ask', 'allow'],
};

/** Whether `reason` forces an ask in `mode`. */
export function reasonAsks(mode: PermissionMode, reason: AskReason): boolean {
  return REASON_RULES[reason][PERMISSION_MODES.indexOf(mode)] === 'ask';
}

/** The least permissive mode in which none of `reasons` ask. A hook ask has none; provenance runs in full. */
export function modeAllowingReasons(reasons: readonly AskReason[]): PermissionMode | undefined {
  return PERMISSION_MODES.find((mode) => reasons.every((reason) => !reasonAsks(mode, reason)));
}

/** The kind a session-wide grant of `action` covers ("shell commands"); undefined for the per-call tripwires. */
export const kindOf = (action: ActionClass): string | undefined => MATRIX[action].all;

export function decide(mode: PermissionMode, action: ActionClass): Rule {
  return MATRIX[action].rules[PERMISSION_MODES.indexOf(mode)]!;
}

/** How `action` reads in a message ("the shell command"). */
export const actionNoun = (action: ActionClass): string => MATRIX[action].noun;

/** The least permissive mode that runs `action` without asking. */
export const modeAllowing = (action: ActionClass): PermissionMode | undefined => PERMISSION_MODES.find((mode) => decide(mode, action) === 'allow');

/** Asks that a session grant may never answer: their content differs every time, or the hint says it destroys data. */
export const UNGRANTABLE: ReadonlySet<ActionClass> = new Set(ACTION_CLASSES.filter((action) => kindOf(action) === undefined));

/** Classes an `agent` spawn may grant its child: work inside the repository. */
export const WORKSPACE_CLASSES: ReadonlySet<ActionClass> = new Set(['file.workspace', 'shell']);

/** One line per mode for `/octocode permission`: what it asks about. */
export function asksIn(mode: PermissionMode): ActionClass[] {
  return ACTION_CLASSES.filter((action) => decide(mode, action) === 'ask');
}

/**
 * The mode a session starts in: `full` (no routine asks), unless the user exported `OCTOCODE_PERMISSION`. An invalid
 * value starts in `manual` with a warning (stricter, never looser).
 */
export function startMode(env: NodeJS.ProcessEnv): { mode: PermissionMode; warning?: string } {
  const chosen = envChoice(env, PERMISSION_ENV, PERMISSION_MODES);
  if (!chosen) return { mode: 'full' };
  if ('invalid' in chosen) return { mode: 'manual', warning: `${PERMISSION_ENV}=${chosen.invalid} is not manual, workspace or full; starting in manual.` };
  return { mode: chosen.value };
}

/**
 * The kinds a parent handed this subagent: its spawn grant (workspace classes its profile reaches) and every kind the
 * user allowed for the parent's session. An ask reason or an unknown name is dropped, whatever the variable says.
 */
export function parseGrants(env: NodeJS.ProcessEnv): Set<ActionClass> {
  const names = (env[PERMISSION_GRANTS_ENV] ?? '').split(',').map((name) => name.trim());
  return new Set(names.filter((name): name is ActionClass => name in MATRIX && kindOf(name as ActionClass) !== undefined));
}

/** The footer chip's status key (`ui/footer` places it first after the model), the audit entries' type and the mode notes' message type. */
export const PERMISSION_ID = 'octocode-permission';

/** The editor-scoped key that cycles the mode; native selectors retain their own input handling. */
export const PERMISSION_SHORTCUT = 'shift+tab';
export const PERMISSION_SHORTCUT_LABEL = 'Shift+Tab';

/** The order the editor shortcut cycles modes in, from the default (no routine asks) to the strictest. */
export const PERMISSION_CYCLE: readonly PermissionMode[] = ['full', 'workspace', 'manual'];

/** The chip per mode: its text, its short form for a narrow footer, and its theme colour. */
export const CHIPS: Record<PermissionMode, { text: string; short: string; color: 'accent' | 'muted' | 'error' }> = {
  manual: { text: `⏸ permission: manual · ${PERMISSION_SHORTCUT_LABEL}`, short: '⏸ manual', color: 'accent' },
  workspace: { text: `permission: workspace · ${PERMISSION_SHORTCUT_LABEL}`, short: 'workspace', color: 'muted' },
  full: { text: `⏵⏵ permission: full · ${PERMISSION_SHORTCUT_LABEL}`, short: '⏵⏵ full', color: 'error' },
};

/** A chip status (coloured or not) with its text replaced by the short form. */
export function shortChip(status: string): string {
  for (const chip of Object.values(CHIPS)) if (status.includes(chip.text)) return status.replace(chip.text, chip.short);
  return status;
}
