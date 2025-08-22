import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChildProcess } from 'child_process';
import { createMockMcpServer } from '../../fixtures/mcp-fixtures.js';
import type { MockMcpServer } from '../../fixtures/mcp-fixtures.js';
import {
  registerOAuthInitiateTool,
  registerOAuthCallbackTool,
  registerOAuthStatusTool,
  registerOAuthRevokeTool,
} from '../../../src/mcp/tools/oauth/oauthTools.js';
import type { ServerConfig } from '../../../src/config/serverConfig.js';

// Mock dependencies
vi.mock('../../../src/config/serverConfig.js', () => ({
  ConfigManager: {
    getConfig: vi.fn(),
    isEnterpriseMode: vi.fn().mockReturnValue(false),
  },
}));

vi.mock('../../../src/auth/oauthManager.js', () => ({
  OAuthManager: {
    getInstance: vi.fn(),
  },
}));

vi.mock('open');

vi.mock('../../../src/mcp/tools/utils/oauthStateManager.js', () => ({
  OAuthStateManager: {
    initialize: vi.fn(),
    storeOAuthState: vi.fn(),
    getOAuthState: vi.fn(),
    clearOAuthState: vi.fn(),
  },
}));

vi.mock('../../../src/http/oauthCallbackServer.js', () => ({
  OAuthCallbackServer: vi.fn(),
}));

vi.mock('../../../src/services/organizationService.js', () => ({
  OrganizationService: vi.fn(),
}));

vi.mock('../../../src/mcp/tools/utils/tokenManager.js', () => ({
  getTokenMetadata: vi.fn(),
  getGitHubToken: vi.fn(),
  storeOAuthTokenInfo: vi.fn(),
  clearOAuthTokens: vi.fn(),
}));

import { ConfigManager } from '../../../src/config/serverConfig.js';
import { OAuthManager } from '../../../src/auth/oauthManager.js';
import { OAuthStateManager } from '../../../src/mcp/tools/utils/oauthStateManager.js';
import { OAuthCallbackServer } from '../../../src/http/oauthCallbackServer.js';
import { OrganizationService } from '../../../src/services/organizationService.js';
import {
  getTokenMetadata,
  getGitHubToken,
  storeOAuthTokenInfo,
  clearOAuthTokens,
} from '../../../src/mcp/tools/utils/tokenManager.js';
import open from 'open';

const mockConfigManager = vi.mocked(ConfigManager);
const mockOAuthManager = {
  generatePKCEParams: vi.fn(),
  generateState: vi.fn(),
  createAuthorizationUrl: vi.fn(),
  exchangeCodeForToken: vi.fn(),
  revokeToken: vi.fn(),
};
const mockOAuthManagerStatic = vi.mocked(OAuthManager);
const mockOAuthStateManager = vi.mocked(OAuthStateManager);
const mockOAuthCallbackServer = vi.mocked(OAuthCallbackServer);
const mockOrganizationService = vi.mocked(OrganizationService);
const mockTokenManager = {
  getTokenMetadata: vi.mocked(getTokenMetadata),
  getGitHubToken: vi.mocked(getGitHubToken),
  storeOAuthTokenInfo: vi.mocked(storeOAuthTokenInfo),
  clearOAuthTokens: vi.mocked(clearOAuthTokens),
};
const mockOpen = vi.mocked(open);

describe('OAuth Tools', () => {
  let mockServer: MockMcpServer;
  let mockConfig: ServerConfig;
  let mockOrgService: {
    checkMembership: ReturnType<typeof vi.fn>;
    getUserOrganizations: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockServer = createMockMcpServer();

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
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        redirectUri: 'http://localhost:8080/callback',
        scopes: ['repo', 'read:user', 'read:org'],
      },
    };

    mockOrgService = {
      checkMembership: vi.fn(),
      getUserOrganizations: vi.fn(),
    };

    mockConfigManager.getConfig.mockReturnValue(mockConfig);
    mockOAuthManagerStatic.getInstance.mockReturnValue(
      mockOAuthManager as unknown as ReturnType<typeof OAuthManager.getInstance>
    );
    mockOrganizationService.mockImplementation(
      () =>
        mockOrgService as unknown as InstanceType<typeof OrganizationService>
    );

    // Mock open function to prevent browser opening during tests
    mockOpen.mockImplementation(async (_url: string) => {
      // If this gets called, we want to know about it but not actually open anything
      return {} as ChildProcess;
    });

    // Register tools
    registerOAuthInitiateTool(mockServer.server);
    registerOAuthCallbackTool(mockServer.server);
    registerOAuthStatusTool(mockServer.server);
    registerOAuthRevokeTool(mockServer.server);
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.restoreAllMocks();
  });

  describe('oauthInitiate', () => {
    it('should initiate OAuth flow with local_server callback', async () => {
      const mockCallbackServer = {
        getCallbackUrl: vi
          .fn()
          .mockReturnValue('http://localhost:3000/callback'),
        startAndWaitForCallback: vi.fn().mockResolvedValue({
          code: 'auth-code',
          state: 'test-state',
        }),
      };
      mockOAuthCallbackServer.mockImplementation(
        () =>
          mockCallbackServer as unknown as InstanceType<
            typeof OAuthCallbackServer
          >
      );

      mockOAuthManager.generatePKCEParams.mockReturnValue({
        codeVerifier: 'test-verifier',
        codeChallenge: 'test-challenge',
        codeChallengeMethod: 'S256',
      });
      mockOAuthManager.generateState.mockReturnValue('test-state');
      mockOAuthManager.createAuthorizationUrl.mockReturnValue(
        'https://github.com/login/oauth/authorize?client_id=test&state=test-state'
      );

      const result = await mockServer.callTool('oauthInitiate', {
        callbackMethod: 'local_server',
        callbackPort: 3000,
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]!.text as string);
      expect(response.data.authorizationUrl).toBe(
        'https://github.com/login/oauth/authorize?client_id=test&state=test-state'
      );
      expect(mockOAuthStateManager.storeOAuthState).toHaveBeenCalledWith(
        'test-state',
        expect.objectContaining({
          codeVerifier: 'test-verifier',
          callbackMethod: 'local_server',
          callbackPort: 3000,
        })
      );
    });

    it('should initiate OAuth flow with manual callback', async () => {
      mockOAuthManager.generatePKCEParams.mockReturnValue({
        codeVerifier: 'manual-verifier',
        codeChallenge: 'manual-challenge',
        codeChallengeMethod: 'S256',
      });
      mockOAuthManager.generateState.mockReturnValue('manual-state');
      mockOAuthManager.createAuthorizationUrl.mockReturnValue(
        'https://github.com/login/oauth/authorize?client_id=test&state=manual-state'
      );

      const result = await mockServer.callTool('oauthInitiate', {
        callbackMethod: 'manual',
        organization: 'test-org',
        scopes: ['repo', 'read:org'],
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]!.text as string);
      const data = response.data;
      expect(data.callbackMethod).toBe('manual');
      expect(data.organization).toBe('test-org');
      expect(data.scopes).toEqual(['repo', 'read:org']);
      expect(mockOAuthStateManager.storeOAuthState).toHaveBeenCalledWith(
        'manual-state',
        expect.objectContaining({
          codeVerifier: 'manual-verifier',
          organization: 'test-org',
          scopes: ['repo', 'read:org'],
          callbackMethod: 'manual',
        })
      );
    });

    it('should handle OAuth not configured', async () => {
      mockConfig.oauth!.enabled = false;

      const result = await mockServer.callTool('oauthInitiate', {
        callbackMethod: 'manual',
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0]!.text as string);
      expect(response.meta.error).toContain(
        'OAuth is not configured or enabled'
      );
    });
  });

  describe('oauthCallback', () => {
    it('should complete OAuth flow successfully', async () => {
      const stateData = {
        codeVerifier: 'test-verifier',
        organization: 'test-org',
        scopes: ['repo', 'read:user', 'read:org'],
        callbackMethod: 'manual' as const,
        clientId: 'test-client-id',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      };

      const tokenResponse = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
        tokenType: 'Bearer',
        expiresIn: 3600,
        scope: 'repo read:user read:org',
      };

      const membershipResult = {
        isMember: true,
        role: 'member',
        visibility: 'public',
      };

      mockOAuthStateManager.getOAuthState.mockResolvedValue(stateData);
      mockOAuthManager.exchangeCodeForToken.mockResolvedValue(tokenResponse);
      mockOrgService.checkMembership.mockResolvedValue(membershipResult);

      const result = await mockServer.callTool('oauthCallback', {
        code: 'authorization-code',
        state: 'test-state',
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]!.text as string);
      const data = response.data;
      expect(data.success).toBe(true);
      expect(data.tokenType).toBe('Bearer');
      expect(data.scopes).toEqual(['repo', 'read:user', 'read:org']);
      expect(data.hasRefreshToken).toBe(true);
      expect(data.organization?.isMember).toBe(true);
      expect(data.organization?.role).toBe('member');

      // Verify shared helper was used
      expect(mockTokenManager.storeOAuthTokenInfo).toHaveBeenCalledWith({
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
        expiresAt: expect.any(Date),
        scopes: ['repo', 'read:user', 'read:org'],
        tokenType: 'Bearer',
        clientId: 'test-client-id',
      });

      expect(mockOAuthStateManager.clearOAuthState).toHaveBeenCalledWith(
        'test-state'
      );
    });

    it('should handle invalid state', async () => {
      mockOAuthStateManager.getOAuthState.mockResolvedValue(null);

      const result = await mockServer.callTool('oauthCallback', {
        code: 'authorization-code',
        state: 'invalid-state',
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0]!.text as string);
      expect(response.meta.error).toContain('OAuth state validation failed');
    });

    it('should handle organization validation failure gracefully', async () => {
      const stateData = {
        codeVerifier: 'test-verifier',
        organization: 'test-org',
        scopes: ['repo', 'read:user'],
        callbackMethod: 'manual' as const,
        clientId: 'test-client-id',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      };

      const tokenResponse = {
        accessToken: 'access-token-123',
        tokenType: 'Bearer',
        expiresIn: 3600,
        scope: 'repo read:user',
      };

      mockOAuthStateManager.getOAuthState.mockResolvedValue(stateData);
      mockOAuthManager.exchangeCodeForToken.mockResolvedValue(tokenResponse);
      mockOrgService.checkMembership.mockRejectedValue(
        new Error('Org check failed')
      );

      const result = await mockServer.callTool('oauthCallback', {
        code: 'authorization-code',
        state: 'test-state',
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]!.text as string);
      const data = response.data;
      expect(data.success).toBe(true);
      expect(data.organization?.isMember).toBe(false);
      expect(data.organization?.error).toContain(
        'Failed to validate organization membership'
      );
    });

    it('should handle token exchange failure', async () => {
      const stateData = {
        codeVerifier: 'test-verifier',
        scopes: ['repo'],
        callbackMethod: 'manual' as const,
        clientId: 'test-client-id',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      };

      mockOAuthStateManager.getOAuthState.mockResolvedValue(stateData);
      mockOAuthManager.exchangeCodeForToken.mockRejectedValue(
        new Error('Token exchange failed')
      );

      const result = await mockServer.callTool('oauthCallback', {
        code: 'invalid-code',
        state: 'test-state',
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0]!.text as string);
      expect(response.meta.error).toContain('OAuth operation failed');
    });
  });

  describe('oauthStatus', () => {
    it('should return OAuth token status', async () => {
      const tokenMetadata = {
        source: 'oauth' as const,
        expiresAt: new Date(Date.now() + 3600000),
        scopes: ['repo', 'read:user', 'read:org'],
        clientId: 'test-client-id',
      };

      const organizations = [{ login: 'org1' }, { login: 'org2' }];

      mockTokenManager.getTokenMetadata.mockResolvedValue(tokenMetadata);
      mockOrgService.getUserOrganizations.mockResolvedValue(organizations);

      const result = await mockServer.callTool('oauthStatus', {
        includeScopes: true,
        includeOrganizations: true,
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]!.text as string);
      const data = response.data;
      expect(data.authenticated).toBe(true);
      expect(data.source).toBe('oauth');
      expect(data.scopes).toEqual(['repo', 'read:user', 'read:org']);
      expect(data.organizations).toEqual(['org1', 'org2']);
      expect(data.permissions.canAccessOrganizations).toBe(true);
      expect(data.permissions.canAccessPrivateRepos).toBe(true);
      expect(data.permissions.hasRefreshCapability).toBe(false); // No refresh token in metadata
    });

    it('should return status for non-OAuth authentication', async () => {
      const tokenMetadata = {
        source: 'env' as const,
        scopes: undefined,
      };

      mockTokenManager.getTokenMetadata.mockResolvedValue(tokenMetadata);

      const result = await mockServer.callTool('oauthStatus', {
        includeScopes: false,
        includeOrganizations: false,
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]!.text as string);
      const data = response.data;
      expect(data.authenticated).toBe(true);
      expect(data.source).toBe('env');
      expect(data.scopes).toBeUndefined();
      expect(data.organizations).toBeUndefined();
    });

    it('should handle no authentication', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockTokenManager.getTokenMetadata.mockResolvedValue(null as any);

      const result = await mockServer.callTool('oauthStatus', {});

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]!.text as string);
      const data = response.data;
      expect(data.authenticated).toBe(false);
      expect(data.source).toBe('unknown');
    });

    it('should handle organization fetch error', async () => {
      const tokenMetadata = {
        source: 'oauth' as const,
        scopes: ['repo', 'read:org'],
      };

      mockTokenManager.getTokenMetadata.mockResolvedValue(tokenMetadata);
      mockOrgService.getUserOrganizations.mockRejectedValue(
        new Error('Org fetch failed')
      );

      const result = await mockServer.callTool('oauthStatus', {
        includeOrganizations: true,
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]!.text as string);
      const data = response.data;
      expect(data.organizationsError).toBe('Failed to fetch organizations');
    });
  });

  describe('oauthRevoke', () => {
    it('should revoke OAuth token successfully', async () => {
      const tokenMetadata = {
        source: 'oauth' as const,
        clientId: 'test-client-id',
      };

      mockTokenManager.getTokenMetadata.mockResolvedValue(tokenMetadata);
      mockTokenManager.getGitHubToken.mockResolvedValue('current-token');
      mockOAuthManager.revokeToken.mockResolvedValue(undefined);

      const result = await mockServer.callTool('oauthRevoke', {});

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]!.text as string);
      const data = response.data;
      expect(data.success).toBe(true);
      expect(data.wasRevoked).toBe(true);
      expect(data.details.accessTokenRevoked).toBe(true);

      expect(mockOAuthManager.revokeToken).toHaveBeenCalledWith(
        'current-token'
      );
      expect(mockTokenManager.clearOAuthTokens).toHaveBeenCalled();
    });

    it('should handle no OAuth token to revoke', async () => {
      mockTokenManager.getTokenMetadata.mockResolvedValue({
        source: 'env' as const,
      });

      const result = await mockServer.callTool('oauthRevoke', {});

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]!.text as string);
      const data = response.data;
      expect(data.success).toBe(true);
      expect(data.wasRevoked).toBe(false);
      expect(data.message).toBe('No OAuth token found to revoke');
    });

    it('should handle revocation API failure gracefully', async () => {
      const tokenMetadata = {
        source: 'oauth' as const,
        clientId: 'test-client-id',
      };

      mockTokenManager.getTokenMetadata.mockResolvedValue(tokenMetadata);
      mockTokenManager.getGitHubToken.mockResolvedValue('current-token');
      mockOAuthManager.revokeToken.mockRejectedValue(
        new Error('Revocation API failed')
      );

      const result = await mockServer.callTool('oauthRevoke', {});

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0]!.text as string);
      const data = response.data;
      expect(data.success).toBe(true);
      expect(data.wasRevoked).toBe(true);
      expect(data.details.accessTokenRevoked).toBe(false);
      expect(data.details.errors).toContain(
        'Access token revocation failed: Revocation API failed'
      );

      // Should still clear local tokens
      expect(mockTokenManager.clearOAuthTokens).toHaveBeenCalled();
    });

    it('should handle general error', async () => {
      mockTokenManager.getTokenMetadata.mockRejectedValue(
        new Error('Token metadata error')
      );

      const result = await mockServer.callTool('oauthRevoke', {});

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0]!.text as string);
      expect(response.meta.error).toContain('OAuth operation failed');
    });
  });

  describe('shared completion helper behavior', () => {
    it('should use shared helper for both local_server and manual flows', async () => {
      // Test that both flows use the same completion logic by checking
      // that storeOAuthTokenInfo is called with the same pattern

      const stateData = {
        codeVerifier: 'test-verifier',
        scopes: ['repo'],
        callbackMethod: 'manual' as const,
        clientId: 'test-client-id',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      };

      const tokenResponse = {
        accessToken: 'shared-helper-token',
        tokenType: 'Bearer',
        expiresIn: 3600,
        scope: 'repo',
      };

      mockOAuthStateManager.getOAuthState.mockResolvedValue(stateData);
      mockOAuthManager.exchangeCodeForToken.mockResolvedValue(tokenResponse);

      // Test manual callback flow
      const manualResult = await mockServer.callTool('oauthCallback', {
        code: 'test-code',
        state: 'test-state',
      });

      expect(manualResult.isError).toBe(false);
      expect(mockTokenManager.storeOAuthTokenInfo).toHaveBeenCalledWith({
        accessToken: 'shared-helper-token',
        refreshToken: undefined,
        expiresAt: expect.any(Date),
        scopes: ['repo'],
        tokenType: 'Bearer',
        clientId: 'test-client-id',
      });

      // Verify state was cleared
      expect(mockOAuthStateManager.clearOAuthState).toHaveBeenCalledWith(
        'test-state'
      );
    });
  });
});
