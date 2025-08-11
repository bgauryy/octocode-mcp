/**
 * Basic tests for enterprise functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Enterprise Functionality', () => {
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    originalEnv = {
      GITHUB_TOKEN: process.env.GITHUB_TOKEN,
      GITHUB_ORGANIZATION: process.env.GITHUB_ORGANIZATION,
      AUDIT_ALL_ACCESS: process.env.AUDIT_ALL_ACCESS,
      RATE_LIMIT_API_HOUR: process.env.RATE_LIMIT_API_HOUR,
    };
  });

  afterEach(() => {
    // Restore environment
    Object.keys(originalEnv).forEach(key => {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    });
  });

  it('should export enterprise initialization function', async () => {
    const module = await import('../../src/index');
    expect(typeof module.initializeEnterpriseFeatures).toBe('function');
  });

  it('should detect enterprise mode from environment variables', async () => {
    process.env.GITHUB_ORGANIZATION = 'test-org';
    process.env.AUDIT_ALL_ACCESS = 'true';
    process.env.RATE_LIMIT_API_HOUR = '1000';

    const { isEnterpriseTokenManager } = await import(
      '../../src/mcp/tools/utils/tokenManager'
    );
    expect(isEnterpriseTokenManager()).toBe(true);
  });

  it('should disable CLI token resolution in enterprise mode', async () => {
    process.env.GITHUB_ORGANIZATION = 'test-org';

    const { isCliTokenResolutionEnabled } = await import(
      '../../src/mcp/tools/utils/tokenManager'
    );
    expect(isCliTokenResolutionEnabled()).toBe(false);
  });

  it('should enable enterprise toolset when organization configured', async () => {
    process.env.GITHUB_ORGANIZATION = 'test-org';

    const { ToolsetManager } = await import(
      '../../src/mcp/tools/toolsets/toolsetManager'
    );
    ToolsetManager.initialize(['all']);

    const enterpriseToolset = ToolsetManager.getEnabledToolsets().find(
      ts => ts.name === 'enterprise'
    );
    expect(enterpriseToolset?.enabled).toBe(true);
  });

  it('should load enterprise configuration correctly', async () => {
    process.env.GITHUB_ORGANIZATION = 'test-org';
    process.env.AUDIT_ALL_ACCESS = 'true';
    process.env.RATE_LIMIT_API_HOUR = '1000';

    const { ConfigManager } = await import('../../src/config/serverConfig');

    // Reset the singleton state to force re-initialization
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ConfigManager as any).initialized = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ConfigManager as any).config = null;

    const config = ConfigManager.initialize();

    expect(config.organizationId).toBe('test-org');
    expect(config.auditLogging).toBe(true);
    expect(config.rateLimiting).toBe(true);
    expect(ConfigManager.isEnterpriseMode()).toBe(true);
  });

  it('should handle GitHub Enterprise Server URL configuration', async () => {
    process.env.GITHUB_HOST = 'github.enterprise.com';

    const { ConfigManager } = await import('../../src/config/serverConfig');

    // Reset the singleton state to force re-initialization
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ConfigManager as any).initialized = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ConfigManager as any).config = null;

    ConfigManager.initialize(); // Initialize with new env vars
    const baseURL = ConfigManager.getGitHubBaseURL();
    expect(baseURL).toBe('https://github.enterprise.com/api/v3');
  });

  it('should export registerAllTools function', async () => {
    const module = await import('../../src/index');
    expect(typeof module.registerAllTools).toBe('function');
  });
});
