import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPrompts } from '../../src/prompts/prompts.js';
import type { CompleteMetadata } from '../../src/types/metadata.js';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod/v4';

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

  function getCallAt(index: number) {
    const call = registerPromptSpy.mock.calls[index];
    if (!call) throw new Error(`No registerPrompt call at index ${index}`);
    return call;
  }

  function getMessageText(result: GetPromptResult): string {
    const msg = result.messages[0];
    if (!msg) throw new Error('No message in result');
    if (msg.content.type !== 'text') throw new Error('Expected text content');
    return msg.content.text;
  }

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
      LOCAL_RIPGREP: 'localSearchCode',
      LOCAL_FETCH_CONTENT: 'localGetFileContent',
      LOCAL_FIND_FILES: 'localFindFiles',
      LOCAL_VIEW_STRUCTURE: 'localViewStructure',
      LSP_GOTO_DEFINITION: 'lspGotoDefinition',
      LSP_FIND_REFERENCES: 'lspFindReferences',
      LSP_CALL_HIERARCHY: 'lspCallHierarchy',
      GITHUB_CLONE_REPO: 'githubCloneRepo',
    },
    baseSchema: {
      mainResearchGoal: '',
      researchGoal: '',
      reasoning: '',
      bulkQuery: (_toolName: string) => '',
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
        argsSchema: Record<string, z.ZodType>;
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
        argsSchema?: Record<string, z.ZodType>;
      };
      expect(useOpts.description).toBe('Use prompt description');
      expect(useOpts.argsSchema).toBeUndefined();
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

  describe('argsSchema conditional inclusion', () => {
    it('should omit argsSchema when prompt has no args property', () => {
      const metadata: CompleteMetadata = {
        ...baseMetadata,
        prompts: {
          help: {
            name: 'help',
            description: 'Show help',
            content: 'Help content',
          },
        },
      };

      registerPrompts(mockServer, metadata);

      const opts = getCallAt(0)[1] as Record<string, unknown>;
      expect(opts.description).toBe('Show help');
      expect(opts).not.toHaveProperty('argsSchema');
    });

    it('should omit argsSchema when prompt has empty args array', () => {
      const metadata: CompleteMetadata = {
        ...baseMetadata,
        prompts: {
          help: {
            name: 'help',
            description: 'Show help',
            content: 'Help content',
            args: [],
          },
        },
      };

      registerPrompts(mockServer, metadata);

      const opts = getCallAt(0)[1] as Record<string, unknown>;
      expect(opts).not.toHaveProperty('argsSchema');
    });

    it('should omit argsSchema when all args are invalid and filtered out', () => {
      const metadata: CompleteMetadata = {
        ...baseMetadata,
        prompts: {
          test: {
            name: 'Test',
            description: 'Desc',
            content: 'Content',
            args: [
              null as unknown as { name: string; description: string },
              { name: 123 as unknown as string, description: 'bad' },
            ],
          },
        },
      };

      registerPrompts(mockServer, metadata);

      const opts = getCallAt(0)[1] as Record<string, unknown>;
      expect(opts).not.toHaveProperty('argsSchema');
    });

    it('should include argsSchema when prompt has valid args', () => {
      const metadata: CompleteMetadata = {
        ...baseMetadata,
        prompts: {
          research: {
            name: 'research',
            description: 'Research a repo',
            content: 'Research content',
            args: [
              { name: 'repo', description: 'Repo URL', required: true },
              { name: 'branch', description: 'Branch name' },
            ],
          },
        },
      };

      registerPrompts(mockServer, metadata);

      const opts = getCallAt(0)[1] as {
        argsSchema: Record<string, z.ZodType>;
      };
      expect(opts.argsSchema).toBeDefined();
      expect(Object.keys(opts.argsSchema)).toEqual(['repo', 'branch']);
    });

    it('should mark required args as non-optional in argsSchema', () => {
      const metadata: CompleteMetadata = {
        ...baseMetadata,
        prompts: {
          test: {
            name: 'test',
            description: 'Desc',
            content: 'Content',
            args: [
              {
                name: 'required_arg',
                description: 'Must provide',
                required: true,
              },
            ],
          },
        },
      };

      registerPrompts(mockServer, metadata);

      const opts = getCallAt(0)[1] as {
        argsSchema: Record<string, z.ZodType>;
      };
      const schema = z.object(
        opts.argsSchema as Record<string, z.ZodType<unknown>>
      );
      expect(schema.safeParse({ required_arg: 'val' }).success).toBe(true);
      expect(schema.safeParse({}).success).toBe(false);
    });

    it('should mark non-required args as optional in argsSchema', () => {
      const metadata: CompleteMetadata = {
        ...baseMetadata,
        prompts: {
          test: {
            name: 'test',
            description: 'Desc',
            content: 'Content',
            args: [{ name: 'optional_arg', description: 'May omit' }],
          },
        },
      };

      registerPrompts(mockServer, metadata);

      const opts = getCallAt(0)[1] as {
        argsSchema: Record<string, z.ZodType>;
      };
      const schema = z.object(
        opts.argsSchema as Record<string, z.ZodType<unknown>>
      );
      expect(schema.safeParse({}).success).toBe(true);
      expect(schema.safeParse({ optional_arg: 'val' }).success).toBe(true);
    });
  });

  describe('No-args prompt handler (bug fix: prompts/get with undefined arguments)', () => {
    it('should return content when handler receives undefined args', async () => {
      const metadata: CompleteMetadata = {
        ...baseMetadata,
        prompts: {
          help: {
            name: 'help',
            description: 'Show help',
            content: 'This is the help text.',
          },
        },
      };

      registerPrompts(mockServer, metadata);

      const handler = getCallAt(0)[2] as (
        args: unknown
      ) => Promise<GetPromptResult>;
      const result = await handler(undefined);

      expect(result.messages).toHaveLength(1);
      expect(getMessageText(result)).toBe('This is the help text.');
    });

    it('should return content when handler receives null args', async () => {
      const metadata: CompleteMetadata = {
        ...baseMetadata,
        prompts: {
          help: {
            name: 'help',
            description: 'Show help',
            content: 'Help text here.',
          },
        },
      };

      registerPrompts(mockServer, metadata);

      const handler = getCallAt(0)[2] as (
        args: unknown
      ) => Promise<GetPromptResult>;
      const result = await handler(null);

      expect(getMessageText(result)).toBe('Help text here.');
    });

    it('should return content when handler receives empty object args', async () => {
      const metadata: CompleteMetadata = {
        ...baseMetadata,
        prompts: {
          help: {
            name: 'help',
            description: 'Show help',
            content: 'Help text.',
          },
        },
      };

      registerPrompts(mockServer, metadata);

      const handler = getCallAt(0)[2] as (
        args: unknown
      ) => Promise<GetPromptResult>;
      const result = await handler({});

      expect(getMessageText(result)).toBe('Help text.');
    });
  });

  describe('Prompt with args - handler receives valid arguments', () => {
    it('should append args when handler receives populated object', async () => {
      const metadata: CompleteMetadata = {
        ...baseMetadata,
        prompts: {
          research: {
            name: 'research',
            description: 'Research a repo',
            content: 'Base research content',
            args: [{ name: 'repo', description: 'Repo URL', required: true }],
          },
        },
      };

      registerPrompts(mockServer, metadata);

      const handler = getCallAt(0)[2] as (
        args: Record<string, unknown>
      ) => Promise<GetPromptResult>;
      const result = await handler({ repo: 'octocode-mcp' });

      expect(getMessageText(result)).toBe(
        'Base research content\n\nUse Input\n\nrepo: octocode-mcp\n'
      );
    });

    it('should return base content when args-prompt handler receives undefined', async () => {
      const metadata: CompleteMetadata = {
        ...baseMetadata,
        prompts: {
          research: {
            name: 'research',
            description: 'Research a repo',
            content: 'Base research content',
            args: [{ name: 'repo', description: 'Repo URL', required: true }],
          },
        },
      };

      registerPrompts(mockServer, metadata);

      const handler = getCallAt(0)[2] as (
        args: unknown
      ) => Promise<GetPromptResult>;
      const result = await handler(undefined);

      expect(getMessageText(result)).toBe('Base research content');
    });
  });

  describe('Edge Cases', () => {
    it('should do nothing when prompts is undefined', () => {
      const metadata: CompleteMetadata = {
        ...baseMetadata,
        prompts: undefined as unknown as CompleteMetadata['prompts'],
      };

      registerPrompts(mockServer, metadata);
      expect(registerPromptSpy).not.toHaveBeenCalled();
    });

    it('should skip args with null or non-string name', () => {
      const metadata: CompleteMetadata = {
        ...baseMetadata,
        prompts: {
          test: {
            name: 'Test',
            description: 'Valid prompt',
            content: 'Valid content',
            args: [
              null as unknown as { name: string; description: string },
              { name: 'valid', description: 'Valid arg', required: true },
              { name: 123 as unknown as string, description: 'Numeric name' },
            ],
          },
        },
      };

      registerPrompts(mockServer, metadata);

      expect(registerPromptSpy).toHaveBeenCalledTimes(1);
      const call = getCallAt(0);
      const opts = call[1] as {
        argsSchema: Record<string, z.ZodType>;
      };
      expect(Object.keys(opts.argsSchema)).toEqual(['valid']);
    });

    it('should skip null prompt entries', () => {
      const metadata: CompleteMetadata = {
        ...baseMetadata,
        prompts: {
          nullEntry: null as unknown as {
            name: string;
            description: string;
            content: string;
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
    });
  });
});
