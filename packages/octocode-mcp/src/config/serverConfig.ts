/**
 * Server Configuration Management
 *
 * GitHub MCP-compatible configuration system with environment variable support
 * and validation.
 */

export interface ServerConfig {
  // Core settings
  version: string;
  host?: string; // For GitHub Enterprise Server
  token?: string; // Optional - will be resolved by tokenManager

  // Tool management
  enabledToolsets: string[];
  dynamicToolsets: boolean;
  readOnly: boolean;

  // Enterprise features
  organizationId?: string;
  auditLogging: boolean;
  rateLimiting: boolean;

  // Logging and debugging
  enableCommandLogging: boolean;
  logFilePath?: string;
  exportTranslations: boolean;

  // Advanced settings
  githubHost?: string; // GitHub Enterprise Server URL
  timeout: number;
  maxRetries: number;
}

export class ConfigManager {
  private static config: ServerConfig | null = null;
  private static initialized = false;

  /**
   * Initialize configuration from environment variables
   */
  static initialize(): ServerConfig {
    if (this.initialized && this.config) {
      return this.config;
    }

    this.config = {
      // Core settings
      version: process.env.npm_package_version || '4.0.5',
      host: process.env.GITHUB_HOST,

      // Tool management (GitHub MCP compatible)
      enabledToolsets: this.parseStringArray(process.env.GITHUB_TOOLSETS) || [
        'all',
      ],
      dynamicToolsets: process.env.GITHUB_DYNAMIC_TOOLSETS === 'true',
      readOnly: process.env.GITHUB_READ_ONLY === 'true',

      // Enterprise features
      organizationId: process.env.GITHUB_ORGANIZATION,
      auditLogging: process.env.AUDIT_ALL_ACCESS === 'true',
      rateLimiting: this.hasRateLimitConfig(),

      // Logging and debugging
      enableCommandLogging: process.env.ENABLE_COMMAND_LOGGING === 'true',
      logFilePath: process.env.LOG_FILE_PATH,
      exportTranslations: process.env.EXPORT_TRANSLATIONS === 'true',

      // Advanced settings
      githubHost: process.env.GITHUB_HOST,
      timeout: parseInt(process.env.REQUEST_TIMEOUT || '30000'),
      maxRetries: parseInt(process.env.MAX_RETRIES || '3'),
    };

    this.initialized = true;
    this.validateConfig();

    return this.config;
  }

  /**
   * Get current configuration
   */
  static getConfig(): ServerConfig {
    if (!this.initialized || !this.config) {
      return this.initialize();
    }
    return this.config;
  }

  /**
   * Update configuration
   */
  static updateConfig(updates: Partial<ServerConfig>): void {
    if (!this.config) {
      this.initialize();
    }

    this.config = { ...this.config!, ...updates };
    this.validateConfig();
  }

  /**
   * Check if enterprise features are enabled
   */
  static isEnterpriseMode(): boolean {
    const config = this.getConfig();
    return !!(
      config.organizationId ||
      config.auditLogging ||
      config.rateLimiting
    );
  }

  /**
   * Get GitHub API base URL
   */
  static getGitHubBaseURL(): string {
    const config = this.getConfig();
    if (config.githubHost) {
      // GitHub Enterprise Server
      const host = config.githubHost.startsWith('https://')
        ? config.githubHost
        : `https://${config.githubHost}`;
      return `${host}/api/v3`;
    }
    return 'https://api.github.com';
  }

  /**
   * Export configuration for debugging
   */
  static exportConfig(): Record<string, unknown> {
    const config = this.getConfig();
    return {
      ...config,
      token: config.token ? '[REDACTED]' : undefined, // Never export actual token
    };
  }

  // Private methods
  private static parseStringArray(value?: string): string[] | undefined {
    if (!value || value.trim() === '') return undefined;
    return value
      .split(',')
      .map(item => item.trim())
      .filter(item => item.length > 0);
  }

  private static hasRateLimitConfig(): boolean {
    return !!(
      process.env.RATE_LIMIT_API_HOUR ||
      process.env.RATE_LIMIT_AUTH_HOUR ||
      process.env.RATE_LIMIT_TOKEN_HOUR
    );
  }

  private static validateConfig(): void {
    if (!this.config) return;

    // Validate timeout
    if (this.config.timeout < 1000) {
      this.config.timeout = 30000;
    }

    // Validate retries
    if (this.config.maxRetries < 0 || this.config.maxRetries > 10) {
      this.config.maxRetries = 3;
    }

    // Validate toolsets
    if (this.config.enabledToolsets.length === 0) {
      this.config.enabledToolsets = ['all'];
    }

    // Enterprise validation
    if (this.config.auditLogging && !this.config.organizationId) {
      // Use stderr for warnings instead of console.warn to avoid linter issues
      process.stderr.write(
        'Warning: Audit logging enabled without organization ID - some features may not work correctly\n'
      );
    }
  }
}

// Export convenience functions
export function getServerConfig(): ServerConfig {
  return ConfigManager.getConfig();
}

export function isEnterpriseMode(): boolean {
  return ConfigManager.isEnterpriseMode();
}

export function getGitHubBaseURL(): string {
  return ConfigManager.getGitHubBaseURL();
}
