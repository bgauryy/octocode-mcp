import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  formatAstTreeSearchOutput,
  parseAstTreeSearchArgs,
  resolveAstTreeInput,
  searchAstTree,
  validateAstTreeSearchOptions,
} from './ast-tree-search.js';

describe('ast-tree-search', () => {
  let tmpDir: string;
  let scanRoot: string;
  let latestScanDir: string;
  let olderScanDir: string;
  let astTreePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ast-tree-search-'));
    scanRoot = path.join(tmpDir, '.octocode', 'scan');
    olderScanDir = path.join(scanRoot, '2026-03-18T10-00-00-000Z');
    latestScanDir = path.join(scanRoot, '2026-03-19T10-00-00-000Z');

    fs.mkdirSync(olderScanDir, { recursive: true });
    fs.mkdirSync(latestScanDir, { recursive: true });

    fs.writeFileSync(path.join(olderScanDir, 'ast-trees.txt'), '## pkg — src/older.ts\nFunctionDeclaration[1:2]\n', 'utf8');

    astTreePath = path.join(latestScanDir, 'ast-trees.txt');
    fs.writeFileSync(astTreePath, [
      '## pkg — src/main.ts',
      'SourceFile[1:50]',
      '  FunctionDeclaration[3:12]',
      '    IfStatement[5:7] ...',
      '  ClassDeclaration[14:30]',
      '## pkg — src/utils.ts',
      'SourceFile[1:40]',
      '  function_declaration[4:8]',
      '  ArrowFunction[10:12]',
      '  WhileStatement[14:18]',
      '',
    ].join('\n'), 'utf8');

    const olderTime = new Date('2026-03-18T10:00:00.000Z');
    const newerTime = new Date('2026-03-19T10:00:00.000Z');
    fs.utimesSync(path.join(olderScanDir, 'ast-trees.txt'), olderTime, olderTime);
    fs.utimesSync(path.join(latestScanDir, 'ast-trees.txt'), newerTime, newerTime);
    fs.utimesSync(olderScanDir, olderTime, olderTime);
    fs.utimesSync(latestScanDir, newerTime, newerTime);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('parses limit, file, and section flags', () => {
    const { opts } = parseAstTreeSearchArgs([
      '--input', scanRoot,
      '--kind', 'FunctionDeclaration',
      '--file', 'src/main',
      '--section', 'pkg',
      '--limit', '10',
      '--context', '2',
      '--json',
      '--ignore-case',
    ]);

    expect(opts.input).toBe(scanRoot);
    expect(opts.kind).toBe('FunctionDeclaration');
    expect(opts.file).toBe('src/main');
    expect(opts.section).toBe('pkg');
    expect(opts.limit).toBe(10);
    expect(opts.context).toBe(2);
    expect(opts.json).toBe(true);
    expect(opts.ignoreCase).toBe(true);
  });

  it('rejects invalid search options', () => {
    expect(() => validateAstTreeSearchOptions({
      input: scanRoot,
      pattern: null,
      kind: null,
      context: 0,
      json: false,
      ignoreCase: false,
      limit: 50,
      file: null,
      section: null,
    })).toThrow('Must provide --pattern or --kind');
  });

  it('resolves the latest scan from the scan root', () => {
    const resolved = resolveAstTreeInput(scanRoot);
    expect(resolved.selectionMode).toBe('latest-scan');
    expect(resolved.inputFile).toBe(astTreePath);
  });

  it('resolves a specific scan directory', () => {
    const resolved = resolveAstTreeInput(latestScanDir);
    expect(resolved.selectionMode).toBe('scan-dir');
    expect(resolved.inputFile).toBe(astTreePath);
  });

  it('resolves a direct ast-trees.txt input path', () => {
    const resolved = resolveAstTreeInput(astTreePath);
    expect(resolved.selectionMode).toBe('direct-file');
    expect(resolved.inputFile).toBe(astTreePath);
  });

  it('matches kind queries with PascalCase and snake_case node names', () => {
    const result = searchAstTree(resolveAstTreeInput(scanRoot), {
      input: scanRoot,
      pattern: null,
      kind: 'function_declaration',
      context: 0,
      json: false,
      ignoreCase: false,
      limit: 0,
      file: null,
      section: null,
    });

    expect(result.totalMatches).toBe(2);
    expect(result.matches.map((match) => match.file)).toEqual([
      'src/main.ts',
      'src/utils.ts',
    ]);
  });

  it('filters by file and section regexes', () => {
    const result = searchAstTree(resolveAstTreeInput(scanRoot), {
      input: scanRoot,
      pattern: 'FunctionDeclaration|function_declaration|ArrowFunction',
      kind: null,
      context: 0,
      json: false,
      ignoreCase: false,
      limit: 0,
      file: 'src/utils',
      section: 'pkg',
    });

    expect(result.totalMatches).toBe(2);
    expect(result.matches.every((match) => match.file === 'src/utils.ts')).toBe(true);
  });

  it('enforces the default limit and reports truncation metadata', () => {
    const repeatedAst = [
      '## pkg — src/many.ts',
      'SourceFile[1:200]',
      ...Array.from({ length: 60 }, (_, index) => `  FunctionDeclaration[${index + 1}:${index + 2}]`),
      '',
    ].join('\n');
    fs.writeFileSync(astTreePath, repeatedAst, 'utf8');

    const result = searchAstTree(resolveAstTreeInput(astTreePath), {
      input: astTreePath,
      pattern: null,
      kind: 'FunctionDeclaration',
      context: 0,
      json: false,
      ignoreCase: false,
      limit: 50,
      file: null,
      section: null,
    });

    expect(result.totalMatches).toBe(60);
    expect(result.returnedMatches).toBe(50);
    expect(result.truncated).toBe(true);
  });

  it('formats output with selected file information and compact summary', () => {
    const opts = {
      input: scanRoot,
      pattern: 'IfStatement|WhileStatement',
      kind: null,
      context: 1,
      json: false,
      ignoreCase: false,
      limit: 25,
      file: null,
      section: null,
    };
    const result = searchAstTree(resolveAstTreeInput(scanRoot), opts);
    const text = formatAstTreeSearchOutput(result, opts);

    expect(text).toContain('Requested input:');
    expect(text).toContain('Selected AST file:');
    expect(text).toContain('Matches: 2 total, showing 2');
    expect(text).toContain('Matched files: 2');
    expect(text).toContain('src/main.ts');
    expect(text).toContain('src/utils.ts');
  });
});
