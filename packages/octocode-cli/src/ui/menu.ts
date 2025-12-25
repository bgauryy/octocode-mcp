/**
 * Main Menu UI
 */

import { c, bold } from '../utils/colors.js';
import { select, Separator } from '../utils/prompts.js';
import { clearScreen } from '../utils/platform.js';
import { runInstallFlow } from './install/index.js';
import { showGitHubAuthGuidance } from './gh-guidance.js';
import { printGoodbye, printWelcome } from './header.js';

type MenuChoice = 'install' | 'gh-auth' | 'exit';

/**
 * Show main menu and handle selection
 */
export async function showMainMenu(): Promise<MenuChoice> {
  console.log();

  const choice = await select<MenuChoice>({
    message: 'What would you like to do?',
    choices: [
      {
        name: '📦 Configure octocode-mcp',
        value: 'install',
        description: 'Configure MCP server for Cursor or Claude Desktop',
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
 * Handle menu selection
 */
export async function handleMenuChoice(choice: MenuChoice): Promise<boolean> {
  switch (choice) {
    case 'install':
      await runInstallFlow();
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
