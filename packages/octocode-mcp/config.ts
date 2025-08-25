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
  };

  // Tool Management
  tools: {
    toolsToRun?: string[];     // TOOLS_TO_RUN - run ONLY these tools (exclusive)
    enableTools?: string[];    // ENABLE_TOOLS - add these tools to defaults (additive)
    disableTools?: string[];   // DISABLE_TOOLS - remove these tools (takes priority)
  };

  // Logging & Debugging
  logging: {
    enableLogging: boolean;
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
 * Load and validate all configuration from environment variables
 */
export function loadConfig(): MCPConfig {
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
    },

    // Tool Management
    tools: {
      // TOOLS_TO_RUN means "run ONLY these tools" (exclusive mode)
      toolsToRun: parseStringArray(process.env.TOOLS_TO_RUN),
      // ENABLE_TOOLS means "add these tools to defaults" (additive mode)
      enableTools: parseStringArray(process.env.ENABLE_TOOLS),
      disableTools: parseStringArray(process.env.DISABLE_TOOLS),
    },

    // Logging & Debugging
    logging: {
      enableLogging: parseBoolean(process.env.ENABLE_LOGGING),
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

    logging: config.logging,
    performance: config.performance,
    beta: config.beta,
    security: config.security,
  };
}

/**
 * Direct helper functions that work with the singleton configuration
 */
export function isBetaEnabled(): boolean {
  return getConfig().beta.enabled;
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
  return 'https://api.github.com';
}

export function getAppVersion(): string {
  return getConfig().app.version;
}

export function getToolsToRun(): string[] | undefined {
  return getConfig().tools.toolsToRun;
}

export function getEnableTools(): string[] | undefined {
  return getConfig().tools.enableTools;
}

export function getDisableTools(): string[] | undefined {
  return getConfig().tools.disableTools;
}

export function getLoggingConfig() {
  const config = getConfig();
  return {
    enableLogging: config.logging.enableLogging,
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
  isBetaEnabled: (config: MCPConfig) => config.beta.enabled,
  getGitHubToken: (config: MCPConfig) =>
    config.github.token ||
    config.github.ghToken ||
    config.github.authorizationToken,
  getGitHubApiUrl: () => 'https://api.github.com',
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
  isBetaEnabled,
  // Value getters
  getGitHubToken,
  getGitHubApiUrl,
  getAppVersion,
  getToolsToRun,
  getEnableTools,
  getDisableTools,
  // Config section getters
  getLoggingConfig,
  getPerformanceConfig,
  // Legacy
  ConfigHelpers,
};
