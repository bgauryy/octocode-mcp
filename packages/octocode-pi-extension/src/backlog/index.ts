import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { Subcommands } from '../shared/commands.js';
import { backlogCommand } from './command.js';
import { openBacklog, type BacklogOptions } from './context.js';
import { STATUS } from '../shared/status.js';
import { countsText } from './format.js';
import { registerBacklogTool } from './tool.js';

interface RegisterBacklogOptions extends BacklogOptions {
  commands: Subcommands;
  /** Opens the HTML page (`/backlog html`); the system's default application unless replaced. */
  open?: (file: string) => Promise<void>;
}

/**
 * The repository backlog: the `backlog` tool, `/octocode backlog` (alias it with `commands.alias(pi, 'backlog')` after
 * `commands` is registered) and footer counts in words with the `/backlog` hint that opens the board.
 */
export function registerBacklog(pi: ExtensionAPI, options: RegisterBacklogOptions): void {
  const { commands, open, ...backlogOptions } = options;

  const refresh = (ctx: ExtensionContext) => {
    if (!ctx.hasUI || options.isSubagent) return;
    try {
      const backlog = openBacklog(ctx, backlogOptions);
      const text = countsText(backlog.store.counts());
      ctx.ui.setStatus(STATUS.backlog, text || undefined);
    } catch {
      // An unreadable agent database (a foreign file) hides the counts; the tool and command report why.
      ctx.ui.setStatus(STATUS.backlog, undefined);
    }
  };

  registerBacklogTool(pi, { ...backlogOptions, changed: refresh });
  if (!options.isSubagent) commands.add('backlog', backlogCommand(pi, { ...backlogOptions, ...(open ? { open } : {}), changed: refresh }));
  pi.on('session_start', (_event, ctx) => refresh(ctx));
  // Another session or agent may have changed the board: repaint at the end of every run.
  pi.on('agent_end', (_event, ctx) => refresh(ctx));
}
