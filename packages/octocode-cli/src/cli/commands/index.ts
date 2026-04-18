import type { CLICommand } from '../types.js';
import { installCommand } from './install.js';
import { authCommand, loginCommand, logoutCommand } from './auth.js';
import { tokenCommand } from './token.js';
import { skillsCommand } from './skills.js';
import { mcpCommand } from './mcp.js';
import { cacheCommand } from './cache.js';
import { statusCommand } from './status.js';
import { syncCommand } from './sync.js';
import { toolCommand } from '../tool-command.js';

const commands: CLICommand[] = [
  installCommand,
  authCommand,
  loginCommand,
  logoutCommand,
  skillsCommand,
  mcpCommand,
  toolCommand,
  cacheCommand,
  tokenCommand,
  statusCommand,
  syncCommand,
];

export function findCommand(name: string): CLICommand | undefined {
  return commands.find(cmd => cmd.name === name || cmd.aliases?.includes(name));
}

export {
  installCommand,
  authCommand,
  loginCommand,
  logoutCommand,
  tokenCommand,
  skillsCommand,
  mcpCommand,
  cacheCommand,
  statusCommand,
  syncCommand,
};
