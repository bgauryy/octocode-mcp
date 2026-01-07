import { c, bold, dim } from '../../utils/colors.js';
import type { MCPRegistryEntry } from '../../configs/mcp-registry.js';
import type { MCPClient } from '../../types/index.js';
import { MCP_CLIENTS } from '../../utils/mcp-paths.js';

/**
 * Print detailed information about an MCP
 */
export function printMCPDetails(mcp: MCPRegistryEntry): void {
  console.log();
  console.log(c('blue', ' ┌' + '─'.repeat(60) + '┐'));
  console.log(
    c('blue', ' │ ') +
      bold(mcp.name) +
      (mcp.official ? ` ${c('cyan', '[Official]')}` : '') +
      ' '.repeat(Math.max(0, 60 - mcp.name.length - (mcp.official ? 12 : 0))) +
      c('blue', '│')
  );
  console.log(c('blue', ' └' + '─'.repeat(60) + '┘'));
  console.log();

  console.log(`  ${dim('Description:')} ${mcp.description}`);
  console.log(`  ${dim('Category:')} ${c('cyan', mcp.category)}`);
  console.log(`  ${dim('Installation:')} ${c('yellow', mcp.installationType)}`);

  if (mcp.website) {
    console.log(`  ${dim('Website:')} ${c('blue', mcp.website)}`);
  }

  console.log(`  ${dim('Repository:')} ${c('blue', mcp.repository)}`);

  if (mcp.tags && mcp.tags.length > 0) {
    console.log(
      `  ${dim('Tags:')} ${mcp.tags.map(t => c('dim', t)).join(', ')}`
    );
  }

  console.log();
}

/**
 * Print the configuration that will be added
 */
export function printInstallPreview(
  mcp: MCPRegistryEntry,
  client: MCPClient,
  configPath: string,
  envValues: Record<string, string>
): void {
  const clientInfo = MCP_CLIENTS[client];

  console.log(c('blue', ' ┌' + '─'.repeat(60) + '┐'));
  console.log(
    c('blue', ' │ ') +
      bold('Configuration Preview') +
      ' '.repeat(39) +
      c('blue', '│')
  );
  console.log(c('blue', ' └' + '─'.repeat(60) + '┘'));
  console.log();

  // Build the server config
  const serverConfig = {
    command: mcp.installConfig.command,
    args: [...mcp.installConfig.args],
    ...(Object.keys(envValues).length > 0 && { env: envValues }),
  };

  console.log(`  ${dim('Server ID:')} ${c('cyan', mcp.id)}`);
  console.log(`  ${dim('Command:')} ${c('green', serverConfig.command)}`);
  console.log(`  ${dim('Args:')} ${c('yellow', serverConfig.args.join(' '))}`);

  if (Object.keys(envValues).length > 0) {
    console.log(`  ${dim('Environment Variables:')}`);
    for (const [key, value] of Object.entries(envValues)) {
      const displayValue =
        value.length > 30 ? value.slice(0, 27) + '...' : value;
      console.log(`    ${c('cyan', key)}: ${dim(displayValue)}`);
    }
  }

  console.log();
  console.log(`  ${bold('Target:')}`);
  console.log(`  ${dim('Client:')} ${clientInfo?.name || client}`);
  console.log(`  ${dim('Config:')} ${c('cyan', configPath)}`);
  console.log();
}

/**
 * Print success message after installation
 */
export function printInstallSuccess(
  mcp: MCPRegistryEntry,
  client: MCPClient,
  configPath: string,
  backupPath?: string
): void {
  const clientInfo = MCP_CLIENTS[client];

  console.log();
  console.log(c('green', ' ┌' + '─'.repeat(60) + '┐'));
  console.log(
    c('green', ' │ ') +
      `${c('green', '✓')} ${bold('MCP installed successfully!')}` +
      ' '.repeat(30) +
      c('green', '│')
  );
  console.log(c('green', ' └' + '─'.repeat(60) + '┘'));
  console.log();

  console.log(`  ${bold('Installed:')} ${mcp.name}`);
  console.log(`  ${bold('To:')} ${clientInfo?.name || client}`);
  console.log(`  ${dim('Config:')} ${c('cyan', configPath)}`);

  if (backupPath) {
    console.log(`  ${dim('Backup:')} ${backupPath}`);
  }

  console.log();
  console.log(`  ${bold('Next steps:')}`);
  console.log(`  1. Restart ${clientInfo?.name || client}`);
  console.log(`  2. Look for ${c('cyan', mcp.id)} in MCP servers`);

  if (mcp.website) {
    console.log(`  3. Check ${c('blue', mcp.website)} for usage docs`);
  }

  console.log();
}

/**
 * Print error message
 */
export function printInstallError(error: string): void {
  console.log();
  console.log(c('red', ' ┌' + '─'.repeat(60) + '┐'));
  console.log(
    c('red', ' │ ') +
      `${c('red', '✗')} ${bold('Installation failed')}` +
      ' '.repeat(38) +
      c('red', '│')
  );
  console.log(c('red', ' └' + '─'.repeat(60) + '┘'));
  console.log();
  console.log(`  ${c('red', 'Error:')} ${error}`);
  console.log();
}

/**
 * Print category header
 */
function printCategoryHeader(category: string): void {
  const displayCategory = category
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  console.log();
  console.log(
    `  ${c('cyan', '─'.repeat(3))} ${bold(displayCategory)} ${c('cyan', '─'.repeat(50 - displayCategory.length))}`
  );
}
