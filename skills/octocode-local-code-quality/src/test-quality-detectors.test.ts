import { describe, expect, it } from 'vitest';
import * as ts from 'typescript';
import type { FileEntry, PackageFileSummary, FlowMaps, DependencyProfile, Finding } from './types.js';
import { DEFAULT_OPTS } from './types.js';
import { analyzeSourceFile } from './ts-analyzer.js';
import { detectFocusedTests, detectFakeTimersWithoutRestore, detectMissingMockRestoration } from './test-quality-detectors.js';

function parse(code: string, fileName = '/repo/src/feature.spec.ts'): ts.SourceFile {
  return ts.createSourceFile(fileName, code, ts.ScriptTarget.ESNext, true);
}

function emptySummary(): PackageFileSummary {
  return { fileCount: 0, nodeCount: 0, functionCount: 0, flowCount: 0, kindCounts: {}, functions: [], flows: [] };
}

function emptyMaps(): FlowMaps {
  return { flowMap: new Map(), controlMap: new Map() };
}

const emptyProfile: DependencyProfile = {
  internalDependencies: [],
  externalDependencies: [],
  unresolvedDependencies: [],
  declaredExports: [],
  importedSymbols: [],
  reExports: [],
};

function analyze(code: string): FileEntry {
  const src = parse(code);
  return analyzeSourceFile(src, 'pkg', emptySummary(), { ...DEFAULT_OPTS, root: '/repo' }, emptyMaps(), [], emptyProfile);
}

describe('focused-test detector', () => {
  it('flags it.only in test files', () => {
    const file = analyze(`describe('suite', () => {
      it.only('only test', () => {
        expect(1).toBe(1);
      });
    });`);
    const findings = detectFocusedTests([file]);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('focused-test');
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].lineStart).toBeGreaterThan(0);
  });

  it('ignores plain tests without focus markers', () => {
    const file = analyze(`it('normal test', () => {
      expect(1).toBe(1);
    });`);
    const findings = detectFocusedTests([file]);
    expect(findings).toHaveLength(0);
  });
});

describe('fake timer detector', () => {
  it('flags fake timer activation without restore', () => {
    const file = analyze(`test('timer behavior', () => {
      jest.useFakeTimers();
      setTimeout(() => {}, 1000);
      setTimeout(() => {}, 1000);
    });`);
    const findings = detectFakeTimersWithoutRestore([file]);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('fake-timer-no-restore');
  });

  it('skips files that restore fake timers', () => {
    const file = analyze(`test('timer behavior', () => {
      vi.useFakeTimers();
      vi.useRealTimers();
    });`);
    const findings = detectFakeTimersWithoutRestore([file]);
    expect(findings).toHaveLength(0);
  });
});

describe('mock restoration detector', () => {
  it('flags spy that is never restored', () => {
    const file = analyze(`test('mocked spy', () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(0);
      expect(nowSpy).toBeDefined();
    });`);
    const findings = detectMissingMockRestoration([file]);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('missing-mock-restoration');
  });

  it('skips files with explicit spy restore', () => {
    const file = analyze(`test('mocked spy', () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(0);
      nowSpy.mockRestore();
    });`);
    const findings = detectMissingMockRestoration([file]);
    expect(findings).toHaveLength(0);
  });

  it('does not treat clear/reset all mocks as a restore', () => {
    const file = analyze(`test('mocked spy', () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(0);
      jest.clearAllMocks();
    });`);
    const findings = detectMissingMockRestoration([file]);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('missing-mock-restoration');
  });

  it('still reports spies not restored when some spies are restored', () => {
    const file = analyze(`test('multiple spies', () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(0);
      const randomSpy = jest.spyOn(Math, 'random');
      nowSpy.mockRestore();
      expect(randomSpy).toBeDefined();
    });`);
    const findings = detectMissingMockRestoration([file]);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('missing-mock-restoration');
    expect(findings[0].lineStart).toBe(3);
  });

  it('skips non-restorable mocks', () => {
    const file = analyze(`test('module mock', () => {
      jest.mock('path');
      // intentionally no restore needed for module-level mock
    });`);
    const findings = detectMissingMockRestoration([file] as [FileEntry]);
    expect(findings).toHaveLength(0);
  });
});
