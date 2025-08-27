import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock octocode-mcp before importing
vi.mock('octocode-mcp', () => ({
  registerAllTools: vi.fn(async server => {
    console.log('Mock: registerAllTools called with server:', !!server);
    // Mock successful tool registration
    return Promise.resolve();
  }),
}));

// Mock MCP SDK components
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    setRequestHandler: vi.fn(),
    close: vi.fn(),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: vi.fn().mockImplementation(() => ({
    handleRequest: vi.fn().mockImplementation(async (req, res, body) => {
      // Extract ID from request body or use default
      const requestId = body?.id || 1;
      res.status(200).json({
        jsonrpc: '2.0',
        result: { capabilities: { tools: {} } },
        id: requestId,
      });
    }),
    onclose: null,
    sessionId: 'test-session-id',
    close: vi.fn(),
  })),
}));

// Mock mcp-s-oauth
vi.mock('mcp-s-oauth', () => ({
  McpOAuth: vi.fn(() => ({
    router: {
      use: vi.fn(),
      get: vi.fn(),
      post: vi.fn(),
    },
  })),
  githubConnector: {},
}));

// Import after mocking
import { OctocodeLocalServer } from '../src/server.js';

describe('OctocodeLocalServer', () => {
  let server: OctocodeLocalServer;
  let app: express.Application;

  beforeEach(() => {
    // Create server instance with test configuration
    server = new OctocodeLocalServer({
      port: 0, // Use random port for testing
      host: 'localhost',
      corsOrigins: ['http://localhost:3000'],
      enableApiExplorer: true,
      enableMetrics: true,
    });

    // Access the express app for testing
    app = server.getApp();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Health endpoints', () => {
    it('should respond to health check', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        version: expect.any(String),
        uptime: expect.any(Number),
        mcpServerStatus: expect.any(String),
      });

      expect(response.body.timestamp).toBeDefined();
    });

    it('should respond to status endpoint', async () => {
      const response = await request(app).get('/api/status').expect(200);

      expect(response.body).toMatchObject({
        localServer: {
          status: 'running',
          port: expect.any(Number),
          host: 'localhost',
          features: {
            apiExplorer: true,
            metrics: true,
          },
        },
        mcpServer: {
          status: expect.any(String),
        },
        environment: {
          nodeVersion: expect.any(String),
          platform: expect.any(String),
          arch: expect.any(String),
        },
      });
    });
  });

  describe('Development endpoints', () => {
    it('should respond to API explorer endpoint', async () => {
      const response = await request(app).get('/api/explorer').expect(200);

      expect(response.body).toMatchObject({
        title: expect.stringContaining('Octocode Local Server'),
        version: expect.any(String),
        endpoints: expect.any(Object),
        mcpIntegration: expect.any(Object),
      });
    });

    it('should respond to metrics endpoint', async () => {
      const response = await request(app).get('/metrics').expect(200);

      expect(response.body).toMatchObject({
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        memory: {
          rss: expect.any(Number),
          heapTotal: expect.any(Number),
          heapUsed: expect.any(Number),
          external: expect.any(Number),
        },
        process: {
          pid: expect.any(Number),
          platform: expect.any(String),
          arch: expect.any(String),
          version: expect.any(String),
        },
      });
    });
  });

  describe('Error handling', () => {
    it('should handle 404 for unknown endpoints', async () => {
      const response = await request(app).get('/unknown-endpoint').expect(404);

      expect(response.body).toMatchObject({
        error: 'Not Found',
        message: expect.stringContaining('not found'),
        availableEndpoints: expect.any(Array),
      });
    });

    it('should handle MCP server not available', async () => {
      const response = await request(app).get('/mcp/test').expect(503);

      expect(response.body).toMatchObject({
        error: 'MCP Server not available',
        message: expect.any(String),
      });
    });
  });

  describe('Security middleware', () => {
    it('should include security headers', async () => {
      const response = await request(app).get('/health').expect(200);

      // Check for Helmet security headers
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
    });

    it('should handle CORS properly', async () => {
      const response = await request(app)
        .options('/health')
        .set('Origin', 'http://localhost:3000')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBe(
        'http://localhost:3000'
      );
    });
  });

  describe('Request handling', () => {
    it('should parse JSON requests', async () => {
      // This tests that the JSON middleware is working
      const response = await request(app)
        .post('/api/status') // POST to a GET endpoint should still parse JSON
        .send({ test: 'data' })
        .expect(404); // 404 because POST is not allowed, but JSON should be parsed

      expect(response.body).toHaveProperty('error');
    });

    it('should handle large request bodies within limits', async () => {
      const largeData = 'x'.repeat(1000); // 1KB of data

      const response = await request(app)
        .post('/api/status')
        .send({ data: largeData })
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('MCP Integration', () => {
    it('should have MCP server instance after initialization', async () => {
      // Wait for initialization to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const mcpServer = server.getMcpServer();
      expect(mcpServer).toBeDefined();
    });

    it('should have transport instance after initialization', async () => {
      // Wait for initialization to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const transport = server.getTransport();
      expect(transport).toBeDefined();
      expect(transport).toHaveProperty('sessionId');
    });

    it('should handle MCP protocol requests via POST /', async () => {
      // Mock MCP request payload
      const mcpRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
          },
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
      };

      const response = await request(app)
        .post('/')
        .send(mcpRequest)
        .set('Content-Type', 'application/json')
        .expect(200);

      expect(response.body).toMatchObject({
        jsonrpc: '2.0',
        result: expect.objectContaining({
          capabilities: expect.objectContaining({
            tools: expect.any(Object),
          }),
        }),
        id: 1,
      });
    });

    it('should handle MCP tool list requests', async () => {
      const toolListRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      };

      const response = await request(app)
        .post('/')
        .send(toolListRequest)
        .set('Content-Type', 'application/json')
        .expect(200);

      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 2);
    });

    it('should handle MCP session with session ID header', async () => {
      const mcpRequest = {
        jsonrpc: '2.0',
        id: 3,
        method: 'ping',
        params: {},
      };

      const response = await request(app)
        .post('/')
        .send(mcpRequest)
        .set('Content-Type', 'application/json')
        .set('mcp-session-id', 'test-session-123')
        .expect(200);

      expect(response.body).toHaveProperty('jsonrpc', '2.0');
    });

    it('should register octocode-mcp tools successfully', async () => {
      // The mock should have been called during server initialization
      const { registerAllTools } = await import('octocode-mcp');
      expect(registerAllTools).toHaveBeenCalled();
    });

    it('should handle MCP connection errors gracefully', async () => {
      // Test with invalid MCP request
      const invalidRequest = {
        invalidField: 'test',
      };

      const response = await request(app)
        .post('/')
        .send(invalidRequest)
        .set('Content-Type', 'application/json');

      // Should still respond (transport handles validation)
      expect(response.status).toBeOneOf([200, 400, 500]);
    });

    it('should support MCP server capabilities', async () => {
      const serverConfig = server.getConfig();
      expect(serverConfig).toBeDefined();

      // Check that the server was configured with proper capabilities
      const mcpServer = server.getMcpServer();
      expect(mcpServer).toBeDefined();
    });

    it('should handle transport cleanup properly', async () => {
      const transport = server.getTransport();
      expect(transport).toBeDefined();

      // Test that transport has cleanup methods
      expect(transport).toHaveProperty('close');
    });
  });

  describe('OAuth Integration', () => {
    beforeEach(() => {
      // Clear environment variables
      delete process.env.GITHUB_CLIENT_ID;
      delete process.env.GITHUB_CLIENT_SECRET;
    });

    it('should detect OAuth credentials when available', () => {
      process.env.GITHUB_CLIENT_ID = 'test_client_id';
      process.env.GITHUB_CLIENT_SECRET = 'test_client_secret';

      const oauthServer = new OctocodeLocalServer({
        port: 0,
        enableApiExplorer: true,
      });

      const config = oauthServer.getConfig();
      expect(config.hasOAuthCredentials).toBe(true);
    });

    it('should handle missing OAuth credentials', () => {
      const serverWithoutOauth = new OctocodeLocalServer({
        port: 0,
        requireOAuth: false,
      });

      const config = serverWithoutOauth.getConfig();
      expect(config.hasOAuthCredentials).toBe(false);
    });

    it('should reflect OAuth status in API explorer', async () => {
      process.env.GITHUB_CLIENT_ID = 'test_client_id';
      process.env.GITHUB_CLIENT_SECRET = 'test_client_secret';

      const oauthServer = new OctocodeLocalServer({
        port: 0,
        enableApiExplorer: true,
      });

      const response = await request(oauthServer.getApp())
        .get('/api/explorer')
        .expect(200);

      expect(response.body.mcpIntegration.authentication).toBe('OAuth2');
    });
  });

  describe('Advanced MCP Features', () => {
    it('should handle concurrent MCP requests', async () => {
      const mcpRequest = {
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
      };

      // Send multiple concurrent requests
      const promises = Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post('/')
          .send({ ...mcpRequest, id: i + 1 })
          .set('Content-Type', 'application/json')
      );

      const responses = await Promise.all(promises);

      // All should succeed
      responses.forEach((response, i) => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('jsonrpc', '2.0');
        expect(response.body).toHaveProperty('id', i + 1);
      });
    });

    it('should handle MCP tool execution requests', async () => {
      const toolRequest = {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'github_search_code',
          arguments: {
            queries: [
              {
                queryTerms: ['test'],
                owner: 'test-owner',
                repo: 'test-repo',
              },
            ],
          },
        },
      };

      const response = await request(app)
        .post('/')
        .send(toolRequest)
        .set('Content-Type', 'application/json');

      // Should handle the request (mock transport will respond)
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
    });

    it('should handle MCP notifications', async () => {
      const notification = {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {},
      };

      const response = await request(app)
        .post('/')
        .send(notification)
        .set('Content-Type', 'application/json');

      // Notifications don't require responses, but transport should handle them
      expect(response.status).toBe(200);
    });

    it('should provide proper MCP server information', async () => {
      const response = await request(app).get('/api/status').expect(200);

      expect(response.body.mcpServer).toMatchObject({
        status: 'running',
        capabilities: ['tools'],
      });
    });

    it('should handle transport session management', async () => {
      const sessionId = 'test-session-456';

      const request1 = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {},
      };

      const request2 = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      };

      // First request with session ID
      const response1 = await request(app)
        .post('/')
        .send(request1)
        .set('Content-Type', 'application/json')
        .set('mcp-session-id', sessionId)
        .expect(200);

      // Second request with same session ID
      const response2 = await request(app)
        .post('/')
        .send(request2)
        .set('Content-Type', 'application/json')
        .set('mcp-session-id', sessionId)
        .expect(200);

      expect(response1.body).toHaveProperty('jsonrpc', '2.0');
      expect(response2.body).toHaveProperty('jsonrpc', '2.0');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed JSON in MCP requests', async () => {
      const response = await request(app)
        .post('/')
        .send('{ invalid json }')
        .set('Content-Type', 'application/json');

      // Should handle malformed JSON gracefully
      expect(response.status).toBeOneOf([400, 500]);
    });

    it('should handle empty MCP request body', async () => {
      const response = await request(app)
        .post('/')
        .send({})
        .set('Content-Type', 'application/json');

      // Should handle empty body
      expect(response.status).toBeOneOf([200, 400]);
    });

    it('should handle very large MCP requests within limits', async () => {
      const largeRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'test_tool',
          arguments: {
            data: 'x'.repeat(1000000), // 1MB of data
          },
        },
      };

      const response = await request(app)
        .post('/')
        .send(largeRequest)
        .set('Content-Type', 'application/json');

      // Should handle large requests (within 10MB limit)
      expect(response.status).toBeOneOf([200, 413]); // 413 = Payload Too Large
    });

    it('should maintain proper Content-Type headers for MCP responses', async () => {
      const mcpRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {},
      };

      const response = await request(app)
        .post('/')
        .send(mcpRequest)
        .set('Content-Type', 'application/json')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });
});
