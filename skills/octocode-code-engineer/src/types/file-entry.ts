import type {
  BoundaryRoleHint,
  CfgFlags,
  EffectProfile,
  InputSourceInfo,
  SuspiciousString,
  SymbolUsageSummary,
  TestProfile,
  TimerCall,
  TopLevelEffect,
} from './collectors.js';
import type {
  CodeLocation,
  ConsoleLogEntry,
  FlowEntry,
  FunctionEntry,
  MagicNumberEntry,
  MessageChainEntry,
} from './core.js';
import type { DependencyProfile } from './dependency.js';

export interface FileEntry {
  package: string;
  file: string;
  parseEngine: string;
  nodeCount: number;
  kindCounts: Record<string, number>;
  functions: FunctionEntry[];
  flows: FlowEntry[];
  dependencyProfile: DependencyProfile;
  emptyCatches?: CodeLocation[];
  switchesWithoutDefault?: CodeLocation[];
  anyCount?: number;
  magicNumbers?: MagicNumberEntry[];
  typeAssertionEscapes?: {
    asAny: CodeLocation[];
    doubleAssertion: CodeLocation[];
    nonNull: CodeLocation[];
  };
  asyncWithoutAwait?: Array<{
    name: string;
    lineStart: number;
    lineEnd: number;
  }>;
  unprotectedAsync?: Array<{
    name: string;
    awaitCount: number;
    lineStart: number;
    lineEnd: number;
  }>;
  evalUsages?: CodeLocation[];
  unsafeHtmlAssignments?: CodeLocation[];
  suspiciousStrings?: SuspiciousString[];
  regexLiterals?: Array<{
    lineStart: number;
    lineEnd: number;
    pattern: string;
  }>;
  awaitInLoopLocations?: CodeLocation[];
  syncIoCalls?: Array<{ name: string; lineStart: number; lineEnd: number }>;
  timerCalls?: TimerCall[];
  listenerRegistrations?: CodeLocation[];
  listenerRemovals?: CodeLocation[];
  testProfile?: TestProfile;
  inputSources?: InputSourceInfo[];
  treeSitterNodeCount?: number;
  treeSitterError?: string;
  parserFallback?: string;
  topLevelEffects?: TopLevelEffect[];
  prototypePollutionSites?: Array<{
    kind: string;
    detail: string;
    lineStart: number;
    lineEnd: number;
    guarded: boolean;
  }>;
  effectProfile?: EffectProfile;
  symbolUsageSummary?: SymbolUsageSummary;
  boundaryRoleHints?: BoundaryRoleHint[];
  cfgFlags?: CfgFlags;
  consoleLogs?: ConsoleLogEntry[];
  messageChains?: MessageChainEntry[];
  issueIds?: string[];
}

export interface PackageFileSummary {
  fileCount: number;
  nodeCount: number;
  functionCount: number;
  flowCount: number;
  kindCounts: Record<string, number>;
  functions: FunctionEntry[];
  flows: FlowEntry[];
}

export interface PackageInfo {
  name: string;
  dir: string;
  folder: string;
}
