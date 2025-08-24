/**
 * Centralized Configuration Management for Octocode MCP
 *
 * This file consolidates all environment variable reading and provides
 * a clean, typed interface for configuration across the entire MCP system.
 */

// Core Configuration Types
export interface MCPConfig {
  // Core Application Settings
  app: {
    version: string;
    nodeEnv: string;
  };

  // Authentication & GitHub Settings
  github: {
    token?: string;
    ghToken?: string;
    authorizationToken?: string;
    host?: string;
    organization?: string;
    organizationName?: string;
  };

  // Tool Management
  tools: {
    enableTools?: string[];
    disableTools?: string[];
  };

  // OAuth Configuration
  oauth: {
    enabled: boolean;
    clientId?: string;
    clientSecret?: string;
    redirectUri: string;
    scopes: string[];
    authorizationUrl: string;
    tokenUrl: string;
  };

  // GitHub App Configuration
  githubApp: {
    enabled: boolean;
    appId?: string;
    privateKey?: string;
    installationId?: number;
    baseUrl?: string;
  };

  // Enterprise Features
  enterprise: {
    enabled: boolean;
    organizationId?: string;
    organizationName?: string;
    ssoEnforcement: boolean;
    auditLogging: boolean;
    rateLimiting: boolean;
    tokenValidation: boolean;
    permissionValidation: boolean;
  };

  // Rate Limiting Configuration
  rateLimits: {
    enabled: boolean;
    apiRequestsPerHour: number;
    authAttemptsPerHour: number;
    tokenRequestsPerHour: number;
  };

  // Organization & User Management
  organization: {
    allowedUsers?: string[];
    requiredTeams?: string[];
    adminUsers?: string[];
    requireMfa: boolean;
    restrictToMembers: boolean;
  };

  // Logging & Debugging
  logging: {
    enableCommandLogging: boolean;
    enableAuditLogging: boolean;
    logFilePath?: string;
    auditLogDir: string;
  };

  // Performance & Reliability
  performance: {
    requestTimeout: number;
    maxRetries: number;
  };

  // Beta Features
  beta: {
    enabled: boolean;
    samplingEnabled: boolean;
  };

  // Security Settings
  security: {
    contentSanitization: boolean;
    inputValidation: boolean;
    secretDetection: boolean;
  };
}

/**
 * Parse comma-separated string into array
 */
function parseStringArray(value?: string): string[] | undefined {
  if (!value || value.trim() === '') return undefined;
  return value
    .split(',')
    .map(item => item.trim())
    .filter(item => item.length > 0);
}

/**
 * Parse boolean from string (supports 'true', '1', 'yes', 'on')
 */
function parseBoolean(value?: string, defaultValue = false): boolean {
  if (!value) return defaultValue;
  const val = value.toLowerCase();
  return val === 'true' || val === '1' || val === 'yes' || val === 'on';
}

/**
 * Parse integer with validation and default
 */
function parseInteger(
  value: string | undefined,
  defaultValue: number,
  min?: number,
  max?: number
): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return defaultValue;
  if (min !== undefined && parsed < min) return min;
  if (max !== undefined && parsed > max) return max;
  return parsed;
}

/**
 * Check if any rate limiting configuration is present
 */
function hasRateLimitConfig(): boolean {
  return !!(
    process.env.RATE_LIMIT_API_HOUR ||
    process.env.RATE_LIMIT_AUTH_HOUR ||
    process.env.RATE_LIMIT_TOKEN_HOUR
  );
}

/**
 * Check if enterprise mode is enabled based on any enterprise features
 */
function isEnterpriseEnabled(): boolean {
  return !!(
    process.env.GITHUB_ORGANIZATION ||
    process.env.AUDIT_ALL_ACCESS === 'true' ||
    hasRateLimitConfig() ||
    process.env.GITHUB_SSO_ENFORCEMENT === 'true' ||
    process.env.RESTRICT_TO_MEMBERS === 'true' ||
    process.env.REQUIRE_MFA === 'true'
  );
}

/**
 * Build GitHub API URLs based on host configuration
 */
function getGitHubUrls(host?: string) {
  if (host) {
    const baseHost = host.startsWith('https://') ? host : `https://${host}`;
    return {
      apiBase: `${baseHost}/api/v3`,
      authUrl: `${baseHost}/login/oauth/authorize`,
      tokenUrl: `${baseHost}/login/oauth/access_token`,
    };
  }
  return {
    apiBase: 'https://api.github.com',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
  };
}

/**
 * Load and validate all configuration from environment variables
 */
export function loadConfig(): MCPConfig {
  const githubUrls = getGitHubUrls(process.env.GITHUB_HOST);
  const enterpriseEnabled = isEnterpriseEnabled();
  const rateLimitingEnabled = hasRateLimitConfig();
  const betaEnabled = parseBoolean(process.env.BETA);

  const config: MCPConfig = {
    // Core Application Settings
    app: {
      version: process.env.npm_package_version || '4.1.2',
      nodeEnv: process.env.NODE_ENV || 'production',
    },

    // Authentication & GitHub Settings
    github: {
      token: process.env.GITHUB_TOKEN,
      ghToken: process.env.GH_TOKEN,
      authorizationToken: process.env.Authorization,
      host: process.env.GITHUB_HOST,
      organization: process.env.GITHUB_ORGANIZATION,
      organizationName: process.env.GITHUB_ORGANIZATION_NAME,
    },

    // Tool Management
    tools: {
      enableTools: parseStringArray(process.env.ENABLE_TOOLS),
      disableTools: parseStringArray(process.env.DISABLE_TOOLS),
    },

    // OAuth Configuration
    oauth: {
      enabled:
        parseBoolean(process.env.GITHUB_OAUTH_ENABLED, true) &&
        !!(
          process.env.GITHUB_OAUTH_CLIENT_ID &&
          process.env.GITHUB_OAUTH_CLIENT_SECRET
        ),
      clientId: process.env.GITHUB_OAUTH_CLIENT_ID,
      clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
      redirectUri:
        process.env.GITHUB_OAUTH_REDIRECT_URI ||
        'http://localhost:3000/auth/callback',
      scopes: parseStringArray(process.env.GITHUB_OAUTH_SCOPES) || [
        'repo',
        'read:user',
      ],
      authorizationUrl: process.env.GITHUB_OAUTH_AUTH_URL || githubUrls.authUrl,
      tokenUrl: process.env.GITHUB_OAUTH_TOKEN_URL || githubUrls.tokenUrl,
    },

    // GitHub App Configuration
    githubApp: {
      enabled:
        parseBoolean(process.env.GITHUB_APP_ENABLED, true) &&
        !!(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY),
      appId: process.env.GITHUB_APP_ID,
      privateKey: process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      installationId: process.env.GITHUB_APP_INSTALLATION_ID
        ? parseInt(process.env.GITHUB_APP_INSTALLATION_ID)
        : undefined,
      baseUrl: process.env.GITHUB_HOST ? githubUrls.apiBase : undefined,
    },

    // Enterprise Features
    enterprise: {
      enabled: enterpriseEnabled,
      organizationId: process.env.GITHUB_ORGANIZATION,
      organizationName:
        process.env.GITHUB_ORGANIZATION_NAME || process.env.GITHUB_ORGANIZATION,
      ssoEnforcement: parseBoolean(process.env.GITHUB_SSO_ENFORCEMENT),
      auditLogging: parseBoolean(process.env.AUDIT_ALL_ACCESS),
      rateLimiting: rateLimitingEnabled,
      tokenValidation: parseBoolean(process.env.GITHUB_TOKEN_VALIDATION),
      permissionValidation: parseBoolean(
        process.env.GITHUB_PERMISSION_VALIDATION
      ),
    },

    // Rate Limiting Configuration
    rateLimits: {
      enabled: rateLimitingEnabled,
      apiRequestsPerHour: parseInteger(
        process.env.RATE_LIMIT_API_HOUR,
        1000,
        100,
        50000
      ),
      authAttemptsPerHour: parseInteger(
        process.env.RATE_LIMIT_AUTH_HOUR,
        10,
        1,
        1000
      ),
      tokenRequestsPerHour: parseInteger(
        process.env.RATE_LIMIT_TOKEN_HOUR,
        50,
        1,
        1000
      ),
    },

    // Organization & User Management
    organization: {
      allowedUsers: parseStringArray(process.env.GITHUB_ALLOWED_USERS),
      requiredTeams: parseStringArray(process.env.GITHUB_REQUIRED_TEAMS),
      adminUsers: parseStringArray(process.env.GITHUB_ADMIN_USERS),
      requireMfa: parseBoolean(process.env.REQUIRE_MFA),
      restrictToMembers: parseBoolean(process.env.RESTRICT_TO_MEMBERS),
    },

    // Logging & Debugging
    logging: {
      enableCommandLogging: parseBoolean(process.env.ENABLE_COMMAND_LOGGING),
      enableAuditLogging: parseBoolean(process.env.AUDIT_ALL_ACCESS),
      logFilePath: process.env.LOG_FILE_PATH,
      auditLogDir: process.env.AUDIT_LOG_DIR || './logs/audit',
    },

    // Performance & Reliability
    performance: {
      requestTimeout: parseInteger(
        process.env.REQUEST_TIMEOUT,
        30000,
        1000,
        300000
      ),
      maxRetries: parseInteger(process.env.MAX_RETRIES, 3, 0, 10),
    },

    // Beta Features
    beta: {
      enabled: betaEnabled,
      samplingEnabled: betaEnabled, // Sampling is part of beta features
    },

    // Security Settings
    security: {
      contentSanitization: true, // Always enabled for security
      inputValidation: true, // Always enabled for security
      secretDetection: true, // Always enabled for security
    },
  };

  // Validate configuration
  validateConfig(config);

  return config;
}

/**
 * Validate configuration and apply fixes/warnings
 */
function validateConfig(config: MCPConfig): void {
  // Validate timeout
  if (config.performance.requestTimeout < 1000) {
    config.performance.requestTimeout = 30000;
    logWarning('Request timeout too low, reset to 30 seconds');
  }

  // Validate retries
  if (config.performance.maxRetries < 0 || config.performance.maxRetries > 10) {
    config.performance.maxRetries = 3;
    logWarning('Max retries out of range, reset to 3');
  }



  // Enterprise validation warnings
  if (config.enterprise.auditLogging && !config.enterprise.organizationId) {
    logWarning(
      'Audit logging enabled without organization ID - some features may not work correctly'
    );
  }

  // OAuth validation
  if (config.oauth.enabled && !config.oauth.clientId) {
    config.oauth.enabled = false;
    logWarning(
      'OAuth enabled but no client ID provided - OAuth authentication disabled'
    );
  }

  // GitHub App validation
  if (config.githubApp.enabled && !config.githubApp.appId) {
    config.githubApp.enabled = false;
    logWarning(
      'GitHub App enabled but no app ID provided - GitHub App authentication disabled'
    );
  }

  // Rate limiting validation
  if (
    config.rateLimits.enabled &&
    (config.rateLimits.apiRequestsPerHour < 100 ||
      config.rateLimits.authAttemptsPerHour < 1 ||
      config.rateLimits.tokenRequestsPerHour < 1)
  ) {
    logWarning('Rate limits are set very low - this may impact functionality');
  }
}

/**
 * Log warning messages to stderr to avoid linter issues
 */
function logWarning(message: string): void {
  process.stderr.write(`⚠️  Config Warning: ${message}\n`);
}

/**
 * Export redacted configuration for debugging (sensitive data removed)
 */
export function getRedactedConfig(config: MCPConfig): Record<string, unknown> {
  return {
    app: config.app,
    github: {
      ...config.github,
      token: config.github.token ? '[REDACTED]' : undefined,
      ghToken: config.github.ghToken ? '[REDACTED]' : undefined,
      authorizationToken: config.github.authorizationToken
        ? '[REDACTED]'
        : undefined,
    },
    tools: config.tools,
    oauth: config.oauth.enabled
      ? {
          ...config.oauth,
          clientSecret: '[REDACTED]',
        }
      : { enabled: false },
    githubApp: config.githubApp.enabled
      ? {
          ...config.githubApp,
          privateKey: '[REDACTED]',
        }
      : { enabled: false },
    enterprise: config.enterprise,
    rateLimits: config.rateLimits,
    organization: config.organization,
    logging: config.logging,
    performance: config.performance,
    beta: config.beta,
    security: config.security,
  };
}

/**
 * Direct helper functions that work with the singleton configuration
 */
export function isEnterpriseMode(): boolean {
  return getConfig().enterprise.enabled;
}

export function isAuditingEnabled(): boolean {
  return getConfig().logging.enableAuditLogging;
}

export function isRateLimitingEnabled(): boolean {
  return getConfig().rateLimits.enabled;
}

export function isBetaEnabled(): boolean {
  return getConfig().beta.enabled;
}

export function isOAuthEnabled(): boolean {
  return getConfig().oauth.enabled;
}

export function isGitHubAppEnabled(): boolean {
  return getConfig().githubApp.enabled;
}

export function getGitHubToken(): string | undefined {
  const config = getConfig();
  return (
    config.github.token ||
    config.github.ghToken ||
    config.github.authorizationToken
  );
}

export function getGitHubApiUrl(): string {
  const config = getConfig();
  return config.github.host
    ? `https://${config.github.host}/api/v3`
    : 'https://api.github.com';
}

export function getAppVersion(): string {
  return getConfig().app.version;
}

export function getGitHubHost(): string | undefined {
  return getConfig().github.host;
}



export function getEnableTools(): string[] | undefined {
  return getConfig().tools.enableTools;
}

export function getDisableTools(): string[] | undefined {
  return getConfig().tools.disableTools;
}

export function getOAuthConfig() {
  const config = getConfig();
  return config.oauth.enabled
    ? {
        clientId: config.oauth.clientId!,
        clientSecret: config.oauth.clientSecret!,
        redirectUri: config.oauth.redirectUri,
        scopes: config.oauth.scopes,
        enabled: config.oauth.enabled,
        authorizationUrl: config.oauth.authorizationUrl,
        tokenUrl: config.oauth.tokenUrl,
      }
    : undefined;
}

export function getGitHubAppConfig() {
  const config = getConfig();
  return config.githubApp.enabled
    ? {
        appId: config.githubApp.appId!,
        privateKey: config.githubApp.privateKey!,
        installationId: config.githubApp.installationId,
        enabled: config.githubApp.enabled,
        baseUrl: config.githubApp.baseUrl,
      }
    : undefined;
}

export function getEnterpriseConfig() {
  const config = getConfig();
  return {
    organizationId: config.enterprise.organizationId,
    ssoEnforcement: config.enterprise.ssoEnforcement,
    auditLogging: config.enterprise.auditLogging,
    rateLimiting: config.enterprise.rateLimiting,
    tokenValidation: config.enterprise.tokenValidation,
    permissionValidation: config.enterprise.permissionValidation,
  };
}

export function getRateLimitsConfig() {
  const config = getConfig();
  return {
    enabled: config.rateLimits.enabled,
    apiRequestsPerHour: config.rateLimits.apiRequestsPerHour,
    authAttemptsPerHour: config.rateLimits.authAttemptsPerHour,
    tokenRequestsPerHour: config.rateLimits.tokenRequestsPerHour,
  };
}

export function getOrganizationConfig() {
  const config = getConfig();
  return {
    allowedUsers: config.organization.allowedUsers,
    requiredTeams: config.organization.requiredTeams,
    adminUsers: config.organization.adminUsers,
    requireMfa: config.organization.requireMfa,
    restrictToMembers: config.organization.restrictToMembers,
  };
}

export function getLoggingConfig() {
  const config = getConfig();
  return {
    enableCommandLogging: config.logging.enableCommandLogging,
    enableAuditLogging: config.logging.enableAuditLogging,
    logFilePath: config.logging.logFilePath,
    auditLogDir: config.logging.auditLogDir,
  };
}

export function getPerformanceConfig() {
  const config = getConfig();
  return {
    requestTimeout: config.performance.requestTimeout,
    maxRetries: config.performance.maxRetries,
  };
}

/**
 * Legacy ConfigHelpers object for backward compatibility
 * @deprecated Use direct functions instead (e.g., isBetaEnabled() instead of ConfigHelpers.isBetaEnabled(config))
 */
export const ConfigHelpers = {
  isEnterpriseMode: (config: MCPConfig) => config.enterprise.enabled,
  isAuditingEnabled: (config: MCPConfig) => config.logging.enableAuditLogging,
  isRateLimitingEnabled: (config: MCPConfig) => config.rateLimits.enabled,
  isBetaEnabled: (config: MCPConfig) => config.beta.enabled,
  isOAuthEnabled: (config: MCPConfig) => config.oauth.enabled,
  isGitHubAppEnabled: (config: MCPConfig) => config.githubApp.enabled,
  getGitHubToken: (config: MCPConfig) =>
    config.github.token ||
    config.github.ghToken ||
    config.github.authorizationToken,
  getGitHubApiUrl: (config: MCPConfig) =>
    config.github.host
      ? `https://${config.github.host}/api/v3`
      : 'https://api.github.com',
};

// Export singleton instance
let configInstance: MCPConfig | null = null;

/**
 * Get configuration instance (singleton pattern)
 * @internal - Use helper functions instead of accessing config directly
 */
function getConfig(): MCPConfig {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

/**
 * Reset configuration (useful for testing)
 */
export function resetConfig(): void {
  configInstance = null;
}

/**
 * Update configuration with new values
 */
export function updateConfig(updates: Partial<MCPConfig>): MCPConfig {
  if (!configInstance) {
    configInstance = loadConfig();
  }

  // Deep merge configuration
  configInstance = {
    ...configInstance,
    ...updates,
    app: { ...configInstance.app, ...updates.app },
    github: { ...configInstance.github, ...updates.github },
    tools: { ...configInstance.tools, ...updates.tools },
    oauth: { ...configInstance.oauth, ...updates.oauth },
    githubApp: { ...configInstance.githubApp, ...updates.githubApp },
    enterprise: { ...configInstance.enterprise, ...updates.enterprise },
    rateLimits: { ...configInstance.rateLimits, ...updates.rateLimits },
    organization: { ...configInstance.organization, ...updates.organization },
    logging: { ...configInstance.logging, ...updates.logging },
    performance: { ...configInstance.performance, ...updates.performance },
    beta: { ...configInstance.beta, ...updates.beta },
    security: { ...configInstance.security, ...updates.security },
  };

  validateConfig(configInstance);
  return configInstance;
}

export default {
  // Core management (internal use)
  resetConfig,
  updateConfig,
  loadConfig,
  getRedactedConfig,
  // Boolean helpers
  isEnterpriseMode,
  isAuditingEnabled,
  isRateLimitingEnabled,
  isBetaEnabled,
  isOAuthEnabled,
  isGitHubAppEnabled,
  // Value getters
  getGitHubToken,
  getGitHubApiUrl,
  getAppVersion,
  getGitHubHost,

  getEnableTools,
  getDisableTools,
  // Config section getters
  getOAuthConfig,
  getGitHubAppConfig,
  getEnterpriseConfig,
  getRateLimitsConfig,
  getOrganizationConfig,
  getLoggingConfig,
  getPerformanceConfig,
  // Legacy
  ConfigHelpers,
};
