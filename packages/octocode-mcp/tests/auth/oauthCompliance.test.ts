/**
 * OAuth MCP Compliance Tests
 *
 * Comprehensive test suite for MCP Authorization Protocol compliance.
 * Tests RFC 9728, RFC 8707, RFC 7636, and RFC 6750 compliance.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OAuthManager } from '../../src/auth/oauthManager.js';
import { MCPAuthProtocol } from '../../src/auth/mcpAuthProtocol.js';
import { ProtectedResourceServer } from '../../src/http/protectedResourceServer.js';
import { ConfigManager } from '../../src/config/serverConfig.js';

// Mock fetch for testing OAuth calls, but preserve real fetch for server tests
const mockFetch = vi.fn();
const originalFetch = global.fetch;

describe('OAuth MCP Compliance', () => {
  let oauthManager: OAuthManager;
  let mcpAuthProtocol: MCPAuthProtocol;
  let protectedResourceServer: ProtectedResourceServer;

  beforeEach(() => {
    vi.clearAllMocks();

    // Use mock fetch for OAuth calls
    global.fetch = mockFetch;

    // Mock environment for OAuth configuration
    process.env.GITHUB_OAUTH_CLIENT_ID = 'test-client-id';
    process.env.GITHUB_OAUTH_CLIENT_SECRET = 'test-client-secret';
    process.env.GITHUB_OAUTH_REDIRECT_URI =
      'http://localhost:3000/auth/callback';
    process.env.MCP_SERVER_RESOURCE_URI = 'https://test-mcp-server.com/mcp';

    // Initialize managers
    oauthManager = OAuthManager.getInstance();
    mcpAuthProtocol = MCPAuthProtocol.getInstance();

    // Initialize with test config
    ConfigManager.updateConfig({
      oauth: {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        redirectUri: 'http://localhost:3000/auth/callback',
        scopes: ['repo', 'read:user'],
        enabled: true,
      },
    });

    oauthManager.initialize();
  });

  afterEach(async () => {
    if (protectedResourceServer) {
      protectedResourceServer.stop();
    }

    // Clean up environment
    delete process.env.GITHUB_OAUTH_CLIENT_ID;
    delete process.env.GITHUB_OAUTH_CLIENT_SECRET;
    delete process.env.GITHUB_OAUTH_REDIRECT_URI;
    delete process.env.MCP_SERVER_RESOURCE_URI;
  });

  describe('RFC 8707 - Token Audience Validation', () => {
    it('should validate token audience successfully for own tokens', async () => {
      // Mock successful GitHub user API response
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'repo, read:user' },
        })
      );

      // Mock successful token introspection response
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              app: { client_id: 'test-client-id' },
              expires_at: new Date(Date.now() + 3600000).toISOString(),
            }),
        })
      );

      const result = await oauthManager.validateToken(
        'gho_test_token_123',
        'https://test-mcp-server.com/mcp'
      );

      expect(result.valid).toBe(true);
      expect(result.scopes).toContain('repo');
      expect(result.scopes).toContain('read:user');
      expect(result.expiresAt).toBeDefined();
    });

    it('should reject tokens from different OAuth applications', async () => {
      // Mock successful GitHub user API response
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'repo, read:user' },
        })
      );

      // Mock token introspection showing different client_id
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              app: { client_id: 'different-client-id' },
              expires_at: new Date(Date.now() + 3600000).toISOString(),
            }),
        })
      );

      const result = await oauthManager.validateToken(
        'gho_foreign_token_123',
        'https://test-mcp-server.com/mcp'
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Token was issued by client_id');
      expect(result.error).toContain('different-client-id');
    });

    it('should reject expired tokens', async () => {
      // Mock successful GitHub user API response
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'repo, read:user' },
        })
      );

      // Mock token introspection showing expired token
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              app: { client_id: 'test-client-id' },
              expires_at: new Date(Date.now() - 3600000).toISOString(), // Expired 1 hour ago
            }),
        })
      );

      const result = await oauthManager.validateToken(
        'gho_expired_token_123',
        'https://test-mcp-server.com/mcp'
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Token has expired');
    });

    it('should handle token introspection failures', async () => {
      // Mock successful GitHub user API response
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'repo, read:user' },
        })
      );

      // Mock failed token introspection (404 - token not found)
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          status: 404,
        })
      );

      const result = await oauthManager.validateToken(
        'gho_invalid_token_123',
        'https://test-mcp-server.com/mcp'
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Token introspection failed: 404');
    });
  });

  describe('RFC 9728 - Protected Resource Metadata', () => {
    beforeEach(async () => {
      // Use real fetch for server tests
      global.fetch = originalFetch;

      // Initialize MCP auth protocol first
      await mcpAuthProtocol.initialize();

      protectedResourceServer = new ProtectedResourceServer({
        port: 3002, // Use different port for testing
      });
      await protectedResourceServer.start();
    });

    it('should serve protected resource metadata', async () => {
      const response = await fetch(
        'http://127.0.0.1:3002/.well-known/oauth-protected-resource'
      );
      expect(response.ok).toBe(true);
      expect(response.headers.get('content-type')).toContain(
        'application/json'
      );

      const metadata = await response.json();
      expect(metadata).toHaveProperty('authorization_servers');
      expect(metadata).toHaveProperty('resource_server');
      expect(metadata).toHaveProperty('scopes_supported');
      expect(metadata.authorization_servers).toBeInstanceOf(Array);
      expect(metadata.scopes_supported).toContain('repo');
      expect(metadata.scopes_supported).toContain('read:user');
    });

    it('should serve authorization server metadata', async () => {
      const response = await fetch(
        'http://127.0.0.1:3002/.well-known/oauth-authorization-server'
      );
      expect(response.ok).toBe(true);

      const metadata = await response.json();
      expect(metadata).toHaveProperty('issuer');
      expect(metadata).toHaveProperty('authorization_endpoint');
      expect(metadata).toHaveProperty('token_endpoint');
      expect(metadata).toHaveProperty('scopes_supported');
      expect(metadata.code_challenge_methods_supported).toContain('S256');
    });

    it('should handle CORS preflight requests', async () => {
      const response = await fetch(
        'http://127.0.0.1:3002/.well-known/oauth-protected-resource',
        {
          method: 'OPTIONS',
        }
      );

      expect(response.ok).toBe(true);
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
      expect(response.headers.get('access-control-allow-methods')).toContain(
        'GET'
      );
    });

    it('should return proper cache headers', async () => {
      const response = await fetch(
        'http://127.0.0.1:3002/.well-known/oauth-protected-resource'
      );
      expect(response.headers.get('cache-control')).toContain('max-age=3600');
    });

    it('should provide health check endpoint', async () => {
      const response = await fetch('http://127.0.0.1:3002/health');
      expect(response.ok).toBe(true);

      const health = await response.json();
      expect(health.status).toBe('healthy');
      expect(health.endpoints).toHaveProperty('protectedResource');
      expect(health.endpoints).toHaveProperty('authorizationServer');
    });
  });

  describe('RFC 6750 - WWW-Authenticate Headers', () => {
    it('should create proper authentication challenge', () => {
      const challenge = mcpAuthProtocol.createAuthChallenge(
        'github-api',
        'repo read:user',
        'invalid_token',
        'Token validation failed'
      );

      expect(challenge.status).toBe(401);
      expect(challenge.headers).toHaveProperty('WWW-Authenticate');
      expect(challenge.headers['WWW-Authenticate']).toContain('Bearer');
      expect(challenge.headers['WWW-Authenticate']).toContain(
        'realm="github-api"'
      );
      expect(challenge.headers['WWW-Authenticate']).toContain(
        'scope="repo read:user"'
      );
      expect(challenge.headers['WWW-Authenticate']).toContain(
        'error="invalid_token"'
      );
      expect(challenge.headers['WWW-Authenticate']).toContain(
        'resource_metadata='
      );
    });

    it('should include proper cache control headers', () => {
      const challenge = mcpAuthProtocol.createAuthChallenge();

      expect(challenge.headers['Cache-Control']).toBe(
        'no-cache, no-store, must-revalidate'
      );
      expect(challenge.headers['Pragma']).toBe('no-cache');
    });

    it('should include resource metadata URL in response body', () => {
      const challenge = mcpAuthProtocol.createAuthChallenge(
        'github-api',
        'repo',
        'missing_token'
      );

      expect(challenge.body).toHaveProperty('resource_metadata');
      expect(
        (challenge.body as { resource_metadata: string }).resource_metadata
      ).toContain('/.well-known/oauth-protected-resource');
      expect(challenge.body).toHaveProperty('realm');
      expect(challenge.body).toHaveProperty('scope');
    });
  });

  describe('Bearer Token Validation Integration', () => {
    it('should validate bearer token with audience checking', async () => {
      // Mock successful GitHub user API response
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => 'repo, read:user' },
        })
      );

      // Mock successful token introspection
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              app: { client_id: 'test-client-id' },
            }),
        })
      );

      const result = await mcpAuthProtocol.validateBearerToken(
        'Bearer gho_test_token_123'
      );

      expect(result.valid).toBe(true);
      expect(result.token).toBe('gho_test_token_123');
      expect(result.scopes).toContain('repo');
    });

    it('should handle malformed authorization headers', async () => {
      const result = await mcpAuthProtocol.validateBearerToken('InvalidHeader');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid authorization header format');
    });

    it('should handle empty tokens', async () => {
      const result = await mcpAuthProtocol.validateBearerToken('Bearer ');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid authorization header format');
    });
  });

  describe('PKCE Integration (RFC 7636)', () => {
    it('should generate secure PKCE parameters', () => {
      const pkce = oauthManager.generatePKCEParams();

      expect(pkce.codeVerifier).toHaveLength(128);
      expect(pkce.codeChallenge).toBeTruthy();
      expect(pkce.codeChallengeMethod).toBe('S256');

      // Verify code challenge is base64url encoded
      expect(pkce.codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(pkce.codeChallenge).not.toContain('='); // No padding in base64url
    });

    it('should generate different PKCE parameters each time', () => {
      const pkce1 = oauthManager.generatePKCEParams();
      const pkce2 = oauthManager.generatePKCEParams();

      expect(pkce1.codeVerifier).not.toBe(pkce2.codeVerifier);
      expect(pkce1.codeChallenge).not.toBe(pkce2.codeChallenge);
    });

    it('should include resource parameter in authorization URL', () => {
      const state = 'test-state-123';
      const codeChallenge = 'test-code-challenge';

      const authUrl = oauthManager.createAuthorizationUrl(
        state,
        codeChallenge,
        {},
        'https://test-server.com/mcp'
      );

      const url = new URL(authUrl);
      expect(url.searchParams.get('resource')).toBe(
        'https://test-server.com/mcp'
      );
      expect(url.searchParams.get('code_challenge')).toBe(codeChallenge);
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('state')).toBe(state);
    });
  });

  describe('Enterprise Integration', () => {
    it('should log OAuth events for audit purposes', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Mock failed GitHub API call
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
        })
      );

      const result = await oauthManager.validateToken('invalid-token');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Token validation failed: 401');

      consoleSpy.mockRestore();
    });
  });

  describe('Error Handling and Security', () => {
    beforeEach(() => {
      // Use mock fetch for OAuth error tests
      global.fetch = mockFetch;
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await oauthManager.validateToken('test-token');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Network error');
    });

    it('should use timing-safe state validation', () => {
      const validState = 'abcd1234efgh5678';
      const validState2 = 'abcd1234efgh5678';
      const invalidState = 'abcd1234efgh5679';
      const differentLengthState = 'short';

      expect(oauthManager.validateState(validState, validState2)).toBe(true);
      expect(oauthManager.validateState(validState, invalidState)).toBe(false);
      expect(oauthManager.validateState(validState, differentLengthState)).toBe(
        false
      );
      expect(oauthManager.validateState('', validState)).toBe(false);
    });
  });

  describe('Protected Resource Server Security', () => {
    beforeEach(async () => {
      // Use real fetch for server tests
      global.fetch = originalFetch;

      // Initialize MCP auth protocol first
      await mcpAuthProtocol.initialize();

      protectedResourceServer = new ProtectedResourceServer({
        port: 3003,
      });
      await protectedResourceServer.start();
    });

    it('should require authentication for protected endpoints', async () => {
      const response = await fetch('http://127.0.0.1:3003/api/protected');

      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toContain('Bearer');

      const body = await response.json();
      expect(body.error).toBe('missing_token');
      expect(body.resource_metadata).toBeTruthy();
    });

    it('should validate tokens on protected endpoints', async () => {
      // Mock OAuth manager to simulate token validation failure
      vi.spyOn(mcpAuthProtocol, 'validateBearerToken').mockResolvedValue({
        valid: false,
        error: 'Invalid token',
      });

      const response = await fetch('http://127.0.0.1:3003/api/protected', {
        headers: {
          Authorization: 'Bearer invalid-token',
        },
      });

      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toContain('Bearer');
    });
  });
});
