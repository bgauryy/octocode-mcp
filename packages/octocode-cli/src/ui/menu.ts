/**
 * Main Menu UI
 */

import { c, bold, dim } from '../utils/colors.js';
import { loadInquirer, select, Separator, input } from '../utils/prompts.js';
import { clearScreen, openInEditor } from '../utils/platform.js';
import { runInstallFlow } from './install/index.js';
import { runConfigOptionsFlow } from './config/index.js';
import { runExternalMCPFlow } from './external-mcp/index.js';
import { runSyncFlow } from './sync/index.js';
import { printGoodbye, printWelcome } from './header.js';
import { Spinner } from '../utils/spinner.js';
import {
  runSkillsMenu,
  getSkillsState,
  type SkillsState,
} from './skills-menu/index.js';
import { runAgentFlow } from './agent/index.js';
import {
  runAIProvidersFlow,
  getCurrentDefaultModel,
} from './ai-providers/index.js';
import {
  getAllClientInstallStatus,
  MCP_CLIENTS,
  type ClientInstallStatus,
} from '../utils/mcp-config.js';
import { detectCurrentClient, getMCPConfigPath } from '../utils/mcp-paths.js';
import {
  login as oauthLogin,
  logout as oauthLogout,
  getAuthStatusAsync,
  getStoragePath,
  isUsingSecureStorage,
  type VerificationInfo,
} from '../features/github-oauth.js';
import type { OctocodeAuthStatus } from '../types/index.js';
import { checkGitHubAuth, runGitHubAuthLogout } from '../features/gh-auth.js';
import { getCredentials } from '../utils/token-storage.js';

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
  | 'agent'
  | 'skills'
  | 'ai-providers'
  | 'auth'
  | 'mcp-config'
  | 'exit';

type OctocodeMenuChoice = 'configure' | 'install' | 'auth' | 'back';

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
 * Get unified application state (async for accurate keyring-first auth check)
 */
async function getAppState(): Promise<AppState> {
  return {
    octocode: getOctocodeState(),
    skills: getSkillsState(),
    currentClient: detectCurrentClient(),
    githubAuth: await getAuthStatusAsync(),
  };
}

/**
 * Get friendly client names for display
 */
function getClientNames(clients: ClientInstallStatus[]): string {
  return clients.map(c => MCP_CLIENTS[c.client]?.name || c.client).join(', ');
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
      description: `All ${skills.installedCount} installed`,
    };
  }

  if (skills.installedCount > 0) {
    return {
      name: '🧠 Manage System Skills',
      value: 'skills',
      description: `${skills.installedCount}/${skills.skills.length} installed`,
    };
  }

  return {
    name: '🧠 Manage System Skills',
    value: 'skills',
    description: `${skills.skills.length} prompts for Claude Code`,
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
    return {
      name: `🔑 GitHub ${c('green', '✓')}`,
      value: 'auth',
      description: `Signed in as @${auth.username || 'unknown'}`,
    };
  }

  return {
    name: '🔑 GitHub',
    value: 'auth',
    description: 'Sign in for private repos',
  };
}

/**
 * Build status line for display
 */
function buildStatusLine(state: AppState): string {
  const parts: string[] = [];

  // Octocode installation status
  if (state.octocode.isInstalled) {
    const clientCount = state.octocode.installedClients.length;
    const clientLabel = clientCount === 1 ? 'client' : 'clients';
    parts.push(`${c('green', '●')} ${clientCount} ${clientLabel}`);
  } else {
    parts.push(`${c('yellow', '○')} Not installed`);
  }

  // Skills status
  if (state.skills.sourceExists && state.skills.hasSkills) {
    if (state.skills.installedCount > 0) {
      parts.push(`${c('green', '●')} ${state.skills.installedCount} skills`);
    } else {
      parts.push(`${c('yellow', '○')} ${state.skills.skills.length} skills`);
    }
  }

  // AI model status
  const currentModel = getCurrentDefaultModel();
  if (currentModel) {
    parts.push(`${c('green', '●')} ${c('cyan', currentModel)}`);
  }

  return parts.join(dim('  │  '));
}

/**
 * Build Octocode menu item based on state
 */
function buildOctocodeMenuItem(state: AppState): {
  name: string;
  value: MenuChoice;
  description: string;
} {
  if (state.octocode.isInstalled) {
    const clientCount = state.octocode.installedClients.length;
    const clientLabel = clientCount === 1 ? 'IDE' : 'IDEs';
    return {
      name: `🐙 Octocode Configuration ${c('green', '✓')}`,
      value: 'octocode',
      description: `${clientCount} ${clientLabel} configured`,
    };
  }

  return {
    name: `🐙 ${bold('Octocode Configuration')}`,
    value: 'octocode',
    description: 'Install & configure MCP server',
  };
}

/**
 * Show main menu and handle selection
 * @param state - Unified application state
 */
export async function showMainMenu(state: AppState): Promise<MenuChoice> {
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

  // ─── AGENT ───
  choices.push({
    name: '🤖 Run Agent',
    value: 'agent',
    description: 'AI agent with Octocode tools',
  });

  // ─── SKILLS ───
  choices.push(buildSkillsMenuItem(state.skills));

  // ─── AI PROVIDERS ───
  const currentModel = getCurrentDefaultModel();
  choices.push({
    name: '🧪 AI Provider Settings',
    value: 'ai-providers',
    description: currentModel ? `${currentModel}` : 'Configure AI models',
  });

  // ─── MCP CONFIGURATION ───
  choices.push({
    name: '⚡ Manage System MCP',
    value: 'mcp-config',
    description: 'Sync, marketplace & config files',
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
        name: '📦 Add to IDE',
        value: 'install',
        description: availableNames,
      });
    }
  } else {
    // Install is the main action when not installed
    choices.push({
      name: `📦 ${bold('Install')}`,
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

  // ─── GITHUB AUTH ───
  const authItem = buildAuthMenuItem(state.githubAuth);
  choices.push({
    name: authItem.name,
    value: 'auth',
    description: authItem.description,
  });

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

  const choice = await select<OctocodeMenuChoice>({
    message: 'Octocode Configuration:',
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

/**
 * Run Octocode submenu flow
 */
async function runOctocodeFlow(): Promise<void> {
  await loadInquirer();

  // Section header
  console.log();
  console.log(c('blue', '━'.repeat(66)));
  console.log(`  🐙 ${bold('Octocode Configuration')}`);
  console.log(c('blue', '━'.repeat(66)));
  console.log();

  let inMenu = true;
  while (inMenu) {
    // Refresh state on each iteration
    const state = await getAppState();

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

      case 'auth':
        await runAuthFlow();
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

type MCPConfigChoice = 'sync' | 'marketplace' | 'open-config' | 'back';

/**
 * Get config file info for display
 */
function getConfigFileInfo(): Array<{
  client: string;
  name: string;
  path: string;
  exists: boolean;
  hasOctocode: boolean;
}> {
  const allClients = getAllClientInstallStatus();
  return allClients
    .filter(c => c.configExists)
    .map(c => ({
      client: c.client,
      name: MCP_CLIENTS[c.client]?.name || c.client,
      path: getMCPConfigPath(c.client),
      exists: c.configExists,
      hasOctocode: c.octocodeInstalled,
    }));
}

/**
 * Display config files section
 */
function displayConfigFiles(): void {
  const configs = getConfigFileInfo();

  if (configs.length === 0) {
    console.log(`  ${dim('No MCP config files found')}`);
    console.log();
    return;
  }

  console.log(`  ${dim('Config Files:')}`);
  for (const config of configs) {
    const status = config.hasOctocode ? c('green', '●') : c('yellow', '○');
    const ideName = c('cyan', config.name);
    console.log(`  ${status} ${ideName}`);
    console.log(`    ${dim(config.path)}`);
  }
  console.log();
}

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
    name: '🔄 Sync Configurations',
    value: 'sync',
    description: 'Sync MCP configs across all IDEs',
  });

  choices.push({
    name: '🔌 MCP Marketplace',
    value: 'marketplace',
    description: '70+ community servers',
  });

  const configs = getConfigFileInfo();
  if (configs.length > 0) {
    choices.push({
      name: '📂 Open Config File',
      value: 'open-config',
      description: `${configs.length} config file${configs.length > 1 ? 's' : ''} available`,
    });
  }

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

  const choice = await select<MCPConfigChoice>({
    message: 'Manage System MCP:',
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

type ConfigFileChoice = string | 'back';

/**
 * Show config file selection menu
 */
async function showConfigFileMenu(): Promise<ConfigFileChoice> {
  const configs = getConfigFileInfo();

  const choices: Array<{
    name: string;
    value: ConfigFileChoice;
    description?: string;
  }> = [];

  for (const config of configs) {
    const status = config.hasOctocode ? c('green', '✓') : '';
    choices.push({
      name: `📄 ${config.name} ${status}`,
      value: config.path,
      description: config.path,
    });
  }

  choices.push(
    new Separator() as unknown as {
      name: string;
      value: ConfigFileChoice;
      description?: string;
    }
  );

  choices.push({
    name: `${c('dim', '← Back')}`,
    value: 'back',
  });

  const choice = await select<ConfigFileChoice>({
    message: 'Select config file to open:',
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

type EditorChoice = 'cursor' | 'vscode' | 'default' | 'back';

/**
 * Show editor selection menu
 */
async function showEditorMenu(filePath: string): Promise<void> {
  const choices: Array<{
    name: string;
    value: EditorChoice;
    description?: string;
  }> = [
    {
      name: '📝 Open in Cursor',
      value: 'cursor',
      description: 'Open with Cursor IDE',
    },
    {
      name: '📝 Open in VS Code',
      value: 'vscode',
      description: 'Open with Visual Studio Code',
    },
    {
      name: '📄 Open in Default App',
      value: 'default',
      description: 'Open with system default',
    },
  ];

  choices.push(
    new Separator() as unknown as {
      name: string;
      value: EditorChoice;
      description?: string;
    }
  );

  choices.push({
    name: `${c('dim', '← Back')}`,
    value: 'back',
  });

  const choice = await select<EditorChoice>({
    message: 'Open with:',
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

  if (choice === 'back') {
    return;
  }

  const success = openInEditor(filePath, choice);
  if (success) {
    console.log();
    console.log(`  ${c('green', '✓')} Opened ${filePath}`);
  } else {
    console.log();
    console.log(`  ${c('yellow', '⚠')} Could not open file automatically`);
    console.log(`  ${dim('Try opening manually:')} ${c('cyan', filePath)}`);
  }
  console.log();
  await pressEnterToContinue();
}

/**
 * Run MCP configuration flow (submenu)
 */
async function runMCPConfigFlow(): Promise<void> {
  await loadInquirer();

  // Section header
  console.log();
  console.log(c('blue', '━'.repeat(66)));
  console.log(`  ⚡ ${bold('Manage System MCP')}`);
  console.log(c('blue', '━'.repeat(66)));
  console.log();

  // Display config files
  displayConfigFiles();

  let inMenu = true;
  while (inMenu) {
    const choice = await showMCPConfigMenu();

    switch (choice) {
      case 'sync':
        await runSyncFlow();
        console.log();
        // Re-display config files after sync
        displayConfigFiles();
        break;

      case 'marketplace':
        await runExternalMCPFlow();
        console.log();
        break;

      case 'open-config': {
        const configChoice = await showConfigFileMenu();
        if (configChoice !== 'back') {
          await showEditorMenu(configChoice);
        }
        break;
      }

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
  | 'logout'
  | 'switch'
  | 'use-octocode'
  | 'use-gh'
  | 'gh-logout'
  | 'back';

/**
 * Show auth submenu with accurate state
 */
async function showAuthMenu(
  status: OctocodeAuthStatus,
  _octocodeCredentialsExist: boolean
): Promise<AuthMenuChoice> {
  const choices: Array<{
    name: string;
    value: AuthMenuChoice;
    description?: string;
  }> = [];

  const ghAuth = checkGitHubAuth();
  const hasGhToken = ghAuth.authenticated;
  const isUsingOctocode = status.tokenSource === 'octocode';
  const isUsingGhCli = status.tokenSource === 'gh-cli';
  const isAuthenticated = status.authenticated;

  if (isAuthenticated) {
    // === SIGN OUT ===
    if (isUsingOctocode) {
      choices.push({
        name: '🔓 Sign Out',
        value: 'logout',
        description: 'Sign out of GitHub',
      });
    }

    if (isUsingGhCli) {
      choices.push({
        name: '🔓 Sign Out (gh CLI)',
        value: 'gh-logout',
        description: 'Opens gh auth logout',
      });
    }

    // === SWITCH ACCOUNT ===
    if (isUsingOctocode) {
      choices.push({
        name: '🔄 Switch Account',
        value: 'switch',
        description: 'Sign in with a different GitHub account',
      });
    }

    // === ALTERNATIVE AUTH SOURCES ===
    // Show option to use gh CLI if available and using octocode
    if (isUsingOctocode && hasGhToken) {
      choices.push({
        name: `🔀 Use gh CLI Instead`,
        value: 'use-gh',
        description: `Switch to @${ghAuth.username || 'unknown'}`,
      });
    }

    // Show option to login with Octocode if using gh-cli
    if (isUsingGhCli) {
      choices.push({
        name: '🔐 Sign in with Octocode',
        value: 'use-octocode',
        description: 'Store credentials separately',
      });
    }
  } else {
    // === NOT AUTHENTICATED ===
    choices.push({
      name: '🔐 Sign in to GitHub',
      value: 'login',
      description: 'Opens browser to authenticate',
    });

    // If gh CLI is available, show option to use it
    if (hasGhToken) {
      choices.push({
        name: `🔗 Use gh CLI (@${ghAuth.username || 'unknown'})`,
        value: 'use-gh',
        description: 'Already authenticated via terminal',
      });
    }
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

/**
 * Display auth status details
 */
function displayAuthStatus(status: OctocodeAuthStatus): void {
  const ghAuth = checkGitHubAuth();

  if (status.authenticated) {
    console.log(
      `  ${c('green', '✓')} Signed in as ${c('cyan', '@' + (status.username || 'unknown'))}`
    );

    // Show auth method in simple terms
    if (status.tokenSource === 'gh-cli') {
      console.log(`  ${dim('Via:')} GitHub CLI (gh)`);
    } else {
      const storageType = isUsingSecureStorage()
        ? 'keychain'
        : 'encrypted file';
      console.log(`  ${dim('Via:')} Octocode (${storageType})`);
    }

    if (status.tokenExpired) {
      console.log(
        `  ${c('yellow', '⚠')} Session expired - please sign in again`
      );
    }

    // Show if alternative auth is available
    if (status.tokenSource === 'octocode' && ghAuth.authenticated) {
      console.log(
        `  ${dim('Also available:')} gh CLI (@${ghAuth.username || 'unknown'})`
      );
    }
  } else {
    console.log(`  ${c('yellow', '○')} Not signed in`);
    console.log(`  ${dim('Sign in to access private repositories')}`);

    // Show if gh CLI is available
    if (ghAuth.authenticated) {
      console.log(
        `  ${dim('Tip:')} gh CLI detected (@${ghAuth.username || 'unknown'})`
      );
    }
  }
  console.log();
}

/**
 * Run auth flow (login/logout menu)
 */
async function runAuthFlow(): Promise<void> {
  await loadInquirer();

  // Section header
  console.log();
  console.log(c('blue', '━'.repeat(66)));
  console.log(`  🔑 ${bold('GitHub Account')}`);
  console.log(c('blue', '━'.repeat(66)));
  console.log();

  // Auth menu loop
  let inAuthMenu = true;
  while (inAuthMenu) {
    // Get fresh status (async for accurate keyring check)
    const status = await getAuthStatusAsync();

    // Check if octocode credentials exist (separately from current token source)
    const octocodeCredentials = await getCredentials();
    const octocodeCredentialsExist = octocodeCredentials !== null;

    // Show current status with details
    displayAuthStatus(status);

    const choice = await showAuthMenu(status, octocodeCredentialsExist);

    switch (choice) {
      case 'login':
        await runLoginFlow();
        console.log();
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

      case 'switch':
        console.log();
        console.log(`  ${dim('Signing out...')}`);
        await oauthLogout();
        console.log(`  ${c('green', '✓')} Signed out`);
        console.log();
        await runLoginFlow();
        console.log();
        break;

      case 'use-octocode':
        // Login with Octocode (new login flow)
        await runLoginFlow();
        console.log();
        break;

      case 'use-gh': {
        // Switch to gh CLI
        const ghAuth = checkGitHubAuth();
        if (status.tokenSource === 'octocode') {
          console.log();
          console.log(`  ${dim('Switching to gh CLI...')}`);
          await oauthLogout();
        }
        console.log();
        console.log(
          `  ${c('green', '✓')} Now using gh CLI (@${ghAuth.username || 'unknown'})`
        );
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
export async function handleMenuChoice(choice: MenuChoice): Promise<boolean> {
  switch (choice) {
    case 'octocode':
      await runOctocodeFlow();
      return true;

    case 'agent':
      await runAgentFlow();
      return true;

    case 'skills':
      await runSkillsMenu();
      return true;

    case 'ai-providers':
      await runAIProvidersFlow();
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

    // Get unified app state (refreshed on each iteration for accurate auth status)
    const state = await getAppState();

    const choice = await showMainMenu(state);
    running = await handleMenuChoice(choice);
  }
}
