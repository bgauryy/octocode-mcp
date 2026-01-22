/**
 * Integration test for local tools flow
 * Tests the complete path from ENABLE_LOCAL env var to tool registration
 * WITHOUT mocking the critical path (serverConfig → isLocalEnabled → toolsManager)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Only mock external dependencies, NOT the config flow
vi.mock('../../src/tools/toolMetadata.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/tools/toolMetadata.js')
  >('../../src/tools/toolMetadata.js');
  return {
    ...actual,
    // Mock metadata to return true for all tools (simulating API response)
    isToolInMetadata: vi.fn().mockReturnValue(true),
    TOOL_NAMES: actual.STATIC_TOOL_NAMES,
    DESCRIPTIONS: new Proxy(
      {},
      {
        get: () => 'Test description',
      }
    ),
  };
});

vi.mock('../../src/session.js', () => ({
  logSessionError: vi.fn(),
}));

vi.mock('../../src/utils/exec/index.js', () => ({
  getGithubCLIToken: vi.fn().mockResolvedValue(null),
}));

// Mock credentials to prevent file storage loading
vi.mock('../../src/utils/credentials/index.js', () => ({
  getOctocodeToken: vi.fn().mockResolvedValue(null),
}));

// Mock the actual tool registration functions to track calls
const mockLocalRipgrepRegister = vi.fn().mockReturnValue({});
const mockLocalViewStructureRegister = vi.fn().mockReturnValue({});
const mockLocalFindFilesRegister = vi.fn().mockReturnValue({});
const mockLocalFetchContentRegister = vi.fn().mockReturnValue({});
const mockGitHubSearchCodeRegister = vi.fn().mockReturnValue({});
const mockGitHubFetchContentRegister = vi.fn().mockReturnValue({});
const mockGitHubViewStructureRegister = vi.fn().mockReturnValue({});
const mockGitHubSearchReposRegister = vi.fn().mockReturnValue({});
const mockGitHubSearchPRsRegister = vi.fn().mockReturnValue({});
const mockPackageSearchRegister = vi.fn().mockReturnValue({});

vi.mock('../../src/tools/local_ripgrep/index.js', () => ({
  registerLocalRipgrepTool: mockLocalRipgrepRegister,
}));
vi.mock('../../src/tools/local_view_structure/index.js', () => ({
  registerLocalViewStructureTool: mockLocalViewStructureRegister,
}));
vi.mock('../../src/tools/local_find_files/index.js', () => ({
  registerLocalFindFilesTool: mockLocalFindFilesRegister,
}));
vi.mock('../../src/tools/local_fetch_content/index.js', () => ({
  registerLocalFetchContentTool: mockLocalFetchContentRegister,
}));
vi.mock('../../src/tools/github_search_code/github_search_code.js', () => ({
  registerGitHubSearchCodeTool: mockGitHubSearchCodeRegister,
}));
vi.mock('../../src/tools/github_fetch_content/github_fetch_content.js', () => ({
  registerFetchGitHubFileContentTool: mockGitHubFetchContentRegister,
}));
vi.mock(
  '../../src/tools/github_view_repo_structure/github_view_repo_structure.js',
  () => ({
    registerViewGitHubRepoStructureTool: mockGitHubViewStructureRegister,
  })
);
vi.mock('../../src/tools/github_search_repos/github_search_repos.js', () => ({
  registerSearchGitHubReposTool: mockGitHubSearchReposRegister,
}));
vi.mock(
  '../../src/tools/github_search_pull_requests/github_search_pull_requests.js',
  () => ({
    registerSearchGitHubPullRequestsTool: mockGitHubSearchPRsRegister,
  })
);
vi.mock('../../src/tools/package_search/package_search.js', () => ({
  registerPackageSearchTool: mockPackageSearchRegister,
}));

describe('Local Tools Flow Integration', () => {
  let mockServer: McpServer;
  const originalEnv = { ...process.env };
  const originalStderr = process.stderr.write;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset environment
    delete process.env.ENABLE_LOCAL;
    delete process.env.LOCAL;
    delete process.env.GITHUB_TOKEN;
    delete process.env.TOOLS_TO_RUN;
    delete process.env.ENABLE_TOOLS;
    delete process.env.DISABLE_TOOLS;

    // Reset serverConfig module state
    const { cleanup } = await import('../../src/serverConfig.js');
    cleanup();

    // Mock stderr
    process.stderr.write = vi.fn();

    // Mock server
    mockServer = {
      registerTool: vi.fn(),
    } as unknown as McpServer;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    process.stderr.write = originalStderr;
  });

  describe('ENABLE_LOCAL=true flow', () => {
    it('should register ALL 4 local tools when ENABLE_LOCAL=true', async () => {
      // Set environment BEFORE importing/initializing
      process.env.ENABLE_LOCAL = 'true';

      // Import fresh modules
      const { initialize, isLocalEnabled } =
        await import('../../src/serverConfig.js');
      const { registerTools } = await import('../../src/tools/toolsManager.js');

      // Initialize config (parses ENABLE_LOCAL)
      await initialize();

      // Verify isLocalEnabled returns true
      expect(isLocalEnabled()).toBe(true);

      // Register tools
      const result = await registerTools(mockServer);

      // Should register all 13 tools (6 GitHub + 4 local + 3 LSP)
      expect(result.successCount).toBe(13);
      expect(result.failedTools).toHaveLength(0);

      // Verify ALL local tools were registered
      expect(mockLocalRipgrepRegister).toHaveBeenCalledTimes(1);
      expect(mockLocalViewStructureRegister).toHaveBeenCalledTimes(1);
      expect(mockLocalFindFilesRegister).toHaveBeenCalledTimes(1);
      expect(mockLocalFetchContentRegister).toHaveBeenCalledTimes(1);

      // Verify GitHub tools were also registered
      expect(mockGitHubSearchCodeRegister).toHaveBeenCalledTimes(1);
      expect(mockGitHubFetchContentRegister).toHaveBeenCalledTimes(1);
      expect(mockGitHubViewStructureRegister).toHaveBeenCalledTimes(1);
      expect(mockGitHubSearchReposRegister).toHaveBeenCalledTimes(1);
      expect(mockGitHubSearchPRsRegister).toHaveBeenCalledTimes(1);
      expect(mockPackageSearchRegister).toHaveBeenCalledTimes(1);
    });

    it('should register local tools when LOCAL=true (fallback)', async () => {
      process.env.LOCAL = 'true';

      const { initialize, isLocalEnabled, cleanup } =
        await import('../../src/serverConfig.js');
      cleanup(); // Reset state
      const { registerTools } = await import('../../src/tools/toolsManager.js');

      await initialize();

      expect(isLocalEnabled()).toBe(true);

      const result = await registerTools(mockServer);

      // All local tools should be registered
      expect(mockLocalRipgrepRegister).toHaveBeenCalled();
      expect(mockLocalViewStructureRegister).toHaveBeenCalled();
      expect(mockLocalFindFilesRegister).toHaveBeenCalled();
      expect(mockLocalFetchContentRegister).toHaveBeenCalled();
      expect(result.successCount).toBe(13);
    });

    it('should register local tools when ENABLE_LOCAL=1', async () => {
      process.env.ENABLE_LOCAL = '1';

      const { initialize, isLocalEnabled, cleanup } =
        await import('../../src/serverConfig.js');
      cleanup();
      const { registerTools } = await import('../../src/tools/toolsManager.js');

      await initialize();

      expect(isLocalEnabled()).toBe(true);

      const result = await registerTools(mockServer);
      expect(result.successCount).toBe(13);
    });
  });

  describe('ENABLE_LOCAL=false flow', () => {
    it('should NOT register local tools when ENABLE_LOCAL is not set', async () => {
      // Don't set ENABLE_LOCAL (defaults to false)

      const { initialize, isLocalEnabled, cleanup } =
        await import('../../src/serverConfig.js');
      cleanup();
      const { registerTools } = await import('../../src/tools/toolsManager.js');

      await initialize();

      // Verify isLocalEnabled returns false
      expect(isLocalEnabled()).toBe(false);

      const result = await registerTools(mockServer);

      // Should only register 6 GitHub tools
      expect(result.successCount).toBe(6);

      // Local tools should NOT be registered
      expect(mockLocalRipgrepRegister).not.toHaveBeenCalled();
      expect(mockLocalViewStructureRegister).not.toHaveBeenCalled();
      expect(mockLocalFindFilesRegister).not.toHaveBeenCalled();
      expect(mockLocalFetchContentRegister).not.toHaveBeenCalled();

      // GitHub tools should still be registered
      expect(mockGitHubSearchCodeRegister).toHaveBeenCalled();
    });

    it('should NOT register local tools when ENABLE_LOCAL=false', async () => {
      process.env.ENABLE_LOCAL = 'false';

      const { initialize, isLocalEnabled, cleanup } =
        await import('../../src/serverConfig.js');
      cleanup();
      const { registerTools } = await import('../../src/tools/toolsManager.js');

      await initialize();

      expect(isLocalEnabled()).toBe(false);

      const result = await registerTools(mockServer);

      expect(result.successCount).toBe(6); // Only GitHub tools
      expect(mockLocalRipgrepRegister).not.toHaveBeenCalled();
    });
  });

  describe('Tool names verification', () => {
    it('should use correct tool names from STATIC_TOOL_NAMES', async () => {
      const { STATIC_TOOL_NAMES } =
        await import('../../src/tools/toolMetadata.js');

      // Verify the expected tool names
      expect(STATIC_TOOL_NAMES.LOCAL_RIPGREP).toBe('localSearchCode');
      expect(STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT).toBe('localGetFileContent');
      expect(STATIC_TOOL_NAMES.LOCAL_FIND_FILES).toBe('localFindFiles');
      expect(STATIC_TOOL_NAMES.LOCAL_VIEW_STRUCTURE).toBe('localViewStructure');
    });

    it('should register tools with names matching API metadata', async () => {
      process.env.ENABLE_LOCAL = 'true';

      const { initialize, cleanup } = await import('../../src/serverConfig.js');
      cleanup();
      const { registerTools } = await import('../../src/tools/toolsManager.js');
      const { ALL_TOOLS } = await import('../../src/tools/toolConfig.js');

      await initialize();
      await registerTools(mockServer);

      // Get local tool names from ALL_TOOLS
      const localToolNames = ALL_TOOLS.filter(t => t.isLocal).map(t => t.name);

      // These should match what the API returns (4 local + 3 LSP = 7)
      expect(localToolNames).toContain('localSearchCode');
      expect(localToolNames).toContain('localGetFileContent');
      expect(localToolNames).toContain('localFindFiles');
      expect(localToolNames).toContain('localViewStructure');
      expect(localToolNames).toContain('lspGotoDefinition');
      expect(localToolNames).toContain('lspFindReferences');
      expect(localToolNames).toContain('lspCallHierarchy');
      expect(localToolNames).toHaveLength(7);
    });
  });
});
