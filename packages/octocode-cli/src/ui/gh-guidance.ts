/**
 * GitHub CLI Guidance UI
 */

import { c, bold, dim } from '../utils/colors.js';
import {
  checkGitHubAuth,
  getGitHubCLIVersion,
  GH_CLI_URL,
  getAuthLoginCommand,
} from '../features/gh-auth.js';
import { loadInquirer, select } from '../utils/prompts.js';

/**
 * Show GitHub auth status and guidance
 */
export async function showGitHubAuthGuidance(): Promise<void> {
  await loadInquirer();

  console.log();
  console.log(c('blue', '━'.repeat(66)));
  console.log(`  🔐 ${bold('GitHub CLI Authentication')}`);
  console.log(c('blue', '━'.repeat(66)));
  console.log();

  const status = checkGitHubAuth();

  if (!status.installed) {
    // GitHub CLI not installed
    console.log(
      `  ${c('red', '✗')} GitHub CLI (gh) is ${c('red', 'not installed')}`
    );
    console.log();
    console.log(
      `  ${bold('Option 1: Install GitHub CLI')} ${dim('(Recommended)')}`
    );
    console.log(`    ${c('cyan', '→')} Visit: ${c('underscore', GH_CLI_URL)}`);
    console.log();
    console.log(`    ${dim('macOS:')}     ${c('yellow', 'brew install gh')}`);
    console.log(
      `    ${dim('Windows:')}   ${c('yellow', 'winget install GitHub.cli')}`
    );
    console.log(`    ${dim('Linux:')}     ${c('yellow', 'See ' + GH_CLI_URL)}`);
    console.log();
    console.log(`  ${bold('Option 2: Set GITHUB_TOKEN')}`);
    console.log(`    ${dim('Add to your MCP config env section:')}`);
    console.log(`    ${c('yellow', '"GITHUB_TOKEN": "ghp_your_token_here"')}`);
    console.log();
    console.log(
      `    ${dim('Get a token at:')} ${c('underscore', 'https://github.com/settings/tokens')}`
    );
    console.log();

    await promptContinue();
    return;
  }

  // GitHub CLI is installed
  const version = getGitHubCLIVersion();
  console.log(
    `  ${c('green', '✓')} GitHub CLI is ${c('green', 'installed')}` +
      (version ? dim(` (v${version})`) : '')
  );

  if (status.authenticated) {
    // Authenticated
    console.log(
      `  ${c('green', '✓')} Authenticated as ${c('cyan', status.username || 'unknown')}`
    );
    console.log();
    console.log(
      `  ${c('green', '✓')} ${bold("You're all set!")} Octocode can access GitHub.`
    );
  } else {
    // Not authenticated
    console.log(`  ${c('yellow', '⚠')} ${c('yellow', 'Not authenticated')}`);
    console.log();
    console.log(
      `  ${bold('Option 1: Login with GitHub CLI')} ${dim('(Recommended)')}`
    );
    console.log(
      `    ${c('cyan', '→')} Run: ${c('yellow', getAuthLoginCommand())}`
    );
    console.log();
    console.log(
      `    ${dim('This will open a browser to authenticate with GitHub.')}`
    );
    console.log();
    console.log(`  ${bold('Option 2: Set GITHUB_TOKEN')}`);
    console.log(`    ${dim('Add to your MCP config env section:')}`);
    console.log(`    ${c('yellow', '"GITHUB_TOKEN": "ghp_your_token_here"')}`);
    console.log();
    console.log(
      `    ${dim('Get a token at:')} ${c('underscore', 'https://github.com/settings/tokens')}`
    );
  }

  console.log();
  await promptContinue();
}

/**
 * Quick GitHub auth check (for install flow)
 */
export function printGitHubAuthStatus(): void {
  const status = checkGitHubAuth();

  if (!status.installed) {
    console.log(
      `  ${c('yellow', '⚠')} GitHub: ${c('yellow', 'gh CLI not found')}`
    );
    console.log(
      `    ${c('yellow', 'Authenticate using gh CLI')} (${c('underscore', GH_CLI_URL)}) ${c('yellow', 'OR use GITHUB_TOKEN configuration')}`
    );
  } else if (!status.authenticated) {
    console.log(
      `  ${c('yellow', '⚠')} GitHub CLI not authenticated - run ${c('yellow', getAuthLoginCommand())}`
    );
    console.log(`      ${dim('or set GITHUB_TOKEN in MCP config')}`);
  } else {
    console.log(
      `  ${c('green', '✓')} GitHub: Authenticated as ${c('cyan', status.username || 'unknown')}`
    );
  }
}

async function promptContinue(): Promise<void> {
  await select({
    message: 'Press Enter to continue...',
    choices: [{ name: '→ Continue', value: 'continue' }],
  });
}
