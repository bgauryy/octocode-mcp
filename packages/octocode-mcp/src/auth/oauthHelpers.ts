/**
 * OAuth Helpers
 *
 * Shared OAuth logic extracted to reduce duplication across OAuth tools.
 * Provides common functionality for token management, validation, and flow completion.
 */

import { OAuthManager, TokenResponse } from './oauthManager.js';
import { ConfigManager } from '../config/serverConfig.js';
import { OrganizationService } from '../services/organizationService.js';
import {
  storeOAuthTokenInfo,
  getTokenMetadata,
  getGitHubToken,
  clearOAuthTokens,
} from '../mcp/tools/utils/tokenManager.js';
import {
  OAuthStateManager,
  OAuthStateData,
} from '../mcp/tools/utils/oauthStateManager.js';

/**
 * OAuth flow completion result
 */
export interface OAuthFlowResult {
  success: boolean;
  tokenType: string;
  scopes: string[];
  expiresAt: string;
  hasRefreshToken: boolean;
  organization?: {
    organization: string;
    isMember: boolean;
    role?: string;
    visibility?: string;
    error?: string;
  };
}

/**
 * Complete OAuth flow and persist tokens
 * Shared helper used by multiple OAuth tools
 */
export async function completeOAuthFlow(
  tokenResponse: TokenResponse,
  stateData: Pick<OAuthStateData, 'organization' | 'scopes' | 'clientId'>,
  validateOrganization: boolean = false
): Promise<OAuthFlowResult> {
  // Store token information securely
  await storeOAuthTokenInfo({
    accessToken: tokenResponse.accessToken,
    refreshToken: tokenResponse.refreshToken,
    expiresAt: new Date(Date.now() + tokenResponse.expiresIn * 1000),
    scopes: tokenResponse.scope?.split(' ') || stateData.scopes,
    tokenType: tokenResponse.tokenType || 'Bearer',
    clientId: stateData.clientId,
  });

  // Optional organization validation
  let organizationValidation: OAuthFlowResult['organization'] = undefined;

  if (validateOrganization && stateData.organization) {
    try {
      const orgService = new OrganizationService();
      const membership = await orgService.checkMembership(
        stateData.organization
      );

      organizationValidation = {
        organization: stateData.organization,
        isMember: membership.isMember,
        role: membership.role,
        visibility: membership.visibility,
      };

      if (!membership.isMember) {
        process.stderr.write(
          `Warning: User is not a member of organization ${stateData.organization}\n`
        );
      }
    } catch (orgError) {
      organizationValidation = {
        organization: stateData.organization,
        isMember: false,
        error: `Failed to validate organization membership: ${orgError}`,
      };
    }
  }

  return {
    success: true,
    tokenType: tokenResponse.tokenType || 'Bearer',
    scopes: tokenResponse.scope?.split(' ') || stateData.scopes,
    expiresAt: new Date(
      Date.now() + tokenResponse.expiresIn * 1000
    ).toISOString(),
    hasRefreshToken: !!tokenResponse.refreshToken,
    organization: organizationValidation,
  };
}

/**
 * Check OAuth configuration
 */
export function checkOAuthConfig(): {
  isConfigured: boolean;
  error?: string;
  config?: {
    clientId: string;
    hasClientSecret: boolean;
    redirectUri: string;
    scopes: string[];
  };
} {
  const config = ConfigManager.getConfig();

  if (!config.oauth?.enabled) {
    return {
      isConfigured: false,
      error: 'OAuth not configured or disabled',
    };
  }

  if (!config.oauth.clientId || !config.oauth.clientSecret) {
    return {
      isConfigured: false,
      error: 'OAuth client credentials missing',
    };
  }

  return {
    isConfigured: true,
    config: {
      clientId: config.oauth.clientId,
      hasClientSecret: !!config.oauth.clientSecret,
      redirectUri: config.oauth.redirectUri,
      scopes: config.oauth.scopes,
    },
  };
}

/**
 * Get current OAuth status
 */
export async function getOAuthStatus(): Promise<{
  authenticated: boolean;
  source: string;
  expiresAt?: string;
  expiresIn?: number;
  scopes?: string[];
  clientId?: string;
  hasRefreshToken?: boolean;
}> {
  const metadata = await getTokenMetadata();

  if (!metadata || metadata.source !== 'oauth') {
    return {
      authenticated: false,
      source: 'none',
    };
  }

  const result: {
    authenticated: boolean;
    source: string;
    expiresAt?: string;
    expiresIn?: number;
    scopes?: string[];
    clientId?: string;
    hasRefreshToken?: boolean;
  } = {
    authenticated: true,
    source: metadata.source,
  };

  if (metadata.expiresAt) {
    result.expiresAt = metadata.expiresAt.toISOString();
    result.expiresIn = Math.max(
      0,
      Math.floor((metadata.expiresAt.getTime() - Date.now()) / 1000)
    );
  }

  if (metadata.scopes) {
    result.scopes = metadata.scopes;
  }

  if (metadata.clientId) {
    result.clientId = metadata.clientId;
  }

  // Check for refresh token capability
  const metadataWithRefresh = metadata as { refreshToken?: string };
  if ('refreshToken' in metadataWithRefresh) {
    result.hasRefreshToken = !!metadataWithRefresh.refreshToken;
  }

  return result;
}

/**
 * Revoke OAuth tokens
 */
export async function revokeOAuthTokens(): Promise<{
  success: boolean;
  wasRevoked: boolean;
  errors?: string[];
}> {
  const metadata = await getTokenMetadata();

  if (!metadata || metadata.source !== 'oauth') {
    return {
      success: true,
      wasRevoked: false,
    };
  }

  const errors: string[] = [];

  // Try to revoke with GitHub API
  try {
    const token = await getGitHubToken();
    if (token) {
      const oauthManager = OAuthManager.getInstance();
      await oauthManager.revokeToken(token);
    }
  } catch (error) {
    errors.push(
      `Revocation API error: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Clear stored tokens regardless
  await clearOAuthTokens();

  return {
    success: true,
    wasRevoked: true,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Initialize OAuth state management
 */
export function initializeOAuthState(): void {
  OAuthStateManager.initialize();
}

/**
 * Store OAuth state for flow tracking
 */
export async function storeOAuthState(
  state: string,
  codeVerifier: string,
  options: {
    organization?: string;
    scopes?: string[];
    callbackMethod?: 'local_server' | 'manual' | 'deep_link' | 'device_flow';
    callbackPort?: number;
  } = {}
): Promise<void> {
  const config = ConfigManager.getConfig();

  await OAuthStateManager.storeOAuthState(state, {
    codeVerifier,
    organization: options.organization,
    scopes: options.scopes || ['repo', 'read:user', 'read:org'],
    callbackMethod: options.callbackMethod || 'device_flow',
    callbackPort: options.callbackPort,
    clientId: config.oauth?.clientId || 'unknown',
  });
}

/**
 * Retrieve and validate OAuth state
 */
export async function getAndValidateOAuthState(
  state: string
): Promise<OAuthStateData | null> {
  return await OAuthStateManager.getOAuthState(state);
}

/**
 * Clear OAuth state after completion
 */
export async function clearOAuthState(state: string): Promise<void> {
  await OAuthStateManager.clearOAuthState(state);
}

/**
 * Generate authorization URL with PKCE
 */
export function generateAuthorizationUrl(
  options: {
    state?: string;
    codeChallenge?: string;
    scopes?: string[];
    redirectUri?: string;
    organization?: string;
  } = {}
): {
  url: string;
  state: string;
  codeVerifier: string;
  codeChallenge: string;
} {
  const oauthManager = OAuthManager.getInstance();

  // Generate PKCE if not provided
  const pkce = options.codeChallenge
    ? {
        codeVerifier: '',
        codeChallenge: options.codeChallenge,
        codeChallengeMethod: 'S256' as const,
      }
    : oauthManager.generatePKCEParams();

  // Generate state if not provided
  const state = options.state || oauthManager.generateState();

  // Create authorization URL
  const url = oauthManager.createAuthorizationUrl(
    state,
    pkce.codeChallenge,
    {
      scope: (options.scopes || ['repo', 'read:user', 'read:org']).join(' '),
      ...(options.redirectUri && { redirect_uri: options.redirectUri }),
    },
    process.env.MCP_SERVER_RESOURCE_URI
  );

  return {
    url,
    state,
    codeVerifier: pkce.codeVerifier,
    codeChallenge: pkce.codeChallenge,
  };
}

/**
 * Validate OAuth state parameter
 */
export function validateState(
  receivedState: string,
  expectedState: string
): boolean {
  const oauthManager = OAuthManager.getInstance();
  return oauthManager.validateState(receivedState, expectedState);
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  state?: string,
  redirectUri?: string
): Promise<TokenResponse> {
  const oauthManager = OAuthManager.getInstance();

  return await oauthManager.exchangeCodeForToken(
    code,
    codeVerifier,
    state,
    redirectUri,
    process.env.MCP_SERVER_RESOURCE_URI
  );
}

/**
 * Check if OAuth is properly configured
 */
export function isOAuthEnabled(): boolean {
  const { isConfigured } = checkOAuthConfig();
  return isConfigured;
}
