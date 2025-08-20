// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */
/**
 * Comprehensive Advanced OAuth Tools Tests (Authorization Code Flow)
 *
 * Tests all aspects of the Advanced OAuth Tools as described in INSTALLATION.md:
 * - oauthInitiate: Start OAuth flow with PKCE security
 * - oauthCallback: Complete authorization code flow
 * - oauthStatus: Detailed authentication status and metadata
 * - oauthRevoke: Token revocation with options
 * - Multiple callback methods (local_server, manual, deep_link, device_flow)
 * - PKCE security implementation
 * - State parameter validation
 * - Organization membership validation
 * - GitHub Enterprise Server support
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { registerAllOAuthTools } from '../../src/mcp/tools/oauth/oauthTools.js';
import { OAuthManager } from '../../src/auth/oauthManager.js';
import { ConfigManager } from '../../src/config/serverConfig.js';
import { OAuthStateManager } from '../../src/mcp/tools/utils/oauthStateManager.js';
import { OAuthCallbackServer } from '../../src/http/oauthCallbackServer.js';
import { OrganizationService } from '../../src/services/organizationService.js';
import {
  createMockMcpServer,
  parseResultJson,
} from '../fixtures/mcp-fixtures.js';
import type { ServerConfig } from '../../src/config/serverConfig.js';
import open from 'open';

// Mock external dependencies
vi.mock('../../src/auth/oauthManager.js');
vi.mock('../../src/config/serverConfig.js');
vi.mock('../../src/mcp/tools/utils/oauthStateManager.js');
vi.mock('../../src/http/oauthCallbackServer.js');
vi.mock('../../src/services/organizationService.js');
vi.mock('../../src/mcp/tools/utils/tokenManager.js');
vi.mock('open');

const mockOAuthManager = vi.mocked(OAuthManager);
const mockConfigManager = vi.mocked(ConfigManager);
const mockOAuthStateManager = vi.mocked(OAuthStateManager);
const mockOAuthCallbackServer = vi.mocked(OAuthCallbackServer);
const mockOrganizationService = vi.mocked(OrganizationService);
const mockOpen = vi.mocked(open);

describe('Advanced OAuth Tools - Comprehensive Tests', () => {
  let mockServer: ReturnType<typeof createMockMcpServer>;
  let mockOAuthManagerInstance: {
    generatePKCEParams: ReturnType<typeof vi.fn>;
    generateState: ReturnType<typeof vi.fn>;
    createAuthorizationUrl: ReturnType<typeof vi.fn>;
    exchangeCodeForToken: ReturnType<typeof vi.fn>;
    validateState: ReturnType<typeof vi.fn>;
    revokeToken: ReturnType<typeof vi.fn>;
    initiateDeviceFlow: ReturnType<typeof vi.fn>;
    pollDeviceFlowToken: ReturnType<typeof vi.fn>;
  };
  let mockCallbackServerInstance: {
    getCallbackUrl: ReturnType<typeof vi.fn>;
    startAndWaitForCallback: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  };
  let mockConfig: ServerConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    mockServer = createMockMcpServer();

    // Mock OAuth Manager instance
    mockOAuthManagerInstance = {
      generatePKCEParams: vi.fn(),
      generateState: vi.fn(),
      createAuthorizationUrl: vi.fn(),
      exchangeCodeForToken: vi.fn(),
      validateState: vi.fn(),
      revokeToken: vi.fn(),
      initiateDeviceFlow: vi.fn(),
      pollDeviceFlowToken: vi.fn(),
    };

    // Mock Callback Server instance
    mockCallbackServerInstance = {
      getCallbackUrl: vi.fn(),
      startAndWaitForCallback: vi.fn(),
      stop: vi.fn(),
    };

    // Mock configuration
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
        redirectUri: 'http://localhost:8080/callback',
        scopes: ['repo', 'read:user', 'read:org'],
        authorizationUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
      },
    };

    // Setup mocks
    mockOAuthManager.getInstance.mockReturnValue(
      mockOAuthManagerInstance as unknown as OAuthManager
    );
    mockConfigManager.getConfig.mockReturnValue(mockConfig);
    mockOAuthCallbackServer.mockImplementation(
      () => mockCallbackServerInstance as unknown as OAuthCallbackServer
    );

    // Mock OAuth State Manager
    mockOAuthStateManager.initialize = vi.fn();
    mockOAuthStateManager.storeOAuthState = vi.fn();
    mockOAuthStateManager.getOAuthState = vi.fn();
    mockOAuthStateManager.clearOAuthState = vi.fn();

    // Mock open function
    mockOpen.mockResolvedValue({} as import('child_process').ChildProcess);

    // Register all OAuth tools
    registerAllOAuthTools(mockServer.server);
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.restoreAllMocks();
  });

  describe('oauthInitiate Tool', () => {
    describe('Device Flow Method', () => {
      it('should initiate device flow successfully', async () => {
        // Mock device flow initiation
        mockOAuthManagerInstance.initiateDeviceFlow.mockResolvedValue({
          device_code: 'device-code-123',
          user_code: 'ABCD-1234',
          verification_uri: 'https://github.com/login/device',
          verification_uri_complete:
            'https://github.com/login/device?user_code=ABCD-1234',
          expires_in: 900,
          interval: 5,
        });

        const result = await mockServer.callTool('oauthInitiate', {
          callbackMethod: 'device_flow',
          scopes: ['repo', 'read:user', 'read:org'],
        });

        expect(result.isError).toBe(false);
        const data = parseResultJson(result) as any;

        expect(data.method).toBe('device_flow');
        expect(data.userCode).toBe('ABCD-1234');
        expect(data.verificationUrl).toBe('https://github.com/login/device');
        expect(data.verificationUrlComplete).toBe(
          'https://github.com/login/device?user_code=ABCD-1234'
        );
        expect(data.expiresIn).toBe(900);
        expect(data.interval).toBe(5);

        expect(
          mockOAuthManagerInstance.initiateDeviceFlow
        ).toHaveBeenCalledWith(['repo', 'read:user', 'read:org']);
      });

      it('should handle device flow initiation failure', async () => {
        mockOAuthManagerInstance.initiateDeviceFlow.mockRejectedValue(
          new Error('Device flow not supported')
        );

        const result = await mockServer.callTool('oauthInitiate', {
          callbackMethod: 'device_flow',
        });

        expect(result.isError).toBe(true);
        const content = result.content[0]!;
        expect(content.text).toContain('Device flow not supported');
      });
    });

    describe('Local Server Method', () => {
      it('should initiate local server callback flow', async () => {
        // Mock PKCE and state generation
        mockOAuthManagerInstance.generatePKCEParams.mockReturnValue({
          codeVerifier: 'code-verifier-123',
          codeChallenge: 'code-challenge-123',
          codeChallengeMethod: 'S256',
        });
        mockOAuthManagerInstance.generateState.mockReturnValue('state-123');

        // Mock callback server
        mockCallbackServerInstance.getCallbackUrl.mockReturnValue(
          'http://localhost:8765/auth/callback'
        );

        // Mock authorization URL creation
        mockOAuthManagerInstance.createAuthorizationUrl.mockReturnValue(
          'https://github.com/login/oauth/authorize?client_id=test&state=state-123&code_challenge=code-challenge-123'
        );

        const result = await mockServer.callTool('oauthInitiate', {
          callbackMethod: 'local_server',
          callbackPort: 8765,
          scopes: ['repo', 'read:user'],
          openBrowser: false, // Don't open browser in tests
        });

        expect(result.isError).toBe(false);
        const data = parseResultJson(result) as any;

        expect(data.method).toBe('local_server');
        expect(data.authorizationUrl).toContain(
          'github.com/login/oauth/authorize'
        );
        expect(data.callbackUrl).toBe('http://localhost:8765/auth/callback');
        expect(data.state).toBe('state-123');
        expect(data.pkce).toEqual({
          codeChallenge: 'code-challenge-123',
          codeChallengeMethod: 'S256',
        });

        // Verify state was stored
        expect(mockOAuthStateManager.storeOAuthState).toHaveBeenCalledWith(
          'state-123',
          expect.objectContaining({
            codeVerifier: 'code-verifier-123',
            callbackMethod: 'local_server',
            callbackPort: 8765,
          })
        );
      });

      it('should open browser automatically when enabled', async () => {
        mockOAuthManagerInstance.generatePKCEParams.mockReturnValue({
          codeVerifier: 'code-verifier-123',
          codeChallenge: 'code-challenge-123',
          codeChallengeMethod: 'S256',
        });
        mockOAuthManagerInstance.generateState.mockReturnValue('state-123');
        mockCallbackServerInstance.getCallbackUrl.mockReturnValue(
          'http://localhost:8765/auth/callback'
        );
        mockOAuthManagerInstance.createAuthorizationUrl.mockReturnValue(
          'https://github.com/login/oauth/authorize?client_id=test&state=state-123'
        );

        const result = await mockServer.callTool('oauthInitiate', {
          callbackMethod: 'local_server',
          openBrowser: true,
        });

        expect(result.isError).toBe(false);
        expect(mockOpen).toHaveBeenCalledWith(
          expect.stringContaining('github.com/login/oauth/authorize')
        );
      });
    });

    describe('Manual Method', () => {
      it('should initiate manual callback flow', async () => {
        mockOAuthManagerInstance.generatePKCEParams.mockReturnValue({
          codeVerifier: 'manual-verifier-123',
          codeChallenge: 'manual-challenge-123',
          codeChallengeMethod: 'S256',
        });
        mockOAuthManagerInstance.generateState.mockReturnValue(
          'manual-state-123'
        );
        mockOAuthManagerInstance.createAuthorizationUrl.mockReturnValue(
          'https://github.com/login/oauth/authorize?client_id=test&state=manual-state-123'
        );

        const result = await mockServer.callTool('oauthInitiate', {
          callbackMethod: 'manual',
          scopes: ['repo'],
        });

        expect(result.isError).toBe(false);
        const data = parseResultJson(result) as any;

        expect(data.method).toBe('manual');
        expect(data.authorizationUrl).toContain(
          'github.com/login/oauth/authorize'
        );
        expect(data.state).toBe('manual-state-123');
        expect(data.instructions).toContain('Visit the authorization URL');
        expect(data.instructions).toContain('oauthCallback tool');
      });
    });

    describe('Deep Link Method', () => {
      it('should initiate deep link callback flow', async () => {
        mockOAuthManagerInstance.generatePKCEParams.mockReturnValue({
          codeVerifier: 'deep-verifier-123',
          codeChallenge: 'deep-challenge-123',
          codeChallengeMethod: 'S256',
        });
        mockOAuthManagerInstance.generateState.mockReturnValue(
          'deep-state-123'
        );
        mockOAuthManagerInstance.createAuthorizationUrl.mockReturnValue(
          'https://github.com/login/oauth/authorize?client_id=test&state=deep-state-123'
        );

        const result = await mockServer.callTool('oauthInitiate', {
          callbackMethod: 'deep_link',
          scopes: ['repo', 'read:user'],
        });

        expect(result.isError).toBe(false);
        const data = parseResultJson(result) as any;

        expect(data.method).toBe('deep_link');
        expect(data.authorizationUrl).toContain(
          'github.com/login/oauth/authorize'
        );
        expect(data.state).toBe('deep-state-123');
        expect(data.deepLinkUrl).toContain('mcp://oauth/callback');
      });
    });

    describe('Organization Validation', () => {
      it('should store organization for validation', async () => {
        mockOAuthManagerInstance.generatePKCEParams.mockReturnValue({
          codeVerifier: 'org-verifier-123',
          codeChallenge: 'org-challenge-123',
          codeChallengeMethod: 'S256',
        });
        mockOAuthManagerInstance.generateState.mockReturnValue('org-state-123');
        mockOAuthManagerInstance.createAuthorizationUrl.mockReturnValue(
          'https://github.com/login/oauth/authorize?client_id=test&state=org-state-123'
        );

        const result = await mockServer.callTool('oauthInitiate', {
          callbackMethod: 'manual',
          organization: 'test-org',
          scopes: ['repo', 'read:user', 'read:org'],
        });

        expect(result.isError).toBe(false);

        // Verify organization was stored in state
        expect(mockOAuthStateManager.storeOAuthState).toHaveBeenCalledWith(
          'org-state-123',
          expect.objectContaining({
            organization: 'test-org',
          })
        );
      });
    });

    describe('Error Handling', () => {
      it('should handle OAuth not configured', async () => {
        mockConfig.oauth!.enabled = false;
        mockConfigManager.getConfig.mockReturnValue(mockConfig);

        const result = await mockServer.callTool('oauthInitiate', {
          callbackMethod: 'manual',
        });

        expect(result.isError).toBe(true);
        const content = result.content[0]!;
        expect(content.text).toContain('OAuth is not configured');
        expect(content.text).toContain('GITHUB_OAUTH_CLIENT_ID');
      });

      it('should handle invalid callback method', async () => {
        const result = await mockServer.callTool('oauthInitiate', {
          callbackMethod: 'invalid_method',
        });

        expect(result.isError).toBe(true);
        const content = result.content[0]!;
        expect(content.text).toContain('Invalid callback method');
      });
    });
  });

  describe('oauthCallback Tool', () => {
    describe('Authorization Code Exchange', () => {
      it('should complete OAuth flow with valid code and state', async () => {
        // Mock stored state
        mockOAuthStateManager.getOAuthState.mockResolvedValue({
          codeVerifier: 'stored-verifier-123',
          organization: undefined,
          scopes: ['repo', 'read:user'],
          callbackMethod: 'manual',
          clientId: 'Iv1.a629723d4c8a5678',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        });

        // Mock state validation
        mockOAuthManagerInstance.validateState.mockReturnValue(true);

        // Mock token exchange
        mockOAuthManagerInstance.exchangeCodeForToken.mockResolvedValue({
          accessToken: 'gho_access_token_123',
          refreshToken: 'ghr_refresh_token_123',
          tokenType: 'Bearer',
          expiresIn: 3600,
          scope: 'repo read:user',
        });

        const result = await mockServer.callTool('oauthCallback', {
          code: 'auth_code_123',
          state: 'callback-state-123',
        });

        expect(result.isError).toBe(false);
        const data = parseResultJson(result) as any;

        expect(data.success).toBe(true);
        expect(data.tokenType).toBe('Bearer');
        expect(data.scopes).toEqual(['repo', 'read:user']);
        expect(data.expiresAt).toBeDefined();
        expect(data.hasRefreshToken).toBe(true);

        // Verify token exchange was called with correct parameters
        expect(
          mockOAuthManagerInstance.exchangeCodeForToken
        ).toHaveBeenCalledWith(
          'auth_code_123',
          'stored-verifier-123',
          'callback-state-123',
          undefined,
          undefined
        );

        // Verify state was cleared
        expect(mockOAuthStateManager.clearOAuthState).toHaveBeenCalledWith(
          'callback-state-123'
        );
      });

      it('should validate organization membership during callback', async () => {
        // Mock stored state with organization
        mockOAuthStateManager.getOAuthState.mockResolvedValue({
          codeVerifier: 'org-verifier-123',
          organization: 'test-org',
          scopes: ['repo', 'read:user', 'read:org'],
          callbackMethod: 'manual',
          clientId: 'Iv1.a629723d4c8a5678',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        });

        mockOAuthManagerInstance.validateState.mockReturnValue(true);
        mockOAuthManagerInstance.exchangeCodeForToken.mockResolvedValue({
          accessToken: 'gho_access_token_123',
          refreshToken: 'ghr_refresh_token_123',
          tokenType: 'Bearer',
          expiresIn: 3600,
          scope: 'repo read:user read:org',
        });

        // Mock organization service
        const mockOrgServiceInstance = {
          checkMembership: vi.fn().mockResolvedValue({
            isMember: true,
            role: 'member',
            visibility: 'public',
          }),
        };
        mockOrganizationService.mockImplementation(
          () => mockOrgServiceInstance as unknown as OrganizationService
        );

        const result = await mockServer.callTool('oauthCallback', {
          code: 'auth_code_123',
          state: 'org-callback-state-123',
        });

        expect(result.isError).toBe(false);
        const data = parseResultJson(result) as any;

        expect(data.success).toBe(true);
        expect(data.organization).toBeDefined();
        expect(data.organization.organization).toBe('test-org');
        expect(data.organization.isMember).toBe(true);
        expect(data.organization.role).toBe('member');

        expect(mockOrgServiceInstance.checkMembership).toHaveBeenCalledWith(
          'test-org'
        );
      });

      it('should handle organization membership validation failure', async () => {
        mockOAuthStateManager.getOAuthState.mockResolvedValue({
          codeVerifier: 'org-verifier-123',
          organization: 'test-org',
          scopes: ['repo', 'read:user', 'read:org'],
          callbackMethod: 'manual',
          clientId: 'Iv1.a629723d4c8a5678',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        });

        mockOAuthManagerInstance.validateState.mockReturnValue(true);
        mockOAuthManagerInstance.exchangeCodeForToken.mockResolvedValue({
          accessToken: 'gho_access_token_123',
          tokenType: 'Bearer',
          expiresIn: 3600,
          scope: 'repo read:user read:org',
        });

        // Mock organization service failure
        const mockOrgServiceInstance = {
          checkMembership: vi.fn().mockResolvedValue({
            isMember: false,
          }),
        };
        mockOrganizationService.mockImplementation(
          () => mockOrgServiceInstance as unknown as OrganizationService
        );

        const result = await mockServer.callTool('oauthCallback', {
          code: 'auth_code_123',
          state: 'org-fail-state-123',
        });

        expect(result.isError).toBe(false);
        const data = parseResultJson(result) as any;

        expect(data.success).toBe(true);
        expect(data.organization).toBeDefined();
        expect(data.organization.isMember).toBe(false);
      });
    });

    describe('Error Handling', () => {
      it('should handle invalid state parameter', async () => {
        mockOAuthStateManager.getOAuthState.mockResolvedValue(null);

        const result = await mockServer.callTool('oauthCallback', {
          code: 'auth_code_123',
          state: 'invalid-state',
        });

        expect(result.isError).toBe(true);
        const content = result.content[0]!;
        expect(content.text).toContain('Invalid or expired state parameter');
      });

      it('should handle state validation failure', async () => {
        mockOAuthStateManager.getOAuthState.mockResolvedValue({
          codeVerifier: 'verifier-123',
          organization: undefined,
          scopes: ['repo'],
          callbackMethod: 'manual',
          clientId: 'test-client',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        });

        mockOAuthManagerInstance.validateState.mockReturnValue(false);

        const result = await mockServer.callTool('oauthCallback', {
          code: 'auth_code_123',
          state: 'mismatched-state',
        });

        expect(result.isError).toBe(true);
        const content = result.content[0]!;
        expect(content.text).toContain('State parameter validation failed');
      });

      it('should handle token exchange failure', async () => {
        mockOAuthStateManager.getOAuthState.mockResolvedValue({
          codeVerifier: 'verifier-123',
          organization: undefined,
          scopes: ['repo'],
          callbackMethod: 'manual',
          clientId: 'test-client',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        });

        mockOAuthManagerInstance.validateState.mockReturnValue(true);
        mockOAuthManagerInstance.exchangeCodeForToken.mockRejectedValue(
          new Error('Invalid authorization code')
        );

        const result = await mockServer.callTool('oauthCallback', {
          code: 'invalid_code',
          state: 'valid-state',
        });

        expect(result.isError).toBe(true);
        const content = result.content[0]!;
        expect(content.text).toContain('Invalid authorization code');
      });
    });
  });

  describe('oauthStatus Tool', () => {
    it('should return detailed authentication status', async () => {
      // Mock token metadata
      const mockTokenMetadata = vi.fn().mockResolvedValue({
        source: 'oauth',
        expiresAt: new Date('2024-12-31T23:59:59.000Z'),
        scopes: ['repo', 'read:user', 'read:org'],
        clientId: 'Iv1.a629723d4c8a5678',
        appId: undefined,
        installationId: undefined,
      });

      // Mock GitHub token
      const mockGetGitHubToken = vi.fn().mockResolvedValue('gho_token_123');

      // Import and mock token manager functions
      const tokenManagerModule = await import(
        '../../src/mcp/tools/utils/tokenManager.js'
      );
      vi.mocked(tokenManagerModule.getTokenMetadata).mockImplementation(
        mockTokenMetadata
      );
      vi.mocked(tokenManagerModule.getGitHubToken).mockImplementation(
        mockGetGitHubToken
      );

      const result = await mockServer.callTool('oauthStatus', {});

      expect(result.isError).toBe(false);
      const data = parseResultJson(result);

      expect(data.authenticated).toBe(true);
      expect(data.source).toBe('oauth');
      expect(data.expiresAt).toBe('2024-12-31T23:59:59.000Z');
      expect(data.scopes).toEqual(['repo', 'read:user', 'read:org']);
      expect(data.clientId).toBe('Iv1.a629723d4c8a5678');
    });

    it('should return not authenticated status', async () => {
      const mockTokenMetadata = vi.fn().mockResolvedValue({
        source: 'unknown',
      });
      const mockGetGitHubToken = vi.fn().mockResolvedValue(null);

      const tokenManagerModule = await import(
        '../../src/mcp/tools/utils/tokenManager.js'
      );
      vi.mocked(tokenManagerModule.getTokenMetadata).mockImplementation(
        mockTokenMetadata
      );
      vi.mocked(tokenManagerModule.getGitHubToken).mockImplementation(
        mockGetGitHubToken
      );

      const result = await mockServer.callTool('oauthStatus', {});

      expect(result.isError).toBe(false);
      const data = parseResultJson(result);

      expect(data.authenticated).toBe(false);
      expect(data.source).toBe('unknown');
    });
  });

  describe('oauthRevoke Tool', () => {
    it('should revoke tokens successfully', async () => {
      const mockClearOAuthTokens = vi.fn().mockResolvedValue(undefined);
      const mockGetGitHubToken = vi.fn().mockResolvedValue('gho_token_123');

      mockOAuthManagerInstance.revokeToken.mockResolvedValue(undefined);

      const tokenManagerModule = await import(
        '../../src/mcp/tools/utils/tokenManager.js'
      );
      vi.mocked(tokenManagerModule.clearOAuthTokens).mockImplementation(
        mockClearOAuthTokens
      );
      vi.mocked(tokenManagerModule.getGitHubToken).mockImplementation(
        mockGetGitHubToken
      );

      const result = await mockServer.callTool('oauthRevoke', {
        revokeRemote: true,
      });

      expect(result.isError).toBe(false);
      const data = parseResultJson(result);

      expect(data.success).toBe(true);
      expect(data.tokensCleared).toBe(true);
      expect(data.remoteRevoked).toBe(true);

      expect(mockOAuthManagerInstance.revokeToken).toHaveBeenCalledWith(
        'gho_token_123'
      );
      expect(mockClearOAuthTokens).toHaveBeenCalled();
    });

    it('should handle local-only revocation', async () => {
      const mockClearOAuthTokens = vi.fn().mockResolvedValue(undefined);
      const mockGetGitHubToken = vi.fn().mockResolvedValue('gho_token_123');

      const tokenManagerModule = await import(
        '../../src/mcp/tools/utils/tokenManager.js'
      );
      vi.mocked(tokenManagerModule.clearOAuthTokens).mockImplementation(
        mockClearOAuthTokens
      );
      vi.mocked(tokenManagerModule.getGitHubToken).mockImplementation(
        mockGetGitHubToken
      );

      const result = await mockServer.callTool('oauthRevoke', {
        revokeRemote: false,
      });

      expect(result.isError).toBe(false);
      const data = parseResultJson(result);

      expect(data.success).toBe(true);
      expect(data.tokensCleared).toBe(true);
      expect(data.remoteRevoked).toBe(false);

      expect(mockOAuthManagerInstance.revokeToken).not.toHaveBeenCalled();
      expect(mockClearOAuthTokens).toHaveBeenCalled();
    });

    it('should handle no tokens to revoke', async () => {
      const mockGetGitHubToken = vi.fn().mockResolvedValue(null);

      const tokenManagerModule = await import(
        '../../src/mcp/tools/utils/tokenManager.js'
      );
      vi.mocked(tokenManagerModule.getGitHubToken).mockImplementation(
        mockGetGitHubToken
      );

      const result = await mockServer.callTool('oauthRevoke', {});

      expect(result.isError).toBe(false);
      const data = parseResultJson(result);

      expect(data.success).toBe(true);
      expect(data.tokensCleared).toBe(false);
      expect(data.remoteRevoked).toBe(false);
    });
  });

  describe('GitHub Enterprise Server Support', () => {
    beforeEach(() => {
      // Configure for GitHub Enterprise Server
      mockConfig.githubHost = 'https://github.enterprise.com';
      mockConfig.oauth!.authorizationUrl =
        'https://github.enterprise.com/login/oauth/authorize';
      mockConfig.oauth!.tokenUrl =
        'https://github.enterprise.com/login/oauth/access_token';
      mockConfigManager.getConfig.mockReturnValue(mockConfig);
    });

    it('should work with GitHub Enterprise Server URLs', async () => {
      mockOAuthManagerInstance.generatePKCEParams.mockReturnValue({
        codeVerifier: 'ghe-verifier-123',
        codeChallenge: 'ghe-challenge-123',
        codeChallengeMethod: 'S256',
      });
      mockOAuthManagerInstance.generateState.mockReturnValue('ghe-state-123');
      mockOAuthManagerInstance.createAuthorizationUrl.mockReturnValue(
        'https://github.enterprise.com/login/oauth/authorize?client_id=test&state=ghe-state-123'
      );

      const result = await mockServer.callTool('oauthInitiate', {
        callbackMethod: 'manual',
      });

      expect(result.isError).toBe(false);
      const data = parseResultJson(result);

      expect(data.authorizationUrl).toContain('github.enterprise.com');
      expect(data.enterpriseServer).toBe(true);
    });

    it('should support device flow on GitHub Enterprise Server', async () => {
      mockOAuthManagerInstance.initiateDeviceFlow.mockResolvedValue({
        device_code: 'ghe-device-code-123',
        user_code: 'GHE-1234',
        verification_uri: 'https://github.enterprise.com/login/device',
        expires_in: 900,
        interval: 5,
      });

      const result = await mockServer.callTool('oauthInitiate', {
        callbackMethod: 'device_flow',
      });

      expect(result.isError).toBe(false);
      const data = parseResultJson(result);

      expect(data.verificationUrl).toBe(
        'https://github.enterprise.com/login/device'
      );
      expect(data.userCode).toBe('GHE-1234');
    });
  });

  describe('Integration Tests', () => {
    it('should complete full OAuth flow from initiate to callback', async () => {
      // Step 1: Initiate OAuth flow
      mockOAuthManagerInstance.generatePKCEParams.mockReturnValue({
        codeVerifier: 'integration-verifier-123',
        codeChallenge: 'integration-challenge-123',
        codeChallengeMethod: 'S256',
      });
      mockOAuthManagerInstance.generateState.mockReturnValue(
        'integration-state-123'
      );
      mockOAuthManagerInstance.createAuthorizationUrl.mockReturnValue(
        'https://github.com/login/oauth/authorize?client_id=test&state=integration-state-123'
      );

      const initiateResult = await mockServer.callTool('oauthInitiate', {
        callbackMethod: 'manual',
        scopes: ['repo', 'read:user'],
      });

      expect(initiateResult.isError).toBe(false);
      const initiateData = parseResultJson(initiateResult);
      expect(initiateData.state).toBe('integration-state-123');

      // Step 2: Complete OAuth flow with callback
      mockOAuthStateManager.getOAuthState.mockResolvedValue({
        codeVerifier: 'integration-verifier-123',
        organization: undefined,
        scopes: ['repo', 'read:user'],
        callbackMethod: 'manual',
        clientId: 'Iv1.a629723d4c8a5678',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      mockOAuthManagerInstance.validateState.mockReturnValue(true);
      mockOAuthManagerInstance.exchangeCodeForToken.mockResolvedValue({
        accessToken: 'gho_integration_token_123',
        refreshToken: 'ghr_integration_refresh_123',
        tokenType: 'Bearer',
        expiresIn: 3600,
        scope: 'repo read:user',
      });

      const callbackResult = await mockServer.callTool('oauthCallback', {
        code: 'integration_auth_code_123',
        state: 'integration-state-123',
      });

      expect(callbackResult.isError).toBe(false);
      const callbackData = parseResultJson(callbackResult);
      expect(callbackData.success).toBe(true);
      expect(callbackData.scopes).toEqual(['repo', 'read:user']);
    });
  });
});
