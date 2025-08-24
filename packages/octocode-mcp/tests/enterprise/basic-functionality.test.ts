/**
 * Basic tests for enterprise functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Mock all tool registration functions
vi.mock('../../src/mcp/tools/github_search_code.js');
vi.mock('../../src/mcp/tools/github_fetch_content.js');
vi.mock('../../src/mcp/tools/github_search_repos.js');
vi.mock('../../src/mcp/tools/github_search_commits.js');
vi.mock('../../src/mcp/tools/github_search_pull_requests.js');
vi.mock('../../src/mcp/tools/package_search/package_search.js');
vi.mock('../../src/mcp/tools/github_view_repo_structure.js');

// Import the mocked functions
import { registerGitHubSearchCodeTool } from '../../src/mcp/tools/github_search_code.js';
import { registerFetchGitHubFileContentTool } from '../../src/mcp/tools/github_fetch_content.js';
import { registerSearchGitHubReposTool } from '../../src/mcp/tools/github_search_repos.js';
import { registerSearchGitHubCommitsTool } from '../../src/mcp/tools/github_search_commits.js';
import { registerSearchGitHubPullRequestsTool } from '../../src/mcp/tools/github_search_pull_requests.js';
import { registerPackageSearchTool } from '../../src/mcp/tools/package_search/package_search.js';
import { registerViewGitHubRepoStructureTool } from '../../src/mcp/tools/github_view_repo_structure.js';

const mockRegisterGitHubSearchCodeTool = vi.mocked(
  registerGitHubSearchCodeTool
);
const mockRegisterFetchGitHubFileContentTool = vi.mocked(
  registerFetchGitHubFileContentTool
);
const mockRegisterSearchGitHubReposTool = vi.mocked(
  registerSearchGitHubReposTool
);
const mockRegisterSearchGitHubCommitsTool = vi.mocked(
  registerSearchGitHubCommitsTool
);
const mockRegisterSearchGitHubPullRequestsTool = vi.mocked(
  registerSearchGitHubPullRequestsTool
);
const mockRegisterPackageSearchTool = vi.mocked(registerPackageSearchTool);
const mockRegisterViewGitHubRepoStructureTool = vi.mocked(
  registerViewGitHubRepoStructureTool
);

describe('Enterprise Functionality', () => {
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    originalEnv = {
      GITHUB_TOKEN: process.env.GITHUB_TOKEN,
      GITHUB_ORGANIZATION: process.env.GITHUB_ORGANIZATION,
      AUDIT_ALL_ACCESS: process.env.AUDIT_ALL_ACCESS,
      RATE_LIMIT_API_HOUR: process.env.RATE_LIMIT_API_HOUR,
    };

    // Clear all mocks
    vi.clearAllMocks();

    // Set up mocks to not throw errors
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockRegisterGitHubSearchCodeTool.mockImplementation(() => ({}) as any);
    mockRegisterFetchGitHubFileContentTool.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      () => ({}) as any
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockRegisterSearchGitHubReposTool.mockImplementation(() => ({}) as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockRegisterSearchGitHubCommitsTool.mockImplementation(() => ({}) as any);
    mockRegisterSearchGitHubPullRequestsTool.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      () => ({}) as any
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockRegisterPackageSearchTool.mockImplementation(() => ({}) as any);
    mockRegisterViewGitHubRepoStructureTool.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      () => ({}) as any
    );
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

  it('should export authentication manager', async () => {
    const { AuthenticationManager } = await import(
      '../../src/auth/authenticationManager'
    );
    expect(typeof AuthenticationManager.getInstance).toBe('function');
    expect(typeof AuthenticationManager.getInstance().initialize).toBe(
      'function'
    );
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

    const { registerTools } = await import(
      '../../src/mcp/tools/toolsets/toolsetManager'
    );

    const mockServer = {
      setRequestHandler: vi.fn(),
    };

    const config = {
      serverConfig: {
        enabledToolsets: [],
        githubHost: undefined,
        timeout: 30000,
        maxRetries: 3,
        version: '1.0.0',
        enableCommandLogging: false,
      },
      userConfig: {},
    };

    // Capture stderr output
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    const result = registerTools(mockServer as unknown as McpServer, config);

    // Should show enterprise mode active message
    expect(stderrSpy).toHaveBeenCalledWith(
      '🔒 Enterprise mode active: auth tools enabled\n'
    );

    // Should have default tools registered
    expect(result.successCount).toBeGreaterThan(0);

    stderrSpy.mockRestore();
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

    expect(config.enterprise?.organizationId).toBe('test-org');
    expect(config.enterprise?.auditLogging).toBe(true);
    expect(config.enterprise?.rateLimiting).toBe(true);
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
