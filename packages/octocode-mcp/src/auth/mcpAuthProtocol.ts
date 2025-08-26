/**
 * MCP Authorization Protocol Integration
 *
 * Implements the Model Context Protocol Authorization specification
 * for secure OAuth 2.0/2.1 authentication with GitHub.
 *
 * Based on MCP Authorization Protocol specification:
 * https://modelcontextprotocol.io/specification/draft/basic/authorization
 *
 * Features:
 * - RFC 6750 Bearer token authentication
 * - WWW-Authenticate header support
 * - Protected resource metadata
 * - OAuth 2.1 authorization server discovery
 * - PKCE flow integration
 * - Enterprise GitHub Server support
 */

import { ConfigManager } from '../serverConfig.js';
import { OAuthManager } from './oauthManager.js';
import { GitHubAppManager } from './githubAppManager.js';

export interface MCPAuthChallenge {
  scheme: 'Bearer';
  realm?: string;
  scope?: string;
  error?: string;
  error_description?: string;
  resource_metadata?: string;
}

export interface ProtectedResourceMetadata {
  authorization_servers: AuthorizationServerInfo[];
  resource_server: ResourceServerInfo;
  scopes_supported: string[];
  client_registration?: ClientRegistrationInfo;
}

export interface AuthorizationServerInfo {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  scopes_supported: string[];
  response_types_supported: string[];
  grant_types_supported: string[];
  code_challenge_methods_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  revocation_endpoint?: string;
  introspection_endpoint?: string;
  registration_endpoint?: string;
}

export interface ResourceServerInfo {
  resource_server_id: string;
  resource_server_name: string;
  resource_server_icon?: string;
  resource_server_description?: string;
}

export interface ClientRegistrationInfo {
  registration_endpoint?: string;
  supported: boolean;
  client_id_issued_at?: number;
  client_secret_expires_at?: number;
}

export interface MCPAuthRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}

export interface MCPAuthResponse {
  status: number;
  headers: Record<string, string>;
  body?: unknown;
}

export class MCPAuthProtocol {
  private static instance: MCPAuthProtocol;
  private oauthManager: OAuthManager | null = null;
  private githubAppManager: GitHubAppManager | null = null;

  static getInstance(): MCPAuthProtocol {
    if (!this.instance) {
      this.instance = new MCPAuthProtocol();
    }
    return this.instance;
  }

  /**
   * Initialize MCP Auth Protocol with OAuth and GitHub App managers
   */
  async initialize(): Promise<void> {
    const config = ConfigManager.getConfig();

    // Initialize OAuth manager if configured
    if (config.oauth?.enabled) {
      this.oauthManager = OAuthManager.getInstance();
      this.oauthManager.initialize();
    }

    // Initialize GitHub App manager if configured
    if (config.githubApp?.enabled) {
      this.githubAppManager = GitHubAppManager.getInstance();
      this.githubAppManager.initialize();
    }
  }

  /**
   * Handle MCP authentication challenge
   * Returns 401 Unauthorized with WWW-Authenticate header
   */
  createAuthChallenge(
    realm?: string,
    scope?: string,
    error?: string,
    error_description?: string
  ): MCPAuthResponse {
    const config = ConfigManager.getConfig();
    const baseUrl = config.githubHost || 'https://github.com';
    const resourceMetadataUrl = `${baseUrl}/.well-known/mcp-resource-metadata`;

    const challenge: MCPAuthChallenge = {
      scheme: 'Bearer',
      ...(realm && { realm }),
      ...(scope && { scope }),
      ...(error && { error }),
      ...(error_description && { error_description }),
      resource_metadata: resourceMetadataUrl,
    };

    const wwwAuthenticateHeader = this.formatWWWAuthenticateHeader(challenge);

    return {
      status: 401,
      headers: {
        'WWW-Authenticate': wwwAuthenticateHeader,
        'Content-Type': 'application/json',
      },
      body: {
        error: error || 'unauthorized',
        error_description:
          error_description ||
          'Valid GitHub access token required in Authorization header',
        resource_metadata: resourceMetadataUrl,
      },
    };
  }

  /**
   * Get protected resource metadata
   * Implements MCP Authorization Protocol resource discovery
   */
  getProtectedResourceMetadata(): ProtectedResourceMetadata {
    const config = ConfigManager.getConfig();
    const baseUrl = config.githubHost || 'https://github.com';
    const apiBaseUrl = config.githubHost
      ? `${config.githubHost}/api/v3`
      : 'https://api.github.com';

    const authorizationServers: AuthorizationServerInfo[] = [];

    // Add OAuth authorization server if configured
    if (config.oauth?.enabled) {
      authorizationServers.push({
        issuer: baseUrl,
        authorization_endpoint:
          config.oauth.authorizationUrl || `${baseUrl}/login/oauth/authorize`,
        token_endpoint:
          config.oauth.tokenUrl || `${baseUrl}/login/oauth/access_token`,
        scopes_supported: config.oauth.scopes || [
          'repo',
          'read:user',
          'read:org',
        ],
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['client_secret_post'],
        revocation_endpoint: `${baseUrl}/login/oauth/revoke`,
      });
    }

    // Add GitHub App authorization server if configured
    if (config.githubApp?.enabled) {
      authorizationServers.push({
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/login/oauth/authorize`,
        token_endpoint: `${apiBaseUrl}/app/installations/${config.githubApp.installationId}/access_tokens`,
        scopes_supported: ['repo', 'read:user', 'read:org'],
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['private_key_jwt'],
      });
    }

    return {
      authorization_servers: authorizationServers,
      resource_server: {
        resource_server_id: 'github-api',
        resource_server_name: 'GitHub API',
        resource_server_icon: 'https://github.com/favicon.ico',
        resource_server_description:
          'GitHub API access for repository and organization management',
      },
      scopes_supported: [
        'repo',
        'repo:status',
        'repo_deployment',
        'public_repo',
        'repo:invite',
        'security_events',
        'read:user',
        'user:email',
        'user:follow',
        'read:org',
        'write:org',
        'admin:org',
        'read:public_key',
        'write:public_key',
        'admin:public_key',
        'read:repo_hook',
        'write:repo_hook',
        'admin:repo_hook',
        'read:org_hook',
        'write:org_hook',
        'admin:org_hook',
        'gist',
        'notifications',
        'read:discussion',
        'write:discussion',
      ],
      client_registration: {
        supported: false, // Dynamic client registration not supported
      },
    };
  }

  /**
   * Validate Bearer token from Authorization header
   */
  async validateBearerToken(authorizationHeader: string): Promise<{
    valid: boolean;
    token?: string;
    error?: string;
    scopes?: string[];
  }> {
    try {
      // Extract Bearer token
      const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
      if (!match) {
        return {
          valid: false,
          error:
            'Invalid authorization header format. Expected: Bearer <token>',
        };
      }

      const token = match[1];

      // Validate token against GitHub API
      const config = ConfigManager.getConfig();
      const apiBaseUrl = config.githubHost
        ? `${config.githubHost}/api/v3`
        : 'https://api.github.com';

      const response = await fetch(`${apiBaseUrl}/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': `octocode-mcp/${config.version}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) {
        return {
          valid: false,
          error: `Token validation failed: ${response.status} ${response.statusText}`,
        };
      }

      // Extract scopes from response headers
      const scopes = response.headers.get('x-oauth-scopes')?.split(', ') || [];

      return {
        valid: true,
        token,
        scopes,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Handle MCP request with authentication
   */
  async handleAuthenticatedRequest(
    request: MCPAuthRequest
  ): Promise<MCPAuthResponse> {
    const authHeader =
      request.headers['Authorization'] || request.headers['authorization'];

    if (!authHeader) {
      return this.createAuthChallenge(
        'github-api',
        'repo read:user',
        'missing_token',
        'Authorization header with Bearer token is required'
      );
    }

    const validation = await this.validateBearerToken(authHeader);

    if (!validation.valid) {
      return this.createAuthChallenge(
        'github-api',
        'repo read:user',
        'invalid_token',
        validation.error || 'Token validation failed'
      );
    }

    // Token is valid, proceed with the request
    return {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        authenticated: true,
        token: validation.token,
        scopes: validation.scopes,
      },
    };
  }

  /**
   * Get OAuth authorization URL with MCP parameters
   */
  async getAuthorizationUrl(
    clientId?: string,
    redirectUri?: string,
    scopes?: string[],
    state?: string
  ): Promise<{
    authorizationUrl: string;
    state: string;
    codeVerifier: string;
  }> {
    if (!this.oauthManager) {
      throw new Error('OAuth not configured');
    }

    const config = ConfigManager.getConfig();

    // Use provided parameters or fall back to configuration
    const finalClientId = clientId || config.oauth?.clientId;
    const finalRedirectUri = redirectUri || config.oauth?.redirectUri;
    const finalScopes = scopes || config.oauth?.scopes || ['repo', 'read:user'];

    if (!finalClientId || !finalRedirectUri) {
      throw new Error('OAuth client ID and redirect URI required');
    }

    // Generate PKCE parameters
    const { codeVerifier, codeChallenge } =
      this.oauthManager.generatePKCEParams();
    const finalState = state || this.oauthManager.generateState();

    // Build authorization URL
    const authUrl = this.oauthManager.createAuthorizationUrl(
      finalState,
      codeChallenge,
      {
        client_id: finalClientId,
        redirect_uri: finalRedirectUri,
        scope: finalScopes.join(' '),
      }
    );

    return {
      authorizationUrl: authUrl,
      state: finalState,
      codeVerifier,
    };
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(
    code: string,
    codeVerifier: string,
    state?: string
  ): Promise<{
    accessToken: string;
    refreshToken?: string;
    tokenType: string;
    expiresIn: number;
    scope: string;
  }> {
    if (!this.oauthManager) {
      throw new Error('OAuth not configured');
    }

    const tokenResponse = await this.oauthManager.exchangeCodeForToken(
      code,
      codeVerifier,
      state
    );

    return {
      accessToken: tokenResponse.accessToken,
      refreshToken: tokenResponse.refreshToken,
      tokenType: tokenResponse.tokenType,
      expiresIn: tokenResponse.expiresIn,
      scope: tokenResponse.scope,
    };
  }

  /**
   * Get GitHub App installation token
   */
  async getGitHubAppToken(installationId?: number): Promise<{
    token: string;
    expiresAt: Date;
    permissions: Record<string, string>;
  }> {
    if (!this.githubAppManager) {
      throw new Error('GitHub App not configured');
    }

    const tokenInfo =
      await this.githubAppManager.getInstallationToken(installationId);

    return {
      token: tokenInfo.token,
      expiresAt: tokenInfo.expiresAt,
      permissions: tokenInfo.permissions,
    };
  }

  /**
   * Get authorization server metadata (OAuth Discovery)
   */
  getAuthorizationServerMetadata(): AuthorizationServerInfo | null {
    const config = ConfigManager.getConfig();

    if (!config.oauth?.enabled) {
      return null;
    }

    const baseUrl = config.githubHost || 'https://github.com';

    return {
      issuer: baseUrl,
      authorization_endpoint:
        config.oauth.authorizationUrl || `${baseUrl}/login/oauth/authorize`,
      token_endpoint:
        config.oauth.tokenUrl || `${baseUrl}/login/oauth/access_token`,
      scopes_supported: config.oauth.scopes || [
        'repo',
        'read:user',
        'read:org',
      ],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['client_secret_post'],
      revocation_endpoint: `${baseUrl}/login/oauth/revoke`,
    };
  }

  // Private helper methods

  /**
   * Format WWW-Authenticate header according to RFC 6750
   */
  private formatWWWAuthenticateHeader(challenge: MCPAuthChallenge): string {
    const parts = [`${challenge.scheme}`];

    if (challenge.realm) {
      parts.push(`realm="${challenge.realm}"`);
    }
    if (challenge.scope) {
      parts.push(`scope="${challenge.scope}"`);
    }
    if (challenge.error) {
      parts.push(`error="${challenge.error}"`);
    }
    if (challenge.error_description) {
      parts.push(`error_description="${challenge.error_description}"`);
    }
    if (challenge.resource_metadata) {
      parts.push(`resource_metadata="${challenge.resource_metadata}"`);
    }

    return parts.join(', ');
  }
}

// Convenience functions
export async function createMCPAuthProtocol(): Promise<MCPAuthProtocol> {
  const protocol = MCPAuthProtocol.getInstance();
  await protocol.initialize();
  return protocol;
}

export { MCPAuthProtocol as default };
