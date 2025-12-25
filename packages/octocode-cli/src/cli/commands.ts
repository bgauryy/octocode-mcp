/**
 * CLI Commands
 */

import type { CLICommand, ParsedArgs } from './types.js';
import type { IDE, InstallMethod } from '../types/index.js';
import { c, bold, dim } from '../utils/colors.js';
import {
  installOctocode,
  detectAvailableIDEs,
  getInstallPreview,
} from '../features/install.js';
import {
  checkGitHubAuth,
  GH_CLI_URL,
  getAuthLoginCommand,
  getGitHubCLIVersion,
} from '../features/gh-auth.js';
import { checkNodeInPath, checkNpmInPath } from '../features/node-check.js';
import { IDE_INFO, INSTALL_METHOD_INFO } from '../ui/constants.js';
import { Spinner } from '../utils/spinner.js';

/**
 * Print node-doctor hint for CLI mode
 */
function printNodeDoctorHintCLI(): void {
  console.log(
    `  ${dim('For deeper diagnostics:')} ${c('cyan', 'npx node-doctor')}`
  );
  console.log();
}

/**
 * Install command
 */
const installCommand: CLICommand = {
  name: 'install',
  aliases: ['i'],
  description: 'Install octocode-mcp for an IDE',
  usage: 'octocode install --ide <cursor|claude> --method <npx|direct>',
  options: [
    {
      name: 'ide',
      description: 'IDE to configure (cursor or claude)',
      hasValue: true,
    },
    {
      name: 'method',
      short: 'm',
      description: 'Installation method (npx or direct)',
      hasValue: true,
      default: 'npx',
    },
    {
      name: 'force',
      short: 'f',
      description: 'Overwrite existing configuration',
    },
  ],
  handler: async (args: ParsedArgs) => {
    const ide = args.options['ide'] as IDE | undefined;
    const method = (args.options['method'] || 'npx') as InstallMethod;
    const force = Boolean(args.options['force'] || args.options['f']);

    // Quick node environment check for npx method
    if (method === 'npx') {
      const nodeCheck = checkNodeInPath();
      const npmCheck = checkNpmInPath();

      if (!nodeCheck.installed) {
        console.log();
        console.log(
          `  ${c('red', '✗')} Node.js is ${c('red', 'not found in PATH')}`
        );
        console.log(
          `  ${dim('Node.js is required for npx installation method.')}`
        );
        console.log();
        printNodeDoctorHintCLI();
        process.exitCode = 1;
        return;
      }

      if (!npmCheck.installed) {
        console.log();
        console.log(
          `  ${c('yellow', '⚠')} npm is ${c('yellow', 'not found in PATH')}`
        );
        console.log(`  ${dim('npm is required for npx installation method.')}`);
        console.log();
        printNodeDoctorHintCLI();
        process.exitCode = 1;
        return;
      }
    }

    // Validate IDE
    if (!ide) {
      // If no IDE specified, show available ones
      const available = detectAvailableIDEs();
      console.log();
      console.log(
        `  ${c('red', '✗')} Missing required option: ${c('cyan', '--ide')}`
      );
      console.log();

      if (available.length > 0) {
        console.log(`  ${bold('Available IDEs:')}`);
        for (const availableIde of available) {
          console.log(`    ${c('cyan', '•')} ${availableIde}`);
        }
      } else {
        console.log(`  ${c('yellow', '⚠')} No supported IDEs detected.`);
        console.log(`  ${dim('Install Cursor or Claude Desktop first.')}`);
      }
      console.log();
      console.log(
        `  ${dim('Usage:')} octocode install --ide cursor --method npx`
      );
      console.log();
      process.exitCode = 1;
      return;
    }

    if (!['cursor', 'claude'].includes(ide)) {
      console.log();
      console.log(`  ${c('red', '✗')} Invalid IDE: ${ide}`);
      console.log(`  ${dim('Supported:')} cursor, claude`);
      console.log();
      process.exitCode = 1;
      return;
    }

    // Validate method
    if (!['npx', 'direct'].includes(method)) {
      console.log();
      console.log(`  ${c('red', '✗')} Invalid method: ${method}`);
      console.log(`  ${dim('Supported:')} npx, direct`);
      console.log();
      process.exitCode = 1;
      return;
    }

    // Get install preview
    const preview = getInstallPreview(ide, method);

    // Check if already installed and force is not set
    if (preview.action === 'override' && !force) {
      console.log();
      console.log(`  ${c('yellow', '⚠')} Octocode is already configured.`);
      console.log(
        `  ${dim('Use')} ${c('cyan', '--force')} ${dim('to overwrite.')}`
      );
      console.log();
      process.exitCode = 1;
      return;
    }

    // Install
    console.log();
    console.log(`  ${bold('Installing octocode-mcp')}`);
    console.log(`    ${dim('IDE:')}    ${IDE_INFO[ide].name}`);
    console.log(`    ${dim('Method:')} ${INSTALL_METHOD_INFO[method].name}`);
    console.log(`    ${dim('Action:')} ${preview.action.toUpperCase()}`);
    console.log();

    const spinner = new Spinner('Writing configuration...').start();

    const result = installOctocode({ ide, method, force });

    if (result.success) {
      spinner.succeed('Installation complete!');
      console.log();
      console.log(
        `  ${c('green', '✓')} Config saved to: ${preview.configPath}`
      );
      if (result.backupPath) {
        console.log(`  ${dim('Backup:')} ${result.backupPath}`);
      }
      console.log();
      console.log(
        `  ${bold('Next:')} Restart ${IDE_INFO[ide].name} to activate.`
      );
      console.log();
    } else {
      spinner.fail('Installation failed');
      console.log();
      if (result.error) {
        console.log(`  ${c('red', '✗')} ${result.error}`);
      }
      console.log();
      process.exitCode = 1;
    }
  },
};

/**
 * Auth command
 */
const authCommand: CLICommand = {
  name: 'auth',
  aliases: ['a', 'gh'],
  description: 'Check GitHub CLI authentication status',
  usage: 'octocode auth',
  handler: async () => {
    console.log();
    console.log(`  ${bold('🔐 GitHub CLI Authentication')}`);
    console.log();

    const status = checkGitHubAuth();

    if (!status.installed) {
      console.log(
        `  ${c('red', '✗')} GitHub CLI is ${c('red', 'not installed')}`
      );
      console.log();
      console.log(`  ${bold('To install:')}`);
      console.log(`    ${c('cyan', '→')} ${c('underscore', GH_CLI_URL)}`);
      console.log();
      process.exitCode = 1;
      return;
    }

    const version = getGitHubCLIVersion();
    console.log(
      `  ${c('green', '✓')} GitHub CLI installed` +
        (version ? dim(` (v${version})`) : '')
    );

    if (status.authenticated) {
      console.log(
        `  ${c('green', '✓')} Authenticated as ${c('cyan', status.username || 'unknown')}`
      );
      console.log();
    } else {
      console.log(`  ${c('yellow', '⚠')} ${c('yellow', 'Not authenticated')}`);
      console.log();
      console.log(`  ${bold('To authenticate:')}`);
      console.log(
        `    ${c('cyan', '→')} ${c('yellow', getAuthLoginCommand())}`
      );
      console.log();
      process.exitCode = 1;
    }
  },
};

/**
 * All available commands
 */
export const commands: CLICommand[] = [installCommand, authCommand];

/**
 * Find a command by name or alias
 */
export function findCommand(name: string): CLICommand | undefined {
  return commands.find(cmd => cmd.name === name || cmd.aliases?.includes(name));
}
