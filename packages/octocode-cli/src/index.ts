/**
 * 🐙 Octocode CLI
 *
 * Interactive CLI to install and configure octocode-mcp for IDEs.
 *
 * Supports:
 * - Cursor IDE
 * - Claude Desktop
 * - Mac and Windows
 *
 * Usage:
 *   npx octocode-cli           Interactive mode
 *   npx octocode-cli --help    Show all commands
 */

import { c, bold, dim } from './utils/colors.js';
import { clearScreen } from './utils/platform.js';
import { loadInquirer } from './utils/prompts.js';
import { printWelcome, printGoodbye } from './ui/header.js';
import { Spinner } from './utils/spinner.js';
import {
  checkAndPrintEnvironmentWithLoader,
  printNodeDoctorHint,
  hasEnvironmentIssues,
} from './ui/install/index.js';
import { runMenuLoop } from './ui/menu.js';
import { runCLI } from './cli/index.js';

// ─────────────────────────────────────────────────────────────
// Interactive Mode
// ─────────────────────────────────────────────────────────────

/**
 * Print the environment check section header
 */
function printEnvHeader(): void {
  console.log(c('blue', '━'.repeat(66)));
  console.log(`  🔍 ${bold('Environment')}`);
  console.log(c('blue', '━'.repeat(66)));
}

async function runInteractiveMode(): Promise<void> {
  // Load inquirer dynamically (with loading indicator)
  const loadingSpinner = new Spinner('  Starting...').start();
  await loadInquirer();
  loadingSpinner.clear();

  // Clear screen and show welcome
  clearScreen();
  printWelcome();

  // Environment check section
  printEnvHeader();

  const envStatus = await checkAndPrintEnvironmentWithLoader();

  // Show node-doctor hint if issues detected
  if (hasEnvironmentIssues(envStatus)) {
    console.log();
    console.log(
      `  ${dim('💡')} ${dim('Run')} ${c('cyan', 'npx node-doctor')} ${dim('for diagnostics')}`
    );
  }

  // Fatal check: Node.js is required
  if (!envStatus.nodeInstalled) {
    console.log();
    console.log(
      `  ${c('red', '✗')} ${bold('Node.js is required to run octocode-mcp')}`
    );
    printNodeDoctorHint();
    printGoodbye();
    return;
  }

  // Go to menu loop
  await runMenuLoop();
}

// ─────────────────────────────────────────────────────────────
// Main Entry Point
// ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Check for CLI commands first
  const handled = await runCLI();

  if (handled) {
    return; // CLI command was executed
  }

  // No CLI command - run interactive mode
  await runInteractiveMode();
}

// Handle termination signals gracefully
function handleTermination(): void {
  // Restore cursor visibility in case spinner was active
  process.stdout.write('\x1B[?25h');
  console.log();
  console.log(dim('  Goodbye! 👋'));
  process.exit(0);
}

// Handle Ctrl+C (SIGINT)
process.on('SIGINT', handleTermination);

// Handle SIGTERM
process.on('SIGTERM', handleTermination);

main().catch(err => {
  // Handle Ctrl+C during prompts gracefully
  if (err?.name === 'ExitPromptError') {
    console.log();
    console.log(dim('  Goodbye! 👋'));
    process.exit(0);
  }
  console.error('Error:', err);
  process.exit(1);
});
