/**
 * OAuth MCP Tools
 *
 * Provides complete OAuth 2.0/2.1 authentication flow as MCP tools.
 * Integrates with existing OAuthManager, token management, and security infrastructure.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { withSecurityValidation } from '../utils/withSecurityValidation.js';
import { createResult } from '../../responses.js';
import { generateHints } from '../utils/hints_consolidated.js';
import { OAuthManager } from '../../../auth/oauthManager.js';
import { ConfigManager } from '../../../config/serverConfig.js';
import { OAuthStateManager } from '../utils/oauthStateManager.js';
import { OAuthCallbackServer } from '../../../http/oauthCallbackServer.js';
import { OrganizationService } from '../../../services/organizationService.js';
import open from 'open';
import {
  getTokenMetadata,
  getGitHubToken,
  storeOAuthTokenInfo,
  clearOAuthTokens,
} from '../utils/tokenManager.js';
import {
  OAuthInitiateSchema,
  OAuthInitiateParams,
  OAuthCallbackSchema,
  OAuthCallbackParams,
  OAuthStatusSchema,
  OAuthStatusParams,
  OAuthRevokeSchema,
  OAuthRevokeParams,
} from '../scheme/oauth.js';
import { TOOL_NAMES } from '../utils/toolConstants.js';
import { handleOAuthError } from '../utils/oauthErrorHandler.js';

// Extend TOOL_NAMES to include OAuth tools
export const OAUTH_TOOL_NAMES = {
  ...TOOL_NAMES,
  OAUTH_INITIATE: 'oauthInitiate',
  OAUTH_CALLBACK: 'oauthCallback',
  OAUTH_STATUS: 'oauthStatus',
  OAUTH_REVOKE: 'oauthRevoke',
} as const;

/**
 * Shared helper to complete OAuth flow and persist tokens
 * Used by both local_server background flow and manual callback
 */
async function completeOAuthFlowAndPersist(
  tokenResponse: {
    accessToken: string;
    refreshToken?: string;
    tokenType: string;
    expiresIn: number;
    scope: string;
  },
  stateData: {
    codeVerifier: string;
    organization?: string;
    scopes: string[];
    callbackMethod: string;
    callbackPort?: number;
    clientId: string;
  },
  _callbackUrl?: string
): Promise<{
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
}> {
  // Store token information securely
  await storeOAuthTokenInfo({
    accessToken: tokenResponse.accessToken,
    refreshToken: tokenResponse.refreshToken,
    expiresAt: new Date(Date.now() + tokenResponse.expiresIn * 1000),
    scopes: tokenResponse.scope?.split(' ') || stateData.scopes,
    tokenType: tokenResponse.tokenType || 'Bearer',
    clientId: stateData.clientId,
  });

  // Optional: validate organization membership if provided
  let organizationValidation:
    | {
        organization: string;
        isMember: boolean;
        role?: string;
        visibility?: string;
        error?: string;
      }
    | undefined = undefined;

  if (stateData.organization) {
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
        // Log warning but don't fail - let the application decide
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
 * Register OAuth initiate tool
 */
export function registerOAuthInitiateTool(server: McpServer): void {
  server.registerTool(
    OAUTH_TOOL_NAMES.OAUTH_INITIATE,
    {
      description: `Start GitHub OAuth 2.0/2.1 authentication flow with PKCE security.

FEATURES:
- RFC 7636 PKCE (Proof Key for Code Exchange) support
- Configurable OAuth scopes (repo, read:user, read:org)
- Multiple callback methods: local server, manual, or deep link
- Organization membership validation support
- GitHub Enterprise Server support
- Secure state parameter generation and storage

CALLBACK METHODS:
- device_flow: GitHub Device Flow - perfect for hosted/remote servers (DEFAULT)
- local_server: Starts temporary HTTP server for automatic callback handling (opens browser automatically)
- manual: Returns code/state for manual completion via oauthCallback tool
- deep_link: Uses custom URL scheme for MCP client integration

DEVICE FLOW (Recommended for Hosted):
- User gets a simple code (e.g., "248707") to enter at github.com/login/device
- No callback URLs needed - works from any device/browser
- Server polls GitHub for completion automatically
- Perfect for hosted MCP servers, CLI tools, and headless environments

BROWSER OPENING:
- local_server method automatically opens the authorization URL in your default browser
- Set openBrowser=false to disable automatic browser opening
- Falls back to manual instructions if browser opening fails

BEST PRACTICES:
- Use device_flow for hosted/remote MCP servers
- Use local_server for local desktop applications
- Include 'read:org' scope for organization features
- Specify organization for automatic membership validation`,
      inputSchema: OAuthInitiateSchema.shape,
      annotations: {
        title: 'Initiate OAuth Flow',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    withSecurityValidation(
      async (args: OAuthInitiateParams): Promise<CallToolResult> => {
        try {
          // Initialize OAuth state manager
          OAuthStateManager.initialize();

          // Get OAuth configuration
          const config = ConfigManager.getConfig();
          if (!config.oauth?.enabled) {
            throw new Error(
              'OAuth is not configured or enabled. Set GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET environment variables.'
            );
          }

          // Validate callback method
          const validCallbackMethods = [
            'local_server',
            'manual',
            'deep_link',
            'device_flow',
          ];
          if (
            args.callbackMethod &&
            !validCallbackMethods.includes(args.callbackMethod)
          ) {
            throw new Error(
              `Invalid callback method: ${args.callbackMethod}. Must be one of: ${validCallbackMethods.join(', ')}`
            );
          }

          // Get OAuth manager (should be initialized by AuthenticationManager)
          const oauthManager = OAuthManager.getInstance();

          // Generate PKCE parameters and state
          const { codeVerifier, codeChallenge } =
            oauthManager.generatePKCEParams();
          const state = oauthManager.generateState();

          // Determine callback URL based on method
          let callbackUrl = config.oauth.redirectUri;
          let callbackServer: OAuthCallbackServer | null = null;

          if (args.callbackMethod === 'local_server') {
            callbackServer = new OAuthCallbackServer({
              port: args.callbackPort,
            });
            callbackUrl = callbackServer.getCallbackUrl();
          }

          // Create authorization URL (ensure requested scopes are applied)
          const requestedScopes = args.scopes || [
            'repo',
            'read:user',
            'read:org',
          ];
          const authorizationUrl = oauthManager.createAuthorizationUrl(
            state,
            codeChallenge,
            {
              redirect_uri: callbackUrl,
              scope: requestedScopes.join(' '),
            },
            process.env.MCP_SERVER_RESOURCE_URI // RFC 8707 resource parameter
          );

          // Store OAuth state with TTL
          await OAuthStateManager.storeOAuthState(state, {
            codeVerifier,
            organization: args.organization,
            scopes: requestedScopes,
            callbackMethod: args.callbackMethod || 'local_server',
            callbackPort: args.callbackPort,
            clientId: config.oauth.clientId,
          });

          // Handle different callback methods
          let instructions = '';
          const additionalInfo: Record<string, unknown> = {};

          // Gate deep_link by env flag in strict environments
          const allowDeepLink = process.env.ALLOW_OAUTH_DEEP_LINK === 'true';

          switch (args.callbackMethod) {
            case 'local_server':
              instructions = `
1. Visit the authorization URL in your browser
2. Authorize the application with GitHub
3. The callback will be handled automatically by the local server
4. OAuth flow will complete automatically`;

              // Start callback server in background if requested
              if (callbackServer) {
                additionalInfo.callbackUrl = callbackUrl;
                additionalInfo.localServerPort = args.callbackPort;

                // Auto-open browser if requested (default: true for local_server)
                const shouldOpenBrowser = args.openBrowser !== false;
                if (shouldOpenBrowser) {
                  try {
                    await open(authorizationUrl);
                    additionalInfo.browserOpened = true;
                    instructions = `
1. Your browser should open automatically to the GitHub authorization page
2. If it doesn't open, visit: ${authorizationUrl}
3. Authorize the application with GitHub
4. The callback will be handled automatically by the local server
5. OAuth flow will complete automatically`;
                  } catch (openError) {
                    // If browser opening fails, fall back to manual instructions
                    additionalInfo.browserOpened = false;
                    additionalInfo.browserOpenError =
                      openError instanceof Error
                        ? openError.message
                        : String(openError);
                    process.stderr.write(
                      `Warning: Failed to open browser automatically: ${openError instanceof Error ? openError.message : String(openError)}\n`
                    );
                  }
                }

                // Start listening and auto-complete the OAuth flow in background
                (async () => {
                  try {
                    const result =
                      await callbackServer.startAndWaitForCallback();

                    // Validate presence of code/state
                    if (!result.code || !result.state) {
                      return;
                    }

                    // Retrieve stored OAuth state
                    const stateData = await OAuthStateManager.getOAuthState(
                      result.state
                    );
                    if (!stateData) {
                      return;
                    }

                    // Exchange code for token
                    const tokenResponse =
                      await oauthManager.exchangeCodeForToken(
                        result.code,
                        stateData.codeVerifier,
                        result.state,
                        callbackUrl
                      );

                    // Complete OAuth flow using shared helper
                    await completeOAuthFlowAndPersist(
                      tokenResponse,
                      stateData,
                      callbackUrl
                    );

                    // Clear OAuth state
                    await OAuthStateManager.clearOAuthState(result.state);
                  } catch (bgError) {
                    // Background errors should not crash the server; log to stderr
                    process.stderr.write(
                      `Warning: OAuth local_server background handling failed: ${bgError instanceof Error ? bgError.message : String(bgError)}\n`
                    );
                  }
                })();
              }
              break;

            case 'manual':
              instructions = `
1. Visit the authorization URL in your browser
2. Authorize the application with GitHub  
3. Copy the 'code' and 'state' parameters from the callback URL
4. Use the oauthCallback tool with these parameters to complete the flow`;
              break;

            case 'deep_link':
              if (!allowDeepLink) {
                instructions = `\nDeep-link is disabled by server policy. Please use 'local_server' or 'manual' callback method.`;
                break;
              }
              instructions = `
1. Visit the authorization URL in your browser
2. Authorize the application with GitHub
3. The callback will be handled by your MCP client automatically`;
              additionalInfo.deepLinkScheme = 'mcp-oauth';
              break;

            case 'device_flow':
              // Initiate GitHub Device Flow
              try {
                const deviceFlowResult =
                  await oauthManager.initiateDeviceFlow(requestedScopes);

                instructions = `
🔐 GitHub Device Flow Authentication

1. Visit: ${deviceFlowResult.verification_uri}
2. Enter code: ${deviceFlowResult.user_code}
3. Authorize the application with GitHub
4. The server will automatically detect completion

⏱️  Code expires in ${Math.floor(deviceFlowResult.expires_in / 60)} minutes
🔄 Checking every ${deviceFlowResult.interval} seconds...`;

                additionalInfo.deviceCode = deviceFlowResult.device_code;
                additionalInfo.userCode = deviceFlowResult.user_code;
                additionalInfo.verificationUri =
                  deviceFlowResult.verification_uri;
                additionalInfo.verificationUriComplete =
                  deviceFlowResult.verification_uri_complete;
                additionalInfo.expiresIn = deviceFlowResult.expires_in;
                additionalInfo.interval = deviceFlowResult.interval;

                // Start background polling for device flow completion
                (async () => {
                  try {
                    const tokenResponse =
                      await oauthManager.pollDeviceFlowToken(
                        deviceFlowResult.device_code,
                        deviceFlowResult.interval
                      );

                    // Complete OAuth flow using shared helper
                    const stateData = {
                      codeVerifier: '', // Not used in device flow
                      organization: args.organization,
                      scopes: requestedScopes,
                      callbackMethod: 'device_flow' as const,
                      clientId: config.oauth!.clientId,
                    };

                    await completeOAuthFlowAndPersist(tokenResponse, stateData);

                    // Clear OAuth state
                    await OAuthStateManager.clearOAuthState(state);
                  } catch (deviceError) {
                    // Background errors should not crash the server; log to stderr
                    process.stderr.write(
                      `Warning: OAuth device_flow background polling failed: ${deviceError instanceof Error ? deviceError.message : String(deviceError)}\n`
                    );
                  }
                })();
              } catch (deviceFlowError) {
                // Surface a clear device-flow specific error so tests match
                const message =
                  deviceFlowError instanceof Error
                    ? deviceFlowError.message
                    : String(deviceFlowError);
                throw new Error(message);
              }
              break;
          }

          const response = {
            authorizationUrl,
            state,
            callbackMethod: args.callbackMethod || 'device_flow',
            callbackUrl,
            organization: args.organization,
            scopes: args.scopes || ['repo', 'read:user', 'read:org'],
            expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 minutes
            enterpriseServer: !authorizationUrl.includes(
              'github.com/login/oauth'
            ),
            instructions,
            ...additionalInfo,
          };

          const hints = generateHints({
            toolName: OAUTH_TOOL_NAMES.OAUTH_INITIATE,
            hasResults: true,
            totalItems: 1,
            customHints: [
              'Visit the authorizationUrl in your browser to start OAuth flow',
              `Using ${args.callbackMethod || 'local_server'} callback method`,
              args.organization
                ? `Will validate membership in ${args.organization} after OAuth`
                : 'No organization validation configured',
              'State parameter expires in 15 minutes',
              'Use oauthStatus tool to check authentication status after completion',
            ],
          });

          return createResult({
            data: response,
            hints,
          });
        } catch (error) {
          const { error: specificError, hints: customHints } =
            handleOAuthError(error);

          const hints = generateHints({
            toolName: OAUTH_TOOL_NAMES.OAUTH_INITIATE,
            hasResults: false,
            totalItems: 0,
            errorMessage: specificError,
            customHints,
          });

          return createResult({
            isError: true,
            error: specificError,
            hints,
          });
        }
      }
    )
  );
}

/**
 * Register OAuth callback tool
 */
export function registerOAuthCallbackTool(server: McpServer): void {
  server.registerTool(
    OAUTH_TOOL_NAMES.OAUTH_CALLBACK,
    {
      description: `Complete GitHub OAuth 2.0/2.1 authentication flow with authorization code.

FEATURES:
- Validates state parameter against stored value
- Exchanges authorization code for access token using PKCE
- Stores tokens securely in credential store
- Validates organization membership (if configured)
- Integrates with existing token management system
- Supports token refresh and expiration handling

USAGE:
- Use after oauthInitiate with manual callback method
- Provide code and state parameters from GitHub callback URL
- Token will be stored and used for subsequent API calls
- Organization membership will be validated if specified during initiate

SECURITY:
- State parameter prevents CSRF attacks
- PKCE prevents authorization code interception
- Tokens are stored securely and encrypted`,
      inputSchema: OAuthCallbackSchema.shape,
      annotations: {
        title: 'Complete OAuth Flow',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    withSecurityValidation(
      async (args: OAuthCallbackParams): Promise<CallToolResult> => {
        try {
          // Retrieve stored OAuth state
          const stateData = await OAuthStateManager.getOAuthState(args.state);
          if (!stateData) {
            throw new Error(
              'Invalid or expired OAuth state. Please start a new OAuth flow.'
            );
          }

          // Get OAuth manager (should be initialized by AuthenticationManager)
          const oauthManager = OAuthManager.getInstance();

          // Exchange code for token (with resource parameter for RFC 8707 compliance)
          const tokenResponse = await oauthManager.exchangeCodeForToken(
            args.code,
            stateData.codeVerifier,
            args.state,
            undefined, // redirectUriOverride
            process.env.MCP_SERVER_RESOURCE_URI // resourceUri for MCP compliance
          );

          // Complete OAuth flow using shared helper
          const response = await completeOAuthFlowAndPersist(
            tokenResponse,
            stateData
          );

          // Clear OAuth state
          await OAuthStateManager.clearOAuthState(args.state);

          const hints = generateHints({
            toolName: OAUTH_TOOL_NAMES.OAUTH_CALLBACK,
            hasResults: true,
            totalItems: 1,
            customHints: [
              'OAuth flow completed successfully',
              'Access token stored securely and will be used for API calls',
              response.hasRefreshToken
                ? 'Refresh token available for automatic renewal'
                : 'No refresh token provided',
              response.organization?.isMember
                ? `✅ Confirmed membership in ${stateData.organization}`
                : response.organization?.organization
                  ? `⚠️  Not a member of ${stateData.organization}`
                  : 'No organization validation performed',
              'Use oauthStatus tool to check current authentication status',
            ],
          });

          return createResult({
            data: response,
            hints,
          });
        } catch (error) {
          const { error: specificError, hints: customHints } =
            handleOAuthError(error);

          // Log security events for audit purposes
          try {
            const { AuditLogger } = await import(
              '../../../security/auditLogger.js'
            );
            const errorMessage =
              error instanceof Error ? error.message : String(error);

            // Detect specific security violations
            let securityViolation: string | undefined;
            if (
              errorMessage.includes('State parameter validation failed') ||
              errorMessage.includes('CSRF') ||
              errorMessage.includes('state mismatch') ||
              errorMessage.includes('Invalid time value')
            ) {
              securityViolation = 'state_mismatch';
            } else if (errorMessage.includes('PKCE verification failed')) {
              securityViolation = 'pkce_verification_failed';
            } else if (
              errorMessage.includes('authorization code interception')
            ) {
              securityViolation = 'code_interception';
            } else if (
              errorMessage.includes('Invalid or expired OAuth state')
            ) {
              securityViolation = 'expired_state';
            }

            AuditLogger.logEvent({
              action: 'oauth_callback',
              outcome: 'failure',
              source: 'tool_execution',
              details: {
                error: errorMessage,
                code: args.code ? 'provided' : 'missing',
                state: args.state ? 'provided' : 'missing',
                ...(securityViolation && { securityViolation }),
              },
            });
          } catch (auditError) {
            // Don't fail the main operation if audit logging fails
            process.stderr.write(`Audit logging failed: ${auditError}\n`);
          }

          const hints = generateHints({
            toolName: OAUTH_TOOL_NAMES.OAUTH_CALLBACK,
            hasResults: false,
            totalItems: 0,
            errorMessage: specificError,
            customHints,
          });

          return createResult({
            isError: true,
            error: specificError,
            hints,
          });
        }
      }
    )
  );
}

/**
 * Register OAuth status tool
 */
export function registerOAuthStatusTool(server: McpServer): void {
  server.registerTool(
    OAUTH_TOOL_NAMES.OAUTH_STATUS,
    {
      description: `Check current GitHub OAuth authentication status and token information.

FEATURES:
- Shows current authentication source (oauth, github_app, env, cli)
- Displays token expiration and scope information
- Lists organization memberships (with read:org scope)
- Shows permission capabilities
- Validates token freshness and refresh status
- Provides troubleshooting information

INFORMATION RETURNED:
- Authentication status and token source
- Token expiration time and remaining validity
- OAuth scopes granted by user
- Organization memberships (if read:org scope available)
- Token refresh capabilities
- Permission summary

TROUBLESHOOTING:
- Use to diagnose authentication issues
- Check if token has required scopes
- Verify organization access permissions`,
      inputSchema: OAuthStatusSchema.shape,
      annotations: {
        title: 'Check OAuth Status',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    withSecurityValidation(
      async (args: OAuthStatusParams): Promise<CallToolResult> => {
        try {
          // Get token metadata
          const metadata = await getTokenMetadata();

          // Basic response structure
          const response: {
            authenticated: boolean;
            source: string;
            tokenType?: string;
            expiresAt?: string;
            expiresIn?: number;
            isExpired?: boolean;
            scopes?: string[];
            clientId?: string;
            organizations?: string[];
            organizationsError?: string;
            permissions?: {
              canAccessOrganizations: boolean;
              canAccessPrivateRepos: boolean;
              canReadUser: boolean;
              hasRefreshCapability: boolean;
            };
          } = {
            authenticated:
              !!metadata &&
              (metadata.source === 'oauth' ||
                metadata.source === 'github_app' ||
                metadata.source === 'env' ||
                metadata.source === 'cli' ||
                metadata.source === 'authorization'),
            source: metadata?.source || 'unknown',
            tokenType: 'Bearer', // OAuth tokens are always Bearer type
          };

          if (metadata) {
            // Add token information
            if (metadata.expiresAt) {
              response.expiresAt = metadata.expiresAt.toISOString();
              response.expiresIn = Math.max(
                0,
                Math.floor((metadata.expiresAt.getTime() - Date.now()) / 1000)
              );
              response.isExpired = metadata.expiresAt <= new Date();
            }

            if (args.includeScopes && metadata.scopes) {
              response.scopes = metadata.scopes;
            }

            if (metadata.clientId) {
              response.clientId = metadata.clientId;
            }

            // Check organization information if requested
            if (
              args.includeOrganizations &&
              metadata.scopes?.includes('read:org')
            ) {
              try {
                const orgService = new OrganizationService();
                const organizations = await orgService.getUserOrganizations();
                response.organizations = organizations.map(org => org.login);
              } catch (orgError) {
                response.organizationsError = 'Failed to fetch organizations';
              }
            }

            // Add permission analysis
            response.permissions = {
              canAccessOrganizations:
                metadata.scopes?.includes('read:org') || false,
              canAccessPrivateRepos: metadata.scopes?.includes('repo') || false,
              canReadUser:
                metadata.scopes?.includes('read:user') ||
                metadata.scopes?.includes('user') ||
                false,
              hasRefreshCapability:
                metadata.source === 'oauth' &&
                !!(metadata as { refreshToken?: string }).refreshToken,
            };
          }

          const hints = generateHints({
            toolName: OAUTH_TOOL_NAMES.OAUTH_STATUS,
            hasResults: !!metadata,
            totalItems: 1,
            customHints: metadata
              ? [
                  `Authenticated via ${metadata.source}`,
                  metadata.expiresAt
                    ? `Token expires ${metadata.expiresAt > new Date() ? 'in' : ''} ${Math.abs(Math.floor((metadata.expiresAt.getTime() - Date.now()) / 1000 / 60))} minutes`
                    : 'Token expiration unknown',
                  metadata.scopes?.includes('read:org')
                    ? 'Has organization read permissions'
                    : 'Missing read:org scope for organization features',
                  metadata.scopes?.includes('repo')
                    ? 'Has repository access permissions'
                    : 'Limited repository access',
                  'Use oauthRevoke to revoke current token',
                ]
              : [
                  'No authentication token found',
                  'Use oauthInitiate to start OAuth flow',
                  'Or set GITHUB_TOKEN environment variable',
                  'Check GitHub CLI authentication with `gh auth status`',
                ],
          });

          return createResult({
            data: response,
            hints,
          });
        } catch (error) {
          const { error: specificError, hints: customHints } =
            handleOAuthError(error);

          const hints = generateHints({
            toolName: OAUTH_TOOL_NAMES.OAUTH_STATUS,
            hasResults: false,
            totalItems: 0,
            errorMessage: specificError,
            customHints,
          });

          return createResult({
            isError: true,
            error: specificError,
            hints,
          });
        }
      }
    )
  );
}

/**
 * Register OAuth revoke tool
 */
export function registerOAuthRevokeTool(server: McpServer): void {
  server.registerTool(
    OAUTH_TOOL_NAMES.OAUTH_REVOKE,
    {
      description: `Revoke current GitHub OAuth token and clear stored credentials.

FEATURES:
- Revokes access token with GitHub API
- Optionally revokes refresh token
- Clears all stored OAuth credentials
- Logs revocation for audit purposes
- Supports both GitHub.com and GitHub Enterprise Server
- Graceful handling of already-revoked tokens

SECURITY:
- Immediately invalidates access token
- Removes tokens from secure credential store
- Prevents further API access with revoked token
- Audit logging for enterprise compliance

USAGE:
- Use when switching authentication methods
- Use for security cleanup
- Use before application shutdown
- Use to test OAuth flow restart`,
      inputSchema: OAuthRevokeSchema.shape,
      annotations: {
        title: 'Revoke OAuth Token',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    withSecurityValidation(
      async (args: OAuthRevokeParams): Promise<CallToolResult> => {
        try {
          // Get current token metadata
          const metadata = await getTokenMetadata();

          if (!metadata || metadata.source !== 'oauth') {
            return createResult({
              data: {
                success: true,
                message: 'No OAuth token found to revoke',
                wasRevoked: false,
                tokensCleared: false,
                remoteRevoked: false,
              },
              hints: generateHints({
                toolName: OAUTH_TOOL_NAMES.OAUTH_REVOKE,
                hasResults: true,
                totalItems: 1,
                customHints: [
                  'No OAuth token was active',
                  'Current authentication may be from different source',
                  'Use oauthStatus to check current authentication method',
                ],
              }),
            });
          }

          // Get OAuth manager (should be initialized by AuthenticationManager)
          const oauthManager = OAuthManager.getInstance();

          const revokeResults: {
            accessTokenRevoked: boolean;
            refreshTokenRevoked: boolean;
            errors: string[];
          } = {
            accessTokenRevoked: false,
            refreshTokenRevoked: false,
            errors: [],
          };

          // Revoke current OAuth access token with GitHub API if available and requested
          if (metadata.source === 'oauth' && args.revokeRemote !== false) {
            try {
              const currentToken = await getGitHubToken();
              if (currentToken) {
                await oauthManager.revokeToken(currentToken);
                revokeResults.accessTokenRevoked = true;
              }
            } catch (revokeError) {
              revokeResults.errors.push(
                `Access token revocation failed: ${revokeError instanceof Error ? revokeError.message : String(revokeError)}`
              );
            }
          }

          // Clear stored OAuth tokens
          await clearOAuthTokens();

          const response = {
            success: true,
            message: 'OAuth tokens revoked and cleared',
            wasRevoked: true,
            tokensCleared: true,
            remoteRevoked: revokeResults.accessTokenRevoked,
            details: revokeResults,
          };

          const hints = generateHints({
            toolName: OAUTH_TOOL_NAMES.OAUTH_REVOKE,
            hasResults: true,
            totalItems: 1,
            customHints: [
              'OAuth tokens revoked successfully',
              'All stored credentials have been cleared',
              revokeResults.errors.length > 0
                ? 'Some revocation errors occurred (tokens still cleared locally)'
                : 'Revocation completed without errors',
              'Use oauthInitiate to start a new OAuth flow',
              'Authentication will fall back to other configured methods',
            ],
          });

          return createResult({
            data: response,
            hints,
          });
        } catch (error) {
          const { error: specificError, hints: customHints } =
            handleOAuthError(error);

          const hints = generateHints({
            toolName: OAUTH_TOOL_NAMES.OAUTH_REVOKE,
            hasResults: false,
            totalItems: 0,
            errorMessage: specificError,
            customHints,
          });

          return createResult({
            isError: true,
            error: specificError,
            hints,
          });
        }
      }
    )
  );
}

/**
 * Register all OAuth tools
 */
export function registerAllOAuthTools(server: McpServer): void {
  registerOAuthInitiateTool(server);
  registerOAuthCallbackTool(server);
  registerOAuthStatusTool(server);
  registerOAuthRevokeTool(server);
}
