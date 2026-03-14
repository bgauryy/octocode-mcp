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
  getToken,
  getOctocodeToken,
  getGhCliToken,
  getTokenType,
  type VerificationInfo,
} from '../features/github-oauth.js';
import { GH_CLI_URL } from '../features/gh-auth.js';
import type { TokenSource } from '../types/index.js';
import { loadInquirer, select } from '../utils/prompts.js';
import { checkNodeInPath, checkNpmInPath } from '../features/node-check.js';
import { IDE_INFO, CLIENT_INFO, INSTALL_METHOD_INFO } from '../ui/constants.js';
import { Spinner } from '../utils/spinner.js';

/**
 * Get display name for an IDE/client
 */
function getIDEDisplayName(ide: string): string {
  // Check CLIENT_INFO first (comprehensive)
  if (ide in CLIENT_INFO) {
    return CLIENT_INFO[ide as keyof typeof CLIENT_INFO].name;
  }
  // Fallback to IDE_INFO (legacy)
  if (ide in IDE_INFO) {
    return IDE_INFO[ide as keyof typeof IDE_INFO].name;
  }
  // Capitalize as fallback
  return ide.charAt(0).toUpperCase() + ide.slice(1);
}
import { copyDirectory, dirExists, listSubdirectories } from '../utils/fs.js';
import { getSkillsSourceDir, getSkillsDestDir } from '../utils/skills.js';
import { quickSync } from '../ui/sync/index.js';
import { clearSkillsCache, getSkillsCacheDir } from '../utils/skills-fetch.js';
import {
  readAllClientConfigs,
  analyzeSyncState,
  getClientDisplayName,
} from '../features/sync.js';
import path from 'node:path';
import { paths } from 'octocode-shared';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';

type GetTokenSource = 'octocode' | 'gh' | 'auto';

function getDirectorySizeBytes(targetPath: string): number {
  if (!existsSync(targetPath)) return 0;

  let total = 0;
  const stack = [targetPath];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    let stat;
    try {
      stat = statSync(current);
    } catch {
      continue;
    }

    if (stat.isFile()) {
      total += stat.size;
      continue;
    }

    if (!stat.isDirectory()) continue;

    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      continue;
    }

    for (const entry of entries) {
      stack.push(path.join(current, entry));
    }
  }

  return total;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

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
 * Format token source for display
 * @param source - The token source type
 * @param envSource - Optional specific env var name when source is 'env'
 */
function formatTokenSource(source: TokenSource, envSource?: string): string {
  switch (source) {
    case 'octocode':
      return c('cyan', 'octocode');
    case 'gh-cli':
      return c('magenta', 'gh cli');
    case 'env':
      // Show specific env var name if available
      if (envSource) {
        const varName = envSource.replace('env:', '');
        return c('green', varName);
      }
      return c('green', 'environment variable');
    default:
      return dim('none');
  }
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

    // Supported IDEs: legacy (cursor, claude) + all MCPClient types
    const supportedIDEs = [
      'cursor',
      'claude', // Legacy alias for claude-desktop
      'claude-desktop',
      'claude-code',
      'windsurf',
      'zed',
      'vscode-cline',
      'vscode-roo',
      'vscode-continue',
      'opencode',
      'trae',
      'antigravity',
    ];
    if (!supportedIDEs.includes(ide)) {
      console.log();
      console.log(`  ${c('red', '✗')} Invalid IDE: ${ide}`);
      console.log(`  ${dim('Supported:')} ${supportedIDEs.join(', ')}`);
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
    console.log(`    ${dim('IDE:')}    ${getIDEDisplayName(ide)}`);
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
        `  ${bold('Next:')} Restart ${getIDEDisplayName(ide)} to activate.`
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
  usage: 'octocode login [--hostname <host>] [--git-protocol <ssh|https>]',
  options: [
    {
      name: 'hostname',
      short: 'H',
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
    const hostnameOpt = args.options['hostname'] ?? args.options['H'];
    const hostname =
      (typeof hostnameOpt === 'string' ? hostnameOpt : undefined) ||
      'github.com';
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

    const gitProtocolOpt = args.options['git-protocol'];
    const gitProtocol = (
      typeof gitProtocolOpt === 'string' ? gitProtocolOpt : 'https'
    ) as 'ssh' | 'https';

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
  usage: 'octocode logout [--hostname <host>]',
  options: [
    {
      name: 'hostname',
      short: 'H',
      description: 'GitHub Enterprise hostname',
      hasValue: true,
    },
  ],
  handler: async (args: ParsedArgs) => {
    const hostnameOpt = args.options['hostname'] ?? args.options['H'];
    const hostname =
      (typeof hostnameOpt === 'string' ? hostnameOpt : undefined) ||
      'github.com';
    const status = getAuthStatus(hostname);

    if (!status.authenticated) {
      console.log();
      console.log(
        `  ${c('yellow', '⚠')} Not currently authenticated to ${hostname}`
      );
      console.log();
      console.log(`  ${dim('To login:')}`);
      console.log(`    ${c('cyan', '→')} ${c('yellow', 'octocode login')}`);
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
  usage: 'octocode auth [login|logout|status|token]',
  handler: async (args: ParsedArgs) => {
    const subcommand = args.args[0];
    const hostname =
      (args.options['hostname'] as string | undefined) || 'github.com';

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
    if (subcommand === 'token') {
      // Priority: octocode first, then gh CLI (for auth token subcommand)
      const octocodeResult = await getOctocodeToken(hostname);
      if (octocodeResult.token) {
        console.log(octocodeResult.token);
        return;
      }

      // Fallback to gh CLI
      const ghResult = getGhCliToken(hostname);
      if (ghResult.token) {
        console.log(ghResult.token);
        return;
      }

      // No token found - show helpful guidance
      console.log();
      console.log(`  ${c('yellow', '⚠')} No GitHub token found.`);
      console.log();
      console.log(
        `  ${dim('GitHub authentication is required to access private repositories.')}`
      );
      console.log();
      console.log(`  ${bold('To authenticate, choose one of:')}`);
      console.log();
      console.log(
        `    ${c('cyan', 'octocode auth login')}    ${dim('Recommended - stores token securely')}`
      );
      console.log(
        `    ${c('cyan', 'gh auth login')}              ${dim('Use existing GitHub CLI')}`
      );
      console.log();
      console.log(`  ${dim('Learn more:')} ${c('blue', GH_CLI_URL)}`);
      console.log();
      process.exitCode = 1;
      return;
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
    console.log(
      `  ${dim('Source:')} ${formatTokenSource(status.tokenSource || 'none')}`
    );
  } else {
    console.log(`  ${c('yellow', '⚠')} ${c('yellow', 'Not authenticated')}`);
    console.log();
    console.log(`  ${bold('To authenticate:')}`);
    console.log(`    ${c('cyan', '→')} ${c('yellow', 'octocode login')}`);
    console.log(`    ${dim('or')}`);
    console.log(`    ${c('cyan', '→')} ${c('yellow', 'gh auth login')}`);
  }
  console.log();
  console.log(`  ${dim('Credentials stored in:')} ${getStoragePath()}`);
  console.log();
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
 * Token command - return the OAuth token
 */
const tokenCommand: CLICommand = {
  name: 'token',
  aliases: ['t'],
  description: 'Print the GitHub token (matches octocode-mcp priority)',
  usage:
    'octocode token [--type <auto|octocode|gh>] [--hostname <host>] [--source] [--json]',
  options: [
    {
      name: 'type',
      short: 't',
      description:
        'Token source: auto (default: env→gh→octocode), octocode, gh',
      hasValue: true,
      default: 'auto',
    },
    {
      name: 'hostname',
      short: 'H',
      description: 'GitHub Enterprise hostname (default: github.com)',
      hasValue: true,
    },
    {
      name: 'source',
      short: 's',
      description: 'Show token source and user info',
    },
    {
      name: 'json',
      short: 'j',
      description: 'Output as JSON: {"token": "...", "type": "..."}',
    },
  ],
  handler: async (args: ParsedArgs) => {
    const hostnameOpt = args.options['hostname'] ?? args.options['H'];
    const hostname =
      (typeof hostnameOpt === 'string' ? hostnameOpt : undefined) ||
      'github.com';
    const showSource = Boolean(args.options['source'] || args.options['s']);
    const jsonOutput = Boolean(args.options['json'] || args.options['j']);
    const typeOpt = args.options['type'] ?? args.options['t'];
    const typeArg =
      (typeof typeOpt === 'string' ? typeOpt : undefined) || 'auto';

    // Validate and map type argument
    let tokenSource: GetTokenSource;
    switch (typeArg.toLowerCase()) {
      case 'octocode':
      case 'o':
        tokenSource = 'octocode';
        break;
      case 'gh':
      case 'gh-cli':
      case 'g':
        tokenSource = 'gh';
        break;
      case 'auto':
      case 'a':
        tokenSource = 'auto';
        break;
      default:
        // JSON output for invalid type
        if (jsonOutput) {
          console.log(JSON.stringify({ token: null, type: 'none' }));
          process.exitCode = 1;
          return;
        }
        console.log();
        console.log(`  ${c('red', '✗')} Invalid token type: ${typeArg}`);
        console.log(`  ${dim('Valid options:')} octocode, gh, auto`);
        console.log();
        process.exitCode = 1;
        return;
    }

    const result = await getToken(hostname, tokenSource);

    // JSON output mode - machine-readable for MCP consumption
    if (jsonOutput) {
      const output = {
        token: result.token,
        type: getTokenType(result.source, result.envSource),
      };
      console.log(JSON.stringify(output));
      if (!result.token) {
        process.exitCode = 1;
      }
      return;
    }

    if (!result.token) {
      console.log();
      if (tokenSource === 'octocode') {
        console.log(
          `  ${c('yellow', '⚠')} No Octocode token found for ${hostname}`
        );
        console.log();
        console.log(`  ${dim('To login with Octocode:')}`);
        console.log(`    ${c('cyan', '→')} ${c('yellow', 'octocode login')}`);
        console.log();
        console.log(`  ${dim('Or use gh CLI token:')}`);
        console.log(
          `    ${c('cyan', '→')} ${c('yellow', 'octocode token --type=gh')}`
        );
      } else if (tokenSource === 'gh') {
        console.log(
          `  ${c('yellow', '⚠')} No gh CLI token found for ${hostname}`
        );
        console.log();
        console.log(`  ${dim('To login with gh CLI:')}`);
        console.log(`    ${c('cyan', '→')} ${c('yellow', 'gh auth login')}`);
        console.log();
        console.log(`  ${dim('Or use Octocode token:')}`);
        console.log(
          `    ${c('cyan', '→')} ${c('yellow', 'octocode token --type=octocode')}`
        );
      } else {
        console.log(`  ${c('yellow', '⚠')} Not authenticated to ${hostname}`);
        console.log();
        console.log(`  ${dim('To login:')}`);
        console.log(`    ${c('cyan', '→')} ${c('yellow', 'octocode login')}`);
        console.log(`    ${dim('or')}`);
        console.log(`    ${c('cyan', '→')} ${c('yellow', 'gh auth login')}`);
      }
      console.log();
      process.exitCode = 1;
      return;
    }

    if (showSource) {
      console.log();
      console.log(`  ${c('green', '✓')} Token found`);
      console.log(
        `  ${dim('Source:')} ${formatTokenSource(result.source, result.envSource)}`
      );
      if (result.username) {
        console.log(`  ${dim('User:')} ${c('cyan', '@' + result.username)}`);
      }
      console.log();
      console.log(`  ${dim('Token:')} ${result.token}`);
      console.log();
    } else {
      // Output just the token for easy piping/scripting
      console.log(result.token);
    }
  },
};

/**
 * Status command - show authentication status
 */
const statusCommand: CLICommand = {
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
        `  ${dim('Source:')} ${formatTokenSource(status.tokenSource || 'none')}`
      );
      if (status.tokenExpired) {
        console.log(
          `  ${c('yellow', '⚠')} Token has expired - please login again`
        );
      }
    } else {
      console.log(`  ${c('yellow', '⚠')} Not logged in`);
      console.log();
      console.log(`  ${dim('To login:')}`);
      console.log(`    ${c('cyan', '→')} ${c('yellow', 'octocode login')}`);
      console.log(`    ${dim('or')}`);
      console.log(`    ${c('cyan', '→')} ${c('yellow', 'gh auth login')}`);
    }
    console.log();
  },
};

/**
 * Sync command - synchronize MCP configs across all clients
 */
const syncCommand: CLICommand = {
  name: 'sync',
  aliases: ['sy'],
  description: 'Sync MCP configurations across all IDE clients',
  usage: 'octocode sync [--force] [--dry-run] [--status]',
  options: [
    {
      name: 'force',
      short: 'f',
      description: 'Auto-resolve conflicts (use first variant)',
    },
    {
      name: 'dry-run',
      short: 'n',
      description: 'Show what would be synced without making changes',
    },
    {
      name: 'status',
      short: 's',
      description: 'Show sync status without syncing',
    },
  ],
  handler: async (args: ParsedArgs) => {
    const force = Boolean(args.options['force'] || args.options['f']);
    const dryRun = Boolean(args.options['dry-run'] || args.options['n']);
    const statusOnly = Boolean(args.options['status'] || args.options['s']);

    // Status-only mode
    if (statusOnly) {
      console.log();
      console.log(`  ${bold('🔄 MCP Sync Status')}`);
      console.log();

      const spinner = new Spinner('Scanning configurations...').start();
      const snapshots = readAllClientConfigs();
      const analysis = analyzeSyncState(snapshots);
      spinner.stop();

      // Show client summary
      console.log(
        `  ${bold('Clients:')} ${analysis.summary.clientsWithConfig} with MCP configs`
      );
      console.log();

      for (const snapshot of analysis.clients) {
        const name = getClientDisplayName(snapshot.client);
        const icon = snapshot.exists ? c('green', '●') : c('dim', '○');
        const mcpInfo = snapshot.exists
          ? `${snapshot.mcpCount} MCPs`
          : dim('no config');
        console.log(`    ${icon} ${name}: ${mcpInfo}`);
      }

      console.log();
      console.log(`  ${bold('MCPs:')}`);
      console.log(
        `    ${c('cyan', '•')} ${analysis.summary.totalUniqueMCPs} unique MCPs`
      );

      if (analysis.summary.consistentMCPs > 0) {
        console.log(
          `    ${c('green', '✓')} ${analysis.summary.consistentMCPs} fully synced`
        );
      }
      if (analysis.summary.needsSyncCount > 0) {
        console.log(
          `    ${c('yellow', '○')} ${analysis.summary.needsSyncCount} can be auto-synced`
        );
      }
      if (analysis.summary.conflictCount > 0) {
        console.log(
          `    ${c('red', '!')} ${analysis.summary.conflictCount} have conflicts`
        );
      }

      console.log();

      if (
        analysis.summary.needsSyncCount > 0 ||
        analysis.summary.conflictCount > 0
      ) {
        console.log(
          `  ${dim('Run')} ${c('cyan', 'octocode sync')} ${dim('to synchronize.')}`
        );
        if (analysis.summary.conflictCount > 0) {
          console.log(
            `  ${dim('Use')} ${c('cyan', '--force')} ${dim('to auto-resolve conflicts.')}`
          );
        }
        console.log();
      }

      return;
    }

    // Sync mode
    console.log();
    console.log(`  ${bold('🔄 MCP Sync')}`);
    console.log();

    const spinner = new Spinner('Analyzing configurations...').start();

    const result = await quickSync({ force, dryRun });

    if (result.syncPerformed) {
      if (result.success) {
        spinner.succeed(result.message);
        console.log();
        console.log(`  ${bold('Next:')} Restart your IDEs to apply changes.`);
      } else {
        spinner.fail(result.message);
        process.exitCode = 1;
      }
    } else {
      spinner.stop();
      if (result.success) {
        console.log(`  ${c('green', '✓')} ${result.message}`);
      } else {
        console.log(`  ${c('yellow', '⚠')} ${result.message}`);
        if (!force && result.message.includes('conflict')) {
          console.log();
          console.log(`  ${dim('Options:')}`);
          console.log(
            `    ${c('cyan', '•')} Run ${c('cyan', 'octocode')} for interactive mode`
          );
          console.log(
            `    ${c('cyan', '•')} Use ${c('cyan', '--force')} to auto-resolve`
          );
        }
        process.exitCode = 1;
      }
    }

    console.log();
  },
};

/**
 * Cache command - inspect and clean Octocode cache directories
 */
const cacheCommand: CLICommand = {
  name: 'cache',
  description: 'Inspect and clean Octocode cache and logs',
  usage:
    'octocode cache [status|clean] [--repos] [--skills] [--logs] [--tools|--local|--lsp|--api] [--all]',
  options: [
    {
      name: 'repos',
      description: 'Target cloned repositories cache',
    },
    {
      name: 'skills',
      description: 'Target marketplace skills cache',
    },
    {
      name: 'logs',
      description: 'Target Octocode logs directory',
    },
    {
      name: 'all',
      short: 'a',
      description: 'Target repos + skills + logs (tool flags are advisory)',
    },
    {
      name: 'tools',
      description:
        'Target tool caches (local + lsp + api). In-memory caches clear on MCP restart.',
    },
    {
      name: 'local',
      description:
        'Target local tool cache. In-memory cache clears on MCP restart.',
    },
    {
      name: 'lsp',
      description:
        'Target LSP tool cache. In-memory cache clears on MCP restart.',
    },
    {
      name: 'api',
      description:
        'Target remote API tool cache. In-memory cache clears on MCP restart.',
    },
  ],
  handler: async (args: ParsedArgs) => {
    const subcommand = (args.args[0] || 'status').toLowerCase();
    const octocodeHome =
      paths?.home ||
      process.env.OCTOCODE_HOME ||
      path.join(process.env.HOME || '', '.octocode');
    const reposDir = paths?.repos || path.join(octocodeHome, 'repos');
    const logsDir = paths?.logs || path.join(octocodeHome, 'logs');
    const skillsDir = getSkillsCacheDir();

    const hasReposFlag = Boolean(args.options['repos']);
    const hasSkillsFlag = Boolean(args.options['skills']);
    const hasLogsFlag = Boolean(args.options['logs']);
    const hasToolsFlag = Boolean(args.options['tools']);
    const hasLocalFlag = Boolean(args.options['local']);
    const hasLspFlag = Boolean(args.options['lsp']);
    const hasApiFlag = Boolean(args.options['api']);
    const hasAllFlag = Boolean(args.options['all'] || args.options['a']);

    const targetRepos = hasAllFlag || hasReposFlag;
    const targetSkills = hasAllFlag || hasSkillsFlag;
    const targetLogs = hasAllFlag || hasLogsFlag;
    const targetTools =
      hasToolsFlag || hasLocalFlag || hasLspFlag || hasApiFlag;

    if (subcommand === 'status') {
      const reposBytes = getDirectorySizeBytes(reposDir);
      const skillsBytes = getDirectorySizeBytes(skillsDir);
      const logsBytes = getDirectorySizeBytes(logsDir);
      const total = reposBytes + skillsBytes + logsBytes;

      console.log();
      console.log(`  ${bold('🧹 Octocode Cache Status')}`);
      console.log();
      console.log(`  ${dim('Home:')} ${octocodeHome}`);
      console.log();
      console.log(
        `  ${c('cyan', '•')} repos:  ${formatBytes(reposBytes)}  ${dim(`(${reposDir})`)}`
      );
      console.log(
        `  ${c('cyan', '•')} skills: ${formatBytes(skillsBytes)}  ${dim(`(${skillsDir})`)}`
      );
      console.log(
        `  ${c('cyan', '•')} logs:   ${formatBytes(logsBytes)}  ${dim(`(${logsDir})`)}`
      );
      console.log();
      console.log(`  ${bold('Total:')} ${formatBytes(total)}`);
      console.log();
      console.log(`  ${dim('Clean examples:')}`);
      console.log(`    ${c('yellow', 'octocode cache clean --repos')}`);
      console.log(`    ${c('yellow', 'octocode cache clean --tools')}`);
      console.log(`    ${c('yellow', 'octocode cache clean --all')}`);
      console.log();
      return;
    }

    if (subcommand === 'clean') {
      const cleanRepos =
        targetRepos || (!targetRepos && !targetSkills && !targetLogs);
      const cleanSkills =
        targetSkills || (!targetRepos && !targetSkills && !targetLogs);
      const cleanLogs = targetLogs;

      let cleanedAnything = false;
      let freedBytes = 0;

      if (cleanRepos && existsSync(reposDir)) {
        freedBytes += getDirectorySizeBytes(reposDir);
        rmSync(reposDir, { recursive: true, force: true });
        cleanedAnything = true;
      }

      if (cleanSkills) {
        const before = getDirectorySizeBytes(skillsDir);
        clearSkillsCache();
        const after = getDirectorySizeBytes(skillsDir);
        if (before > 0 || after === 0) {
          freedBytes += Math.max(0, before - after);
          cleanedAnything = true;
        }
      }

      if (cleanLogs && existsSync(logsDir)) {
        freedBytes += getDirectorySizeBytes(logsDir);
        rmSync(logsDir, { recursive: true, force: true });
        cleanedAnything = true;
      }

      if (targetTools) {
        console.log(
          `  ${c('yellow', '⚠')} Tool cache cleanup flags (${[
            hasToolsFlag ? '--tools' : '',
            hasLocalFlag ? '--local' : '',
            hasLspFlag ? '--lsp' : '',
            hasApiFlag ? '--api' : '',
          ]
            .filter(Boolean)
            .join(
              ', '
            )}) apply to in-memory MCP cache and clear on server restart.`
        );
        console.log(
          `  ${dim('Tip: restart the MCP server process to reset local/LSP/API in-memory caches.')}`
        );
      }

      console.log();
      if (cleanedAnything) {
        console.log(`  ${c('green', '✓')} Cache cleanup complete`);
        console.log(`  ${dim('Freed:')} ${formatBytes(freedBytes)}`);
      } else if (!targetTools) {
        console.log(`  ${c('yellow', '⚠')} Nothing to clean`);
      }
      console.log();
      return;
    }

    console.log();
    console.log(`  ${c('red', '✗')} Unknown cache subcommand: ${subcommand}`);
    console.log(
      `  ${dim('Usage:')} octocode cache [status|clean] [--repos] [--skills] [--logs] [--tools|--local|--lsp|--api] [--all]`
    );
    console.log();
    process.exitCode = 1;
  },
};

/**
 * All available commands
 */
const commands: CLICommand[] = [
  installCommand,
  authCommand,
  loginCommand,
  logoutCommand,
  skillsCommand,
  cacheCommand,
  tokenCommand,
  statusCommand,
  syncCommand,
];

/**
 * Find a command by name or alias
 */
export function findCommand(name: string): CLICommand | undefined {
  return commands.find(cmd => cmd.name === name || cmd.aliases?.includes(name));
}
