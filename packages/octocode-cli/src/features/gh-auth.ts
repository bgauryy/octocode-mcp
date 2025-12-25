/**
 * GitHub CLI Authentication
 */

import type { GitHubAuthStatus } from '../types/index.js';
import { runCommand, commandExists } from '../utils/shell.js';

/**
 * GitHub CLI download URL
 */
export const GH_CLI_URL = 'https://cli.github.com/';

/**
 * Check if GitHub CLI is installed
 */
export function isGitHubCLIInstalled(): boolean {
  return commandExists('gh');
}

/**
 * Check GitHub CLI authentication status
 */
export function checkGitHubAuth(): GitHubAuthStatus {
  // First check if gh is installed
  if (!isGitHubCLIInstalled()) {
    return {
      installed: false,
      authenticated: false,
      error: 'GitHub CLI (gh) is not installed',
    };
  }

  // Run gh auth status
  const result = runCommand('gh', ['auth', 'status']);

  if (result.success) {
    // Parse the output to get username
    // Output format: "Logged in to github.com account USERNAME (keyring)"
    const usernameMatch = result.stdout.match(
      /Logged in to github\.com.*account\s+(\S+)/i
    );
    const username = usernameMatch ? usernameMatch[1] : undefined;

    return {
      installed: true,
      authenticated: true,
      username,
    };
  }

  // Not authenticated
  return {
    installed: true,
    authenticated: false,
    error: result.stderr || 'Not authenticated',
  };
}

/**
 * Get GitHub CLI version
 */
export function getGitHubCLIVersion(): string | null {
  const result = runCommand('gh', ['--version']);
  if (result.success) {
    // Output: "gh version X.Y.Z (YYYY-MM-DD)"
    const match = result.stdout.match(/gh version ([\d.]+)/);
    return match ? match[1] : result.stdout.split('\n')[0];
  }
  return null;
}

/**
 * Get auth login command
 */
export function getAuthLoginCommand(): string {
  return 'gh auth login';
}

/**
 * Get auth status command
 */
export function getAuthStatusCommand(): string {
  return 'gh auth status';
}
