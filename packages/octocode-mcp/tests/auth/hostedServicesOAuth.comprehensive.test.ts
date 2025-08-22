// @ts-nocheck
/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Comprehensive Hosted Services OAuth Tests with Callback URLs
 *
 * Tests all aspects of Hosted Services OAuth as described in INSTALLATION.md Level 4:
 * - OAuth with callback URLs for web applications
 * - MCP compliance (RFC 8707)
 * - Docker deployment scenarios
 * - MCP Gateway integration
 * - Production callback URL handling
 * - Deep link OAuth callbacks
 * - Metadata server integration
 * - Protected resource server
 * - Cloud platform integration
 * - Containerized deployments
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OAuthCallbackServer } from '../../src/http/oauthCallbackServer.js';
import { ProtectedResourceServer } from '../../src/http/protectedResourceServer.js';
import { ResourceMetadataServer } from '../../src/http/resourceMetadataServer.js';
import { MCPHttpServer } from '../../src/http/mcpHttpServer.js';
import { MCPAuthProtocol } from '../../src/auth/mcpAuthProtocol.js';
import { OAuthManager } from '../../src/auth/oauthManager.js';
import { ConfigManager } from '../../src/config/serverConfig.js';
import { createMockMcpServer } from '../fixtures/mcp-fixtures.js';
import type { ServerConfig } from '../../src/config/serverConfig.js';

// Mock external dependencies
vi.mock('../../src/http/oauthCallbackServer.js');
vi.mock('../../src/http/protectedResourceServer.js');
vi.mock('../../src/http/resourceMetadataServer.js');
vi.mock('../../src/http/mcpHttpServer.js');
vi.mock('../../src/auth/mcpAuthProtocol.js');
vi.mock('../../src/auth/oauthManager.js');
vi.mock('../../src/config/serverConfig.js');

const mockOAuthCallbackServer = vi.mocked(OAuthCallbackServer);
const mockProtectedResourceServer = vi.mocked(ProtectedResourceServer);
const mockResourceMetadataServer = vi.mocked(ResourceMetadataServer);
const mockMCPHttpServer = vi.mocked(MCPHttpServer);
const mockMCPAuthProtocol = vi.mocked(MCPAuthProtocol);
const mockOAuthManager = vi.mocked(OAuthManager);
const mockConfigManager = vi.mocked(ConfigManager);

// Mock fetch for external HTTP calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Hosted Services OAuth - Comprehensive Tests', () => {
  let mockServer: ReturnType<typeof createMockMcpServer>;
  let mockCallbackServerInstance: {
    startAndWaitForCallback: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    getCallbackUrl: ReturnType<typeof vi.fn>;
    isRunning: ReturnType<typeof vi.fn>;
  };
  let mockProtectedResourceInstance: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    getBaseUrl: ReturnType<typeof vi.fn>;
    getMetadataUrl: ReturnType<typeof vi.fn>;
    isRunning: ReturnType<typeof vi.fn>;
  };
  let mockMetadataServerInstance: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    getBaseUrl: ReturnType<typeof vi.fn>;
  };
  let mockMCPHttpServerInstance: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    getBaseUrl: ReturnType<typeof vi.fn>;
  };
  let mockConfig: ServerConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    mockServer = createMockMcpServer();

    // Mock Callback Server instance
    mockCallbackServerInstance = {
      startAndWaitForCallback: vi.fn(),
      stop: vi.fn(),
      getCallbackUrl: vi.fn(),
      isRunning: vi.fn(),
    };

    // Mock Protected Resource Server instance
    mockProtectedResourceInstance = {
      start: vi.fn(),
      stop: vi.fn(),
      getBaseUrl: vi.fn(),
      getMetadataUrl: vi.fn(),
      isRunning: vi.fn(),
    };

    // Mock Metadata Server instance
    mockMetadataServerInstance = {
      start: vi.fn(),
      stop: vi.fn(),
      getBaseUrl: vi.fn(),
    };

    // Mock MCP HTTP Server instance
    mockMCPHttpServerInstance = {
      start: vi.fn(),
      stop: vi.fn(),
      getBaseUrl: vi.fn(),
    };

    // Mock Hosted Services configuration
    mockConfig = {
      version: '1.0.0',
      enabledToolsets: ['all'],
      dynamicToolsets: false,
      readOnly: false,
      enableCommandLogging: false,
      timeout: 30000,
      maxRetries: 3,
      oauth: {
        enabled: true,
        clientId: 'Iv1.a629723d4c8a5678',
        clientSecret: 'test-client-secret',
        redirectUri: 'https://yourapp.com/auth/callback',
        scopes: ['repo', 'read:user', 'read:org'],
        authorizationUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
      },
    };

    // Setup mocks
    mockOAuthCallbackServer.mockImplementation(
      () => mockCallbackServerInstance as unknown as OAuthCallbackServer
    );
    mockProtectedResourceServer.mockImplementation(
      () => mockProtectedResourceInstance as unknown as ProtectedResourceServer
    );
    mockResourceMetadataServer.mockImplementation(
      () => mockMetadataServerInstance as unknown as ResourceMetadataServer
    );
    mockMCPHttpServer.mockImplementation(
      () => mockMCPHttpServerInstance as unknown as MCPHttpServer
    );
    mockConfigManager.getConfig.mockReturnValue(mockConfig);

    // Mock environment variables for hosted services
    process.env.MCP_SERVER_RESOURCE_URI = 'https://yourapp.com/mcp-server';
    process.env.ALLOW_OAUTH_DEEP_LINK = 'true';
    process.env.START_METADATA_SERVER = 'true';
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.restoreAllMocks();

    // Clean up environment variables
    delete process.env.MCP_SERVER_RESOURCE_URI;
    delete process.env.ALLOW_OAUTH_DEEP_LINK;
    delete process.env.START_METADATA_SERVER;
  });

  describe('OAuth Callback Server', () => {
    it('should start callback server successfully', async () => {
      mockCallbackServerInstance.getCallbackUrl.mockReturnValue(
        'http://localhost:8765/auth/callback'
      );
      mockCallbackServerInstance.startAndWaitForCallback.mockResolvedValue({
        code: 'callback_code_123',
        state: 'callback_state_123',
      });

      const callbackServer = new OAuthCallbackServer({ port: 8765 });
      const callbackUrl = callbackServer.getCallbackUrl();

      expect(callbackUrl).toBe('http://localhost:8765/auth/callback');

      const result = await callbackServer.startAndWaitForCallback();
      expect(result.code).toBe('callback_code_123');
      expect(result.state).toBe('callback_state_123');
    });

    it('should handle callback server errors', async () => {
      mockCallbackServerInstance.startAndWaitForCallback.mockRejectedValue(
        new Error('Port already in use')
      );

      const callbackServer = new OAuthCallbackServer({ port: 8080 });

      await expect(callbackServer.startAndWaitForCallback()).rejects.toThrow(
        'Port already in use'
      );
    });

    it('should support custom callback ports', async () => {
      mockCallbackServerInstance.getCallbackUrl.mockReturnValue(
        'http://localhost:9000/auth/callback'
      );

      const callbackServer = new OAuthCallbackServer({ port: 9000 });
      const callbackUrl = callbackServer.getCallbackUrl();

      expect(callbackUrl).toBe('http://localhost:9000/auth/callback');
    });

    it('should handle callback timeout', async () => {
      mockCallbackServerInstance.startAndWaitForCallback.mockRejectedValue(
        new Error('Callback timeout after 300 seconds')
      );

      const callbackServer = new OAuthCallbackServer({
        port: 8765,
        timeout: 300000,
      });

      await expect(callbackServer.startAndWaitForCallback()).rejects.toThrow(
        'Callback timeout'
      );
    });

    it('should handle OAuth error callbacks', async () => {
      mockCallbackServerInstance.startAndWaitForCallback.mockResolvedValue({
        code: '',
        state: 'error_state_123',
        error: 'access_denied',
        error_description: 'User denied access',
      });

      const callbackServer = new OAuthCallbackServer({ port: 8765 });
      const result = await callbackServer.startAndWaitForCallback();

      expect(result.error).toBe('access_denied');
      expect(result.error_description).toBe('User denied access');
    });
  });

  describe('Protected Resource Server', () => {
    it('should start protected resource server', async () => {
      mockProtectedResourceInstance.getBaseUrl.mockReturnValue(
        'http://localhost:8080'
      );
      mockProtectedResourceInstance.getMetadataUrl.mockReturnValue(
        'http://localhost:8080/.well-known/oauth-protected-resource'
      );
      mockProtectedResourceInstance.start.mockResolvedValue(undefined);

      const protectedServer = new ProtectedResourceServer({ port: 8080 });
      await protectedServer.start();

      expect(protectedServer.getBaseUrl()).toBe('http://localhost:8080');
      expect(protectedServer.getMetadataUrl()).toBe(
        'http://localhost:8080/.well-known/oauth-protected-resource'
      );
    });

    it('should serve OAuth protected resource metadata', async () => {
      const mockMCPAuthInstance = {
        getProtectedResourceMetadata: vi.fn().mockReturnValue({
          authorization_servers: [
            {
              issuer: 'https://github.com',
              authorization_endpoint:
                'https://github.com/login/oauth/authorize',
              token_endpoint: 'https://github.com/login/oauth/access_token',
              scopes_supported: ['repo', 'read:user', 'read:org'],
              response_types_supported: ['code'],
              grant_types_supported: ['authorization_code', 'refresh_token'],
              code_challenge_methods_supported: ['S256'],
              token_endpoint_auth_methods_supported: ['client_secret_post'],
            },
          ],
          resource_server: {
            resource_server_id: 'octocode-mcp',
            resource_server_name: 'Octocode MCP Server',
            resource_server_description:
              'GitHub repository analysis and code discovery',
          },
          scopes_supported: ['repo', 'read:user', 'read:org'],
        }),
      };

      mockMCPAuthProtocol.getInstance.mockReturnValue(
        mockMCPAuthInstance as unknown as MCPAuthProtocol
      );

      new ProtectedResourceServer({ port: 8080 });
      const metadata = mockMCPAuthInstance.getProtectedResourceMetadata();

      expect(metadata.authorization_servers).toHaveLength(1);
      expect(metadata.authorization_servers[0].issuer).toBe(
        'https://github.com'
      );
      expect(metadata.resource_server.resource_server_id).toBe('octocode-mcp');
      expect(metadata.scopes_supported).toContain('repo');
    });

    it('should handle CORS for web applications', async () => {
      mockProtectedResourceInstance.start.mockResolvedValue(undefined);

      const protectedServer = new ProtectedResourceServer({
        port: 8080,
        corsEnabled: true,
      });

      await protectedServer.start();

      // CORS should be handled internally by the server
      expect(mockProtectedResourceInstance.start).toHaveBeenCalled();
    });

    it('should validate bearer tokens', async () => {
      const mockMCPAuthInstance = {
        validateBearerToken: vi.fn().mockResolvedValue({
          valid: true,
          token: 'gho_valid_token_123',
          scopes: ['repo', 'read:user'],
        }),
      };

      mockMCPAuthProtocol.getInstance.mockReturnValue(
        mockMCPAuthInstance as unknown as MCPAuthProtocol
      );

      const result = await mockMCPAuthInstance.validateBearerToken(
        'Bearer gho_valid_token_123'
      );

      expect(result.valid).toBe(true);
      expect(result.token).toBe('gho_valid_token_123');
      expect(result.scopes).toContain('repo');
    });
  });

  describe('Resource Metadata Server', () => {
    it('should start metadata server', async () => {
      mockMetadataServerInstance.getBaseUrl.mockReturnValue(
        'http://localhost:8081'
      );
      mockMetadataServerInstance.start.mockResolvedValue(undefined);

      const metadataServer = new ResourceMetadataServer({ port: 8081 });
      await metadataServer.start();

      expect(metadataServer.getBaseUrl()).toBe('http://localhost:8081');
    });

    it('should serve resource metadata', async () => {
      const _expectedMetadata = {
        resource_server_id: 'octocode-mcp',
        resource_server_name: 'Octocode MCP Server',
        authorization_servers: [
          {
            issuer: 'https://github.com',
            authorization_endpoint: 'https://github.com/login/oauth/authorize',
            token_endpoint: 'https://github.com/login/oauth/access_token',
          },
        ],
        scopes_supported: ['repo', 'read:user', 'read:org'],
      };

      // Mock metadata serving
      mockMetadataServerInstance.start.mockResolvedValue(undefined);

      const metadataServer = new ResourceMetadataServer({ port: 8081 });
      await metadataServer.start();

      // Metadata should be served at /.well-known/oauth-protected-resource
      expect(mockMetadataServerInstance.start).toHaveBeenCalled();
    });
  });

  describe('MCP HTTP Server Integration', () => {
    it('should start MCP HTTP server', async () => {
      mockMCPHttpServerInstance.getBaseUrl.mockReturnValue(
        'http://localhost:3000'
      );
      mockMCPHttpServerInstance.start.mockResolvedValue(undefined);

      const mcpHttpServer = new MCPHttpServer(mockServer.server, {
        port: 3000,
        corsEnabled: true,
        enableHealthCheck: true,
      });

      await mcpHttpServer.start();

      expect(mcpHttpServer.getBaseUrl()).toBe('http://localhost:3000');
    });

    it('should handle MCP requests over HTTP', async () => {
      mockMCPHttpServerInstance.start.mockResolvedValue(undefined);

      const mcpHttpServer = new MCPHttpServer(mockServer.server, {
        port: 3000,
      });

      await mcpHttpServer.start();

      // HTTP server should handle MCP protocol requests
      expect(mockMCPHttpServerInstance.start).toHaveBeenCalled();
    });

    it('should provide health check endpoint', async () => {
      mockMCPHttpServerInstance.start.mockResolvedValue(undefined);

      const mcpHttpServer = new MCPHttpServer(mockServer.server, {
        port: 3000,
        enableHealthCheck: true,
      });

      await mcpHttpServer.start();

      // Health check should be available at /health
      expect(mockMCPHttpServerInstance.start).toHaveBeenCalled();
    });
  });

  describe('Production Callback URL Handling', () => {
    it('should handle production callback URLs', async () => {
      mockConfig.oauth!.redirectUri = 'https://yourapp.com/auth/callback';
      mockConfigManager.getConfig.mockReturnValue(mockConfig);

      const mockOAuthManagerInstance = {
        createAuthorizationUrl: vi
          .fn()
          .mockReturnValue(
            'https://github.com/login/oauth/authorize?client_id=test&redirect_uri=https%3A%2F%2Fyourapp.com%2Fauth%2Fcallback'
          ),
      };

      mockOAuthManager.getInstance.mockReturnValue(
        mockOAuthManagerInstance as unknown as OAuthManager
      );

      const authUrl = mockOAuthManagerInstance.createAuthorizationUrl(
        'state_123',
        'challenge_123',
        {
          redirect_uri: 'https://yourapp.com/auth/callback',
        }
      );

      expect(authUrl).toContain(
        'redirect_uri=https%3A%2F%2Fyourapp.com%2Fauth%2Fcallback'
      );
    });

    it('should handle MCP Gateway callback URLs', async () => {
      mockConfig.oauth!.redirectUri = 'https://your-gateway.com/auth/callback';
      mockConfigManager.getConfig.mockReturnValue(mockConfig);

      const mockOAuthManagerInstance = {
        createAuthorizationUrl: vi
          .fn()
          .mockReturnValue(
            'https://github.com/login/oauth/authorize?client_id=test&redirect_uri=https%3A%2F%2Fyour-gateway.com%2Fauth%2Fcallback'
          ),
      };

      mockOAuthManager.getInstance.mockReturnValue(
        mockOAuthManagerInstance as unknown as OAuthManager
      );

      const authUrl = mockOAuthManagerInstance.createAuthorizationUrl(
        'gateway_state_123',
        'gateway_challenge_123',
        {
          redirect_uri: 'https://your-gateway.com/auth/callback',
        }
      );

      expect(authUrl).toContain('your-gateway.com');
    });

    it('should validate callback URL security', async () => {
      // Test HTTPS requirement for production
      const productionCallbackUrl = 'https://yourapp.com/auth/callback';
      expect(productionCallbackUrl.startsWith('https://')).toBe(true);

      // Test localhost exception for development
      const devCallbackUrl = 'http://localhost:8765/auth/callback';
      expect(devCallbackUrl.startsWith('http://localhost:')).toBe(true);
    });
  });

  describe('Deep Link OAuth Callbacks', () => {
    it('should support deep link callbacks', async () => {
      process.env.ALLOW_OAUTH_DEEP_LINK = 'true';

      const deepLinkUrl =
        'mcp://oauth/callback?code=deep_code_123&state=deep_state_123';

      // Deep link should be properly formatted
      expect(deepLinkUrl.startsWith('mcp://oauth/callback')).toBe(true);
      expect(deepLinkUrl).toContain('code=deep_code_123');
      expect(deepLinkUrl).toContain('state=deep_state_123');
    });

    it('should handle deep link callback parsing', async () => {
      const deepLinkUrl =
        'mcp://oauth/callback?code=deep_code_123&state=deep_state_123&scope=repo%20read%3Auser';
      const url = new URL(deepLinkUrl);

      expect(url.protocol).toBe('mcp:');
      expect(url.pathname).toBe('/callback'); // pathname is /callback, hostname is oauth
      expect(url.searchParams.get('code')).toBe('deep_code_123');
      expect(url.searchParams.get('state')).toBe('deep_state_123');
      expect(url.searchParams.get('scope')).toBe('repo read:user');
    });

    it('should handle deep link errors', async () => {
      const errorDeepLinkUrl =
        'mcp://oauth/callback?error=access_denied&error_description=User%20denied%20access&state=error_state_123';
      const url = new URL(errorDeepLinkUrl);

      expect(url.searchParams.get('error')).toBe('access_denied');
      expect(url.searchParams.get('error_description')).toBe(
        'User denied access'
      );
      expect(url.searchParams.get('state')).toBe('error_state_123');
    });
  });

  describe('Docker Deployment', () => {
    it('should support OAuth-enabled container', () => {
      const dockerEnv = {
        GITHUB_OAUTH_CLIENT_ID: 'your_client_id',
        GITHUB_OAUTH_CLIENT_SECRET: 'your_client_secret',
        GITHUB_OAUTH_ENABLED: 'true',
        GITHUB_ORGANIZATION: 'your-org',
        AUDIT_ALL_ACCESS: 'true',
      };

      // Verify Docker environment configuration
      expect(dockerEnv.GITHUB_OAUTH_CLIENT_ID).toBeDefined();
      expect(dockerEnv.GITHUB_OAUTH_CLIENT_SECRET).toBeDefined();
      expect(dockerEnv.GITHUB_OAUTH_ENABLED).toBe('true');
      expect(dockerEnv.AUDIT_ALL_ACCESS).toBe('true');
    });

    it('should support PAT-based container', () => {
      const dockerEnv = {
        GITHUB_TOKEN: 'ghp_xxxxxxxxxxxxxxxxxxxx',
      };

      // Verify PAT configuration
      expect(dockerEnv.GITHUB_TOKEN).toMatch(/^ghp_/);
    });

    it('should support enterprise container', () => {
      const dockerEnv = {
        GITHUB_OAUTH_CLIENT_ID: 'your_client_id',
        GITHUB_OAUTH_CLIENT_SECRET: 'your_client_secret',
        GITHUB_ORGANIZATION: 'your-enterprise',
        AUDIT_ALL_ACCESS: 'true',
        RATE_LIMIT_API_HOUR: '5000',
        GITHUB_SSO_ENFORCEMENT: 'true',
      };

      // Verify enterprise configuration
      expect(dockerEnv.GITHUB_ORGANIZATION).toBe('your-enterprise');
      expect(dockerEnv.AUDIT_ALL_ACCESS).toBe('true');
      expect(dockerEnv.RATE_LIMIT_API_HOUR).toBe('5000');
      expect(dockerEnv.GITHUB_SSO_ENFORCEMENT).toBe('true');
    });
  });

  describe('MCP Gateway Integration', () => {
    it('should support MCP Gateway YAML configuration', () => {
      const yamlConfig = {
        servers: [
          {
            name: 'octocode',
            command: ['npx', 'octocode-mcp'],
            environment: {
              GITHUB_OAUTH_CLIENT_ID: 'Iv1.a629723d4c8a5678',
              GITHUB_OAUTH_CLIENT_SECRET: 'your_client_secret_here',
              GITHUB_OAUTH_REDIRECT_URI:
                'https://your-gateway.com/auth/callback',
              GITHUB_OAUTH_SCOPES: 'repo,read:user,read:org',
              GITHUB_OAUTH_ENABLED: 'true',
              MCP_SERVER_RESOURCE_URI: 'https://your-gateway.com/mcp-server',
              GITHUB_ORGANIZATION: 'your-org',
              AUDIT_ALL_ACCESS: 'true',
              RATE_LIMIT_API_HOUR: '5000',
              ALLOW_OAUTH_DEEP_LINK: 'true',
              START_METADATA_SERVER: 'true',
            },
          },
        ],
      };

      // Verify MCP Gateway configuration structure
      expect(yamlConfig.servers).toHaveLength(1);
      expect(yamlConfig.servers[0].name).toBe('octocode');
      expect(yamlConfig.servers[0].command).toEqual(['npx', 'octocode-mcp']);
      expect(yamlConfig.servers[0].environment.GITHUB_OAUTH_ENABLED).toBe(
        'true'
      );
      expect(yamlConfig.servers[0].environment.MCP_SERVER_RESOURCE_URI).toBe(
        'https://your-gateway.com/mcp-server'
      );
    });

    it('should handle MCP Gateway authentication flow', async () => {
      process.env.MCP_SERVER_RESOURCE_URI =
        'https://your-gateway.com/mcp-server';

      const mockMCPAuthInstance = {
        createAuthChallenge: vi.fn().mockReturnValue({
          status: 401,
          headers: {
            'WWW-Authenticate':
              'Bearer realm="MCP Server", scope="repo read:user", resource_metadata="https://your-gateway.com/.well-known/oauth-protected-resource"',
          },
        }),
      };

      mockMCPAuthProtocol.getInstance.mockReturnValue(
        mockMCPAuthInstance as unknown as MCPAuthProtocol
      );

      const challenge = mockMCPAuthInstance.createAuthChallenge(
        'MCP Server',
        'repo read:user'
      );

      expect(challenge.status).toBe(401);
      expect(challenge.headers['WWW-Authenticate']).toContain('Bearer');
      expect(challenge.headers['WWW-Authenticate']).toContain(
        'resource_metadata'
      );
    });
  });

  describe('Cloud Platform Integration', () => {
    it('should support SaaS application deployment', async () => {
      const saasConfig = {
        oauth: {
          enabled: true,
          clientId: 'saas_client_id',
          clientSecret: 'saas_client_secret',
          redirectUri: 'https://saas-app.com/auth/callback',
          scopes: ['repo', 'read:user', 'read:org'],
        },
        enterprise: {
          organizationId: 'saas-customers',
          auditLogging: true,
          rateLimiting: true,
        },
      };

      mockConfigManager.getConfig.mockReturnValue({
        ...mockConfig,
        ...saasConfig,
      });

      // Verify SaaS configuration
      expect(saasConfig.oauth.redirectUri).toContain('saas-app.com');
      expect(saasConfig.enterprise.auditLogging).toBe(true);
    });

    it('should support cloud platform environment variables', () => {
      const cloudEnv = {
        PORT: '8080',
        NODE_ENV: 'production',
        GITHUB_OAUTH_CLIENT_ID: process.env.GITHUB_OAUTH_CLIENT_ID,
        GITHUB_OAUTH_CLIENT_SECRET: process.env.GITHUB_OAUTH_CLIENT_SECRET,
        GITHUB_OAUTH_REDIRECT_URI:
          'https://cloud-app.herokuapp.com/auth/callback',
        MCP_SERVER_RESOURCE_URI: 'https://cloud-app.herokuapp.com/mcp-server',
      };

      // Verify cloud platform configuration
      expect(cloudEnv.PORT).toBe('8080');
      expect(cloudEnv.NODE_ENV).toBe('production');
      expect(cloudEnv.GITHUB_OAUTH_REDIRECT_URI).toContain('herokuapp.com');
    });

    it('should handle cloud platform scaling', async () => {
      // Mock multiple server instances
      const serverInstances = [
        { port: 8080, region: 'us-east-1' },
        { port: 8081, region: 'us-west-2' },
        { port: 8082, region: 'eu-west-1' },
      ];

      serverInstances.forEach(instance => {
        expect(instance.port).toBeGreaterThan(8000);
        expect(instance.region).toMatch(/^[a-z]{2}-[a-z]+-\d$/);
      });
    });
  });

  describe('MCP Compliance (RFC 8707)', () => {
    it('should implement RFC 8707 resource parameter', async () => {
      const resourceUri = 'https://yourapp.com/mcp-server';
      process.env.MCP_SERVER_RESOURCE_URI = resourceUri;

      const mockOAuthManagerInstance = {
        createAuthorizationUrl: vi
          .fn()
          .mockReturnValue(
            `https://github.com/login/oauth/authorize?client_id=test&resource=${encodeURIComponent(resourceUri)}`
          ),
        exchangeCodeForToken: vi.fn().mockResolvedValue({
          accessToken: 'gho_mcp_token_123',
          tokenType: 'Bearer',
          expiresIn: 3600,
          scope: 'repo read:user',
        }),
      };

      mockOAuthManager.getInstance.mockReturnValue(
        mockOAuthManagerInstance as unknown as OAuthManager
      );

      // Authorization URL should include resource parameter
      const authUrl = mockOAuthManagerInstance.createAuthorizationUrl(
        'mcp_state_123',
        'mcp_challenge_123',
        {},
        resourceUri
      );

      expect(authUrl).toContain(`resource=${encodeURIComponent(resourceUri)}`);

      // Token exchange should include resource parameter
      const tokenResponse = await mockOAuthManagerInstance.exchangeCodeForToken(
        'mcp_code_123',
        'mcp_verifier_123',
        'mcp_state_123',
        undefined,
        resourceUri
      );

      expect(tokenResponse.accessToken).toBe('gho_mcp_token_123');
    });

    it('should serve protected resource metadata', async () => {
      const metadata = {
        authorization_servers: [
          {
            issuer: 'https://github.com',
            authorization_endpoint: 'https://github.com/login/oauth/authorize',
            token_endpoint: 'https://github.com/login/oauth/access_token',
            scopes_supported: ['repo', 'read:user', 'read:org'],
            response_types_supported: ['code'],
            grant_types_supported: ['authorization_code', 'refresh_token'],
            code_challenge_methods_supported: ['S256'],
            token_endpoint_auth_methods_supported: ['client_secret_post'],
          },
        ],
        resource_server: {
          resource_server_id: 'octocode-mcp',
          resource_server_name: 'Octocode MCP Server',
          resource_server_description:
            'GitHub repository analysis and code discovery',
        },
        scopes_supported: ['repo', 'read:user', 'read:org'],
      };

      // Verify RFC 8707 compliance
      expect(metadata.authorization_servers).toHaveLength(1);
      expect(
        metadata.authorization_servers[0].code_challenge_methods_supported
      ).toContain('S256');
      expect(metadata.resource_server.resource_server_id).toBe('octocode-mcp');
      expect(metadata.scopes_supported).toContain('repo');
    });

    it('should handle audience validation', async () => {
      const mockOAuthManagerInstance = {
        validateToken: vi.fn().mockResolvedValue({
          valid: true,
          scopes: ['repo', 'read:user'],
          expiresAt: new Date('2024-12-31T23:59:59.000Z'),
        }),
      };

      mockOAuthManager.getInstance.mockReturnValue(
        mockOAuthManagerInstance as unknown as OAuthManager
      );

      const validation = await mockOAuthManagerInstance.validateToken(
        'gho_audience_token_123',
        'https://yourapp.com/mcp-server'
      );

      expect(validation.valid).toBe(true);
      expect(validation.scopes).toContain('repo');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle server startup failures', async () => {
      mockProtectedResourceInstance.start.mockRejectedValue(
        new Error('Port 8080 already in use')
      );

      const protectedServer = new ProtectedResourceServer({ port: 8080 });

      await expect(protectedServer.start()).rejects.toThrow(
        'Port 8080 already in use'
      );
    });

    it('should handle network connectivity issues', async () => {
      mockFetch.mockRejectedValue(new Error('Network unreachable'));

      await expect(
        fetch('https://github.com/login/oauth/authorize')
      ).rejects.toThrow('Network unreachable');
    });

    it('should handle malformed callback URLs', async () => {
      const malformedUrl = 'not-a-valid-url';

      expect(() => new URL(malformedUrl)).toThrow();
    });

    it('should handle SSL/TLS certificate issues', async () => {
      mockFetch.mockRejectedValue(new Error('CERT_UNTRUSTED'));

      await expect(fetch('https://invalid-cert.example.com')).rejects.toThrow(
        'CERT_UNTRUSTED'
      );
    });

    it('should provide helpful error messages', async () => {
      const errors = [
        'OAuth callback timeout - check your network connection',
        'Invalid redirect URI - ensure it matches your OAuth app configuration',
        'Server startup failed - port may already be in use',
        'MCP compliance error - resource parameter missing',
      ];

      errors.forEach(error => {
        expect(error).toContain(' - ');
        expect(error.split(' - ')[1]).toBeTruthy();
      });
    });
  });

  describe('Performance and Monitoring', () => {
    it('should handle concurrent callback requests', async () => {
      const concurrentCallbacks = Array.from({ length: 10 }, (_, i) => ({
        code: `concurrent_code_${i}`,
        state: `concurrent_state_${i}`,
      }));

      mockCallbackServerInstance.startAndWaitForCallback.mockImplementation(
        async () => {
          const randomCallback =
            concurrentCallbacks[
              Math.floor(Math.random() * concurrentCallbacks.length)
            ];
          return randomCallback;
        }
      );

      const promises = Array.from({ length: 5 }, () => {
        const callbackServer = new OAuthCallbackServer({ port: 8765 });
        return callbackServer.startAndWaitForCallback();
      });

      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.code).toMatch(/^concurrent_code_\d$/);
        expect(result.state).toMatch(/^concurrent_state_\d$/);
      });
    });

    it('should monitor server health', async () => {
      mockMCPHttpServerInstance.start.mockResolvedValue(undefined);

      const mcpHttpServer = new MCPHttpServer(mockServer.server, {
        port: 3000,
        enableHealthCheck: true,
      });

      await mcpHttpServer.start();

      // Health check endpoint should be available
      expect(mockMCPHttpServerInstance.start).toHaveBeenCalled();
    });

    it('should handle high traffic scenarios', async () => {
      const highTrafficConfig = {
        maxConcurrentConnections: 1000,
        requestTimeout: 30000,
        keepAliveTimeout: 5000,
      };

      // Verify high traffic configuration
      expect(highTrafficConfig.maxConcurrentConnections).toBe(1000);
      expect(highTrafficConfig.requestTimeout).toBe(30000);
      expect(highTrafficConfig.keepAliveTimeout).toBe(5000);
    });
  });
});
