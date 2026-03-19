import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { collectSecurityData } from './collect-security.js';

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

describe('collectSecurityData', () => {
  it('detects eval usage - eval("1") → evalUsages contains entry', () => {
    const code = `eval("1");`;
    const sourceFile = parse(code);
    const fileEntry = emptyFileEntry();
    collectSecurityData(sourceFile, 'test.ts', fileEntry);
    expect(fileEntry.evalUsages).toBeDefined();
    expect(fileEntry.evalUsages).toHaveLength(1);
    expect(fileEntry.evalUsages![0].file).toBe('test.ts');
    expect(fileEntry.evalUsages![0].lineStart).toBeGreaterThan(0);
  });

  it('detects hardcoded secret pattern - API_KEY = "sk-proj-..." → suspiciousStrings', () => {
    const code = `const API_KEY = "sk-proj-abc123def456ghi789";`;
    const sourceFile = parse(code);
    const fileEntry = emptyFileEntry();
    collectSecurityData(sourceFile, 'test.ts', fileEntry);
    expect(fileEntry.suspiciousStrings).toBeDefined();
    expect(fileEntry.suspiciousStrings!.length).toBeGreaterThan(0);
    const secretEntry = fileEntry.suspiciousStrings!.find((s) => s.kind === 'hardcoded-secret');
    expect(secretEntry).toBeDefined();
    expect(secretEntry!.context).toBe('literal');
  });

  it('detects SQL injection risk - template literal with SQL keyword and interpolation', () => {
    const code = 'const q = `SELECT * FROM users WHERE id = ${id}`;';
    const sourceFile = parse(code);
    const fileEntry = emptyFileEntry();
    collectSecurityData(sourceFile, 'test.ts', fileEntry);
    expect(fileEntry.suspiciousStrings).toBeDefined();
    const sqlEntry = fileEntry.suspiciousStrings!.find((s) => s.kind === 'sql-injection');
    expect(sqlEntry).toBeDefined();
    expect(sqlEntry!.snippet).toMatch(/SELECT/i);
  });

  it('collects regex literal including potentially unsafe patterns', () => {
    const code = 'const r = /(a+)+/;';
    const sourceFile = parse(code);
    const fileEntry = emptyFileEntry();
    collectSecurityData(sourceFile, 'test.ts', fileEntry);
    expect(fileEntry.regexLiterals).toBeDefined();
    expect(fileEntry.regexLiterals!.length).toBeGreaterThan(0);
    expect(fileEntry.regexLiterals![0].pattern).toContain('a');
  });

  it('no false positive for regex in definition context - regex with secret keyword gets regex-definition', () => {
    const code = 'const re = /api_key=""/;';
    const sourceFile = parse(code);
    const fileEntry = emptyFileEntry();
    collectSecurityData(sourceFile, 'test.ts', fileEntry);
    expect(fileEntry.suspiciousStrings).toBeDefined();
    const entry = fileEntry.suspiciousStrings!.find((s) => s.context === 'regex-definition');
    expect(entry).toBeDefined();
    expect(entry!.kind).toBe('hardcoded-secret');
  });

  it('clean code produces no suspicious strings', () => {
    const code = `const x = 1; const msg = "hello"; function foo() { return 2; }`;
    const sourceFile = parse(code);
    const fileEntry = emptyFileEntry();
    collectSecurityData(sourceFile, 'test.ts', fileEntry);
    expect(fileEntry.suspiciousStrings).toBeDefined();
    expect(fileEntry.suspiciousStrings!.length).toBe(0);
    expect(fileEntry.evalUsages).toHaveLength(0);
  });

  it('template literal with SQL keyword', () => {
    const code = 'const sql = `INSERT INTO users (name) VALUES (${name})`;';
    const sourceFile = parse(code);
    const fileEntry = emptyFileEntry();
    collectSecurityData(sourceFile, 'test.ts', fileEntry);
    expect(fileEntry.suspiciousStrings).toBeDefined();
    const sqlEntry = fileEntry.suspiciousStrings!.find((s) => s.kind === 'sql-injection');
    expect(sqlEntry).toBeDefined();
  });

  it('process.env access is not flagged as secret', () => {
    const code = 'const key = process.env.API_KEY;';
    const sourceFile = parse(code);
    const fileEntry = emptyFileEntry();
    collectSecurityData(sourceFile, 'test.ts', fileEntry);
    expect(fileEntry.suspiciousStrings).toBeDefined();
    expect(fileEntry.suspiciousStrings!.length).toBe(0);
  });
});
