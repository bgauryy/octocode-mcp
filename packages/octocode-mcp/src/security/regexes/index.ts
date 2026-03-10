/**
 * Sensitive data pattern detection regexes
 * Split into category modules for maintainability
 */

import type { SensitiveDataPattern } from './types.js';

// Re-export types
export type { SensitiveDataPattern } from './types.js';

export { aiProviderPatterns } from './ai-providers.js';
export { awsPatterns } from './aws.js';
export { analyticsModernPatterns } from './analytics.js';
export { cloudProviderPatterns } from './cloudProviders.js';
export { databasePatterns } from './databases.js';
export {
  authPatterns,
  codeConfigPatterns,
  cryptographicPatterns,
  privateKeyPatterns,
  genericSecretPatterns,
} from './auth-crypto.js';
export { developerToolsPatterns } from './devTools.js';
export { versionControlPatterns } from './vcs.js';
export { mappingMonitoringPatterns } from './monitoring.js';
export {
  paymentProviderPatterns,
  ecommerceContentPatterns,
} from './payments-commerce.js';
export {
  slackPatterns,
  socialMediaPatterns,
  shippingLogisticsPatterns,
} from './communications.js';

import { aiProviderPatterns } from './ai-providers.js';
import { awsPatterns } from './aws.js';
import { analyticsModernPatterns } from './analytics.js';
import { cloudProviderPatterns } from './cloudProviders.js';
import { databasePatterns } from './databases.js';
import {
  authPatterns,
  codeConfigPatterns,
  cryptographicPatterns,
  privateKeyPatterns,
  genericSecretPatterns,
} from './auth-crypto.js';
import { developerToolsPatterns } from './devTools.js';
import { versionControlPatterns } from './vcs.js';
import { mappingMonitoringPatterns } from './monitoring.js';
import {
  paymentProviderPatterns,
  ecommerceContentPatterns,
} from './payments-commerce.js';
import {
  slackPatterns,
  socialMediaPatterns,
  shippingLogisticsPatterns,
} from './communications.js';

/**
 * Combined array of all sensitive data patterns
 * Use this for full secret detection across all pattern categories
 */
export const allRegexPatterns: SensitiveDataPattern[] = [
  ...aiProviderPatterns,
  ...analyticsModernPatterns,
  ...authPatterns,
  ...awsPatterns,
  ...cloudProviderPatterns,
  ...codeConfigPatterns,
  ...cryptographicPatterns,
  ...databasePatterns,
  ...developerToolsPatterns,
  ...ecommerceContentPatterns,
  ...genericSecretPatterns,
  ...mappingMonitoringPatterns,
  ...paymentProviderPatterns,
  ...privateKeyPatterns,
  ...shippingLogisticsPatterns,
  ...slackPatterns,
  ...socialMediaPatterns,
  ...versionControlPatterns,
];
