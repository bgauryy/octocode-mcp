import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPrompts } from '../../src/prompts/prompts.js';
import type { CompleteMetadata } from '../../src/tools/toolMetadata.js';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

describe('Prompts Registration', () => {
  let mockServer: McpServer;
  let registerPromptSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    registerPromptSpy = vi.fn();
    mockServer = {
      registerPrompt: registerPromptSpy,
    } as unknown as McpServer;
  });

  const baseMetadata: CompleteMetadata = {
    instructions: 'Test instructions',
    prompts: {},
    toolNames: {
      GITHUB_FETCH_CONTENT: 'githubGetFileContent',
      GITHUB_SEARCH_CODE: 'githubSearchCode',
      GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests',
      GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories',
      GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure',
      PACKAGE_SEARCH: 'packageSearch',
    },
    baseSchema: {
      mainResearchGoal: '',
      researchGoal: '',
      reasoning: '',
      bulkQuery: () => '',
    },
    tools: {},
    baseHints: { hasResults: [], empty: [] },
    genericErrorHints: [],
  };

  describe('Dynamic Registration', () => {
    it('should register all valid prompts', () => {
      const metadata: CompleteMetadata = {
        ...baseMetadata,
        prompts: {
          research: {
            name: 'Research',
            description: 'Research prompt description',
            content: 'Research prompt content',
            args: [
              { name: 'repo', description: 'Repository URL', required: true },
            ],
          },
          use: {
            name: 'Use',
            description: 'Use prompt description',
            content: 'Use prompt content',
          },
        },
      };

      registerPrompts(mockServer, metadata);

      expect(registerPromptSpy).toHaveBeenCalledTimes(2);

      // Check Research prompt
      const researchCall = registerPromptSpy.mock.calls.find(
        (call: unknown[]) => call[0] === 'Research'
      );

      if (!researchCall) throw new Error('Research call not found');

      const researchOpts = researchCall[1] as {
        description: string;
        argsSchema: Record<string, z.ZodTypeAny>;
      };
      expect(researchOpts.description).toBe('Research prompt description');
      expect(researchOpts.argsSchema).toBeDefined();
      expect(researchOpts.argsSchema.repo).toBeDefined();

      // Check Use prompt
      const useCall = registerPromptSpy.mock.calls.find(
        (call: unknown[]) => call[0] === 'Use'
      );

      if (!useCall) throw new Error('Use call not found');

      const useOpts = useCall[1] as {
        description: string;
        argsSchema: Record<string, z.ZodTypeAny>;
      };
      expect(useOpts.description).toBe('Use prompt description');
      expect(Object.keys(useOpts.argsSchema).length).toBe(0);
    });

    it('should skip prompts with missing name', () => {
      const metadata: CompleteMetadata = {
        ...baseMetadata,
        prompts: {
          invalid: {
            name: '',
            description: 'Desc',
            content: 'Content',
          },
          valid: {
            name: 'Valid',
            description: 'Desc',
            content: 'Content',
          },
        },
      };

      registerPrompts(mockServer, metadata);

      expect(registerPromptSpy).toHaveBeenCalledTimes(1);
      expect(registerPromptSpy).toHaveBeenCalledWith(
        'Valid',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should skip prompts with missing description', () => {
      const metadata: CompleteMetadata = {
        ...baseMetadata,
        prompts: {
          invalid: {
            name: 'Invalid',
            description: '',
            content: 'Content',
          },
        },
      };

      registerPrompts(mockServer, metadata);
      expect(registerPromptSpy).not.toHaveBeenCalled();
    });

    it('should skip prompts with missing content', () => {
      const metadata: CompleteMetadata = {
        ...baseMetadata,
        prompts: {
          invalid: {
            name: 'Invalid',
            description: 'Desc',
            content: '',
          },
        },
      };

      registerPrompts(mockServer, metadata);
      expect(registerPromptSpy).not.toHaveBeenCalled();
    });
  });

  describe('Handler Logic', () => {
    it('should append arguments to content', async () => {
      const metadata: CompleteMetadata = {
        ...baseMetadata,
        prompts: {
          test: {
            name: 'Test',
            description: 'Test description',
            content: 'Hello there!',
            args: [{ name: 'name', description: 'Your name' }],
          },
        },
      };

      registerPrompts(mockServer, metadata);

      const calls = registerPromptSpy.mock.calls;
      if (!calls || !calls[0]) throw new Error('No calls found');

      const handler = calls[0][2] as (
        args: Record<string, unknown>
      ) => Promise<GetPromptResult>;
      const result = await handler({ name: 'World' });

      const message = result.messages[0];
      if (!message) throw new Error('No message returned');

      if (message.content.type !== 'text') {
        throw new Error('Expected text content');
      }
      expect(message.content.text).toBe(
        'Hello there!\n\nUse Input\n\nname: World\n'
      );
    });

    it('should append multiple arguments to content', async () => {
      const metadata: CompleteMetadata = {
        ...baseMetadata,
        prompts: {
          test: {
            name: 'Test',
            description: 'Test description',
            content: 'Research the repository',
            args: [
              { name: 'repo', description: 'Repository name', required: true },
              { name: 'branch', description: 'Branch name' },
            ],
          },
        },
      };

      registerPrompts(mockServer, metadata);

      const calls = registerPromptSpy.mock.calls;
      if (!calls || !calls[0]) throw new Error('No calls found');

      const handler = calls[0][2] as (
        args: Record<string, unknown>
      ) => Promise<GetPromptResult>;
      const result = await handler({ repo: 'octocode-mcp', branch: 'main' });

      const message = result.messages[0];
      if (!message) throw new Error('No message returned');

      if (message.content.type !== 'text') {
        throw new Error('Expected text content');
      }
      expect(message.content.text).toBe(
        'Research the repository\n\nUse Input\n\nrepo: octocode-mcp\nbranch: main\n'
      );
    });

    it('should not append when no arguments provided', async () => {
      const metadata: CompleteMetadata = {
        ...baseMetadata,
        prompts: {
          test: {
            name: 'Test',
            description: 'Test description',
            content: 'Hello there!',
            args: [{ name: 'name', description: 'Your name' }],
          },
        },
      };

      registerPrompts(mockServer, metadata);

      const calls = registerPromptSpy.mock.calls;
      if (!calls || !calls[0]) throw new Error('No calls found');

      const handler = calls[0][2] as (
        args: Record<string, unknown>
      ) => Promise<GetPromptResult>;
      const result = await handler({}); // No args provided

      const message = result.messages[0];
      if (!message) throw new Error('No message returned');

      if (message.content.type !== 'text') {
        throw new Error('Expected text content');
      }
      expect(message.content.text).toBe('Hello there!');
    });

    it('should skip undefined and null arguments', async () => {
      const metadata: CompleteMetadata = {
        ...baseMetadata,
        prompts: {
          test: {
            name: 'Test',
            description: 'Test description',
            content: 'Process data',
            args: [
              {
                name: 'required',
                description: 'Required field',
                required: true,
              },
              { name: 'optional', description: 'Optional field' },
            ],
          },
        },
      };

      registerPrompts(mockServer, metadata);

      const calls = registerPromptSpy.mock.calls;
      if (!calls || !calls[0]) throw new Error('No calls found');

      const handler = calls[0][2] as (
        args: Record<string, unknown>
      ) => Promise<GetPromptResult>;
      const result = await handler({
        required: 'value',
        optional: undefined,
      });

      const message = result.messages[0];
      if (!message) throw new Error('No message returned');

      if (message.content.type !== 'text') {
        throw new Error('Expected text content');
      }
      expect(message.content.text).toBe(
        'Process data\n\nUse Input\n\nrequired: value\n'
      );
    });
  });
});
