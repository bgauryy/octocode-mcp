/**
 * GitHub Authentication Guidance UI
 */

import { c, dim } from '../utils/colors.js';
import { getAuthStatus } from '../features/github-oauth.js';

/**
 * Quick GitHub auth check (for install flow)
 */
export function printGitHubAuthStatus(): void {
  const status = getAuthStatus();

  if (status.authenticated) {
    console.log(
      `  ${c('green', '✓')} GitHub: Authenticated as ${c('cyan', status.username || 'unknown')}`
    );
  } else {
    console.log(
      `  ${c('yellow', '⚠')} GitHub: ${c('yellow', 'not authenticated')}`
    );
    console.log(
      `    ${dim('Use')} ${c('yellow', 'octocode-cli login')} ${dim('or select "Login to GitHub" from menu')}`
    );
  }
}
