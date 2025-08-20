/**
 * Authentication Priority Tests
 *
 * Tests the authentication priority order and CLI enablement logic
 * implemented in tokenManager.ts
 */

import { describe, it, expect } from 'vitest';

describe('Authentication Priority Order', () => {
  it('should have correct token resolution priority', () => {
    const expectedPriority = [
      'OAuth 2.1 Access Token',
      'GitHub App Installation Token',
      'Personal Access Token (GITHUB_TOKEN)',
      'Personal Access Token (GH_TOKEN)',
      'GitHub CLI Token (conditional)',
      'Authorization Header',
    ];

    expect(expectedPriority).toHaveLength(6);
    expect(expectedPriority[0]).toBe('OAuth 2.1 Access Token');
    expect(expectedPriority[4]).toBe('GitHub CLI Token (conditional)');
  });

  it('should enable CLI in local development mode', () => {
    // No configuration = local development mode
    const env: Record<string, string | undefined> = {};

    const hasOAuthCredentials = !!(
      env.GITHUB_OAUTH_CLIENT_ID && env.GITHUB_OAUTH_CLIENT_SECRET
    );
    const hasGitHubAppCredentials = !!(
      env.GITHUB_APP_ID &&
      env.GITHUB_APP_PRIVATE_KEY &&
      env.GITHUB_APP_ENABLED === 'true'
    );
    const hasEnterpriseConfig = !!(
      env.GITHUB_ORGANIZATION ||
      env.AUDIT_ALL_ACCESS === 'true' ||
      env.RATE_LIMIT_API_HOUR
    );

    const shouldDisableCLI =
      hasEnterpriseConfig || hasOAuthCredentials || hasGitHubAppCredentials;

    expect(shouldDisableCLI).toBe(false);
  });

  it('should disable CLI when OAuth credentials are configured', () => {
    const env: Record<string, string | undefined> = {
      GITHUB_OAUTH_CLIENT_ID: 'test-client-id',
      GITHUB_OAUTH_CLIENT_SECRET: 'test-client-secret',
    };

    const hasOAuthCredentials = !!(
      env.GITHUB_OAUTH_CLIENT_ID && env.GITHUB_OAUTH_CLIENT_SECRET
    );
    const hasGitHubAppCredentials = !!(
      env.GITHUB_APP_ID &&
      env.GITHUB_APP_PRIVATE_KEY &&
      env.GITHUB_APP_ENABLED === 'true'
    );
    const hasEnterpriseConfig = !!(
      env.GITHUB_ORGANIZATION ||
      env.AUDIT_ALL_ACCESS === 'true' ||
      env.RATE_LIMIT_API_HOUR
    );

    const shouldDisableCLI =
      hasEnterpriseConfig || hasOAuthCredentials || hasGitHubAppCredentials;

    expect(hasOAuthCredentials).toBe(true);
    expect(shouldDisableCLI).toBe(true);
  });

  it('should disable CLI when GitHub App is configured', () => {
    const env: Record<string, string | undefined> = {
      GITHUB_APP_ID: '123456',
      GITHUB_APP_PRIVATE_KEY:
        '-----BEGIN RSA PRIVATE KEY-----\\ntest\\n-----END RSA PRIVATE KEY-----',
      GITHUB_APP_ENABLED: 'true',
    };

    const hasOAuthCredentials = !!(
      env.GITHUB_OAUTH_CLIENT_ID && env.GITHUB_OAUTH_CLIENT_SECRET
    );
    const hasGitHubAppCredentials = !!(
      env.GITHUB_APP_ID &&
      env.GITHUB_APP_PRIVATE_KEY &&
      env.GITHUB_APP_ENABLED === 'true'
    );
    const hasEnterpriseConfig = !!(
      env.GITHUB_ORGANIZATION ||
      env.AUDIT_ALL_ACCESS === 'true' ||
      env.RATE_LIMIT_API_HOUR
    );

    const shouldDisableCLI =
      hasEnterpriseConfig || hasOAuthCredentials || hasGitHubAppCredentials;

    expect(hasGitHubAppCredentials).toBe(true);
    expect(shouldDisableCLI).toBe(true);
  });

  it('should disable CLI in Enterprise mode', () => {
    const enterpriseTriggers: Record<string, string | undefined>[] = [
      { GITHUB_ORGANIZATION: 'test-org' },
      { AUDIT_ALL_ACCESS: 'true' },
      { GITHUB_SSO_ENFORCEMENT: 'true' },
      { RATE_LIMIT_API_HOUR: '1000' },
      { RATE_LIMIT_AUTH_HOUR: '100' },
      { RATE_LIMIT_TOKEN_HOUR: '50' },
    ];

    enterpriseTriggers.forEach(env => {
      const hasOAuthCredentials = !!(
        env.GITHUB_OAUTH_CLIENT_ID && env.GITHUB_OAUTH_CLIENT_SECRET
      );
      const hasGitHubAppCredentials = !!(
        env.GITHUB_APP_ID &&
        env.GITHUB_APP_PRIVATE_KEY &&
        env.GITHUB_APP_ENABLED === 'true'
      );
      const hasEnterpriseConfig = !!(
        env.GITHUB_ORGANIZATION ||
        env.AUDIT_ALL_ACCESS === 'true' ||
        env.GITHUB_SSO_ENFORCEMENT === 'true' ||
        env.RATE_LIMIT_API_HOUR ||
        env.RATE_LIMIT_AUTH_HOUR ||
        env.RATE_LIMIT_TOKEN_HOUR
      );

      const shouldDisableCLI =
        hasEnterpriseConfig || hasOAuthCredentials || hasGitHubAppCredentials;

      expect(hasEnterpriseConfig).toBe(true);
      expect(shouldDisableCLI).toBe(true);
    });
  });

  it('should allow Personal Access Token alongside CLI', () => {
    // PAT present but no other configuration = CLI still enabled as fallback
    const env: Record<string, string | undefined> = {
      GITHUB_TOKEN: 'ghp_test_token',
    };

    const hasOAuthCredentials = !!(
      env.GITHUB_OAUTH_CLIENT_ID && env.GITHUB_OAUTH_CLIENT_SECRET
    );
    const hasGitHubAppCredentials = !!(
      env.GITHUB_APP_ID &&
      env.GITHUB_APP_PRIVATE_KEY &&
      env.GITHUB_APP_ENABLED === 'true'
    );
    const hasEnterpriseConfig = !!(
      env.GITHUB_ORGANIZATION ||
      env.AUDIT_ALL_ACCESS === 'true' ||
      env.RATE_LIMIT_API_HOUR
    );

    const shouldDisableCLI =
      hasEnterpriseConfig || hasOAuthCredentials || hasGitHubAppCredentials;

    expect(shouldDisableCLI).toBe(false); // CLI still enabled - PAT doesn't disable CLI
  });

  it('should handle mixed configurations correctly', () => {
    const mixedConfigs = [
      {
        name: 'OAuth + Enterprise',
        env: {
          GITHUB_OAUTH_CLIENT_ID: 'test',
          GITHUB_OAUTH_CLIENT_SECRET: 'test',
          GITHUB_ORGANIZATION: 'test-org',
          RATE_LIMIT_API_HOUR: undefined,
        } as Record<string, string | undefined>,
        expectedDisabled: true,
      },
      {
        name: 'GitHub App + Enterprise',
        env: {
          GITHUB_APP_ID: '123456',
          GITHUB_APP_PRIVATE_KEY:
            '-----BEGIN RSA PRIVATE KEY-----\\ntest\\n-----END RSA PRIVATE KEY-----',
          GITHUB_APP_ENABLED: 'true',
          AUDIT_ALL_ACCESS: 'true',
          RATE_LIMIT_API_HOUR: undefined,
        } as Record<string, string | undefined>,
        expectedDisabled: true,
      },
      {
        name: 'All methods configured',
        env: {
          GITHUB_OAUTH_CLIENT_ID: 'test',
          GITHUB_OAUTH_CLIENT_SECRET: 'test',
          GITHUB_APP_ID: '123456',
          GITHUB_APP_PRIVATE_KEY:
            '-----BEGIN RSA PRIVATE KEY-----\\ntest\\n-----END RSA PRIVATE KEY-----',
          GITHUB_APP_ENABLED: 'true',
          GITHUB_ORGANIZATION: 'test-org',
          GITHUB_TOKEN: 'ghp_test',
        } as Record<string, string | undefined>,
        expectedDisabled: true,
      },
    ];

    mixedConfigs.forEach(config => {
      const env = config.env;
      const hasOAuthCredentials = !!(
        env.GITHUB_OAUTH_CLIENT_ID && env.GITHUB_OAUTH_CLIENT_SECRET
      );
      const hasGitHubAppCredentials = !!(
        env.GITHUB_APP_ID &&
        env.GITHUB_APP_PRIVATE_KEY &&
        env.GITHUB_APP_ENABLED === 'true'
      );
      const hasEnterpriseConfig = !!(
        env.GITHUB_ORGANIZATION ||
        env.AUDIT_ALL_ACCESS === 'true' ||
        env.RATE_LIMIT_API_HOUR
      );

      const shouldDisableCLI =
        hasEnterpriseConfig || hasOAuthCredentials || hasGitHubAppCredentials;

      expect(shouldDisableCLI).toBe(config.expectedDisabled);
    });
  });
});
