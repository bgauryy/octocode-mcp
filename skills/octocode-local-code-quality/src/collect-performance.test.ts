import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { collectPerformanceData } from './collect-performance.js';

import type { FileEntry } from './types.js';

function parse(code: string, fileName = '/repo/src/test.ts'): ts.SourceFile {
  return ts.createSourceFile(fileName, code, ts.ScriptTarget.ESNext, true);
}

function emptyFileEntry(): FileEntry {
  return {
    package: 'test',
    file: 'test.ts',
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
  };
}

describe('collectPerformanceData', () => {
  it('collects await-in-loop locations', () => {
    const sourceFile = parse(`
      async function run(items: string[]) {
        for (const item of items) {
          await fetch(item);
        }
      }
    `);
    const fileEntry = emptyFileEntry();
    collectPerformanceData(sourceFile, 'test.ts', fileEntry);
    expect(fileEntry.awaitInLoopLocations?.length).toBeGreaterThan(0);
  });

  it('collects sync io calls', () => {
    const sourceFile = parse(
      `function read() { fs.readFileSync('/tmp/a.txt'); }`
    );
    const fileEntry = emptyFileEntry();
    collectPerformanceData(sourceFile, 'test.ts', fileEntry);
    expect(fileEntry.syncIoCalls?.some(c => c.name === 'readFileSync')).toBe(
      true
    );
  });

  it('collects timer calls and marks cleanup when clearTimeout exists', () => {
    const sourceFile = parse(`
      function run() {
        setTimeout(() => {}, 5);
        clearTimeout(1 as unknown as NodeJS.Timeout);
      }
    `);
    const fileEntry = emptyFileEntry();
    collectPerformanceData(sourceFile, 'test.ts', fileEntry);
    expect(fileEntry.timerCalls?.length).toBe(1);
    expect(fileEntry.timerCalls?.[0].kind).toBe('setTimeout');
    expect(fileEntry.timerCalls?.[0].hasCleanup).toBe(true);
  });

  it('collects listener registrations and removals', () => {
    const sourceFile = parse(`
      const emitter = new EventEmitter();
      emitter.on('data', () => {});
      emitter.off('data', () => {});
    `);
    const fileEntry = emptyFileEntry();
    collectPerformanceData(sourceFile, 'test.ts', fileEntry);
    expect(fileEntry.listenerRegistrations?.length).toBeGreaterThan(0);
    expect(fileEntry.listenerRemovals?.length).toBeGreaterThan(0);
  });
});
