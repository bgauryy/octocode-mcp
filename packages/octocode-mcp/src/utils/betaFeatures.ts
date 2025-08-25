/**
 * Beta Features Configuration
 * Controls experimental features via environment variables
 */

/**
 * Check if BETA features are enabled
 */
export function isBetaEnabled(): boolean {
  return process.env.BETA === '1' || process.env.BETA?.toLowerCase() === 'true';
}

/**
 * Check if sampling features are enabled (requires BETA=1)
 */
export function isSamplingEnabled(): boolean {
  return isBetaEnabled();
}
