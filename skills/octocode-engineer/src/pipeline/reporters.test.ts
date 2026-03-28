import { describe, expect, it } from 'vitest';

import { formatFindings } from './reporters.js';
import type { Finding } from '../types/index.js';

function makeFinding(overrides: Partial<Finding>): Finding {
  return {
    id: 'f1',
    severity: 'high',
    category: 'dead-export',
    file: '/repo/src/a.ts',
    lineStart: 10,
    lineEnd: 15,
    title: 'Unused export foo',
    reason: 'No consumers',
    files: ['/repo/src/a.ts'],
    suggestedFix: { strategy: 'remove', steps: ['Delete'] },
    ...overrides,
  };
}

describe('formatFindings', () => {
  describe('compact reporter', () => {
    it('formats one-line per finding with line number', () => {
      const findings = [
        makeFinding({
          severity: 'high',
          file: '/repo/src/a.ts',
          lineStart: 10,
          category: 'dead-export',
          title: 'Unused foo',
        }),
      ];

      const result = formatFindings(findings, 'compact', '/repo');
      expect(result).toBe('high:src/a.ts:10 - [dead-export] Unused foo');
    });

    it('omits line number when lineStart is 0', () => {
      const findings = [
        makeFinding({
          severity: 'low',
          file: '/repo/src/b.ts',
          lineStart: 0,
          category: 'god-function',
          title: 'Big func',
        }),
      ];

      const result = formatFindings(findings, 'compact', '/repo');
      expect(result).toBe('low:src/b.ts - [god-function] Big func');
    });

    it('handles empty findings list', () => {
      expect(formatFindings([], 'compact', '/repo')).toBe('');
    });

    it('formats multiple findings separated by newlines', () => {
      const findings = [
        makeFinding({ severity: 'critical', title: 'A' }),
        makeFinding({ severity: 'low', title: 'B' }),
      ];
      const lines = formatFindings(findings, 'compact', '/repo').split('\n');
      expect(lines).toHaveLength(2);
    });

    it('handles file paths not under root', () => {
      const findings = [
        makeFinding({ file: '/other/place/x.ts', lineStart: 5, title: 'Out' }),
      ];
      const result = formatFindings(findings, 'compact', '/repo');
      expect(result).toContain('/other/place/x.ts:5');
    });
  });

  describe('github-actions reporter', () => {
    it('maps critical severity to ::error', () => {
      const findings = [
        makeFinding({ severity: 'critical', lineStart: 5, title: 'Leak' }),
      ];
      const result = formatFindings(findings, 'github-actions', '/repo');
      expect(result.startsWith('::error ')).toBe(true);
    });

    it('maps high severity to ::error', () => {
      const findings = [
        makeFinding({ severity: 'high', lineStart: 5, title: 'Bad' }),
      ];
      const result = formatFindings(findings, 'github-actions', '/repo');
      expect(result.startsWith('::error ')).toBe(true);
    });

    it('maps medium severity to ::warning', () => {
      const findings = [
        makeFinding({ severity: 'medium', lineStart: 5, title: 'Warn' }),
      ];
      const result = formatFindings(findings, 'github-actions', '/repo');
      expect(result.startsWith('::warning ')).toBe(true);
    });

    it('maps low severity to ::notice', () => {
      const findings = [
        makeFinding({ severity: 'low', lineStart: 5, title: 'Info' }),
      ];
      const result = formatFindings(findings, 'github-actions', '/repo');
      expect(result.startsWith('::notice ')).toBe(true);
    });

    it('maps info severity to ::warning (default)', () => {
      const findings = [
        makeFinding({ severity: 'info', lineStart: 5, title: 'Note' }),
      ];
      const result = formatFindings(findings, 'github-actions', '/repo');
      expect(result.startsWith('::warning ')).toBe(true);
    });

    it('includes file and line in annotation', () => {
      const findings = [
        makeFinding({
          severity: 'high',
          file: '/repo/src/a.ts',
          lineStart: 42,
          title: 'Found it',
          category: 'unsafe-any',
        }),
      ];
      const result = formatFindings(findings, 'github-actions', '/repo');
      expect(result).toBe(
        '::error file=src/a.ts,line=42::Found it [unsafe-any]'
      );
    });

    it('defaults to line 1 when lineStart is 0', () => {
      const findings = [
        makeFinding({ severity: 'medium', lineStart: 0, title: 'X' }),
      ];
      const result = formatFindings(findings, 'github-actions', '/repo');
      expect(result).toContain('line=1');
    });

    it('handles empty findings list', () => {
      expect(formatFindings([], 'github-actions', '/repo')).toBe('');
    });
  });

  describe('default reporter', () => {
    it('returns empty string for default format', () => {
      expect(formatFindings([], 'default', '/repo')).toBe('');
    });

    it('returns empty string even with findings', () => {
      expect(formatFindings([makeFinding({})], 'default', '/repo')).toBe('');
    });
  });
});
