import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { say, wordCompletions, type Subcommands } from '../shared/commands.js';
import { PERMISSION_ENV } from '../shared/env.js';
import { sanitizeTerminalText } from '../shared/sanitize.js';
import { modeSummary, type AuditEntry, type Permission } from './ask.js';
import { registerPermissionEditor } from './editor.js';
import { ACTION_CLASSES, decide, PERMISSION_CYCLE, PERMISSION_ID, PERMISSION_MODES, PERMISSION_SHORTCUT_LABEL, type PermissionMode } from './mode.js';

/** Audit entries `/octocode permission log` shows, newest last. */
const LOG_ENTRIES = 50;
const USAGE = `Usage: /octocode permission [${PERMISSION_MODES.join('|')}|grants [clear]|log]`;
const NOT_A_SANDBOX = 'Modes and provenance asks decide what Octocode asks about; they are not a sandbox (the OS user\'s rights stay as they are).';

function status(permission: Permission, provenanceSize: number): string {
  const grants = permission.grants();
  return [
    `Permission mode: ${permission.mode} — ${modeSummary(permission.mode)}`,
    ...ACTION_CLASSES.map((action) => `  ${action}: ${decide(permission.mode, action)}`),
    `Session grants: ${grants.length > 0 ? '' : 'none'}`,
    ...grants.map((grant) => `  ${grant}`),
    `Provenance index: ${provenanceSize} shingles`,
    `${PERMISSION_SHORTCUT_LABEL} in the editor cycles ${PERMISSION_CYCLE.join(' → ')}; start mode: ${PERMISSION_ENV}, else full.`,
    'Thinking level: /thinking (Shift+Tab is used for permissions while Octocode is loaded).',
    NOT_A_SANDBOX,
  ].join('\n');
}

function logLines(ctx: ExtensionContext): string {
  const entries = ctx.sessionManager
    .getEntries()
    .flatMap((entry) => (entry.type === 'custom' && entry.customType === PERMISSION_ID ? [entry.data as AuditEntry] : []))
    .slice(-LOG_ENTRIES);
  if (entries.length === 0) return 'No permission decisions in this session yet.';
  const time = (at: number) => new Date(at).toTimeString().slice(0, 8);
  return entries
    .map((entry) =>
      entry.action === 'mode'
        ? `${time(entry.at)} mode ${entry.what}`
        : `${time(entry.at)} ${entry.mode} ${entry.action} ${entry.allowed ? 'allowed' : 'denied'} (${entry.via}) ${entry.what}${entry.note ? ` — note: ${entry.note}` : ''}`,
    )
    .map((line) => sanitizeTerminalText(line))
    .join('\n');
}

/**
 * `/octocode permission [manual|workspace|full|grants [clear]|log]` and an editor-scoped shortcut.
 * The command works everywhere, RPC included. Native selectors retain their own input handling.
 */
export function registerPermissionCommand(pi: ExtensionAPI, commands: Subcommands, permission: Permission, provenanceSize: () => number): void {
  const select = async (mode: PermissionMode, ctx: ExtensionContext): Promise<void> => {
    permission.setMode(mode, ctx);
    if (!ctx.hasUI) say(ctx, `Permission mode: ${mode}. ${modeSummary(mode)}`);
  };

  registerPermissionEditor(pi, (ctx) => {
    permission.setMode(PERMISSION_CYCLE[(PERMISSION_CYCLE.indexOf(permission.mode) + 1) % PERMISSION_CYCLE.length]!, ctx);
  });

  commands.add('permission', {
    description: `permission [manual|workspace|full|grants [clear]|log] — what Octocode asks before it acts (${PERMISSION_SHORTCUT_LABEL} cycles in the editor)`,
    complete: (prefix) => wordCompletions([...PERMISSION_MODES, 'grants', 'grants clear', 'log'], prefix),
    handler: async (args, ctx) => {
      const words = args.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const [word = '', rest] = words;
      if (words.length === 0) return say(ctx, status(permission, provenanceSize()));
      if ((PERMISSION_MODES as readonly string[]).includes(word) && words.length === 1) return select(word as PermissionMode, ctx);
      if (word === 'grants' && rest === 'clear' && words.length === 2) {
        permission.clearGrants();
        return say(ctx, 'Session grants cleared.');
      }
      if (word === 'grants' && words.length === 1) {
        const grants = permission.grants();
        return say(ctx, grants.length > 0 ? `Session grants:\n${grants.map((grant) => `  ${grant}`).join('\n')}` : 'Session grants: none');
      }
      if (word === 'log' && words.length === 1) return say(ctx, logLines(ctx));
      return say(ctx, USAGE, 'warning');
    },
  });
}
