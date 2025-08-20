/**
 * Protected Resource Metadata Server
 *
 * Implements RFC 9728 OAuth 2.0 Protected Resource Metadata for MCP Authorization Protocol.
 * Provides OAuth discovery endpoints required for MCP clients to locate authorization servers
 * and understand resource server capabilities.
 *
 * Key Endpoints:
 * - /.well-known/oauth-protected-resource - Resource metadata (RFC 9728)
 * - /.well-known/oauth-authorization-server - Authorization server metadata (RFC 8414)
 * - Proper WWW-Authenticate headers on 401 responses (RFC 6750)
 *
 * Security Features:
 * - Token audience validation integration
 * - CORS support for cross-origin discovery
 * - Proper error responses with authentication challenges
 * - Integration with existing MCP auth infrastructure
 */

import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import { MCPAuthProtocol } from '../auth/mcpAuthProtocol.js';
import { ConfigManager } from '../config/serverConfig.js';

export interface ProtectedResourceServerOptions {
  port?: number;
  hostname?: string;
  corsEnabled?: boolean;
  enableHealthCheck?: boolean;
}

export class ProtectedResourceServer {
  private server: Server | null = null;
  private port: number;
  private hostname: string;
  private corsEnabled: boolean;
  private enableHealthCheck: boolean;
  private authProtocol: MCPAuthProtocol;
  private isListening = false;

  constructor(options: ProtectedResourceServerOptions = {}) {
    this.port = options.port || 3001;
    this.hostname = options.hostname || '127.0.0.1';
    this.corsEnabled = options.corsEnabled ?? true;
    this.enableHealthCheck = options.enableHealthCheck ?? true;
    this.authProtocol = MCPAuthProtocol.getInstance();
  }

  /**
   * Start the protected resource metadata server
   */
  async start(): Promise<void> {
    if (this.isListening) {
      throw new Error('Protected resource server is already running');
    }

    // Ensure auth protocol is initialized
    await this.authProtocol.initialize();

    return new Promise<void>((resolve, reject) => {
      this.server = createServer((req, res) => {
        this.handleRequest(req, res).catch(error => {
          this.handleError(res, error);
        });
      });

      // Handle server errors
      this.server.on('error', error => {
        reject(new Error(`Protected resource server error: ${error.message}`));
      });

      // Start listening
      this.server.listen(this.port, this.hostname, () => {
        this.isListening = true;
        resolve();
      });
    });
  }

  /**
   * Stop the server
   */
  stop(): void {
    if (this.server && this.isListening) {
      this.server.close();
      this.server = null;
      this.isListening = false;
    }
  }

  /**
   * Get the base URL for this server
   */
  getBaseUrl(): string {
    return `http://${this.hostname}:${this.port}`;
  }

  /**
   * Get the protected resource metadata URL
   */
  getMetadataUrl(): string {
    return `${this.getBaseUrl()}/.well-known/oauth-protected-resource`;
  }

  /**
   * Get the authorization server metadata URL
   */
  getAuthServerUrl(): string {
    return `${this.getBaseUrl()}/.well-known/oauth-authorization-server`;
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.isListening;
  }

  // Private methods

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    // Apply CORS headers if enabled
    if (this.corsEnabled) {
      this.setCorsHeaders(res);
    }

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Route requests
    switch (url.pathname) {
      case '/.well-known/oauth-protected-resource':
        await this.handleProtectedResourceMetadata(req, res);
        break;

      case '/.well-known/oauth-authorization-server':
        await this.handleAuthorizationServerMetadata(req, res);
        break;

      case '/health':
        if (this.enableHealthCheck) {
          await this.handleHealthCheck(req, res);
        } else {
          this.handleNotFound(res);
        }
        break;

      case '/api/protected':
        // Example protected endpoint for testing authentication
        await this.handleProtectedEndpoint(req, res);
        break;

      default:
        this.handleNotFound(res);
        break;
    }
  }

  /**
   * Handle /.well-known/oauth-protected-resource (RFC 9728)
   */
  private async handleProtectedResourceMetadata(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    if (req.method !== 'GET') {
      res.writeHead(405, { Allow: 'GET, OPTIONS' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    try {
      const metadata = this.authProtocol.getProtectedResourceMetadata();

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      });
      res.end(JSON.stringify(metadata, null, 2));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'internal_server_error',
          error_description: 'Failed to generate protected resource metadata',
        })
      );
    }
  }

  /**
   * Handle /.well-known/oauth-authorization-server (RFC 8414)
   */
  private async handleAuthorizationServerMetadata(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    if (req.method !== 'GET') {
      res.writeHead(405, { Allow: 'GET, OPTIONS' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    try {
      const metadata = this.authProtocol.getProtectedResourceMetadata();

      if (metadata.authorization_servers.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'not_found',
            error_description:
              'No authorization server configured for this resource server',
          })
        );
        return;
      }

      // Return the first (primary) authorization server metadata
      const authServerMetadata = metadata.authorization_servers[0];

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      });
      res.end(JSON.stringify(authServerMetadata, null, 2));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'internal_server_error',
          error_description: 'Failed to generate authorization server metadata',
        })
      );
    }
  }

  /**
   * Handle health check endpoint
   */
  private async handleHealthCheck(
    _req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const config = ConfigManager.getConfig();

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      server: 'protected-resource-metadata',
      version: config.version,
      port: this.port,
      endpoints: {
        protectedResource: `${this.getBaseUrl()}/.well-known/oauth-protected-resource`,
        authorizationServer: `${this.getBaseUrl()}/.well-known/oauth-authorization-server`,
      },
      oauth: {
        enabled: !!config.oauth?.enabled,
        githubApp: !!config.githubApp?.enabled,
        enterpriseMode: !!config.enterprise?.organizationId,
      },
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health, null, 2));
  }

  /**
   * Handle protected endpoint (example for testing authentication)
   */
  private async handleProtectedEndpoint(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      const challenge = this.authProtocol.createAuthChallenge(
        'github-api',
        'repo read:user',
        'missing_token',
        'Authorization header with Bearer token is required'
      );

      res.writeHead(401, {
        ...challenge.headers,
        'Content-Type': 'application/json',
      });
      res.end(JSON.stringify(challenge.body));
      return;
    }

    const validation = await this.authProtocol.validateBearerToken(authHeader);

    if (!validation.valid) {
      const challenge = this.authProtocol.createAuthChallenge(
        'github-api',
        'repo read:user',
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

    // Token is valid - return success response
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        message: 'Successfully authenticated with protected resource',
        scopes: validation.scopes,
        timestamp: new Date().toISOString(),
      })
    );
  }

  /**
   * Handle 404 Not Found
   */
  private handleNotFound(res: ServerResponse): void {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'not_found',
        error_description: 'The requested endpoint was not found',
        available_endpoints: [
          '/.well-known/oauth-protected-resource',
          '/.well-known/oauth-authorization-server',
          ...(this.enableHealthCheck ? ['/health'] : []),
        ],
      })
    );
  }

  /**
   * Handle server errors
   */
  private handleError(res: ServerResponse, error: unknown): void {
    // Use stderr instead of console to match audit logger patterns
    process.stderr.write(
      `Protected resource server error: ${error instanceof Error ? error.message : String(error)}\n`
    );

    // Audit log the server error for security monitoring
    try {
      // Dynamic import to avoid circular dependencies
      import('../security/auditLogger.js').then(({ AuditLogger }) => {
        AuditLogger.logEvent({
          action: 'oauth_server_error',
          outcome: 'failure',
          source: 'system',
          details: {
            error: error instanceof Error ? error.message : String(error),
            component: 'protected_resource_server',
          },
        });
      });
    } catch {
      // Silent fail - don't let audit logging break error handling
    }

    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'internal_server_error',
          error_description: 'An internal server error occurred',
        })
      );
    }
  }

  /**
   * Set CORS headers for cross-origin requests
   */
  private setCorsHeaders(res: ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization'
    );
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  }
}

/**
 * Utility function to start protected resource server
 */
export async function createProtectedResourceServer(
  options?: ProtectedResourceServerOptions
): Promise<ProtectedResourceServer> {
  const server = new ProtectedResourceServer(options);
  await server.start();
  return server;
}

/**
 * Utility function to create server configuration from environment
 */
export function getProtectedResourceServerConfig(): ProtectedResourceServerOptions {
  return {
    port: parseInt(process.env.OAUTH_METADATA_PORT || '3001'),
    hostname: process.env.OAUTH_METADATA_HOST || '127.0.0.1',
    corsEnabled: process.env.OAUTH_METADATA_CORS !== 'false',
    enableHealthCheck: process.env.OAUTH_METADATA_HEALTH !== 'false',
  };
}
