import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  createSemanticContext,
  analyzeSemanticProfile,
  collectAllAbsoluteFiles,
} from './semantic.js';
import type { SemanticProfile, SemanticContext } from './semantic.js';
import {
  detectSemanticDeadExports,
  detectOverAbstraction,
  detectConcreteDependency,
  detectCircularTypeDependency,
  detectUnusedParameters,
  detectTypeHierarchyDepth,
  detectDeepOverrideChain,
  detectInterfaceCompliance,
  detectUnusedImports,
  detectOrphanImplementation,
  detectShotgunSurgery,
  detectMoveToCaller,
  detectLeakyAbstraction,
  detectNarrowableType,
  runSemanticDetectors,
} from './semantic-detectors.js';
import type { FileEntry, DependencyProfile, DependencyState } from './types.js';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sem-test-'));
}

function writeFiles(dir: string, files: Record<string, string>): void {
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(dir, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

function makeFileEntry(file: string, overrides: Partial<FileEntry> = {}): FileEntry {
  return {
    package: 'test',
    file,
    parseEngine: 'typescript',
    nodeCount: 0,
    kindCounts: {},
    functions: [],
    flows: [],
    dependencyProfile: {
      internalDependencies: [],
      externalDependencies: [],
      unresolvedDependencies: [],
      declaredExports: [],
      importedSymbols: [],
      reExports: [],
    },
    ...overrides,
  };
}

function makeProfile(file: string, overrides: Partial<SemanticProfile> = {}): SemanticProfile {
  return {
    file,
    referenceCountByExport: new Map(),
    unusedParams: [],
    interfaceImpls: [],
    typeHierarchyDepth: 0,
    typeHierarchies: [],
    overrideChains: [],
    abstractnessRatio: 0,
    unusedImports: [],
    concreteImports: [],
    leakyReturns: [],
    narrowableParams: [],
    ...overrides,
  };
}

describe('createSemanticContext', () => {
  it('creates context from valid TypeScript files', () => {
    const dir = makeTempDir();
    writeFiles(dir, {
      'a.ts': 'export const x = 1;\n',
      'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'node', strict: true } }),
    });
    const ctx = createSemanticContext([path.join(dir, 'a.ts')], dir);
    expect(ctx.service).toBeDefined();
    expect(ctx.checker).toBeDefined();
    expect(ctx.program).toBeDefined();
    fs.rmSync(dir, { recursive: true });
  });

  it('works without tsconfig.json (uses defaults)', () => {
    const dir = makeTempDir();
    writeFiles(dir, { 'b.ts': 'export function foo() { return 42; }\n' });
    const ctx = createSemanticContext([path.join(dir, 'b.ts')], dir);
    expect(ctx.program.getSourceFile(path.join(dir, 'b.ts'))).toBeDefined();
    fs.rmSync(dir, { recursive: true });
  });
});

describe('detectSemanticDeadExports', () => {
  it('flags exports with zero references', () => {
    const profile = makeProfile('test.ts', {
      referenceCountByExport: new Map([
        ['usedFn', { count: 5, uniqueFiles: 3, lineStart: 1, lineEnd: 3 }],
        ['deadFn', { count: 0, uniqueFiles: 0, lineStart: 10, lineEnd: 15 }],
        ['anotherDead', { count: 0, uniqueFiles: 0, lineStart: 20, lineEnd: 25 }],
      ]),
    });
    const findings = detectSemanticDeadExports([profile]);
    expect(findings.length).toBe(2);
    expect(findings.every((f) => f.category === 'semantic-dead-export')).toBe(true);
    expect(findings.every((f) => f.severity === 'high')).toBe(true);
    expect(findings.every((f) => f.lspHints && f.lspHints.length > 0)).toBe(true);
    expect(findings[0].lineStart).toBe(10);
    expect(findings[1].lineStart).toBe(20);
  });

  it('skips exports with references', () => {
    const profile = makeProfile('test.ts', {
      referenceCountByExport: new Map([['usedFn', { count: 3, uniqueFiles: 2, lineStart: 1, lineEnd: 5 }]]),
    });
    expect(detectSemanticDeadExports([profile])).toHaveLength(0);
  });
});

describe('detectConcreteDependency', () => {
  it('flags concrete class imports', () => {
    const profile = makeProfile('consumer.ts', {
      concreteImports: [
        { name: 'MyService', targetFile: 'service.ts', lineStart: 5 },
      ],
    });
    const findings = detectConcreteDependency([profile]);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('concrete-dependency');
    expect(findings[0].title).toContain('MyService');
    expect(findings[0].lspHints?.[0]?.tool).toBe('lspGotoDefinition');
  });

  it('produces no findings when no concrete imports', () => {
    const profile = makeProfile('consumer.ts', { concreteImports: [] });
    expect(detectConcreteDependency([profile])).toHaveLength(0);
  });
});

describe('detectUnusedParameters', () => {
  it('flags unused parameters', () => {
    const profile = makeProfile('handler.ts', {
      unusedParams: [
        { functionName: 'handleRequest', paramName: 'ctx', lineStart: 10, lineEnd: 25 },
      ],
    });
    const findings = detectUnusedParameters([profile]);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('unused-parameter');
    expect(findings[0].title).toContain('ctx');
    expect(findings[0].title).toContain('handleRequest');
    expect(findings[0].lspHints?.[0]?.tool).toBe('lspFindReferences');
  });

  it('produces no findings when all params used', () => {
    const profile = makeProfile('handler.ts', { unusedParams: [] });
    expect(detectUnusedParameters([profile])).toHaveLength(0);
  });
});

describe('detectTypeHierarchyDepth', () => {
  it('flags deep inheritance chains', () => {
    const profile = makeProfile('deep.ts', {
      typeHierarchies: [
        { name: 'DeepChild', depth: 5, chain: ['Base', 'Mid1', 'Mid2', 'Mid3', 'Parent'], lineStart: 20 },
      ],
    });
    const findings = detectTypeHierarchyDepth([profile], 4);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('type-hierarchy-depth');
    expect(findings[0].title).toContain('depth 5');
    expect(findings[0].severity).toBe('medium');
  });

  it('flags very deep chains as high severity', () => {
    const profile = makeProfile('deep.ts', {
      typeHierarchies: [
        { name: 'VeryDeep', depth: 7, chain: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], lineStart: 10 },
      ],
    });
    const findings = detectTypeHierarchyDepth([profile], 4);
    expect(findings[0].severity).toBe('high');
  });

  it('does not flag shallow hierarchies', () => {
    const profile = makeProfile('shallow.ts', {
      typeHierarchies: [
        { name: 'Child', depth: 2, chain: ['Base', 'Parent'], lineStart: 5 },
      ],
    });
    expect(detectTypeHierarchyDepth([profile], 4)).toHaveLength(0);
  });
});

describe('detectDeepOverrideChain', () => {
  it('flags deep method override chains', () => {
    const profile = makeProfile('overrides.ts', {
      overrideChains: [
        { methodName: 'render', className: 'SuperWidget', depth: 4, chain: [], lineStart: 30 },
      ],
    });
    const findings = detectDeepOverrideChain([profile], 3);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('deep-override-chain');
    expect(findings[0].title).toContain('render');
    expect(findings[0].title).toContain('SuperWidget');
  });

  it('does not flag shallow overrides', () => {
    const profile = makeProfile('overrides.ts', {
      overrideChains: [
        { methodName: 'render', className: 'Widget', depth: 1, chain: [], lineStart: 10 },
      ],
    });
    expect(detectDeepOverrideChain([profile], 3)).toHaveLength(0);
  });
});

describe('detectInterfaceCompliance', () => {
  it('flags missing members', () => {
    const profile = makeProfile('impl.ts', {
      interfaceImpls: [{
        interfaceName: 'IService',
        className: 'MyService',
        classFile: 'impl.ts',
        classLine: 15,
        missingMembers: ['init', 'destroy'],
        anycastMembers: [],
      }],
    });
    const findings = detectInterfaceCompliance([profile]);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('interface-compliance');
    expect(findings[0].severity).toBe('high');
    expect(findings[0].reason).toContain('init');
  });

  it('flags any-cast members', () => {
    const profile = makeProfile('impl.ts', {
      interfaceImpls: [{
        interfaceName: 'IRepo',
        className: 'MyRepo',
        classFile: 'impl.ts',
        classLine: 20,
        missingMembers: [],
        anycastMembers: ['save'],
      }],
    });
    const findings = detectInterfaceCompliance([profile]);
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].reason).toContain('any-cast');
  });

  it('produces no findings for clean implementations', () => {
    const profile = makeProfile('impl.ts', { interfaceImpls: [] });
    expect(detectInterfaceCompliance([profile])).toHaveLength(0);
  });
});

describe('detectUnusedImports', () => {
  it('flags imports with zero usage', () => {
    const profile = makeProfile('consumer.ts', {
      unusedImports: [
        { name: 'unusedHelper', lineStart: 3 },
      ],
    });
    const findings = detectUnusedImports([profile]);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('unused-import');
    expect(findings[0].severity).toBe('low');
    expect(findings[0].title).toContain('unusedHelper');
  });

  it('produces no findings when all imports used', () => {
    const profile = makeProfile('consumer.ts', { unusedImports: [] });
    expect(detectUnusedImports([profile])).toHaveLength(0);
  });
});

describe('detectCircularTypeDependency', () => {
  it('returns empty for non-circular types', () => {
    const dir = makeTempDir();
    writeFiles(dir, {
      'a.ts': 'export interface A { x: number; }\n',
      'b.ts': 'import type { A } from "./a";\nexport interface B { a: A; }\n',
    });
    const ctx = createSemanticContext([path.join(dir, 'a.ts'), path.join(dir, 'b.ts')], dir);
    const profileA = makeProfile('a.ts');
    const profileB = makeProfile('b.ts');
    const findings = detectCircularTypeDependency(ctx, [profileA, profileB]);
    expect(findings.length).toBe(0);
    fs.rmSync(dir, { recursive: true });
  });
});

describe('runSemanticDetectors', () => {
  it('aggregates findings from all detectors', () => {
    const dir = makeTempDir();
    writeFiles(dir, {
      'test.ts': 'export const x = 1;\n',
    });
    const ctx = createSemanticContext([path.join(dir, 'test.ts')], dir);
    const profile = makeProfile('test.ts', {
      referenceCountByExport: new Map([['deadExport', { count: 0, uniqueFiles: 0, lineStart: 5, lineEnd: 5 }]]),
      unusedParams: [{ functionName: 'fn', paramName: 'p', lineStart: 1, lineEnd: 1 }],
      unusedImports: [{ name: 'unused', lineStart: 1 }],
    });
    const findings = runSemanticDetectors(ctx, [profile]);
    const categories = new Set(findings.map((f) => f.category));
    expect(categories.has('unused-parameter')).toBe(true);
    expect(categories.has('unused-import')).toBe(true);
    fs.rmSync(dir, { recursive: true });
  });
});

describe('collectAllAbsoluteFiles', () => {
  it('merges files from summaries and dependency state', () => {
    const dir = makeTempDir();
    writeFiles(dir, {
      'a.ts': 'export const a = 1;',
      'b.ts': 'export const b = 2;',
      'c.ts': 'export const c = 3;',
    });
    const entries: FileEntry[] = [makeFileEntry('a.ts'), makeFileEntry('b.ts')];
    const state: DependencyState = {
      files: new Set(['b.ts', 'c.ts']),
      outgoing: new Map(),
      incoming: new Map(),
      incomingFromTests: new Map(),
      incomingFromProduction: new Map(),
      externalCounts: new Map(),
      unresolvedCounts: new Map(),
      declaredExportsByFile: new Map(),
      importedSymbolsByFile: new Map(),
      reExportsByFile: new Map(),
    };
    const result = collectAllAbsoluteFiles(entries, state, dir);
    expect(result.length).toBe(3);
    expect(result).toContain(path.join(dir, 'a.ts'));
    expect(result).toContain(path.join(dir, 'b.ts'));
    expect(result).toContain(path.join(dir, 'c.ts'));
    fs.rmSync(dir, { recursive: true });
  });
});

describe('SEMANTIC_CATEGORIES constant', () => {
  it('has exactly 13 semantic categories', async () => {
    const { SEMANTIC_CATEGORIES } = await import('./types.js');
    expect(SEMANTIC_CATEGORIES.size).toBe(13);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Integration tests: real TypeScript files → semantic pipeline → detectors
// ═══════════════════════════════════════════════════════════════════════════

function setupCtx(dir: string, files: Record<string, string>) {
  writeFiles(dir, files);
  const absPaths = Object.keys(files).filter((f) => f.endsWith('.ts')).map((f) => path.join(dir, f));
  return createSemanticContext(absPaths, dir);
}

describe('integration: semantic-dead-export', () => {
  it('detects an export that no other file imports', () => {
    const dir = makeTempDir();
    const ctx = setupCtx(dir, {
      'lib.ts': [
        'export function usedFn() { return 1; }',
        'export function deadFn() { return 2; }',
      ].join('\n'),
      'consumer.ts': [
        'import { usedFn } from "./lib";',
        'console.log(usedFn());',
      ].join('\n'),
    });
    const entry = makeFileEntry('lib.ts', {
      dependencyProfile: {
        internalDependencies: [], externalDependencies: [], unresolvedDependencies: [],
        declaredExports: [
          { name: 'usedFn', kind: 'value', lineStart: 1, lineEnd: 1 },
          { name: 'deadFn', kind: 'value', lineStart: 2, lineEnd: 2 },
        ],
        importedSymbols: [], reExports: [],
      },
    });
    const profile = analyzeSemanticProfile(ctx, path.join(dir, 'lib.ts'), entry);
    const deadInfo = profile.referenceCountByExport.get('deadFn');
    const usedInfo = profile.referenceCountByExport.get('usedFn');
    expect(deadInfo?.count).toBe(0);
    expect(usedInfo!.count).toBeGreaterThan(0);

    const findings = detectSemanticDeadExports([profile]);
    expect(findings.length).toBe(1);
    expect(findings[0].title).toContain('deadFn');
    expect(findings[0].lineStart).toBe(2);
    expect(findings[0].lspHints![0].lineHint).toBe(2);
    fs.rmSync(dir, { recursive: true });
  });

  it('does not flag exports that are referenced', () => {
    const dir = makeTempDir();
    const ctx = setupCtx(dir, {
      'util.ts': 'export const FOO = 42;\n',
      'main.ts': 'import { FOO } from "./util";\nconsole.log(FOO);\n',
    });
    const entry = makeFileEntry('util.ts', {
      dependencyProfile: {
        internalDependencies: [], externalDependencies: [], unresolvedDependencies: [],
        declaredExports: [{ name: 'FOO', kind: 'value', lineStart: 1, lineEnd: 1 }],
        importedSymbols: [], reExports: [],
      },
    });
    const profile = analyzeSemanticProfile(ctx, path.join(dir, 'util.ts'), entry);
    expect(detectSemanticDeadExports([profile])).toHaveLength(0);
    fs.rmSync(dir, { recursive: true });
  });
});

describe('integration: unused-parameter', () => {
  it('detects function parameter never used in body', () => {
    const dir = makeTempDir();
    const ctx = setupCtx(dir, {
      'handler.ts': [
        'export function process(data: string, unused: number): string {',
        '  return data.trim();',
        '}',
      ].join('\n'),
    });
    const entry = makeFileEntry('handler.ts', {
      functions: [{
        kind: 'function', name: 'process', nameHint: 'process',
        file: 'handler.ts', lineStart: 1, lineEnd: 3, columnStart: 0, columnEnd: 0,
        statementCount: 1, complexity: 1, maxBranchDepth: 0, maxLoopDepth: 0,
        returns: 1, awaits: 0, calls: 1, loops: 0, lengthLines: 3,
        cognitiveComplexity: 0, params: 2,
      }],
    });
    const profile = analyzeSemanticProfile(ctx, path.join(dir, 'handler.ts'), entry);
    expect(profile.unusedParams.length).toBe(1);
    expect(profile.unusedParams[0].paramName).toBe('unused');
    expect(profile.unusedParams[0].functionName).toBe('process');

    const findings = detectUnusedParameters([profile]);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('unused-parameter');
    expect(findings[0].title).toContain('unused');
    fs.rmSync(dir, { recursive: true });
  });

  it('does not flag parameters that are used', () => {
    const dir = makeTempDir();
    const ctx = setupCtx(dir, {
      'fn.ts': [
        'export function add(a: number, b: number): number {',
        '  return a + b;',
        '}',
      ].join('\n'),
    });
    const entry = makeFileEntry('fn.ts', {
      functions: [{
        kind: 'function', name: 'add', nameHint: 'add',
        file: 'fn.ts', lineStart: 1, lineEnd: 3, columnStart: 0, columnEnd: 0,
        statementCount: 1, complexity: 1, maxBranchDepth: 0, maxLoopDepth: 0,
        returns: 1, awaits: 0, calls: 0, loops: 0, lengthLines: 3,
        cognitiveComplexity: 0, params: 2,
      }],
    });
    const profile = analyzeSemanticProfile(ctx, path.join(dir, 'fn.ts'), entry);
    expect(profile.unusedParams).toHaveLength(0);
    fs.rmSync(dir, { recursive: true });
  });

  it('ignores underscore-prefixed params', () => {
    const dir = makeTempDir();
    const ctx = setupCtx(dir, {
      'skip.ts': [
        'export function handle(_event: string, data: number): number {',
        '  return data;',
        '}',
      ].join('\n'),
    });
    const entry = makeFileEntry('skip.ts', {
      functions: [{
        kind: 'function', name: 'handle', nameHint: 'handle',
        file: 'skip.ts', lineStart: 1, lineEnd: 3, columnStart: 0, columnEnd: 0,
        statementCount: 1, complexity: 1, maxBranchDepth: 0, maxLoopDepth: 0,
        returns: 1, awaits: 0, calls: 0, loops: 0, lengthLines: 3,
        cognitiveComplexity: 0, params: 2,
      }],
    });
    const profile = analyzeSemanticProfile(ctx, path.join(dir, 'skip.ts'), entry);
    expect(profile.unusedParams).toHaveLength(0);
    fs.rmSync(dir, { recursive: true });
  });
});

describe('integration: type-hierarchy-depth', () => {
  it('detects deep inheritance chain', () => {
    const dir = makeTempDir();
    const ctx = setupCtx(dir, {
      'deep.ts': [
        'class L0 { x = 1; }',
        'class L1 extends L0 { y = 2; }',
        'class L2 extends L1 { z = 3; }',
        'class L3 extends L2 { w = 4; }',
        'class L4 extends L3 { v = 5; }',
        'export class L5 extends L4 { u = 6; }',
      ].join('\n'),
    });
    const entry = makeFileEntry('deep.ts');
    const profile = analyzeSemanticProfile(ctx, path.join(dir, 'deep.ts'), entry);
    expect(profile.typeHierarchyDepth).toBeGreaterThanOrEqual(5);
    const l5 = profile.typeHierarchies.find((h) => h.name === 'L5');
    expect(l5).toBeDefined();
    expect(l5!.depth).toBe(5);

    const findings = detectTypeHierarchyDepth([profile], 4);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings.some((f) => f.title.includes('L5'))).toBe(true);
    fs.rmSync(dir, { recursive: true });
  });

  it('does not flag shallow hierarchies', () => {
    const dir = makeTempDir();
    const ctx = setupCtx(dir, {
      'shallow.ts': [
        'class Base { x = 1; }',
        'export class Child extends Base { y = 2; }',
      ].join('\n'),
    });
    const entry = makeFileEntry('shallow.ts');
    const profile = analyzeSemanticProfile(ctx, path.join(dir, 'shallow.ts'), entry);
    expect(profile.typeHierarchyDepth).toBeLessThanOrEqual(1);
    expect(detectTypeHierarchyDepth([profile], 4)).toHaveLength(0);
    fs.rmSync(dir, { recursive: true });
  });
});

describe('integration: deep-override-chain', () => {
  it('detects method overridden deep in hierarchy', () => {
    const dir = makeTempDir();
    const ctx = setupCtx(dir, {
      'override.ts': [
        'class Base { render(): string { return "base"; } }',
        'class Mid1 extends Base { render(): string { return "mid1"; } }',
        'class Mid2 extends Mid1 { render(): string { return "mid2"; } }',
        'class Mid3 extends Mid2 { render(): string { return "mid3"; } }',
        'export class Leaf extends Mid3 { render(): string { return "leaf"; } }',
      ].join('\n'),
    });
    const entry = makeFileEntry('override.ts');
    const profile = analyzeSemanticProfile(ctx, path.join(dir, 'override.ts'), entry);
    const leafOverrides = profile.overrideChains.filter((c) => c.className === 'Leaf');
    expect(leafOverrides.length).toBeGreaterThanOrEqual(1);
    expect(leafOverrides[0].methodName).toBe('render');
    expect(leafOverrides[0].depth).toBeGreaterThanOrEqual(4);

    const findings = detectDeepOverrideChain([profile], 3);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings.some((f) => f.title.includes('render') && f.title.includes('Leaf'))).toBe(true);
    fs.rmSync(dir, { recursive: true });
  });
});

describe('integration: over-abstraction', () => {
  it('detects interface with exactly one implementor', () => {
    const dir = makeTempDir();
    const ctx = setupCtx(dir, {
      'svc.ts': [
        'export interface IService { run(): void; }',
        'export class MyService implements IService { run() {} }',
      ].join('\n'),
    });
    const profiles = [makeProfile('svc.ts')];
    const findings = detectOverAbstraction(ctx, profiles);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('over-abstraction');
    expect(findings[0].title).toContain('IService');
    expect(findings[0].lspHints![0].symbolName).toBe('IService');
    fs.rmSync(dir, { recursive: true });
  });
});

describe('integration: concrete-dependency', () => {
  it('detects import of concrete class via analyzeSemanticProfile', () => {
    const dir = makeTempDir();
    const ctx = setupCtx(dir, {
      'service.ts': 'export class DbService { save() {} }\n',
      'consumer.ts': [
        'import { DbService } from "./service";',
        'export function run(db: DbService) { db.save(); }',
      ].join('\n'),
    });
    const entry = makeFileEntry('consumer.ts', {
      dependencyProfile: {
        internalDependencies: ['service.ts'], externalDependencies: [], unresolvedDependencies: [],
        declaredExports: [],
        importedSymbols: [{
          sourceModule: './service', resolvedModule: 'service.ts',
          importedName: 'DbService', localName: 'DbService',
          isTypeOnly: false, lineStart: 1, lineEnd: 1,
        }],
        reExports: [],
      },
    });
    const profile = analyzeSemanticProfile(ctx, path.join(dir, 'consumer.ts'), entry);
    expect(profile.concreteImports.length).toBe(1);
    expect(profile.concreteImports[0].name).toBe('DbService');

    const findings = detectConcreteDependency([profile]);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('concrete-dependency');
    expect(findings[0].title).toContain('DbService');
    fs.rmSync(dir, { recursive: true });
  });

  it('does not flag import of abstract class', () => {
    const dir = makeTempDir();
    const ctx = setupCtx(dir, {
      'base.ts': 'export abstract class BaseService { abstract save(): void; }\n',
      'consumer2.ts': [
        'import { BaseService } from "./base";',
        'export function run(svc: BaseService) { svc.save(); }',
      ].join('\n'),
    });
    const entry = makeFileEntry('consumer2.ts', {
      dependencyProfile: {
        internalDependencies: ['base.ts'], externalDependencies: [], unresolvedDependencies: [],
        declaredExports: [],
        importedSymbols: [{
          sourceModule: './base', resolvedModule: 'base.ts',
          importedName: 'BaseService', localName: 'BaseService',
          isTypeOnly: false, lineStart: 1, lineEnd: 1,
        }],
        reExports: [],
      },
    });
    const profile = analyzeSemanticProfile(ctx, path.join(dir, 'consumer2.ts'), entry);
    expect(profile.concreteImports).toHaveLength(0);
    fs.rmSync(dir, { recursive: true });
  });
});

describe('integration: unused-import', () => {
  it('detects import that is never used in the file', () => {
    const dir = makeTempDir();
    const ctx = setupCtx(dir, {
      'utils.ts': 'export function helper() { return 1; }\nexport function unused() { return 2; }\n',
      'main.ts': [
        'import { helper, unused } from "./utils";',
        'console.log(helper());',
      ].join('\n'),
    });
    const entry = makeFileEntry('main.ts', {
      dependencyProfile: {
        internalDependencies: ['utils.ts'], externalDependencies: [], unresolvedDependencies: [],
        declaredExports: [],
        importedSymbols: [
          { sourceModule: './utils', importedName: 'helper', localName: 'helper', isTypeOnly: false, lineStart: 1, lineEnd: 1 },
          { sourceModule: './utils', importedName: 'unused', localName: 'unused', isTypeOnly: false, lineStart: 1, lineEnd: 1 },
        ],
        reExports: [],
      },
    });
    const profile = analyzeSemanticProfile(ctx, path.join(dir, 'main.ts'), entry);
    expect(profile.unusedImports.length).toBe(1);
    expect(profile.unusedImports[0].name).toBe('unused');

    const findings = detectUnusedImports([profile]);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('unused-import');
    expect(findings[0].title).toContain('unused');
    fs.rmSync(dir, { recursive: true });
  });
});

describe('integration: orphan-implementation', () => {
  it('detects exported class with no external references and no interface', () => {
    const dir = makeTempDir();
    const ctx = setupCtx(dir, {
      'orphan.ts': [
        'export class OrphanClass {',
        '  doStuff() { return 42; }',
        '}',
      ].join('\n'),
    });
    const profiles = [makeProfile('orphan.ts')];
    const findings = detectOrphanImplementation(ctx, profiles);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('orphan-implementation');
    expect(findings[0].title).toContain('OrphanClass');
    expect(findings[0].lspHints![0].symbolName).toBe('OrphanClass');
    fs.rmSync(dir, { recursive: true });
  });

  it('does not flag class that is imported by another file', () => {
    const dir = makeTempDir();
    const ctx = setupCtx(dir, {
      'used.ts': 'export class UsedClass { run() {} }\n',
      'consumer.ts': 'import { UsedClass } from "./used";\nnew UsedClass().run();\n',
    });
    const profiles = [makeProfile('used.ts')];
    const findings = detectOrphanImplementation(ctx, profiles);
    expect(findings).toHaveLength(0);
    fs.rmSync(dir, { recursive: true });
  });

  it('does not flag class that implements an interface', () => {
    const dir = makeTempDir();
    const ctx = setupCtx(dir, {
      'impl.ts': [
        'interface IWorker { work(): void; }',
        'export class Worker implements IWorker { work() {} }',
      ].join('\n'),
    });
    const profiles = [makeProfile('impl.ts')];
    const findings = detectOrphanImplementation(ctx, profiles);
    expect(findings).toHaveLength(0);
    fs.rmSync(dir, { recursive: true });
  });
});

describe('integration: circular-type-dependency', () => {
  it('detects circular type references between two types', () => {
    const dir = makeTempDir();
    const ctx = setupCtx(dir, {
      'types.ts': [
        'export interface NodeA { child: NodeB; }',
        'export interface NodeB { parent: NodeA; }',
      ].join('\n'),
    });
    const profiles = [makeProfile('types.ts')];
    const findings = detectCircularTypeDependency(ctx, profiles);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].category).toBe('circular-type-dependency');
    fs.rmSync(dir, { recursive: true });
  });

  it('does not flag non-circular types', () => {
    const dir = makeTempDir();
    const ctx = setupCtx(dir, {
      'linear.ts': [
        'export interface Req { url: string; }',
        'export interface Res { body: string; }',
      ].join('\n'),
    });
    const profiles = [makeProfile('linear.ts')];
    const findings = detectCircularTypeDependency(ctx, profiles);
    expect(findings).toHaveLength(0);
    fs.rmSync(dir, { recursive: true });
  });
});

describe('integration: interface-compliance', () => {
  it('detects class with any-cast member implementing interface', () => {
    const dir = makeTempDir();
    const ctx = setupCtx(dir, {
      'compliance.ts': [
        'interface ILogger { log(msg: string): void; level: string; }',
        'export class BadLogger implements ILogger {',
        '  log(msg: any): void { console.log(msg); }',
        '  level: any = "info";',
        '}',
      ].join('\n'),
    });
    const entry = makeFileEntry('compliance.ts');
    const profile = analyzeSemanticProfile(ctx, path.join(dir, 'compliance.ts'), entry);
    expect(profile.interfaceImpls.length).toBeGreaterThanOrEqual(1);
    const impl = profile.interfaceImpls.find((i) => i.className === 'BadLogger');
    expect(impl).toBeDefined();
    expect(impl!.anycastMembers.length).toBeGreaterThanOrEqual(1);

    const findings = detectInterfaceCompliance([profile]);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].category).toBe('interface-compliance');
    fs.rmSync(dir, { recursive: true });
  });
});

describe('integration: includeTests filtering', () => {
  it('excludes test-file refs by default (includeTests=false)', () => {
    const dir = makeTempDir();
    const ctx = setupCtx(dir, {
      'lib.ts': 'export function internalOnly() { return 1; }\n',
      'lib.test.ts': 'import { internalOnly } from "./lib";\ninternalOnly();\n',
    });
    const entry = makeFileEntry('lib.ts', {
      dependencyProfile: {
        internalDependencies: [], externalDependencies: [], unresolvedDependencies: [],
        declaredExports: [{ name: 'internalOnly', kind: 'value', lineStart: 1, lineEnd: 1 }],
        importedSymbols: [], reExports: [],
      },
    });
    const profile = analyzeSemanticProfile(ctx, path.join(dir, 'lib.ts'), entry, false);
    const info = profile.referenceCountByExport.get('internalOnly');
    expect(info?.count).toBe(0);

    const findings = detectSemanticDeadExports([profile]);
    expect(findings.length).toBe(1);
    expect(findings[0].title).toContain('internalOnly');
    fs.rmSync(dir, { recursive: true });
  });

  it('includes test-file refs when includeTests=true', () => {
    const dir = makeTempDir();
    const ctx = setupCtx(dir, {
      'lib.ts': 'export function internalOnly() { return 1; }\n',
      'lib.test.ts': 'import { internalOnly } from "./lib";\ninternalOnly();\n',
    });
    const entry = makeFileEntry('lib.ts', {
      dependencyProfile: {
        internalDependencies: [], externalDependencies: [], unresolvedDependencies: [],
        declaredExports: [{ name: 'internalOnly', kind: 'value', lineStart: 1, lineEnd: 1 }],
        importedSymbols: [], reExports: [],
      },
    });
    const profile = analyzeSemanticProfile(ctx, path.join(dir, 'lib.ts'), entry, true);
    const info = profile.referenceCountByExport.get('internalOnly');
    expect(info!.count).toBeGreaterThan(0);

    const findings = detectSemanticDeadExports([profile]);
    expect(findings).toHaveLength(0);
    fs.rmSync(dir, { recursive: true });
  });
});

describe('integration: full pipeline runSemanticDetectors', () => {
  it('finds multiple issues in a multi-file project', () => {
    const dir = makeTempDir();
    const ctx = setupCtx(dir, {
      'types.ts': [
        'export interface NodeA { child: NodeB; }',
        'export interface NodeB { parent: NodeA; }',
      ].join('\n'),
      'lib.ts': [
        'export function usedFn() { return 1; }',
        'export function deadFn() { return 2; }',
        'export class Orphan { x = 1; }',
      ].join('\n'),
      'app.ts': [
        'import { usedFn } from "./lib";',
        'usedFn();',
      ].join('\n'),
    });

    const libEntry = makeFileEntry('lib.ts', {
      dependencyProfile: {
        internalDependencies: [], externalDependencies: [], unresolvedDependencies: [],
        declaredExports: [
          { name: 'usedFn', kind: 'value', lineStart: 1, lineEnd: 1 },
          { name: 'deadFn', kind: 'value', lineStart: 2, lineEnd: 2 },
          { name: 'Orphan', kind: 'value', lineStart: 3, lineEnd: 3 },
        ],
        importedSymbols: [], reExports: [],
      },
    });

    const profiles: SemanticProfile[] = [];
    profiles.push(analyzeSemanticProfile(ctx, path.join(dir, 'lib.ts'), libEntry));
    profiles.push(makeProfile('types.ts'));

    const findings = runSemanticDetectors(ctx, profiles);
    const categories = new Set(findings.map((f) => f.category));

    expect(categories.has('circular-type-dependency')).toBe(true);
    expect(categories.has('orphan-implementation')).toBe(true);

    expect(findings.every((f) => f.file)).toBe(true);
    expect(findings.every((f) => f.category)).toBe(true);
    expect(findings.every((f) => f.severity)).toBe(true);
    expect(findings.every((f) => f.suggestedFix)).toBe(true);

    const withHints = findings.filter((f) => f.lspHints && f.lspHints.length > 0);
    expect(withHints.length).toBeGreaterThan(0);
    for (const f of withHints) {
      for (const h of f.lspHints!) {
        expect(h.tool).toBeTruthy();
        expect(h.symbolName).toBeTruthy();
        expect(h.file).toBeTruthy();
        expect(h.expectedResult).toBeTruthy();
        expect(typeof h.lineHint).toBe('number');
      }
    }

    fs.rmSync(dir, { recursive: true });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// New semantic detector tests
// ═══════════════════════════════════════════════════════════════════════════

describe('integration: shotgun-surgery', () => {
  it('detects export used by many files', () => {
    const profile = makeProfile('util.ts', {
      referenceCountByExport: new Map([
        ['widelyUsed', { count: 25, uniqueFiles: 10, lineStart: 5, lineEnd: 5 }],
        ['rarelyUsed', { count: 2, uniqueFiles: 1, lineStart: 10, lineEnd: 10 }],
      ]),
    });
    const findings = detectShotgunSurgery([profile], 8);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('shotgun-surgery');
    expect(findings[0].title).toContain('widelyUsed');
    expect(findings[0].title).toContain('10 files');
    expect(findings[0].lspHints![0].tool).toBe('lspFindReferences');
  });

  it('does not flag exports below threshold', () => {
    const profile = makeProfile('util.ts', {
      referenceCountByExport: new Map([
        ['ok', { count: 10, uniqueFiles: 5, lineStart: 1, lineEnd: 1 }],
      ]),
    });
    expect(detectShotgunSurgery([profile], 8)).toHaveLength(0);
  });
});

describe('integration: move-to-caller', () => {
  it('detects export with exactly 1 consumer file', () => {
    const profile = makeProfile('helper.ts', {
      referenceCountByExport: new Map([
        ['singleUse', { count: 3, uniqueFiles: 1, lineStart: 5, lineEnd: 10 }],
      ]),
    });
    const findings = detectMoveToCaller([profile]);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('move-to-caller');
    expect(findings[0].title).toContain('singleUse');
  });

  it('does not flag unused or multi-consumer exports', () => {
    const profile = makeProfile('helper.ts', {
      referenceCountByExport: new Map([
        ['unused', { count: 0, uniqueFiles: 0, lineStart: 1, lineEnd: 1 }],
        ['multi', { count: 5, uniqueFiles: 3, lineStart: 10, lineEnd: 10 }],
      ]),
    });
    expect(detectMoveToCaller([profile])).toHaveLength(0);
  });
});

describe('integration: leaky-abstraction', () => {
  it('detects function returning type from internal module', () => {
    const profile = makeProfile('api.ts', {
      leakyReturns: [{
        functionName: 'getConfig',
        returnType: 'InternalConfig',
        sourceFile: 'internal/config.ts',
        lineStart: 10,
      }],
    });
    const findings = detectLeakyAbstraction([profile]);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('leaky-abstraction');
    expect(findings[0].title).toContain('getConfig');
    expect(findings[0].title).toContain('InternalConfig');
  });

  it('returns empty when no leaky returns', () => {
    const profile = makeProfile('api.ts', { leakyReturns: [] });
    expect(detectLeakyAbstraction([profile])).toHaveLength(0);
  });

  it('detects leaky returns via full pipeline', () => {
    const dir = makeTempDir();
    const ctx = setupCtx(dir, {
      'internal.ts': 'export interface InternalConfig { secret: string; }\n',
      'api.ts': [
        'import { InternalConfig } from "./internal";',
        'export function getConfig(): InternalConfig { return { secret: "x" }; }',
      ].join('\n'),
    });
    const entry = makeFileEntry('api.ts', {
      functions: [{
        kind: 'function', name: 'getConfig', nameHint: 'getConfig',
        file: 'api.ts', lineStart: 2, lineEnd: 2, columnStart: 0, columnEnd: 0,
        statementCount: 1, complexity: 1, maxBranchDepth: 0, maxLoopDepth: 0,
        returns: 1, awaits: 0, calls: 0, loops: 0, lengthLines: 1,
        cognitiveComplexity: 0, params: 0,
      }],
      dependencyProfile: {
        internalDependencies: ['internal.ts'], externalDependencies: [], unresolvedDependencies: [],
        declaredExports: [{ name: 'getConfig', kind: 'value', lineStart: 2, lineEnd: 2 }],
        importedSymbols: [], reExports: [],
      },
    });
    const profile = analyzeSemanticProfile(ctx, path.join(dir, 'api.ts'), entry);
    expect(profile.leakyReturns.length).toBe(1);
    expect(profile.leakyReturns[0].returnType).toBe('InternalConfig');
    fs.rmSync(dir, { recursive: true });
  });
});

describe('integration: narrowable-type', () => {
  it('detects param narrowable from mock profile', () => {
    const profile = makeProfile('handler.ts', {
      narrowableParams: [{
        functionName: 'process',
        paramName: 'data',
        declaredType: 'string | number',
        actualTypes: ['string'],
        narrowedType: 'string',
        lineStart: 5,
        lineEnd: 10,
      }],
    });
    const findings = detectNarrowableType([profile]);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe('narrowable-type');
    expect(findings[0].title).toContain('string | number');
    expect(findings[0].title).toContain('string');
    expect(findings[0].lspHints![0].tool).toBe('lspCallHierarchy');
  });

  it('returns empty when no narrowable params', () => {
    expect(detectNarrowableType([makeProfile('a.ts')])).toHaveLength(0);
  });
});
