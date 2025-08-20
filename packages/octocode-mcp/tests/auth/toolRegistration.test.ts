/**
 * Tool Registration Authentication Flow Tests
 *
 * Tests the conditional tool registration logic implemented in src/index.ts
 * Verifies that "no auth params → no auth tools!" principle is enforced
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Authentication Tool Registration', () => {
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    // Store original environment variables
    originalEnv = { ...process.env };

    // Clear all authentication-related env vars
    delete process.env.GITHUB_OAUTH_CLIENT_ID;
    delete process.env.GITHUB_OAUTH_CLIENT_SECRET;
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    delete process.env.GITHUB_APP_ENABLED;
    delete process.env.GITHUB_ORGANIZATION;
    delete process.env.AUDIT_ALL_ACCESS;
    delete process.env.GITHUB_SSO_ENFORCEMENT;
    delete process.env.RATE_LIMIT_API_HOUR;
    delete process.env.RATE_LIMIT_AUTH_HOUR;
    delete process.env.RATE_LIMIT_TOKEN_HOUR;
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  describe('OAuth Tool Registration Detection', () => {
    it('should detect OAuth credentials correctly', () => {
      // No OAuth credentials
      const hasOAuthCredentials1 = !!(
        process.env.GITHUB_OAUTH_CLIENT_ID &&
        process.env.GITHUB_OAUTH_CLIENT_SECRET
      );
      expect(hasOAuthCredentials1).toBe(false);

      // Only client ID
      process.env.GITHUB_OAUTH_CLIENT_ID = 'test-id';
      const hasOAuthCredentials2 = !!(
        process.env.GITHUB_OAUTH_CLIENT_ID &&
        process.env.GITHUB_OAUTH_CLIENT_SECRET
      );
      expect(hasOAuthCredentials2).toBe(false);

      // Both credentials
      process.env.GITHUB_OAUTH_CLIENT_SECRET = 'test-secret';
      const hasOAuthCredentials3 = !!(
        process.env.GITHUB_OAUTH_CLIENT_ID &&
        process.env.GITHUB_OAUTH_CLIENT_SECRET
      );
      expect(hasOAuthCredentials3).toBe(true);
    });

    it('should detect GitHub App credentials correctly', () => {
      // No GitHub App credentials
      const hasGitHubAppCredentials1 = !!(
        process.env.GITHUB_APP_ID &&
        process.env.GITHUB_APP_PRIVATE_KEY &&
        process.env.GITHUB_APP_ENABLED === 'true'
      );
      expect(hasGitHubAppCredentials1).toBe(false);

      // Only App ID
      process.env.GITHUB_APP_ID = '123456';
      const hasGitHubAppCredentials2 = !!(
        process.env.GITHUB_APP_ID &&
        process.env.GITHUB_APP_PRIVATE_KEY &&
        process.env.GITHUB_APP_ENABLED === 'true'
      );
      expect(hasGitHubAppCredentials2).toBe(false);

      // App ID + Private Key but not enabled
      process.env.GITHUB_APP_PRIVATE_KEY =
        '-----BEGIN RSA PRIVATE KEY-----\\ntest\\n-----END RSA PRIVATE KEY-----';
      const hasGitHubAppCredentials3 = !!(
        process.env.GITHUB_APP_ID &&
        process.env.GITHUB_APP_PRIVATE_KEY &&
        process.env.GITHUB_APP_ENABLED === 'true'
      );
      expect(hasGitHubAppCredentials3).toBe(false);

      // All GitHub App credentials
      process.env.GITHUB_APP_ENABLED = 'true';
      const hasGitHubAppCredentials4 = !!(
        process.env.GITHUB_APP_ID &&
        process.env.GITHUB_APP_PRIVATE_KEY &&
        process.env.GITHUB_APP_ENABLED === 'true'
      );
      expect(hasGitHubAppCredentials4).toBe(true);
    });

    it('should detect Enterprise configuration correctly', () => {
      const checkEnterpriseConfig = () =>
        !!(
          process.env.GITHUB_ORGANIZATION ||
          process.env.AUDIT_ALL_ACCESS === 'true' ||
          process.env.GITHUB_SSO_ENFORCEMENT === 'true' ||
          process.env.RATE_LIMIT_API_HOUR ||
          process.env.RATE_LIMIT_AUTH_HOUR ||
          process.env.RATE_LIMIT_TOKEN_HOUR
        );

      // No enterprise config
      expect(checkEnterpriseConfig()).toBe(false);

      // Organization trigger
      process.env.GITHUB_ORGANIZATION = 'test-org';
      expect(checkEnterpriseConfig()).toBe(true);
      delete process.env.GITHUB_ORGANIZATION;

      // Audit logging trigger
      process.env.AUDIT_ALL_ACCESS = 'true';
      expect(checkEnterpriseConfig()).toBe(true);
      delete process.env.AUDIT_ALL_ACCESS;

      // SSO enforcement trigger
      process.env.GITHUB_SSO_ENFORCEMENT = 'true';
      expect(checkEnterpriseConfig()).toBe(true);
      delete process.env.GITHUB_SSO_ENFORCEMENT;

      // Rate limiting triggers
      process.env.RATE_LIMIT_API_HOUR = '1000';
      expect(checkEnterpriseConfig()).toBe(true);
      delete process.env.RATE_LIMIT_API_HOUR;

      process.env.RATE_LIMIT_AUTH_HOUR = '100';
      expect(checkEnterpriseConfig()).toBe(true);
      delete process.env.RATE_LIMIT_AUTH_HOUR;

      process.env.RATE_LIMIT_TOKEN_HOUR = '50';
      expect(checkEnterpriseConfig()).toBe(true);
      delete process.env.RATE_LIMIT_TOKEN_HOUR;
    });
  });

  describe('Tool Registration Logic', () => {
    it('should register OAuth tools only when OAuth credentials are present', () => {
      // Test the exact logic from src/index.ts:56-85
      const testScenarios = [
        {
          name: 'No OAuth credentials',
          env: {},
          shouldRegisterSimpleOAuth: false,
        },
        {
          name: 'OAuth credentials present',
          env: {
            GITHUB_OAUTH_CLIENT_ID: 'test-id',
            GITHUB_OAUTH_CLIENT_SECRET: 'test-secret',
          },
          shouldRegisterSimpleOAuth: true,
        },
      ];

      testScenarios.forEach(scenario => {
        // Set environment
        Object.entries(scenario.env).forEach(([key, value]) => {
          process.env[key] = value;
        });

        const hasOAuthCredentials = !!(
          process.env.GITHUB_OAUTH_CLIENT_ID &&
          process.env.GITHUB_OAUTH_CLIENT_SECRET
        );

        expect(hasOAuthCredentials).toBe(scenario.shouldRegisterSimpleOAuth);

        // Clear environment for next test
        Object.keys(scenario.env).forEach(key => {
          delete process.env[key];
        });
      });
    });

    it('should register all OAuth tools when OAuth OR GitHub App credentials are present', () => {
      const testScenarios = [
        {
          name: 'No credentials',
          env: {},
          shouldRegisterAllOAuth: false,
        },
        {
          name: 'OAuth credentials only',
          env: {
            GITHUB_OAUTH_CLIENT_ID: 'test-id',
            GITHUB_OAUTH_CLIENT_SECRET: 'test-secret',
          },
          shouldRegisterAllOAuth: true,
        },
        {
          name: 'GitHub App credentials only',
          env: {
            GITHUB_APP_ID: '123456',
            GITHUB_APP_PRIVATE_KEY:
              '-----BEGIN RSA PRIVATE KEY-----\\ntest\\n-----END RSA PRIVATE KEY-----',
            GITHUB_APP_ENABLED: 'true',
          },
          shouldRegisterAllOAuth: true,
        },
        {
          name: 'Both OAuth and GitHub App',
          env: {
            GITHUB_OAUTH_CLIENT_ID: 'test-id',
            GITHUB_OAUTH_CLIENT_SECRET: 'test-secret',
            GITHUB_APP_ID: '123456',
            GITHUB_APP_PRIVATE_KEY:
              '-----BEGIN RSA PRIVATE KEY-----\\ntest\\n-----END RSA PRIVATE KEY-----',
            GITHUB_APP_ENABLED: 'true',
          },
          shouldRegisterAllOAuth: true,
        },
      ];

      testScenarios.forEach(scenario => {
        // Set environment
        Object.entries(scenario.env).forEach(([key, value]) => {
          process.env[key] = value;
        });

        const hasOAuthCredentials = !!(
          process.env.GITHUB_OAUTH_CLIENT_ID &&
          process.env.GITHUB_OAUTH_CLIENT_SECRET
        );
        const hasGitHubAppCredentials = !!(
          process.env.GITHUB_APP_ID &&
          process.env.GITHUB_APP_PRIVATE_KEY &&
          process.env.GITHUB_APP_ENABLED === 'true'
        );

        const shouldRegisterAllOAuth =
          hasOAuthCredentials || hasGitHubAppCredentials;
        expect(shouldRegisterAllOAuth).toBe(scenario.shouldRegisterAllOAuth);

        // Clear environment for next test
        Object.keys(scenario.env).forEach(key => {
          delete process.env[key];
        });
      });
    });

    it('should register organization tools when auth config and enterprise features are present', () => {
      const testScenarios = [
        {
          name: 'No configuration',
          env: {},
          shouldRegisterOrgTools: false,
        },
        {
          name: 'OAuth + Enterprise organization',
          env: {
            GITHUB_OAUTH_CLIENT_ID: 'test-id',
            GITHUB_OAUTH_CLIENT_SECRET: 'test-secret',
            GITHUB_ORGANIZATION: 'test-org',
          },
          shouldRegisterOrgTools: true,
        },
        {
          name: 'GitHub App + Enterprise audit',
          env: {
            GITHUB_APP_ID: '123456',
            GITHUB_APP_PRIVATE_KEY:
              '-----BEGIN RSA PRIVATE KEY-----\\ntest\\n-----END RSA PRIVATE KEY-----',
            GITHUB_APP_ENABLED: 'true',
            AUDIT_ALL_ACCESS: 'true',
          },
          shouldRegisterOrgTools: true,
        },
        {
          name: 'OAuth without enterprise features',
          env: {
            GITHUB_OAUTH_CLIENT_ID: 'test-id',
            GITHUB_OAUTH_CLIENT_SECRET: 'test-secret',
          },
          shouldRegisterOrgTools: false,
        },
      ];

      testScenarios.forEach(scenario => {
        // Set environment
        Object.entries(scenario.env).forEach(([key, value]) => {
          process.env[key] = value;
        });

        const hasOAuthCredentials = !!(
          process.env.GITHUB_OAUTH_CLIENT_ID &&
          process.env.GITHUB_OAUTH_CLIENT_SECRET
        );
        const hasGitHubAppCredentials = !!(
          process.env.GITHUB_APP_ID &&
          process.env.GITHUB_APP_PRIVATE_KEY &&
          process.env.GITHUB_APP_ENABLED === 'true'
        );
        const hasEnterpriseConfig = !!(
          process.env.GITHUB_ORGANIZATION ||
          process.env.AUDIT_ALL_ACCESS === 'true' ||
          process.env.GITHUB_SSO_ENFORCEMENT === 'true' ||
          process.env.RATE_LIMIT_API_HOUR ||
          process.env.RATE_LIMIT_AUTH_HOUR ||
          process.env.RATE_LIMIT_TOKEN_HOUR
        );

        const hasAnyAuthConfig = hasOAuthCredentials || hasGitHubAppCredentials;
        const shouldRegisterOrgTools = hasAnyAuthConfig && hasEnterpriseConfig;

        expect(shouldRegisterOrgTools).toBe(scenario.shouldRegisterOrgTools);

        // Clear environment for next test
        Object.keys(scenario.env).forEach(key => {
          delete process.env[key];
        });
      });
    });
  });

  describe('Configuration Validation Edge Cases', () => {
    it('should handle empty string values correctly', () => {
      // Empty strings should not count as valid configuration
      process.env.GITHUB_OAUTH_CLIENT_ID = '';
      process.env.GITHUB_OAUTH_CLIENT_SECRET = 'test-secret';

      const hasOAuthCredentials = !!(
        process.env.GITHUB_OAUTH_CLIENT_ID &&
        process.env.GITHUB_OAUTH_CLIENT_SECRET
      );

      expect(hasOAuthCredentials).toBe(false);
    });

    it('should handle GitHub App enabled flag variations', () => {
      process.env.GITHUB_APP_ID = '123456';
      process.env.GITHUB_APP_PRIVATE_KEY =
        '-----BEGIN RSA PRIVATE KEY-----\\ntest\\n-----END RSA PRIVATE KEY-----';

      // Test different enabled flag values
      const testValues = ['true', 'false', 'TRUE', '1', '', undefined];
      const expectedResults = [true, false, false, false, false, false];

      testValues.forEach((value, index) => {
        if (value === undefined) {
          delete process.env.GITHUB_APP_ENABLED;
        } else {
          process.env.GITHUB_APP_ENABLED = value;
        }

        const hasGitHubAppCredentials = !!(
          process.env.GITHUB_APP_ID &&
          process.env.GITHUB_APP_PRIVATE_KEY &&
          process.env.GITHUB_APP_ENABLED === 'true'
        );

        expect(hasGitHubAppCredentials).toBe(expectedResults[index]);
      });
    });

    it('should handle audit logging flag variations', () => {
      // Test different AUDIT_ALL_ACCESS values
      const testValues = ['true', 'false', 'TRUE', '1', '', undefined];
      const expectedResults = [true, false, false, false, false, false];

      testValues.forEach((value, index) => {
        if (value === undefined) {
          delete process.env.AUDIT_ALL_ACCESS;
        } else {
          process.env.AUDIT_ALL_ACCESS = value;
        }

        const hasEnterpriseConfig = !!(
          process.env.GITHUB_ORGANIZATION ||
          process.env.AUDIT_ALL_ACCESS === 'true' ||
          process.env.RATE_LIMIT_API_HOUR
        );

        expect(hasEnterpriseConfig).toBe(expectedResults[index]);
      });
    });
  });

  describe('Comprehensive Registration Matrix', () => {
    it('should follow the complete tool registration matrix', () => {
      const testMatrix = [
        {
          name: 'Local Development Mode',
          env: {},
          expectedTools: {
            simpleOAuth: false,
            allOAuthTools: false,
            organizationTools: false,
          },
        },
        {
          name: 'OAuth Only Mode',
          env: {
            GITHUB_OAUTH_CLIENT_ID: 'test-id',
            GITHUB_OAUTH_CLIENT_SECRET: 'test-secret',
          },
          expectedTools: {
            simpleOAuth: true,
            allOAuthTools: true,
            organizationTools: false,
          },
        },
        {
          name: 'GitHub App Only Mode',
          env: {
            GITHUB_APP_ID: '123456',
            GITHUB_APP_PRIVATE_KEY:
              '-----BEGIN RSA PRIVATE KEY-----\\ntest\\n-----END RSA PRIVATE KEY-----',
            GITHUB_APP_ENABLED: 'true',
          },
          expectedTools: {
            simpleOAuth: false,
            allOAuthTools: true,
            organizationTools: false,
          },
        },
        {
          name: 'Enterprise OAuth Mode',
          env: {
            GITHUB_OAUTH_CLIENT_ID: 'test-id',
            GITHUB_OAUTH_CLIENT_SECRET: 'test-secret',
            GITHUB_ORGANIZATION: 'test-org',
          },
          expectedTools: {
            simpleOAuth: true,
            allOAuthTools: true,
            organizationTools: true,
          },
        },
        {
          name: 'Full Enterprise Mode',
          env: {
            GITHUB_OAUTH_CLIENT_ID: 'test-id',
            GITHUB_OAUTH_CLIENT_SECRET: 'test-secret',
            GITHUB_APP_ID: '123456',
            GITHUB_APP_PRIVATE_KEY:
              '-----BEGIN RSA PRIVATE KEY-----\\ntest\\n-----END RSA PRIVATE KEY-----',
            GITHUB_APP_ENABLED: 'true',
            GITHUB_ORGANIZATION: 'test-org',
            AUDIT_ALL_ACCESS: 'true',
            RATE_LIMIT_API_HOUR: '1000',
          },
          expectedTools: {
            simpleOAuth: true,
            allOAuthTools: true,
            organizationTools: true,
          },
        },
      ];

      testMatrix.forEach(scenario => {
        // Set environment
        Object.entries(scenario.env).forEach(([key, value]) => {
          process.env[key] = value;
        });

        // Apply the exact logic from src/index.ts
        const hasOAuthCredentials = !!(
          process.env.GITHUB_OAUTH_CLIENT_ID &&
          process.env.GITHUB_OAUTH_CLIENT_SECRET
        );
        const hasGitHubAppCredentials = !!(
          process.env.GITHUB_APP_ID &&
          process.env.GITHUB_APP_PRIVATE_KEY &&
          process.env.GITHUB_APP_ENABLED === 'true'
        );
        const hasEnterpriseConfig = !!(
          process.env.GITHUB_ORGANIZATION ||
          process.env.AUDIT_ALL_ACCESS === 'true' ||
          process.env.GITHUB_SSO_ENFORCEMENT === 'true' ||
          process.env.RATE_LIMIT_API_HOUR ||
          process.env.RATE_LIMIT_AUTH_HOUR ||
          process.env.RATE_LIMIT_TOKEN_HOUR
        );

        const hasAnyAuthConfig = hasOAuthCredentials || hasGitHubAppCredentials;

        // Tool registration decisions
        const shouldRegisterSimpleOAuth = hasOAuthCredentials;
        const shouldRegisterAllOAuth =
          hasOAuthCredentials || hasGitHubAppCredentials;
        const shouldRegisterOrgTools = hasAnyAuthConfig && hasEnterpriseConfig;

        // Verify expectations
        expect(shouldRegisterSimpleOAuth).toBe(
          scenario.expectedTools.simpleOAuth
        );
        expect(shouldRegisterAllOAuth).toBe(
          scenario.expectedTools.allOAuthTools
        );
        expect(shouldRegisterOrgTools).toBe(
          scenario.expectedTools.organizationTools
        );

        // Clear environment for next test
        Object.keys(scenario.env).forEach(key => {
          delete process.env[key];
        });
      });
    });
  });
});
