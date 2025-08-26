import crypto from 'crypto';
import { ConfigManager } from '../serverConfig.js';

/**
 * GitHub App Manager
 *
 * Provides comprehensive GitHub App authentication and installation management.
 * Handles JWT generation, installation token management, permission validation,
 * and repository access control.
 *
 * Features:
 * - RFC 7519 JWT generation for app authentication
 * - Installation token caching with automatic expiration
 * - Fine-grained permission validation
 * - Repository access control
 * - Multi-installation support
 * - Enterprise audit logging integration
 */

export interface GitHubAppConfig {
  appId: string;
  privateKey: string;
  installationId?: number;
  baseUrl?: string;
}

export interface InstallationToken {
  token: string;
  expiresAt: Date;
  permissions: Record<string, string>;
  repositorySelection: 'all' | 'selected';
  repositories?: Repository[];
}

export interface Installation {
  id: number;
  account: {
    login: string;
    id: number;
    type: 'User' | 'Organization';
  };
  repositorySelection: 'all' | 'selected';
  permissions: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  suspendedAt?: string;
}

export interface Repository {
  id: number;
  name: string;
  fullName: string;
  owner: {
    login: string;
    id: number;
  };
  private: boolean;
}

export interface AppInfo {
  id: number;
  name: string;
  owner: {
    login: string;
    id: number;
  };
  description?: string;
  permissions: Record<string, string>;
}

export class GitHubAppManager {
  private static instance: GitHubAppManager;
  private config: GitHubAppConfig | null = null;
  private tokenCache = new Map<number, InstallationToken>();
  private installationCache = new Map<number, Installation>();

  static getInstance(): GitHubAppManager {
    if (!this.instance) {
      this.instance = new GitHubAppManager();
    }
    return this.instance;
  }

  /**
   * Initialize GitHub App manager with configuration
   */
  initialize(config?: Partial<GitHubAppConfig>): void {
    const serverConfig = ConfigManager.getConfig();

    if (!serverConfig.githubApp?.enabled) {
      throw new Error('GitHub App not configured or disabled');
    }

    this.config = {
      appId: config?.appId || serverConfig.githubApp.appId,
      privateKey: config?.privateKey || serverConfig.githubApp.privateKey,
      installationId:
        config?.installationId || serverConfig.githubApp.installationId,
      baseUrl: config?.baseUrl || serverConfig.githubApp.baseUrl,
    };
  }

  /**
   * Generate JWT for GitHub App authentication (RFC 7519)
   */
  generateJWT(): string {
    if (!this.config) throw new Error('GitHub App not initialized');

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iat: now - 60, // Issued 1 minute ago (clock skew tolerance)
      exp: now + 10 * 60, // Expires in 10 minutes (GitHub maximum)
      iss: this.config.appId, // GitHub App ID
    };

    const header = {
      alg: 'RS256',
      typ: 'JWT',
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString(
      'base64url'
    );
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url'
    );

    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    const signature = crypto.sign(
      'RSA-SHA256',
      Buffer.from(signatureInput),
      this.config.privateKey
    );
    const encodedSignature = signature.toString('base64url');

    return `${signatureInput}.${encodedSignature}`;
  }

  /**
   * Get installation token with caching and automatic refresh
   */
  async getInstallationToken(
    installationId?: number
  ): Promise<InstallationToken> {
    if (!this.config) throw new Error('GitHub App not initialized');

    const targetInstallationId = installationId || this.config.installationId;
    if (!targetInstallationId) {
      throw new Error('Installation ID required');
    }

    // Check cache first
    const cached = this.tokenCache.get(targetInstallationId);
    if (cached && cached.expiresAt > new Date(Date.now() + 60000)) {
      // Token valid for at least 1 more minute
      return cached;
    }

    try {
      const jwt = this.generateJWT();
      const baseUrl = this.getBaseUrl();

      const response = await fetch(
        `${baseUrl}/app/installations/${targetInstallationId}/access_tokens`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${jwt}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': this.getUserAgent(),
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to get installation token: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data = await response.json();
      const token: InstallationToken = {
        token: data.token,
        expiresAt: new Date(data.expires_at),
        permissions: data.permissions || {},
        repositorySelection: data.repository_selection || 'all',
        repositories: data.repositories || [],
      };

      // Cache the token
      this.tokenCache.set(targetInstallationId, token);

      // Schedule cleanup before expiration
      setTimeout(
        () => {
          this.tokenCache.delete(targetInstallationId);
        },
        token.expiresAt.getTime() - Date.now() - 60000
      );

      // Log successful token retrieval
      await this.logAppEvent('installation_token_retrieved', 'success', {
        installationId: targetInstallationId,
        expiresAt: token.expiresAt.toISOString(),
        permissions: Object.keys(token.permissions),
      });

      return token;
    } catch (error) {
      await this.logAppEvent('installation_token_retrieval', 'failure', {
        installationId: targetInstallationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * List all installations for the GitHub App
   */
  async listInstallations(): Promise<Installation[]> {
    if (!this.config) throw new Error('GitHub App not initialized');

    try {
      const jwt = this.generateJWT();
      const baseUrl = this.getBaseUrl();

      const response = await fetch(`${baseUrl}/app/installations`, {
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': this.getUserAgent(),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to list installations: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const installations = await response.json();

      // Cache installations
      installations.forEach((installation: Installation) => {
        this.installationCache.set(installation.id, installation);
      });

      return installations;
    } catch (error) {
      await this.logAppEvent('list_installations', 'failure', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get installation by ID
   */
  async getInstallation(installationId: number): Promise<Installation> {
    if (!this.config) throw new Error('GitHub App not initialized');

    // Check cache first
    const cached = this.installationCache.get(installationId);
    if (cached) {
      return cached;
    }

    try {
      const jwt = this.generateJWT();
      const baseUrl = this.getBaseUrl();

      const response = await fetch(
        `${baseUrl}/app/installations/${installationId}`,
        {
          headers: {
            Authorization: `Bearer ${jwt}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': this.getUserAgent(),
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to get installation: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const installation = await response.json();
      this.installationCache.set(installationId, installation);

      return installation;
    } catch (error) {
      await this.logAppEvent('get_installation', 'failure', {
        installationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Validate installation permissions
   */
  async validateInstallationPermissions(
    installationId: number,
    requiredPermissions: string[]
  ): Promise<boolean> {
    try {
      const token = await this.getInstallationToken(installationId);

      for (const permission of requiredPermissions) {
        const permissionLevel = token.permissions[permission];
        if (!permissionLevel || permissionLevel === 'none') {
          return false;
        }
      }

      return true;
    } catch (error) {
      await this.logAppEvent('permission_validation', 'failure', {
        installationId,
        requiredPermissions,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Validate repository access
   */
  async validateRepositoryAccess(
    installationId: number,
    owner: string,
    repo: string
  ): Promise<boolean> {
    try {
      const token = await this.getInstallationToken(installationId);

      // If all repositories are selected, access is granted
      if (token.repositorySelection === 'all') {
        return true;
      }

      // Check specific repository access
      if (token.repositories) {
        return token.repositories.some(
          r => r.owner.login === owner && r.name === repo
        );
      }

      // If no repositories list, fetch from API
      const baseUrl = this.getBaseUrl();
      const response = await fetch(`${baseUrl}/installation/repositories`, {
        headers: {
          Authorization: `token ${token.token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': this.getUserAgent(),
        },
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      return data.repositories.some(
        (r: Repository) => r.owner.login === owner && r.name === repo
      );
    } catch (error) {
      await this.logAppEvent('repository_access_validation', 'failure', {
        installationId,
        owner,
        repo,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Get authenticated user for installation
   */
  async getInstallationUser(installationId: number): Promise<{
    login: string;
    id: number;
    type: string;
    name?: string;
    email?: string;
  }> {
    const token = await this.getInstallationToken(installationId);
    const baseUrl = this.getBaseUrl();

    const response = await fetch(`${baseUrl}/user`, {
      headers: {
        Authorization: `token ${token.token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': this.getUserAgent(),
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to get installation user: ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  }

  /**
   * Get app information
   */
  async getAppInfo(): Promise<AppInfo> {
    if (!this.config) throw new Error('GitHub App not initialized');

    try {
      const jwt = this.generateJWT();
      const baseUrl = this.getBaseUrl();

      const response = await fetch(`${baseUrl}/app`, {
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': this.getUserAgent(),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to get app info: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      return await response.json();
    } catch (error) {
      await this.logAppEvent('get_app_info', 'failure', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Clear token cache (useful for testing/reset)
   */
  clearTokenCache(): void {
    this.tokenCache.clear();
  }

  /**
   * Clear installation cache
   */
  clearInstallationCache(): void {
    this.installationCache.clear();
  }

  /**
   * Get current configuration (without private key)
   */
  getConfig(): Omit<GitHubAppConfig, 'privateKey'> | null {
    if (!this.config) return null;

    return {
      appId: this.config.appId,
      installationId: this.config.installationId,
      baseUrl: this.config.baseUrl,
    };
  }

  // Private helper methods

  /**
   * Get base URL for API requests
   */
  private getBaseUrl(): string {
    return this.config?.baseUrl || 'https://api.github.com';
  }

  /**
   * Get user agent string
   */
  private getUserAgent(): string {
    const serverConfig = ConfigManager.getConfig();
    return `octocode-mcp/${serverConfig.version} (GitHub App)`;
  }

  /**
   * Log GitHub App events in enterprise mode
   */
  private async logAppEvent(
    action: string,
    outcome: 'success' | 'failure',
    details: Record<string, unknown>
  ): Promise<void> {
    try {
      const serverConfig = ConfigManager.getConfig();
      if (serverConfig.enterprise?.auditLogging) {
        const { AuditLogger } = await import('../security/auditLogger.js');
        AuditLogger.logEvent({
          action: `github_app_${action}`,
          outcome,
          source: 'auth',
          details: {
            ...details,
            appId: this.config?.appId,
          },
        });
      }
    } catch {
      // Ignore audit logging errors
    }
  }
}

// Convenience functions
export async function createGitHubAppManager(
  config?: Partial<GitHubAppConfig>
): Promise<GitHubAppManager> {
  const manager = GitHubAppManager.getInstance();
  manager.initialize(config);
  return manager;
}

export { GitHubAppManager as default };
