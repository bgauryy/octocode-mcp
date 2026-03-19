import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { collectTestProfile } from './test-profile.js';

import type { FileEntry } from '../types/index.js';

function parse(
  code: string,
  fileName = '/repo/src/test.spec.ts'
): ts.SourceFile {
  return ts.createSourceFile(fileName, code, ts.ScriptTarget.ESNext, true);
}

function emptyFileEntry(): FileEntry {
  return {
    package: 'test',
    file: 'test.spec.ts',
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

describe('collectTestProfile', () => {
  it('describe + it blocks → detects test blocks', () => {
    const code = `describe('suite', () => { it('test', () => {}); });`;
    const sourceFile = parse(code);
    const fileEntry = emptyFileEntry();
    collectTestProfile(sourceFile, 'test.spec.ts', fileEntry);
    expect(fileEntry.testProfile).toBeDefined();
    expect(fileEntry.testProfile!.testBlocks).toHaveLength(1);
    expect(fileEntry.testProfile!.testBlocks[0].name).toBe('test');
  });

  it('expect().toBe() → detects assertions', () => {
    const code = `it('asserts', () => { expect(1).toBe(1); });`;
    const sourceFile = parse(code);
    const fileEntry = emptyFileEntry();
    collectTestProfile(sourceFile, 'test.spec.ts', fileEntry);
    expect(fileEntry.testProfile).toBeDefined();
    expect(fileEntry.testProfile!.testBlocks).toHaveLength(1);
    expect(fileEntry.testProfile!.testBlocks[0].assertionCount).toBeGreaterThan(
      0
    );
  });

  it('jest.mock() → detects mocks', () => {
    const code = `jest.mock('./module'); describe('suite', () => { it('test', () => {}); });`;
    const sourceFile = parse(code);
    const fileEntry = emptyFileEntry();
    collectTestProfile(sourceFile, 'test.spec.ts', fileEntry);
    expect(fileEntry.testProfile).toBeDefined();
    expect(fileEntry.testProfile!.mockCalls).toHaveLength(1);
  });

  it('vi.spyOn() → detects spy', () => {
    const code = `const obj = { method: () => {} }; describe('suite', () => { it('test', () => { vi.spyOn(obj, 'method'); }); });`;
    const sourceFile = parse(code);
    const fileEntry = emptyFileEntry();
    collectTestProfile(sourceFile, 'test.spec.ts', fileEntry);
    expect(fileEntry.testProfile).toBeDefined();
    expect(fileEntry.testProfile!.spyOrStubCalls).toHaveLength(1);
    expect(fileEntry.testProfile!.spyOrStubCalls[0].kind).toBe('spy');
  });

  it('beforeEach → detects setup hooks', () => {
    const code = `describe('suite', () => { beforeEach(() => {}); it('test', () => {}); });`;
    const sourceFile = parse(code);
    const fileEntry = emptyFileEntry();
    collectTestProfile(sourceFile, 'test.spec.ts', fileEntry);
    expect(fileEntry.testProfile).toBeDefined();
    expect(fileEntry.testProfile!.setupCalls).toHaveLength(1);
    expect(fileEntry.testProfile!.setupCalls[0].kind).toBe('beforeEach');
  });

  it('no test profile for non-test code', () => {
    const code = `function add(a: number, b: number) { return a + b; }`;
    const sourceFile = parse(code);
    const fileEntry = emptyFileEntry();
    collectTestProfile(sourceFile, 'util.ts', fileEntry);
    expect(fileEntry.testProfile).toBeDefined();
    expect(fileEntry.testProfile!.testBlocks).toHaveLength(0);
    expect(fileEntry.testProfile!.mockCalls).toHaveLength(0);
    expect(fileEntry.testProfile!.setupCalls).toHaveLength(0);
  });
});
