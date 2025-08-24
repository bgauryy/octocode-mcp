/**
 * Enterprise Mode Utilities
 * Single source of truth for enterprise mode detection
 * Inspired by GitHub MCP Server's simple configuration patterns
 */

import { ConfigManager, type ServerConfig } from '../../config/serverConfig.js';

/**
 * Check if system is running in enterprise mode
 * Single source of truth - use this everywhere
 */
export function isEnterpriseMode(): boolean {
  return ConfigManager.isEnterpriseMode();
}

/**
 * Get enterprise configuration
 */
export function getEnterpriseConfig(): ServerConfig['enterprise'] {
  return ConfigManager.getEnterpriseConfig();
}

/**
 * Check if specific enterprise feature is enabled
 */
export function isEnterpriseFeatureEnabled(
  feature: keyof NonNullable<ServerConfig['enterprise']>
): boolean {
  const config = getEnterpriseConfig();
  return config?.[feature] === true;
}

/**
 * Get organization ID from enterprise config
 */
export function getOrganizationId(): string | undefined {
  return getEnterpriseConfig()?.organizationId;
}

/**
 * Check if audit logging is enabled
 */
export function isAuditLoggingEnabled(): boolean {
  return isEnterpriseFeatureEnabled('auditLogging');
}

/**
 * Check if rate limiting is enabled
 */
export function isRateLimitingEnabled(): boolean {
  return isEnterpriseFeatureEnabled('rateLimiting');
}

/**
 * Check if SSO enforcement is enabled
 */
export function isSSOEnforcementEnabled(): boolean {
  return isEnterpriseFeatureEnabled('ssoEnforcement');
}

/**
 * Check if token validation is enabled
 */
export function isTokenValidationEnabled(): boolean {
  return isEnterpriseFeatureEnabled('tokenValidation');
}

/**
 * Check if permission validation is enabled
 */
export function isPermissionValidationEnabled(): boolean {
  return isEnterpriseFeatureEnabled('permissionValidation');
}

/**
 * Get enterprise configuration summary for debugging
 */
export function getEnterpriseConfigSummary(): {
  isEnterpriseMode: boolean;
  organizationId?: string;
  enabledFeatures: string[];
} {
  const config = getEnterpriseConfig();
  const enabledFeatures: string[] = [];

  if (config) {
    Object.entries(config).forEach(([key, value]) => {
      if (value === true) {
        enabledFeatures.push(key);
      }
    });
  }

  return {
    isEnterpriseMode: isEnterpriseMode(),
    organizationId: config?.organizationId,
    enabledFeatures,
  };
}
