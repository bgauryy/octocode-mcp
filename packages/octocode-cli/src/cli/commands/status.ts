import type { CLICommand, ParsedArgs } from '../types.js';
import { c, dim } from '../../utils/colors.js';
import { getAuthStatus } from '../../features/github-oauth.js';
import { formatTokenSource, printLoginHint } from './shared.js';

export const statusCommand: CLICommand = {
  name: 'status',
  aliases: ['s'],
  description: 'Show GitHub authentication status',
  usage: 'octocode status [--hostname <host>]',
  options: [
    {
      name: 'hostname',
      short: 'H',
      description: 'GitHub Enterprise hostname (default: github.com)',
      hasValue: true,
    },
  ],
  handler: async (args: ParsedArgs) => {
    const hostnameOpt = args.options['hostname'] ?? args.options['H'];
    const hostname =
      (typeof hostnameOpt === 'string' ? hostnameOpt : undefined) ||
      'github.com';
    const status = getAuthStatus(hostname);

    console.log();
    if (status.authenticated) {
      console.log(
        `  ${c('green', '✓')} Logged in as ${c('cyan', status.username || 'unknown')}`
      );
      console.log(`  ${dim('Host:')} ${status.hostname}`);
      console.log(
        `  ${dim('Source:')} ${formatTokenSource(status.tokenSource || 'none', status.envTokenSource)}`
      );
      if (status.tokenExpired) {
        console.log(
          `  ${c('yellow', '⚠')} Token has expired - please login again`
        );
      }
    } else {
      console.log(`  ${c('yellow', '⚠')} Not logged in`);
      console.log();
      printLoginHint();
    }
    console.log();
  },
};
