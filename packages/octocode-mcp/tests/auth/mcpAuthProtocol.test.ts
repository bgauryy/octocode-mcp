import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCPAuthProtocol } from '../../src/auth/mcpAuthProtocol.js';
import { OAuthManager } from '../../src/auth/oauthManager.js';
import {
  ConfigManager,
  type ServerConfig,
} from '../../src/config/serverConfig.js';

// Mock dependencies
vi.mock('../../src/config/serverConfig.js', () => ({
  ConfigManager: {
    getConfig: vi.fn(),
  },
}));

vi.mock('../../src/auth/oauthManager.js', () => ({
  OAuthManager: {
    getInstance: vi.fn(),
  },
}));

const mockConfigManager = vi.mocked(ConfigManager);
const mockOAuthManager = {
  initialize: vi.fn(),
  validateToken: vi.fn(),
};
const mockOAuthManagerStatic = vi.mocked(OAuthManager);

describe('MCPAuthProtocol', () => {
  let protocol: MCPAuthProtocol;
  let mockConfig: ServerConfig;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Default config
    mockConfig = {
      version: '1.0.0',
      githubHost: undefined,
      enabledToolsets: ['all'],
      dynamicToolsets: false,
      readOnly: false,
      enableCommandLogging: false,
      timeout: 30000,
      maxRetries: 3,
      oauth: {
        enabled: true,
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        redirectUri: 'http://localhost:8080/callback',
        scopes: ['repo', 'read:user', 'read:org'],
        authorizationUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
      },
      githubApp: {
        appId: '',
        privateKey: '',
        enabled: false,
      },
    };

    mockConfigManager.getConfig.mockReturnValue(mockConfig);
    mockOAuthManagerStatic.getInstance.mockReturnValue(
      mockOAuthManager as unknown as ReturnType<typeof OAuthManager.getInstance>
    );

    protocol = MCPAuthProtocol.getInstance();
    await protocol.initialize();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateBearerToken', () => {
    it('should extract Bearer token correctly', async () => {
      const authHeader = 'Bearer test-token-123';

      mockOAuthManager.validateToken.mockResolvedValue({
        valid: true,
        scopes: ['repo', 'read:user'],
        error: undefined,
      });

      const result = await protocol.validateBearerToken(authHeader);

      expect(result.valid).toBe(true);
      expect(result.token).toBe('test-token-123');
      expect(result.scopes).toEqual(['repo', 'read:user']);
      expect(mockOAuthManager.validateToken).toHaveBeenCalledWith(
        'test-token-123'
      );
    });

    it('should handle invalid authorization header format', async () => {
      const authHeader = 'Invalid format';

      const result = await protocol.validateBearerToken(authHeader);

      expect(result.valid).toBe(false);
      expect(result.error).toBe(
        'Invalid authorization header format. Expected: Bearer <token>'
      );
      expect(mockOAuthManager.validateToken).not.toHaveBeenCalled();
    });

    it('should delegate to OAuthManager when available', async () => {
      const authHeader = 'Bearer oauth-token';

      mockOAuthManager.validateToken.mockResolvedValue({
        valid: false,
        scopes: [],
        error: 'Token expired',
      });

      const result = await protocol.validateBearerToken(authHeader);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token expired');
      expect(result.scopes).toEqual([]);
      expect(mockOAuthManager.validateToken).toHaveBeenCalledWith(
        'oauth-token'
      );
    });

    it('should handle network errors gracefully', async () => {
      const authHeader = 'Bearer network-error-token';

      mockOAuthManager.validateToken.mockRejectedValue(
        new Error('Network error')
      );

      const result = await protocol.validateBearerToken(authHeader);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should handle case-insensitive Bearer prefix', async () => {
      const authHeader = 'bearer lowercase-token';

      mockOAuthManager.validateToken.mockResolvedValue({
        valid: true,
        scopes: ['repo'],
        error: undefined,
      });

      const result = await protocol.validateBearerToken(authHeader);

      expect(result.valid).toBe(true);
      expect(result.token).toBe('lowercase-token');
      expect(mockOAuthManager.validateToken).toHaveBeenCalledWith(
        'lowercase-token'
      );
    });
  });

  describe('getProtectedResourceMetadata', () => {
    it('should return metadata with OAuth authorization server', () => {
      const metadata = protocol.getProtectedResourceMetadata();

      expect(metadata.authorization_servers).toHaveLength(1);
      expect(metadata.authorization_servers[0]).toEqual({
        issuer: 'https://github.com',
        authorization_endpoint: 'https://github.com/login/oauth/authorize',
        token_endpoint: 'https://github.com/login/oauth/access_token',
        scopes_supported: ['repo', 'read:user', 'read:org'],
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['client_secret_post'],
        revocation_endpoint: 'https://github.com/login/oauth/revoke',
      });
    });

    it('should include GitHub App authorization server when configured', () => {
      mockConfig.githubApp = {
        enabled: true,
        appId: 'test-app-id',
        privateKey: 'test-private-key',
        installationId: 12345,
      };

      const metadata = protocol.getProtectedResourceMetadata();

      expect(metadata.authorization_servers).toHaveLength(2);
      expect(metadata.authorization_servers[1]).toEqual({
        issuer: 'https://github.com',
        authorization_endpoint: 'https://github.com/login/oauth/authorize',
        token_endpoint:
          'https://api.github.com/app/installations/12345/access_tokens',
        scopes_supported: ['repo', 'read:user', 'read:org'],
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['private_key_jwt'],
      });
    });

    it('should handle GitHub Enterprise Server configuration', () => {
      const enterpriseConfig = {
        ...mockConfig,
        githubHost: 'https://github.example.com',
        oauth: {
          enabled: mockConfig.oauth!.enabled,
          clientId: mockConfig.oauth!.clientId,
          clientSecret: mockConfig.oauth!.clientSecret,
          redirectUri: mockConfig.oauth!.redirectUri,
          scopes: mockConfig.oauth!.scopes,
          // authorizationUrl and tokenUrl omitted to force fallback to constructed URLs
        },
      };
      mockConfigManager.getConfig.mockReturnValue(enterpriseConfig);

      const metadata = protocol.getProtectedResourceMetadata();

      expect(metadata.authorization_servers).toBeDefined();
      expect(metadata.authorization_servers!.length).toBeGreaterThan(0);
      expect(metadata.authorization_servers![0]!.issuer).toBe(
        'https://github.example.com'
      );
      expect(metadata.authorization_servers![0]!.authorization_endpoint).toBe(
        'https://github.example.com/login/oauth/authorize'
      );
      expect(metadata.authorization_servers![0]!.token_endpoint).toBe(
        'https://github.example.com/login/oauth/access_token'
      );
    });

    it('should return resource server information', () => {
      const metadata = protocol.getProtectedResourceMetadata();

      expect(metadata.resource_server).toEqual({
        resource_server_id: 'github-api',
        resource_server_name: 'GitHub API',
        resource_server_icon: 'https://github.com/favicon.ico',
        resource_server_description:
          'GitHub API access for repository and organization management',
      });
    });

    it('should return supported scopes', () => {
      const metadata = protocol.getProtectedResourceMetadata();

      expect(metadata.scopes_supported).toContain('repo');
      expect(metadata.scopes_supported).toContain('read:user');
      expect(metadata.scopes_supported).toContain('read:org');
      expect(metadata.scopes_supported).toContain('write:org');
      expect(metadata.scopes_supported).toContain('admin:org');
    });
  });

  describe('createAuthChallenge', () => {
    it('should create proper WWW-Authenticate challenge', () => {
      const challenge = protocol.createAuthChallenge(
        'github-api',
        'repo read:user',
        'invalid_token',
        'Token validation failed'
      );

      expect(challenge.status).toBe(401);
      expect(challenge.headers['WWW-Authenticate']).toBe(
        'Bearer, realm="github-api", scope="repo read:user", error="invalid_token", error_description="Token validation failed", resource_metadata="https://github.com/.well-known/mcp-resource-metadata"'
      );
      expect(challenge.body).toEqual({
        error: 'invalid_token',
        error_description: 'Token validation failed',
        resource_metadata:
          'https://github.com/.well-known/mcp-resource-metadata',
      });
    });

    it('should create minimal challenge without optional parameters', () => {
      const challenge = protocol.createAuthChallenge();

      expect(challenge.status).toBe(401);
      expect(challenge.headers['WWW-Authenticate']).toBe(
        'Bearer, resource_metadata="https://github.com/.well-known/mcp-resource-metadata"'
      );
      expect(challenge.body).toEqual({
        error: 'unauthorized',
        error_description:
          'Valid GitHub access token required in Authorization header',
        resource_metadata:
          'https://github.com/.well-known/mcp-resource-metadata',
      });
    });

    it('should handle GitHub Enterprise Server in resource metadata URL', () => {
      const enterpriseConfig = {
        ...mockConfig,
        githubHost: 'https://github.example.com',
      };
      mockConfigManager.getConfig.mockReturnValue(enterpriseConfig);

      const challenge = protocol.createAuthChallenge();

      expect(
        (challenge.body as { resource_metadata: string }).resource_metadata
      ).toBe('https://github.example.com/.well-known/mcp-resource-metadata');
    });
  });

  describe('handleAuthenticatedRequest', () => {
    it('should handle missing authorization header', async () => {
      const request = {
        method: 'GET',
        url: '/api/test',
        headers: {},
      };

      const response = await protocol.handleAuthenticatedRequest(request);

      expect(response.status).toBe(401);
      expect(response.headers['WWW-Authenticate']).toContain('Bearer');
      expect((response.body as { error: string }).error).toBe('missing_token');
    });

    it('should handle valid token', async () => {
      mockOAuthManager.validateToken.mockResolvedValue({
        valid: true,
        scopes: ['repo', 'read:user'],
        error: undefined,
      });

      const request = {
        method: 'GET',
        url: '/api/test',
        headers: {
          Authorization: 'Bearer valid-token',
        },
      };

      const response = await protocol.handleAuthenticatedRequest(request);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        authenticated: true,
        token: 'valid-token',
        scopes: ['repo', 'read:user'],
      });
    });

    it('should handle invalid token', async () => {
      mockOAuthManager.validateToken.mockResolvedValue({
        valid: false,
        scopes: [],
        error: 'Token expired',
      });

      const request = {
        method: 'GET',
        url: '/api/test',
        headers: {
          Authorization: 'Bearer invalid-token',
        },
      };

      const response = await protocol.handleAuthenticatedRequest(request);

      expect(response.status).toBe(401);
      expect(response.headers['WWW-Authenticate']).toContain('Bearer');
      expect(
        (response.body as { error: string; error_description: string }).error
      ).toBe('invalid_token');
      expect(
        (response.body as { error: string; error_description: string })
          .error_description
      ).toBe('Token expired');
    });
  });

  describe('initialization', () => {
    it('should acquire OAuth manager when enabled (init centralized elsewhere)', async () => {
      await protocol.initialize();

      expect(mockOAuthManagerStatic.getInstance).toHaveBeenCalled();
      // initialization is centralized; protocol should not call initialize()
      expect(mockOAuthManager.initialize).not.toHaveBeenCalled();
    });

    it('should not initialize OAuth manager when disabled', async () => {
      // Clear mocks for this specific test
      vi.clearAllMocks();

      const disabledConfig: ServerConfig = {
        ...mockConfig,
        oauth: {
          ...mockConfig.oauth!,
          enabled: false,
        },
      };
      mockConfigManager.getConfig.mockReturnValue(disabledConfig);
      mockOAuthManagerStatic.getInstance.mockReturnValue(
        mockOAuthManager as unknown as ReturnType<
          typeof OAuthManager.getInstance
        >
      );

      await protocol.initialize();

      // OAuth manager should not be initialized
      expect(mockOAuthManager.initialize).not.toHaveBeenCalled();
    });

    it('should be singleton', () => {
      const instance1 = MCPAuthProtocol.getInstance();
      const instance2 = MCPAuthProtocol.getInstance();

      expect(instance1).toBe(instance2);
    });
  });
});
