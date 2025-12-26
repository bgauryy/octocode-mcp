/**
 * Main Menu UI
 */

import { c, bold, dim } from '../utils/colors.js';
import {
  loadInquirer,
  select,
  Separator,
  confirm,
  input,
} from '../utils/prompts.js';
import { clearScreen, HOME } from '../utils/platform.js';
import { runInstallFlow } from './install/index.js';
import { showGitHubAuthGuidance } from './gh-guidance.js';
import { runConfigOptionsFlow } from './config/index.js';
import { printGoodbye, printWelcome } from './header.js';
import { copyDirectory, dirExists, listSubdirectories } from '../utils/fs.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Spinner } from '../utils/spinner.js';

type MenuChoice = 'install' | 'conf' | 'skills' | 'gh-auth' | 'exit';

/**
 * Show main menu and handle selection
 */
export async function showMainMenu(): Promise<MenuChoice> {
  console.log();

  const choice = await select<MenuChoice>({
    message: 'What would you like to do?',
    choices: [
      {
        name: '📦 Install octocode-mcp',
        value: 'install',
        description: 'Install MCP server for Cursor, Claude Desktop, and more',
      },
      {
        name: '📚 Install Skills',
        value: 'skills',
        description: 'Install Octocode skills for Claude Code',
      },
      {
        name: '⚙️  Configure Options',
        value: 'conf',
        description: 'View/edit octocode settings (local tools, timeout, etc.)',
      },
      {
        name: '🔐 Check GitHub authentication',
        value: 'gh-auth',
        description: 'Verify GitHub CLI is installed and authenticated',
      },
      new Separator() as unknown as { name: string; value: MenuChoice },
      {
        name: '🚪 Exit',
        value: 'exit',
        description: 'Quit the application',
      },
      new Separator(' ') as unknown as { name: string; value: MenuChoice },
      new Separator(
        c('magenta', `  ─── 🔍🐙 ${bold('https://octocode.ai')} ───`)
      ) as unknown as { name: string; value: MenuChoice },
    ],
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

/**
 * Install skills
 */
async function installSkills(
  info: ReturnType<typeof getSkillsInfo>
): Promise<void> {
  const { destDir, notInstalled } = info;

  if (notInstalled.length === 0) {
    console.log(`  ${c('green', '✓')} All skills are already installed!`);
    console.log();
    console.log(`  ${bold('Installation path:')}`);
    console.log(`  ${c('cyan', destDir)}`);
    console.log();
    await pressEnterToContinue();
    return;
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

  // Ask user if they want to install
  const shouldInstall = await confirm({
    message: `Install ${notInstalled.length} skill(s)?`,
    default: true,
  });

  if (!shouldInstall) {
    console.log();
    console.log(`  ${dim('Installation cancelled.')}`);
    console.log();
    return;
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
  const info = getSkillsInfo();

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

  // Show submenu
  const choice = await showSkillsMenu(info.notInstalled.length > 0);

  switch (choice) {
    case 'install':
      await installSkills(info);
      break;

    case 'view':
      showSkillsStatus(info);
      await pressEnterToContinue();
      break;

    case 'back':
    default:
      // Just return to main menu
      break;
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

    case 'gh-auth':
      await showGitHubAuthGuidance();
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

    const choice = await showMainMenu();
    running = await handleMenuChoice(choice);
  }
}
