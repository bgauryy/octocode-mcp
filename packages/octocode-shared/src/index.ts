/**
 * Octocode Shared
 *
 * Shared utilities for Octocode packages:
 * - Credential management with keytar and encrypted file storage
 * - Platform detection utilities
 * - Session persistence
 * - Global configuration (~/.octocode/.octocoderc)
 */

// Re-export everything from credentials
export * from './credentials/index.js';

// Re-export everything from platform
export * from './platform/index.js';

// Re-export everything from session
export * from './session/index.js';

// Re-export everything from config
export * from './config/index.js';
