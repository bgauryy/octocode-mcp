import crypto from 'crypto';
import { ConfigManager } from '../config/serverConfig.js';

/**
 * OAuth 2.0/2.1 Flow Manager
 *
 * Provides comprehensive OAuth 2.0/2.1 authentication support with PKCE,
 * secure state validation, and automatic token refresh capabilities.
 *
 * Features:
 * - RFC 6749 OAuth 2.0 compliance
 * - RFC 7636 PKCE (Proof Key for Code Exchange) support
 * - Secure state parameter generation and validation
 * - Automatic token refresh with retry logic
 * - GitHub Enterprise Server support
 * - Enterprise audit logging integration
 */

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  authorizationUrl: string;
  tokenUrl: string;
  userAgent: string;
}

export interface PKCEParams {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

export interface AuthorizationResult {
  authorizationUrl: string;
  state: string;
  codeVerifier: string;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresIn: number;
  scope: string;
}

export interface TokenValidation {
  valid: boolean;
  scopes: string[];
  expiresAt?: Date;
  error?: string;
}

export class OAuthManager {
  private static instance: OAuthManager;
  private config: OAuthConfig | null = null;

  static getInstance(): OAuthManager {
    if (!this.instance) {
      this.instance = new OAuthManager();
    }
    return this.instance;
  }

  /**
   * Initialize OAuth manager with configuration
   */
  initialize(config?: Partial<OAuthConfig>): void {
    const serverConfig = ConfigManager.getConfig();

    if (!serverConfig.oauth?.enabled) {
      throw new Error('OAuth not configured or disabled');
    }

    this.config = {
      clientId: config?.clientId || serverConfig.oauth.clientId,
      clientSecret: config?.clientSecret || serverConfig.oauth.clientSecret,
      redirectUri: config?.redirectUri || serverConfig.oauth.redirectUri,
      scopes: config?.scopes || serverConfig.oauth.scopes,
      authorizationUrl:
        config?.authorizationUrl ||
        serverConfig.oauth.authorizationUrl ||
        'https://github.com/login/oauth/authorize',
      tokenUrl:
        config?.tokenUrl ||
        serverConfig.oauth.tokenUrl ||
        'https://github.com/login/oauth/access_token',
      userAgent: config?.userAgent || `octocode-mcp/${serverConfig.version}`,
    };
  }

  /**
   * Generate PKCE parameters (RFC 7636)
   * Provides cryptographically secure code challenge and verifier
   */
  generatePKCEParams(): PKCEParams {
    const codeVerifier = this.generateRandomString(128);
    const codeChallenge = this.base64URLEncode(
      crypto.createHash('sha256').update(codeVerifier).digest()
    );
    return {
      codeVerifier,
      codeChallenge,
      codeChallengeMethod: 'S256',
    };
  }

  /**
   * Generate cryptographically secure state parameter
   */
  generateState(): string {
    return this.generateRandomString(32);
  }

  /**
   * Create authorization URL with PKCE and state parameters
   */
  createAuthorizationUrl(
    state: string,
    codeChallenge: string,
    additionalParams?: Record<string, string>
  ): string {
    if (!this.config) throw new Error('OAuth not initialized');

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(' '),
      response_type: 'code',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      ...additionalParams,
    });

    return `${this.config.authorizationUrl}?${params.toString()}`;
  }

  /**
   * Start OAuth authorization flow
   * Returns authorization URL and flow parameters
   */
  startAuthorizationFlow(
    additionalParams?: Record<string, string>
  ): AuthorizationResult {
    if (!this.config) throw new Error('OAuth not initialized');

    const { codeVerifier, codeChallenge } = this.generatePKCEParams();
    const state = this.generateState();

    const authorizationUrl = this.createAuthorizationUrl(
      state,
      codeChallenge,
      additionalParams
    );

    return {
      authorizationUrl,
      state,
      codeVerifier,
    };
  }

  /**
   * Exchange authorization code for access token (RFC 6749 Section 4.1.3)
   */
  async exchangeCodeForToken(
    code: string,
    codeVerifier: string,
    state?: string,
    redirectUriOverride?: string
  ): Promise<TokenResponse> {
    if (!this.config) throw new Error('OAuth not initialized');

    try {
      const response = await fetch(this.config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': this.config.userAgent,
        },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          code,
          code_verifier: codeVerifier,
          grant_type: 'authorization_code',
          redirect_uri: redirectUriOverride || this.config.redirectUri,
          ...(state && { state }),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Token exchange failed: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(`OAuth error: ${data.error_description || data.error}`);
      }

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        tokenType: data.token_type || 'Bearer',
        expiresIn: data.expires_in || 3600,
        scope: data.scope || this.config.scopes.join(' '),
      };
    } catch (error) {
      // Log error in enterprise mode
      await this.logOAuthEvent('token_exchange', 'failure', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token (RFC 6749 Section 6)
   */
  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    if (!this.config) throw new Error('OAuth not initialized');

    try {
      const response = await fetch(this.config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': this.config.userAgent,
        },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Token refresh failed: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(`OAuth error: ${data.error_description || data.error}`);
      }

      const tokenResponse = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken, // Keep old refresh token if new one not provided
        tokenType: data.token_type || 'Bearer',
        expiresIn: data.expires_in || 3600,
        scope: data.scope || this.config.scopes.join(' '),
      };

      // Log successful refresh
      await this.logOAuthEvent('token_refresh', 'success', {
        expiresIn: tokenResponse.expiresIn,
        scopes: tokenResponse.scope.split(' '),
      });

      return tokenResponse;
    } catch (error) {
      // Log error in enterprise mode
      await this.logOAuthEvent('token_refresh', 'failure', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Validate access token against GitHub API
   */
  async validateToken(token: string): Promise<TokenValidation> {
    if (!this.config) throw new Error('OAuth not initialized');

    try {
      const serverConfig = ConfigManager.getConfig();
      const baseUrl = serverConfig.githubHost
        ? `${serverConfig.githubHost}/api/v3`
        : 'https://api.github.com';

      const response = await fetch(`${baseUrl}/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': this.config.userAgent,
        },
      });

      if (!response.ok) {
        return {
          valid: false,
          scopes: [],
          error: `Token validation failed: ${response.status} ${response.statusText}`,
        };
      }

      const scopes = response.headers.get('x-oauth-scopes')?.split(', ') || [];

      return {
        valid: true,
        scopes,
      };
    } catch (error) {
      return {
        valid: false,
        scopes: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Validate state parameter with timing-safe comparison
   */
  validateState(receivedState: string, expectedState: string): boolean {
    if (!receivedState || !expectedState) return false;
    if (receivedState.length !== expectedState.length) return false;

    try {
      return crypto.timingSafeEqual(
        Buffer.from(receivedState),
        Buffer.from(expectedState)
      );
    } catch {
      return false;
    }
  }

  /**
   * Revoke access token (if supported by provider)
   */
  async revokeToken(token: string): Promise<void> {
    if (!this.config) throw new Error('OAuth not initialized');

    try {
      const serverConfig = ConfigManager.getConfig();
      const apiBase = serverConfig.githubHost
        ? `${serverConfig.githubHost}/api/v3`
        : 'https://api.github.com';

      // GitHub Applications API: Revoke a grant for an application
      // DELETE /applications/{client_id}/grant with Basic auth (client_id:client_secret)
      const revokeUrl = `${apiBase}/applications/${this.config.clientId}/grant`;

      const basicAuth = Buffer.from(
        `${this.config.clientId}:${this.config.clientSecret}`
      ).toString('base64');

      const response = await fetch(revokeUrl, {
        method: 'DELETE',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': this.config.userAgent,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ access_token: token }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `Token revocation failed: ${response.status} ${response.statusText}${
            text ? ` - ${text}` : ''
          }`
        );
      }

      await this.logOAuthEvent('token_revocation', 'success', {});
    } catch (error) {
      await this.logOAuthEvent('token_revocation', 'failure', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get current OAuth configuration (without secrets)
   */
  getConfig(): Omit<OAuthConfig, 'clientSecret'> | null {
    if (!this.config) return null;

    return {
      clientId: this.config.clientId,
      redirectUri: this.config.redirectUri,
      scopes: this.config.scopes,
      authorizationUrl: this.config.authorizationUrl,
      tokenUrl: this.config.tokenUrl,
      userAgent: this.config.userAgent,
    };
  }

  // Private helper methods

  /**
   * Generate cryptographically secure random string
   */
  private generateRandomString(length: number): string {
    const charset =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let result = '';
    const randomBytes = crypto.randomBytes(length);

    for (let i = 0; i < length; i++) {
      const byteValue = randomBytes[i];
      if (byteValue !== undefined) {
        result += charset.charAt(byteValue % charset.length);
      }
    }

    return result;
  }

  /**
   * Base64URL encode (RFC 7636)
   */
  private base64URLEncode(buffer: Buffer): string {
    return buffer
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Log OAuth events in enterprise mode
   */
  private async logOAuthEvent(
    action: string,
    outcome: 'success' | 'failure',
    details: Record<string, unknown>
  ): Promise<void> {
    try {
      const serverConfig = ConfigManager.getConfig();
      if (serverConfig.enterprise?.auditLogging) {
        const { AuditLogger } = await import('../security/auditLogger.js');
        AuditLogger.logEvent({
          action: `oauth_${action}`,
          outcome,
          source: 'auth',
          details: {
            ...details,
            clientId: this.config?.clientId,
          },
        });
      }
    } catch {
      // Ignore audit logging errors
    }
  }
}

// Convenience functions
export async function createOAuthManager(
  config?: Partial<OAuthConfig>
): Promise<OAuthManager> {
  const manager = OAuthManager.getInstance();
  manager.initialize(config);
  return manager;
}

export { OAuthManager as default };
