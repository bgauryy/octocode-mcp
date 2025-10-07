import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

const mockFetchGitHubFileContentAPI = vi.hoisted(() => vi.fn());

vi.mock('../../src/github/index.js', () => ({
  fetchGitHubFileContentAPI: mockFetchGitHubFileContentAPI,
}));

const mockInitialize = vi.hoisted(() => vi.fn());
const mockGetServerConfig = vi.hoisted(() => vi.fn());
const mockIsSamplingEnabled = vi.hoisted(() => vi.fn());

vi.mock('../../src/serverConfig.js', () => ({
  initialize: mockInitialize,
  getServerConfig: mockGetServerConfig,
  isSamplingEnabled: mockIsSamplingEnabled,
  isLoggingEnabled: vi.fn(() => false),
}));

const mockPerformSampling = vi.hoisted(() => vi.fn());
const mockCreateQASamplingRequest = vi.hoisted(() => vi.fn());

vi.mock('../../src/sampling.js', () => ({
  SamplingUtils: {
    createQASamplingRequest: mockCreateQASamplingRequest,
  },
  performSampling: mockPerformSampling,
}));

import { registerFetchGitHubFileContentTool } from '../../src/tools/github_fetch_content.js';

describe('GitHub Fetch Content Tool', () => {
  let mockServer: MockMcpServer;

  beforeEach(() => {
    mockServer = createMockMcpServer();
    vi.clearAllMocks();

    // Mock server configuration
    mockGetServerConfig.mockReturnValue({
      version: '4.0.5',
      enableTools: [],
      disableTools: [],
      enableLogging: false,
      betaEnabled: false,
      timeout: 30000,
      maxRetries: 3,
      loggingEnabled: true,
    });
    mockInitialize.mockResolvedValue(undefined);
    mockIsSamplingEnabled.mockReturnValue(false);

    // Reset sampling mocks
    mockPerformSampling.mockReset();
    mockCreateQASamplingRequest.mockReset();

    registerFetchGitHubFileContentTool(mockServer.server);
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
  });

  describe('Success scenarios', () => {
    it('should handle single valid file request', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          repository: 'test/repo',
          path: 'README.md',
          branch: 'main',
          content: '# Hello World\n\nThis is a test file.',
          contentLength: 35,
          minified: false,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'README.md',
            branch: 'main',
            id: 'test-query',
          },
        ],
      });

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]?.type).toBe('text');

      const responseText = result.content[0]?.text as string;
      expect(responseText).toEqual(`hints:
  - "Query results: 1 successful"
  - "Review hints for each query category, response hints, and researchSuggestions to improve your research strategy and refine follow-up queries"
data:
  hints:
    successful:
      - "Analyze top results in depth before expanding search"
      - "Cross-reference findings across multiple sources"
      - "Prefer partial reads for token efficiency"
      - "When readability matters (e.g., JSON/Markdown), consider minified: false"
      - "Use matchString from code search text_matches and increase matchStringContextLines if needed"
      - "Chain tools: repository search → structure view → code search → content fetch"
      - "Compare implementations across 3-5 repositories to identify best practices"
      - "Examine imports/exports to understand dependencies and usage"
  queries:
    successful:
      - path: "README.md"
        contentLength: 35
        content: "# Hello World\\n\\nThis is a test file."
        branch: "main"
        minified: false
        repository: "test/repo"
`);
    });

    it('should pass authInfo and userContext to GitHub API', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          path: 'test.js',
          repository: 'testowner/testrepo',
          branch: 'main',
          content: 'console.log("test");',
          contentLength: 1,
          minified: false,
        },
        status: 200,
      });

      await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'testowner',
            repo: 'testrepo',
            path: 'test.js',
            branch: 'main',
            id: 'auth-test-query',
          },
        ],
      });

      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledTimes(1);
      const apiCall = mockFetchGitHubFileContentAPI.mock.calls[0];

      expect(apiCall).toEqual([
        expect.objectContaining({
          owner: 'testowner',
          repo: 'testrepo',
          path: 'test.js',
          branch: 'main',
        }),
        undefined,
        undefined,
      ]);
    });

    it('should handle multiple file requests', async () => {
      mockFetchGitHubFileContentAPI
        .mockResolvedValueOnce({
          data: {
            path: 'README.md',
            owner: 'test',
            repo: 'repo',
            branch: 'main',
            content: '# README',
            contentLength: 1,
          },
          status: 200,
        })
        .mockResolvedValueOnce({
          data: {
            path: 'package.json',
            owner: 'test',
            repo: 'repo',
            branch: 'main',
            content: '{"name": "test"}',
            contentLength: 1,
          },
          status: 200,
        });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'README.md',
            id: 'readme',
          },
          {
            owner: 'test',
            repo: 'repo',
            path: 'package.json',
            id: 'package',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toEqual(`hints:
  - "Query results: 2 successful"
  - "Review hints for each query category, response hints, and researchSuggestions to improve your research strategy and refine follow-up queries"
data:
  hints:
    successful:
      - "Analyze top results in depth before expanding search"
      - "Cross-reference findings across multiple sources"
      - "Prefer partial reads for token efficiency"
      - "When readability matters (e.g., JSON/Markdown), consider minified: false"
      - "Use matchString from code search text_matches and increase matchStringContextLines if needed"
      - "Chain tools: repository search → structure view → code search → content fetch"
      - "Compare implementations across 3-5 repositories to identify best practices"
      - "Examine imports/exports to understand dependencies and usage"
  queries:
    successful:
      - owner: "test"
        repo: "repo"
        path: "README.md"
        contentLength: 1
        content: "# README"
        branch: "main"
      - owner: "test"
        repo: "repo"
        path: "package.json"
        contentLength: 1
        content: "{\\"name\\": \\"test\\"}"
        branch: "main"
`);
    });
  });

  describe('Error scenarios', () => {
    it('should handle file not found error', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        error: 'Repository, resource, or path not found',
        status: 404,
        type: 'http',
        hints: ['Verify the file path, repository name, and branch exist.'],
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'nonexistent.md',
            id: 'error-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toEqual(`hints:
  - "Query results: 1 failed"
  - "Review hints for each query category, response hints, and researchSuggestions to improve your research strategy and refine follow-up queries"
data:
  hints:
    failed:
      - "Resource not found. Verify spelling and accessibility"
      - "Verify repository owner, name, and file path are correct"
      - "Check that the branch exists (try \\"main\\" or \\"master\\")"
      - "Use github_view_repo_structure first to find correct file paths"
      - "Chain tools: repository search → structure view → code search → content fetch"
      - "Compare implementations across 3-5 repositories to identify best practices"
      - "Examine imports/exports to understand dependencies and usage"
  queries:
    failed:
      - error: "Repository, resource, or path not found"
        metadata:
          originalQuery:
            owner: "test"
            repo: "repo"
            path: "nonexistent.md"
            id: "error-test"
`);
    });

    it('should handle API exception', async () => {
      mockFetchGitHubFileContentAPI.mockRejectedValue(
        new Error('Network error')
      );

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'test.md',
            id: 'exception-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toEqual(`hints:
  - "Query results: 1 failed"
  - "Review hints for each query category, response hints, and researchSuggestions to improve your research strategy and refine follow-up queries"
data:
  hints:
    failed:
      - "Network error. Check connection and retry"
      - "Verify repository owner, name, and file path are correct"
      - "Check that the branch exists (try \\"main\\" or \\"master\\")"
      - "Use github_view_repo_structure first to find correct file paths"
      - "Chain tools: repository search → structure view → code search → content fetch"
      - "Compare implementations across 3-5 repositories to identify best practices"
      - "Examine imports/exports to understand dependencies and usage"
  queries:
    failed:
      - error: "Network error"
        metadata:
          originalQuery:
            owner: "test"
            repo: "repo"
            path: "test.md"
            id: "exception-test"
`);
    });
  });

  describe('Full Content Fetching', () => {
    it('should fetch full content when fullContent=true', async () => {
      const fullFileContent = `# Full File Content
This is a complete file with multiple lines.
It has various sections and content.

## Section 1
Some content here.

## Section 2
More content here.

## Conclusion
End of file.`;

      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          path: 'README.md',
          repository: 'test/repo',
          branch: 'main',
          content: fullFileContent,
          contentLength: 12,
          minified: false,
          isPartial: undefined,
          startLine: undefined,
          endLine: undefined,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'README.md',
            fullContent: true,
            id: 'full-content-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toEqual(`hints:
  - "Query results: 1 successful"
  - "Review hints for each query category, response hints, and researchSuggestions to improve your research strategy and refine follow-up queries"
data:
  hints:
    successful:
      - "Analyze top results in depth before expanding search"
      - "Cross-reference findings across multiple sources"
      - "Prefer partial reads for token efficiency"
      - "When readability matters (e.g., JSON/Markdown), consider minified: false"
      - "Use matchString from code search text_matches and increase matchStringContextLines if needed"
      - "Chain tools: repository search → structure view → code search → content fetch"
      - "Compare implementations across 3-5 repositories to identify best practices"
      - "Examine imports/exports to understand dependencies and usage"
  queries:
    successful:
      - path: "README.md"
        contentLength: 12
        content: "# Full File Content\\nThis is a complete file with multiple lines.\\nIt has various sections and content.\\n\\n## Section 1\\nSome content here.\\n\\n## Section 2\\nMore content here.\\n\\n## Conclusion\\nEnd of file."
        branch: "main"
        minified: false
        repository: "test/repo"
`);

      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          fullContent: true,
          startLine: undefined,
          endLine: undefined,
          matchString: undefined,
        }),
        undefined,
        undefined
      );
    });

    it('should ignore other parameters when fullContent=true', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          path: 'test.js',
          repository: 'test/repo',
          branch: 'main',
          content: 'Full file content should be returned',
          contentLength: 1,
          minified: false,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'test.js',
            fullContent: true,
            startLine: 5, // Should be ignored
            endLine: 10, // Should be ignored
            matchString: 'function', // Should be ignored
            id: 'ignore-params-test',
          },
        ],
      });

      expect(result.isError).toBe(false);

      // Verify API was called with fullContent=true and other params as undefined
      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          fullContent: true,
          startLine: undefined,
          endLine: undefined,
          matchString: undefined,
        }),
        undefined,
        undefined
      );
    });
  });

  describe('Partial Content Fetching', () => {
    it('should fetch content with startLine and endLine', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          path: 'src/index.js',
          repository: 'test/repo',
          branch: 'main',
          content: 'line 5\nline 6\nline 7',
          contentLength: 20,
          isPartial: true,
          startLine: 5,
          endLine: 7,
          minified: false,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'src/index.js',
            startLine: 5,
            endLine: 7,
            id: 'partial-lines-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toEqual(`hints:
  - "Query results: 1 successful"
  - "Review hints for each query category, response hints, and researchSuggestions to improve your research strategy and refine follow-up queries"
data:
  hints:
    successful:
      - "Analyze top results in depth before expanding search"
      - "Cross-reference findings across multiple sources"
      - "Prefer partial reads for token efficiency"
      - "When readability matters (e.g., JSON/Markdown), consider minified: false"
      - "Use matchString from code search text_matches and increase matchStringContextLines if needed"
      - "Chain tools: repository search → structure view → code search → content fetch"
      - "Compare implementations across 3-5 repositories to identify best practices"
      - "Examine imports/exports to understand dependencies and usage"
  queries:
    successful:
      - path: "src/index.js"
        contentLength: 20
        content: "line 5\\nline 6\\nline 7"
        branch: "main"
        startLine: 5
        endLine: 7
        isPartial: true
        minified: false
        repository: "test/repo"
`);

      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          fullContent: false,
          startLine: 5,
          endLine: 7,
          matchString: undefined,
        }),
        undefined,
        undefined
      );
    });

    it('should fetch content with matchString and context', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          path: 'src/utils.js',
          repository: 'test/repo',
          branch: 'main',
          content:
            'function helper() {\n  return true;\n}\n\nfunction main() {\n  return helper();\n}',
          contentLength: 50,
          isPartial: true,
          startLine: 8,
          endLine: 14,
          minified: false,
          securityWarnings: ['Found "function main" on line 11'],
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'src/utils.js',
            matchString: 'function main',
            matchStringContextLines: 3,
            id: 'match-string-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toEqual(`hints:
  - "Query results: 1 successful"
  - "Review hints for each query category, response hints, and researchSuggestions to improve your research strategy and refine follow-up queries"
data:
  hints:
    successful:
      - "Analyze top results in depth before expanding search"
      - "Cross-reference findings across multiple sources"
      - "Prefer partial reads for token efficiency"
      - "When readability matters (e.g., JSON/Markdown), consider minified: false"
      - "Use matchString from code search text_matches and increase matchStringContextLines if needed"
      - "Chain tools: repository search → structure view → code search → content fetch"
      - "Compare implementations across 3-5 repositories to identify best practices"
      - "Examine imports/exports to understand dependencies and usage"
  queries:
    successful:
      - path: "src/utils.js"
        contentLength: 50
        content: "function helper() {\\n  return true;\\n}\\n\\nfunction main() {\\n  return helper();\\n}"
        branch: "main"
        startLine: 8
        endLine: 14
        isPartial: true
        minified: false
        securityWarnings:
          - "Found \\"function main\\" on line 11"
        repository: "test/repo"
`);

      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          fullContent: false,
          matchString: 'function main',
          matchStringContextLines: 3,
          startLine: undefined,
          endLine: undefined,
        }),
        undefined,
        undefined
      );
    });

    it('should use default matchStringContextLines when not specified', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          path: 'test.py',
          repository: 'test/repo',
          branch: 'main',
          content: 'def test_function():\n    pass',
          contentLength: 10,
          isPartial: true,
          startLine: 1,
          endLine: 10,
          minified: false,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'test.py',
            matchString: 'def test_function',
            id: 'default-context-test',
          },
        ],
      });

      expect(result.isError).toBe(false);

      // Verify API was called with default matchStringContextLines=5
      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          matchString: 'def test_function',
          matchStringContextLines: 5, // Default value
        }),
        undefined,
        undefined
      );
    });
  });

  describe('Minification', () => {
    it('should apply minification when minified=true', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          path: 'src/app.js',
          repository: 'test/repo',
          branch: 'main',
          content: 'const app=()=>{return"Hello"};',
          contentLength: 1,
          minified: true,
          minificationType: 'terser',
          minificationFailed: false,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'src/app.js',
            minified: true,
            id: 'minified-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toEqual(`hints:
  - "Query results: 1 successful"
  - "Review hints for each query category, response hints, and researchSuggestions to improve your research strategy and refine follow-up queries"
data:
  hints:
    successful:
      - "Analyze top results in depth before expanding search"
      - "Cross-reference findings across multiple sources"
      - "Prefer partial reads for token efficiency"
      - "When readability matters (e.g., JSON/Markdown), consider minified: false"
      - "Use matchString from code search text_matches and increase matchStringContextLines if needed"
      - "Chain tools: repository search → structure view → code search → content fetch"
      - "Compare implementations across 3-5 repositories to identify best practices"
      - "Examine imports/exports to understand dependencies and usage"
  queries:
    successful:
      - path: "src/app.js"
        contentLength: 1
        content: "const app=()=>{return\\"Hello\\"};"
        branch: "main"
        minified: true
        minificationFailed: false
        minificationType: "terser"
        repository: "test/repo"
`);

      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          minified: true,
        }),
        undefined,
        undefined
      );
    });

    it('should not apply minification when minified=false', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          path: 'src/readable.js',
          repository: 'test/repo',
          branch: 'main',
          content: 'const app = () => {\n  return "Hello World";\n};',
          contentLength: 37,
          minified: false,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'src/readable.js',
            minified: false,
            id: 'not-minified-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toEqual(`hints:
  - "Query results: 1 successful"
  - "Review hints for each query category, response hints, and researchSuggestions to improve your research strategy and refine follow-up queries"
data:
  hints:
    successful:
      - "Analyze top results in depth before expanding search"
      - "Cross-reference findings across multiple sources"
      - "Prefer partial reads for token efficiency"
      - "When readability matters (e.g., JSON/Markdown), consider minified: false"
      - "Use matchString from code search text_matches and increase matchStringContextLines if needed"
      - "Chain tools: repository search → structure view → code search → content fetch"
      - "Compare implementations across 3-5 repositories to identify best practices"
      - "Examine imports/exports to understand dependencies and usage"
  queries:
    successful:
      - path: "src/readable.js"
        contentLength: 37
        content: "const app = () => {\\n  return \\"Hello World\\";\\n};"
        branch: "main"
        minified: false
        repository: "test/repo"
`);

      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          minified: false,
        }),
        undefined,
        undefined
      );
    });

    it('should handle minification failure gracefully', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          path: 'src/broken.js',
          repository: 'test/repo',
          branch: 'main',
          content: 'const broken = () => { // Syntax error',
          contentLength: 1,
          minified: false,
          minificationType: 'failed',
          minificationFailed: true,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'src/broken.js',
            minified: true,
            id: 'minification-failed-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toEqual(`hints:
  - "Query results: 1 successful"
  - "Review hints for each query category, response hints, and researchSuggestions to improve your research strategy and refine follow-up queries"
data:
  hints:
    successful:
      - "Analyze top results in depth before expanding search"
      - "Cross-reference findings across multiple sources"
      - "Prefer partial reads for token efficiency"
      - "When readability matters (e.g., JSON/Markdown), consider minified: false"
      - "Use matchString from code search text_matches and increase matchStringContextLines if needed"
      - "Chain tools: repository search → structure view → code search → content fetch"
      - "Compare implementations across 3-5 repositories to identify best practices"
      - "Examine imports/exports to understand dependencies and usage"
  queries:
    successful:
      - path: "src/broken.js"
        contentLength: 1
        content: "const broken = () => { // Syntax error"
        branch: "main"
        minified: false
        minificationFailed: true
        minificationType: "failed"
        repository: "test/repo"
`);
    });
  });

  describe('Security and Sanitization', () => {
    it('should sanitize content and provide security warnings', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          path: 'config.env',
          repository: 'test/repo',
          branch: 'main',
          content: 'API_KEY=[REDACTED]\nDATABASE_URL=[REDACTED]',
          contentLength: 2,
          minified: false,
          securityWarnings: [
            'Secrets detected and redacted: API_KEY, DATABASE_URL',
            'Potentially sensitive configuration file detected',
          ],
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'config.env',
            sanitize: true,
            id: 'security-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toEqual(`hints:
  - "Query results: 1 successful"
  - "Review hints for each query category, response hints, and researchSuggestions to improve your research strategy and refine follow-up queries"
data:
  hints:
    successful:
      - "Analyze top results in depth before expanding search"
      - "Cross-reference findings across multiple sources"
      - "Prefer partial reads for token efficiency"
      - "When readability matters (e.g., JSON/Markdown), consider minified: false"
      - "Use matchString from code search text_matches and increase matchStringContextLines if needed"
      - "Chain tools: repository search → structure view → code search → content fetch"
      - "Compare implementations across 3-5 repositories to identify best practices"
      - "Examine imports/exports to understand dependencies and usage"
  queries:
    successful:
      - path: "config.env"
        contentLength: 2
        content: "API_KEY=[REDACTED]\\nDATABASE_URL=[REDACTED]"
        branch: "main"
        minified: false
        securityWarnings:
          - "Secrets detected and redacted: API_KEY, DATABASE_URL"
          - "Potentially sensitive configuration file detected"
        repository: "test/repo"
`);

      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          sanitize: true,
        }),
        undefined,
        undefined
      );
    });

    it('should handle sanitize=false parameter', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          path: 'public.js',
          repository: 'test/repo',
          branch: 'main',
          content: 'console.log("Public content");',
          contentLength: 1,
          minified: false,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'public.js',
            sanitize: false,
            id: 'no-sanitize-test',
          },
        ],
      });

      expect(result.isError).toBe(false);

      // Verify API was called with sanitize=false
      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          sanitize: false,
        }),
        undefined,
        undefined
      );
    });
  });

  describe('Sampling Feature', () => {
    beforeEach(() => {
      mockIsSamplingEnabled.mockReturnValue(true);
    });

    afterEach(() => {
      mockIsSamplingEnabled.mockReturnValue(false);
    });

    it('should include sampling when enabled and content is available', async () => {
      mockCreateQASamplingRequest.mockReturnValue({
        method: 'sampling/createMessage',
        params: { messages: [] },
      });

      mockPerformSampling.mockResolvedValue({
        content:
          'This is a JavaScript utility function that exports a helper method.',
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
        stopReason: 'stop',
      });

      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          path: 'utils.js',
          repository: 'test/repo',
          branch: 'main',
          content: 'export const helper = () => true;',
          contentLength: 1,
          minified: false,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'utils.js',
            id: 'sampling-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      // Note: Sampling response structure includes nested sampling field and additional _samplingRequest
      expect(responseText).toContain('path: "utils.js"');
      expect(responseText).toContain('contentLength: 1');
      expect(responseText).toContain(
        'content: "export const helper = () => true;"'
      );
      expect(responseText).toContain(
        'codeExplanation: "This is a JavaScript utility function that exports a helper method."'
      );
      expect(responseText).toContain('completionTokens: 50');
      expect(responseText).toContain('promptTokens: 100');
      expect(responseText).toContain('totalTokens: 150');
    });

    it('should handle sampling failure gracefully', async () => {
      mockCreateQASamplingRequest.mockReturnValue({
        method: 'sampling/createMessage',
        params: { messages: [] },
      });

      mockPerformSampling.mockRejectedValue(new Error('Sampling failed'));

      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          path: 'test.js',
          repository: 'test/repo',
          branch: 'main',
          content: 'console.log("test");',
          contentLength: 1,
          minified: false,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'test.js',
            id: 'sampling-failure-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toEqual(`hints:
  - "Query results: 1 successful"
  - "Review hints for each query category, response hints, and researchSuggestions to improve your research strategy and refine follow-up queries"
data:
  hints:
    successful:
      - "Analyze top results in depth before expanding search"
      - "Cross-reference findings across multiple sources"
      - "Prefer partial reads for token efficiency"
      - "When readability matters (e.g., JSON/Markdown), consider minified: false"
      - "Use matchString from code search text_matches and increase matchStringContextLines if needed"
      - "Chain tools: repository search → structure view → code search → content fetch"
      - "Compare implementations across 3-5 repositories to identify best practices"
      - "Examine imports/exports to understand dependencies and usage"
  queries:
    successful:
      - path: "test.js"
        contentLength: 1
        content: "console.log(\\"test\\");"
        branch: "main"
        minified: false
        repository: "test/repo"
`);
    });
  });

  describe('Branch and Repository Handling', () => {
    it('should handle custom branch parameter', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          path: 'feature.js',
          repository: 'test/repo',
          branch: 'feature-branch',
          content: 'const feature = "new feature";',
          contentLength: 1,
          minified: false,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'feature.js',
            branch: 'feature-branch',
            id: 'branch-test',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toEqual(`hints:
  - "Query results: 1 successful"
  - "Review hints for each query category, response hints, and researchSuggestions to improve your research strategy and refine follow-up queries"
data:
  hints:
    successful:
      - "Analyze top results in depth before expanding search"
      - "Cross-reference findings across multiple sources"
      - "Prefer partial reads for token efficiency"
      - "When readability matters (e.g., JSON/Markdown), consider minified: false"
      - "Use matchString from code search text_matches and increase matchStringContextLines if needed"
      - "Chain tools: repository search → structure view → code search → content fetch"
      - "Compare implementations across 3-5 repositories to identify best practices"
      - "Examine imports/exports to understand dependencies and usage"
  queries:
    successful:
      - path: "feature.js"
        contentLength: 1
        content: "const feature = \\"new feature\\";"
        branch: "feature-branch"
        minified: false
        repository: "test/repo"
`);

      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          branch: 'feature-branch',
        }),
        undefined,
        undefined
      );
    });

    it('should handle missing branch (defaults to main/master)', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          path: 'main.js',
          repository: 'test/repo',
          branch: 'main',
          content: 'const main = "main branch";',
          contentLength: 1,
          minified: false,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'main.js',
            id: 'no-branch-test',
          },
        ],
      });

      expect(result.isError).toBe(false);

      // Verify API was called with branch as undefined (will use default)
      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          branch: undefined,
        }),
        undefined,
        undefined
      );
    });
  });

  describe('Mixed Success and Error Scenarios', () => {
    it('should handle mixed success and error results in bulk queries', async () => {
      mockFetchGitHubFileContentAPI
        .mockResolvedValueOnce({
          data: {
            path: 'success.js',
            owner: 'test',
            repo: 'repo',
            branch: 'main',
            content: 'const success = true;',
            contentLength: 1,
            minified: false,
          },
          status: 200,
        })
        .mockResolvedValueOnce({
          error: 'File not found',
          status: 404,
          type: 'http',
        })
        .mockRejectedValueOnce(new Error('Network timeout'));

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'success.js',
            id: 'success-query',
          },
          {
            owner: 'test',
            repo: 'repo',
            path: 'missing.js',
            id: 'error-query',
          },
          {
            owner: 'test',
            repo: 'repo',
            path: 'timeout.js',
            id: 'exception-query',
          },
        ],
      });

      expect(result.isError).toBe(false);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toEqual(`hints:
  - "Query results: 1 successful, 2 failed"
  - "Review hints for each query category, response hints, and researchSuggestions to improve your research strategy and refine follow-up queries"
data:
  hints:
    failed:
      - "Resource not found. Verify spelling and accessibility"
      - "Verify repository owner, name, and file path are correct"
      - "Check that the branch exists (try \\"main\\" or \\"master\\")"
      - "Use github_view_repo_structure first to find correct file paths"
      - "Chain tools: repository search → structure view → code search → content fetch"
      - "Compare implementations across 3-5 repositories to identify best practices"
      - "Examine imports/exports to understand dependencies and usage"
    successful:
      - "Analyze top results in depth before expanding search"
      - "Cross-reference findings across multiple sources"
      - "Prefer partial reads for token efficiency"
      - "When readability matters (e.g., JSON/Markdown), consider minified: false"
      - "Use matchString from code search text_matches and increase matchStringContextLines if needed"
      - "Chain tools: repository search → structure view → code search → content fetch"
      - "Compare implementations across 3-5 repositories to identify best practices"
      - "Examine imports/exports to understand dependencies and usage"
  queries:
    failed:
      - error: "File not found"
        metadata:
          originalQuery:
            owner: "test"
            repo: "repo"
            path: "missing.js"
            id: "error-query"
      - error: "Network timeout"
        metadata:
          originalQuery:
            owner: "test"
            repo: "repo"
            path: "timeout.js"
            id: "exception-query"
    successful:
      - owner: "test"
        repo: "repo"
        path: "success.js"
        contentLength: 1
        content: "const success = true;"
        branch: "main"
        minified: false
`);
    });
  });

  describe('Parameter Type Conversion', () => {
    it('should handle string numbers for line parameters', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          path: 'test.js',
          repository: 'test/repo',
          branch: 'main',
          content: 'line 5\nline 6',
          contentLength: 10,
          isPartial: true,
          startLine: 5,
          endLine: 6,
          minified: false,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'test.js',
            startLine: 5, // Should be converted to number
            endLine: 6, // Should be converted to number
            id: 'type-conversion-test',
          },
        ],
      });

      expect(result.isError).toBe(false);

      // Verify API was called with correct numeric parameters
      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          startLine: 5,
          endLine: 6,
        }),
        undefined,
        undefined
      );
    });

    it('should handle boolean parameters correctly', async () => {
      mockFetchGitHubFileContentAPI.mockResolvedValue({
        data: {
          path: 'test.js',
          repository: 'test/repo',
          branch: 'main',
          content: 'test content',
          contentLength: 1,
          minified: true,
        },
        status: 200,
      });

      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [
          {
            owner: 'test',
            repo: 'repo',
            path: 'test.js',
            fullContent: true,
            minified: true,
            sanitize: false,
            id: 'boolean-params-test',
          },
        ],
      });

      expect(result.isError).toBe(false);

      // Verify API was called with correct boolean parameters
      expect(mockFetchGitHubFileContentAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          fullContent: true,
          minified: true,
          sanitize: false,
        }),
        undefined,
        undefined
      );
    });
  });

  describe('Input validation', () => {
    it('should reject empty queries array', async () => {
      const result = await mockServer.callTool('githubGetFileContent', {
        queries: [],
      });

      expect(result.isError).toBe(true);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toEqual(`data:
  error: "Queries array is required and cannot be empty"
hints:
  - "Queries array is required and cannot be empty"
  - "Provide at least one valid query with required parameters"
`);
    });

    it('should reject missing queries parameter', async () => {
      const result = await mockServer.callTool('githubGetFileContent', {});

      expect(result.isError).toBe(true);
      const responseText = result.content[0]?.text as string;
      expect(responseText).toEqual(`data:
  error: "Queries array is required and cannot be empty"
hints:
  - "Queries array is required and cannot be empty"
  - "Provide at least one valid query with required parameters"
`);
    });
  });
});
