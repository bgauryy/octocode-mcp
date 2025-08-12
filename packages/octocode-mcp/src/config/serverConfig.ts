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

  // OAuth Configuration
  oauth?: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scopes: string[];
    enabled: boolean;
    authorizationUrl?: string; // Default: https://github.com/login/oauth/authorize
    tokenUrl?: string; // Default: https://github.com/login/oauth/access_token
  };

  // GitHub App Configuration
  githubApp?: {
    appId: string;
    privateKey: string;
    installationId?: number;
    enabled: boolean;
    baseUrl?: string; // For GitHub Enterprise Server
  };

  // Enterprise features
  organizationId?: string;
  auditLogging: boolean;
  rateLimiting: boolean;

  // Enhanced Enterprise Configuration
  enterprise?: {
    organizationId?: string;
    ssoEnforcement: boolean;
    auditLogging: boolean;
    tokenValidation: boolean;
    permissionValidation: boolean;
  };

  // Logging and debugging
  enableCommandLogging: boolean;
  logFilePath?: string;

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

      // OAuth Configuration from environment
      oauth: this.getOAuthConfig(),

      // GitHub App Configuration from environment
      githubApp: this.getGitHubAppConfig(),

      // Enterprise features
      organizationId: process.env.GITHUB_ORGANIZATION,
      auditLogging: process.env.AUDIT_ALL_ACCESS === 'true',
      rateLimiting: this.hasRateLimitConfig(),

      // Enhanced Enterprise Configuration
      enterprise: {
        organizationId: process.env.GITHUB_ORGANIZATION,
        ssoEnforcement: process.env.GITHUB_SSO_ENFORCEMENT === 'true',
        auditLogging: process.env.AUDIT_ALL_ACCESS === 'true',
        tokenValidation: process.env.GITHUB_TOKEN_VALIDATION === 'true',
        permissionValidation:
          process.env.GITHUB_PERMISSION_VALIDATION === 'true',
      },

      // Logging and debugging
      enableCommandLogging: process.env.ENABLE_COMMAND_LOGGING === 'true',
      logFilePath: process.env.LOG_FILE_PATH,

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
      oauth: config.oauth
        ? {
            ...config.oauth,
            clientSecret: '[REDACTED]',
          }
        : undefined,
      githubApp: config.githubApp
        ? {
            ...config.githubApp,
            privateKey: '[REDACTED]',
          }
        : undefined,
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

  // OAuth configuration helper
  private static getOAuthConfig(): ServerConfig['oauth'] {
    const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return undefined; // OAuth not configured
    }

    return {
      clientId,
      clientSecret,
      redirectUri:
        process.env.GITHUB_OAUTH_REDIRECT_URI ||
        'http://localhost:3000/auth/callback',
      scopes: (process.env.GITHUB_OAUTH_SCOPES || 'repo,read:user').split(','),
      enabled: process.env.GITHUB_OAUTH_ENABLED !== 'false',
      authorizationUrl:
        process.env.GITHUB_OAUTH_AUTH_URL ||
        (process.env.GITHUB_HOST
          ? `${process.env.GITHUB_HOST}/login/oauth/authorize`
          : 'https://github.com/login/oauth/authorize'),
      tokenUrl:
        process.env.GITHUB_OAUTH_TOKEN_URL ||
        (process.env.GITHUB_HOST
          ? `${process.env.GITHUB_HOST}/login/oauth/access_token`
          : 'https://github.com/login/oauth/access_token'),
    };
  }

  // GitHub App configuration helper
  private static getGitHubAppConfig(): ServerConfig['githubApp'] {
    const appId = process.env.GITHUB_APP_ID;
    const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

    if (!appId || !privateKey) {
      return undefined; // GitHub App not configured
    }

    return {
      appId,
      privateKey: privateKey.replace(/\\n/g, '\n'), // Handle escaped newlines
      installationId: process.env.GITHUB_APP_INSTALLATION_ID
        ? parseInt(process.env.GITHUB_APP_INSTALLATION_ID)
        : undefined,
      enabled: process.env.GITHUB_APP_ENABLED !== 'false',
      baseUrl: process.env.GITHUB_HOST
        ? process.env.GITHUB_HOST.startsWith('https://')
          ? `${process.env.GITHUB_HOST}/api/v3`
          : `https://${process.env.GITHUB_HOST}/api/v3`
        : undefined,
    };
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

    // OAuth validation
    if (this.config.oauth?.enabled && !this.config.oauth.clientId) {
      process.stderr.write(
        'Warning: OAuth enabled but no client ID provided - OAuth authentication will not work\n'
      );
    }

    // GitHub App validation
    if (this.config.githubApp?.enabled && !this.config.githubApp.appId) {
      process.stderr.write(
        'Warning: GitHub App enabled but no app ID provided - GitHub App authentication will not work\n'
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
