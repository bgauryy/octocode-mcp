/**
 * Main Menu UI
 */

import { c, bold, dim } from '../utils/colors.js';
import {
  loadInquirer,
  Separator,
  input,
  selectWithCancel,
} from '../utils/prompts.js';
import { clearScreen } from '../utils/platform.js';
import {
  runInstallFlow,
  checkAndPrintEnvironmentWithLoader,
  hasEnvironmentIssues,
} from './install/index.js';
import { runConfigOptionsFlow, runInspectFlow } from './config/index.js';
import { runExternalMCPFlow } from './external-mcp/index.js';
import { runSyncFlow } from './sync/index.js';
import { printGoodbye, printWelcome } from './header.js';
import { Spinner } from '../utils/spinner.js';
import { runSkillsMenu } from './skills-menu/index.js';
import { getAppState, type AppState, type SkillsState } from './state.js';
import { MCP_CLIENTS, type ClientInstallStatus } from '../utils/mcp-config.js';
import {
  login as oauthLogin,
  logout as oauthLogout,
  getAuthStatus,
  getStoragePath,
  isUsingSecureStorage,
  type VerificationInfo,
} from '../features/github-oauth.js';
import type { OctocodeAuthStatus } from '../types/index.js';
import {
  checkGitHubAuth,
  runGitHubAuthLogout,
  getGitHubCLIToken,
} from '../features/gh-auth.js';
import { getCredentials } from '../utils/token-storage.js';
import open from 'open';

/**
 * Wait for user to press enter
 */
async function pressEnterToContinue(): Promise<void> {
  console.log();
  await input({
    message: dim('Press Enter to continue...'),
    default: '',
  });
}

type MenuChoice = 'octocode' | 'skills' | 'auth' | 'mcp-config' | 'exit';

type OctocodeMenuChoice = 'configure' | 'install' | 'back';

/**
 * Get friendly client names for display
 */
function getClientNames(clients: ClientInstallStatus[]): string {
  return clients.map(c => MCP_CLIENTS[c.client]?.name || c.client).join(', ');
}

/**
 * Print installed IDEs with their config paths
 */
function printInstalledIDEs(installedClients: ClientInstallStatus[]): void {
  if (installedClients.length === 0) {
    console.log(`  ${dim('No IDEs configured yet')}`);
    return;
  }

  console.log(`  ${dim('Installed on:')}`);
  for (const client of installedClients) {
    const clientName = MCP_CLIENTS[client.client]?.name || client.client;
    console.log(
      `    ${dim('•')} ${dim(clientName)} ${dim('→')} ${c('cyan', client.configPath)}`
    );
  }
}

/**
 * Build skills menu item based on state (for main menu)
 */
function buildSkillsMenuItem(skills: SkillsState): {
  name: string;
  value: MenuChoice;
  description: string;
} {
  if (!skills.sourceExists || !skills.hasSkills) {
    return {
      name: '🧠 Manage System Skills',
      value: 'skills',
      description: dim('Not available'),
    };
  }

  if (skills.allInstalled) {
    return {
      name: `🧠 Manage System Skills ${c('green', '✓')}`,
      value: 'skills',
      description: `${skills.totalInstalledCount} installed • ${skills.destDir}`,
    };
  }

  if (skills.totalInstalledCount > 0) {
    return {
      name: '🧠 Manage System Skills',
      value: 'skills',
      description: `${skills.totalInstalledCount} installed • ${skills.destDir}`,
    };
  }

  return {
    name: '🧠 Manage System Skills',
    value: 'skills',
    description: `No skills installed • ${skills.destDir}`,
  };
}

/**
 * Build auth menu item based on state
 */
function buildAuthMenuItem(auth: OctocodeAuthStatus): {
  name: string;
  value: MenuChoice;
  description: string;
} {
  if (auth.authenticated) {
    const source = auth.tokenSource === 'gh-cli' ? 'gh CLI' : 'Octocode';
    return {
      name: `🔑 Manage Auth ${c('green', '✓')}`,
      value: 'auth',
      description: `@${auth.username || 'unknown'} via ${source}`,
    };
  }

  // Not authenticated - show X to indicate setup needed
  return {
    name: `🔑 Manage Auth ${c('red', '✗')}`,
    value: 'auth',
    description: 'Not configured - set up auth',
  };
}

/**
 * Build status line for display
 * Uses centralized state counts for consistency
 */
function buildStatusLine(state: AppState): string {
  const parts: string[] = [];

  // Octocode installation status - use installedCount from centralized state
  if (state.octocode.isInstalled) {
    const clientLabel =
      state.octocode.installedCount === 1 ? 'client' : 'clients';
    parts.push(
      `${c('green', '●')} ${state.octocode.installedCount} ${clientLabel}`
    );
  } else {
    parts.push(`${c('yellow', '○')} Not installed`);
  }

  // Skills status - use totalInstalledCount from centralized state
  if (state.skills.totalInstalledCount > 0) {
    parts.push(`${c('green', '●')} ${state.skills.totalInstalledCount} skills`);
  } else if (state.skills.sourceExists && state.skills.hasSkills) {
    parts.push(`${c('yellow', '○')} ${state.skills.skills.length} skills`);
  }

  return parts.join(dim('  │  '));
}

/**
 * Build Octocode menu item based on state
 * Shows ✓ only if both installed AND auth is working
 * Shows ✗ if installed but no auth
 * Uses centralized state counts for consistency
 */
function buildOctocodeMenuItem(state: AppState): {
  name: string;
  value: MenuChoice;
  description: string;
} {
  if (state.octocode.isInstalled) {
    const clientLabel = state.octocode.installedCount === 1 ? 'IDE' : 'IDEs';

    // Show ✓ only if both installed AND authenticated
    if (state.githubAuth.authenticated) {
      return {
        name: `🐙 Octocode MCP ${c('green', '✓')}`,
        value: 'octocode',
        description: `Configure Octocode MCP - ${state.octocode.installedCount} ${clientLabel} configured`,
      };
    }

    // Installed but not authenticated - show ✗ to indicate setup needed
    return {
      name: `🐙 Octocode MCP ${c('red', '✗')}`,
      value: 'octocode',
      description: `Configure Octocode MCP - ${state.octocode.installedCount} ${clientLabel} configured`,
    };
  }

  return {
    name: `🐙 ${bold('Octocode Configuration')}`,
    value: 'octocode',
    description: 'Configure Octocode MCP - 0 IDEs configured',
  };
}

/**
 * Show main menu and handle selection
 * @param state - Unified application state
 * @returns MenuChoice or 'exit' if user confirms exit
 */
async function showMainMenu(state: AppState): Promise<MenuChoice> {
  // Display compact status bar
  console.log();
  console.log(`  ${dim('Status:')} ${buildStatusLine(state)}`);

  // Build menu choices based on state
  const choices: Array<{
    name: string;
    value: MenuChoice;
    description?: string;
  }> = [];

  // ─── OCTOCODE ───
  choices.push(buildOctocodeMenuItem(state));

  // ─── SKILLS ───
  choices.push(buildSkillsMenuItem(state.skills));

  // ─── AUTH ───
  choices.push(buildAuthMenuItem(state.githubAuth));

  // ─── MCP CONFIGURATION ───
  choices.push({
    name: '⚡ Manage System MCP',
    value: 'mcp-config',
    description: 'Add, sync and configure MCP across all IDEs',
  });

  // ─── EXIT ───
  choices.push(
    new Separator() as unknown as {
      name: string;
      value: MenuChoice;
    }
  );
  choices.push({
    name: dim('Exit'),
    value: 'exit',
  });

  console.log();
  const choice = await selectWithCancel<MenuChoice>({
    message: 'What would you like to do?',
    choices,
    pageSize: 12,
    loop: false,
    theme: {
      prefix: '  ',
      style: {
        highlight: (text: string) => c('magenta', text),
        message: (text: string) => bold(text),
      },
    },
  });

  return choice;
}

// ============================================================================
// Octocode Submenu Flow
// ============================================================================

/**
 * Show Octocode submenu
 */
async function showOctocodeMenu(state: AppState): Promise<OctocodeMenuChoice> {
  const choices: Array<{
    name: string;
    value: OctocodeMenuChoice;
    description?: string;
  }> = [];

  // ─── INSTALL / ADD TO IDE ───
  if (state.octocode.isInstalled) {
    // Show "Add to IDE" if more clients available
    if (state.octocode.hasMoreToInstall) {
      const availableNames = getClientNames(state.octocode.availableClients);
      choices.push({
        name: '📦 Add Octocode',
        value: 'install',
        description: availableNames,
      });
    }
  } else {
    // Install is the main action when not installed - show ✗ indicator
    choices.push({
      name: `📦 ${bold('Install')} ${c('red', '✗')}`,
      value: 'install',
      description: 'Setup for Cursor, Claude, Windsurf...',
    });
  }

  // ─── CONFIGURE (only when installed) ───
  if (state.octocode.isInstalled) {
    choices.push({
      name: '⚙️  Configure Octocode',
      value: 'configure',
      description: 'Server options & preferences',
    });
  }

  // ─── BACK ───
  choices.push(
    new Separator() as unknown as {
      name: string;
      value: OctocodeMenuChoice;
      description?: string;
    }
  );

  choices.push({
    name: `${c('dim', '← Back to main menu')}`,
    value: 'back',
  });

  const choice = await selectWithCancel<OctocodeMenuChoice>({
    message: '',
    choices,
    pageSize: 12,
    loop: false,
    theme: {
      prefix: '  ',
      style: {
        highlight: (text: string) => c('magenta', text),
      },
    },
  });

  return choice;
}

/**
 * Run Octocode submenu flow
 */
async function runOctocodeFlow(): Promise<void> {
  await loadInquirer();

  // Get initial state
  let state = getAppState();

  // Show installed IDEs info
  console.log();
  printInstalledIDEs(state.octocode.installedClients);

  let inMenu = true;
  let firstRun = true;
  while (inMenu) {
    // Refresh state on each iteration (with loading indicator on subsequent runs)
    if (firstRun) {
      // State already fetched above
      firstRun = false;
    } else {
      const spinner = new Spinner('  Refreshing...').start();
      state = getAppState();
      spinner.clear();
    }

    const choice = await showOctocodeMenu(state);

    switch (choice) {
      case 'install':
        await runInstallFlow();
        console.log();
        break;

      case 'configure':
        await runConfigOptionsFlow();
        console.log();
        break;

      case 'back':
      default:
        inMenu = false;
        break;
    }
  }
}

// ============================================================================
// MCP Configuration Flow
// ============================================================================

type MCPConfigChoice = 'sync' | 'marketplace' | 'inspect' | 'back';

/**
 * Show MCP configuration submenu
 */
async function showMCPConfigMenu(): Promise<MCPConfigChoice> {
  const choices: Array<{
    name: string;
    value: MCPConfigChoice;
    description?: string;
  }> = [];

  choices.push({
    name: 'ℹ Show MCP details',
    value: 'inspect',
    description: 'View and manage configured MCP servers',
  });

  choices.push({
    name: '🔄 Sync Configurations',
    value: 'sync',
    description: 'Sync MCP configs across all IDEs',
  });

  choices.push({
    name: '🔌 MCP Marketplace',
    value: 'marketplace',
    description: 'Browse and install community MCP servers',
  });

  choices.push(
    new Separator() as unknown as {
      name: string;
      value: MCPConfigChoice;
      description?: string;
    }
  );

  choices.push({
    name: `${c('dim', '← Back to main menu')}`,
    value: 'back',
  });

  const choice = await selectWithCancel<MCPConfigChoice>({
    message: '',
    choices,
    pageSize: 12,
    loop: false,
    theme: {
      prefix: '  ',
      style: {
        highlight: (text: string) => c('magenta', text),
      },
    },
  });

  return choice;
}

/**
 * Run MCP configuration flow (submenu)
 */
async function runMCPConfigFlow(): Promise<void> {
  await loadInquirer();
  console.log();

  let inMenu = true;
  while (inMenu) {
    const choice = await showMCPConfigMenu();

    switch (choice) {
      case 'inspect':
        await runInspectFlow();
        break;

      case 'sync':
        await runSyncFlow();
        console.log();
        break;

      case 'marketplace':
        await runExternalMCPFlow();
        console.log();
        break;

      case 'back':
      default:
        inMenu = false;
        break;
    }
  }
}

// ============================================================================
// Auth Flow
// ============================================================================

type AuthMenuChoice =
  | 'login'
  | 'gh-guidance'
  | 'logout'
  | 'gh-logout'
  | 'check-token'
  | 'back';

/**
 * Show auth menu - smart ordering based on auth state
 * - Not authenticated: Sign in options first
 * - Authenticated: Manage/sign out first
 */
async function showAuthMenu(
  status: OctocodeAuthStatus
): Promise<AuthMenuChoice> {
  const choices: Array<{
    name: string;
    value: AuthMenuChoice;
    description?: string;
  }> = [];

  const isUsingOctocode = status.tokenSource === 'octocode';
  const isUsingGhCli = status.tokenSource === 'gh-cli';
  const isAuthenticated = status.authenticated;

  if (isAuthenticated) {
    // ─── AUTHENTICATED: Show management options first ───
    choices.push({
      name: '🔍 Manage Auth Tokens',
      value: 'check-token',
      description: 'View and delete stored tokens',
    });

    if (isUsingGhCli) {
      choices.push({
        name: '🔓 Sign Out (gh CLI)',
        value: 'gh-logout',
        description: 'Opens gh auth logout',
      });
    } else if (isUsingOctocode) {
      choices.push({
        name: '🔓 Sign Out',
        value: 'logout',
        description: 'Remove Octocode token',
      });
    }
  } else {
    // ─── NOT AUTHENTICATED: Show sign in options first ───
    choices.push({
      name: `🔐 Sign In via Octocode ${c('green', '(Recommended)')}`,
      value: 'login',
      description: 'Quick browser sign in',
    });
    choices.push({
      name: '🔐 Sign In via gh CLI',
      value: 'gh-guidance',
      description: 'Use existing GitHub CLI installation',
    });

    choices.push(
      new Separator() as unknown as {
        name: string;
        value: AuthMenuChoice;
        description?: string;
      }
    );

    choices.push({
      name: `${dim('🔍 View all auth methods')}`,
      value: 'check-token',
      description: 'Check env vars, gh CLI, stored tokens',
    });
  }

  choices.push(
    new Separator() as unknown as {
      name: string;
      value: AuthMenuChoice;
      description?: string;
    }
  );

  choices.push({
    name: `${c('dim', '← Back')}`,
    value: 'back',
  });

  const choice = await selectWithCancel<AuthMenuChoice>({
    message: '',
    choices,
    pageSize: 12,
    loop: false,
    theme: {
      prefix: '  ',
      style: {
        highlight: (text: string) => c('magenta', text),
      },
    },
  });

  return choice;
}

/**
 * Run the login flow
 */
async function runLoginFlow(): Promise<boolean> {
  console.log();
  console.log(`  ${bold('🔐 GitHub Authentication')}`);
  console.log();
  console.log(
    `  ${dim('This will open your browser to authenticate with GitHub.')}`
  );
  console.log();

  let verificationShown = false;
  const spinner = new Spinner('Connecting to GitHub...').start();

  const result = await oauthLogin({
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
  }
  console.log();

  await pressEnterToContinue();
  return result.success;
}

/**
 * Run the logout flow
 */
async function runLogoutFlow(): Promise<boolean> {
  const status = getAuthStatus();

  console.log();
  console.log(`  ${bold('🔓 Sign Out')}`);
  console.log(
    `  ${dim('Signed in as:')} ${c('cyan', '@' + (status.username || 'unknown'))}`
  );
  console.log();

  const result = await oauthLogout();

  if (result.success) {
    console.log(`  ${c('green', '✓')} Signed out successfully`);

    // Check if gh CLI fallback is available
    const ghAuth = checkGitHubAuth();
    if (ghAuth.authenticated) {
      console.log(
        `  ${dim('Tip:')} You can still use gh CLI (@${ghAuth.username || 'unknown'})`
      );
    }
  } else {
    console.log(
      `  ${c('red', '✗')} Sign out failed: ${result.error || 'Unknown error'}`
    );
  }
  console.log();

  await pressEnterToContinue();
  return result.success;
}

type GhGuidanceChoice = 'open-site' | 'back';

/**
 * Show gh CLI setup guidance
 * Escape key returns to parent menu
 */
async function showGhCliGuidance(): Promise<void> {
  const GH_CLI_URL = 'https://cli.github.com/';

  // Show instructions upfront
  console.log();
  console.log(`  ${bold('Setup Instructions:')}`);
  console.log();
  console.log(`  1. Install GitHub CLI from:`);
  console.log(`     ${c('cyan', GH_CLI_URL)}`);
  console.log();
  console.log(`  2. Run the following command to authenticate:`);
  console.log(`     ${c('cyan', 'gh auth login')}`);
  console.log();
  console.log(`  ${dim('Once authenticated, octocode will automatically')}`);
  console.log(`  ${dim('use your gh CLI token.')}`);
  console.log();

  const choice = await selectWithCancel<GhGuidanceChoice>({
    message: '',
    choices: [
      {
        name: '🌐 Open GitHub CLI website',
        value: 'open-site',
      },
      new Separator() as unknown as {
        name: string;
        value: GhGuidanceChoice;
      },
      {
        name: `${c('dim', '← Back')}`,
        value: 'back',
      },
    ],
    pageSize: 10,
    loop: false,
    theme: {
      prefix: '  ',
      style: {
        highlight: (text: string) => c('cyan', text),
        message: (text: string) => text,
      },
    },
  });

  if (choice === 'back') {
    return;
  }

  if (choice === 'open-site') {
    try {
      await open(GH_CLI_URL);
      console.log();
      console.log(
        `  ${c('green', '✓')} Opened ${c('cyan', GH_CLI_URL)} in browser`
      );
    } catch {
      console.log();
      console.log(`  ${c('yellow', '!')} Could not open browser automatically`);
      console.log(`  ${dim('Please visit:')} ${c('cyan', GH_CLI_URL)}`);
    }
    console.log();
    await pressEnterToContinue();
  }
}

type TokenCheckChoice =
  | 'delete-gh'
  | 'delete-octocode'
  | 'login-octocode'
  | 'gh-guidance'
  | 'back';

/**
 * Check all authentication methods and display their status
 * Allows deleting individual tokens or logging in
 */
async function runCheckTokenFlow(): Promise<void> {
  let inTokenCheck = true;

  while (inTokenCheck) {
    console.log();
    console.log(`  ${bold('🔍 Auth Token Status')}`);
    console.log();

    // 1. Check gh CLI token
    const ghCliToken = getGitHubCLIToken();
    const ghAuth = checkGitHubAuth();
    let ghCliAvailable = false;
    let ghCliUsername = '';

    if (ghCliToken) {
      ghCliAvailable = true;
      ghCliUsername = ghAuth.username || '';
    }

    // 2. Check Octocode storage (keychain/file)
    const octocodeCredentials = await getCredentials();
    let octocodeAvailable = false;
    let octocodeUsername = '';
    const storageType = isUsingSecureStorage() ? 'keychain' : 'encrypted file';

    if (octocodeCredentials) {
      octocodeAvailable = true;
      octocodeUsername = octocodeCredentials.username || '';
    }

    // Display simple status
    if (ghCliAvailable) {
      const userPart = ghCliUsername ? ` (@${ghCliUsername})` : '';
      console.log(`  ${c('green', '✓')} gh CLI${userPart}`);
    } else {
      const statusText = ghAuth.installed
        ? 'Not authenticated'
        : 'Not installed';
      console.log(`  ${c('red', '✗')} gh CLI: ${dim(statusText)}`);
    }

    if (octocodeAvailable) {
      const userPart = octocodeUsername ? ` (@${octocodeUsername})` : '';
      console.log(`  ${c('green', '✓')} Octocode (${storageType})${userPart}`);
    } else {
      console.log(
        `  ${c('red', '✗')} Octocode (${storageType}): ${dim('Not stored')}`
      );
    }

    const availableCount =
      (ghCliAvailable ? 1 : 0) + (octocodeAvailable ? 1 : 0);

    console.log();
    if (availableCount > 0) {
      console.log(`  ${dim('→')} ${availableCount} auth method(s) available`);
    } else {
      console.log(`  ${c('yellow', '⚠')} No authentication methods available`);
    }
    console.log();

    // Build menu choices - show login or delete based on availability
    const choices: Array<{
      name: string;
      value: TokenCheckChoice;
      description?: string;
    }> = [];

    if (ghCliAvailable) {
      choices.push({
        name: `🗑️  Delete gh CLI token`,
        value: 'delete-gh',
        description: ghCliUsername
          ? `@${ghCliUsername}`
          : 'Opens gh auth logout',
      });
    } else {
      choices.push({
        name: `🔐 Sign In via gh CLI`,
        value: 'gh-guidance',
        description: 'Use GitHub CLI to authenticate',
      });
    }

    if (octocodeAvailable) {
      choices.push({
        name: `🗑️  Delete Octocode token`,
        value: 'delete-octocode',
        description: octocodeUsername
          ? `@${octocodeUsername}`
          : `From ${storageType}`,
      });
    } else {
      choices.push({
        name: `🔐 Sign In via Octocode`,
        value: 'login-octocode',
        description: 'Quick browser sign in',
      });
    }

    choices.push(
      new Separator() as unknown as {
        name: string;
        value: TokenCheckChoice;
        description?: string;
      }
    );

    choices.push({
      name: `${c('dim', '← Back')}`,
      value: 'back',
    });

    const choice = await selectWithCancel<TokenCheckChoice>({
      message: '',
      choices,
      pageSize: 10,
      loop: false,
      theme: {
        prefix: '  ',
        style: {
          highlight: (text: string) => c('magenta', text),
        },
      },
    });

    switch (choice) {
      case 'delete-gh': {
        console.log();
        const confirmGh = await selectWithCancel<'yes' | 'no'>({
          message: `Delete gh CLI token${ghCliUsername ? ` (@${ghCliUsername})` : ''}?`,
          choices: [
            { name: 'Yes, sign out', value: 'yes' },
            { name: 'No, cancel', value: 'no' },
          ],
          theme: {
            prefix: '  ',
            style: {
              highlight: (text: string) => c('red', text),
            },
          },
        });

        if (confirmGh === 'yes') {
          console.log();
          console.log(`  ${dim('Opening gh auth logout...')}`);
          const ghResult = runGitHubAuthLogout();
          if (ghResult.success) {
            console.log(`  ${c('green', '✓')} Signed out of gh CLI`);
          } else {
            console.log(`  ${c('yellow', '!')} Sign out was cancelled`);
          }
          console.log();
          await pressEnterToContinue();
        }
        break;
      }

      case 'delete-octocode': {
        console.log();
        const confirmOctocode = await selectWithCancel<'yes' | 'no'>({
          message: `Delete Octocode token${octocodeUsername ? ` (@${octocodeUsername})` : ''} from ${storageType}?`,
          choices: [
            { name: 'Yes, delete', value: 'yes' },
            { name: 'No, cancel', value: 'no' },
          ],
          theme: {
            prefix: '  ',
            style: {
              highlight: (text: string) => c('red', text),
            },
          },
        });

        if (confirmOctocode === 'yes') {
          const result = await oauthLogout();
          if (result.success) {
            console.log();
            console.log(`  ${c('green', '✓')} Octocode token deleted`);
          } else {
            console.log();
            console.log(
              `  ${c('red', '✗')} Failed to delete: ${result.error || 'Unknown error'}`
            );
          }
          console.log();
          await pressEnterToContinue();
        }
        break;
      }

      case 'login-octocode': {
        const success = await runLoginFlow();
        if (success) {
          // After successful login, exit the token check loop to refresh state
          inTokenCheck = false;
        }
        break;
      }

      case 'gh-guidance': {
        await showGhCliGuidance();
        break;
      }

      case 'back':
      default:
        inTokenCheck = false;
        break;
    }
  }
}

/**
 * Display auth status - clean, simple status line
 */
function displayAuthStatus(status: OctocodeAuthStatus): void {
  console.log(`  ${bold('🔐 GitHub Authentication')}`);
  console.log();

  if (status.authenticated) {
    const source =
      status.tokenSource === 'gh-cli'
        ? 'gh CLI'
        : isUsingSecureStorage()
          ? 'keychain'
          : 'file';
    console.log(
      `  ${c('green', '✓')} Signed in as ${c('cyan', '@' + (status.username || 'unknown'))} ${dim(`via ${source}`)}`
    );

    if (status.tokenExpired) {
      console.log(
        `  ${c('yellow', '⚠')} Session expired - please sign in again`
      );
    }
  } else {
    console.log(`  ${c('yellow', '○')} Not signed in`);
    console.log(`  ${dim('Sign in to access private repositories.')}`);
  }
  console.log();
}

/**
 * Run auth flow (login/logout menu)
 */
async function runAuthFlow(): Promise<void> {
  await loadInquirer();
  console.log();

  let inAuthMenu = true;
  while (inAuthMenu) {
    const status = getAuthStatus();

    // Show current status
    displayAuthStatus(status);

    const choice = await showAuthMenu(status);

    switch (choice) {
      case 'check-token':
        await runCheckTokenFlow();
        console.log();
        break;

      case 'login':
        await runLoginFlow();
        console.log();
        break;

      case 'gh-guidance':
        await showGhCliGuidance();
        break;

      case 'logout':
        await runLogoutFlow();
        console.log();
        break;

      case 'gh-logout': {
        console.log();
        console.log(`  ${dim('Opening gh auth logout...')}`);
        console.log();
        const ghResult = runGitHubAuthLogout();
        if (ghResult.success) {
          console.log();
          console.log(`  ${c('green', '✓')} Signed out of gh CLI`);
        } else {
          console.log();
          console.log(`  ${c('yellow', '!')} Sign out was cancelled`);
        }
        console.log();
        await pressEnterToContinue();
        break;
      }

      case 'back':
      default:
        inAuthMenu = false;
        break;
    }
  }
}

/**
 * Handle menu selection
 */
async function handleMenuChoice(choice: MenuChoice): Promise<boolean> {
  switch (choice) {
    case 'octocode':
      await runOctocodeFlow();
      return true;

    case 'skills':
      await runSkillsMenu();
      return true;

    case 'auth':
      await runAuthFlow();
      return true;

    case 'mcp-config':
      await runMCPConfigFlow();
      return true;

    case 'exit':
      printGoodbye();
      return false;

    default:
      return true;
  }
}

/**
 * Print the environment check section header
 */
function printEnvHeader(): void {
  console.log(c('blue', '━'.repeat(66)));
  console.log(`  🔍 ${bold('Environment')}`);
  console.log(c('blue', '━'.repeat(66)));
}

/**
 * Display environment status section
 * Uses pre-fetched auth status to ensure consistency with menu items
 */
async function displayEnvironmentStatus(
  _authStatus: OctocodeAuthStatus
): Promise<void> {
  printEnvHeader();

  const envStatus = await checkAndPrintEnvironmentWithLoader();

  // Show node-doctor hint if issues detected
  if (hasEnvironmentIssues(envStatus)) {
    console.log();
    console.log(
      `  ${dim('💡')} ${dim('Run')} ${c('cyan', 'npx node-doctor')} ${dim('for diagnostics')}`
    );
  }
}

/**
 * Run the interactive menu loop
 */
export async function runMenuLoop(): Promise<void> {
  let firstRun = true;
  let running = true;

  while (running) {
    // Get unified app state FIRST (refreshed on each iteration for accurate status)
    // This ensures consistency between environment display and menu items
    // Show loading indicator on subsequent iterations (first run shows env status)
    let state;
    if (firstRun) {
      state = getAppState();
    } else {
      const spinner = new Spinner('  Loading...').start();
      state = getAppState();
      spinner.clear();
    }

    // Clear screen and show welcome when returning to menu (not on first run)
    if (!firstRun) {
      clearScreen();
      printWelcome();
      // Show environment status using pre-fetched state for consistency
      await displayEnvironmentStatus(state.githubAuth);
    }
    firstRun = false;

    const choice = await showMainMenu(state);
    running = await handleMenuChoice(choice);
  }
}
