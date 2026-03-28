import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { saveBaseline, filterKnownFindings } from './baseline.js';
import type { Finding } from '../types/index.js';

function makeFinding(overrides: Partial<Finding>): Finding {
  return {
    id: 'f1',
    severity: 'medium',
    category: 'dead-export',
    file: 'src/a.ts',
    lineStart: 1,
    lineEnd: 5,
    title: 'Unused export',
    reason: 'No consumers',
    files: ['src/a.ts'],
    suggestedFix: { strategy: 'remove', steps: ['Delete export'] },
    ...overrides,
  };
}

describe('baseline', () => {
  const tmpDirs: string[] = [];

  function makeTmpDir(): string {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-test-'));
    tmpDirs.push(d);
    return d;
  }

  afterEach(() => {
    for (const d of tmpDirs) {
      fs.rmSync(d, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  describe('saveBaseline', () => {
    it('writes baseline.json with correct structure', () => {
      const root = makeTmpDir();
      const findings = [
        makeFinding({ category: 'dead-export', file: 'src/a.ts' }),
        makeFinding({ category: 'god-function', file: 'src/b.ts' }),
      ];

      const result = saveBaseline(root, findings);
      expect(result).toContain('baseline.json');
      expect(fs.existsSync(result)).toBe(true);

      const data = JSON.parse(fs.readFileSync(result, 'utf8'));
      expect(data.count).toBe(2);
      expect(data.entries).toHaveLength(2);
      expect(data.entries[0].category).toBe('dead-export');
      expect(data.entries[1].category).toBe('god-function');
      expect(data.generatedAt).toBeDefined();
    });

    it('creates .octocode directory if it does not exist', () => {
      const root = makeTmpDir();
      const result = saveBaseline(root, [makeFinding({})]);
      expect(fs.existsSync(path.dirname(result))).toBe(true);
    });

    it('saves empty baseline for empty findings', () => {
      const root = makeTmpDir();
      const result = saveBaseline(root, []);

      const data = JSON.parse(fs.readFileSync(result, 'utf8'));
      expect(data.count).toBe(0);
      expect(data.entries).toHaveLength(0);
    });

    it('captures category, file, and title per entry', () => {
      const root = makeTmpDir();
      const finding = makeFinding({
        category: 'unsafe-any',
        file: 'lib/utils.ts',
        title: 'Too many any',
      });
      const result = saveBaseline(root, [finding]);
      const data = JSON.parse(fs.readFileSync(result, 'utf8'));
      expect(data.entries[0]).toEqual({
        category: 'unsafe-any',
        file: 'lib/utils.ts',
        title: 'Too many any',
      });
    });
  });

  describe('filterKnownFindings', () => {
    it('filters out findings matching baseline entries by (category, file)', () => {
      const root = makeTmpDir();
      const baselinePath = path.join(root, 'baseline.json');
      fs.writeFileSync(
        baselinePath,
        JSON.stringify({
          entries: [
            { category: 'dead-export', file: 'src/a.ts', title: 'old title' },
          ],
        })
      );

      const findings = [
        makeFinding({
          category: 'dead-export',
          file: 'src/a.ts',
          title: 'new title',
        }),
        makeFinding({ category: 'god-function', file: 'src/b.ts' }),
      ];

      const { filtered, suppressedCount } = filterKnownFindings(
        findings,
        baselinePath,
        root
      );
      expect(suppressedCount).toBe(1);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].category).toBe('god-function');
    });

    it('returns all findings when baseline file missing', () => {
      const findings = [makeFinding({})];
      const { filtered, suppressedCount } = filterKnownFindings(
        findings,
        '/nonexistent/baseline.json',
        '/tmp'
      );
      expect(suppressedCount).toBe(0);
      expect(filtered).toHaveLength(1);
    });

    it('resolves relative baseline path against root', () => {
      const root = makeTmpDir();
      const dir = path.join(root, '.octocode');
      fs.mkdirSync(dir, { recursive: true });
      const baselinePath = path.join(dir, 'baseline.json');
      fs.writeFileSync(
        baselinePath,
        JSON.stringify({
          entries: [
            { category: 'dead-export', file: 'src/a.ts', title: 't' },
          ],
        })
      );

      const findings = [
        makeFinding({ category: 'dead-export', file: 'src/a.ts' }),
      ];
      const { filtered } = filterKnownFindings(
        findings,
        '.octocode/baseline.json',
        root
      );
      expect(filtered).toHaveLength(0);
    });

    it('does not suppress same category in a different file', () => {
      const root = makeTmpDir();
      const baselinePath = path.join(root, 'baseline.json');
      fs.writeFileSync(
        baselinePath,
        JSON.stringify({
          entries: [
            { category: 'dead-export', file: 'src/a.ts', title: 'x' },
          ],
        })
      );

      const findings = [
        makeFinding({ category: 'dead-export', file: 'src/b.ts' }),
      ];
      const { filtered, suppressedCount } = filterKnownFindings(
        findings,
        baselinePath,
        root
      );
      expect(suppressedCount).toBe(0);
      expect(filtered).toHaveLength(1);
    });

    it('handles corrupted baseline JSON gracefully', () => {
      const root = makeTmpDir();
      const baselinePath = path.join(root, 'baseline.json');
      fs.writeFileSync(baselinePath, '{broken json!!!');

      const findings = [makeFinding({})];
      const { filtered, suppressedCount } = filterKnownFindings(
        findings,
        baselinePath,
        root
      );
      expect(suppressedCount).toBe(0);
      expect(filtered).toHaveLength(1);
    });

    it('handles baseline with empty entries array', () => {
      const root = makeTmpDir();
      const baselinePath = path.join(root, 'baseline.json');
      fs.writeFileSync(baselinePath, JSON.stringify({ entries: [] }));

      const findings = [makeFinding({}), makeFinding({ file: 'src/z.ts' })];
      const { filtered, suppressedCount } = filterKnownFindings(
        findings,
        baselinePath,
        root
      );
      expect(suppressedCount).toBe(0);
      expect(filtered).toHaveLength(2);
    });

    it('round-trip: save then load filters correctly', () => {
      const root = makeTmpDir();
      const original = [
        makeFinding({ category: 'dead-export', file: 'src/a.ts' }),
        makeFinding({ category: 'god-function', file: 'src/b.ts' }),
      ];

      const baselinePath = saveBaseline(root, original);

      const newFindings = [
        makeFinding({ category: 'dead-export', file: 'src/a.ts' }),
        makeFinding({ category: 'god-function', file: 'src/b.ts' }),
        makeFinding({ category: 'unsafe-any', file: 'src/c.ts' }),
      ];

      const { filtered, suppressedCount } = filterKnownFindings(
        newFindings,
        baselinePath,
        root
      );
      expect(suppressedCount).toBe(2);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].category).toBe('unsafe-any');
    });

    it('suppresses multiple findings matching same baseline entry', () => {
      const root = makeTmpDir();
      const baselinePath = path.join(root, 'baseline.json');
      fs.writeFileSync(
        baselinePath,
        JSON.stringify({
          entries: [
            { category: 'dead-export', file: 'src/a.ts', title: 'x' },
          ],
        })
      );

      const findings = [
        makeFinding({
          id: 'f1',
          category: 'dead-export',
          file: 'src/a.ts',
          title: 'export A',
        }),
        makeFinding({
          id: 'f2',
          category: 'dead-export',
          file: 'src/a.ts',
          title: 'export B',
        }),
      ];
      const { filtered, suppressedCount } = filterKnownFindings(
        findings,
        baselinePath,
        root
      );
      expect(suppressedCount).toBe(2);
      expect(filtered).toHaveLength(0);
    });
  });
});
