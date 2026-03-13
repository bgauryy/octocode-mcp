import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LocalGetFileContentDataSchema,
  LocalGetFileContentOutputSchema,
  LocalSearchCodeDataSchema,
  LocalSearchCodeOutputSchema,
  LspGotoDefinitionDataSchema,
  LspGotoDefinitionOutputSchema,
} from '../../src/scheme/outputSchemas.js';
import { FLOW_CATALOG } from './catalog.js';
import {
  createFlowHarness,
  getFlowFixturePath,
  localResearchFlowTools,
} from './harness.js';
import { expectHasResultsData, getSingleResult } from './assertions.js';
import {
  configureLocalResearchFlowRuntime,
  resetLocalResearchFlowRuntime,
} from './runtime.mocks.js';

vi.mock('../../src/utils/exec/index.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/utils/exec/index.js')
  >('../../src/utils/exec/index.js');
  const runtime = await import('./runtime.mocks.js');

  return {
    ...actual,
    safeExec: runtime.mockSafeExec,
    checkCommandAvailability: runtime.mockCheckCommandAvailability,
  };
});

vi.mock('child_process', async () => {
  const runtime = await import('./runtime.mocks.js');
  return {
    spawn: runtime.mockSpawn,
  };
});

vi.mock('../../src/lsp/index.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/lsp/index.js')>(
    '../../src/lsp/index.js'
  );

  return {
    ...actual,
    createClient: vi.fn().mockResolvedValue(null),
    isLanguageServerAvailable: vi.fn().mockResolvedValue(false),
  };
});

describe(FLOW_CATALOG.localWhereIsXDefined.id, () => {
  const fixtureRepoPath = getFlowFixturePath('mini-ts-repo');
  const fixtureSourcePath = `${fixtureRepoPath}/src`;
  let harness: ReturnType<typeof createFlowHarness>;

  beforeEach(() => {
    process.env.WORKSPACE_ROOT = fixtureRepoPath;
    configureLocalResearchFlowRuntime(fixtureRepoPath);
    harness = createFlowHarness(localResearchFlowTools.whereIsXDefined);
  });

  afterEach(() => {
    delete process.env.WORKSPACE_ROOT;
    harness.cleanup();
    resetLocalResearchFlowRuntime();
  });

  it('chains localSearchCode -> lspGotoDefinition -> localGetFileContent via real handoff fields', async () => {
    const searchResponse = await harness.callTool('localSearchCode', {
      queries: [
        {
          id: 'search_compute_score_definition',
          pattern: 'export function computeScore',
          path: fixtureSourcePath,
          include: ['*.ts'],
          researchGoal: 'Find the computeScore definition',
          reasoning: 'Need lineHint before goto definition',
        },
      ],
    });

    const searchResult = expectHasResultsData(
      LocalSearchCodeOutputSchema,
      LocalSearchCodeDataSchema,
      searchResponse
    );
    const definitionFile = searchResult.files?.[0];
    const definitionMatch = definitionFile?.matches?.[0];

    expect(definitionFile?.path.endsWith('/src/score.ts')).toBe(true);
    expect(definitionMatch?.line).toBeTypeOf('number');

    const gotoResponse = await harness.callTool('lspGotoDefinition', {
      queries: [
        {
          id: 'goto_compute_score_definition',
          uri: definitionFile!.path,
          symbolName: 'computeScore',
          lineHint: definitionMatch!.line,
          researchGoal: 'Resolve the computeScore definition',
          reasoning: 'Use the lineHint from localSearchCode to jump to code',
        },
      ],
    });

    const gotoResult = expectHasResultsData(
      LspGotoDefinitionOutputSchema,
      LspGotoDefinitionDataSchema,
      gotoResponse
    );
    const location = gotoResult.locations?.[0];

    expect(location?.uri).toBe(definitionFile?.path);
    expect(location?.content).toContain('export function computeScore');

    const fileContentResponse = await harness.callTool('localGetFileContent', {
      queries: [
        {
          id: 'fetch_compute_score_definition',
          path: location!.uri,
          matchString: 'export function computeScore',
          researchGoal: 'Read the computeScore implementation',
          reasoning: 'Need the function body after locating the definition',
        },
      ],
    });

    const fileContentResult = expectHasResultsData(
      LocalGetFileContentOutputSchema,
      LocalGetFileContentDataSchema,
      fileContentResponse
    );

    expect(fileContentResult.content).toContain('normalizeScore');
    expect(fileContentResult.matchRanges?.length).toBeGreaterThan(0);
  });

  it('returns an empty result with guidance when the symbol handoff is stale', async () => {
    const gotoResponse = await harness.callTool('lspGotoDefinition', {
      queries: [
        {
          id: 'goto_missing_symbol',
          uri: `${fixtureSourcePath}/score.ts`,
          symbolName: 'missingScore',
          lineHint: 1,
          researchGoal: 'Resolve a stale symbol reference',
          reasoning: 'Verify the flow fails cleanly when the symbol changed',
        },
      ],
    });

    const gotoResult = getSingleResult(
      LspGotoDefinitionOutputSchema,
      gotoResponse
    );

    expect(gotoResult.status).toBe('empty');
    expect(gotoResult.data).toMatchObject({
      errorType: 'symbol_not_found',
    });
  });
});
