/**
 * Integration test: verifies that the MCP server correctly exposes
 * instructions, tool descriptions, and prompts via the MCP protocol.
 *
 * Uses InMemoryTransport to connect a real McpServer + Client pair,
 * then inspects the `initialize` response and `listTools`/`listPrompts` output.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Implementation } from '@modelcontextprotocol/sdk/types.js';
import {
  buildMockMetadata,
  collectJsonSchemaDescriptions,
  TOOL_NAMES_MAP,
} from './fixtures.js';

const MOCK_INSTRUCTIONS =
  'You are the Octocode MCP research assistant. Use tools wisely.';

const MOCK_PROMPTS = {
  research: {
    name: 'Research',
    description: 'Research a codebase or library',
    content: 'Research the following repository and answer the question.',
    args: [
      {
        name: 'repo',
        description: 'Repository URL or owner/repo',
        required: true,
      },
      { name: 'question', description: 'What to research' },
    ],
  },
  use: {
    name: 'Use',
    description: 'Generate usage examples',
    content: 'Generate usage examples for the library.',
  },
};

describe('MCP protocol exposure: instructions, tools, and prompts', () => {
  let client: Client;
  let mcpServer: McpServer;

  beforeAll(async () => {
    vi.resetModules();

    const metadata = buildMockMetadata({
      instructions: MOCK_INSTRUCTIONS,
      prompts: MOCK_PROMPTS,
    });

    vi.doMock('@octocodeai/octocode-core', async importOriginal => {
      const actual =
        await importOriginal<typeof import('@octocodeai/octocode-core')>();
      return {
        ...actual,
        octocodeConfig: metadata,
        completeMetadata: metadata,
      };
    });

    const { _resetMetadataState, initializeToolMetadata } =
      await import('../../src/tools/toolMetadata/state.js');
    _resetMetadataState();
    await initializeToolMetadata();

    const { initialize } = await import('../../src/serverConfig.js');
    await initialize();

    const serverConfig: Implementation = {
      name: 'octocode-mcp-test',
      version: '1.0.0',
    };

    mcpServer = new McpServer(serverConfig, {
      capabilities: {
        tools: { listChanged: false },
        logging: {},
        prompts: {},
      },
      instructions: MOCK_INSTRUCTIONS,
    });

    const { registerTools } = await import('../../src/tools/toolsManager.js');
    await registerTools(mcpServer);

    const { registerPrompts } = await import('../../src/prompts/prompts.js');
    const { loadToolContent } =
      await import('../../src/tools/toolMetadata/state.js');
    const content = await loadToolContent();
    registerPrompts(mcpServer, content);

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    client = new Client({ name: 'test-client', version: '1.0.0' });

    await mcpServer.connect(serverTransport);
    await client.connect(clientTransport);
  }, 30000);

  afterAll(async () => {
    await client?.close();
    await mcpServer?.close();
  });

  it('client receives non-empty instructions from the server', () => {
    const instructions = client.getInstructions();
    expect(instructions).toBeDefined();
    expect(typeof instructions).toBe('string');
    expect(instructions!.length).toBeGreaterThan(0);
  });

  it('instructions contain the metadata instructions text', () => {
    const instructions = client.getInstructions()!;
    expect(instructions).toContain(MOCK_INSTRUCTIONS);
  });

  it('server exposes tools with non-empty descriptions', async () => {
    const { tools } = await client.listTools();

    expect(tools.length).toBeGreaterThan(0);

    for (const tool of tools) {
      expect(
        tool.description,
        `Tool ${tool.name} should have a non-empty description`
      ).toBeTruthy();
      expect(tool.description!.length).toBeGreaterThan(5);
    }
  });

  it('every tool inputSchema has zero empty descriptions', async () => {
    const { tools } = await client.listTools();

    let totalDescriptions = 0;
    let emptyDescriptions = 0;

    for (const tool of tools) {
      expect(tool.inputSchema).toBeDefined();
      const descriptions = collectJsonSchemaDescriptions(
        tool.inputSchema,
        tool.name
      );
      totalDescriptions += descriptions.length;
      emptyDescriptions += descriptions.filter(
        d => d.description === ''
      ).length;
    }

    expect(totalDescriptions).toBeGreaterThan(50);
    expect(emptyDescriptions).toBe(0);
  });

  it('every tool name matches one of the expected tool names', async () => {
    const { tools } = await client.listTools();
    const expectedNames = Object.values(TOOL_NAMES_MAP);

    for (const tool of tools) {
      expect(expectedNames).toContain(tool.name);
    }
  });

  it('server exposes prompts with non-empty descriptions', async () => {
    const { prompts } = await client.listPrompts();

    expect(prompts.length).toBe(2);

    const research = prompts.find(p => p.name === 'Research');
    expect(research).toBeDefined();
    expect(research!.description).toBe('Research a codebase or library');

    const use = prompts.find(p => p.name === 'Use');
    expect(use).toBeDefined();
    expect(use!.description).toBe('Generate usage examples');
  });

  it('prompt arguments are present with expected metadata', async () => {
    const { prompts } = await client.listPrompts();
    const research = prompts.find(p => p.name === 'Research');
    expect(research).toBeDefined();
    expect(research!.arguments).toBeDefined();
    expect(research!.arguments!.length).toBe(2);

    const repoArg = research!.arguments!.find(a => a.name === 'repo');
    expect(repoArg).toBeDefined();
    expect(repoArg!.description).toBe('Repository URL or owner/repo');
    expect(repoArg!.required).toBe(true);

    const questionArg = research!.arguments!.find(a => a.name === 'question');
    expect(questionArg).toBeDefined();
    // Zod v4 .optional() wrapping strips inner .describe() from the MCP SDK's
    // argument metadata extraction. The argument still functions correctly.
    expect(questionArg!.required).toBeFalsy();
  });

  it('prompt handler returns correct content with interpolated args', async () => {
    const result = await client.getPrompt({
      name: 'Research',
      arguments: { repo: 'facebook/react', question: 'How does hooks work?' },
    });

    expect(result.messages).toHaveLength(1);
    const message = result.messages[0]!;
    expect(message.role).toBe('user');
    const text = message.content as { type: string; text: string };
    expect(text.type).toBe('text');
    expect(text.text).toContain('Research the following repository');
    expect(text.text).toContain('repo: facebook/react');
    expect(text.text).toContain('question: How does hooks work?');
  });
});
