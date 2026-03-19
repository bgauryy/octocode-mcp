import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { collectPrototypePollutionSites } from './collect-prototype-pollution.js';

function parse(code: string, fileName = '/repo/src/test.ts'): ts.SourceFile {
  return ts.createSourceFile(fileName, code, ts.ScriptTarget.ESNext, true);
}

describe('collectPrototypePollutionSites', () => {
  it('detects Object.assign risk', () => {
    const sourceFile = parse(`
      function merge(a: any, b: any) {
        Object.assign(a, b);
      }
    `);
    const sites = collectPrototypePollutionSites(sourceFile);
    expect(sites.some(s => s.kind === 'object-assign')).toBe(true);
  });

  it('detects deep merge risk', () => {
    const sourceFile = parse(`
      function merge(a: any, b: any) {
        deepMerge(a, b);
      }
    `);
    const sites = collectPrototypePollutionSites(sourceFile);
    expect(sites.some(s => s.kind === 'deep-merge')).toBe(true);
  });

  it('detects dynamic bracket assignment', () => {
    const sourceFile = parse(`
      function write(obj: Record<string, unknown>, key: string, val: unknown) {
        obj[key] = val;
      }
    `);
    const sites = collectPrototypePollutionSites(sourceFile);
    expect(sites.some(s => s.kind === 'computed-property-write')).toBe(true);
  });

  it('marks guarded writes when iterating known internal keys', () => {
    const sourceFile = parse(`
      function copy(dst: Record<string, unknown>, src: Record<string, unknown>) {
        for (const key of Object.keys(src)) {
          dst[key] = src[key];
        }
      }
    `);
    const sites = collectPrototypePollutionSites(sourceFile);
    const guarded = sites.filter(
      s => s.kind === 'computed-property-write' && s.guarded
    );
    expect(guarded.length).toBeGreaterThan(0);
  });
});
