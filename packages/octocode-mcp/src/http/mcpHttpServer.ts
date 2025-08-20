/**
 * MCP HTTP Server with OAuth Authentication
 *
 * Provides HTTP transport for MCP with proper OAuth 2.1 authentication challenges.
 * Integrates with existing OAuth infrastructure and metadata servers.
 */

import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { MCPAuthProtocol } from '../auth/mcpAuthProtocol.js';
import { ConfigManager } from '../config/serverConfig.js';

export interface MCPHttpServerOptions {
  port?: number;
  hostname?: string;
  corsEnabled?: boolean;
  enableHealthCheck?: boolean;
}

export class MCPHttpServer {
  private server: Server | null = null;
  private authProtocol: MCPAuthProtocol;
  private options: Required<MCPHttpServerOptions>;

  constructor(_mcpServer: McpServer, options: MCPHttpServerOptions = {}) {
    // Note: mcpServer parameter is reserved for future integration with actual MCP tools
    this.authProtocol = MCPAuthProtocol.getInstance();
    this.options = {
      port: options.port || 3000,
      hostname: options.hostname || '127.0.0.1',
      corsEnabled: options.corsEnabled ?? true,
      enableHealthCheck: options.enableHealthCheck ?? true,
    };
  }

  async start(): Promise<void> {
    if (this.server) {
      throw new Error('MCP HTTP server is already running');
    }

    this.server = createServer((req, res) => {
      this.handleRequest(req, res).catch(error => {
        // Log error to stderr instead of console for ESLint compliance
        process.stderr.write(`MCP HTTP server error: ${error}\n`);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: 'internal_server_error',
              error_description: 'Internal server error',
            })
          );
        }
      });
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(this.options.port, this.options.hostname, () => {
        resolve();
      });

      this.server!.on('error', reject);
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  getBaseUrl(): string {
    return `http://${this.options.hostname}:${this.options.port}`;
  }

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    // Add CORS headers if enabled
    if (this.options.corsEnabled) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization'
      );
    }

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    // Health check endpoint
    if (this.options.enableHealthCheck && url.pathname === '/health') {
      return this.handleHealthCheck(req, res);
    }

    // Main MCP endpoint
    if (url.pathname === '/mcp') {
      return this.handleMCPRequest(req, res);
    }

    // 404 for other paths
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'not_found',
        error_description: 'Endpoint not found',
      })
    );
  }

  private async handleMCPRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    // Check for Bearer token in Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Return 401 with OAuth challenge
      const challenge = this.authProtocol.createAuthChallenge(
        'github-api',
        'repo read:user read:org',
        'missing_token',
        'Bearer token required for MCP access'
      );

      res.writeHead(401, {
        ...challenge.headers,
        'Content-Type': 'application/json',
      });
      res.end(JSON.stringify(challenge.body));
      return;
    }

    // Validate the Bearer token
    const validation = await this.authProtocol.validateBearerToken(authHeader);

    if (!validation.valid) {
      const challenge = this.authProtocol.createAuthChallenge(
        'github-api',
        'repo read:user read:org',
        'invalid_token',
        validation.error || 'Token validation failed'
      );

      res.writeHead(401, {
        ...challenge.headers,
        'Content-Type': 'application/json',
      });
      res.end(JSON.stringify(challenge.body));
      return;
    }

    // Token is valid - handle MCP request
    try {
      // Read the request body
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          // Parse JSON-RPC request
          const jsonRpcRequest = JSON.parse(body || '{}');

          // Handle JSON-RPC methods
          let response;

          if (jsonRpcRequest.method === 'tools/list') {
            // Return a simple tools list response
            // In a real implementation, you'd get this from the server's registered tools
            response = {
              jsonrpc: '2.0',
              id: jsonRpcRequest.id,
              result: {
                tools: [
                  {
                    name: 'demo_tool',
                    description: 'Demo tool for OAuth testing',
                    inputSchema: {
                      type: 'object',
                      properties: {},
                    },
                  },
                ],
              },
            };
          } else if (jsonRpcRequest.method === 'tools/call') {
            // Return a simple tool call response
            response = {
              jsonrpc: '2.0',
              id: jsonRpcRequest.id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: 'OAuth authentication successful! This is a demo response.',
                  },
                ],
              },
            };
          } else {
            // Method not found
            response = {
              jsonrpc: '2.0',
              id: jsonRpcRequest.id,
              error: {
                code: -32601,
                message: 'Method not found',
              },
            };
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response));
        } catch (parseError) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id: null,
              error: {
                code: -32700,
                message: 'Parse error',
              },
            })
          );
        }
      });
    } catch (error) {
      // Log error to stderr instead of console for ESLint compliance
      process.stderr.write(`MCP request handling error: ${error}\n`);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'internal_server_error',
            error_description: 'Failed to process MCP request',
          })
        );
      }
    }
  }

  private async handleHealthCheck(
    _req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const config = ConfigManager.getConfig();

    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      server: 'octocode-mcp-http',
      version: process.env.npm_package_version || 'unknown',
      oauth: {
        enabled: config.oauth?.enabled || false,
        metadata_server_running: true, // Assume running if this server is up
      },
      github: {
        host: config.githubHost || 'https://github.com',
        enterprise: config.githubHost !== 'https://github.com',
      },
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health, null, 2));
  }
}

export function getMCPHttpServerConfig(): MCPHttpServerOptions {
  return {
    port: parseInt(process.env.MCP_HTTP_PORT || '3000', 10),
    hostname: process.env.MCP_HTTP_HOST || '127.0.0.1',
    corsEnabled: process.env.MCP_HTTP_CORS !== 'false',
    enableHealthCheck: process.env.MCP_HTTP_HEALTH_CHECK !== 'false',
  };
}
