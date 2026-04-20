/**
 * LSP fallback-hint regression tests.
 *
 * Ensures each LSP tool emits an explicit "LSP unavailable" hint when
 * `isLanguageServerAvailable` returns false. Without this signal, agents
 * mistake the text-based fallback for real semantic results and report
 * "LSP isn't resolving symbols for this project (likely no TS server indexed)".
 *
 * @module tests/tools/lsp_fallback_hint.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// fs/promises — readFile / stat are used by each tool before the LSP path
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  stat: vi.fn(),
}));

vi.mock('child_process', () => ({
  exec: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: (fn: Function) => fn,
}));

vi.mock('../../src/lsp/resolver.js', () => {
  class MockSymbolResolutionError extends Error {
    searchRadius: number;
    constructor(message: string, searchRadius: number) {
      super(message);
      this.name = 'SymbolResolutionError';
      this.searchRadius = searchRadius;
    }
  }
  return {
    // must use regular function — invoked via `new SymbolResolver(...)`
    SymbolResolver: vi.fn().mockImplementation(function () {
      return {
        resolvePositionFromContent: vi.fn().mockReturnValue({
          position: { line: 3, character: 7 },
          foundAtLine: 4,
        }),
        extractContext: vi.fn().mockReturnValue({
          content: 'const testSymbol = 1;',
          startLine: 3,
          endLine: 5,
        }),
      };
    }),
    SymbolResolutionError: MockSymbolResolutionError,
  };
});

vi.mock('../../src/lsp/manager.js', async importOriginal => {
  const actual = await importOriginal<object>();
  return {
    ...actual,
    createClient: vi.fn().mockResolvedValue(null),
    isLanguageServerAvailable: vi.fn().mockResolvedValue(false),
  };
});

// Force the pattern-matching fallback for find references to an empty result
// (keeps the test independent of ripgrep being on PATH).
vi.mock(
  '../../src/tools/lsp_find_references/lspReferencesPatterns.js',
  async () => ({
    findReferencesWithPatternMatching: vi.fn().mockResolvedValue({
      status: 'empty',
      hints: [],
    }),
    escapeForRegex: (v: string) => v,
  })
);

vi.mock(
  '../../src/tools/lsp_call_hierarchy/callHierarchyPatterns.js',
  async () => ({
    callHierarchyWithPatternMatching: vi.fn().mockResolvedValue({
      status: 'empty',
      hints: [],
    }),
    parseRipgrepJsonOutput: vi.fn(),
    parseGrepOutput: vi.fn(),
    extractFunctionBody: vi.fn(),
  })
);

import * as fs from 'fs/promises';
import * as managerModule from '../../src/lsp/manager.js';

import { findReferences } from '../../src/tools/lsp_find_references/lsp_find_references.js';
import { processCallHierarchy } from '../../src/tools/lsp_call_hierarchy/callHierarchy.js';

const SAMPLE = `
export function testSymbol(): void {
  return;
}
`.trim();

const LSP_UNAVAILABLE_RE =
  /LSP unavailable|text-based fallback|install typescript-language-server/i;

describe('LSP fallback hint — surfaced when isLanguageServerAvailable=false', () => {
  const testPath = `${process.cwd()}/src/testfile.ts`;

  beforeEach(() => {
    process.env.WORKSPACE_ROOT = process.cwd();
    vi.mocked(fs.readFile).mockResolvedValue(SAMPLE);
    vi.mocked(fs.stat).mockResolvedValue({
      isFile: () => true,
    } as unknown as Awaited<ReturnType<typeof fs.stat>>);
    vi.mocked(managerModule.isLanguageServerAvailable).mockResolvedValue(false);
    vi.mocked(managerModule.createClient).mockResolvedValue(null);
  });

  afterEach(() => {
    delete process.env.WORKSPACE_ROOT;
    vi.clearAllMocks();
  });

  it('lspFindReferences emits an LSP-unavailable hint', async () => {
    const result = await findReferences({
      uri: testPath,
      symbolName: 'testSymbol',
      lineHint: 4,
      mainResearchGoal: 'g',
      researchGoal: 'g',
      reasoning: 'r',
    } as Parameters<typeof findReferences>[0]);

    const hints = (result.hints ?? []).filter(Boolean) as string[];
    expect(
      hints.some(h => LSP_UNAVAILABLE_RE.test(h)),
      `expected an LSP-unavailable hint, got: ${JSON.stringify(hints)}`
    ).toBe(true);
  });

  it('lspCallHierarchy emits an LSP-unavailable hint', async () => {
    const result = await processCallHierarchy({
      uri: testPath,
      symbolName: 'testSymbol',
      lineHint: 4,
      direction: 'incoming',
      mainResearchGoal: 'g',
      researchGoal: 'g',
      reasoning: 'r',
    } as Parameters<typeof processCallHierarchy>[0]);

    const hints = (result.hints ?? []).filter(Boolean) as string[];
    expect(
      hints.some(h => LSP_UNAVAILABLE_RE.test(h)),
      `expected an LSP-unavailable hint, got: ${JSON.stringify(hints)}`
    ).toBe(true);
  });
});

describe('LSP goto-definition fallback hint', () => {
  const testPath = `${process.cwd()}/src/testfile.ts`;

  beforeEach(() => {
    process.env.WORKSPACE_ROOT = process.cwd();
    vi.mocked(fs.readFile).mockResolvedValue(SAMPLE);
    vi.mocked(managerModule.isLanguageServerAvailable).mockResolvedValue(false);
    vi.mocked(managerModule.createClient).mockResolvedValue(null);
  });

  afterEach(() => {
    delete process.env.WORKSPACE_ROOT;
    vi.clearAllMocks();
  });

  it('createFallbackResult path emits the LSP-unavailable hint', async () => {
    // gotoDefinition is module-private; drive it via the registered handler.
    const { registerLSPGotoDefinitionTool } =
      await import('../../src/tools/lsp_goto_definition/lsp_goto_definition.js');
    const calls: unknown[] = [];
    const mockServer = {
      registerTool: vi.fn((_n, _c, handler) => {
        calls.push(handler);
        return handler;
      }),
    };
    registerLSPGotoDefinitionTool(mockServer as never);
    const handler = calls[0] as (args: {
      queries: unknown[];
    }) => Promise<{ content: { text: string }[] }>;

    const result = await handler({
      queries: [
        {
          uri: testPath,
          symbolName: 'testSymbol',
          lineHint: 4,
          mainResearchGoal: 'g',
          researchGoal: 'g',
          reasoning: 'r',
        },
      ],
    });

    const text = result.content?.[0]?.text ?? '';
    expect(
      LSP_UNAVAILABLE_RE.test(text),
      `expected LSP-unavailable hint in serialized output, got: ${text.slice(0, 400)}`
    ).toBe(true);
  });
});
