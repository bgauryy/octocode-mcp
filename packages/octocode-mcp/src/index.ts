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
              process.stderr.write(
                'Detected GitHub token from environment/CLI.\n'
              );
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
      // OAuth state manager is optional
      process.stderr.write(
        `Warning: OAuth state manager initialization failed: ${stateManagerError}\n`
      );
    }

    await registerAllTools(server);

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
    // Log error but don't fail startup - fall back to existing authentication
    process.stderr.write(
      `Warning: Failed to initialize authentication: ${
        error instanceof Error ? error.message : String(error)
      }\n`
    );
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

  // Warn about CLI restrictions in enterprise mode
  if (isEnterpriseTokenManager() && !isCliTokenResolutionEnabled()) {
    // Use stderr for enterprise mode notification to avoid console linter issues
    process.stderr.write(
      '🔒 Enterprise mode active: CLI token resolution disabled for security\n'
    );
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
    // Log but don't fail - OAuth tools are optional
    process.stderr.write(
      `Warning: Failed to register OAuth/Organization tools: ${oauthError}\n`
    );
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

startServer().catch(() => {
  process.exit(1);
});
