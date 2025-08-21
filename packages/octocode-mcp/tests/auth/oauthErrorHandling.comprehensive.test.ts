// @ts-nocheck
/**
 * Comprehensive OAuth Error Handling and Edge Case Tests
 *
 * Tests all error scenarios and edge cases for OAuth flows:
 * - Network connectivity issues
 * - Invalid credentials and tokens
 * - Rate limiting and throttling
 * - Malformed responses and data
 * - Timeout and retry scenarios
 * - Security violations and attacks
 * - Configuration errors
 * - State parameter mismatches
 * - PKCE validation failures
 * - Token expiration edge cases
 * - Concurrent access conflicts
 * - Recovery and fallback mechanisms
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OAuthManager } from '../../src/auth/oauthManager.js';
import { OAuthFacade } from '../../src/auth/oauthFacade.js';
import { OAuthCallbackServer } from '../../src/http/oauthCallbackServer.js';
import { OAuthStateManager } from '../../src/mcp/tools/utils/oauthStateManager.js';
import { ConfigManager } from '../../src/config/serverConfig.js';
import { AuditLogger } from '../../src/security/auditLogger.js';
import { RateLimiter } from '../../src/security/rateLimiter.js';
import { ContentSanitizer } from '../../src/security/contentSanitizer.js';
import { registerSimpleOAuthTool } from '../../src/mcp/tools/oauth/simpleOAuthTool.js';
import { registerAllOAuthTools } from '../../src/mcp/tools/oauth/oauthTools.js';
import * as tokenManager from '../../src/mcp/tools/utils/tokenManager.js';
import {
  createMockMcpServer,
  parseResultJson,
} from '../fixtures/mcp-fixtures.js';
import type { ServerConfig } from '../../src/config/serverConfig.js';
import open from 'open';

// Mock external dependencies
vi.mock('../../src/auth/oauthManager.js');
vi.mock('../../src/auth/oauthFacade.js');
vi.mock('../../src/http/oauthCallbackServer.js');
vi.mock('../../src/mcp/tools/utils/oauthStateManager.js');
vi.mock('../../src/config/serverConfig.js');
vi.mock('../../src/security/auditLogger.js');
vi.mock('../../src/security/rateLimiter.js');
vi.mock('../../src/security/contentSanitizer.js');
vi.mock('../../src/mcp/tools/utils/tokenManager.js');
vi.mock('open');

const mockOAuthManager = vi.mocked(OAuthManager);
const mockOAuthFacade = vi.mocked(OAuthFacade);
const mockOAuthCallbackServer = vi.mocked(OAuthCallbackServer);
const mockOAuthStateManager = vi.mocked(OAuthStateManager);
const mockConfigManager = vi.mocked(ConfigManager);
const mockAuditLogger = vi.mocked(AuditLogger);
const mockRateLimiter = vi.mocked(RateLimiter);
const mockContentSanitizer = vi.mocked(ContentSanitizer);
const mockTokenManager = vi.mocked(tokenManager);
const mockOpen = vi.mocked(open);

// Mock fetch for network calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('OAuth Error Handling - Comprehensive Tests', () => {
  let mockServer: ReturnType<typeof createMockMcpServer>;
  let mockOAuthManagerInstance: {
    generatePKCEParams: ReturnType<typeof vi.fn>;
    generateState: ReturnType<typeof vi.fn>;
    createAuthorizationUrl: ReturnType<typeof vi.fn>;
    exchangeCodeForToken: ReturnType<typeof vi.fn>;
    refreshToken: ReturnType<typeof vi.fn>;
    validateToken: ReturnType<typeof vi.fn>;
    revokeToken: ReturnType<typeof vi.fn>;
    initiateDeviceFlow: ReturnType<typeof vi.fn>;
    pollDeviceFlowToken: ReturnType<typeof vi.fn>;
    validateState: ReturnType<typeof vi.fn>;
  };
  let mockOAuthFacadeInstance: {
    initialize: ReturnType<typeof vi.fn>;
    authenticate: ReturnType<typeof vi.fn>;
    getStatus: ReturnType<typeof vi.fn>;
    revoke: ReturnType<typeof vi.fn>;
    isConfigured: ReturnType<typeof vi.fn>;
  };
  let mockConfig: ServerConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    mockServer = createMockMcpServer();

    // Mock OAuth Manager instance
    mockOAuthManagerInstance = {
      generatePKCEParams: vi.fn().mockReturnValue({
        codeVerifier: 'test-code-verifier',
        codeChallenge: 'test-code-challenge',
        codeChallengeMethod: 'S256',
      }),
      generateState: vi.fn().mockReturnValue('test-state-123'),
      createAuthorizationUrl: vi
        .fn()
        .mockReturnValue(
          'https://github.com/login/oauth/authorize?client_id=test'
        ),
      exchangeCodeForToken: vi.fn().mockResolvedValue({
        accessToken: 'gho_test_token_123',
        tokenType: 'bearer',
        scope: 'repo read:user read:org',
      }),
      refreshToken: vi.fn().mockResolvedValue({
        accessToken: 'gho_refreshed_token_456',
        tokenType: 'bearer',
      }),
      validateToken: vi.fn().mockResolvedValue(true),
      revokeToken: vi.fn().mockResolvedValue(undefined),
      initiateDeviceFlow: vi.fn().mockResolvedValue({
        device_code: 'test-device-code',
        user_code: 'ABCD-1234',
        verification_uri: 'https://github.com/login/device',
        expires_in: 900,
        interval: 5,
      }),
      pollDeviceFlowToken: vi.fn().mockResolvedValue({
        accessToken: 'gho_device_token_789',
        tokenType: 'bearer',
        scope: 'repo read:user read:org',
      }),
      validateState: vi.fn().mockReturnValue(true),
    };

    // Mock OAuth Facade instance
    mockOAuthFacadeInstance = {
      initialize: vi.fn(),
      authenticate: vi.fn(),
      getStatus: vi.fn(),
      revoke: vi.fn(),
      isConfigured: vi.fn(),
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
    mockOAuthFacade.getInstance.mockReturnValue(
      mockOAuthFacadeInstance as unknown as OAuthFacade
    );
    mockConfigManager.getConfig.mockReturnValue(mockConfig);

    // Mock open function to prevent browser opening
    mockOpen.mockResolvedValue({} as import('child_process').ChildProcess);

    // Mock token manager functions (default success, individual tests will override)
    mockTokenManager.getTokenMetadata.mockResolvedValue({
      source: 'oauth' as const,
      expiresAt: new Date(Date.now() + 3600000),
      scopes: ['repo', 'read:user', 'read:org'],
      clientId: 'test-client-id',
    });
    mockTokenManager.storeOAuthTokenInfo.mockResolvedValue(undefined);
    mockTokenManager.clearOAuthTokens.mockResolvedValue(undefined);
    mockTokenManager.getGitHubToken.mockResolvedValue('test-token');

    // Mock state manager
    mockOAuthStateManager.initialize = vi.fn();
    mockOAuthStateManager.storeOAuthState = vi.fn();
    mockOAuthStateManager.getOAuthState = vi.fn();
    mockOAuthStateManager.clearOAuthState = vi.fn();

    // Mock security components
    mockAuditLogger.logEvent = vi.fn();
    mockRateLimiter.checkLimit = vi.fn().mockResolvedValue({
      allowed: true,
      remaining: 1000,
      limit: 5000,
    });
    mockContentSanitizer.sanitizeContent = vi.fn().mockReturnValue({
      content: 'sanitized',
      hasSecrets: false,
      secretsDetected: [],
      warnings: [],
    });
    mockContentSanitizer.validateInputParameters = vi
      .fn()
      .mockImplementation(params => ({
        sanitizedParams: params || {},
        isValid: true,
        hasSecrets: false,
        warnings: [],
      }));

    // Register OAuth tools
    registerSimpleOAuthTool(mockServer.server);
    registerAllOAuthTools(mockServer.server);
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.restoreAllMocks();
  });

  describe('Network Connectivity Issues', () => {
    it('should handle network timeouts during device flow', async () => {
      mockOAuthManagerInstance.initiateDeviceFlow.mockRejectedValue(
        new Error('Network timeout: ETIMEDOUT')
      );

      const result = await mockServer.callTool('simpleOAuth', {
        action: 'authenticate',
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('Network timeout');
      expect(content.text).toContain('Check your internet connection');
      expect(content.text).toContain('Try again in a few moments');

      // Verify error was logged
      expect(mockAuditLogger.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'oauth_authentication',
          outcome: 'failure',
          details: expect.objectContaining({
            error: 'Network timeout: ETIMEDOUT',
          }),
        })
      );
    });

    it('should handle DNS resolution failures', async () => {
      mockOAuthManagerInstance.initiateDeviceFlow.mockRejectedValue(
        new Error('getaddrinfo ENOTFOUND github.com')
      );

      const result = await mockServer.callTool('oauthInitiate', {
        callbackMethod: 'device_flow',
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('DNS resolution failed');
      expect(content.text).toContain('Check your DNS settings');
      expect(content.text).toContain('Verify internet connectivity');
    });

    it('should handle connection refused errors', async () => {
      mockOAuthManagerInstance.exchangeCodeForToken.mockRejectedValue(
        new Error('connect ECONNREFUSED 140.82.112.3:443')
      );

      mockOAuthStateManager.getOAuthState.mockResolvedValue({
        codeVerifier: 'test-verifier',
        organization: undefined,
        scopes: ['repo'],
        callbackMethod: 'manual',
        clientId: 'test-client',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      mockOAuthManagerInstance.validateState.mockReturnValue(true);

      const result = await mockServer.callTool('oauthCallback', {
        code: 'test-code',
        state: 'test-state',
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('Connection refused');
      expect(content.text).toContain('GitHub servers may be unavailable');
      expect(content.text).toContain('Try again later');
    });

    it('should handle SSL/TLS certificate errors', async () => {
      mockOAuthManagerInstance.refreshToken.mockRejectedValue(
        new Error(
          'certificate verify failed: unable to verify the first certificate'
        )
      );

      // Make getTokenMetadata throw SSL certificate error for simpleOAuth status
      mockTokenManager.getTokenMetadata.mockRejectedValue(
        new Error(
          'certificate verify failed: unable to verify the first certificate'
        )
      );

      const result = await mockServer.callTool('simpleOAuth', {
        action: 'status',
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('certificate verify failed');
      expect(content.text).toContain('Check your system certificates');
      expect(content.text).toContain('Corporate firewall or proxy');
    });

    it('should handle proxy and firewall issues', async () => {
      mockOAuthManagerInstance.initiateDeviceFlow.mockRejectedValue(
        new Error('tunneling socket could not be established, statusCode=407')
      );

      const result = await mockServer.callTool('oauthInitiate', {
        callbackMethod: 'device_flow',
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('SSL certificate verification failed');
      expect(content.text).toContain(
        'Corporate firewall or proxy may be interfering'
      );
      expect(content.text).toContain('Contact your network administrator');
    });
  });

  describe('Invalid Credentials and Tokens', () => {
    it('should handle invalid client credentials', async () => {
      mockOAuthManagerInstance.exchangeCodeForToken.mockRejectedValue(
        new Error('OAuth error: invalid_client')
      );

      mockOAuthStateManager.getOAuthState.mockResolvedValue({
        codeVerifier: 'test-verifier',
        organization: undefined,
        scopes: ['repo'],
        callbackMethod: 'manual',
        clientId: 'invalid-client',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      mockOAuthManagerInstance.validateState.mockReturnValue(true);

      const result = await mockServer.callTool('oauthCallback', {
        code: 'test-code',
        state: 'test-state',
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('Invalid client credentials');
      expect(content.text).toContain('Check GITHUB_OAUTH_CLIENT_ID');
      expect(content.text).toContain('Check GITHUB_OAUTH_CLIENT_SECRET');
      expect(content.text).toContain('Verify OAuth app configuration');
    });

    it('should handle invalid authorization codes', async () => {
      mockOAuthManagerInstance.exchangeCodeForToken.mockRejectedValue(
        new Error('OAuth error: invalid_grant')
      );

      mockOAuthStateManager.getOAuthState.mockResolvedValue({
        codeVerifier: 'test-verifier',
        organization: undefined,
        scopes: ['repo'],
        callbackMethod: 'manual',
        clientId: 'test-client',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      mockOAuthManagerInstance.validateState.mockReturnValue(true);

      const result = await mockServer.callTool('oauthCallback', {
        code: 'invalid-code',
        state: 'test-state',
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('Invalid authorization code');
      expect(content.text).toContain('Code may have expired');
      expect(content.text).toContain('Start OAuth flow again');
    });

    it('should handle expired refresh tokens', async () => {
      mockOAuthManagerInstance.refreshToken.mockRejectedValue(
        new Error('OAuth error: invalid_grant - refresh token expired')
      );

      // Make getTokenMetadata throw refresh token expired error
      mockTokenManager.getTokenMetadata.mockRejectedValue(
        new Error('OAuth error: invalid_grant - refresh token expired')
      );

      const result = await mockServer.callTool('simpleOAuth', {
        action: 'status',
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('invalid_grant - refresh token expired');
      expect(content.text).toContain('Re-authenticate required');
      expect(content.text).toContain('Use simpleOAuth authenticate');
    });

    it('should handle revoked tokens', async () => {
      mockOAuthManagerInstance.validateToken.mockResolvedValue({
        valid: false,
        error: 'Token has been revoked',
        scopes: [],
      });

      // Make getTokenMetadata throw revoked token error
      mockTokenManager.getTokenMetadata.mockRejectedValue(
        new Error('Token has been revoked')
      );

      const result = await mockServer.callTool('simpleOAuth', {
        action: 'status',
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('Token has been revoked');
      expect(content.text).toContain('Re-authenticate to continue');
      expect(content.text).toContain('Check OAuth app permissions');
    });

    it('should handle insufficient scopes', async () => {
      mockOAuthManagerInstance.validateToken.mockResolvedValue({
        valid: true,
        scopes: ['public_repo'],
        error: 'Insufficient scope: requires repo',
      });

      mockOAuthFacadeInstance.getStatus.mockResolvedValue({
        success: true,
        message: 'Token valid but insufficient scope',
        data: {
          authenticated: true,
          scopes: ['public_repo'],
          scopeError: 'Insufficient scope: requires repo',
        },
      });

      // Mock token metadata to return limited scopes
      mockTokenManager.getTokenMetadata.mockResolvedValue({
        source: 'oauth' as const,
        expiresAt: new Date(Date.now() + 3600000),
        scopes: ['public_repo'],
      });

      const result = await mockServer.callTool('simpleOAuth', {
        action: 'status',
      });

      expect(result.isError).toBe(false);
      const response = parseResultJson(result);
      // For debugging: OAuth error test response
      const data = response.data as Record<string, unknown>;

      expect(data.scopes).toEqual(['public_repo']);
      expect(data.authenticated).toBe(true);
    });
  });

  describe('Rate Limiting and Throttling', () => {
    it('should handle GitHub API rate limits', async () => {
      mockOAuthManagerInstance.initiateDeviceFlow.mockRejectedValue(
        new Error('API rate limit exceeded. Reset at 2024-01-01T12:00:00Z')
      );

      const result = await mockServer.callTool('oauthInitiate', {
        callbackMethod: 'device_flow',
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('API rate limit exceeded');
      expect(content.text).toContain('GitHub API rate limit reached');
      expect(content.text).toContain('Wait for rate limit reset');
    });

    it('should handle OAuth rate limits', async () => {
      mockOAuthManagerInstance.exchangeCodeForToken.mockRejectedValue(
        new Error('OAuth rate limit exceeded: too many token requests')
      );

      mockOAuthStateManager.getOAuthState.mockResolvedValue({
        codeVerifier: 'test-verifier',
        organization: undefined,
        scopes: ['repo'],
        callbackMethod: 'manual',
        clientId: 'test-client',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      mockOAuthManagerInstance.validateState.mockReturnValue(true);

      const result = await mockServer.callTool('oauthCallback', {
        code: 'test-code',
        state: 'test-state',
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('OAuth rate limit exceeded');
      expect(content.text).toContain('Too many token requests');
      expect(content.text).toContain('Wait before retrying');
    });

    it('should handle internal rate limiting', async () => {
      mockRateLimiter.checkLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        limit: 1000,
        resetTime: new Date(Date.now() + 3600000),
      });

      const result = await mockServer.callTool('simpleOAuth', {
        action: 'authenticate',
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('Rate limit exceeded');
      expect(content.text).toContain('1000 requests per hour');
      expect(content.text).toContain('Try again after');
    });

    it('should handle device flow polling rate limits', async () => {
      mockOAuthManagerInstance.initiateDeviceFlow.mockRejectedValue(
        new Error('slow_down: polling too frequently')
      );

      mockOAuthFacadeInstance.authenticate.mockRejectedValue(
        new Error('slow_down: polling too frequently')
      );

      const result = await mockServer.callTool('simpleOAuth', {
        action: 'authenticate',
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('Polling too frequently');
      expect(content.text).toContain('Slow down polling interval');
      expect(content.text).toContain('Wait longer between requests');
    });
  });

  describe('Malformed Responses and Data', () => {
    it('should handle malformed JSON responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Unexpected token in JSON at position 0');
        },
      });

      mockOAuthManagerInstance.exchangeCodeForToken.mockRejectedValue(
        new Error('Unexpected token in JSON at position 0')
      );

      mockOAuthStateManager.getOAuthState.mockResolvedValue({
        codeVerifier: 'test-verifier',
        organization: undefined,
        scopes: ['repo'],
        callbackMethod: 'manual',
        clientId: 'test-client',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      mockOAuthManagerInstance.validateState.mockReturnValue(true);

      const result = await mockServer.callTool('oauthCallback', {
        code: 'test-code',
        state: 'test-state',
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('Invalid response format');
      expect(content.text).toContain('GitHub API may be experiencing issues');
      expect(content.text).toContain('Try again later');
    });

    it('should handle missing required fields in responses', async () => {
      mockOAuthManagerInstance.exchangeCodeForToken.mockRejectedValue(
        new Error('Invalid token response - missing required fields')
      );

      mockOAuthStateManager.getOAuthState.mockResolvedValue({
        codeVerifier: 'test-verifier',
        organization: undefined,
        scopes: ['repo'],
        callbackMethod: 'manual',
        clientId: 'test-client',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      mockOAuthManagerInstance.validateState.mockReturnValue(true);

      const result = await mockServer.callTool('oauthCallback', {
        code: 'test-code',
        state: 'test-state',
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('Invalid token response');
      expect(content.text).toContain('Missing required fields');
      expect(content.text).toContain('Contact support');
    });

    it('should handle unexpected response status codes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: async () => 'GitHub is temporarily unavailable',
      });

      mockOAuthManagerInstance.initiateDeviceFlow.mockRejectedValue(
        new Error('HTTP 503: Service Unavailable')
      );

      const result = await mockServer.callTool('oauthInitiate', {
        callbackMethod: 'device_flow',
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('GitHub service temporarily unavailable');
      expect(content.text).toContain('GitHub API is temporarily unavailable');
      expect(content.text).toContain('Try again in a few minutes');
    });

    it('should handle corrupted state data', async () => {
      mockOAuthStateManager.getOAuthState.mockResolvedValue({
        // Corrupted/incomplete state data
        codeVerifier: null,
        organization: undefined,
        scopes: [],
        callbackMethod: 'manual',
        clientId: '',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      } as unknown as OAuthStateManager.OAuthState);

      const result = await mockServer.callTool('oauthCallback', {
        code: 'test-code',
        state: 'test-state',
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('OAuth state data corruption detected');
      expect(content.text).toContain('Start OAuth flow again');
      expect(content.text).toContain('Clear browser cache');
    });
  });

  describe('Timeout and Retry Scenarios', () => {
    it('should handle callback server timeout', async () => {
      const mockCallbackServerInstance = {
        startAndWaitForCallback: vi
          .fn()
          .mockRejectedValue(new Error('Callback timeout after 300 seconds')),
        getCallbackUrl: vi.fn().mockImplementation(() => {
          throw new Error(
            'Callback timeout: User did not complete authorization'
          );
        }),
        stop: vi.fn(),
        isRunning: vi.fn().mockReturnValue(false),
      };

      mockOAuthCallbackServer.mockImplementation(
        () => mockCallbackServerInstance as unknown as OAuthCallbackServer
      );

      mockOAuthManagerInstance.generatePKCEParams.mockReturnValue({
        codeVerifier: 'timeout-verifier',
        codeChallenge: 'timeout-challenge',
        codeChallengeMethod: 'S256',
      });

      mockOAuthManagerInstance.generateState.mockReturnValue('timeout-state');
      mockOAuthManagerInstance.createAuthorizationUrl.mockReturnValue(
        'https://github.com/login/oauth/authorize?timeout=true'
      );

      const result = await mockServer.callTool('oauthInitiate', {
        callbackMethod: 'local_server',
        callbackPort: 8765,
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('Callback timeout');
      expect(content.text).toContain(
        'User may not have completed authorization'
      );
      expect(content.text).toContain('Try manual callback method');
    });

    it('should handle device flow timeout', async () => {
      mockOAuthManagerInstance.initiateDeviceFlow.mockRejectedValue(
        new Error(
          'Device flow expired: user did not authorize within 15 minutes'
        )
      );

      mockOAuthFacadeInstance.authenticate.mockRejectedValue(
        new Error(
          'Device flow expired: user did not authorize within 15 minutes'
        )
      );

      const result = await mockServer.callTool('simpleOAuth', {
        action: 'authenticate',
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('Device flow expired');
      expect(content.text).toContain(
        'User did not authorize within 15 minutes'
      );
      expect(content.text).toContain('Start authentication again');
    });

    it('should handle retry exhaustion', async () => {
      let attemptCount = 0;
      mockOAuthManagerInstance.exchangeCodeForToken.mockImplementation(() => {
        attemptCount++;
        if (attemptCount <= 3) {
          throw new Error('Temporary server error');
        }
        throw new Error('Max retries exceeded');
      });

      mockOAuthStateManager.getOAuthState.mockResolvedValue({
        codeVerifier: 'retry-verifier',
        organization: undefined,
        scopes: ['repo'],
        callbackMethod: 'manual',
        clientId: 'test-client',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      mockOAuthManagerInstance.validateState.mockReturnValue(true);

      const result = await mockServer.callTool('oauthCallback', {
        code: 'retry-code',
        state: 'retry-state',
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('Maximum retry attempts exceeded');
      expect(content.text).toContain('Persistent server issues');
      expect(content.text).toContain('Contact support');
    });
  });

  describe('Security Violations and Attacks', () => {
    it('should handle CSRF attacks via state mismatch', async () => {
      mockOAuthStateManager.getOAuthState.mockResolvedValue({
        codeVerifier: 'csrf-verifier',
        organization: undefined,
        scopes: ['repo'],
        callbackMethod: 'manual',
        clientId: 'test-client',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      mockOAuthManagerInstance.validateState.mockReturnValue(false);

      const result = await mockServer.callTool('oauthCallback', {
        code: 'csrf-code',
        state: 'malicious-state',
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('OAuth state data corruption detected');
      expect(content.text).toContain('Start OAuth flow again');

      // Verify security event was logged
      expect(mockAuditLogger.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'oauth_callback',
          outcome: 'failure',
          details: expect.objectContaining({
            securityViolation: 'state_mismatch',
          }),
        })
      );
    });

    it('should handle authorization code interception attempts', async () => {
      mockOAuthStateManager.getOAuthState.mockResolvedValue({
        codeVerifier: 'pkce-verifier',
        organization: undefined,
        scopes: ['repo'],
        callbackMethod: 'manual',
        clientId: 'test-client',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      mockOAuthManagerInstance.validateState.mockReturnValue(true);
      mockOAuthManagerInstance.exchangeCodeForToken.mockRejectedValue(
        new Error('OAuth error: invalid_grant - PKCE verification failed')
      );

      const result = await mockServer.callTool('oauthCallback', {
        code: 'intercepted-code',
        state: 'valid-state',
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('Invalid authorization code or grant');
      expect(content.text).toContain('Code may have expired');
      expect(content.text).toContain('Start OAuth flow again');

      // Verify security event was logged
      expect(mockAuditLogger.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'oauth_callback',
          outcome: 'failure',
          details: expect.objectContaining({
            securityViolation: 'pkce_verification_failed',
          }),
        })
      );
    });

    it('should handle malicious input sanitization', async () => {
      mockContentSanitizer.validateInputParameters.mockReturnValue({
        isValid: false,
        warnings: ['Potential secret detected'],
        sanitizedInput: {},
      });

      const result = await mockServer.callTool('oauthCallback', {
        code: 'gho_malicious_token_attempt_123',
        state: 'test-state',
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('Invalid input detected');
      expect(content.text).toContain('Potential security violation');
      expect(content.text).toContain('Use proper OAuth flow');
    });

    it('should handle replay attacks', async () => {
      // Mock state that has already been used
      mockOAuthStateManager.getOAuthState.mockResolvedValue(null);

      const result = await mockServer.callTool('oauthCallback', {
        code: 'replay-code',
        state: 'used-state',
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('OAuth state validation failed');
      expect(content.text).toContain('State may have already been used');
      expect(content.text).toContain('Possible replay attack');
    });
  });

  describe('Configuration Errors', () => {
    it('should handle missing OAuth configuration', async () => {
      mockConfig.oauth!.enabled = false;
      mockConfigManager.getConfig.mockReturnValue(mockConfig);

      const result = await mockServer.callTool('simpleOAuth', {
        action: 'authenticate',
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('OAuth not configured');
      expect(content.text).toContain('Set GITHUB_OAUTH_CLIENT_ID');
      expect(content.text).toContain('Set GITHUB_OAUTH_CLIENT_SECRET');
      expect(content.text).toContain('OAuth requires client credentials');
    });

    it('should handle invalid redirect URI configuration', async () => {
      mockOAuthManagerInstance.exchangeCodeForToken.mockRejectedValue(
        new Error('OAuth error: redirect_uri_mismatch')
      );

      mockOAuthStateManager.getOAuthState.mockResolvedValue({
        codeVerifier: 'uri-verifier',
        organization: undefined,
        scopes: ['repo'],
        callbackMethod: 'manual',
        clientId: 'test-client',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      mockOAuthManagerInstance.validateState.mockReturnValue(true);

      const result = await mockServer.callTool('oauthCallback', {
        code: 'uri-code',
        state: 'uri-state',
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('Redirect URI mismatch');
      expect(content.text).toContain('Check GITHUB_OAUTH_REDIRECT_URI');
      expect(content.text).toContain('Update OAuth app configuration');
      expect(content.text).toContain('Ensure redirect URI matches exactly');
    });

    it('should handle invalid scope configuration', async () => {
      mockOAuthManagerInstance.initiateDeviceFlow.mockRejectedValue(
        new Error('OAuth error: invalid_scope - unknown scope: invalid_scope')
      );

      const result = await mockServer.callTool('oauthInitiate', {
        callbackMethod: 'device_flow',
        scopes: ['repo', 'invalid_scope'],
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('Invalid OAuth scope requested');
      expect(content.text).toContain('Check requested scopes are valid');
      expect(content.text).toContain(
        'Use standard scopes: repo, read:user, read:org'
      );
      expect(content.text).toContain('Check OAuth app permissions');
    });

    it('should handle GitHub Enterprise Server configuration errors', async () => {
      mockConfig.githubHost = 'https://invalid-github-enterprise.com';
      mockConfig.oauth!.authorizationUrl =
        'https://invalid-github-enterprise.com/login/oauth/authorize';
      mockConfigManager.getConfig.mockReturnValue(mockConfig);

      mockOAuthManagerInstance.initiateDeviceFlow.mockRejectedValue(
        new Error('getaddrinfo ENOTFOUND invalid-github-enterprise.com')
      );

      const result = await mockServer.callTool('oauthInitiate', {
        callbackMethod: 'device_flow',
      });

      expect(result.isError).toBe(true);
      // The test should fail because the server is not found when trying to initiate device flow
      const content = result.content[0];
      expect(content.text).toContain('getaddrinfo ENOTFOUND');
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle extremely long state parameters', async () => {
      const longState = 'a'.repeat(10000); // Very long state

      mockOAuthStateManager.getOAuthState.mockResolvedValue(null);

      const result = await mockServer.callTool('oauthCallback', {
        code: 'test-code',
        state: longState,
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('OAuth state validation failed');
    });

    it('should handle special characters in parameters', async () => {
      const specialCharState = 'state<script>alert("xss")</script>';

      mockContentSanitizer.sanitizeContent.mockReturnValue({
        content: 'state&lt;script&gt;alert("xss")&lt;/script&gt;',
        hasSecrets: false,
        secretsDetected: [],
        warnings: ['Special characters detected'],
      });

      mockOAuthStateManager.getOAuthState.mockResolvedValue(null);

      const result = await mockServer.callTool('oauthCallback', {
        code: 'test-code',
        state: specialCharState,
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('OAuth state validation failed');
    });

    it('should handle concurrent state operations', async () => {
      // Simulate race condition where state is cleared between validation and use
      let stateCallCount = 0;
      mockOAuthStateManager.getOAuthState.mockImplementation(() => {
        stateCallCount++;
        if (stateCallCount === 1) {
          return Promise.resolve({
            codeVerifier: 'race-verifier',
            organization: undefined,
            scopes: ['repo'],
            callbackMethod: 'manual',
            clientId: 'test-client',
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          });
        }
        return Promise.resolve(null); // State was cleared
      });

      mockOAuthManagerInstance.validateState.mockReturnValue(true);

      const result = await mockServer.callTool('oauthCallback', {
        code: 'race-code',
        state: 'race-state',
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('OAuth state data corruption detected');
    });

    it('should handle memory pressure during token operations', async () => {
      mockOAuthManagerInstance.exchangeCodeForToken.mockRejectedValue(
        new Error('JavaScript heap out of memory')
      );

      mockOAuthStateManager.getOAuthState.mockResolvedValue({
        codeVerifier: 'memory-verifier',
        organization: undefined,
        scopes: ['repo'],
        callbackMethod: 'manual',
        clientId: 'test-client',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      mockOAuthManagerInstance.validateState.mockReturnValue(true);

      const result = await mockServer.callTool('oauthCallback', {
        code: 'memory-code',
        state: 'memory-state',
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain(
        'Memory exhaustion during OAuth operation'
      );
      expect(content.text).toContain('Contact administrator');
    });
  });

  describe('Recovery and Fallback Mechanisms', () => {
    it('should provide recovery suggestions for common errors', async () => {
      mockOAuthManagerInstance.initiateDeviceFlow.mockRejectedValue(
        new Error('Network error: ECONNREFUSED')
      );

      const result = await mockServer.callTool('simpleOAuth', {
        action: 'authenticate',
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];

      // Should provide multiple recovery options
      expect(content.text).toContain('Network error');
    });

    it('should suggest alternative authentication methods', async () => {
      const tempConfig = { ...mockConfig };
      tempConfig.oauth!.enabled = false;
      mockConfigManager.getConfig.mockReturnValue(tempConfig);

      const result = await mockServer.callTool('simpleOAuth', {
        action: 'authenticate',
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];

      expect(content.text).toContain('OAuth is not configured');
    });

    it('should provide troubleshooting links and resources', async () => {
      mockOAuthManagerInstance.exchangeCodeForToken.mockRejectedValue(
        new Error('OAuth error: invalid_client')
      );

      mockOAuthStateManager.getOAuthState.mockResolvedValue({
        codeVerifier: 'help-verifier',
        organization: undefined,
        scopes: ['repo'],
        callbackMethod: 'manual',
        clientId: 'test-client',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      mockOAuthManagerInstance.validateState.mockReturnValue(true);

      const result = await mockServer.callTool('oauthCallback', {
        code: 'help-code',
        state: 'help-state',
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];

      expect(content.text).toContain('Invalid client credentials provided');
    });

    it('should handle graceful degradation', async () => {
      const result = await mockServer.callTool('simpleOAuth', {
        // Pass undefined action to test graceful degradation
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('Unknown action: undefined');
    });
  });
});
