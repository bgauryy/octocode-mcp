import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerResearchPrompt,
  PROMPT_NAME,
} from '../../src/prompts/research.js';
import type { CompleteMetadata } from '../../src/tools/toolMetadata.js';

// Mock the session module
vi.mock('../../src/session.js', () => ({
  logPromptCall: vi.fn().mockResolvedValue(undefined),
}));

describe('research prompt', () => {
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
          description: 'How to use Octocode',
          content: 'Usage content',
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
      expect(PROMPT_NAME).toBe('research');
    });
  });

  describe('registerResearchPrompt', () => {
    it('should register prompt with correct name', () => {
      registerResearchPrompt(mockServer, mockContent);

      expect(mockServer.registerPrompt).toHaveBeenCalledWith(
        'research',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should register with correct description from metadata', () => {
      registerResearchPrompt(mockServer, mockContent);

      expect(mockServer.registerPrompt).toHaveBeenCalledWith(
        'research',
        expect.objectContaining({
          description: 'GitHub repository research prompt',
        }),
        expect.any(Function)
      );
    });

    it('should register with empty args schema', () => {
      registerResearchPrompt(mockServer, mockContent);

      const [, config] = mockServer.registerPrompt.mock.calls[0];
      expect(config.argsSchema).toBeDefined();
      expect(config.argsSchema).toEqual({});
    });

    it('should return prompt content from metadata', async () => {
      const { logPromptCall } = await import('../../src/session.js');
      registerResearchPrompt(mockServer, mockContent);

      const result = await registeredHandler();

      expect(logPromptCall).toHaveBeenCalledWith('research');
      expect(result).toEqual({
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: 'Research prompt content here',
            },
          },
        ],
      });
    });

    it('should log prompt call when handler is invoked', async () => {
      const { logPromptCall } = await import('../../src/session.js');
      registerResearchPrompt(mockServer, mockContent);

      await registeredHandler();

      expect(logPromptCall).toHaveBeenCalledWith('research');
      expect(logPromptCall).toHaveBeenCalledTimes(1);
    });

    it('should handle different content from metadata', async () => {
      const customContent: CompleteMetadata = {
        ...mockContent,
        prompts: {
          ...mockContent.prompts,
          research: {
            name: 'Custom Research',
            description: 'Custom description',
            content: 'Custom research content',
          },
        },
      };

      registerResearchPrompt(mockServer, customContent);
      const result = await registeredHandler();

      expect(result.messages[0].content.text).toBe('Custom research content');
    });

    it('should return message with user role', async () => {
      registerResearchPrompt(mockServer, mockContent);
      const result = await registeredHandler();

      expect(result.messages[0].role).toBe('user');
    });

    it('should return message with text content type', async () => {
      registerResearchPrompt(mockServer, mockContent);
      const result = await registeredHandler();

      expect(result.messages[0].content.type).toBe('text');
    });

    it('should call registerPrompt only once', () => {
      registerResearchPrompt(mockServer, mockContent);

      expect(mockServer.registerPrompt).toHaveBeenCalledTimes(1);
    });

    it('should handle async handler correctly', async () => {
      registerResearchPrompt(mockServer, mockContent);

      const resultPromise = registeredHandler();
      expect(resultPromise).toBeInstanceOf(Promise);

      const result = await resultPromise;
      expect(result).toBeDefined();
    });
  });

  describe('Integration', () => {
    it('should work with server that expects specific prompt format', async () => {
      registerResearchPrompt(mockServer, mockContent);

      expect(mockServer.registerPrompt).toHaveBeenCalledWith(
        expect.stringMatching(/^research$/),
        expect.objectContaining({
          description: expect.any(String),
          argsSchema: expect.any(Object),
        }),
        expect.any(Function)
      );
    });

    it('should produce valid MCP prompt response format', async () => {
      registerResearchPrompt(mockServer, mockContent);
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
  });
});
