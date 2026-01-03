/**
 * Main Menu UI
 */

import { c, bold, dim } from '../utils/colors.js';
import { loadInquirer, select, Separator, input } from '../utils/prompts.js';
import {
  clearScreen,
  HOME,
  isWindows,
  getAppDataPath,
} from '../utils/platform.js';
import { runInstallFlow } from './install/index.js';
import { runConfigOptionsFlow } from './config/index.js';
import { runExternalMCPFlow } from './external-mcp/index.js';
import { printGoodbye, printWelcome } from './header.js';
import {
  copyDirectory,
  dirExists,
  listSubdirectories,
  removeDirectory,
} from '../utils/fs.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Spinner } from '../utils/spinner.js';
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
import type { OctocodeAuthStatus } from '../types/index.js';

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
 * Skill installation info
 */
interface SkillInfo {
  name: string;
  installed: boolean;
  srcPath: string;
  destPath: string;
}

/**
 * Skills state
 */
interface SkillsState {
  sourceExists: boolean;
  destDir: string;
  skills: SkillInfo[];
  installedCount: number;
  notInstalledCount: number;
  allInstalled: boolean;
  hasSkills: boolean;
}

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
 * Get skills state
 */
function getSkillsState(): SkillsState {
  const srcDir = getSkillsSourceDir();
  const destDir = getSkillsDestDir();

  if (!dirExists(srcDir)) {
    return {
      sourceExists: false,
      destDir,
      skills: [],
      installedCount: 0,
      notInstalledCount: 0,
      allInstalled: false,
      hasSkills: false,
    };
  }

  const availableSkills = listSubdirectories(srcDir).filter(
    name => !name.startsWith('.')
  );

  const skills: SkillInfo[] = availableSkills.map(skill => ({
    name: skill,
    installed: dirExists(path.join(destDir, skill)),
    srcPath: path.join(srcDir, skill),
    destPath: path.join(destDir, skill),
  }));

  const installedCount = skills.filter(s => s.installed).length;
  const notInstalledCount = skills.filter(s => !s.installed).length;

  return {
    sourceExists: true,
    destDir,
    skills,
    installedCount,
    notInstalledCount,
    allInstalled: notInstalledCount === 0 && skills.length > 0,
    hasSkills: skills.length > 0,
  };
}

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
    return {
      name: `🔑 GitHub Account ${c('green', '✓')}`,
      value: 'auth',
      description: `@${auth.username || 'connected'}`,
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
    statusParts.push(
      `${c('green', '✓')} @${c('cyan', state.githubAuth.username || 'github')}`
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

type SkillsMenuChoice = 'install' | 'uninstall' | 'view' | 'back';

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

/**
 * Show skills submenu
 */
async function showSkillsMenu(
  hasUninstalled: boolean,
  hasInstalled: boolean
): Promise<SkillsMenuChoice> {
  const choices: Array<{
    name: string;
    value: SkillsMenuChoice;
    description?: string;
  }> = [];

  if (hasUninstalled) {
    choices.push({
      name: '📥 Install skills',
      value: 'install',
      description: 'Install Octocode skills to Claude Code',
    });
  }

  if (hasInstalled) {
    choices.push({
      name: '🗑️  Uninstall skills',
      value: 'uninstall',
      description: 'Remove installed Octocode skills',
    });
  }

  choices.push({
    name: '📋 View skills status',
    value: 'view',
    description: 'Show installed and available skills',
  });

  choices.push(
    new Separator() as unknown as {
      name: string;
      value: SkillsMenuChoice;
      description?: string;
    }
  );

  choices.push({
    name: `${c('dim', '← Back to main menu')}`,
    value: 'back',
  });

  const choice = await select<SkillsMenuChoice>({
    message: 'Skills Options:',
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
 * Get skills status info
 */
function getSkillsInfo(): {
  srcDir: string;
  destDir: string;
  skillsStatus: Array<{
    name: string;
    installed: boolean;
    srcPath: string;
    destPath: string;
  }>;
  notInstalled: Array<{
    name: string;
    installed: boolean;
    srcPath: string;
    destPath: string;
  }>;
  sourceExists: boolean;
} {
  const srcDir = getSkillsSourceDir();
  const destDir = getSkillsDestDir();

  if (!dirExists(srcDir)) {
    return {
      srcDir,
      destDir,
      skillsStatus: [],
      notInstalled: [],
      sourceExists: false,
    };
  }

  const availableSkills = listSubdirectories(srcDir).filter(
    name => !name.startsWith('.')
  );

  const skillsStatus = availableSkills.map(skill => ({
    name: skill,
    installed: dirExists(path.join(destDir, skill)),
    srcPath: path.join(srcDir, skill),
    destPath: path.join(destDir, skill),
  }));

  const notInstalled = skillsStatus.filter(s => !s.installed);

  return { srcDir, destDir, skillsStatus, notInstalled, sourceExists: true };
}

/**
 * Show skills status
 */
function showSkillsStatus(info: ReturnType<typeof getSkillsInfo>): void {
  const { destDir, skillsStatus, notInstalled } = info;

  if (skillsStatus.length === 0) {
    console.log(`  ${dim('No skills available.')}`);
    console.log();
    return;
  }

  // Show skills and their status
  console.log(`  ${bold('Skills:')}`);
  console.log();
  for (const skill of skillsStatus) {
    if (skill.installed) {
      console.log(
        `    ${c('green', '✓')} ${skill.name} - ${c('green', 'installed')}`
      );
    } else {
      console.log(
        `    ${c('yellow', '○')} ${skill.name} - ${dim('not installed')}`
      );
    }
  }
  console.log();

  // Show installation path
  console.log(`  ${bold('Installation path:')}`);
  console.log(`  ${c('cyan', destDir)}`);
  console.log();

  // Summary
  if (notInstalled.length === 0) {
    console.log(`  ${c('green', '✓')} All skills are installed!`);
  } else {
    console.log(
      `  ${c('yellow', 'ℹ')} ${notInstalled.length} skill(s) not installed`
    );
  }
  console.log();
}

type InstallSkillsChoice = 'install' | 'back';
type UninstallSkillsChoice = 'uninstall' | 'back';

/**
 * Install skills
 * Returns true if installation was performed, false if user went back
 */
async function installSkills(
  info: ReturnType<typeof getSkillsInfo>
): Promise<boolean> {
  const { destDir, notInstalled } = info;

  if (notInstalled.length === 0) {
    console.log(`  ${c('green', '✓')} All skills are already installed!`);
    console.log();
    console.log(`  ${bold('Installation path:')}`);
    console.log(`  ${c('cyan', destDir)}`);
    console.log();
    await pressEnterToContinue();
    return true;
  }

  // Show what will be installed
  console.log(`  ${bold('Skills to install:')}`);
  console.log();
  for (const skill of notInstalled) {
    console.log(`    ${c('yellow', '○')} ${skill.name}`);
  }
  console.log();
  console.log(`  ${bold('Installation path:')}`);
  console.log(`  ${c('cyan', destDir)}`);
  console.log();

  // Ask user if they want to install with back option
  const choice = await select<InstallSkillsChoice>({
    message: `Install ${notInstalled.length} skill(s)?`,
    choices: [
      {
        name: `${c('green', '✓')} Yes, install skills`,
        value: 'install' as const,
      },
      new Separator() as unknown as {
        name: string;
        value: InstallSkillsChoice;
      },
      {
        name: `${c('dim', '← Back to skills menu')}`,
        value: 'back' as const,
      },
    ],
    loop: false,
  });

  if (choice === 'back') {
    return false;
  }

  // Install skills
  console.log();
  const spinner = new Spinner('Installing skills...').start();
  let installedCount = 0;
  const failed: string[] = [];

  for (const skill of notInstalled) {
    if (copyDirectory(skill.srcPath, skill.destPath)) {
      installedCount++;
    } else {
      failed.push(skill.name);
    }
  }

  if (failed.length === 0) {
    spinner.succeed('Skills installed!');
  } else {
    spinner.warn('Some skills failed to install');
  }

  console.log();
  if (installedCount > 0) {
    console.log(`  ${c('green', '✓')} Installed ${installedCount} skill(s)`);
    console.log(`  ${dim('Location:')} ${c('cyan', destDir)}`);
  }
  if (failed.length > 0) {
    console.log(`  ${c('red', '✗')} Failed: ${failed.join(', ')}`);
  }
  console.log();

  if (installedCount > 0) {
    console.log(`  ${bold('Skills are now available in Claude Code!')}`);
    console.log();
  }

  await pressEnterToContinue();
  return true;
}

/**
 * Uninstall skills
 * Returns true if uninstallation was performed, false if user went back
 */
async function uninstallSkills(
  info: ReturnType<typeof getSkillsInfo>
): Promise<boolean> {
  const { destDir, skillsStatus } = info;
  const installed = skillsStatus.filter(s => s.installed);

  if (installed.length === 0) {
    console.log(`  ${c('yellow', '⚠')} No skills are installed.`);
    console.log();
    await pressEnterToContinue();
    return false;
  }

  // Show what will be uninstalled
  console.log(`  ${bold('Skills to uninstall:')}`);
  console.log();
  for (const skill of installed) {
    console.log(`    ${c('yellow', '○')} ${skill.name}`);
  }
  console.log();
  console.log(`  ${bold('Installation path:')}`);
  console.log(`  ${c('cyan', destDir)}`);
  console.log();

  // Ask user if they want to uninstall with back option
  const choice = await select<UninstallSkillsChoice>({
    message: `Uninstall ${installed.length} skill(s)?`,
    choices: [
      {
        name: `${c('red', '🗑️')} Yes, uninstall skills`,
        value: 'uninstall' as const,
      },
      new Separator() as unknown as {
        name: string;
        value: UninstallSkillsChoice;
      },
      {
        name: `${c('dim', '← Back to skills menu')}`,
        value: 'back' as const,
      },
    ],
    loop: false,
  });

  if (choice === 'back') {
    return false;
  }

  // Uninstall skills
  console.log();
  const spinner = new Spinner('Uninstalling skills...').start();
  let uninstalledCount = 0;
  const failed: string[] = [];

  for (const skill of installed) {
    if (removeDirectory(skill.destPath)) {
      uninstalledCount++;
    } else {
      failed.push(skill.name);
    }
  }

  if (failed.length === 0) {
    spinner.succeed('Skills uninstalled!');
  } else {
    spinner.warn('Some skills failed to uninstall');
  }

  console.log();
  if (uninstalledCount > 0) {
    console.log(
      `  ${c('green', '✓')} Uninstalled ${uninstalledCount} skill(s)`
    );
    console.log(`  ${dim('Location:')} ${c('cyan', destDir)}`);
  }
  if (failed.length > 0) {
    console.log(`  ${c('red', '✗')} Failed: ${failed.join(', ')}`);
  }
  console.log();

  await pressEnterToContinue();
  return true;
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

// ============================================================================
// Skills Flow
// ============================================================================

/**
 * Run skills installation flow
 */
async function runSkillsFlow(): Promise<void> {
  await loadInquirer();

  // Section header
  console.log();
  console.log(c('blue', '━'.repeat(66)));
  console.log(`  📚 ${bold('Octocode Skills for Claude Code')}`);
  console.log(c('blue', '━'.repeat(66)));
  console.log();

  // Get skills info
  let info = getSkillsInfo();

  // Handle source not found
  if (!info.sourceExists) {
    console.log(`  ${c('yellow', '⚠')} Skills source directory not found.`);
    console.log(`  ${dim('This may happen if running from source.')}`);
    console.log();
    await pressEnterToContinue();
    return;
  }

  // Handle no skills available
  if (info.skillsStatus.length === 0) {
    console.log(`  ${dim('No skills available.')}`);
    console.log();
    await pressEnterToContinue();
    return;
  }

  // Skills menu loop - allows going back from install
  let inSkillsMenu = true;
  while (inSkillsMenu) {
    // Refresh skills info on each iteration
    info = getSkillsInfo();

    // Show submenu
    const hasUninstalled = info.notInstalled.length > 0;
    const hasInstalled = info.skillsStatus.filter(s => s.installed).length > 0;
    const choice = await showSkillsMenu(hasUninstalled, hasInstalled);

    switch (choice) {
      case 'install': {
        const installed = await installSkills(info);
        // If user went back, stay in skills menu
        // If installed, also stay in skills menu to show updated status
        if (installed) {
          // Refresh and continue showing menu
          continue;
        }
        break;
      }

      case 'uninstall': {
        const uninstalled = await uninstallSkills(info);
        // If user went back, stay in skills menu
        // If uninstalled, also stay in skills menu to show updated status
        if (uninstalled) {
          // Refresh and continue showing menu
          continue;
        }
        break;
      }

      case 'view':
        showSkillsStatus(info);
        await pressEnterToContinue();
        break;

      case 'back':
      default:
        // Exit skills menu and return to main menu
        inSkillsMenu = false;
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
      await runSkillsFlow();
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
