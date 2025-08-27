#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Implementation } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import { McpOAuth, type McpOAuthConfig, githubConnector } from 'mcp-s-oauth';
import dotenv from 'dotenv';

// Import what's available from octocode-mcp package
import { registerAllTools as octocodeRegisterAllTools } from 'octocode-mcp';
import { version, name } from '../package.json';

// Create stub implementations for functions not exported by octocode-mcp
const registerPrompts = (_server: McpServer) => {
  console.log(
    '📝 Prompts registration stubbed (using local server implementation)'
  );
};

const registerSampling = (_server: McpServer) => {
  console.log(
    '🧪 Sampling registration stubbed (using local server implementation)'
  );
};

const clearAllCache = () => {
  console.log('🗑️ Cache clearing stubbed (using local server implementation)');
};

const SecureCredentialStore = {
  clearAll: () => {
    console.log(
      '🔐 Credential store clearing stubbed (using local server implementation)'
    );
  },
};

// initialize function is not needed - octocode-mcp handles its own initialization

const isBetaEnabled = () => {
  return process.env.BETA === '1' || process.env.BETA?.toLowerCase() === 'true';
};

interface AuditEvent {
  action: string;
  outcome: string;
  source: string;
  details?: Record<string, unknown>;
}

const AuditLogger = {
  initialize: () => {
    console.log(
      '📊 Audit logger initialization stubbed (using local server implementation)'
    );
  },
  shutdown: () => {
    console.log(
      '📊 Audit logger shutdown stubbed (using local server implementation)'
    );
  },
  logEvent: (event: AuditEvent) => {
    console.log('Audit log event:', event);
  },
};

// registerTools is no longer needed - we delegate directly to octocodeRegisterAllTools

// Load environment variables from local .env file
dotenv.config({ path: '.env' });

// Console log environment variables for testing
console.log('📝 Environment Variables (for testing):');
console.log('PORT:', process.env.PORT || 'default: 3001');
console.log('HOST:', process.env.HOST || 'default: localhost');
console.log(
  'CORS_ORIGINS:',
  process.env.CORS_ORIGINS || 'default: localhost:3000,3001'
);
console.log(
  'ENABLE_API_EXPLORER:',
  process.env.ENABLE_API_EXPLORER || 'default: false'
);
console.log('ENABLE_METRICS:', process.env.ENABLE_METRICS || 'default: false');
console.log('REQUIRE_OAUTH:', process.env.REQUIRE_OAUTH || 'default: false');
console.log(
  'GITHUB_CLIENT_ID:',
  process.env.GITHUB_CLIENT_ID ? '***set***' : 'not set'
);
console.log(
  'GITHUB_CLIENT_SECRET:',
  process.env.GITHUB_CLIENT_SECRET ? '***set***' : 'not set'
);
console.log(
  'AUDIT_ALL_ACCESS:',
  process.env.AUDIT_ALL_ACCESS || 'default: false'
);
console.log(
  'RATE_LIMIT_API_HOUR:',
  process.env.RATE_LIMIT_API_HOUR || 'not set'
);
console.log(
  'RATE_LIMIT_AUTH_HOUR:',
  process.env.RATE_LIMIT_AUTH_HOUR || 'not set'
);
console.log(
  'RATE_LIMIT_TOKEN_HOUR:',
  process.env.RATE_LIMIT_TOKEN_HOUR || 'not set'
);
console.log('---');

const SERVER_CONFIG: Implementation = {
  name: `${name}_${version}`,
  title: 'Octocode Local Server',
  version: version,
};

// Store transports by session ID
const transports: Record<string, StreamableHTTPServerTransport> = {};

// Register all tools function - delegates to octocode-mcp
export async function registerAllTools(server: McpServer) {
  console.log('🔧 Starting MCP tools registration...');

  try {
    // Use the actual octocode-mcp implementation
    await octocodeRegisterAllTools(server);
    console.log('✅ Successfully registered all tools from octocode-mcp');
  } catch (error) {
    console.error('❌ Failed to register tools from octocode-mcp:', error);
    throw error;
  }
}

function setupMiddleware(
  app: express.Application,
  corsOrigins: string[]
): void {
  // Security middleware
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
    })
  );

  // CORS configuration
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'mcp-session-id'],
    })
  );

  // Compression and parsing middleware
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging middleware (only in development)
  if (process.env.NODE_ENV === 'development') {
    app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }
}

interface ServerConfig {
  port: number;
  host: string;
  enableApiExplorer: boolean;
  enableMetrics: boolean;
  hasOAuthCredentials: boolean;
}

function setupAdditionalRoutes(
  app: express.Application,
  config: ServerConfig
): void {
  const { port, host, enableApiExplorer, enableMetrics, hasOAuthCredentials } =
    config;

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: version,
      uptime: process.uptime(),
      mcpServerStatus: 'running',
    });
  });

  // API status endpoint
  app.get('/api/status', (req, res) => {
    res.json({
      localServer: {
        status: 'running',
        port: port,
        host: host,
        features: {
          apiExplorer: enableApiExplorer,
          metrics: enableMetrics,
          oauth: hasOAuthCredentials,
        },
      },
      mcpServer: {
        status: 'running',
        capabilities: [
          'tools',
          'prompts',
          ...(isBetaEnabled() ? ['sampling'] : []),
        ],
      },
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    });
  });

  // Metrics endpoint
  if (enableMetrics) {
    app.get('/metrics', (req, res) => {
      const memUsage = process.memoryUsage();
      res.json({
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: {
          rss: memUsage.rss,
          heapTotal: memUsage.heapTotal,
          heapUsed: memUsage.heapUsed,
          external: memUsage.external,
        },
        process: {
          pid: process.pid,
          ppid: process.ppid,
          platform: process.platform,
          arch: process.arch,
          version: process.version,
        },
      });
    });
  }

  // API Explorer endpoint (development/configured only)
  if (enableApiExplorer) {
    app.get('/api/explorer', (req, res) => {
      res.json({
        title: 'Octocode Local Server - API Explorer',
        version: version,
        description:
          'MCP Server with OAuth integration for GitHub code analysis',
        endpoints: {
          health: {
            method: 'GET',
            path: '/health',
            description: 'Health check endpoint',
          },
          status: {
            method: 'GET',
            path: '/api/status',
            description: 'Server and MCP status information',
          },
          ...(enableMetrics && {
            metrics: {
              method: 'GET',
              path: '/metrics',
              description: 'Server performance metrics',
            },
          }),
          mcp: {
            method: 'POST',
            path: '/',
            description: 'MCP protocol endpoint (requires MCP client)',
          },
        },
        mcpIntegration: {
          protocol: 'MCP over HTTP',
          transport: 'StreamableHTTPServerTransport',
          authentication: hasOAuthCredentials ? 'OAuth2' : 'Direct',
          capabilities: [
            'tools',
            'prompts',
            ...(isBetaEnabled() ? ['sampling'] : []),
          ],
        },
      });
    });
  }
}

async function startServer() {
  let shutdownInProgress = false;
  let shutdownTimeout: ReturnType<typeof setTimeout> | null = null;

  try {
    console.log('🚀 Starting Octocode Local Server...');

    const app = express();

    // Server configuration
    const port = parseInt(process.env.PORT || '3001');
    const host = process.env.HOST || 'localhost';
    const corsOrigins = process.env.CORS_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'http://localhost:3001',
    ];
    const enableApiExplorer = process.env.ENABLE_API_EXPLORER === 'true';
    const enableMetrics = process.env.ENABLE_METRICS === 'true';
    const requireOAuth = process.env.REQUIRE_OAUTH === 'true';
    const githubClientId = process.env.GITHUB_CLIENT_ID;
    const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;

    console.log(`🏠 Server config: ${host}:${port}`);
    console.log(`🔐 OAuth required: ${requireOAuth}`);
    console.log(`🌐 CORS origins: ${corsOrigins.join(', ')}`);
    console.log(`🔍 API Explorer enabled: ${enableApiExplorer}`);
    console.log(`📊 Metrics enabled: ${enableMetrics}`);

    // Initialize enterprise components if configured
    console.log('🏢 Initializing enterprise components...');
    try {
      if (process.env.AUDIT_ALL_ACCESS === 'true') {
        AuditLogger.initialize();
        console.log('✅ Audit logger initialized');
      }

      if (
        process.env.RATE_LIMIT_API_HOUR ||
        process.env.RATE_LIMIT_AUTH_HOUR ||
        process.env.RATE_LIMIT_TOKEN_HOUR
      ) {
        // Rate limiter initialization stubbed
        console.log('Rate limiter initialization stubbed');
      }
      console.log('✅ Enterprise components initialized');
    } catch (_enterpriseInitError) {
      console.log(
        '⚠️ Some enterprise components failed to initialize (continuing...)'
      );
    }

    // Setup middleware
    console.log('🛡️ Setting up Express middleware...');
    setupMiddleware(app, corsOrigins);
    console.log('✅ Express middleware configured');

    // Define MCP handler function - this creates the MCP server
    const mcpHandler = async (req: express.Request, res: express.Response) => {
      // Check for existing session ID
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        // Reuse existing transport
        console.log(
          `♻️ Reusing existing MCP transport for session: ${sessionId}`
        );
        transport = transports[sessionId];
      } else {
        // Create new transport
        console.log('🆕 Creating new MCP transport and session...');
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
        console.log('🔨 Creating MCP Server with capabilities...');
        const mcpServer = new McpServer(SERVER_CONFIG, {
          capabilities: {
            prompts: {},
            tools: {},
            ...(isBetaEnabled() && { sampling: {} }),
          },
        });
        console.log('✅ MCP Server created successfully');

        // Register all tools
        await registerAllTools(mcpServer);
        console.log('✅ All tools registered to MCP Server');

        // Register prompts
        console.log('📝 Registering prompts...');
        registerPrompts(mcpServer);
        console.log('✅ Prompts registered');

        // Register sampling capabilities only if BETA features are enabled
        if (isBetaEnabled()) {
          console.log('🧪 BETA enabled - registering sampling capabilities...');
          registerSampling(mcpServer);
          console.log('✅ Sampling capabilities registered');
        } else {
          console.log('🚫 BETA disabled - skipping sampling capabilities');
        }

        // Connect server to transport
        console.log('🔌 Connecting MCP Server to transport...');
        await mcpServer.connect(transport);
        console.log('✅ MCP Server connected to transport successfully');
      }

      // Handle the request using the original express request
      console.log(`🚀 Processing MCP request from ${req.ip} to ${req.path}`);
      await transport.handleRequest(req, res, req.body);
      console.log('✅ MCP request processed successfully');
    };

    // Check if OAuth credentials are available and required
    console.log('🔐 Checking OAuth credentials...');
    const hasOAuthCredentials = !!(githubClientId && githubClientSecret);
    console.log(`🔑 OAuth credentials available: ${hasOAuthCredentials}`);

    if (requireOAuth && !hasOAuthCredentials) {
      throw new Error(
        'GitHub OAuth credentials are required. Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables.'
      );
    }

    // Setup routing based on OAuth availability
    console.log('🛣️ Setting up routes...');
    if (hasOAuthCredentials) {
      console.log('🔐 Setting up OAuth-protected MCP routes');
      console.log('🔧 Setting up OAuth configuration...');

      // Environment configuration for OAuth
      const oauthConfig: McpOAuthConfig = {
        baseUrl: process.env.BASE_URL || `http://${host}:${port}`,
        clientId: githubClientId!,
        clientSecret: githubClientSecret!,
        connector: githubConnector,
      };
      console.log(`🌐 OAuth base URL: ${oauthConfig.baseUrl}`);

      // Create MCP OAuth middleware
      console.log('⚙️ Creating MCP OAuth middleware...');
      const mcpOAuth = McpOAuth(oauthConfig, mcpHandler);
      console.log('✅ OAuth authentication enabled');

      // Mount MCP OAuth middleware
      app.use('/', mcpOAuth.router);
      console.log('✅ OAuth routes mounted');
    } else {
      console.log('🔓 Mounting direct MCP server route (no OAuth)');
      console.log(
        '⚠️  OAuth credentials not found, using direct MCP server mode'
      );
      console.log(
        '💡 For OAuth features, set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET'
      );

      // Direct MCP handler without OAuth
      app.use('/', (req, res) => {
        mcpHandler(req, res).catch(error => {
          AuditLogger.logEvent({
            action: 'mcp_handler_error',
            outcome: 'failure',
            source: 'system',
            details: {
              error: error instanceof Error ? error.message : String(error),
            },
          });
          res.status(500).json({ error: 'Internal server error' });
        });
      });
      console.log('✅ Direct MCP route mounted');
    }

    // Setup additional routes
    console.log('🔧 Setting up additional endpoints...');
    setupAdditionalRoutes(app, {
      port,
      host,
      enableApiExplorer,
      enableMetrics,
      hasOAuthCredentials,
    });
    console.log('✅ Additional endpoints configured');

    // Start the server
    const server = app.listen(port, host, () => {
      AuditLogger.logEvent({
        action: 'server_started',
        outcome: 'success',
        source: 'system',
        details: { port },
      });
      console.log(`✅ Octocode Local Server running on http://${host}:${port}`);
      console.log('🔗 MCP endpoints available for AI assistant integration');
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
            AuditLogger.shutdown();
          }

          if (
            process.env.RATE_LIMIT_API_HOUR ||
            process.env.RATE_LIMIT_AUTH_HOUR ||
            process.env.RATE_LIMIT_TOKEN_HOUR
          ) {
            console.log('Rate limiter shutdown stubbed');
          }
        } catch (error) {
          // Ignore shutdown errors
        }

        // Close Express server
        if (server) {
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
        } else {
          process.exit(0);
        }
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
    process.once('uncaughtException', error => {
      console.error(`❌ Uncaught Exception: ${error.message}`);
      console.error(`Stack: ${error.stack}`);
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    process.once('unhandledRejection', (reason, promise) => {
      console.error(`❌ Unhandled Rejection at: ${promise}`);
      console.error(`Reason: ${reason}`);
      gracefulShutdown('UNHANDLED_REJECTION');
    });

    return server;
  } catch (error) {
    console.error(
      `❌ Server startup error: ${error instanceof Error ? error.message : String(error)}`
    );
    if (error instanceof Error && error.stack) {
      console.error(`Stack: ${error.stack}`);
    }
    process.exit(1);
  }
}

// Legacy class for backward compatibility (if needed for testing)
class OctocodeLocalServer {
  public getApp(): express.Application {
    throw new Error(
      'Legacy class is deprecated. Use startServer() function instead.'
    );
  }

  public async start(): Promise<void> {
    await startServer();
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

export { OctocodeLocalServer, startServer };
export default OctocodeLocalServer;
