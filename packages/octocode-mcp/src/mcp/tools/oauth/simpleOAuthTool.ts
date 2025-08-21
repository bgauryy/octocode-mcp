/**
 * Simple OAuth Tool
 *
 * Provides a single, streamlined OAuth tool that handles the entire authentication
 * flow using GitHub's Device Flow. This is the recommended approach for most users.
 *
 * Features:
 * - Single tool for complete OAuth flow
 * - Uses GitHub Device Flow (no callback URLs needed)
 * - Automatic token refresh
 * - Minimal configuration required
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { withSecurityValidation } from '../utils/withSecurityValidation.js';
import { createResult } from '../../responses.js';
import { generateHints } from '../utils/hints_consolidated.js';
import { OAuthManager } from '../../../auth/oauthManager.js';
import { ConfigManager } from '../../../config/serverConfig.js';
import {
  storeOAuthTokenInfo,
  getTokenMetadata,
  clearOAuthTokens,
} from '../utils/tokenManager.js';
import { TOOL_NAMES } from '../utils/toolConstants.js';
import { handleOAuthError } from '../utils/oauthErrorHandler.js';

// Simple OAuth Schema
export const SimpleOAuthSchema = z.object({
  action: z
    .enum(['authenticate', 'status', 'revoke'])
    .describe(
      'Action to perform: authenticate (start flow), status (check current), or revoke (clear tokens)'
    ),
  scopes: z
    .array(z.string())
    .optional()
    .describe(
      'OAuth scopes to request (defaults to ["repo", "read:user", "read:org"])'
    )
    .default(['repo', 'read:user', 'read:org']),
});

export type SimpleOAuthParams = z.infer<typeof SimpleOAuthSchema>;

export const SIMPLE_OAUTH_TOOL_NAME = TOOL_NAMES.SIMPLE_OAUTH;

/**
 * Register the simple OAuth tool
 */
export function registerSimpleOAuthTool(server: McpServer): void {
  server.registerTool(
    SIMPLE_OAUTH_TOOL_NAME,
    {
      description: `Simple GitHub OAuth authentication with Device Flow.

USAGE:
- action: "authenticate" - Start authentication (shows code to enter at github.com/login/device)
- action: "status" - Check if authenticated and token details
- action: "revoke" - Clear authentication tokens

EXAMPLE:
1. Run with action="authenticate"
2. Visit github.com/login/device
3. Enter the provided code
4. Tool automatically completes authentication

BENEFITS:
- No callback URLs or local servers needed
- Works from any device or environment
- Automatic token management
- Simple one-tool interface`,
      inputSchema: SimpleOAuthSchema.shape,
      annotations: {
        title: 'Simple OAuth',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    withSecurityValidation(
      async (args: SimpleOAuthParams): Promise<CallToolResult> => {
        try {
          const config = ConfigManager.getConfig();

          // Check OAuth configuration
          if (!config.oauth?.enabled) {
            return createResult({
              isError: true,
              error:
                'OAuth not configured. Set GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET',
              hints: generateHints({
                toolName: SIMPLE_OAUTH_TOOL_NAME,
                hasResults: false,
                totalItems: 0,
                customHints: [
                  'OAuth requires client credentials',
                  'Set GITHUB_OAUTH_CLIENT_ID environment variable',
                  'Set GITHUB_OAUTH_CLIENT_SECRET environment variable',
                  'Get credentials from github.com/settings/developers',
                ],
              }),
            });
          }

          const oauthManager = OAuthManager.getInstance();

          switch (args.action) {
            case 'authenticate': {
              // Start device flow with default scopes if none provided
              const scopes = args.scopes || ['repo', 'read:user', 'read:org'];
              const deviceFlowResult =
                await oauthManager.initiateDeviceFlow(scopes);

              // Start polling in background
              (async () => {
                try {
                  const tokenResponse = await oauthManager.pollDeviceFlowToken(
                    deviceFlowResult.device_code,
                    deviceFlowResult.interval
                  );

                  // Store tokens
                  await storeOAuthTokenInfo({
                    accessToken: tokenResponse.accessToken,
                    refreshToken: tokenResponse.refreshToken,
                    expiresAt: new Date(
                      Date.now() + tokenResponse.expiresIn * 1000
                    ),
                    scopes: tokenResponse.scope?.split(' ') || scopes,
                    tokenType: tokenResponse.tokenType || 'Bearer',
                    clientId: config.oauth!.clientId,
                  });
                } catch (error) {
                  // Background error - logged but not thrown
                  process.stderr.write(
                    `OAuth device flow error: ${error instanceof Error ? error.message : String(error)}\n`
                  );
                }
              })();

              return createResult({
                data: {
                  action: 'authenticate',
                  status: 'pending',
                  userCode: deviceFlowResult.user_code,
                  verificationUrl: deviceFlowResult.verification_uri,
                  expiresIn: deviceFlowResult.expires_in,
                  instructions: `
🔐 GitHub Authentication Required

1. Visit: ${deviceFlowResult.verification_uri}
2. Enter code: ${deviceFlowResult.user_code}
3. Authorize the application

The authentication will complete automatically.
Code expires in ${Math.floor(deviceFlowResult.expires_in / 60)} minutes.`,
                },
                hints: generateHints({
                  toolName: SIMPLE_OAUTH_TOOL_NAME,
                  hasResults: true,
                  totalItems: 1,
                  customHints: [
                    `Enter code ${deviceFlowResult.user_code} at GitHub`,
                    'Authentication will complete automatically',
                    'Run with action="status" to check progress',
                  ],
                }),
              });
            }

            case 'status': {
              const metadata = await getTokenMetadata();
              const authenticated = !!metadata && metadata.source === 'oauth';

              if (!authenticated) {
                return createResult({
                  data: {
                    action: 'status',
                    authenticated: false,
                    message:
                      'Not authenticated. Run with action="authenticate" to start.',
                  },
                  hints: generateHints({
                    toolName: SIMPLE_OAUTH_TOOL_NAME,
                    hasResults: true,
                    totalItems: 1,
                    customHints: [
                      'Run with action="authenticate" to start OAuth flow',
                    ],
                  }),
                });
              }

              const expiresIn = metadata.expiresAt
                ? Math.max(
                    0,
                    Math.floor(
                      (metadata.expiresAt.getTime() - Date.now()) / 1000
                    )
                  )
                : null;

              return createResult({
                data: {
                  action: 'status',
                  authenticated: true,
                  source: metadata.source,
                  scopes: metadata.scopes || [],
                  expiresIn,
                  expiresAt: metadata.expiresAt?.toISOString(),
                  message: `Authenticated via ${metadata.source}`,
                },
                hints: generateHints({
                  toolName: SIMPLE_OAUTH_TOOL_NAME,
                  hasResults: true,
                  totalItems: 1,
                  customHints: [
                    'Successfully authenticated',
                    expiresIn
                      ? `Token expires in ${Math.floor(expiresIn / 60)} minutes`
                      : 'Token expiration unknown',
                    'Run with action="revoke" to clear authentication',
                  ],
                }),
              });
            }

            case 'revoke': {
              const metadata = await getTokenMetadata();

              if (metadata && metadata.source === 'oauth') {
                // Try to revoke with GitHub API
                try {
                  const { getGitHubToken } = await import(
                    '../utils/tokenManager.js'
                  );
                  const token = await getGitHubToken();
                  if (token) {
                    await oauthManager.revokeToken(token);
                  }
                } catch {
                  // Continue even if revocation fails
                }
              }

              // Clear stored tokens
              await clearOAuthTokens();

              return createResult({
                data: {
                  action: 'revoke',
                  success: true,
                  message: 'Authentication tokens cleared successfully',
                },
                hints: generateHints({
                  toolName: SIMPLE_OAUTH_TOOL_NAME,
                  hasResults: true,
                  totalItems: 1,
                  customHints: [
                    'Tokens cleared successfully',
                    'Run with action="authenticate" to authenticate again',
                  ],
                }),
              });
            }

            default:
              return createResult({
                isError: true,
                error: `Unknown action: ${(args as { action: string }).action}`,
                hints: generateHints({
                  toolName: SIMPLE_OAUTH_TOOL_NAME,
                  hasResults: false,
                  totalItems: 0,
                  customHints: [
                    'Use action: "authenticate", "status", or "revoke"',
                  ],
                }),
              });
          }
        } catch (error) {
          const { error: specificError, hints: customHints } =
            handleOAuthError(error);

          // Log audit event for OAuth authentication failure
          try {
            const { AuditLogger } = await import(
              '../../../security/auditLogger.js'
            );
            await AuditLogger.logEvent({
              action: 'oauth_authentication',
              outcome: 'failure',
              details: {
                error: error instanceof Error ? error.message : String(error),
                tool: SIMPLE_OAUTH_TOOL_NAME,
                action: (args as SimpleOAuthParams).action,
              },
              timestamp: new Date(),
            });
          } catch (auditError) {
            // Audit logging failed, but don't fail the main operation
            console.warn('Failed to log audit event:', auditError);
          }

          return createResult({
            isError: true,
            error: `OAuth operation failed: ${error instanceof Error ? error.message : String(error)}`,
            hints: generateHints({
              toolName: SIMPLE_OAUTH_TOOL_NAME,
              hasResults: false,
              totalItems: 0,
              errorMessage: specificError,
              customHints,
            }),
          });
        }
      }
    )
  );
}
