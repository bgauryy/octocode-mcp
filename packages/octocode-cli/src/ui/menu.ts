/**
 * Main Menu UI
 */

import { c, bold, dim } from '../utils/colors.js';
import { loadInquirer, select, Separator, input } from '../utils/prompts.js';
import { clearScreen, HOME } from '../utils/platform.js';
import { runInstallFlow } from './install/index.js';
import { runConfigOptionsFlow } from './config/index.js';
import { printGoodbye, printWelcome } from './header.js';
import { copyDirectory, dirExists, listSubdirectories } from '../utils/fs.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Spinner } from '../utils/spinner.js';
import {
  getAllClientInstallStatus,
  MCP_CLIENTS,
  type ClientInstallStatus,
} from '../utils/mcp-config.js';
import { detectCurrentClient } from '../utils/mcp-paths.js';
import { checkGitHubAuth } from '../features/gh-auth.js';
import type { GitHubAuthStatus } from '../types/index.js';

type MenuChoice = 'install' | 'conf' | 'skills' | 'exit';

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
  githubAuth: GitHubAuthStatus;
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
    githubAuth: checkGitHubAuth(),
  };
}

/**
 * Get friendly client names for display
 */
function getClientNames(clients: ClientInstallStatus[]): string {
  return clients.map(c => MCP_CLIENTS[c.client]?.name || c.client).join(', ');
}

/**
 * Format path for display (shorten home directory)
 */
function formatPath(p: string): string {
  if (p.startsWith(HOME)) {
    return '~' + p.slice(HOME.length);
  }
  return p;
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
    // No skills available from source
    return {
      name: '📚 Skills',
      value: 'skills',
      description: 'No skills available',
    };
  }

  if (skills.allInstalled) {
    // All skills installed - show path
    return {
      name: `📚 Skills ${c('green', '✓')}`,
      value: 'skills',
      description: formatPath(skills.destDir),
    };
  }

  if (skills.installedCount > 0) {
    // Some installed, some not
    return {
      name: '📚 Skills',
      value: 'skills',
      description: `${skills.installedCount} installed, ${skills.notInstalledCount} available`,
    };
  }

  // None installed
  return {
    name: '📚 Install Skills',
    value: 'skills',
    description: 'Install Octocode skills for Claude Code',
  };
}

/**
 * Show main menu and handle selection
 * @param state - Unified application state
 */
export async function showMainMenu(state: AppState): Promise<MenuChoice> {
  // Show status header
  if (state.octocode.isInstalled) {
    const names = getClientNames(state.octocode.installedClients);
    console.log(`  ${c('green', '✓')} Installed in: ${c('cyan', names)}`);
  }

  // Show GitHub auth status
  if (state.githubAuth.authenticated) {
    console.log(
      `  ${c('green', '✓')} GitHub: ${c('cyan', state.githubAuth.username || 'authenticated')}`
    );
  } else if (state.githubAuth.installed) {
    console.log(
      `  ${c('yellow', '⚠')} GitHub: ${c('yellow', 'not authenticated')}`
    );
  } else {
    console.log(
      `  ${c('yellow', '⚠')} GitHub CLI: ${c('yellow', 'not installed')}`
    );
  }

  // Build menu choices based on state
  const choices: Array<{
    name: string;
    value: MenuChoice;
    description?: string;
  }> = [];

  if (state.octocode.isInstalled) {
    // Octocode IS installed - show Configure Options first
    choices.push({
      name: '⚙️  Configure Options',
      value: 'conf',
    });

    // Only show install option if there are more clients available
    if (state.octocode.hasMoreToInstall) {
      const availableNames = getClientNames(state.octocode.availableClients);
      choices.push({
        name: '📦 Install to more clients',
        value: 'install',
        description: `Available: ${availableNames}`,
      });
    }
  } else {
    // Octocode is NOT installed - show Install as only primary option
    choices.push({
      name: '📦 Install octocode-mcp',
      value: 'install',
      description: 'Install MCP server for Cursor, Claude Desktop, and more',
    });
    // Don't show Configure Options - nothing to configure yet
  }

  // Skills menu item - shows state-appropriate label and description
  choices.push(buildSkillsMenuItem(state.skills));

  // Separators and exit
  choices.push(
    new Separator() as unknown as {
      name: string;
      value: MenuChoice;
    }
  );
  choices.push({
    name: '🚪 Exit',
    value: 'exit',
    description: 'Quit the application',
  });
  choices.push(
    new Separator(' ') as unknown as {
      name: string;
      value: MenuChoice;
    }
  );
  choices.push(
    new Separator(
      `  ${c('yellow', 'For checking node status in your system use')} ${c('cyan', 'npx node-doctor')}`
    ) as unknown as { name: string; value: MenuChoice }
  );
  choices.push(
    new Separator(
      c('magenta', `  ─── 🔍🐙 ${bold('https://octocode.ai')} ───`)
    ) as unknown as { name: string; value: MenuChoice }
  );

  console.log();
  const choice = await select<MenuChoice>({
    message: 'What would you like to do?',
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
 */
function getSkillsDestDir(): string {
  return path.join(HOME, '.claude', 'skills');
}

type SkillsMenuChoice = 'install' | 'view' | 'back';

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
  hasUninstalled: boolean
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
    const choice = await showSkillsMenu(info.notInstalled.length > 0);

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

    case 'skills':
      await runSkillsFlow();
      return true;

    case 'conf':
      await runConfigOptionsFlow();
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
