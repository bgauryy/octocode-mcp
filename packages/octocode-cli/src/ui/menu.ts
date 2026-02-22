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
import { runOctocodeSkillsFlow } from './skills-menu/marketplace.js';
import { getAppState, type AppState, type SkillsState } from './state.js';
import { MCP_CLIENTS, type ClientInstallStatus } from '../utils/mcp-config.js';
import {
  login as oauthLogin,
  logout as oauthLogout,
  getAuthStatusAsync,
  getStoragePath,
  type VerificationInfo,
} from '../features/github-oauth.js';
import type { OctocodeAuthStatus } from '../types/index.js';
import {
  checkGitHubAuth,
  runGitHubAuthLogout,
  getGitHubCLIToken,
} from '../features/gh-auth.js';
import { getCredentials, hasEnvToken } from '../utils/token-storage.js';
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

type MenuChoice =
  | 'octocode'
  | 'octocode-skills'
  | 'skills'
  | 'auth'
  | 'mcp-config'
  | 'exit';

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
      description: `${skills.totalInstalledCount} installed • Research, PR Review & more`,
    };
  }

  if (skills.totalInstalledCount > 0) {
    return {
      name: '🧠 Manage System Skills',
      value: 'skills',
      description: `${skills.totalInstalledCount}/${skills.skills.length} installed • Get more skills!`,
    };
  }

  // No skills installed - encourage installation
  return {
    name: `🧠 ${bold('Manage System Skills')} ${c('cyan', '★')}`,
    value: 'skills',
    description: `${c('cyan', '→')} Install skills for AI-powered coding workflows`,
  };
}

/**
 * Build Octocode Skills menu item
 * Shows ✓ if any octocode skills are installed
 */
function buildOctocodeSkillsMenuItem(skills: SkillsState): {
  name: string;
  value: MenuChoice;
  description: string;
} {
  // Check if any octocode-* skills are installed
  const octocodeSkillsInstalled = skills.skills.filter(
    s => s.name.startsWith('octocode-') && s.installed
  ).length;

  if (octocodeSkillsInstalled > 0) {
    return {
      name: `🐙 Octocode Skills ${c('green', '✓')}`,
      value: 'octocode-skills',
      description: `${octocodeSkillsInstalled} installed • Research, planning & review`,
    };
  }

  return {
    name: '🐙 Octocode Skills',
    value: 'octocode-skills',
    description: 'Install AI-powered research, planning & review skills',
  };
}

/**
 * Get human-readable auth source name
 */
function getAuthSourceDisplay(auth: OctocodeAuthStatus): string {
  switch (auth.tokenSource) {
    case 'gh-cli':
      return 'gh CLI';
    case 'env': {
      // Show which env var is being used (e.g., "env:GH_TOKEN" → "GH_TOKEN")
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

/**
 * Build auth menu item based on state
 */
function buildAuthMenuItem(auth: OctocodeAuthStatus): {
  name: string;
  value: MenuChoice;
  description: string;
} {
  if (auth.authenticated) {
    const source = getAuthSourceDisplay(auth);
    const user = auth.username ? `@${auth.username}` : '';
    const userPart = user ? `${user} ` : '';
    return {
      name: `🔑 Manage Auth ${c('green', '✓')}`,
      value: 'auth',
      description: `${userPart}via ${source}`,
    };
  }

  // Not authenticated - show prominent indicator with call to action
  return {
    name: `🔑 ${bold('Manage Auth')} ${c('red', '✗ Required!')}`,
    value: 'auth',
    description: `${c('yellow', '→')} Sign in to access GitHub`,
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
 * Print contextual hints based on app state
 * Guides users to set up auth and use best practices
 */
function printContextualHints(state: AppState): void {
  // ─── AUTH HINT (Priority 1) ───
  if (!state.githubAuth.authenticated) {
    console.log();
    console.log(
      `  ${c('yellow', '⚠')} ${bold('Auth required!')} Run ${c('cyan', '🔑 Manage Auth')} to access GitHub repos`
    );
  } else if (
    state.octocode.isInstalled &&
    state.skills.totalInstalledCount === 0
  ) {
    // ─── SKILLS HINT (Priority 2) ───
    console.log();
    console.log(
      `  ${c('cyan', '💡')} ${dim('Boost your AI coding:')} Install ${c('magenta', 'Skills')} for research, PR review & more!`
    );
  }

  // ─── QUICK HINTS (always show, yellow) ───
  console.log();
  console.log(`  ${c('yellow', 'Hints:')}`);
  console.log(
    c('yellow', `     ▸ Prompts:  Use /research, /plan, /implement in chat`)
  );
  console.log(
    c('yellow', `     ▸ Skills:   Add via 🐙 Octocode Skills in main menu`)
  );
  console.log(
    c(
      'yellow',
      `     ▸ Context:  Add AGENTS.md to your project (you can ask octocode)`
    )
  );
  console.log(
    c(
      'yellow',
      `     ▸ Auth:     Supports Octocode OAuth and gh CLI (if installed)`
    )
  );
  console.log(
    c(
      'yellow',
      `     ▸ MCP:      Manage all system MCP servers via Manage System MCP`
    )
  );
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

  // Show contextual hints and tips
  printContextualHints(state);

  // Build menu choices based on state
  const choices: Array<{
    name: string;
    value: MenuChoice;
    description?: string;
  }> = [];

  // ─── OCTOCODE ───
  choices.push(buildOctocodeMenuItem(state));

  // ─── OCTOCODE SKILLS ───
  choices.push(buildOctocodeSkillsMenuItem(state.skills));

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
  let state = await getAppState();

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
      state = await getAppState();
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

type AuthMenuChoice = 'login' | 'gh-guidance' | 'logout' | 'gh-logout' | 'back';

/**
 * Show auth menu - directly shows all relevant options
 * No intermediate "Manage Tokens" step - everything in one menu
 */
async function showAuthMenu(
  status: OctocodeAuthStatus
): Promise<AuthMenuChoice> {
  const choices: Array<{
    name: string;
    value: AuthMenuChoice;
    description?: string;
  }> = [];

  const isUsingEnv = status.tokenSource === 'env';

  // Check what auth methods are available (independent of current active source)
  const ghCliToken = getGitHubCLIToken();
  const ghAuth = checkGitHubAuth();
  const octocodeCredentials = await getCredentials();

  const hasGhCli = !!ghCliToken;
  const hasOctocode = !!octocodeCredentials;
  const hasEnv = hasEnvToken();

  // ─── Show env var info if using env (can't delete) ───
  if (isUsingEnv && hasEnv) {
    const envVar =
      status.envTokenSource?.replace('env:', '') || 'environment variable';
    choices.push({
      name: `ℹ️  Using ${c('cyan', envVar)} ${dim('(takes priority)')}`,
      value: 'back', // No action, just info
      description: 'Token set via environment variable',
    });

    choices.push(
      new Separator() as unknown as {
        name: string;
        value: AuthMenuChoice;
        description?: string;
      }
    );
  }

  // ─── Show delete options for available tokens ───
  if (hasGhCli) {
    const userPart = ghAuth.username ? ` (@${ghAuth.username})` : '';
    choices.push({
      name: `🗑️  Delete gh CLI token${userPart}`,
      value: 'gh-logout',
      description: 'Opens gh auth logout',
    });
  }

  if (hasOctocode) {
    const userPart = octocodeCredentials.username
      ? ` (@${octocodeCredentials.username})`
      : '';
    const storageType = 'file';
    choices.push({
      name: `🗑️  Delete Octocode token${userPart}`,
      value: 'logout',
      description: `Remove from ${storageType}`,
    });
  }

  // ─── Show sign-in options for methods not yet configured ───
  if (!hasOctocode) {
    choices.push({
      name: `🔐 Sign In via Octocode ${c('green', '(Recommended)')}`,
      value: 'login',
      description: 'Quick browser sign in',
    });
  }

  if (!hasGhCli) {
    choices.push({
      name: '🔐 Sign In via gh CLI',
      value: 'gh-guidance',
      description: ghAuth.installed
        ? 'Use existing GitHub CLI'
        : 'GitHub CLI not installed',
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
 * Run the login flow with enhanced progress indication
 */
async function runLoginFlow(): Promise<boolean> {
  console.log();
  console.log(c('blue', '━'.repeat(66)));
  console.log(`  ${bold('🔐 GitHub Authentication')}`);
  console.log(c('blue', '━'.repeat(66)));
  console.log();
  console.log(
    `  ${dim('This will open your browser to authenticate with GitHub.')}`
  );
  console.log();

  let verificationShown = false;
  let authSpinner: Spinner | null = null;
  const spinner = new Spinner('Connecting to GitHub...').start();

  const result = await oauthLogin({
    onVerification: (verification: VerificationInfo) => {
      spinner.stop();
      verificationShown = true;

      // Clear visual box for the code
      console.log();
      console.log(c('yellow', '  ┌' + '─'.repeat(50) + '┐'));
      console.log(
        c('yellow', '  │ ') +
          `${c('yellow', '!')} Your one-time code: ${bold(c('cyan', verification.user_code))}` +
          ' '.repeat(50 - 26 - verification.user_code.length) +
          c('yellow', '│')
      );
      console.log(c('yellow', '  └' + '─'.repeat(50) + '┘'));
      console.log();
      console.log(`  ${bold('1.')} Copy the code above`);
      console.log(
        `  ${bold('2.')} ${bold('Press Enter')} to open ${c('cyan', verification.verification_uri)}`
      );
      console.log(`  ${bold('3.')} Paste the code in your browser`);
      console.log();

      // Start a progress spinner with helpful context
      authSpinner = new Spinner(
        `Waiting for browser authentication... ${dim('(typically 10-30 seconds)')}`
      ).start();
    },
  });

  // Stop any running spinner
  if (authSpinner) {
    (authSpinner as Spinner).stop();
  }
  if (!verificationShown) {
    spinner.stop();
  }

  console.log();
  if (result.success) {
    console.log(c('green', '  ┌' + '─'.repeat(50) + '┐'));
    console.log(
      c('green', '  │ ') +
        `${c('green', '✓')} ${bold('Authentication successful!')}` +
        ' '.repeat(22) +
        c('green', '│')
    );
    console.log(c('green', '  └' + '─'.repeat(50) + '┘'));
    console.log();
    console.log(
      `  ${c('green', '✓')} Logged in as ${c('cyan', '@' + (result.username || 'unknown'))}`
    );
    console.log(`  ${dim('Credentials stored in:')} ${getStoragePath()}`);
    console.log();
    console.log(`  ${c('cyan', '💡')} ${bold("What's next?")}`);
    console.log(
      `     ${dim('•')} Install ${c('magenta', 'Skills')} for AI-powered research & PR reviews`
    );
    console.log(
      `     ${dim('•')} Use ${c('cyan', '/research')} prompt to explore any GitHub repo`
    );
    console.log(
      `     ${dim('•')} Add ${c('cyan', 'AGENTS.md')} to your project for better AI context`
    );
  } else {
    console.log(c('red', '  ┌' + '─'.repeat(50) + '┐'));
    console.log(
      c('red', '  │ ') +
        `${c('red', '✗')} ${bold('Authentication failed')}` +
        ' '.repeat(27) +
        c('red', '│')
    );
    console.log(c('red', '  └' + '─'.repeat(50) + '┘'));
    console.log();
    console.log(`  ${c('red', 'Error:')} ${result.error || 'Unknown error'}`);
    console.log();
    console.log(`  ${bold('Troubleshooting:')}`);
    console.log(`     ${dim('•')} Make sure you copied the code correctly`);
    console.log(`     ${dim('•')} Check your browser didn't block the popup`);
    console.log(
      `     ${dim('•')} Try running ${c('cyan', 'octocode login')} again`
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
  const status = await getAuthStatusAsync();

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
        name: ' Open GitHub CLI website',
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

/**
 * Display auth status - clean, simple status line
 */
/**
 * Get detailed auth source for display
 */
function getDetailedAuthSource(status: OctocodeAuthStatus): string {
  switch (status.tokenSource) {
    case 'gh-cli':
      return 'gh CLI';
    case 'env': {
      // Show which env var (e.g., "env:GH_TOKEN" → "GH_TOKEN")
      if (status.envTokenSource) {
        const varName = status.envTokenSource.replace('env:', '');
        return `${varName} env var`;
      }
      return 'environment variable';
    }
    case 'octocode':
      return 'file';
    default:
      return 'unknown';
  }
}

function displayAuthStatus(status: OctocodeAuthStatus): void {
  console.log(`  ${bold('🔐 GitHub Authentication')}`);
  console.log();

  if (status.authenticated) {
    const source = getDetailedAuthSource(status);

    // For env tokens, we can't get username, so show different message
    if (status.tokenSource === 'env') {
      const envVarName = status.envTokenSource
        ? status.envTokenSource.replace('env:', '')
        : 'environment variable';
      console.log(
        `  ${c('green', '✓')} Using ${c('cyan', envVarName)} ${dim('(token configured)')}`
      );
    } else {
      console.log(
        `  ${c('green', '✓')} Signed in as ${c('cyan', '@' + (status.username || 'unknown'))} ${dim(`via ${source}`)}`
      );
    }

    if (status.tokenExpired) {
      console.log(
        `  ${c('yellow', '⚠')} Session expired - please sign in again`
      );
    }

    // Success tips
    console.log();
    console.log(
      `  ${c('green', '✓')} ${dim('Ready to access GitHub repositories!')}`
    );
  } else {
    // Not authenticated - prominent warning with instructions
    console.log(c('yellow', '  ┌' + '─'.repeat(56) + '┐'));
    console.log(
      c('yellow', '  │ ') +
        `${c('yellow', '⚠')} ${bold('Authentication Required')}` +
        ' '.repeat(31) +
        c('yellow', '│')
    );
    console.log(c('yellow', '  └' + '─'.repeat(56) + '┘'));
    console.log();
    console.log(`  ${dim('Without auth, Octocode cannot:')}`);
    console.log(`     ${c('red', '✗')} Access private repositories`);
    console.log(`     ${c('red', '✗')} Search code in your organization`);
    console.log(
      `     ${c('red', '✗')} Provide full GitHub research capabilities`
    );
    console.log();
    console.log(
      `  ${c('cyan', '→')} Select ${c('green', '"Sign In via Octocode"')} below to authenticate`
    );
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
    const status = await getAuthStatusAsync();

    // Show current status
    displayAuthStatus(status);

    const choice = await showAuthMenu(status);

    switch (choice) {
      case 'login': {
        const success = await runLoginFlow();
        console.log();
        if (success) {
          inAuthMenu = false;
        }
        break;
      }

      case 'gh-guidance':
        await showGhCliGuidance();
        break;

      case 'logout':
        await runLogoutFlow();
        console.log();
        break;

      case 'gh-logout': {
        // Confirm before deleting
        const confirmGh = await selectWithCancel<'yes' | 'no'>({
          message: 'Sign out of gh CLI?',
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

        if (confirmGh !== 'yes') {
          break;
        }

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

    case 'octocode-skills':
      await runOctocodeSkillsFlow();
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
      state = await getAppState();
    } else {
      const spinner = new Spinner('  Loading...').start();
      state = await getAppState();
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
