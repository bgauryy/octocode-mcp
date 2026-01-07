/**
 * Native Keychain Access
 *
 * Cross-platform secure credential storage using native OS keychains.
 * Replaces keytar with direct OS command execution for better maintainability.
 *
 * Supported platforms:
 * - macOS: Uses `security` CLI (Keychain Access)
 * - Linux: Falls back to file storage (libsecret not implemented)
 * - Windows: Falls back to file storage (wincred not implemented)
 */

import { execSync, spawnSync } from 'node:child_process';
import { platform } from 'node:os';

const EXEC_TIMEOUT = 3000; // 3 second timeout

/**
 * Check if native keychain is available on this platform
 */
export function isKeychainAvailable(): boolean {
  const os = platform();

  if (os === 'darwin') {
    // Check if security command is available
    try {
      execSync('which security', { timeout: 1000, stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  // Linux and Windows: not implemented yet, use file fallback
  return false;
}

/**
 * Store a password in the system keychain
 * @param service - Service name (app identifier)
 * @param account - Account identifier (e.g., hostname)
 * @param password - Password/data to store
 */
export async function setPassword(
  service: string,
  account: string,
  password: string
): Promise<void> {
  const os = platform();

  if (os === 'darwin') {
    await setPasswordMacOS(service, account, password);
    return;
  }

  throw new Error(`Keychain not supported on ${os}`);
}

/**
 * Get a password from the system keychain
 * @param service - Service name (app identifier)
 * @param account - Account identifier (e.g., hostname)
 * @returns Password/data or null if not found
 */
export async function getPassword(
  service: string,
  account: string
): Promise<string | null> {
  const os = platform();

  if (os === 'darwin') {
    return getPasswordMacOS(service, account);
  }

  return null;
}

/**
 * Delete a password from the system keychain
 * @param service - Service name (app identifier)
 * @param account - Account identifier (e.g., hostname)
 * @returns true if deleted, false if not found
 */
export async function deletePassword(
  service: string,
  account: string
): Promise<boolean> {
  const os = platform();

  if (os === 'darwin') {
    return deletePasswordMacOS(service, account);
  }

  return false;
}

/**
 * Find all credentials for a service
 * @param service - Service name (app identifier)
 * @returns Array of {account, password} objects
 */
export async function findCredentials(
  service: string
): Promise<{ account: string; password: string }[]> {
  const os = platform();

  if (os === 'darwin') {
    return findCredentialsMacOS(service);
  }

  return [];
}

// ============================================================================
// macOS Implementation using `security` CLI
// ============================================================================

async function setPasswordMacOS(
  service: string,
  account: string,
  password: string
): Promise<void> {
  // First try to delete existing entry (ignore errors if not found)
  try {
    await deletePasswordMacOS(service, account);
  } catch {
    // Ignore - entry may not exist
  }

  // Add new entry
  // Using -U to update if exists (shouldn't happen after delete, but safe)
  const result = spawnSync(
    'security',
    [
      'add-generic-password',
      '-s',
      service,
      '-a',
      account,
      '-w',
      password,
      '-U',
    ],
    {
      timeout: EXEC_TIMEOUT,
      stdio: 'pipe',
      encoding: 'utf8',
    }
  );

  if (result.error) {
    throw new Error(`Failed to store password: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.toString() || '';
    throw new Error(`Failed to store password: ${stderr}`);
  }
}

async function getPasswordMacOS(
  service: string,
  account: string
): Promise<string | null> {
  const result = spawnSync(
    'security',
    ['find-generic-password', '-s', service, '-a', account, '-w'],
    {
      timeout: EXEC_TIMEOUT,
      stdio: 'pipe',
      encoding: 'utf8',
    }
  );

  if (result.error) {
    // Timeout or other execution error
    return null;
  }

  if (result.status !== 0) {
    // Password not found (exit code 44) or other error
    return null;
  }

  // Remove trailing newline
  return result.stdout?.toString().trim() || null;
}

async function deletePasswordMacOS(
  service: string,
  account: string
): Promise<boolean> {
  const result = spawnSync(
    'security',
    ['delete-generic-password', '-s', service, '-a', account],
    {
      timeout: EXEC_TIMEOUT,
      stdio: 'pipe',
      encoding: 'utf8',
    }
  );

  if (result.error) {
    return false;
  }

  // Exit code 0 = deleted, 44 = not found
  return result.status === 0;
}

async function findCredentialsMacOS(
  service: string
): Promise<{ account: string; password: string }[]> {
  // Use `security dump-keychain` and parse output
  // This dumps all items, so we filter by service
  const result = spawnSync('security', ['dump-keychain'], {
    timeout: EXEC_TIMEOUT * 2, // May take longer for large keychains
    stdio: 'pipe',
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large keychains
  });

  if (result.error || result.status !== 0) {
    return [];
  }

  const output = result.stdout?.toString() || '';
  const credentials: { account: string; password: string }[] = [];

  // Parse the dump-keychain output
  // Format is series of "keychain:" blocks with "attributes:" containing "svce" and "acct"
  const blocks = output.split('keychain:');

  for (const block of blocks) {
    // Check if this is a generic password for our service
    if (!block.includes('"genp"')) continue; // genp = generic password

    // Extract service name
    const serviceMatch = block.match(/"svce"<blob>="([^"]+)"/);
    if (!serviceMatch || serviceMatch[1] !== service) continue;

    // Extract account name
    const accountMatch = block.match(/"acct"<blob>="([^"]+)"/);
    if (!accountMatch) continue;

    const account = accountMatch[1];

    // Get the actual password value
    try {
      const password = await getPasswordMacOS(service, account);
      if (password) {
        credentials.push({ account, password });
      }
    } catch {
      // Skip entries we can't read
    }
  }

  return credentials;
}
