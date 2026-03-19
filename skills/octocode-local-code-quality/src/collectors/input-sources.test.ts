import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { collectInputSourceProfile } from './input-sources.js';

import type { FileEntry } from '../types/index.js';

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

describe('collectInputSourceProfile', () => {
  it('function with req param → detects input source with high confidence', () => {
    const code = `function handler(req: Request) { return req.url; }`;
    const sourceFile = parse(code);
    const fileEntry = emptyFileEntry();
    collectInputSourceProfile(sourceFile, 'test.ts', fileEntry);
    expect(fileEntry.inputSources).toBeDefined();
    expect(fileEntry.inputSources!.length).toBeGreaterThan(0);
    const src = fileEntry.inputSources![0];
    expect(src.sourceParams).toContain('req');
    expect(src.paramConfidence).toBe('high');
  });

  it('function with input param → detects with medium confidence', () => {
    const code = `function process(input: string) { return input.trim(); }`;
    const sourceFile = parse(code);
    const fileEntry = emptyFileEntry();
    collectInputSourceProfile(sourceFile, 'test.ts', fileEntry);
    expect(fileEntry.inputSources).toBeDefined();
    expect(fileEntry.inputSources!.length).toBeGreaterThan(0);
    const src = fileEntry.inputSources![0];
    expect(src.sourceParams).toContain('input');
    expect(src.paramConfidence).toBe('medium');
  });

  it('function with count param → no input source detected', () => {
    const code = `function increment(count: number) { return count + 1; }`;
    const sourceFile = parse(code);
    const fileEntry = emptyFileEntry();
    collectInputSourceProfile(sourceFile, 'test.ts', fileEntry);
    expect(fileEntry.inputSources).toBeDefined();
    expect(fileEntry.inputSources!.length).toBe(0);
  });

  it('function with req and eval() sink → hasSinkInBody=true', () => {
    const code = `function bad(req: Request) { eval(req.body); }`;
    const sourceFile = parse(code);
    const fileEntry = emptyFileEntry();
    collectInputSourceProfile(sourceFile, 'test.ts', fileEntry);
    expect(fileEntry.inputSources).toBeDefined();
    expect(fileEntry.inputSources!.length).toBeGreaterThan(0);
    const src = fileEntry.inputSources![0];
    expect(src.hasSinkInBody).toBe(true);
    expect(src.sinkKinds).toContain('eval');
  });

  it('function with validation (typeof check) → hasValidation=true', () => {
    const code = `function safe(input: unknown) { if (typeof input === 'string') return input; }`;
    const sourceFile = parse(code);
    const fileEntry = emptyFileEntry();
    collectInputSourceProfile(sourceFile, 'test.ts', fileEntry);
    expect(fileEntry.inputSources).toBeDefined();
    expect(fileEntry.inputSources!.length).toBeGreaterThan(0);
    const src = fileEntry.inputSources![0];
    expect(src.hasValidation).toBe(true);
  });

  it('no false positive on non-source parameters', () => {
    const code = `function util(count: number, limit: number) { return count * limit; }`;
    const sourceFile = parse(code);
    const fileEntry = emptyFileEntry();
    collectInputSourceProfile(sourceFile, 'test.ts', fileEntry);
    expect(fileEntry.inputSources).toBeDefined();
    expect(fileEntry.inputSources!.length).toBe(0);
  });

  it('detects instanceof validation for source param', () => {
    const code = `
      class UserInput {}
      function parseReq(req: unknown) {
        if (req instanceof UserInput) return req;
        return null;
      }
    `;
    const sourceFile = parse(code);
    const fileEntry = emptyFileEntry();
    collectInputSourceProfile(sourceFile, 'test.ts', fileEntry);
    expect(fileEntry.inputSources).toBeDefined();
    expect(fileEntry.inputSources!.length).toBeGreaterThan(0);
    expect(fileEntry.inputSources![0].hasValidation).toBe(true);
  });

  it('detects optional chaining usage as validation signal', () => {
    const code = `
      function read(req: { body?: { id?: string } }) {
        return req?.body?.id ?? '';
      }
    `;
    const sourceFile = parse(code);
    const fileEntry = emptyFileEntry();
    collectInputSourceProfile(sourceFile, 'test.ts', fileEntry);
    expect(fileEntry.inputSources).toBeDefined();
    expect(fileEntry.inputSources!.length).toBe(1);
    expect(fileEntry.inputSources![0].hasValidation).toBe(true);
  });

  it('captures callsWithInputArgs when source param is passed to sink-like calls', () => {
    const code = `
      function route(req: any, res: any) {
        res.send(req.body);
        return req;
      }
    `;
    const sourceFile = parse(code);
    const fileEntry = emptyFileEntry();
    collectInputSourceProfile(sourceFile, 'test.ts', fileEntry);
    expect(fileEntry.inputSources).toBeDefined();
    expect(fileEntry.inputSources!.length).toBe(1);
    const calls = fileEntry.inputSources![0].callsWithInputArgs;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.some(c => c.callee.includes('res.send'))).toBe(true);
  });
});
