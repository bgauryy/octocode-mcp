import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

import {
  detectExcessiveMocking,
  detectFakeTimersWithoutRestore,
  detectFocusedTests,
  detectLowAssertionDensity,
  detectMissingMockRestoration,
  detectMissingTestCleanup,
  detectSharedMutableState,
  detectTestNoAssertion,
} from './test-quality-detectors.js';
import { analyzeSourceFile } from './ts-analyzer.js';
import { DEFAULT_OPTS } from './types.js';

import type { DependencyProfile, FileEntry, FlowMaps, PackageFileSummary } from './types.js';


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
    });`);
    const findings = detectMissingMockRestoration([file] as [FileEntry]);
    expect(findings).toHaveLength(0);
  });
});

describe('low assertion density detector', () => {
  it('flags file with tests having <1 assertion per test on average', () => {
    const file = analyze(`describe('suite', () => {
  it('test1', () => { doSomething(); });
  it('test2', () => { doSomething(); });
  it('test3', () => { expect(1).toBe(1); });
});`);
    const findings = detectLowAssertionDensity([file]);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('low-assertion-density');
  });

  it('passes when assertion density >= 1', () => {
    const file = analyze(`describe('suite', () => {
  it('test1', () => { expect(1).toBe(1); });
  it('test2', () => { expect(2).toBe(2); });
});`);
    const findings = detectLowAssertionDensity([file]);
    expect(findings).toHaveLength(0);
  });

  it('skips non-test files', () => {
    const src = parse(`describe('suite', () => {
  it('test1', () => { doSomething(); });
});`, '/repo/src/feature.ts');
    const entry = analyzeSourceFile(src, 'pkg', emptySummary(), { ...DEFAULT_OPTS, root: '/repo' }, emptyMaps(), [], emptyProfile);
    const findings = detectLowAssertionDensity([entry]);
    expect(findings).toHaveLength(0);
  });

  it('skips files with no test blocks', () => {
    const file = analyze(`export function helper() { return 42; }`);
    const findings = detectLowAssertionDensity([file]);
    expect(findings).toHaveLength(0);
  });
});

describe('test-no-assertion detector', () => {
  it('flags individual test block with 0 assertions', () => {
    const file = analyze(`it('no assertion', () => { doSomething(); });`);
    const findings = detectTestNoAssertion([file]);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('test-no-assertion');
  });

  it('does not flag test blocks with assertions', () => {
    const file = analyze(`it('has assertion', () => { expect(1).toBe(1); });`);
    const findings = detectTestNoAssertion([file]);
    expect(findings).toHaveLength(0);
  });

  it('flags multiple empty test blocks separately', () => {
    const file = analyze(`describe('suite', () => {
  it('test1', () => { doSomething(); });
  it('test2', () => { doSomethingElse(); });
});`);
    const findings = detectTestNoAssertion([file]);
    expect(findings).toHaveLength(2);
  });

  it('skips non-test files', () => {
    const src = parse(`it('test', () => { doSomething(); });`, '/repo/src/feature.ts');
    const entry = analyzeSourceFile(src, 'pkg', emptySummary(), { ...DEFAULT_OPTS, root: '/repo' }, emptyMaps(), [], emptyProfile);
    const findings = detectTestNoAssertion([entry]);
    expect(findings).toHaveLength(0);
  });
});

describe('excessive mocking detector', () => {
  it('flags file exceeding mock threshold', () => {
    const file = analyze(`test('mocked', () => {
  jest.mock('a');
  jest.mock('b');
  jest.mock('c');
});`);
    const findings = detectExcessiveMocking([file], 2);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('excessive-mocking');
  });

  it('passes when below threshold', () => {
    const file = analyze(`test('mocked', () => {
  jest.mock('a');
});`);
    const findings = detectExcessiveMocking([file], 2);
    expect(findings).toHaveLength(0);
  });

  it('skips non-test files', () => {
    const src = parse(`jest.mock('a'); jest.mock('b'); jest.mock('c');`, '/repo/src/feature.ts');
    const entry = analyzeSourceFile(src, 'pkg', emptySummary(), { ...DEFAULT_OPTS, root: '/repo' }, emptyMaps(), [], emptyProfile);
    const findings = detectExcessiveMocking([entry], 2);
    expect(findings).toHaveLength(0);
  });
});

describe('shared mutable state detector', () => {
  it('flags let at describe scope', () => {
    const file = analyze(`describe('suite', () => {
  let counter = 0;
  it('test', () => { counter++; expect(counter).toBe(1); });
});`);
    const findings = detectSharedMutableState([file]);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('shared-mutable-state');
  });

  it('does not flag const declarations', () => {
    const file = analyze(`describe('suite', () => {
  const value = 42;
  it('test', () => { expect(value).toBe(42); });
});`);
    const findings = detectSharedMutableState([file]);
    expect(findings).toHaveLength(0);
  });

  it('skips non-test files', () => {
    const src = parse(`let x = 0;`, '/repo/src/feature.ts');
    const entry = analyzeSourceFile(src, 'pkg', emptySummary(), { ...DEFAULT_OPTS, root: '/repo' }, emptyMaps(), [], emptyProfile);
    const findings = detectSharedMutableState([entry]);
    expect(findings).toHaveLength(0);
  });
});

describe('missing test cleanup detector', () => {
  it('flags beforeAll without afterAll', () => {
    const file = analyze(`describe('suite', () => {
  beforeAll(() => { setup(); });
  it('test', () => { expect(1).toBe(1); });
});`);
    const findings = detectMissingTestCleanup([file]);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('missing-test-cleanup');
    expect(findings[0].title).toContain('beforeAll');
  });

  it('flags beforeEach without afterEach', () => {
    const file = analyze(`describe('suite', () => {
  beforeEach(() => { setup(); });
  it('test', () => { expect(1).toBe(1); });
});`);
    const findings = detectMissingTestCleanup([file]);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('missing-test-cleanup');
    expect(findings[0].title).toContain('beforeEach');
  });

  it('passes when both beforeAll and afterAll present', () => {
    const file = analyze(`describe('suite', () => {
  beforeAll(() => { setup(); });
  afterAll(() => { teardown(); });
  it('test', () => { expect(1).toBe(1); });
});`);
    const findings = detectMissingTestCleanup([file]);
    expect(findings).toHaveLength(0);
  });

  it('passes when both beforeEach and afterEach present', () => {
    const file = analyze(`describe('suite', () => {
  beforeEach(() => { setup(); });
  afterEach(() => { teardown(); });
  it('test', () => { expect(1).toBe(1); });
});`);
    const findings = detectMissingTestCleanup([file]);
    expect(findings).toHaveLength(0);
  });

  it('skips non-test files', () => {
    const src = parse(`beforeAll(() => { setup(); });`, '/repo/src/feature.ts');
    const entry = analyzeSourceFile(src, 'pkg', emptySummary(), { ...DEFAULT_OPTS, root: '/repo' }, emptyMaps(), [], emptyProfile);
    const findings = detectMissingTestCleanup([entry]);
    expect(findings).toHaveLength(0);
  });
});
