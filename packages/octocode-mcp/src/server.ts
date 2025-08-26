import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Implementation } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import { McpOAuth, type McpOAuthConfig, githubConnector } from 'mcp-s-oauth';
import dotenv from 'dotenv';
import { registerPrompts } from './mcp/prompts.js';
import { registerSampling } from './mcp/sampling.js';
import { clearAllCache } from './utils/cache.js';
import { registerGitHubSearchCodeTool } from './tools/github_search_code.js';
import { registerFetchGitHubFileContentTool } from './tools/github_fetch_content.js';
import { registerSearchGitHubReposTool } from './tools/github_search_repos.js';
import { registerSearchGitHubCommitsTool } from './tools/github_search_commits.js';
import { registerSearchGitHubPullRequestsTool } from './tools/github_search_pull_requests.js';
import { registerViewGitHubRepoStructureTool } from './tools/github_view_repo_structure.js';
import { TOOL_NAMES } from './tools/utils/toolConstants.js';
import { SecureCredentialStore } from './security/credentialStore.js';
import { ConfigManager } from './serverConfig.js';
import { AuditLogger } from './security/auditLogger.js';
import { ToolsetManager } from './tools/toolsets/toolsetManager.js';
import { isBetaEnabled } from './serverConfig.js';
import { version, name } from '../package.json';

// Load environment variables
dotenv.config();

const inclusiveTools =
  process.env.TOOLS_TO_RUN?.split(',')
    .map(tool => tool.trim())
    .filter(tool => tool.length > 0) || [];

const SERVER_CONFIG: Implementation = {
  name: `${name}_${version}`,
  title: 'Octocode MCP',
  version: version,
};

// Store transports by session ID
const transports: Record<string, StreamableHTTPServerTransport> = {};

async function startServer() {
  let shutdownInProgress = false;
  let shutdownTimeout: ReturnType<typeof setTimeout> | null = null;

  try {
    const app = express();

    // Environment configuration for OAuth
    const config: McpOAuthConfig = {
      baseUrl: process.env.BASE_URL || 'http://localhost:3000',
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      connector: githubConnector,
    };

    if (!config.clientId || !config.clientSecret) {
      throw new Error(
        'GitHub OAuth credentials are required. Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables.'
      );
    }

    // Initialize enterprise components if configured
    try {
      if (process.env.AUDIT_ALL_ACCESS === 'true') {
        const { AuditLogger } = await import('./security/auditLogger.js');
        AuditLogger.initialize();
      }

      if (
        process.env.RATE_LIMIT_API_HOUR ||
        process.env.RATE_LIMIT_AUTH_HOUR ||
        process.env.RATE_LIMIT_TOKEN_HOUR
      ) {
        const { RateLimiter } = await import('./security/rateLimiter.js');
        RateLimiter.initialize();
      }
    } catch (_enterpriseInitError) {
      // Ignore enterprise initialization errors to avoid blocking startup
    }

    // Define MCP handler function - this creates the MCP server
    const mcpHandler = async (req: express.Request, res: express.Response) => {
      // Check for existing session ID
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        // Reuse existing transport
        transport = transports[sessionId];
      } else {
        // Create new transport
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: sessionId => {
            AuditLogger.logEvent({
              action: 'mcp_session_initialized',
              outcome: 'success',
              source: 'system',
              details: { sessionId },
            });
            transports[sessionId] = transport;
          },
        });

        // Clean up transport when closed
        transport.onclose = () => {
          if (transport.sessionId) {
            AuditLogger.logEvent({
              action: 'mcp_session_closed',
              outcome: 'success',
              source: 'system',
              details: { sessionId: transport.sessionId },
            });
            delete transports[transport.sessionId];
          }
        };

        // Create MCP Server with all tools
        const mcpServer = new McpServer(SERVER_CONFIG, {
          capabilities: {
            prompts: {},
            tools: {},
            ...(isBetaEnabled() && { sampling: {} }),
          },
        });

        // Register all tools
        await registerAllTools(mcpServer);

        // Register prompts
        registerPrompts(mcpServer);

        // Register sampling capabilities only if BETA features are enabled
        if (isBetaEnabled()) {
          registerSampling(mcpServer);
        }

        // Connect server to transport
        await mcpServer.connect(transport);
      }

      // Handle the request using the original express request
      await transport.handleRequest(req, res, req.body);
    };

    // Create MCP OAuth middleware
    const mcpOAuth = McpOAuth(config, mcpHandler);

    // Mount MCP OAuth middleware
    app.use('/', mcpOAuth.router);

    const port = parseInt(process.env.PORT || '3000');
    const server = app.listen(port, () => {
      AuditLogger.logEvent({
        action: 'server_started',
        outcome: 'success',
        source: 'system',
        details: { port },
      });
    });

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

        AuditLogger.logEvent({
          action: 'server_shutting_down',
          outcome: 'success',
          source: 'system',
          details: { port },
        });

        // Close all MCP transports
        await Promise.all(
          Object.values(transports).map(transport => {
            try {
              transport.close?.();
              return Promise.resolve();
            } catch (error) {
              AuditLogger.logEvent({
                action: 'transport_close_error',
                outcome: 'failure',
                source: 'system',
                details: {
                  error: error instanceof Error ? error.message : String(error),
                },
              });
              return Promise.resolve();
            }
          })
        );

        // Clear cache and credentials (fastest operations)
        clearAllCache();
        SecureCredentialStore.clearAll();

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
        } catch (error) {
          // Ignore shutdown errors
        }

        // Close Express server
        server.close(() => {
          AuditLogger.logEvent({
            action: 'server_closed',
            outcome: 'success',
            source: 'system',
            details: { port },
          });

          // Clear the timeout since we completed successfully
          if (shutdownTimeout) {
            clearTimeout(shutdownTimeout);
            shutdownTimeout = null;
          }

          process.exit(0);
        });
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

    // Handle uncaught errors - prevent multiple handlers
    process.once('uncaughtException', _error => {
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    process.once('unhandledRejection', (_reason, _promise) => {
      gracefulShutdown('UNHANDLED_REJECTION');
    });

    return server;
  } catch (_error) {
    process.exit(1);
  }
}

export async function registerAllTools(server: McpServer) {
  // Initialize configuration system
  const config = ConfigManager.initialize();

  // Initialize toolset management
  ToolsetManager.initialize(config.enabledToolsets, config.readOnly);

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
    // DO NOT RUN PACKAGE SEARCH TOOL IN SERVER MODE
    // {
    //   name: TOOL_NAMES.PACKAGE_SEARCH,
    //   fn: registerPackageSearchTool,
    // },
  ];

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
      } else if (!shouldRegisterTool) {
        // Use stderr for selective tool messages to avoid console linter issues
        process.stderr.write(
          `Tool ${tool.name} excluded by TOOLS_TO_RUN configuration\n`
        );
      } else {
        // Use stderr for toolset configuration messages to avoid console linter issues
        process.stderr.write(
          `Tool ${tool.name} disabled by toolset configuration\n`
        );
      }
    } catch (error) {
      // Log the error but continue with other tools
      failedTools.push(tool.name);
    }
  }

  if (failedTools.length > 0) {
    // Tools failed to register
  }

  if (successCount === 0) {
    throw new Error('No tools were successfully registered');
  }
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch(error => {
    AuditLogger.logEvent({
      action: 'server_startup_error',
      outcome: 'failure',
      source: 'system',
      details: {
        error: error instanceof Error ? error.message : String(error),
      },
    });
    process.exit(1);
  });
}
