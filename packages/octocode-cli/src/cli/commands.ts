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

type GetTokenSource = 'octocode' | 'gh' | 'auto';

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
      console.log(
        `    ${c('cyan', '→')} ${c('yellow', 'octocode auth logout')}`
      );
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
  usage: 'octocode auth logout [--hostname <host>]',
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
      console.log(
        `    ${c('cyan', '→')} ${c('yellow', 'octocode auth login')}`
      );
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
    console.log(`    ${c('cyan', '→')} ${c('yellow', 'octocode auth login')}`);
    console.log(`    ${dim('or')}`);
    console.log(`    ${c('cyan', '→')} ${c('yellow', 'gh auth login')}`);
  }
  console.log();
  console.log(`  ${dim('Credentials stored in:')} ${getStoragePath()}`);
  console.log();
}

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
        console.log(
          `    ${c('cyan', '→')} ${c('yellow', 'octocode auth login')}`
        );
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
        console.log(
          `    ${c('cyan', '→')} ${c('yellow', 'octocode auth login')}`
        );
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
 * All available commands
 * Note: login/logout/status are accessed via `auth` subcommands
 */
const commands: CLICommand[] = [installCommand, authCommand, tokenCommand];

/**
 * Find a command by name or alias
 */
export function findCommand(name: string): CLICommand | undefined {
  return commands.find(cmd => cmd.name === name || cmd.aliases?.includes(name));
}
