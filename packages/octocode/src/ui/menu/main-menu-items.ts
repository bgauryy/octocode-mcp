import { c, bold, dim } from '../../utils/colors.js';
import { MCP_CLIENTS } from '../../utils/mcp-paths.js';
import { type ClientInstallStatus } from '../../utils/mcp-config.js';
import type { AppState } from '../state.js';
import type { OctocodeAuthStatus } from '../../types/index.js';
import type { MenuChoice } from './types.js';

export function getClientNames(clients: ClientInstallStatus[]): string {
  return clients.map(c => MCP_CLIENTS[c.client]?.name || c.client).join(', ');
}

export function printInstalledIDEs(
  installedClients: ClientInstallStatus[]
): void {
  if (installedClients.length === 0) {
    console.log(`  ${dim('No IDEs configured yet')}`);
    return;
  }

  console.log(`  ${dim('Installed on:')}`);
  for (const client of installedClients) {
    const clientName = MCP_CLIENTS[client.client]?.name || client.client;
    console.log(
      `    ${dim('•')} ${dim(clientName)} ${dim('->')} ${c('cyan', client.configPath)}`
    );
  }
}

export function getAuthSourceDisplay(auth: OctocodeAuthStatus): string {
  switch (auth.tokenSource) {
    case 'gh-cli':
      return 'gh CLI';
    case 'env': {
      if (auth.envTokenSource) {
        const varName = auth.envTokenSource.replace('env:', '');
        return `env (${varName})`;
      }
      return 'env var';
    }
    case 'octocode':
      return 'Octocode';
    default:
      return 'unknown';
  }
}

export function buildAuthMenuItem(auth: OctocodeAuthStatus): {
  name: string;
  value: MenuChoice;
  description: string;
} {
  if (auth.authenticated) {
    const source = getAuthSourceDisplay(auth);
    const user = auth.username ? `@${auth.username}` : '';
    const userPart = user ? `${user} ` : '';
    return {
      name: `GitHub account ${c('green', '✓')}`,
      value: 'auth',
      description: `${userPart}via ${source}`,
    };
  }

  return {
    name: bold('Sign in to GitHub'),
    value: 'auth',
    description: 'Connect your account for GitHub research',
  };
}

export function buildStatusLine(state: AppState): string {
  const parts: string[] = [];

  if (state.octocode.isInstalled) {
    const clientLabel =
      state.octocode.installedCount === 1 ? 'client' : 'clients';
    parts.push(
      `${c('green', '●')} ${state.octocode.installedCount} ${clientLabel}`
    );
  } else {
    parts.push(`${dim('○')} Setup needed`);
  }

  return parts.join(dim('  │  '));
}

export function buildOctocodeMenuItem(state: AppState): {
  name: string;
  value: MenuChoice;
  description: string;
} {
  if (state.octocode.isInstalled) {
    const clientLabel =
      state.octocode.installedCount === 1 ? 'client' : 'clients';
    return {
      name: `Manage connections ${c('green', '✓')}`,
      value: 'octocode',
      description: `${state.octocode.installedCount} ${clientLabel} configured · add or update Octocode MCP`,
    };
  }

  return {
    name: bold('Set up Octocode'),
    value: 'octocode',
    description: 'Connect Octocode MCP to your editor or coding agent',
  };
}

export function printContextualHints(state: AppState): void {
  if (!state.githubAuth.authenticated) {
    console.log();
    console.log(
      `  ${dim('Next:')} choose ${c('magenta', 'Sign in to GitHub')} for GitHub research.`
    );
  }
}
