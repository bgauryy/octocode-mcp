export interface ServerConfig {
  version: string;
  token?: string; // Optional - will be resolved by tokenManager
  // Tool management
  enableTools?: string[]; // Tools to enable in addition to defaults
  disableTools?: string[]; // Tools to disable by name
  // Logging and debugging
  enableLogging: boolean;
  // Advanced settings
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

      // Tool management
      enableTools: this.parseStringArray(process.env.ENABLE_TOOLS),
      disableTools: this.parseStringArray(process.env.DISABLE_TOOLS),

      // Logging and debugging
      enableLogging: process.env.ENABLE_LOGGING === 'true',

      // Advanced settings
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
  }
}

// Export convenience functions
export function getServerConfig(): ServerConfig {
  return ConfigManager.getConfig();
}
