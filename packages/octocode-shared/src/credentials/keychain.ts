/**
 * Native Keychain Access
 *
 * Cross-platform secure credential storage using @napi-rs/keyring.
 * This wraps the Rust keyring-rs library via napi-rs for native OS keychain access.
 *
 * Supported platforms (prebuilt binaries):
 * - macOS: Keychain Access (darwin-arm64, darwin-x64)
 * - Windows: Credential Manager (win32-x64, win32-arm64, win32-ia32)
 * - Linux: Secret Service API via libsecret (linux-x64-gnu, linux-x64-musl, linux-arm64-gnu, etc.)
 * - FreeBSD: Secret Service API
 *
 * This replaces the previous custom implementation with a battle-tested library,
 * following the same pattern as gh CLI's use of zalando/go-keyring.
 */

import {
  AsyncEntry,
  findCredentialsAsync,
  type Credential,
} from '@napi-rs/keyring';

/**
 * Check if native keychain is available on this platform.
 * With @napi-rs/keyring, this is always true since it has prebuilt binaries
 * for all supported platforms.
 */
export function isKeychainAvailable(): boolean {
  // @napi-rs/keyring has prebuilt binaries for all major platforms
  // If the import succeeded (no error above), keychain is available
  return true;
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
  const entry = new AsyncEntry(service, account);
  await entry.setPassword(password);
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
  try {
    const entry = new AsyncEntry(service, account);
    const result = await entry.getPassword();
    return result ?? null;
  } catch {
    // Entry not found or other error
    return null;
  }
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
  try {
    const entry = new AsyncEntry(service, account);
    return await entry.deleteCredential();
  } catch {
    // Entry not found or other error
    return false;
  }
}

/**
 * Find all credentials for a service
 * @param service - Service name (app identifier)
 * @returns Array of {account, password} objects
 */
export async function findCredentials(
  service: string
): Promise<{ account: string; password: string }[]> {
  try {
    const credentials: Credential[] = await findCredentialsAsync(service);
    return credentials;
  } catch {
    // Error listing credentials
    return [];
  }
}
