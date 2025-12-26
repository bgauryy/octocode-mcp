/**
 * Main Menu UI
 */

import { c, bold, dim } from '../utils/colors.js';
import { select, Separator } from '../utils/prompts.js';
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
 */
function getSkillsSourceDir(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, '..', '..', 'skills');
}

/**
 * Get Claude skills destination directory
 */
function getSkillsDestDir(): string {
  return path.join(HOME, '.claude', 'skills');
}

/**
 * Run skills installation flow
 */
async function runSkillsFlow(): Promise<void> {
  const srcDir = getSkillsSourceDir();
  const destDir = getSkillsDestDir();

  console.log();
  console.log(`  ${bold('📚 Octocode Skills')}`);
  console.log();

  if (!dirExists(srcDir)) {
    console.log(`  ${c('yellow', '⚠')} Skills directory not found.`);
    console.log(`  ${dim('This may happen if running from source.')}`);
    console.log();
    return;
  }

  const availableSkills = listSubdirectories(srcDir).filter(
    name => !name.startsWith('.')
  );

  if (availableSkills.length === 0) {
    console.log(`  ${dim('No skills available.')}`);
    console.log();
    return;
  }

  // Show available skills
  console.log(`  ${bold('Available skills:')}`);
  console.log();

  for (const skill of availableSkills) {
    const installed = dirExists(path.join(destDir, skill));
    const status = installed ? c('green', '✓ installed') : dim('not installed');
    console.log(`    ${c('cyan', '•')} ${skill} ${status}`);
  }

  console.log();

  // Ask to install
  const installChoice = await select<'install' | 'back'>({
    message: 'What would you like to do?',
    choices: [
      {
        name: '📥 Install all skills',
        value: 'install',
        description: `Copy skills to ${destDir}`,
      },
      {
        name: '← Back to menu',
        value: 'back',
      },
    ],
    theme: {
      prefix: '  ',
      style: {
        highlight: (text: string) => c('magenta', text),
        message: (text: string) => bold(text),
      },
    },
  });

  if (installChoice === 'back') {
    return;
  }

  // Install skills
  const spinner = new Spinner('Installing skills...').start();
  let installed = 0;

  for (const skill of availableSkills) {
    const skillSrc = path.join(srcDir, skill);
    const skillDest = path.join(destDir, skill);

    if (copyDirectory(skillSrc, skillDest)) {
      installed++;
    }
  }

  spinner.succeed('Skills installed!');
  console.log();
  console.log(`  ${c('green', '✓')} Installed ${installed} skill(s)`);
  console.log(`  ${dim('Location:')} ${destDir}`);
  console.log();
  console.log(`  ${bold('Skills are now available in Claude Code!')}`);
  console.log();
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
