import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { PROMPT_SYSTEM_PROMPT } from './mcp/systemPrompts.js';
import { Implementation } from '@modelcontextprotocol/sdk/types.js';
import { clearAllCache } from './utils/cache.js';
import { registerGitHubSearchCodeTool } from './mcp/tools/github_search_code.js';
import { registerFetchGitHubFileContentTool } from './mcp/tools/github_fetch_content.js';
import { registerSearchGitHubReposTool } from './mcp/tools/github_search_repos.js';
import { registerSearchGitHubCommitsTool } from './mcp/tools/github_search_commits.js';
import { registerSearchGitHubPullRequestsTool } from './mcp/tools/github_search_pull_requests.js';
import { registerPackageSearchTool } from './mcp/tools/package_search/package_search.js';
import { registerViewGitHubRepoStructureTool } from './mcp/tools/github_view_repo_structure.js';
import { registerAllOAuthTools } from './mcp/tools/oauth/oauthTools.js';
import { registerAllOrganizationTools } from './mcp/tools/organization/organizationTools.js';
import { TOOL_NAMES } from './mcp/tools/utils/toolConstants.js';
import { SecureCredentialStore } from './security/credentialStore.js';
import {
  getToken,
  isEnterpriseTokenManager,
  isCliTokenResolutionEnabled,
  getGitHubToken,
} from './mcp/tools/utils/tokenManager.js';
import { ConfigManager } from './config/serverConfig.js';
import { ToolsetManager } from './mcp/tools/toolsets/toolsetManager.js';
import { version } from '../package.json';

// a list of tools to run, separated by commas, e.g. "githubSearchCode,githubGetFileContent"
const inclusiveTools =
  process.env.TOOLS_TO_RUN?.split(',')
    .map(tool => tool.trim())
    .filter(tool => tool.length > 0) || [];

const SERVER_CONFIG: Implementation = {
  name: 'octocode',
  version: version,
  description: PROMPT_SYSTEM_PROMPT,
};

async function startServer() {
  let shutdownInProgress = false;
  let shutdownTimeout: ReturnType<typeof setTimeout> | null = null;
  let tokenProbeInterval: ReturnType<typeof setInterval> | null = null;

  try {
    const server = new McpServer(SERVER_CONFIG);

    // Initialize enterprise components if configured
    try {
      if (process.env.AUDIT_ALL_ACCESS === 'true') {
        const { AuditLogger } = await import('./security/auditLogger.js');
        AuditLogger.initialize();

        AuditLogger.logEvent({
          action: 'enterprise_initialization',
          outcome: 'success',
          source: 'system',
          details: { component: 'audit_logger' },
        });
      }

      if (
        process.env.RATE_LIMIT_API_HOUR ||
        process.env.RATE_LIMIT_AUTH_HOUR ||
        process.env.RATE_LIMIT_TOKEN_HOUR
      ) {
        const { RateLimiter } = await import('./security/rateLimiter.js');
        RateLimiter.initialize();

        // Log rate limiter initialization
        try {
          const { AuditLogger } = await import('./security/auditLogger.js');
          AuditLogger.logEvent({
            action: 'enterprise_initialization',
            outcome: 'success',
            source: 'system',
            details: { component: 'rate_limiter' },
          });
        } catch {
          // Silent fail if audit logging not available
        }
      }
    } catch (enterpriseInitError) {
      // Log enterprise initialization failure
      try {
        const { AuditLogger } = await import('./security/auditLogger.js');
        AuditLogger.logEvent({
          action: 'enterprise_initialization',
          outcome: 'failure',
          source: 'system',
          details: {
            error:
              enterpriseInitError instanceof Error
                ? enterpriseInitError.message
                : String(enterpriseInitError),
          },
        });
      } catch {
        // Fallback to stderr if audit logging fails
        process.stderr.write(
          `Warning: Enterprise initialization failed: ${enterpriseInitError}\n`
        );
      }
    }

    // Initialize OAuth/GitHub App authentication
    await initializeAuthentication();

    // Start background token probe if OAuth is not configured/enabled
    try {
      const cfg = ConfigManager.getConfig();
      if (!cfg.oauth?.enabled) {
        const probe = async () => {
          try {
            const token = await getGitHubToken();
            if (token && tokenProbeInterval) {
              // Log token detection via audit system
              try {
                const { AuditLogger } = await import(
                  './security/auditLogger.js'
                );
                AuditLogger.logEvent({
                  action: 'token_detected',
                  outcome: 'success',
                  source: 'auth',
                  details: {
                    method: 'background_probe',
                    tokenSource: 'environment_or_cli',
                  },
                });
              } catch {
                // Fallback to stderr
                process.stderr.write(
                  'Detected GitHub token from environment/CLI.\n'
                );
              }
              clearInterval(tokenProbeInterval);
              tokenProbeInterval = null;
            }
          } catch {
            // ignore probe errors
          }
        };
        // Immediate probe once, then every 30s
        await probe();
        tokenProbeInterval = setInterval(probe, 30_000);
      }
    } catch {
      // ignore background probe setup issues
    }

    // Initialize OAuth state manager for OAuth flow support
    try {
      const { OAuthStateManager } = await import(
        './mcp/tools/utils/oauthStateManager.js'
      );
      OAuthStateManager.initialize();
    } catch (stateManagerError) {
      // OAuth state manager is optional - log via audit system
      try {
        const { AuditLogger } = await import('./security/auditLogger.js');
        AuditLogger.logEvent({
          action: 'oauth_state_manager_init',
          outcome: 'failure',
          source: 'auth',
          details: {
            error:
              stateManagerError instanceof Error
                ? stateManagerError.message
                : String(stateManagerError),
            component: 'oauth_state_manager',
          },
        });
      } catch {
        // Fallback to stderr
        process.stderr.write(
          `Warning: OAuth state manager initialization failed: ${stateManagerError}\n`
        );
      }
    }

    await registerAllTools(server);

    // Start OAuth Protected Resource Metadata Server (RFC 9728) - Required for MCP OAuth compliance
    let oauthMetadataServer:
      | import('./http/protectedResourceServer.js').ProtectedResourceServer
      | null = null;
    let legacyMetadataServer:
      | import('./http/resourceMetadataServer.js').ResourceMetadataServer
      | null = null;

    try {
      const config = ConfigManager.getConfig();

      // Start OAuth metadata server if OAuth is enabled or explicitly requested
      if (config.oauth?.enabled || process.env.START_OAUTH_SERVER === 'true') {
        const { ProtectedResourceServer, getProtectedResourceServerConfig } =
          await import('./http/protectedResourceServer.js');

        const serverConfig = getProtectedResourceServerConfig();
        oauthMetadataServer = new ProtectedResourceServer(serverConfig);
        await oauthMetadataServer.start();

        // Log OAuth metadata server startup via audit system
        try {
          const { AuditLogger } = await import('./security/auditLogger.js');
          AuditLogger.logEvent({
            action: 'oauth_metadata_server_started',
            outcome: 'success',
            source: 'system',
            details: {
              baseUrl: oauthMetadataServer.getBaseUrl(),
              protectedResourceUrl: oauthMetadataServer.getMetadataUrl(),
              authServerUrl: oauthMetadataServer.getAuthServerUrl(),
              rfcCompliance: ['RFC 9728', 'RFC 8707', 'RFC 7636'],
              oauthEnabled: config.oauth?.enabled,
            },
          });
        } catch {
          // Fallback to stderr for startup messages
          process.stderr.write(
            `🔐 OAuth Protected Resource Server listening at ${oauthMetadataServer.getBaseUrl()}\n`
          );
          process.stderr.write(`📋 OAuth metadata endpoints:\n`);
          process.stderr.write(
            `   - Protected Resource: ${oauthMetadataServer.getMetadataUrl()}\n`
          );
          process.stderr.write(
            `   - Authorization Server: ${oauthMetadataServer.getAuthServerUrl()}\n`
          );

          if (config.oauth?.enabled) {
            process.stderr.write(
              `✅ MCP OAuth 2.1 compliance: RFC 9728, RFC 8707, RFC 7636\n`
            );
          }
        }
      }

      // Optionally start legacy metadata server for backward compatibility
      if (process.env.START_METADATA_SERVER === 'true') {
        const { ResourceMetadataServer } = await import(
          './http/resourceMetadataServer.js'
        );
        legacyMetadataServer = new ResourceMetadataServer({});
        await legacyMetadataServer.start();
        process.stderr.write(
          `📡 Legacy metadata server listening at ${legacyMetadataServer.getBaseUrl()}\n`
        );
      }
    } catch (metaErr) {
      // Log metadata server startup failure via audit system
      try {
        const { AuditLogger } = await import('./security/auditLogger.js');
        AuditLogger.logEvent({
          action: 'metadata_server_startup',
          outcome: 'failure',
          source: 'system',
          details: {
            error: metaErr instanceof Error ? metaErr.message : String(metaErr),
            component: 'oauth_metadata_servers',
          },
        });
      } catch {
        // Fallback to stderr
        process.stderr.write(
          `⚠️  Warning: Failed to start metadata servers: ${metaErr}\n`
        );
      }
    }

    // Start HTTP server if configured
    let mcpHttpServer: import('./http/mcpHttpServer.js').MCPHttpServer | null =
      null;

    if (
      process.env.MCP_HTTP_ENABLED === 'true' ||
      ConfigManager.getConfig().oauth?.enabled
    ) {
      try {
        const { MCPHttpServer, getMCPHttpServerConfig } = await import(
          './http/mcpHttpServer.js'
        );

        const httpConfig = getMCPHttpServerConfig();
        mcpHttpServer = new MCPHttpServer(server, httpConfig);
        await mcpHttpServer.start();

        // Log HTTP server startup
        try {
          const { AuditLogger } = await import('./security/auditLogger.js');
          AuditLogger.logEvent({
            action: 'mcp_http_server_started',
            outcome: 'success',
            source: 'system',
            details: {
              baseUrl: mcpHttpServer.getBaseUrl(),
              oauthEnabled: ConfigManager.getConfig().oauth?.enabled,
              transport: 'http',
            },
          });
        } catch {
          process.stderr.write(
            `🌐 MCP HTTP Server listening at ${mcpHttpServer.getBaseUrl()}\n`
          );
          process.stderr.write(`📋 MCP HTTP Endpoints:\n`);
          process.stderr.write(
            `   - POST ${mcpHttpServer.getBaseUrl()}/mcp - Main MCP endpoint (OAuth protected)\n`
          );
          process.stderr.write(
            `   - GET  ${mcpHttpServer.getBaseUrl()}/health - Health check\n`
          );
        }
      } catch (httpError) {
        // Log HTTP server startup failure
        try {
          const { AuditLogger } = await import('./security/auditLogger.js');
          AuditLogger.logEvent({
            action: 'mcp_http_server_startup',
            outcome: 'failure',
            source: 'system',
            details: {
              error:
                httpError instanceof Error
                  ? httpError.message
                  : String(httpError),
              component: 'mcp_http_server',
            },
          });
        } catch {
          process.stderr.write(
            `⚠️  Warning: Failed to start MCP HTTP server: ${httpError}\n`
          );
        }
      }
    }

    const transport = new StdioServerTransport();

    await server.connect(transport);

    // Ensure all buffered output is sent
    process.stdout.uncork();
    process.stderr.uncork();

    const gracefulShutdown = async (_signal?: string) => {
      // Prevent multiple shutdown attempts
      if (shutdownInProgress) {
        return;
      }

      shutdownInProgress = true;

      try {
        // Clear any existing shutdown timeout
        if (shutdownTimeout) {
          clearTimeout(shutdownTimeout);
          shutdownTimeout = null;
        }

        // Set a new shutdown timeout
        shutdownTimeout = setTimeout(() => {
          process.exit(1);
        }, 5000);

        // Clear cache and credentials (fastest operations)
        clearAllCache();
        SecureCredentialStore.clearAll();

        // Stop background token probe if running
        if (tokenProbeInterval) {
          clearInterval(tokenProbeInterval);
          tokenProbeInterval = null;
        }

        // Shutdown enterprise modules gracefully
        try {
          if (process.env.AUDIT_ALL_ACCESS === 'true') {
            const { AuditLogger } = await import('./security/auditLogger.js');
            AuditLogger.shutdown();
          }

          if (
            process.env.RATE_LIMIT_API_HOUR ||
            process.env.RATE_LIMIT_AUTH_HOUR ||
            process.env.RATE_LIMIT_TOKEN_HOUR
          ) {
            const { RateLimiter } = await import('./security/rateLimiter.js');
            RateLimiter.shutdown();
          }

          // Shutdown OAuth state manager
          const { OAuthStateManager } = await import(
            './mcp/tools/utils/oauthStateManager.js'
          );
          OAuthStateManager.shutdown();

          // Stop OAuth protected resource server if running
          if (oauthMetadataServer) {
            try {
              oauthMetadataServer.stop();
            } catch {
              // ignore
            }
            oauthMetadataServer = null;
          }

          // Stop legacy metadata server if running
          if (legacyMetadataServer) {
            try {
              legacyMetadataServer.stop();
            } catch {
              // ignore
            }
            legacyMetadataServer = null;
          }

          // Stop MCP HTTP server if running
          if (mcpHttpServer) {
            try {
              mcpHttpServer.stop();
            } catch {
              // ignore
            }
            mcpHttpServer = null;
          }
        } catch (error) {
          // Ignore shutdown errors
        }

        // Close server with timeout protection
        try {
          await server.close();
        } catch (closeError) {
          // Error closing server
        }

        // Clear the timeout since we completed successfully
        if (shutdownTimeout) {
          clearTimeout(shutdownTimeout);
          shutdownTimeout = null;
        }

        process.exit(0);
      } catch (_error) {
        // Error during graceful shutdown

        // Clear timeout on error
        if (shutdownTimeout) {
          clearTimeout(shutdownTimeout);
          shutdownTimeout = null;
        }

        process.exit(1);
      }
    };

    // Handle process signals - only register once
    process.once('SIGINT', () => gracefulShutdown('SIGINT'));
    process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));

    // Handle stdin close (important for MCP)
    process.stdin.once('close', () => {
      gracefulShutdown('STDIN_CLOSE');
    });

    // Handle uncaught errors - prevent multiple handlers
    process.once('uncaughtException', _error => {
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    process.once('unhandledRejection', (_reason, _promise) => {
      gracefulShutdown('UNHANDLED_REJECTION');
    });

    // Keep process alive
    process.stdin.resume();
  } catch (_error) {
    process.exit(1);
  }
}

/**
 * Initialize unified authentication system
 */
async function initializeAuthentication(): Promise<void> {
  try {
    const { AuthenticationManager } = await import(
      './auth/authenticationManager.js'
    );
    const authManager = AuthenticationManager.getInstance();
    await authManager.initialize();
  } catch (error) {
    // Log error via audit system but don't fail startup
    try {
      const { AuditLogger } = await import('./security/auditLogger.js');
      AuditLogger.logEvent({
        action: 'authentication_initialization',
        outcome: 'failure',
        source: 'auth',
        details: {
          error: error instanceof Error ? error.message : String(error),
          fallback: 'existing_authentication',
        },
      });
    } catch {
      // Fallback to stderr if audit logging fails
      process.stderr.write(
        `Warning: Failed to initialize authentication: ${
          error instanceof Error ? error.message : String(error)
        }\n`
      );
    }
  }
}

export async function registerAllTools(server: McpServer) {
  // Initialize configuration system
  const config = ConfigManager.initialize();

  // Initialize toolset management
  ToolsetManager.initialize(config.enabledToolsets, config.readOnly);

  // Best-effort token bootstrap: do not fail startup if token is missing.
  try {
    await getToken();
  } catch (_e) {
    // Token will be obtained later via OAuth or environment/CLI; continue startup.
  }

  // Log enterprise mode restrictions via audit system
  if (isEnterpriseTokenManager() && !isCliTokenResolutionEnabled()) {
    try {
      const { AuditLogger } = await import('./security/auditLogger.js');
      AuditLogger.logEvent({
        action: 'enterprise_security_restriction',
        outcome: 'success',
        source: 'system',
        details: {
          restriction: 'cli_token_resolution_disabled',
          reason: 'security_policy',
          mode: 'enterprise',
        },
      });
    } catch {
      // Fallback to stderr
      process.stderr.write(
        '🔒 Enterprise mode active: CLI token resolution disabled for security\n'
      );
    }
  }

  // Determine if we should run all tools or only specific ones
  const runAllTools = inclusiveTools.length === 0;

  const toolRegistrations = [
    {
      name: TOOL_NAMES.GITHUB_SEARCH_CODE,
      fn: registerGitHubSearchCodeTool,
    },
    {
      name: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
      fn: registerSearchGitHubReposTool,
    },
    {
      name: TOOL_NAMES.GITHUB_FETCH_CONTENT,
      fn: registerFetchGitHubFileContentTool,
    },
    {
      name: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
      fn: registerViewGitHubRepoStructureTool,
    },
    {
      name: TOOL_NAMES.GITHUB_SEARCH_COMMITS,
      fn: registerSearchGitHubCommitsTool,
    },
    {
      name: TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
      fn: registerSearchGitHubPullRequestsTool,
    },
    {
      name: TOOL_NAMES.PACKAGE_SEARCH,
      fn: registerPackageSearchTool,
    },
  ];

  // Register OAuth and Organization tools if configured
  try {
    // Always register OAuth tools (they handle their own availability checks)
    registerAllOAuthTools(server);

    // Register organization tools if OAuth is configured or enterprise mode is enabled
    if (config.oauth?.enabled || config.enterprise?.organizationId) {
      registerAllOrganizationTools(server);
    }
  } catch (oauthError) {
    // Log OAuth tool registration failure via audit system
    try {
      const { AuditLogger } = await import('./security/auditLogger.js');
      AuditLogger.logEvent({
        action: 'oauth_tools_registration',
        outcome: 'failure',
        source: 'system',
        details: {
          error:
            oauthError instanceof Error
              ? oauthError.message
              : String(oauthError),
          component: 'oauth_organization_tools',
          impact: 'optional_tools_unavailable',
        },
      });
    } catch {
      // Fallback to stderr
      process.stderr.write(
        `Warning: Failed to register OAuth/Organization tools: ${oauthError}\n`
      );
    }
  }

  let successCount = 0;
  const failedTools: string[] = [];

  for (const tool of toolRegistrations) {
    try {
      // Check if tool should be registered based on inclusiveTools configuration
      const shouldRegisterTool =
        runAllTools || inclusiveTools.includes(tool.name);

      if (shouldRegisterTool && ToolsetManager.isToolEnabled(tool.name)) {
        tool.fn(server);
        successCount++;

        // Log successful tool registration
        try {
          const { AuditLogger } = await import('./security/auditLogger.js');
          AuditLogger.logEvent({
            action: 'tool_registered',
            outcome: 'success',
            source: 'system',
            details: {
              toolName: tool.name,
              registrationMethod: 'standard_toolset',
            },
          });
        } catch {
          // Silent fail for audit logging
        }
      } else if (!shouldRegisterTool) {
        // Log tool exclusion via audit system
        try {
          const { AuditLogger } = await import('./security/auditLogger.js');
          AuditLogger.logEvent({
            action: 'tool_excluded',
            outcome: 'success',
            source: 'system',
            details: {
              toolName: tool.name,
              reason: 'tools_to_run_configuration',
              configuration: 'selective_tool_loading',
            },
          });
        } catch {
          // Fallback to stderr
          process.stderr.write(
            `Tool ${tool.name} excluded by TOOLS_TO_RUN configuration\n`
          );
        }
      } else {
        // Log toolset configuration exclusion via audit system
        try {
          const { AuditLogger } = await import('./security/auditLogger.js');
          AuditLogger.logEvent({
            action: 'tool_disabled',
            outcome: 'success',
            source: 'system',
            details: {
              toolName: tool.name,
              reason: 'toolset_configuration',
              configuration: 'toolset_policy',
            },
          });
        } catch {
          // Fallback to stderr
          process.stderr.write(
            `Tool ${tool.name} disabled by toolset configuration\n`
          );
        }
      }
    } catch (error) {
      // Log tool registration failure via audit system
      failedTools.push(tool.name);

      try {
        const { AuditLogger } = await import('./security/auditLogger.js');
        AuditLogger.logEvent({
          action: 'tool_registration_failed',
          outcome: 'failure',
          source: 'system',
          details: {
            toolName: tool.name,
            error: error instanceof Error ? error.message : String(error),
            continuedExecution: true,
          },
        });
      } catch {
        // Silent fail for audit logging
      }
    }
  }

  if (failedTools.length > 0) {
    // Tools failed to register
  }

  if (successCount === 0) {
    throw new Error('No tools were successfully registered');
  }
}

startServer().catch(() => {
  process.exit(1);
});
