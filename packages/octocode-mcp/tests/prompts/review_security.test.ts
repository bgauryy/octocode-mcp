import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerSecurityReviewPrompt,
  PROMPT_NAME,
} from '../../src/prompts/review_security.js';
import type { CompleteMetadata } from '../../src/tools/toolMetadata.js';

// Mock the session module
vi.mock('../../src/session.js', () => ({
  logPromptCall: vi.fn().mockResolvedValue(undefined),
}));

describe('review_security prompt', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockServer: any;
  let mockContent: CompleteMetadata;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let registeredHandler: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock server with registerPrompt
    mockServer = {
      registerPrompt: vi.fn((_name, _config, handler) => {
        registeredHandler = handler;
        return {
          name: _name,
          callback: handler,
          enabled: true,
          enable: vi.fn(),
          disable: vi.fn(),
          setEnabled: vi.fn(),
          update: vi.fn(),
          remove: vi.fn(),
          destroy: vi.fn(),
        };
      }),
    };

    // Mock content metadata
    mockContent = {
      instructions: 'Test instructions',
      prompts: {
        research: {
          name: 'Research',
          description: 'GitHub repository research prompt',
          content: 'Research prompt content here',
        },
        reviewSecurity: {
          name: 'Security Review',
          description: 'Security review prompt',
          content: 'Security review content from metadata',
        },
        use: {
          name: 'Use',
          description: 'How to use Octocode',
          content: 'Usage content',
        },
      },
      toolNames: {
        GITHUB_FETCH_CONTENT: 'githubGetFileContent',
        GITHUB_SEARCH_CODE: 'githubSearchCode',
        GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests',
        GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories',
        GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure',
      },
      baseSchema: {
        mainResearchGoal: 'Main goal description',
        researchGoal: 'Research goal description',
        reasoning: 'Reasoning description',
        bulkQuery: (toolName: string) =>
          `Research queries for ${toolName} (1-3 queries per call)`,
      },
      tools: {
        githubSearchCode: {
          name: 'githubSearchCode',
          description: 'Search code',
          schema: {},
          hints: { hasResults: [], empty: [] },
        },
        githubSearchRepositories: {
          name: 'githubSearchRepositories',
          description: 'Search repos',
          schema: {},
          hints: { hasResults: [], empty: [] },
        },
        githubGetFileContent: {
          name: 'githubGetFileContent',
          description: 'Get file content',
          schema: {},
          hints: { hasResults: [], empty: [] },
        },
        githubViewRepoStructure: {
          name: 'githubViewRepoStructure',
          description: 'View repo structure',
          schema: {},
          hints: { hasResults: [], empty: [] },
        },
        githubSearchPullRequests: {
          name: 'githubSearchPullRequests',
          description: 'Search PRs',
          schema: {},
          hints: { hasResults: [], empty: [] },
        },
      },
      baseHints: {
        hasResults: ['Base hint for results'],
        empty: ['Base hint for empty'],
      },
      genericErrorHints: ['Generic error hint'],
    } as CompleteMetadata;
  });

  describe('PROMPT_NAME constant', () => {
    it('should export the correct prompt name', () => {
      expect(PROMPT_NAME).toBe('review_security');
    });
  });

  describe('registerSecurityReviewPrompt', () => {
    it('should register prompt with correct name', () => {
      registerSecurityReviewPrompt(mockServer, mockContent);

      expect(mockServer.registerPrompt).toHaveBeenCalledWith(
        'review_security',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should register with correct description from metadata', () => {
      registerSecurityReviewPrompt(mockServer, mockContent);

      expect(mockServer.registerPrompt).toHaveBeenCalledWith(
        'review_security',
        expect.objectContaining({
          description: 'Security review prompt',
        }),
        expect.any(Function)
      );
    });

    it('should register with repoUrl args schema', () => {
      registerSecurityReviewPrompt(mockServer, mockContent);

      const [, config] = mockServer.registerPrompt.mock.calls[0];
      expect(config.argsSchema).toBeDefined();
      expect(config.argsSchema).toHaveProperty('repoUrl');
    });

    it('should return prompt content with repo URL appended', async () => {
      const { logPromptCall } = await import('../../src/session.js');
      registerSecurityReviewPrompt(mockServer, mockContent);

      const result = await registeredHandler({
        repoUrl: 'https://github.com/owner/repo',
      });

      expect(logPromptCall).toHaveBeenCalledWith('review_security');
      expect(result).toEqual({
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: 'Security review content from metadata\n\n**Repository to analyze:** https://github.com/owner/repo',
            },
          },
        ],
      });
    });

    it('should log prompt call when handler is invoked', async () => {
      const { logPromptCall } = await import('../../src/session.js');
      registerSecurityReviewPrompt(mockServer, mockContent);

      await registeredHandler({ repoUrl: 'https://github.com/owner/repo' });

      expect(logPromptCall).toHaveBeenCalledWith('review_security');
      expect(logPromptCall).toHaveBeenCalledTimes(1);
    });

    it('should use fallback content when reviewSecurity is missing in metadata', async () => {
      const contentWithoutSecurityPrompt = {
        ...mockContent,
        prompts: {
          research: mockContent.prompts.research,
          use: mockContent.prompts.use,
        },
      } as CompleteMetadata;

      registerSecurityReviewPrompt(mockServer, contentWithoutSecurityPrompt);
      const result = await registeredHandler({
        repoUrl: 'https://github.com/owner/repo',
      });

      expect(result.messages[0].content.text).toContain(
        'Security Review Agent'
      );
      expect(result.messages[0].content.text).toContain(
        'https://github.com/owner/repo'
      );
    });

    it('should include fallback description when metadata missing', () => {
      const contentWithoutSecurityPrompt = {
        ...mockContent,
        prompts: {
          research: mockContent.prompts.research,
          use: mockContent.prompts.use,
        },
      } as CompleteMetadata;

      registerSecurityReviewPrompt(mockServer, contentWithoutSecurityPrompt);

      expect(mockServer.registerPrompt).toHaveBeenCalledWith(
        'review_security',
        expect.objectContaining({
          description: 'Concise security review using Octocode tools.',
        }),
        expect.any(Function)
      );
    });

    it('should handle different repo URLs', async () => {
      registerSecurityReviewPrompt(mockServer, mockContent);

      const testCases = [
        'https://github.com/facebook/react',
        'https://github.com/microsoft/vscode',
        'https://github.com/user/private-repo',
      ];

      for (const repoUrl of testCases) {
        const result = await registeredHandler({ repoUrl });
        expect(result.messages[0].content.text).toContain(repoUrl);
      }
    });

    it('should return message with user role', async () => {
      registerSecurityReviewPrompt(mockServer, mockContent);
      const result = await registeredHandler({
        repoUrl: 'https://github.com/owner/repo',
      });

      expect(result.messages[0].role).toBe('user');
    });

    it('should return message with text content type', async () => {
      registerSecurityReviewPrompt(mockServer, mockContent);
      const result = await registeredHandler({
        repoUrl: 'https://github.com/owner/repo',
      });

      expect(result.messages[0].content.type).toBe('text');
    });

    it('should call registerPrompt only once', () => {
      registerSecurityReviewPrompt(mockServer, mockContent);

      expect(mockServer.registerPrompt).toHaveBeenCalledTimes(1);
    });

    it('should handle async handler correctly', async () => {
      registerSecurityReviewPrompt(mockServer, mockContent);

      const resultPromise = registeredHandler({
        repoUrl: 'https://github.com/owner/repo',
      });
      expect(resultPromise).toBeInstanceOf(Promise);

      const result = await resultPromise;
      expect(result).toBeDefined();
    });
  });

  describe('Fallback Content', () => {
    it('should contain security review instructions in fallback', async () => {
      const contentWithoutSecurityPrompt = {
        ...mockContent,
        prompts: {
          research: mockContent.prompts.research,
          use: mockContent.prompts.use,
        },
      } as CompleteMetadata;

      registerSecurityReviewPrompt(mockServer, contentWithoutSecurityPrompt);
      const result = await registeredHandler({
        repoUrl: 'https://github.com/owner/repo',
      });

      const text = result.messages[0].content.text;
      expect(text).toContain('Security Review Agent');
      expect(text).toContain('Objective');
      expect(text).toContain('Steps');
      expect(text).toContain('Tooling Rules');
    });

    it('should contain Octocode tool references in fallback', async () => {
      const contentWithoutSecurityPrompt = {
        ...mockContent,
        prompts: {
          research: mockContent.prompts.research,
          use: mockContent.prompts.use,
        },
      } as CompleteMetadata;

      registerSecurityReviewPrompt(mockServer, contentWithoutSecurityPrompt);
      const result = await registeredHandler({
        repoUrl: 'https://github.com/owner/repo',
      });

      const text = result.messages[0].content.text;
      expect(text).toContain('githubViewRepoStructure');
      expect(text).toContain('githubSearchCode');
      expect(text).toContain('githubGetFileContent');
      expect(text).toContain('githubSearchPullRequests');
    });

    it('should contain OWASP reference in fallback', async () => {
      const contentWithoutSecurityPrompt = {
        ...mockContent,
        prompts: {
          research: mockContent.prompts.research,
          use: mockContent.prompts.use,
        },
      } as CompleteMetadata;

      registerSecurityReviewPrompt(mockServer, contentWithoutSecurityPrompt);
      const result = await registeredHandler({
        repoUrl: 'https://github.com/owner/repo',
      });

      const text = result.messages[0].content.text;
      expect(text).toContain('OWASP');
      expect(text).toContain('CheatSheetSeries');
    });
  });

  describe('Integration', () => {
    it('should work with server that expects specific prompt format', async () => {
      registerSecurityReviewPrompt(mockServer, mockContent);

      expect(mockServer.registerPrompt).toHaveBeenCalledWith(
        expect.stringMatching(/^review_security$/),
        expect.objectContaining({
          description: expect.any(String),
          argsSchema: expect.any(Object),
        }),
        expect.any(Function)
      );
    });

    it('should produce valid MCP prompt response format', async () => {
      registerSecurityReviewPrompt(mockServer, mockContent);
      const result = await registeredHandler({
        repoUrl: 'https://github.com/owner/repo',
      });

      // MCP prompt response format validation
      expect(result).toHaveProperty('messages');
      expect(Array.isArray(result.messages)).toBe(true);
      expect(result.messages.length).toBeGreaterThan(0);
      expect(result.messages[0]).toHaveProperty('role');
      expect(result.messages[0]).toHaveProperty('content');
      expect(result.messages[0].content).toHaveProperty('type');
      expect(result.messages[0].content).toHaveProperty('text');
    });

    it('should validate repoUrl is a string through Zod schema', () => {
      registerSecurityReviewPrompt(mockServer, mockContent);

      const [, config] = mockServer.registerPrompt.mock.calls[0];
      const argsSchema = config.argsSchema;

      // Validate schema structure
      expect(argsSchema).toHaveProperty('repoUrl');
      expect(argsSchema.repoUrl).toBeDefined();
    });
  });
});
