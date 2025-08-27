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
import { registerAllTools as octocodeRegisterAllTools } from 'octocode-mcp';
import { version, name } from '../package.json';

dotenv.config({ path: '.env' });

console.log('Environment Variables (for testing):');
console.log('PORT:', process.env.PORT || 'default: 3000');
console.log('HOST:', process.env.HOST || 'default: localhost');
console.log(
  'CORS_ORIGINS:',
  process.env.CORS_ORIGINS || 'default: localhost:3000'
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
  console.log('Starting MCP tools registration...');

  try {
    // Use the actual octocode-mcp implementation
    await octocodeRegisterAllTools(server);
    console.log('Successfully registered all tools from octocode-mcp');
  } catch (error) {
    console.log('Failed to register tools from octocode-mcp:', error);
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
        capabilities: ['tools'],
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
          capabilities: ['tools'],
        },
      });
    });
  }
}

async function startServer() {
  let shutdownInProgress = false;
  let shutdownTimeout: ReturnType<typeof setTimeout> | null = null;

  try {
    console.log('Starting Octocode Local Server...');

    const app = express();

    // Server configuration
    const port = parseInt(process.env.PORT || '3000');
    const host = process.env.HOST || 'localhost';
    const corsOrigins = process.env.CORS_ORIGINS?.split(',') || [
      'http://localhost:3000',
    ];
    const enableApiExplorer = process.env.ENABLE_API_EXPLORER === 'true';
    const enableMetrics = process.env.ENABLE_METRICS === 'true';
    const requireOAuth = process.env.REQUIRE_OAUTH === 'true';
    const githubClientId = process.env.GITHUB_CLIENT_ID;
    const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;

    console.log(`Server config: ${host}:${port}`);
    console.log(`OAuth required: ${requireOAuth}`);
    console.log(`CORS origins: ${corsOrigins.join(', ')}`);
    console.log(`API Explorer enabled: ${enableApiExplorer}`);
    console.log(`Metrics enabled: ${enableMetrics}`);

    // Setup middleware
    console.log('Setting up Express middleware...');
    setupMiddleware(app, corsOrigins);
    console.log('Express middleware configured');

    // Define MCP handler function - this creates the MCP server
    const mcpHandler = async (req: express.Request, res: express.Response) => {
      // Check for existing session ID
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        // Reuse existing transport
        console.log(`Reusing existing MCP transport for session: ${sessionId}`);
        transport = transports[sessionId];
      } else {
        // Create new transport
        console.log('Creating new MCP transport and session...');
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: sessionId => {
            transports[sessionId] = transport;
          },
        });

        // Clean up transport when closed
        transport.onclose = () => {
          if (transport.sessionId) {
            delete transports[transport.sessionId];
          }
        };

        // Create MCP Server with all tools
        console.log('Creating MCP Server with capabilities...');
        const mcpServer = new McpServer(SERVER_CONFIG, {
          capabilities: {
            tools: {},
          },
        });
        console.log('MCP Server created successfully');

        // Register all tools
        await registerAllTools(mcpServer);
        console.log('All tools registered to MCP Server');

        // Connect server to transport
        console.log('Connecting MCP Server to transport...');
        await mcpServer.connect(transport);
        console.log('MCP Server connected to transport successfully');
      }

      // Handle the request using the original express request
      console.log(`Processing MCP request from ${req.ip} to ${req.path}`);
      await transport.handleRequest(req, res, req.body);
      console.log('MCP request processed successfully');
    };

    // Check if OAuth credentials are available and required
    console.log('Checking OAuth credentials...');
    const hasOAuthCredentials = !!(githubClientId && githubClientSecret);
    console.log(`OAuth credentials available: ${hasOAuthCredentials}`);

    if (requireOAuth && !hasOAuthCredentials) {
      throw new Error(
        'GitHub OAuth credentials are required. Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables.'
      );
    }

    // Setup routing based on OAuth availability
    console.log('Setting up routes...');
    if (hasOAuthCredentials) {
      console.log('Setting up OAuth-protected MCP routes');
      console.log('Setting up OAuth configuration...');

      // Environment configuration for OAuth
      const oauthConfig: McpOAuthConfig = {
        baseUrl: process.env.BASE_URL || `http://${host}:${port}`,
        clientId: githubClientId!,
        clientSecret: githubClientSecret!,
        connector: githubConnector,
      };
      console.log(`OAuth base URL: ${oauthConfig.baseUrl}`);

      // Create MCP OAuth middleware
      console.log('Creating MCP OAuth middleware...');
      const mcpOAuth = McpOAuth(oauthConfig, mcpHandler);
      console.log('OAuth authentication enabled');

      // Mount MCP OAuth middleware
      app.use('/', mcpOAuth.router);
      console.log('OAuth routes mounted');
    } else {
      console.log('Mounting direct MCP server route (no OAuth)');
      console.log('OAuth credentials not found, using direct MCP server mode');
      console.log(
        'For OAuth features, set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET'
      );

      // Direct MCP handler without OAuth
      app.use('/', (req, res) => {
        mcpHandler(req, res).catch(error => {
          console.log('MCP handler error:', error);
          res.status(500).json({ error: 'Internal server error' });
        });
      });
      console.log('Direct MCP route mounted');
    }

    // Setup additional routes
    console.log('Setting up additional endpoints...');
    setupAdditionalRoutes(app, {
      port,
      host,
      enableApiExplorer,
      enableMetrics,
      hasOAuthCredentials,
    });
    console.log('Additional endpoints configured');

    // Start the server
    const server = app.listen(port, host, () => {
      console.log(`Octocode Local Server running on http://${host}:${port}`);
      console.log('MCP endpoints available for AI assistant integration');
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

        console.log('Server shutting down gracefully...');

        // Close all MCP transports
        await Promise.all(
          Object.values(transports).map(transport => {
            try {
              transport.close?.();
              return Promise.resolve();
            } catch (error) {
              console.log('Transport close error:', error);
              return Promise.resolve();
            }
          })
        );

        console.log('Cleanup completed');

        // Close Express server
        if (server) {
          server.close(() => {
            console.log('Server closed successfully');

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
      console.log(`Uncaught Exception: ${error.message}`);
      console.log(`Stack: ${error.stack}`);
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    process.once('unhandledRejection', (reason, promise) => {
      console.log(`Unhandled Rejection at: ${promise}`);
      console.log(`Reason: ${reason}`);
      gracefulShutdown('UNHANDLED_REJECTION');
    });

    return server;
  } catch (error) {
    console.log(
      `Server startup error: ${error instanceof Error ? error.message : String(error)}`
    );
    if (error instanceof Error && error.stack) {
      console.log(`Stack: ${error.stack}`);
    }
    process.exit(1);
  }
}

// Legacy class for backward compatibility (if needed for testing)
export class OctocodeLocalServer {
  private app: express.Application;
  private config: {
    port: number;
    host: string;
    corsOrigins: string[];
    enableApiExplorer: boolean;
    enableMetrics: boolean;
    requireOAuth?: boolean;
    hasOAuthCredentials: boolean;
  };
  private mcpServer: McpServer | null = null;
  private transport: StreamableHTTPServerTransport | null = null;

  constructor(config?: {
    port?: number;
    host?: string;
    corsOrigins?: string[];
    enableApiExplorer?: boolean;
    enableMetrics?: boolean;
    requireOAuth?: boolean;
  }) {
    this.app = express();

    // Default configuration
    const githubClientId = process.env.GITHUB_CLIENT_ID;
    const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;
    const hasOAuthCredentials = !!(githubClientId && githubClientSecret);

    this.config = {
      port: config?.port ?? 3000,
      host: config?.host ?? 'localhost',
      corsOrigins: config?.corsOrigins ?? ['http://localhost:3000'],
      enableApiExplorer: config?.enableApiExplorer ?? false,
      enableMetrics: config?.enableMetrics ?? false,
      requireOAuth: config?.requireOAuth ?? false,
      hasOAuthCredentials,
    };

    this.setupApp();
  }

  private async setupApp(): Promise<void> {
    // Setup middleware
    setupMiddleware(this.app, this.config.corsOrigins);

    // Setup MCP integration
    await this.setupMCPIntegration();

    // Setup additional routes
    setupAdditionalRoutes(this.app, this.config);

    // Add MCP not available handler for /mcp/* paths (before 404 handler)
    this.app.use('/mcp/*', (req, res) => {
      res.status(503).json({
        error: 'MCP Server not available',
        message: 'MCP server integration is not fully initialized',
      });
    });

    // Add 404 handler for unknown endpoints (must be last)
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Endpoint ${req.method} ${req.path} not found`,
        availableEndpoints: [
          'GET /health',
          'GET /api/status',
          'GET /api/explorer',
          'GET /metrics',
          'POST /',
        ],
      });
    });
  }

  private async setupMCPIntegration(): Promise<void> {
    try {
      // Create MCP transport
      this.transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });

      // Create MCP Server
      this.mcpServer = new McpServer(SERVER_CONFIG, {
        capabilities: {
          tools: {},
        },
      });

      // Register tools
      await registerAllTools(this.mcpServer);

      // Connect server to transport
      await this.mcpServer.connect(this.transport);

      // Setup MCP handler
      this.app.post('/', async (req, res) => {
        if (this.transport) {
          await this.transport.handleRequest(req, res, req.body);
        } else {
          res.status(503).json({
            error: 'MCP transport not available',
            message: 'MCP transport is not initialized',
          });
        }
      });
    } catch (error) {
      console.warn('Failed to setup MCP integration:', error);
      // Add fallback handler
      this.app.post('/', (req, res) => {
        res.status(503).json({
          error: 'MCP Server initialization failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      });
    }
  }

  public getApp(): express.Application {
    return this.app;
  }

  public async start(): Promise<void> {
    await startServer();
  }

  public getMcpServer(): McpServer | null {
    return this.mcpServer;
  }

  public getTransport(): StreamableHTTPServerTransport | null {
    return this.transport;
  }

  public getConfig() {
    return this.config;
  }
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch(error => {
    console.log('Server startup error:', error);
    process.exit(1);
  });
}

export { startServer };
export default OctocodeLocalServer;
