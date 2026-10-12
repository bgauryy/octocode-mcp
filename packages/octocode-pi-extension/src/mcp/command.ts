import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { say, wordCompletions, type Subcommands } from '../shared/commands.js';
import type { OctocodeMcp } from './octocode.js';

/**
 * `/octocode mcp [status|restart]`: how the Octocode server is doing, and a restart. Pi's `/mcp` lists only the servers
 * Pi runs for the user, so this is where the extension's own server shows.
 */
export function registerMcpCommand(commands: Subcommands, mcp: Pick<OctocodeMcp, 'describe' | 'owner' | 'restart'>): void {
  commands.add('mcp', {
    description: 'mcp [status|restart] — Octocode MCP server state, or restart it',
    complete: (prefix) => wordCompletions([['status', 'server state'], ['restart', 'stop and start the server again']], prefix),
    handler: async (args, ctx: ExtensionCommandContext) => {
      const verb = args.trim();
      if (verb === '' || verb === 'status') return say(ctx, mcp.describe());
      if (verb !== 'restart') return say(ctx, 'Usage: /octocode mcp [status|restart]', 'warning');
      if (mcp.owner(ctx).by !== 'extension') return say(ctx, `${mcp.describe()}\nNothing to restart here.`, 'warning');
      await mcp.restart(ctx);
      say(ctx, mcp.describe());
    },
  });
}
