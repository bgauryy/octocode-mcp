import { describe, expect, it } from 'vitest';
import * as ts from 'typescript';
import {
  canonicalScriptKind,
  hashString,
  normalizeNodeKind,
  makeFingerprint,
  getLineAndCharacter,
  isTestFile,
  toRepoPath,
  normalizeDependencyValue,
  addToMapSet,
  isRelativeImport,
  increment,
} from './utils.js';

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
    expect(normalizeNodeKind(ts.SyntaxKind.NoSubstitutionTemplateLiteral)).toBe('STR');
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
});

describe('makeFingerprint', () => {
  it('returns consistent hash for same AST', () => {
    const src = ts.createSourceFile('a.ts', 'const x = 1;', ts.ScriptTarget.ESNext, true);
    const h1 = makeFingerprint(src);
    const h2 = makeFingerprint(src);
    expect(h1).toBe(h2);
  });

  it('returns different hashes for different ASTs', () => {
    const src1 = ts.createSourceFile('a.ts', 'const x = 1;', ts.ScriptTarget.ESNext, true);
    const src2 = ts.createSourceFile('b.ts', 'function f() {}', ts.ScriptTarget.ESNext, true);
    expect(makeFingerprint(src1)).not.toBe(makeFingerprint(src2));
  });

  it('uses shared cache via WeakMap', () => {
    const src = ts.createSourceFile('a.ts', 'const x = 1;', ts.ScriptTarget.ESNext, true);
    const cache = new WeakMap<ts.Node, string>();
    const h1 = makeFingerprint(src, cache);
    const h2 = makeFingerprint(src, cache);
    expect(h1).toBe(h2);
  });
});

describe('getLineAndCharacter', () => {
  it('returns 1-indexed line and column numbers', () => {
    const src = ts.createSourceFile('a.ts', 'const x = 1;\nconst y = 2;', ts.ScriptTarget.ESNext, true);
    const firstStmt = src.statements[0];
    const loc = getLineAndCharacter(src, firstStmt);
    expect(loc.lineStart).toBe(1);
    expect(loc.columnStart).toBe(1);
  });

  it('correctly positions second line', () => {
    const src = ts.createSourceFile('a.ts', 'const x = 1;\nconst y = 2;', ts.ScriptTarget.ESNext, true);
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
    expect(toRepoPath('/home/user/repo/src/a.ts', '/home/user/repo')).toBe('src/a.ts');
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
