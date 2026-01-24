import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from '../../src/tools/toolsManager.js';

// Don't mock toolConfig - use real DEFAULT_TOOLS
vi.mock('../../src/serverConfig.js', () => ({
  getServerConfig: vi.fn(),
}));

vi.mock('../../src/tools/toolMetadata.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/tools/toolMetadata.js')
  >('../../src/tools/toolMetadata.js');
  return {
    ...actual,
    isToolInMetadata: vi.fn().mockReturnValue(true),
  };
});

vi.mock('../../src/session.js', () => ({
  logSessionError: vi.fn(),
}));

// Mock tool registration functions to just return successfully
vi.mock('../../src/tools/github_search_code/github_search_code.js', () => ({
  registerGitHubSearchCodeTool: vi.fn().mockReturnValue({}),
}));
vi.mock('../../src/tools/github_fetch_content/github_fetch_content.js', () => ({
  registerFetchGitHubFileContentTool: vi.fn().mockReturnValue({}),
}));
vi.mock('../../src/tools/github_search_repos/github_search_repos.js', () => ({
  registerSearchGitHubReposTool: vi.fn().mockReturnValue({}),
}));
vi.mock(
  '../../src/tools/github_search_pull_requests/github_search_pull_requests.js',
  () => ({
    registerSearchGitHubPullRequestsTool: vi.fn().mockReturnValue({}),
  })
);
vi.mock(
  '../../src/tools/github_view_repo_structure/github_view_repo_structure.js',
  () => ({
    registerViewGitHubRepoStructureTool: vi.fn().mockReturnValue({}),
  })
);
vi.mock('../../src/tools/package_search/package_search.js', () => ({
  registerPackageSearchTool: vi.fn().mockReturnValue({}),
}));

// Mock local tools - export registration functions used by toolConfig
vi.mock('../../src/tools/local_ripgrep/index.js', () => ({
  registerLocalRipgrepTool: vi.fn().mockReturnValue({}),
  searchContentRipgrep: vi.fn().mockResolvedValue({ status: 'hasResults' }),
}));
vi.mock('../../src/tools/local_view_structure/index.js', () => ({
  registerLocalViewStructureTool: vi.fn().mockReturnValue({}),
  viewStructure: vi.fn().mockResolvedValue({ status: 'hasResults' }),
}));
vi.mock('../../src/tools/local_find_files/index.js', () => ({
  registerLocalFindFilesTool: vi.fn().mockReturnValue({}),
  findFiles: vi.fn().mockResolvedValue({ status: 'hasResults' }),
}));
vi.mock('../../src/tools/local_fetch_content/index.js', () => ({
  registerLocalFetchContentTool: vi.fn().mockReturnValue({}),
  fetchContent: vi.fn().mockResolvedValue({ status: 'hasResults' }),
}));
vi.mock('../../src/utils/bulkOperations.js', () => ({
  executeBulkOperation: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'test' }],
  }),
}));

import { getServerConfig } from '../../src/serverConfig.js';

describe('Tool Count Verification', () => {
  const originalStderr = process.stderr.write;

  beforeEach(() => {
    vi.clearAllMocks();
    process.stderr.write = vi.fn();
  });

  afterEach(() => {
    process.stderr.write = originalStderr;
  });

  it('should register exactly 13 tools (6 GitHub + 4 Local + 3 LSP)', async () => {
    vi.mocked(getServerConfig).mockReturnValue({
      version: '1.0.0',
      githubApiUrl: 'https://api.github.com',
      enableLogging: true,
      timeout: 30000,
      maxRetries: 3,
      loggingEnabled: true,
      tokenSource: 'env:GITHUB_TOKEN',
    });

    const mockServer = {
      registerTool: vi.fn(),
    } as unknown as McpServer;

    const result = await registerTools(mockServer);

    // 6 GitHub + 4 Local + 3 LSP = 13 tools
    expect(result.successCount).toBe(13);
    expect(result.failedTools).toHaveLength(0);
  });
});
