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
  login as oauthLogin,
  logout as oauthLogout,
  getAuthStatus,
  getStoragePath,
  type VerificationInfo,
} from '../features/github-oauth.js';
import { getCredentials } from '../utils/token-storage.js';
import { loadInquirer, select } from '../utils/prompts.js';
import { checkNodeInPath, checkNpmInPath } from '../features/node-check.js';
import { IDE_INFO, INSTALL_METHOD_INFO } from '../ui/constants.js';
import { Spinner } from '../utils/spinner.js';
import { copyDirectory, dirExists, listSubdirectories } from '../utils/fs.js';
import { HOME, isWindows, getAppDataPath } from '../utils/platform.js';
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
  usage: 'octocode-cli install --ide <cursor|claude> --method <npx|direct>',
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
 * Login command - authenticate with GitHub using OAuth device flow
 */
const loginCommand: CLICommand = {
  name: 'login',
  aliases: ['l'],
  description: 'Authenticate with GitHub',
  usage: 'octocode-cli login [--hostname <host>] [--git-protocol <ssh|https>]',
  options: [
    {
      name: 'hostname',
      short: 'h',
      description: 'GitHub Enterprise hostname (default: github.com)',
      hasValue: true,
    },
    {
      name: 'git-protocol',
      short: 'p',
      description: 'Git protocol to use (ssh or https)',
      hasValue: true,
    },
  ],
  handler: async (args: ParsedArgs) => {
    const hostname =
      (args.options['hostname'] as string | undefined) || 'github.com';
    const status = getAuthStatus(hostname);

    if (status.authenticated) {
      console.log();
      console.log(
        `  ${c('green', '✓')} Already authenticated as ${c('cyan', status.username || 'unknown')}`
      );
      console.log();
      console.log(`  ${dim('To switch accounts, logout first:')}`);
      console.log(`    ${c('cyan', '→')} ${c('yellow', 'octocode logout')}`);
      console.log();
      return;
    }

    console.log();
    console.log(`  ${bold('🔐 GitHub Authentication')}`);
    console.log();

    const gitProtocol =
      (args.options['git-protocol'] as 'ssh' | 'https') || 'https';

    // Show verification code and open browser
    let verificationShown = false;

    const spinner = new Spinner('Waiting for GitHub authentication...').start();

    const result = await oauthLogin({
      hostname,
      gitProtocol,
      onVerification: (verification: VerificationInfo) => {
        spinner.stop();
        verificationShown = true;

        console.log(
          `  ${c('yellow', '!')} First copy your one-time code: ${bold(verification.user_code)}`
        );
        console.log();
        console.log(
          `  ${bold('Press Enter')} to open ${c('cyan', verification.verification_uri)} in your browser...`
        );
        console.log();
        console.log(`  ${dim('Waiting for authentication...')}`);
      },
    });

    if (!verificationShown) {
      spinner.stop();
    }

    console.log();
    if (result.success) {
      console.log(`  ${c('green', '✓')} Authentication complete!`);
      console.log(
        `  ${c('green', '✓')} Logged in as ${c('cyan', result.username || 'unknown')}`
      );
      console.log();
      console.log(`  ${dim('Credentials stored in:')} ${getStoragePath()}`);
    } else {
      console.log(
        `  ${c('red', '✗')} Authentication failed: ${result.error || 'Unknown error'}`
      );
      process.exitCode = 1;
    }
    console.log();
  },
};

/**
 * Logout command - sign out from GitHub
 */
const logoutCommand: CLICommand = {
  name: 'logout',
  description: 'Sign out from GitHub',
  usage: 'octocode-cli logout [--hostname <host>]',
  options: [
    {
      name: 'hostname',
      short: 'h',
      description: 'GitHub Enterprise hostname',
      hasValue: true,
    },
  ],
  handler: async (args: ParsedArgs) => {
    const hostname =
      (args.options['hostname'] as string | undefined) || 'github.com';
    const status = getAuthStatus(hostname);

    if (!status.authenticated) {
      console.log();
      console.log(
        `  ${c('yellow', '⚠')} Not currently authenticated to ${hostname}`
      );
      console.log();
      console.log(`  ${dim('To login:')}`);
      console.log(`    ${c('cyan', '→')} ${c('yellow', 'octocode-cli login')}`);
      console.log();
      return;
    }

    console.log();
    console.log(`  ${bold('🔐 GitHub Logout')}`);
    console.log(
      `  ${dim('Currently authenticated as:')} ${c('cyan', status.username || 'unknown')}`
    );
    console.log();

    const result = await oauthLogout(hostname);

    if (result.success) {
      console.log(
        `  ${c('green', '✓')} Successfully logged out from ${hostname}`
      );
    } else {
      console.log(
        `  ${c('red', '✗')} Logout failed: ${result.error || 'Unknown error'}`
      );
      process.exitCode = 1;
    }
    console.log();
  },
};

/**
 * Auth command - check status or show menu
 */
const authCommand: CLICommand = {
  name: 'auth',
  aliases: ['a', 'gh'],
  description: 'Manage GitHub authentication',
  usage: 'octocode-cli auth [login|logout|status]',
  handler: async (args: ParsedArgs) => {
    const subcommand = args.args[0];

    // Handle subcommands
    if (subcommand === 'login') {
      return loginCommand.handler(args);
    }
    if (subcommand === 'logout') {
      return logoutCommand.handler(args);
    }
    if (subcommand === 'status') {
      return showAuthStatus();
    }

    const status = getAuthStatus();

    // Show status first
    await showAuthStatus();

    // Show interactive menu
    await loadInquirer();

    const choices = status.authenticated
      ? [
          { name: '🔓 Logout from GitHub', value: 'logout' },
          { name: '🔄 Switch account (logout & login)', value: 'switch' },
          { name: '← Back', value: 'back' },
        ]
      : [
          { name: '🔐 Login to GitHub', value: 'login' },
          { name: '← Back', value: 'back' },
        ];

    const action = await select({
      message: 'What would you like to do?',
      choices,
    });

    if (action === 'login') {
      // Re-run login command
      await loginCommand.handler({ command: 'login', args: [], options: {} });
    } else if (action === 'logout') {
      await oauthLogout();
      console.log();
      console.log(`  ${c('green', '✓')} Successfully logged out`);
      console.log();
    } else if (action === 'switch') {
      console.log();
      console.log(`  ${dim('Logging out...')}`);
      await oauthLogout();
      console.log(`  ${c('green', '✓')} Logged out`);
      console.log();
      console.log(`  ${dim('Starting new login...')}`);
      // Re-run login command
      await loginCommand.handler({ command: 'login', args: [], options: {} });
    }
    // 'back' does nothing
  },
};

/**
 * Show auth status
 */
async function showAuthStatus(hostname: string = 'github.com'): Promise<void> {
  console.log();
  console.log(`  ${bold('🔐 GitHub Authentication')}`);
  console.log();

  const status = getAuthStatus(hostname);

  if (status.authenticated) {
    console.log(
      `  ${c('green', '✓')} Authenticated as ${c('cyan', status.username || 'unknown')}`
    );
    if (status.tokenExpired) {
      console.log(
        `  ${c('yellow', '⚠')} Token has expired - please login again`
      );
    }
    console.log(`  ${dim('Host:')} ${status.hostname}`);
  } else {
    console.log(`  ${c('yellow', '⚠')} ${c('yellow', 'Not authenticated')}`);
    console.log();
    console.log(`  ${bold('To authenticate:')}`);
    console.log(`    ${c('cyan', '→')} ${c('yellow', 'octocode-cli login')}`);
  }
  console.log();
  console.log(`  ${dim('Credentials stored in:')} ${getStoragePath()}`);
  console.log();
}

/**
 * Get skills source directory
 * From built output: out/octocode-cli.js -> ../skills
 */
function getSkillsSourceDir(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, '..', 'skills');
}

/**
 * Get Claude skills destination directory
 * Windows: %APPDATA%\Claude\skills\
 * macOS/Linux: ~/.claude/skills/
 */
function getSkillsDestDir(): string {
  if (isWindows) {
    const appData = getAppDataPath();
    return path.join(appData, 'Claude', 'skills');
  }
  return path.join(HOME, '.claude', 'skills');
}

/**
 * Skills command
 */
const skillsCommand: CLICommand = {
  name: 'skills',
  aliases: ['sk'],
  description: 'Install Octocode skills for Claude Code',
  usage: 'octocode-cli skills [install|list]',
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
 * Token command - return the OAuth token
 */
const tokenCommand: CLICommand = {
  name: 'token',
  aliases: ['t'],
  description: 'Print the stored GitHub OAuth token',
  usage: 'octocode-cli token [--hostname <host>]',
  options: [
    {
      name: 'hostname',
      short: 'h',
      description: 'GitHub Enterprise hostname (default: github.com)',
      hasValue: true,
    },
  ],
  handler: async (args: ParsedArgs) => {
    const hostname =
      (args.options['hostname'] as string | undefined) || 'github.com';
    const credentials = getCredentials(hostname);

    if (!credentials) {
      console.log();
      console.log(`  ${c('yellow', '⚠')} Not authenticated to ${hostname}`);
      console.log();
      console.log(`  ${dim('To login:')}`);
      console.log(`    ${c('cyan', '→')} ${c('yellow', 'octocode-cli login')}`);
      console.log();
      process.exitCode = 1;
      return;
    }

    // Output just the token for easy piping/scripting
    console.log(credentials.token.token);
  },
};

/**
 * Status command - show authentication status
 */
const statusCommand: CLICommand = {
  name: 'status',
  aliases: ['s'],
  description: 'Show GitHub authentication status',
  usage: 'octocode-cli status [--hostname <host>]',
  options: [
    {
      name: 'hostname',
      short: 'h',
      description: 'GitHub Enterprise hostname (default: github.com)',
      hasValue: true,
    },
  ],
  handler: async (args: ParsedArgs) => {
    const hostname =
      (args.options['hostname'] as string | undefined) || 'github.com';
    const status = getAuthStatus(hostname);

    console.log();
    if (status.authenticated) {
      console.log(
        `  ${c('green', '✓')} Logged in as ${c('cyan', status.username || 'unknown')}`
      );
      console.log(`  ${dim('Host:')} ${status.hostname}`);
      if (status.tokenExpired) {
        console.log(
          `  ${c('yellow', '⚠')} Token has expired - please login again`
        );
      }
    } else {
      console.log(`  ${c('yellow', '⚠')} Not logged in`);
      console.log();
      console.log(`  ${dim('To login:')}`);
      console.log(`    ${c('cyan', '→')} ${c('yellow', 'octocode-cli login')}`);
    }
    console.log();
  },
};

/**
 * All available commands
 */
export const commands: CLICommand[] = [
  installCommand,
  authCommand,
  loginCommand,
  logoutCommand,
  skillsCommand,
  tokenCommand,
  statusCommand,
];

/**
 * Find a command by name or alias
 */
export function findCommand(name: string): CLICommand | undefined {
  return commands.find(cmd => cmd.name === name || cmd.aliases?.includes(name));
}
