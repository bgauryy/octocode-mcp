/**
 * Platform Detection & Utilities
 *
 * Cross-platform utilities for octocode packages.
 */

import os from 'node:os';
import path from 'node:path';

// ============================================================================
// Platform Detection
// ============================================================================

/** Check if running on Windows */
export const isWindows: boolean = os.platform() === 'win32';

/** Check if running on macOS */
export const isMac: boolean = os.platform() === 'darwin';

/** Check if running on Linux */
export const isLinux: boolean = os.platform() === 'linux';

/** User's home directory */
export const HOME: string = os.homedir();

/**
 * Get the AppData path on Windows, HOME on other platforms
 */
export function getAppDataPath(): string {
  if (isWindows) {
    return process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming');
  }
  return HOME;
}

/**
 * Get the local AppData path on Windows, HOME on other platforms
 */
export function getLocalAppDataPath(): string {
  if (isWindows) {
    return process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local');
  }
  return HOME;
}

/**
 * Get platform name for display
 */
export function getPlatformName(): string {
  if (isMac) return 'macOS';
  if (isWindows) return 'Windows';
  if (isLinux) return 'Linux';
  return os.platform();
}

/**
 * Get architecture for display
 */
export function getArchitecture(): string {
  return os.arch();
}
