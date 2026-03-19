import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { canonicalScriptKind, hashString, isTestFile } from './common/utils.js';
import { parseArgs } from './pipeline/cli.js';

describe('sanity checks', () => {
  it('maps extension to script kind', () => {
    expect(canonicalScriptKind('.tsx')).toBe(ts.ScriptKind.TSX);
    expect(canonicalScriptKind('.mjs')).toBe(ts.ScriptKind.JS);
    expect(canonicalScriptKind('.ts')).toBe(ts.ScriptKind.TS);
  });

  it('detects test files', () => {
    expect(isTestFile('src/foo.test.ts')).toBe(true);
    expect(isTestFile('tests/foo.ts')).toBe(true);
    expect(isTestFile('src/foo.ts')).toBe(false);
  });

  it('parses common CLI args', () => {
    const parsed = parseArgs([
      '--json',
      '--include-tests',
      '--parser',
      'typescript',
      '--min-function-statements',
      '10',
      '--findings-limit',
      '120',
    ]);

    expect(parsed.json).toBe(true);
    expect(parsed.includeTests).toBe(true);
    expect(parsed.parser).toBe('typescript');
    expect(parsed.minFunctionStatements).toBe(10);
    expect(parsed.findingsLimit).toBe(120);
    expect(parsed.packageRoot).toMatch(/packages$/);
  });

  it('creates deterministic short hashes', () => {
    const first = hashString('hello-world');
    const second = hashString('hello-world');

    expect(first).toBe(second);
    expect(first).toHaveLength(16);
  });
});
