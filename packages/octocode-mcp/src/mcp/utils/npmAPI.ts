import { getNPMUserDetails } from '../../npm/api.js';

/**
 * NPM API utilities for managing NPM availability and authentication
 * Similar to githubAPI.ts pattern but for NPM operations
 */

let npmConnectionStatus: boolean | null = null;

/**
 * Check if NPM is available and connected
 * Caches the result to avoid repeated checks
 */
export async function isNPMEnabled(): Promise<boolean> {
  // Return cached result if available
  if (npmConnectionStatus !== null) {
    return npmConnectionStatus;
  }

  try {
    const npmDetails = await getNPMUserDetails();
    npmConnectionStatus = npmDetails.npmConnected;
    return npmConnectionStatus;
  } catch (error) {
    npmConnectionStatus = false;
    return false;
  }
}

/**
 * Force refresh of NPM connection status
 * Useful when NPM configuration might have changed
 */
export async function refreshNPMStatus(): Promise<boolean> {
  npmConnectionStatus = null;
  return await isNPMEnabled();
}

/**
 * Reset NPM connection status cache
 * Useful for testing or when connection state needs to be re-evaluated
 */
export function resetNPMStatus(): void {
  npmConnectionStatus = null;
}
