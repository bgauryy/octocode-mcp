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
import { copyDirectory, dirExists, listSubdirectories } from '../utils/fs.js';
import { HOME } from '../utils/platform.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
 * Get skills source directory
 */
function getSkillsSourceDir(): string {
  // Get the directory where this file is located
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // Navigate from out/cli/ to skills/
  return path.resolve(__dirname, '..', '..', 'skills');
}

/**
 * Get Claude skills destination directory
 */
function getSkillsDestDir(): string {
  return path.join(HOME, '.claude', 'skills');
}

/**
 * Skills command
 */
const skillsCommand: CLICommand = {
  name: 'skills',
  aliases: ['sk'],
  description: 'Install Octocode skills for Claude Code',
  usage: 'octocode skills [install|list]',
  options: [
    {
      name: 'force',
      short: 'f',
      description: 'Overwrite existing skills',
    },
  ],
  handler: async (args: ParsedArgs) => {
    const subcommand = args.args[0] || 'list';
    const force = Boolean(args.options['force'] || args.options['f']);

    const srcDir = getSkillsSourceDir();
    const destDir = getSkillsDestDir();

    // Check if skills source exists
    if (!dirExists(srcDir)) {
      console.log();
      console.log(`  ${c('red', '✗')} Skills directory not found`);
      console.log(`  ${dim('Expected:')} ${srcDir}`);
      console.log();
      process.exitCode = 1;
      return;
    }

    const availableSkills = listSubdirectories(srcDir).filter(
      name => !name.startsWith('.')
    );

    if (subcommand === 'list') {
      console.log();
      console.log(`  ${bold('📚 Available Octocode Skills')}`);
      console.log();

      if (availableSkills.length === 0) {
        console.log(`  ${dim('No skills available.')}`);
      } else {
        for (const skill of availableSkills) {
          const installed = dirExists(path.join(destDir, skill));
          const status = installed
            ? c('green', '✓ installed')
            : dim('not installed');
          console.log(`  ${c('cyan', '•')} ${skill} ${status}`);
        }
      }

      console.log();
      console.log(`  ${dim('To install:')} octocode skills install`);
      console.log(`  ${dim('Destination:')} ${destDir}`);
      console.log();
      return;
    }

    if (subcommand === 'install') {
      console.log();
      console.log(`  ${bold('📦 Installing Octocode Skills')}`);
      console.log();

      if (availableSkills.length === 0) {
        console.log(`  ${c('yellow', '⚠')} No skills to install.`);
        console.log();
        return;
      }

      const spinner = new Spinner('Installing skills...').start();
      let installed = 0;
      let skipped = 0;

      for (const skill of availableSkills) {
        const skillSrc = path.join(srcDir, skill);
        const skillDest = path.join(destDir, skill);

        if (dirExists(skillDest) && !force) {
          skipped++;
          continue;
        }

        if (copyDirectory(skillSrc, skillDest)) {
          installed++;
        }
      }

      spinner.succeed('Skills installation complete!');
      console.log();

      if (installed > 0) {
        console.log(
          `  ${c('green', '✓')} Installed ${installed} skill(s) to ${destDir}`
        );
      }
      if (skipped > 0) {
        console.log(
          `  ${c('yellow', '⚠')} Skipped ${skipped} existing skill(s)`
        );
        console.log(
          `  ${dim('Use')} ${c('cyan', '--force')} ${dim('to overwrite.')}`
        );
      }

      console.log();
      console.log(`  ${bold('Skills are now available in Claude Code!')}`);
      console.log();
      return;
    }

    // Unknown subcommand
    console.log();
    console.log(`  ${c('red', '✗')} Unknown subcommand: ${subcommand}`);
    console.log(`  ${dim('Usage:')} octocode skills [install|list]`);
    console.log();
    process.exitCode = 1;
  },
};

/**
 * All available commands
 */
export const commands: CLICommand[] = [
  installCommand,
  authCommand,
  skillsCommand,
];

/**
 * Find a command by name or alias
 */
export function findCommand(name: string): CLICommand | undefined {
  return commands.find(cmd => cmd.name === name || cmd.aliases?.includes(name));
}
