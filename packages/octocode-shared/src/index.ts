/**
 * Octocode Shared
 *
 * Shared utilities for Octocode packages:
 * - Credential management with keytar and encrypted file storage
 * - Platform detection utilities
 * - Session persistence
 * - Global configuration (~/.octocode/.octocoderc)
 */

export * from './credentials/index.js';
export * from './platform/index.js';
export * from './session/index.js';
export * from './config/index.js';
export * from './logger/index.js';
export * from './paths.js';
export * from './fs-utils.js';
