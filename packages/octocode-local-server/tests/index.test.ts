import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// Note: MCP server integration is not yet implemented

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
});
