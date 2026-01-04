/**
 * Main Menu UI
 */

import { c, bold, dim } from '../utils/colors.js';
import { loadInquirer, select, Separator, input } from '../utils/prompts.js';
import { clearScreen } from '../utils/platform.js';
import { runInstallFlow } from './install/index.js';
import { runConfigOptionsFlow } from './config/index.js';
import { runExternalMCPFlow } from './external-mcp/index.js';
import { printGoodbye, printWelcome } from './header.js';
import { Spinner } from '../utils/spinner.js';
import {
  runSkillsMenu,
  getSkillsState,
  type SkillsState,
} from './skills-menu/index.js';
import {
  getAllClientInstallStatus,
  MCP_CLIENTS,
  type ClientInstallStatus,
} from '../utils/mcp-config.js';
import { detectCurrentClient } from '../utils/mcp-paths.js';
import {
  login as oauthLogin,
  logout as oauthLogout,
  getAuthStatus,
  getStoragePath,
  type VerificationInfo,
} from '../features/github-oauth.js';
import type { OctocodeAuthStatus, TokenSource } from '../types/index.js';

/**
 * Format token source for display
 */
function formatTokenSource(source: TokenSource): string {
  switch (source) {
    case 'octocode':
      return c('cyan', 'octocode');
    case 'gh-cli':
      return c('magenta', 'gh cli');
    default:
      return dim('none');
  }
}

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

type MenuChoice =
  | 'install'
  | 'conf'
  | 'skills'
  | 'auth'
  | 'external-mcp'
  | 'exit';

// ============================================================================
// App State Types
// ============================================================================

/**
 * Octocode installation state
 */
interface OctocodeState {
  installedClients: ClientInstallStatus[];
  availableClients: ClientInstallStatus[];
  isInstalled: boolean;
  hasMoreToInstall: boolean;
}

/**
 * Unified application state for all views
 */
interface AppState {
  octocode: OctocodeState;
  skills: SkillsState;
  currentClient: string | null;
  githubAuth: OctocodeAuthStatus;
}

// ============================================================================
// State Builders
// ============================================================================

/**
 * Get octocode installation state
 */
function getOctocodeState(): OctocodeState {
  const allClients = getAllClientInstallStatus();
  const installedClients = allClients.filter(c => c.octocodeInstalled);
  const availableClients = allClients.filter(
    c => c.configExists && !c.octocodeInstalled
  );

  return {
    installedClients,
    availableClients,
    isInstalled: installedClients.length > 0,
    hasMoreToInstall: availableClients.length > 0,
  };
}

/**
 * Get unified application state
 */
function getAppState(): AppState {
  return {
    octocode: getOctocodeState(),
    skills: getSkillsState(),
    currentClient: detectCurrentClient(),
    githubAuth: getAuthStatus(),
  };
}

/**
 * Get friendly client names for display
 */
function getClientNames(clients: ClientInstallStatus[]): string {
  return clients.map(c => MCP_CLIENTS[c.client]?.name || c.client).join(', ');
}

/**
 * Build skills menu item based on state
 */
function buildSkillsMenuItem(skills: SkillsState): {
  name: string;
  value: MenuChoice;
  description: string;
} {
  if (!skills.sourceExists || !skills.hasSkills) {
    return {
      name: '📚 Manage Skills',
      value: 'skills',
      description: dim('No skills available'),
    };
  }

  if (skills.allInstalled) {
    return {
      name: `📚 Manage Skills ${c('green', '✓')}`,
      value: 'skills',
      description: `${skills.installedCount} installed · Claude Code`,
    };
  }

  if (skills.installedCount > 0) {
    return {
      name: '📚 Manage Skills',
      value: 'skills',
      description: `${skills.installedCount}/${skills.skills.length} installed`,
    };
  }

  return {
    name: '📚 Install Skills',
    value: 'skills',
    description: 'Add Octocode skills to Claude Code',
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
    const sourceLabel = auth.tokenSource === 'gh-cli' ? dim(' (gh cli)') : '';
    return {
      name: `🔑 GitHub Account ${c('green', '✓')}`,
      value: 'auth',
      description: `@${auth.username || 'connected'}${sourceLabel}`,
    };
  }

  return {
    name: '🔑 Connect GitHub',
    value: 'auth',
    description: 'Required for private repos',
  };
}

/**
 * Show main menu and handle selection
 * @param state - Unified application state
 */
export async function showMainMenu(state: AppState): Promise<MenuChoice> {
  // Build compact status line
  const statusParts: string[] = [];

  if (state.octocode.isInstalled) {
    const names = getClientNames(state.octocode.installedClients);
    statusParts.push(`${c('green', '✓')} ${c('cyan', names)}`);
  }

  if (state.githubAuth.authenticated) {
    const sourceLabel =
      state.githubAuth.tokenSource === 'gh-cli' ? dim(' (gh)') : '';
    statusParts.push(
      `${c('green', '✓')} @${c('cyan', state.githubAuth.username || 'github')}${sourceLabel}`
    );
  } else {
    statusParts.push(`${c('yellow', '○')} ${dim('GitHub')}`);
  }

  if (statusParts.length > 0) {
    console.log(`  ${statusParts.join(dim('  ·  '))}`);
  }

  // Build menu choices based on state
  const choices: Array<{
    name: string;
    value: MenuChoice;
    description?: string;
  }> = [];

  // ─── PRIMARY ACTIONS ───
  if (state.octocode.isInstalled) {
    choices.push({
      name: '⚙️  Settings',
      value: 'conf',
      description: 'Configure octocode-mcp options',
    });

    if (state.octocode.hasMoreToInstall) {
      const availableNames = getClientNames(state.octocode.availableClients);
      choices.push({
        name: '📦 Add to Client',
        value: 'install',
        description: `Install to ${availableNames}`,
      });
    }
  } else {
    choices.push({
      name: '📦 Install Octocode',
      value: 'install',
      description: 'Setup MCP server for your AI client',
    });
  }

  // ─── MCP MARKETPLACE ───
  choices.push({
    name: '🔌 MCP Marketplace',
    value: 'external-mcp',
    description: '70+ servers · Playwright, Postgres, Stripe...',
  });

  // ─── ACCOUNT & TOOLS ───
  choices.push(buildAuthMenuItem(state.githubAuth));
  choices.push(buildSkillsMenuItem(state.skills));

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
  const choice = await select<MenuChoice>({
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
// Auth Flow
// ============================================================================

type AuthMenuChoice = 'login' | 'logout' | 'switch' | 'back';

/**
 * Show auth submenu
 */
async function showAuthMenu(
  isAuthenticated: boolean,
  username?: string
): Promise<AuthMenuChoice> {
  const choices: Array<{
    name: string;
    value: AuthMenuChoice;
    description?: string;
  }> = [];

  if (isAuthenticated) {
    choices.push({
      name: '🔓 Logout from GitHub',
      value: 'logout',
      description: `Currently logged in as ${username || 'unknown'}`,
    });
    choices.push({
      name: '🔄 Switch account',
      value: 'switch',
      description: 'Logout and login with a different account',
    });
  } else {
    choices.push({
      name: '🔐 Login to GitHub',
      value: 'login',
      description: 'Authenticate using browser',
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
    name: `${c('dim', '← Back to main menu')}`,
    value: 'back',
  });

  const choice = await select<AuthMenuChoice>({
    message: 'GitHub Authentication:',
    choices,
    pageSize: 10,
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
  console.log(`  ${bold('🔓 GitHub Logout')}`);
  console.log(
    `  ${dim('Currently logged in as:')} ${c('cyan', status.username || 'unknown')}`
  );
  console.log();

  const result = await oauthLogout();

  if (result.success) {
    console.log(`  ${c('green', '✓')} Successfully logged out`);
  } else {
    console.log(
      `  ${c('red', '✗')} Logout failed: ${result.error || 'Unknown error'}`
    );
  }
  console.log();

  await pressEnterToContinue();
  return result.success;
}

/**
 * Run auth flow (login/logout menu)
 */
async function runAuthFlow(): Promise<void> {
  await loadInquirer();

  // Section header
  console.log();
  console.log(c('blue', '━'.repeat(66)));
  console.log(`  🔐 ${bold('GitHub Authentication')}`);
  console.log(c('blue', '━'.repeat(66)));
  console.log();

  // Auth menu loop
  let inAuthMenu = true;
  while (inAuthMenu) {
    const status = getAuthStatus();

    // Show current status
    if (status.authenticated) {
      console.log(
        `  ${c('green', '✓')} Logged in as ${c('cyan', status.username || 'unknown')}`
      );
      console.log(
        `  ${dim('Source:')} ${formatTokenSource(status.tokenSource || 'none')}`
      );
      if (status.tokenExpired) {
        console.log(
          `  ${c('yellow', '⚠')} Token has expired - please login again`
        );
      }
    } else {
      console.log(`  ${c('yellow', '⚠')} Not authenticated`);
    }
    console.log(`  ${dim('Credentials:')} ${getStoragePath()}`);
    console.log();

    const choice = await showAuthMenu(status.authenticated, status.username);

    switch (choice) {
      case 'login':
        await runLoginFlow();
        break;

      case 'logout':
        await runLogoutFlow();
        break;

      case 'switch':
        console.log();
        console.log(`  ${dim('Logging out...')}`);
        await oauthLogout();
        console.log(`  ${c('green', '✓')} Logged out`);
        console.log();
        await runLoginFlow();
        break;

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
export async function handleMenuChoice(choice: MenuChoice): Promise<boolean> {
  switch (choice) {
    case 'install':
      await runInstallFlow();
      return true;

    case 'auth':
      await runAuthFlow();
      return true;

    case 'skills':
      await runSkillsMenu();
      return true;

    case 'conf':
      await runConfigOptionsFlow();
      return true;

    case 'external-mcp':
      await runExternalMCPFlow();
      return true;

    case 'exit':
      printGoodbye();
      return false;

    default:
      return true;
  }
}

/**
 * Run the interactive menu loop
 */
export async function runMenuLoop(): Promise<void> {
  // Environment check is done once at startup (in index.ts)
  // This loop just handles menu navigation

  let firstRun = true;
  let running = true;

  while (running) {
    // Clear screen and show welcome when returning to menu (not on first run)
    if (!firstRun) {
      clearScreen();
      printWelcome();
    }
    firstRun = false;

    // Get unified app state (refreshed on each iteration)
    const state = getAppState();

    const choice = await showMainMenu(state);
    running = await handleMenuChoice(choice);
  }
}
