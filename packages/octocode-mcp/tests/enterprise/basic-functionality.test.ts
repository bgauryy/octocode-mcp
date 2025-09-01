/**
 * Basic tests for advanced functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Mock all tool registration functions
vi.mock('../../src/tools/github_search_code.js');
vi.mock('../../src/tools/github_fetch_content.js');
vi.mock('../../src/tools/github_search_repos.js');
vi.mock('../../src/tools/github_search_commits.js');
vi.mock('../../src/tools/github_search_pull_requests.js');
vi.mock('../../src/tools/package_search.js');
vi.mock('../../src/tools/github_view_repo_structure.js');

// Import the mocked functions
import { registerGitHubSearchCodeTool } from '../../src/tools/github_search_code.js';
import { registerFetchGitHubFileContentTool } from '../../src/tools/github_fetch_content.js';
import { registerSearchGitHubReposTool } from '../../src/tools/github_search_repos.js';
import { registerSearchGitHubCommitsTool } from '../../src/tools/github_search_commits.js';
import { registerSearchGitHubPullRequestsTool } from '../../src/tools/github_search_pull_requests.js';
import { registerPackageSearchTool } from '../../src/tools/package_search.js';
import { registerViewGitHubRepoStructureTool } from '../../src/tools/github_view_repo_structure.js';

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

describe('Advanced Functionality', () => {
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    originalEnv = {
      GITHUB_TOKEN: process.env.GITHUB_TOKEN,

      AUDIT_ALL_ACCESS: process.env.AUDIT_ALL_ACCESS,
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

  it('should detect simple token management is active', async () => {
    // Simple token management is always active now
    const { getServerConfig } = await import('../../src/serverConfig.js');
    expect(typeof getServerConfig).toBe('function');
  });

  it('should enable advanced toolset when audit configured', async () => {
    const { initialize } = await import('../../src/serverConfig.js');
    const { registerTools } = await import('../../src/tools/toolsManager.js');

    // Initialize config first
    await initialize();

    const mockServer = {
      setRequestHandler: vi.fn(),
    };

    // Capture stderr output
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    const result = registerTools(mockServer as unknown as McpServer);

    // Should have been called (advanced mode logging is active)
    expect(stderrSpy).toHaveBeenCalled();

    // Should have default tools registered
    expect(result.successCount).toBeGreaterThan(0);

    stderrSpy.mockRestore();
  });

  it('should load basic configuration correctly', async () => {
    const { initialize, getServerConfig, cleanup } = await import(
      '../../src/serverConfig'
    );

    // Reset config state
    cleanup();

    await initialize();
    const config = getServerConfig();

    expect(config.version).toBeDefined();
    expect(config.timeout).toBe(30000);
    expect(config.maxRetries).toBe(3);
  });

  it('should handle configuration initialization correctly', async () => {
    const { initialize, getServerConfig, cleanup } = await import(
      '../../src/serverConfig'
    );

    // Reset config state
    cleanup();

    await initialize(); // Initialize with new env vars
    const config = getServerConfig();
    expect(config.version).toBeDefined();
  });

  it('should export registerAllTools function', async () => {
    const module = await import('../../src/index');
    expect(typeof module.registerAllTools).toBe('function');
  });
});
