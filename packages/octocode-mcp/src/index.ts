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
import { TOOL_NAMES } from './mcp/tools/utils/toolConstants.js';
import { SecureCredentialStore } from './security/credentialStore.js';
import {
  getToken,
  initialize as initializeTokenManager,
  isEnterpriseTokenManager,
  isCliTokenResolutionEnabled,
} from './mcp/tools/utils/tokenManager.js';
import { ConfigManager } from './config/serverConfig.js';
import { ToolsetManager } from './mcp/tools/toolsets/toolsetManager.js';
import { createMCPAuthProtocol } from './auth/mcpAuthProtocol.js';
import { version } from '../package.json';

const SERVER_CONFIG: Implementation = {
  name: 'octocode',
  version: version,
  description: PROMPT_SYSTEM_PROMPT,
};

async function startServer() {
  let shutdownInProgress = false;
  let shutdownTimeout: ReturnType<typeof setTimeout> | null = null;

  try {
    const server = new McpServer(SERVER_CONFIG);

    // Initialize OAuth/GitHub App authentication
    await initializeAuthentication();

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
 * Initialize OAuth/GitHub App authentication
 */
async function initializeAuthentication(): Promise<void> {
  try {
    const config = ConfigManager.getConfig();

    // Initialize MCP Auth Protocol if OAuth or GitHub App is configured
    if (config.oauth?.enabled || config.githubApp?.enabled) {
      await createMCPAuthProtocol();
    }

    // Initialize token manager with OAuth/GitHub App support
    await initializeTokenManager();
  } catch (error) {
    // Log error but don't fail startup - fall back to existing authentication
    process.stderr.write(
      `Warning: Failed to initialize OAuth/GitHub App authentication: ${
        error instanceof Error ? error.message : String(error)
      }\n`
    );
  }
}

/**
 * Initialize enterprise features if configured
 * Progressive enhancement - only activates when environment variables are present
 */
export async function initializeEnterpriseFeatures(): Promise<void> {
  // Check for enterprise configuration
  const hasOrgConfig = process.env.GITHUB_ORGANIZATION;
  const hasAuditConfig = process.env.AUDIT_ALL_ACCESS === 'true';
  const hasRateLimitConfig =
    process.env.RATE_LIMIT_API_HOUR ||
    process.env.RATE_LIMIT_AUTH_HOUR ||
    process.env.RATE_LIMIT_TOKEN_HOUR;

  if (hasOrgConfig || hasAuditConfig || hasRateLimitConfig) {
    // eslint-disable-next-line no-console
    //console.log('Initializing enterprise security features...');
    // TODO: use a Logger instead of console.log

    try {
      // Initialize audit logging first (if enabled)
      if (hasAuditConfig) {
        const { AuditLogger } = await import('./security/auditLogger.js');
        AuditLogger.initialize();
      }

      // Initialize organization manager (if configured)
      if (hasOrgConfig) {
        const { OrganizationManager } = await import(
          './security/organizationManager.js'
        );
        OrganizationManager.initialize();
      }

      // Initialize rate limiter (if configured)
      if (hasRateLimitConfig) {
        const { RateLimiter } = await import('./security/rateLimiter.js');
        RateLimiter.initialize();
      }

      // Initialize policy manager
      const { PolicyManager } = await import('./security/policyManager.js');
      PolicyManager.initialize();

      // Initialize token manager with enterprise config
      initializeTokenManager({
        organizationId: process.env.GITHUB_ORGANIZATION,
        enableAuditLogging: hasAuditConfig,
        enableRateLimiting: !!hasRateLimitConfig,
        enableOrganizationValidation: !!hasOrgConfig,
      });

      // Log via audit logger rather than console
      try {
        const { AuditLogger } = await import('./security/auditLogger.js');
        AuditLogger.logEvent({
          action: 'enterprise_features_initialized',
          outcome: 'success',
          source: 'system',
          details: {
            message: 'Enterprise security features initialized successfully',
          },
        });
      } catch {
        // Fallback: silent if audit logger not available
      }

      // Log the initialization
      if (hasAuditConfig) {
        const { AuditLogger } = await import('./security/auditLogger.js');
        AuditLogger.logEvent({
          action: 'enterprise_features_initialized',
          outcome: 'success',
          source: 'system',
          details: {
            organizationId: process.env.GITHUB_ORGANIZATION,
            auditLogging: hasAuditConfig,
            rateLimiting: !!hasRateLimitConfig,
            organizationValidation: !!hasOrgConfig,
          },
        });
      }
    } catch (error) {
      try {
        const { AuditLogger } = await import('./security/auditLogger.js');
        AuditLogger.logEvent({
          action: 'enterprise_features_initialized',
          outcome: 'failure',
          source: 'system',
          details: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
      } catch {
        // Fallback to stderr to avoid console usage
        process.stderr.write(
          `Failed to initialize enterprise features: ${
            error instanceof Error ? error.message : String(error)
          }\n`
        );
      }
      // Don't throw - continue with basic functionality
    }
  }
}

export async function registerAllTools(server: McpServer) {
  // Initialize configuration system
  const config = ConfigManager.initialize();

  // Initialize toolset management
  ToolsetManager.initialize(config.enabledToolsets, config.readOnly);

  // Initialize enterprise features first (if configured)
  await initializeEnterpriseFeatures();

  // Ensure token exists and is stored securely (existing behavior)
  await getToken();

  // Warn about CLI restrictions in enterprise mode
  if (isEnterpriseTokenManager() && !isCliTokenResolutionEnabled()) {
    // Use stderr for enterprise mode notification to avoid console linter issues
    process.stderr.write(
      '🔒 Enterprise mode active: CLI token resolution disabled for security\n'
    );
  }

  // Removed exportTranslations path (redundant)

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

  let successCount = 0;
  const failedTools: string[] = [];

  for (const tool of toolRegistrations) {
    try {
      // Check if tool is enabled in current toolset configuration
      if (ToolsetManager.isToolEnabled(tool.name)) {
        tool.fn(server);
        successCount++;
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
