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
  baseUrl: string;
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

export interface DeviceFlowInitiateResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
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
      baseUrl:
        config?.baseUrl || serverConfig.githubHost || 'https://github.com',
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
    additionalParams?: Record<string, string>,
    resourceUri?: string
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
      // RFC 8707: Resource parameter for MCP compliance
      resource: resourceUri || this.getResourceUri(),
      ...additionalParams,
    });

    return `${this.config.authorizationUrl}?${params.toString()}`;
  }

  /**
   * Get the resource URI for this MCP server (RFC 8707)
   */
  private getResourceUri(): string {
    const serverConfig = ConfigManager.getConfig();

    // Use configured resource URI or derive from server configuration
    const baseUrl = serverConfig.githubHost || 'https://api.github.com';

    // For MCP servers, the resource should identify this specific server instance
    return process.env.MCP_SERVER_RESOURCE_URI || `${baseUrl}/mcp-server`;
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
    redirectUriOverride?: string,
    resourceUri?: string
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
          // RFC 8707: Include resource parameter in token request
          resource: resourceUri || this.getResourceUri(),
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
   * Validate access token against GitHub API with audience validation
   *
   * CRITICAL SECURITY: Implements RFC 8707 audience validation as required by MCP spec.
   * MCP servers MUST validate that tokens were issued specifically for them to prevent
   * confused deputy attacks and ensure tokens aren't reused across different services.
   */
  async validateToken(
    token: string,
    expectedAudience?: string
  ): Promise<TokenValidation> {
    if (!this.config) throw new Error('OAuth not initialized');

    try {
      const serverConfig = ConfigManager.getConfig();
      const baseUrl = serverConfig.githubHost
        ? `${serverConfig.githubHost}/api/v3`
        : 'https://api.github.com';

      // Step 1: Basic token validation with GitHub API
      const response = await fetch(`${baseUrl}/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': this.config.userAgent,
        },
      });

      if (!response.ok) {
        await this.logOAuthEvent('token_validation', 'failure', {
          error: 'GitHub API validation failed',
          status: response.status,
          statusText: response.statusText,
        });

        return {
          valid: false,
          scopes: [],
          error: `Token validation failed: ${response.status} ${response.statusText}`,
        };
      }

      const scopes = response.headers.get('x-oauth-scopes')?.split(', ') || [];

      // Step 2: CRITICAL - Audience validation (RFC 8707 compliance)
      const resourceUri = expectedAudience || this.getResourceUri();
      const audienceValidation = await this.validateTokenAudience(
        token,
        resourceUri
      );

      if (!audienceValidation.validAudience) {
        await this.logOAuthEvent('token_validation', 'failure', {
          error: 'Token audience validation failed',
          expectedAudience: resourceUri,
          reason: audienceValidation.error,
          clientId: this.config.clientId,
        });

        return {
          valid: false,
          scopes: [],
          error: `Token audience validation failed: ${audienceValidation.error}`,
        };
      }

      // Success - log for audit trail
      await this.logOAuthEvent('token_validation', 'success', {
        scopes: scopes,
        audience: resourceUri,
        clientId: this.config.clientId,
      });

      return {
        valid: true,
        scopes,
        expiresAt: audienceValidation.expiresAt,
      };
    } catch (error) {
      await this.logOAuthEvent('token_validation', 'failure', {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        valid: false,
        scopes: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Validate token audience (RFC 8707 Resource Indicators)
   *
   * SECURITY CRITICAL: This method prevents confused deputy attacks by ensuring
   * tokens were issued specifically for this MCP server. It validates that the
   * token was issued by our OAuth application, not by a different one.
   *
   * Implementation uses GitHub's token introspection API to verify the token's
   * provenance and ensure it matches our configured client_id.
   */
  private async validateTokenAudience(
    token: string,
    _expectedResource: string
  ): Promise<{
    validAudience: boolean;
    error?: string;
    expiresAt?: Date;
  }> {
    try {
      const serverConfig = ConfigManager.getConfig();
      const baseUrl = serverConfig.githubHost
        ? `${serverConfig.githubHost}/api/v3`
        : 'https://api.github.com';

      // Use GitHub's token introspection API to verify token metadata
      // POST /applications/{client_id}/token - Check token validity and ownership
      const introspectionUrl = `${baseUrl}/applications/${this.config!.clientId}/token`;

      const basicAuth = Buffer.from(
        `${this.config!.clientId}:${this.config!.clientSecret}`
      ).toString('base64');

      const introspectionResponse = await fetch(introspectionUrl, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': this.config!.userAgent,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          access_token: token,
        }),
      });

      if (!introspectionResponse.ok) {
        // If introspection fails, the token might not be from our app
        return {
          validAudience: false,
          error: `Token introspection failed: ${introspectionResponse.status} - Token may not be issued by this OAuth application`,
        };
      }

      const tokenData = await introspectionResponse.json();

      // Critical check: Verify token was issued by our OAuth application
      const isOurToken = tokenData.app?.client_id === this.config!.clientId;

      if (!isOurToken) {
        return {
          validAudience: false,
          error: `Token was issued by client_id '${tokenData.app?.client_id || 'unknown'}' but this server expects '${this.config!.clientId}'`,
        };
      }

      // Additional validation: Check if token is still active
      if (tokenData.expires_at) {
        const expiresAt = new Date(tokenData.expires_at);
        if (expiresAt <= new Date()) {
          return {
            validAudience: false,
            error: 'Token has expired according to introspection data',
          };
        }

        return {
          validAudience: true,
          expiresAt,
        };
      }

      // Token is valid and issued by our application
      return { validAudience: true };
    } catch (error) {
      // Network or parsing errors during audience validation
      return {
        validAudience: false,
        error: `Audience validation error: ${error instanceof Error ? error.message : String(error)}`,
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
      baseUrl: this.config.baseUrl,
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
    const charsetLength = charset.length;
    const maxValidValue = Math.floor(256 / charsetLength) * charsetLength - 1;

    while (result.length < length) {
      const randomBytes = crypto.randomBytes(length * 2); // Generate extra bytes to account for rejections

      for (let i = 0; i < randomBytes.length && result.length < length; i++) {
        const byteValue = randomBytes[i];
        if (byteValue !== undefined && byteValue <= maxValidValue) {
          result += charset.charAt(byteValue % charsetLength);
        }
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
   * Initiate GitHub Device Flow (RFC 8628)
   */
  async initiateDeviceFlow(
    scopes: string[]
  ): Promise<DeviceFlowInitiateResponse> {
    if (!this.config) throw new Error('OAuth not initialized');

    try {
      const response = await fetch(`${this.config.baseUrl}/login/device/code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': this.config.userAgent,
        },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          scope: scopes.join(' '),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Device flow initiation failed: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(
          `Device flow error: ${data.error_description || data.error}`
        );
      }

      // Log successful device flow initiation
      await this.logOAuthEvent('device_flow_initiate', 'success', {
        userCode: data.user_code,
        expiresIn: data.expires_in,
        interval: data.interval,
      });

      return {
        device_code: data.device_code,
        user_code: data.user_code,
        verification_uri: data.verification_uri,
        verification_uri_complete: data.verification_uri_complete,
        expires_in: data.expires_in,
        interval: data.interval,
      };
    } catch (error) {
      await this.logOAuthEvent('device_flow_initiate', 'failure', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Poll for Device Flow token completion (RFC 8628)
   */
  async pollDeviceFlowToken(
    deviceCode: string,
    interval: number
  ): Promise<TokenResponse> {
    if (!this.config) throw new Error('OAuth not initialized');

    const startTime = Date.now();
    const maxWaitTime = 15 * 60 * 1000; // 15 minutes max

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const response = await fetch(
          `${this.config.baseUrl}/login/oauth/access_token`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Accept: 'application/json',
              'User-Agent': this.config.userAgent,
            },
            body: new URLSearchParams({
              client_id: this.config.clientId,
              device_code: deviceCode,
              grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Device flow token request failed: ${response.status} ${response.statusText} - ${errorText}`
          );
        }

        const data = await response.json();

        if (data.error) {
          if (data.error === 'authorization_pending') {
            // User hasn't completed authorization yet, continue polling
            await new Promise(resolve => setTimeout(resolve, interval * 1000));
            continue;
          } else if (data.error === 'slow_down') {
            // Increase polling interval
            interval += 5;
            await new Promise(resolve => setTimeout(resolve, interval * 1000));
            continue;
          } else if (data.error === 'expired_token') {
            throw new Error(
              'Device code has expired. Please start a new device flow.'
            );
          } else if (data.error === 'access_denied') {
            throw new Error('User denied the authorization request.');
          } else {
            throw new Error(
              `Device flow error: ${data.error_description || data.error}`
            );
          }
        }

        // Success! We have a token
        const tokenResponse = {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          tokenType: data.token_type || 'Bearer',
          expiresIn: data.expires_in || 3600,
          scope: data.scope || this.config.scopes.join(' '),
        };

        // Log successful device flow completion
        await this.logOAuthEvent('device_flow_complete', 'success', {
          expiresIn: tokenResponse.expiresIn,
          scope: tokenResponse.scope,
        });

        return tokenResponse;
      } catch (error) {
        if (error instanceof Error && error.message.includes('expired')) {
          throw error; // Don't retry on expired tokens
        }
        // For other errors, wait and retry
        await new Promise(resolve => setTimeout(resolve, interval * 1000));
      }
    }

    throw new Error('Device flow timed out after 15 minutes');
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
