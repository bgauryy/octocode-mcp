/**
 * Sensitive data pattern detection regexes
 * Split into category modules for maintainability
 */

import type { SensitiveDataPattern } from './types.js';

// Re-export types
export type { SensitiveDataPattern } from './types.js';

export { aiProviderPatterns } from './ai-providers.js';
export {
  awsPatterns,
  analyticsModernPatterns,
  cloudProviderPatterns,
  databasePatterns,
} from './cloud-infrastructure.js';
export {
  authPatterns,
  codeConfigPatterns,
  cryptographicPatterns,
  privateKeyPatterns,
  genericSecretPatterns,
} from './auth-crypto.js';
export {
  developerToolsPatterns,
  versionControlPatterns,
  mappingMonitoringPatterns,
} from './dev-tools-vcs.js';
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
import {
  awsPatterns,
  analyticsModernPatterns,
  cloudProviderPatterns,
  databasePatterns,
} from './cloud-infrastructure.js';
import {
  authPatterns,
  codeConfigPatterns,
  cryptographicPatterns,
  privateKeyPatterns,
  genericSecretPatterns,
} from './auth-crypto.js';
import {
  developerToolsPatterns,
  versionControlPatterns,
  mappingMonitoringPatterns,
} from './dev-tools-vcs.js';
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
