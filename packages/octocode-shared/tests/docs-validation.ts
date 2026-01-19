/**
 * Documentation Validation
 * This file validates that all documented exports exist and have correct types.
 * Run with: npx tsc --noEmit tests/docs-validation.ts
 */

// ============================================================================
// README.md Quick Start Examples Validation
// ============================================================================

// Main entry point imports (README line 19)
import { getCredentials, getConfig, getPlatformName } from '../src/index.js';

// Module-specific imports (README lines 22-25)
import {
  getCredentials as gc,
  storeCredentials,
} from '../src/credentials/index.js';
import { getConfig as gconf, loadConfig } from '../src/config/index.js';
import {
  getSessionId,
  updateSessionStats,
} from '../src/session/index.js';
import { isWindows, isMac, isLinux } from '../src/platform/index.js';

// ============================================================================
// Credentials Module (README lines 35-60)
// ============================================================================
import {
  // storeCredentials - already imported
  // getCredentials - already imported
  getToken,
  deleteCredentials,
  hasCredentials,
} from '../src/credentials/index.js';

// ============================================================================
// Config Module (README lines 68-89)
// ============================================================================
import {
  // getConfig - already imported
  // loadConfig - already imported
  validateConfig,
  resolveConfig,
} from '../src/config/index.js';

// ============================================================================
// Session Module (README lines 97-115)
// ============================================================================
import {
  // getSessionId - already imported
  getOrCreateSession,
  // updateSessionStats - already imported
  incrementToolCalls,
  flushSession,
} from '../src/session/index.js';

// ============================================================================
// Platform Module (README lines 123-143)
// ============================================================================
import {
  // isWindows, isMac, isLinux - already imported
  HOME,
  getAppDataPath,
  // getPlatformName - already imported
  getArchitecture,
} from '../src/platform/index.js';

// ============================================================================
// Type Validation - ensure functions have expected signatures
// ============================================================================

async function validateTypes() {
  // Credentials
  const creds = await getCredentials('github.com');
  const token = await getToken('github.com');
  const exists = await hasCredentials('github.com');
  await deleteCredentials('github.com');

  // Config
  const config = await getConfig();
  const rawConfig = await loadConfig();
  const result = validateConfig(rawConfig.config);

  // Session
  const session = await getOrCreateSession();
  const sessionId = await getSessionId();
  await incrementToolCalls();
  await flushSession();

  // Platform
  const win: boolean = isWindows;
  const mac: boolean = isMac;
  const linux: boolean = isLinux;
  const home: string = HOME;
  const appData = getAppDataPath();
  const platform = getPlatformName();
  const arch = getArchitecture();
}

console.log('Documentation validation complete - all exports exist!');
