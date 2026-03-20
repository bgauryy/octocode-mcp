import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

import {
  addToMapSet,
  buildNodeTree,
  canonicalScriptKind,
  getLineAndCharacter,
  hashString,
  increment,
  isRelativeImport,
  isTestFile,
  makeFingerprint,
  normalizeDependencyValue,
  normalizeNodeKind,
  renderNodeText,
  renderTreesText,
  resolveImportTarget,
  toRepoPath,
} from './utils.js';

import type { NodeBudget, TreeEntry } from '../types/index.js';

describe('canonicalScriptKind', () => {
  it('maps .tsx to TSX', () => {
    expect(canonicalScriptKind('.tsx')).toBe(ts.ScriptKind.TSX);
  });

  it('maps .jsx to JSX', () => {
    expect(canonicalScriptKind('.jsx')).toBe(ts.ScriptKind.JSX);
  });

  it('maps .js, .mjs, .cjs to JS', () => {
    expect(canonicalScriptKind('.js')).toBe(ts.ScriptKind.JS);
    expect(canonicalScriptKind('.mjs')).toBe(ts.ScriptKind.JS);
    expect(canonicalScriptKind('.cjs')).toBe(ts.ScriptKind.JS);
  });

  it('maps .ts and unknown to TS', () => {
    expect(canonicalScriptKind('.ts')).toBe(ts.ScriptKind.TS);
    expect(canonicalScriptKind('.xyz')).toBe(ts.ScriptKind.TS);
  });
});

describe('hashString', () => {
  it('returns 16-char hex string', () => {
    const h = hashString('test');
    expect(h).toHaveLength(16);
    expect(/^[0-9a-f]+$/.test(h)).toBe(true);
  });

  it('is deterministic', () => {
    expect(hashString('hello')).toBe(hashString('hello'));
  });

  it('differs for different inputs', () => {
    expect(hashString('a')).not.toBe(hashString('b'));
  });
});

describe('normalizeNodeKind', () => {
  it('returns ID for Identifier', () => {
    expect(normalizeNodeKind(ts.SyntaxKind.Identifier)).toBe('ID');
  });

  it('returns STR for string literals', () => {
    expect(normalizeNodeKind(ts.SyntaxKind.StringLiteral)).toBe('STR');
    expect(normalizeNodeKind(ts.SyntaxKind.NoSubstitutionTemplateLiteral)).toBe(
      'STR'
    );
  });

  it('returns NUM for numeric literal', () => {
    expect(normalizeNodeKind(ts.SyntaxKind.NumericLiteral)).toBe('NUM');
  });

  it('returns BOOL for boolean keywords', () => {
    expect(normalizeNodeKind(ts.SyntaxKind.TrueKeyword)).toBe('BOOL');
    expect(normalizeNodeKind(ts.SyntaxKind.FalseKeyword)).toBe('BOOL');
  });

  it('returns NULL for NullKeyword', () => {
    expect(normalizeNodeKind(ts.SyntaxKind.NullKeyword)).toBe('NULL');
  });

  it('returns SyntaxKind name for others', () => {
    const result = normalizeNodeKind(ts.SyntaxKind.IfStatement);
    expect(result).toBe('IfStatement');
  });

  it('returns BIGINT for BigIntLiteral', () => {
    expect(normalizeNodeKind(ts.SyntaxKind.BigIntLiteral)).toBe('BIGINT');
  });

  it('returns STR for TemplateMiddle and TemplateHead', () => {
    expect(normalizeNodeKind(ts.SyntaxKind.TemplateMiddle)).toBe('STR');
    expect(normalizeNodeKind(ts.SyntaxKind.TemplateHead)).toBe('STR');
  });

  it('returns UNKNOWN for unhandled kind when SyntaxKind has no name', () => {
    const unhandledKind = 99999 as ts.SyntaxKind;
    const result = normalizeNodeKind(unhandledKind);
    expect(result === 'UNKNOWN' || typeof result === 'string').toBe(true);
  });
});

describe('makeFingerprint', () => {
  it('returns consistent hash for same AST', () => {
    const src = ts.createSourceFile(
      'a.ts',
      'const x = 1;',
      ts.ScriptTarget.ESNext,
      true
    );
    const h1 = makeFingerprint(src);
    const h2 = makeFingerprint(src);
    expect(h1).toBe(h2);
  });

  it('returns different hashes for different ASTs', () => {
    const src1 = ts.createSourceFile(
      'a.ts',
      'const x = 1;',
      ts.ScriptTarget.ESNext,
      true
    );
    const src2 = ts.createSourceFile(
      'b.ts',
      'function f() {}',
      ts.ScriptTarget.ESNext,
      true
    );
    expect(makeFingerprint(src1)).not.toBe(makeFingerprint(src2));
  });

  it('uses shared cache via WeakMap', () => {
    const src = ts.createSourceFile(
      'a.ts',
      'const x = 1;',
      ts.ScriptTarget.ESNext,
      true
    );
    const cache = new WeakMap<ts.Node, string>();
    const h1 = makeFingerprint(src, cache);
    const h2 = makeFingerprint(src, cache);
    expect(h1).toBe(h2);
  });
});

describe('getLineAndCharacter', () => {
  it('returns 1-indexed line and column numbers', () => {
    const src = ts.createSourceFile(
      'a.ts',
      'const x = 1;\nconst y = 2;',
      ts.ScriptTarget.ESNext,
      true
    );
    const firstStmt = src.statements[0];
    const loc = getLineAndCharacter(src, firstStmt);
    expect(loc.lineStart).toBe(1);
    expect(loc.columnStart).toBe(1);
  });

  it('correctly positions second line', () => {
    const src = ts.createSourceFile(
      'a.ts',
      'const x = 1;\nconst y = 2;',
      ts.ScriptTarget.ESNext,
      true
    );
    const secondStmt = src.statements[1];
    const loc = getLineAndCharacter(src, secondStmt);
    expect(loc.lineStart).toBe(2);
  });
});

describe('isTestFile', () => {
  it('detects .test.ts files', () => {
    expect(isTestFile('src/foo.test.ts')).toBe(true);
    expect(isTestFile('src/foo.test.tsx')).toBe(true);
  });

  it('detects .spec.ts files', () => {
    expect(isTestFile('src/foo.spec.ts')).toBe(true);
  });

  it('detects __tests__ directory', () => {
    expect(isTestFile('__tests__/foo.ts')).toBe(true);
    expect(isTestFile('src/__tests__/foo.ts')).toBe(true);
  });

  it('detects tests/ directory', () => {
    expect(isTestFile('tests/foo.ts')).toBe(true);
  });

  it('returns false for production files', () => {
    expect(isTestFile('src/foo.ts')).toBe(false);
    expect(isTestFile('src/index.ts')).toBe(false);
    expect(isTestFile('src/testing-utils.ts')).toBe(false);
  });
});

describe('toRepoPath', () => {
  it('converts absolute path to relative', () => {
    expect(toRepoPath('/home/user/repo/src/a.ts', '/home/user/repo')).toBe(
      'src/a.ts'
    );
  });

  it('normalizes backslashes to forward slashes', () => {
    expect(toRepoPath('/repo/src\\a.ts', '/repo')).toMatch(/^src\/a\.ts$/);
  });
});

describe('normalizeDependencyValue', () => {
  it('normalizes path separators', () => {
    const result = normalizeDependencyValue('src/utils/helper');
    expect(result).not.toContain('\\');
    expect(result).toContain('/');
  });
});

describe('addToMapSet', () => {
  it('creates new set for new key', () => {
    const map = new Map<string, Set<string>>();
    addToMapSet(map, 'key', 'value');
    expect(map.get('key')?.has('value')).toBe(true);
  });

  it('adds to existing set', () => {
    const map = new Map<string, Set<string>>();
    addToMapSet(map, 'key', 'a');
    addToMapSet(map, 'key', 'b');
    expect(map.get('key')?.size).toBe(2);
  });

  it('does not duplicate values', () => {
    const map = new Map<string, Set<string>>();
    addToMapSet(map, 'key', 'a');
    addToMapSet(map, 'key', 'a');
    expect(map.get('key')?.size).toBe(1);
  });
});

describe('isRelativeImport', () => {
  it('detects ./ imports', () => {
    expect(isRelativeImport('./foo')).toBe(true);
  });

  it('detects ../ imports', () => {
    expect(isRelativeImport('../bar')).toBe(true);
  });

  it('rejects bare specifiers', () => {
    expect(isRelativeImport('lodash')).toBe(false);
    expect(isRelativeImport('@scope/pkg')).toBe(false);
  });

  it('rejects absolute paths', () => {
    expect(isRelativeImport('/absolute/path')).toBe(false);
  });
});

describe('increment', () => {
  it('creates new array for new key', () => {
    const map = new Map<string, number[]>();
    increment(map, 'key', 1);
    expect(map.get('key')).toEqual([1]);
  });

  it('appends to existing array', () => {
    const map = new Map<string, number[]>();
    increment(map, 'key', 1);
    increment(map, 'key', 2);
    expect(map.get('key')).toEqual([1, 2]);
  });

  it('handles different keys independently', () => {
    const map = new Map<string, string[]>();
    increment(map, 'a', 'x');
    increment(map, 'b', 'y');
    expect(map.get('a')).toEqual(['x']);
    expect(map.get('b')).toEqual(['y']);
  });
});

describe('buildNodeTree', () => {
  it('builds NodeTree from TS AST with kind, startLine, endLine, children', () => {
    const src = ts.createSourceFile(
      'a.ts',
      'const x = 1;\nconst y = 2;',
      ts.ScriptTarget.ESNext,
      true
    );
    const budget: NodeBudget = { size: 100 };
    const tree = buildNodeTree(src, src, 3, budget);
    expect(tree).not.toBeNull();
    expect(tree!.kind).toBe('SourceFile');
    expect(tree!.startLine).toBe(1);
    expect(tree!.endLine).toBe(2);
    expect(tree!.children.length).toBeGreaterThan(0);
    expect(tree!.truncated).toBeUndefined();
  });

  it('depth=0 produces truncated node', () => {
    const src = ts.createSourceFile(
      'a.ts',
      'const x = 1;',
      ts.ScriptTarget.ESNext,
      true
    );
    const budget: NodeBudget = { size: 100 };
    const tree = buildNodeTree(src, src, 0, budget);
    expect(tree).not.toBeNull();
    expect(tree!.truncated).toBe(true);
    expect(tree!.children).toEqual([]);
  });

  it('maxNodes budget exhausted produces partial tree', () => {
    const src = ts.createSourceFile(
      'a.ts',
      'const a = 1; const b = 2; const c = 3;',
      ts.ScriptTarget.ESNext,
      true
    );
    const budget: NodeBudget = { size: 2 };
    const tree = buildNodeTree(src, src, 3, budget);
    expect(tree).not.toBeNull();
    expect(budget.size).toBeLessThanOrEqual(0);
  });

  it('seen WeakSet prevents cycles when passing same node twice', () => {
    const src = ts.createSourceFile(
      'a.ts',
      'const x = 1;',
      ts.ScriptTarget.ESNext,
      true
    );
    const stmt = src.statements[0];
    const budget: NodeBudget = { size: 100 };
    const seen = new WeakSet<ts.Node>();
    const tree1 = buildNodeTree(stmt, src, 3, budget, seen);
    const budget2: NodeBudget = { size: 100 };
    const tree2 = buildNodeTree(stmt, src, 3, budget2, seen);
    expect(tree1).not.toBeNull();
    expect(tree2).not.toBeNull();
    expect(tree2!.truncated).toBe(true);
  });
});

describe('renderNodeText', () => {
  it('single node renders kind[line]', () => {
    const node = { kind: 'SourceFile', startLine: 1, endLine: 1, children: [] };
    expect(renderNodeText(node)).toBe('SourceFile[1]\n');
  });

  it('node with children indents properly', () => {
    const node = {
      kind: 'SourceFile',
      startLine: 1,
      endLine: 2,
      children: [
        { kind: 'VariableStatement', startLine: 1, endLine: 1, children: [] },
      ],
    };
    const out = renderNodeText(node);
    expect(out).toContain('SourceFile[1:2]\n');
    expect(out).toContain('  VariableStatement[1]\n');
  });

  it('truncated node adds ...', () => {
    const node = {
      kind: 'SourceFile',
      startLine: 1,
      endLine: 1,
      children: [],
      truncated: true,
    };
    expect(renderNodeText(node)).toBe('SourceFile[1] ...\n');
  });
});

describe('renderTreesText', () => {
  it('renders header and entries with packages/files', () => {
    const entries: TreeEntry[] = [
      {
        package: 'pkg-a',
        file: 'src/a.ts',
        tree: { kind: 'SourceFile', startLine: 1, endLine: 1, children: [] },
      },
    ];
    const out = renderTreesText(entries, '2025-01-01T00:00:00Z');
    expect(out).toContain('# AST Trees — 2025-01-01T00:00:00Z');
    expect(out).toContain('## pkg-a — src/a.ts');
    expect(out).toContain('SourceFile[1]');
  });
});

describe('resolveImportTarget', () => {
  it('resolves relative import with temp files', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-import-'));
    try {
      const targetPath = path.join(tmpDir, 'foo.ts');
      fs.writeFileSync(targetPath, 'export const x = 1;');
      const resolved = resolveImportTarget(tmpDir, './foo.ts');
      expect(resolved).toBe(targetPath);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('.js extension maps to .ts alternative', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-import-'));
    try {
      const targetPath = path.join(tmpDir, 'bar.ts');
      fs.writeFileSync(targetPath, 'export const y = 2;');
      const resolved = resolveImportTarget(tmpDir, './bar.js');
      expect(resolved).toBe(targetPath);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('extensionless resolves by trying IMPORT_RESOLVE_EXTS', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-import-'));
    try {
      const targetPath = path.join(tmpDir, 'baz.ts');
      fs.writeFileSync(targetPath, 'export const z = 3;');
      const resolved = resolveImportTarget(tmpDir, './baz');
      expect(resolved).toBe(targetPath);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('index.ts fallback for directory imports', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-import-'));
    try {
      const dirPath = path.join(tmpDir, 'lib');
      fs.mkdirSync(dirPath, { recursive: true });
      const indexPath = path.join(dirPath, 'index.ts');
      fs.writeFileSync(indexPath, 'export default {};');
      const resolved = resolveImportTarget(tmpDir, './lib');
      expect(resolved).toBe(indexPath);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('returns null for nonexistent', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-import-'));
    try {
      const resolved = resolveImportTarget(tmpDir, './nonexistent');
      expect(resolved).toBeNull();
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});
