/**
 * Sensitive data pattern detection regexes
 * @module security/regexes
 *
 * Re-exports from modular category files .
 * For new code, prefer importing from specific category modules:
 *
 * @example
 * // Import specific categories
 * import { aiProviderPatterns } from './regexes/ai-providers.js';
 * import { awsPatterns } from './regexes/cloud-infrastructure.js';
 *
 * // Or import everything
 * import { allRegexPatterns } from './regexes/index.js';
 */

export * from './regexes/index.js';
