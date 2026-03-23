import type { CodeLocation } from './core.js';

export interface SuspiciousString {
  lineStart: number;
  lineEnd: number;
  kind: 'hardcoded-secret' | 'sql-injection' | 'secret-assignment';
  snippet?: string;
  context?:
    | 'literal'
    | 'regex-definition'
    | 'template'
    | 'comment'
    | 'error-message';
}

export interface TimerCall {
  kind: 'setInterval' | 'setTimeout';
  lineStart: number;
  lineEnd: number;
  hasCleanup: boolean;
}

export interface TestBlock {
  name: string;
  lineStart: number;
  lineEnd: number;
  assertionCount: number;
}

export interface FocusedTestCall {
  kind:
    | 'it.only'
    | 'test.only'
    | 'describe.only'
    | 'it.skip'
    | 'test.skip'
    | 'describe.skip'
    | 'it.todo'
    | 'test.todo';
  lineStart: number;
  lineEnd: number;
}

export interface TimerControlCall {
  kind:
    | 'jest.useFakeTimers'
    | 'jest.useRealTimers'
    | 'vi.useFakeTimers'
    | 'vi.useRealTimers'
    | 'other';
  lineStart: number;
  lineEnd: number;
}

export interface MockControlCall extends CodeLocation {
  kind: 'spy' | 'stub' | 'restore' | 'restoreAll';
  target?: string;
}

export interface TestProfile {
  testBlocks: TestBlock[];
  mockCalls: CodeLocation[];
  setupCalls: Array<{
    kind: 'beforeAll' | 'beforeEach' | 'afterAll' | 'afterEach';
    lineStart: number;
  }>;
  mutableStateDecls: CodeLocation[];
  focusedCalls: FocusedTestCall[];
  timerControls: TimerControlCall[];
  mockRestores: MockControlCall[];
  spyOrStubCalls: MockControlCall[];
}

export interface InputSourceInfo {
  functionName: string;
  lineStart: number;
  lineEnd: number;
  sourceParams: string[];
  hasSinkInBody: boolean;
  sinkKinds: string[];
  hasValidation: boolean;
  callsWithInputArgs: Array<{ callee: string; lineStart: number }>;
  paramConfidence: 'high' | 'medium' | 'low';
}

export type TopLevelEffectKind =
  | 'sync-io'
  | 'exec-sync'
  | 'eval'
  | 'timer'
  | 'listener'
  | 'process-handler'
  | 'side-effect-import'
  | 'top-level-await'
  | 'dynamic-import';

export interface TopLevelEffect {
  kind: TopLevelEffectKind;
  lineStart: number;
  lineEnd: number;
  detail: string;
  weight: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface EffectProfile {
  totalEffects: number;
  totalWeight: number;
  byKind: Partial<Record<TopLevelEffectKind, number>>;
  highestRisk: TopLevelEffectKind | null;
}

export interface SymbolUsageSummary {
  declaredExportCount: number;
  importedSymbolCount: number;
  internalImportCount: number;
  externalImportCount: number;
  reExportCount: number;
  dominantInternalDependency: string | null;
}

export interface BoundaryRoleHint {
  role: string;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
}

export interface CfgFlags {
  hasValidationChecks: boolean;
  hasCleanupHooks: boolean;
  exitPointCount: number;
  asyncBoundaryCount: number;
  hasTopLevelEffects: boolean;
}
