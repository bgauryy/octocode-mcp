import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerUsePrompt, PROMPT_NAME } from '../../src/prompts/use.js';
import type { CompleteMetadata } from '../../src/tools/toolMetadata.js';

// Mock the session module
vi.mock('../../src/session.js', () => ({
  logPromptCall: vi.fn().mockResolvedValue(undefined),
}));

describe('use prompt', () => {
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
      prompts: {
        research: {
          name: 'Research',
          description: 'GitHub repository research prompt',
          content: 'Research prompt content here',
        },
        reviewSecurity: {
          name: 'Security Review',
          description: 'Security review prompt',
          content: 'Security review content',
        },
        use: {
          name: 'Use',
          description: 'How to use Octocode MCP tools',
          content: 'Usage instructions for Octocode MCP',
        },
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
      instructions: 'Test instructions',
      toolNames: {
        GITHUB_FETCH_CONTENT: 'githubGetFileContent',
        GITHUB_SEARCH_CODE: 'githubSearchCode',
        GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests',
        GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories',
        GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure',
      },
      baseSchema: {
        mainResearchGoal: '',
        researchGoal: '',
        reasoning: '',
        bulkQuery: () => '',
      },
      baseHints: { hasResults: [], empty: [] },
      genericErrorHints: [],
    } as CompleteMetadata;
  });

  describe('PROMPT_NAME constant', () => {
    it('should export the correct prompt name', () => {
      expect(PROMPT_NAME).toBe('use');
    });
  });

  describe('registerUsePrompt', () => {
    it('should register prompt with correct name', () => {
      registerUsePrompt(mockServer, mockContent);

      expect(mockServer.registerPrompt).toHaveBeenCalledWith(
        'use',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should register with correct description from metadata', () => {
      registerUsePrompt(mockServer, mockContent);

      expect(mockServer.registerPrompt).toHaveBeenCalledWith(
        'use',
        expect.objectContaining({
          description: 'How to use Octocode MCP tools',
        }),
        expect.any(Function)
      );
    });

    it('should register with empty args schema', () => {
      registerUsePrompt(mockServer, mockContent);

      const [, config] = mockServer.registerPrompt.mock.calls[0];
      expect(config.argsSchema).toBeDefined();
      expect(config.argsSchema).toEqual({});
    });

    it('should return prompt content from metadata', async () => {
      const { logPromptCall } = await import('../../src/session.js');
      registerUsePrompt(mockServer, mockContent);

      const result = await registeredHandler();

      expect(logPromptCall).toHaveBeenCalledWith('use');
      expect(result).toEqual({
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: 'Usage instructions for Octocode MCP',
            },
          },
        ],
      });
    });

    it('should log prompt call when handler is invoked', async () => {
      const { logPromptCall } = await import('../../src/session.js');
      registerUsePrompt(mockServer, mockContent);

      await registeredHandler();

      expect(logPromptCall).toHaveBeenCalledWith('use');
      expect(logPromptCall).toHaveBeenCalledTimes(1);
    });

    it('should handle different content from metadata', async () => {
      const customContent: CompleteMetadata = {
        ...mockContent,
        prompts: {
          ...mockContent.prompts,
          use: {
            name: 'Custom Use',
            description: 'Custom description',
            content: 'Custom usage content',
          },
        },
      };

      registerUsePrompt(mockServer, customContent);
      const result = await registeredHandler();

      expect(result.messages[0].content.text).toBe('Custom usage content');
    });

    it('should return message with user role', async () => {
      registerUsePrompt(mockServer, mockContent);
      const result = await registeredHandler();

      expect(result.messages[0].role).toBe('user');
    });

    it('should return message with text content type', async () => {
      registerUsePrompt(mockServer, mockContent);
      const result = await registeredHandler();

      expect(result.messages[0].content.type).toBe('text');
    });

    it('should explicitly set content type as const', async () => {
      registerUsePrompt(mockServer, mockContent);
      const result = await registeredHandler();

      // Verify the type is explicitly 'text' as const
      expect(result.messages[0].content.type).toBe('text');
    });

    it('should call registerPrompt only once', () => {
      registerUsePrompt(mockServer, mockContent);

      expect(mockServer.registerPrompt).toHaveBeenCalledTimes(1);
    });

    it('should handle async handler correctly', async () => {
      registerUsePrompt(mockServer, mockContent);

      const resultPromise = registeredHandler();
      expect(resultPromise).toBeInstanceOf(Promise);

      const result = await resultPromise;
      expect(result).toBeDefined();
    });
  });

  describe('Integration', () => {
    it('should work with server that expects specific prompt format', async () => {
      registerUsePrompt(mockServer, mockContent);

      expect(mockServer.registerPrompt).toHaveBeenCalledWith(
        expect.stringMatching(/^use$/),
        expect.objectContaining({
          description: expect.any(String),
          argsSchema: expect.any(Object),
        }),
        expect.any(Function)
      );
    });

    it('should produce valid MCP prompt response format', async () => {
      registerUsePrompt(mockServer, mockContent);
      const result = await registeredHandler();

      // MCP prompt response format validation
      expect(result).toHaveProperty('messages');
      expect(Array.isArray(result.messages)).toBe(true);
      expect(result.messages.length).toBeGreaterThan(0);
      expect(result.messages[0]).toHaveProperty('role');
      expect(result.messages[0]).toHaveProperty('content');
      expect(result.messages[0].content).toHaveProperty('type');
      expect(result.messages[0].content).toHaveProperty('text');
    });

    it('should match research prompt structure', async () => {
      // Both research and use have similar simple structure
      registerUsePrompt(mockServer, mockContent);
      const result = await registeredHandler();

      // Structure should match research prompt (no args, simple text response)
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toMatchObject({
        role: 'user',
        content: {
          type: 'text',
          text: expect.any(String),
        },
      });
    });
  });

  describe('Comparison with other prompts', () => {
    it('should have simpler structure than review_security (no args)', () => {
      registerUsePrompt(mockServer, mockContent);

      const [, config] = mockServer.registerPrompt.mock.calls[0];
      // Use prompt has empty args schema (no repoUrl like review_security)
      expect(config.argsSchema).toEqual({});
    });

    it('should have same handler signature as research prompt', async () => {
      registerUsePrompt(mockServer, mockContent);

      // Both research and use accept no arguments
      const result = await registeredHandler();
      expect(result).toBeDefined();
      expect(result.messages).toBeDefined();
    });
  });
});
