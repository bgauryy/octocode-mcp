import { afterAll, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadNativeBinding } from '../../src/native/index.js';

// clasify registers only with beta and a classification key. Validation rejects
// every case before provider access, so beta and a fake key in the hermetic home
// (test-utils/external-effects-guard.ts) and a dead loopback provider host keep
// it hermetic.
writeFileSync(
  join(process.env.OCTOCODE_HOME!, '.env'),
  'OCTOCODE_BETA=1\nOCTOCODE_CLASSIFICATION_API=validation-parity-fake-key\nOCTOCODE_CLASSIFICATION_API_HOST=http://127.0.0.1:9\n'
);

// One case list, two surfaces of the real addon: the MCP and CLI surfaces
// answer a rejected call with the same typed envelope and repair guidance,
// because native is the only validator and the only error projection. Needs a
// current native build.
type Runtime = {
  executeMcp(requestId: string, tool: string, input: unknown): Promise<unknown>;
  close(): Promise<void>;
};

const { NativeRuntime } = loadNativeBinding() as unknown as {
  NativeRuntime: new (options: { surface: string }) => Runtime;
};
const cliRuntime = new NativeRuntime({ surface: 'cli' });
const mcpRuntime = new NativeRuntime({ surface: 'mcp' });
afterAll(() => Promise.all([cliRuntime.close(), mcpRuntime.close()]));

const brief = { mainGoal: 'g', reasoning: 'r' };

type ToolErrorEnvelope = {
  error?: string;
  errorCode?: string;
  details?: string[];
};

let request = 0;
const rejection = async (runtime: Runtime, tool: string, input: unknown) => {
  const result = (await runtime.executeMcp(
    `parity-${request++}`,
    tool,
    input
  )) as {
    isError?: boolean;
    content?: { text?: string }[];
    structuredContent?: ToolErrorEnvelope;
  };
  if (!result.isError) return { text: '', envelope: undefined };
  return {
    text: (result.content ?? []).map(block => block.text ?? '').join('\n'),
    envelope: result.structuredContent,
  };
};

const cases: ReadonlyArray<{
  name: string;
  tool: string;
  query: Record<string, unknown>;
  says: string[];
  never?: string[];
}> = [
  {
    name: 'boolean for an on/off enum',
    tool: 'localSearch',
    query: { path: '.', matchString: 'needle', regex: true },
    says: ['booleans are not accepted; use "rust"'],
  },
  {
    name: 'number outside its range',
    tool: 'structureSearch',
    query: { path: '.', maxDepth: 50 },
    says: ['maxDepth: Number is outside the allowed range (1-20)'],
  },
  {
    name: 'a field the published view leaves out',
    tool: 'ghSearchHistory',
    query: {
      operation: 'pullRequest',
      owner: 'a',
      repo: 'b',
      qualifers: 'author:x',
    },
    says: ["Remove unknown field 'qualifers'", "did you mean 'qualifiers'?"],
  },
  {
    name: 'core-authored required-field guidance',
    tool: 'ghSearchCode',
    query: { keywords: ['needle'] },
    says: [
      'owner: Missing required field: owner (Set owner: code search cannot span all of GitHub (add repo to narrow further).)',
    ],
  },
  {
    name: 'section resources on a whole-source clasify query',
    tool: 'clasify',
    query: {
      state: { name: 'validation-parity-fixture' },
      resources: {
        package: {
          tool: 'localFetch',
          query: { path: 'package.json', fullContent: true },
        },
      },
      questions: {
        q: { type: 'noul', instructions: 'Does this define a package?' },
      },
    },
    says: [
      "Remove 'resources' from queries[0]",
      'it applies only with operation',
      'repair: clasify',
    ],
    never: [
      'candidateEvidence',
      "Remove unknown field 'resources'",
      "did you mean 'source'?",
    ],
  },
  {
    name: 'a misspelled lspSearch path',
    tool: 'lspSearch',
    query: { pth: 'package.json', symbolName: 'name', line: 1 },
    says: ["did you mean 'path'?"],
    never: ["did you mean 'page'?"],
  },
  {
    name: 'a match-only field on a symbols query',
    tool: 'astSearch',
    query: { operation: 'symbols', path: '.', include: ['*.ts'] },
    says: [
      'Remove \'include\' from queries[0]: it applies only with operation:"match"',
    ],
    never: ['namedOnly', 'send queries[0] to localSearch'],
  },
];

describe('CLI and MCP validation guidance parity', () => {
  it.each(cases)('$name', async ({ tool, query, says, never = [] }) => {
    const input = { queries: [{ ...brief, ...query }] };
    const mcp = await rejection(mcpRuntime, tool, input);
    const cli = await rejection(cliRuntime, tool, input);
    expect(mcp.envelope).toEqual(cli.envelope);
    // Both surfaces answer with the same typed error envelope: the error
    // itself, no kind/version/tool frame.
    for (const envelope of [mcp.envelope, cli.envelope]) {
      expect(envelope).toMatchObject({
        error: expect.any(String),
        errorCode: 'invalidInput',
      });
      expect(envelope).not.toHaveProperty('kind');
      expect(envelope).not.toHaveProperty('version');
      expect(envelope).not.toHaveProperty('tool');
    }
    for (const text of [mcp.text, cli.text]) {
      expect(text).toContain('(errorCode: invalidInput)');
    }
    const surfaces = { mcp: mcp.text, cli: cli.text };
    for (const [surface, text] of Object.entries(surfaces)) {
      expect(text, surface).not.toBe('');
      for (const guidance of says) expect(text, surface).toContain(guidance);
      for (const banned of never) expect(text, surface).not.toContain(banned);
    }
  });
});
