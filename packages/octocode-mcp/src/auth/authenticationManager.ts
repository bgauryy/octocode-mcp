/**
 * Unified Authentication Manager
 * Single entry point for all authentication initialization
 *
 * Inspired by the clean patterns from GitHub MCP Server:
 * - Single initialization method
 * - Clear separation of concerns
 * - Proper error handling
 */

import { ConfigManager } from '../serverConfig.js';
import {
  isEnterpriseMode,
  getEnterpriseConfig,
  isAuditLoggingEnabled,
} from '../utils/enterpriseUtils.js';

export class AuthenticationManager {
  private static instance: AuthenticationManager;
  private initialized = false;

  static getInstance(): AuthenticationManager {
    if (!this.instance) {
      this.instance = new AuthenticationManager();
    }
    return this.instance;
  }

  /**
   * Single initialization method for all authentication
   * Replaces scattered initialization across multiple functions
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // 1. Initialize core authentication protocols
      await this.initializeAuthProtocols();

      // 2. Initialize enterprise features (if configured)
      await this.initializeEnterpriseFeatures();

      // 3. Initialize unified token management
      await this.initializeTokenManagement();

      this.initialized = true;
      this.logSuccess('Authentication system initialized successfully');
    } catch (error) {
      this.logError('Authentication initialization failed', error);
      throw error;
    }
  }

  private async initializeAuthProtocols(): Promise<void> {
    const config = ConfigManager.getConfig();

    // Safely check if OAuth or GitHub App is configured
    const hasOAuth = config.oauth && config.oauth.enabled;
    const hasGitHubApp = config.githubApp && config.githubApp.enabled;

    // ✅ CRITICAL: Initialize MCP Auth Protocol with OAuth support
    if (hasOAuth || hasGitHubApp) {
      const { createMCPAuthProtocol } = await import('./mcpAuthProtocol.js');
      await createMCPAuthProtocol();

      // ✅ ENSURE: OAuth Manager is properly initialized for MCP integration
      if (hasOAuth) {
        const { OAuthManager } = await import('./oauthManager.js');
        const oauthManager = OAuthManager.getInstance();
        oauthManager.initialize(config.oauth!);

        // Log OAuth initialization for enterprise audit
        this.logEvent('oauth_manager_initialized', 'success', {
          clientId: config.oauth!.clientId,
          scopes: config.oauth!.scopes,
          redirectUri: config.oauth!.redirectUri,
        });
      }

      // ✅ ENSURE: GitHub App Manager is properly initialized for enterprise auth
      if (hasGitHubApp) {
        const { GitHubAppManager } = await import('./githubAppManager.js');
        const githubAppManager = GitHubAppManager.getInstance();
        githubAppManager.initialize(config.githubApp!);

        // Log GitHub App initialization for enterprise audit
        this.logEvent('github_app_initialized', 'success', {
          appId: config.githubApp!.appId,
          installationId: config.githubApp!.installationId,
        });
      }
    }
  }

  private async initializeEnterpriseFeatures(): Promise<void> {
    if (!isEnterpriseMode()) {
      return; // Skip if not enterprise mode
    }

    const enterprise = getEnterpriseConfig();
    if (!enterprise) return;

    // Initialize in dependency order: Audit → Organization → Rate Limiting → Policy
    if (enterprise.auditLogging) {
      const { AuditLogger } = await import('../security/auditLogger.js');
      AuditLogger.initialize();
    }

    if (enterprise.organizationId) {
      const { OrganizationManager } = await import(
        '../security/organizationManager.js'
      );
      OrganizationManager.initialize();
    }

    if (enterprise.rateLimiting) {
      const { RateLimiter } = await import('../security/rateLimiter.js');
      RateLimiter.initialize();
    }

    // Always initialize policy manager in enterprise mode
    const { PolicyManager } = await import('../security/policyManager.js');
    PolicyManager.initialize();
  }

  private async initializeTokenManagement(): Promise<void> {
    const enterprise = getEnterpriseConfig();

    // Initialize token manager with enterprise config if available
    const tokenConfig = enterprise
      ? {
          organizationId: enterprise.organizationId,
          enableAuditLogging: enterprise.auditLogging,
          enableRateLimiting: enterprise.rateLimiting,
          enableOrganizationValidation: !!enterprise.organizationId,
        }
      : undefined;

    const { initialize: initializeTokenManager } = await import(
      '../tools/utils/tokenManager.js'
    );
    await initializeTokenManager(tokenConfig);
  }

  private logSuccess(message: string): void {
    this.logEvent('authentication_initialized', 'success', { message });
  }

  private logError(message: string, error: unknown): void {
    this.logEvent('authentication_initialized', 'failure', {
      message,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  private logEvent(
    action: string,
    outcome: 'success' | 'failure',
    details: Record<string, unknown>
  ): void {
    try {
      if (isAuditLoggingEnabled()) {
        import('../security/auditLogger.js').then(({ AuditLogger }) => {
          AuditLogger.logEvent({
            action,
            outcome,
            source: 'auth',
            details,
          });
        });
      }
    } catch {
      // Silent fail - don't break initialization
    }
  }
}

/**
 * Convenience function to create and initialize authentication manager
 */
export async function createAuthenticationManager(): Promise<AuthenticationManager> {
  const authManager = AuthenticationManager.getInstance();
  await authManager.initialize();
  return authManager;
}
