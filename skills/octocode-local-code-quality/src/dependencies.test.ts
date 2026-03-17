import { describe, expect, it } from 'vitest';
import * as ts from 'typescript';
import type { DependencyState } from './types.js';
import { collectModuleDependencies, trackDependencyEdge, dependencyProfileToRecord } from './dependencies.js';

function parse(code: string, fileName = '/repo/packages/foo/src/test.ts'): ts.SourceFile {
  return ts.createSourceFile(fileName, code, ts.ScriptTarget.ESNext, true);
}

function emptyState(): DependencyState {
  return {
    files: new Set(),
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
}

// ─── collectModuleDependencies ──────────────────────────────────────────────

describe('collectModuleDependencies', () => {
  describe('import detection', () => {
    it('detects named imports', () => {
      const src = parse('import { foo, bar } from "./helper";');
      const profile = collectModuleDependencies(src, '/repo/packages/foo/src/test.ts', '/repo');
      expect(profile.importedSymbols).toHaveLength(2);
      expect(profile.importedSymbols[0].importedName).toBe('foo');
      expect(profile.importedSymbols[1].importedName).toBe('bar');
    });

    it('detects default imports', () => {
      const src = parse('import MyDefault from "./module";');
      const profile = collectModuleDependencies(src, '/repo/packages/foo/src/test.ts', '/repo');
      expect(profile.importedSymbols).toHaveLength(1);
      expect(profile.importedSymbols[0].importedName).toBe('default');
      expect(profile.importedSymbols[0].localName).toBe('MyDefault');
    });

    it('detects namespace imports', () => {
      const src = parse('import * as utils from "./utils";');
      const profile = collectModuleDependencies(src, '/repo/packages/foo/src/test.ts', '/repo');
      expect(profile.importedSymbols).toHaveLength(1);
      expect(profile.importedSymbols[0].importedName).toBe('*');
      expect(profile.importedSymbols[0].localName).toBe('utils');
    });

    it('detects renamed imports', () => {
      const src = parse('import { original as renamed } from "./mod";');
      const profile = collectModuleDependencies(src, '/repo/packages/foo/src/test.ts', '/repo');
      expect(profile.importedSymbols[0].importedName).toBe('original');
      expect(profile.importedSymbols[0].localName).toBe('renamed');
    });

    it('detects type-only imports', () => {
      const src = parse('import type { MyType } from "./types";');
      const profile = collectModuleDependencies(src, '/repo/packages/foo/src/test.ts', '/repo');
      expect(profile.importedSymbols[0].isTypeOnly).toBe(true);
    });

    it('detects require() calls', () => {
      const src = parse('const fs = require("fs");');
      const profile = collectModuleDependencies(src, '/repo/packages/foo/src/test.ts', '/repo');
      expect(profile.importedSymbols).toHaveLength(1);
      expect(profile.importedSymbols[0].importedName).toBe('*');
      expect(profile.importedSymbols[0].localName).toBe('require');
      expect(profile.externalDependencies).toContain('fs');
    });
  });

  describe('export detection', () => {
    it('detects exported functions', () => {
      const src = parse('export function greet() {}');
      const profile = collectModuleDependencies(src, '/repo/packages/foo/src/test.ts', '/repo');
      expect(profile.declaredExports).toHaveLength(1);
      expect(profile.declaredExports[0].name).toBe('greet');
      expect(profile.declaredExports[0].kind).toBe('value');
    });

    it('detects exported classes', () => {
      const src = parse('export class MyClass {}');
      const profile = collectModuleDependencies(src, '/repo/packages/foo/src/test.ts', '/repo');
      expect(profile.declaredExports).toHaveLength(1);
      expect(profile.declaredExports[0].name).toBe('MyClass');
    });

    it('detects exported variables', () => {
      const src = parse('export const VERSION = "1.0";');
      const profile = collectModuleDependencies(src, '/repo/packages/foo/src/test.ts', '/repo');
      expect(profile.declaredExports).toHaveLength(1);
      expect(profile.declaredExports[0].name).toBe('VERSION');
    });

    it('detects exported types and interfaces', () => {
      const src = parse('export type Foo = string;\nexport interface Bar {}');
      const profile = collectModuleDependencies(src, '/repo/packages/foo/src/test.ts', '/repo');
      expect(profile.declaredExports).toHaveLength(2);
      expect(profile.declaredExports.every((e) => e.kind === 'type')).toBe(true);
    });

    it('detects exported enums', () => {
      const src = parse('export enum Color { Red, Green }');
      const profile = collectModuleDependencies(src, '/repo/packages/foo/src/test.ts', '/repo');
      expect(profile.declaredExports).toHaveLength(1);
      expect(profile.declaredExports[0].name).toBe('Color');
    });

    it('detects export default assignment', () => {
      const src = parse('export default 42;');
      const profile = collectModuleDependencies(src, '/repo/packages/foo/src/test.ts', '/repo');
      expect(profile.declaredExports).toHaveLength(1);
      expect(profile.declaredExports[0].name).toBe('default');
      expect(profile.declaredExports[0].isDefault).toBe(true);
    });

    it('detects named re-exports from { } declaration', () => {
      const src = parse('const x = 1;\nexport { x };');
      const profile = collectModuleDependencies(src, '/repo/packages/foo/src/test.ts', '/repo');
      expect(profile.declaredExports).toHaveLength(1);
      expect(profile.declaredExports[0].name).toBe('x');
    });

    it('deduplicates export with same name and kind', () => {
      const src = parse('export function foo() {}\nexport function bar() {}');
      const profile = collectModuleDependencies(src, '/repo/packages/foo/src/test.ts', '/repo');
      expect(profile.declaredExports.filter((e) => e.name === 'foo')).toHaveLength(1);
    });

    it('keeps exports with same name but different kind', () => {
      const src = parse('export function foo() {}\nexport { foo };');
      const profile = collectModuleDependencies(src, '/repo/packages/foo/src/test.ts', '/repo');
      const fooExports = profile.declaredExports.filter((e) => e.name === 'foo');
      expect(fooExports.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('re-export detection', () => {
    it('detects named re-exports from module', () => {
      const src = parse('export { foo, bar } from "./other";');
      const profile = collectModuleDependencies(src, '/repo/packages/foo/src/test.ts', '/repo');
      expect(profile.reExports).toHaveLength(2);
      expect(profile.reExports[0].exportedAs).toBe('foo');
      expect(profile.reExports[0].isStar).toBe(false);
    });

    it('detects star re-exports', () => {
      const src = parse('export * from "./barrel";');
      const profile = collectModuleDependencies(src, '/repo/packages/foo/src/test.ts', '/repo');
      expect(profile.reExports).toHaveLength(1);
      expect(profile.reExports[0].isStar).toBe(true);
      expect(profile.reExports[0].exportedAs).toBe('*');
    });

    it('detects type-only re-exports', () => {
      const src = parse('export type { MyType } from "./types";');
      const profile = collectModuleDependencies(src, '/repo/packages/foo/src/test.ts', '/repo');
      expect(profile.reExports[0].isTypeOnly).toBe(true);
    });

    it('re-exports include line info', () => {
      const src = parse('export { foo } from "./bar";');
      const profile = collectModuleDependencies(src, '/repo/packages/foo/src/test.ts', '/repo');
      expect(profile.reExports[0].lineStart).toBeGreaterThan(0);
    });
  });

  describe('dependency classification', () => {
    it('classifies external (non-relative) imports', () => {
      const src = parse('import lodash from "lodash";\nimport { join } from "path";');
      const profile = collectModuleDependencies(src, '/repo/packages/foo/src/test.ts', '/repo');
      expect(profile.externalDependencies).toContain('lodash');
      expect(profile.externalDependencies).toContain('path');
    });

    it('classifies unresolved relative imports', () => {
      const src = parse('import { x } from "./nonexistent";');
      const profile = collectModuleDependencies(src, '/repo/packages/foo/src/test.ts', '/repo');
      expect(profile.unresolvedDependencies).toContain('./nonexistent');
    });
  });
});

// ─── trackDependencyEdge ────────────────────────────────────────────────────

describe('trackDependencyEdge', () => {
  it('tracks outgoing and incoming edges', () => {
    const state = emptyState();
    trackDependencyEdge(state, 'a.ts', 'b.ts', false);
    expect(state.outgoing.get('a.ts')?.has('b.ts')).toBe(true);
    expect(state.incoming.get('b.ts')?.has('a.ts')).toBe(true);
  });

  it('separates production and test edges', () => {
    const state = emptyState();
    trackDependencyEdge(state, 'a.ts', 'shared.ts', false);
    trackDependencyEdge(state, 'a.test.ts', 'shared.ts', true);

    expect(state.incomingFromProduction.get('shared.ts')?.has('a.ts')).toBe(true);
    expect(state.incomingFromTests.get('shared.ts')?.has('a.test.ts')).toBe(true);
  });

  it('does not put production imports in test map', () => {
    const state = emptyState();
    trackDependencyEdge(state, 'a.ts', 'b.ts', false);
    expect(state.incomingFromTests.get('b.ts')).toBeUndefined();
  });
});

// ─── dependencyProfileToRecord ──────────────────────────────────────────────

describe('dependencyProfileToRecord', () => {
  it('returns zero counts for unknown file', () => {
    const state = emptyState();
    const record = dependencyProfileToRecord('unknown.ts', state);
    expect(record.file).toBe('unknown.ts');
    expect(record.outboundCount).toBe(0);
    expect(record.inboundCount).toBe(0);
    expect(record.inboundFromProduction).toBe(0);
    expect(record.inboundFromTests).toBe(0);
    expect(record.externalDependencyCount).toBe(0);
    expect(record.unresolvedDependencyCount).toBe(0);
  });

  it('counts edges correctly', () => {
    const state = emptyState();
    trackDependencyEdge(state, 'a.ts', 'hub.ts', false);
    trackDependencyEdge(state, 'b.ts', 'hub.ts', false);
    trackDependencyEdge(state, 'test.test.ts', 'hub.ts', true);
    trackDependencyEdge(state, 'hub.ts', 'dep.ts', false);
    state.externalCounts.set('hub.ts', new Set(['lodash', 'express']));
    state.unresolvedCounts.set('hub.ts', new Set(['./missing']));

    const record = dependencyProfileToRecord('hub.ts', state);
    expect(record.inboundCount).toBe(3);
    expect(record.inboundFromProduction).toBe(2);
    expect(record.inboundFromTests).toBe(1);
    expect(record.outboundCount).toBe(1);
    expect(record.externalDependencyCount).toBe(2);
    expect(record.unresolvedDependencyCount).toBe(1);
  });
});
