import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  collectFiles,
  fileSummaryWithFindings,
  listWorkspacePackages,
  safeRead,
} from './discovery.js';
import { DEFAULT_OPTS } from '../types/index.js';

import type { AnalysisOptions, FileEntry } from '../types/index.js';

describe('discovery', () => {
  describe('collectFiles', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'discovery-collect-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('collects .ts, .tsx, .js, .jsx, .mjs, .cjs files', () => {
      fs.writeFileSync(path.join(tmpDir, 'a.ts'), '', 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'b.tsx'), '', 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'c.js'), '', 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'd.jsx'), '', 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'e.mjs'), '', 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'f.cjs'), '', 'utf8');

      const opts: AnalysisOptions = { ...DEFAULT_OPTS, root: tmpDir };
      const files = collectFiles(tmpDir, opts);

      expect(files).toHaveLength(6);
      expect(files.some(f => f.endsWith('a.ts'))).toBe(true);
      expect(files.some(f => f.endsWith('b.tsx'))).toBe(true);
      expect(files.some(f => f.endsWith('c.js'))).toBe(true);
      expect(files.some(f => f.endsWith('d.jsx'))).toBe(true);
      expect(files.some(f => f.endsWith('e.mjs'))).toBe(true);
      expect(files.some(f => f.endsWith('f.cjs'))).toBe(true);
    });

    it('skips .d.ts files', () => {
      fs.writeFileSync(path.join(tmpDir, 'types.d.ts'), '', 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'index.ts'), '', 'utf8');

      const opts: AnalysisOptions = { ...DEFAULT_OPTS, root: tmpDir };
      const files = collectFiles(tmpDir, opts);

      expect(files).toHaveLength(1);
      expect(files.some(f => f.endsWith('index.ts'))).toBe(true);
      expect(files.some(f => f.endsWith('types.d.ts'))).toBe(false);
    });

    it('skips symlinks', () => {
      const realFile = path.join(tmpDir, 'real.ts');
      fs.writeFileSync(realFile, '', 'utf8');
      fs.symlinkSync(realFile, path.join(tmpDir, 'link.ts'));

      const opts: AnalysisOptions = { ...DEFAULT_OPTS, root: tmpDir };
      const files = collectFiles(tmpDir, opts);

      expect(files).toHaveLength(1);
      expect(files.some(f => f.endsWith('real.ts'))).toBe(true);
      expect(files.some(f => f.endsWith('link.ts'))).toBe(false);
    });

    it('skips directories in ignoreDirs', () => {
      const skipDir = path.join(tmpDir, 'skipme');
      fs.mkdirSync(skipDir, { recursive: true });
      fs.writeFileSync(path.join(skipDir, 'nested.ts'), '', 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'root.ts'), '', 'utf8');

      const opts: AnalysisOptions = {
        ...DEFAULT_OPTS,
        root: tmpDir,
        ignoreDirs: new Set(['skipme']),
      };
      const files = collectFiles(tmpDir, opts);

      expect(files).toHaveLength(1);
      expect(files.some(f => f.endsWith('root.ts'))).toBe(true);
      expect(files.some(f => f.includes('skipme'))).toBe(false);
    });

    it('excludes test files when includeTests is false', () => {
      fs.writeFileSync(path.join(tmpDir, 'foo.ts'), '', 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'foo.test.ts'), '', 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'foo.spec.ts'), '', 'utf8');
      fs.mkdirSync(path.join(tmpDir, '__tests__'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, '__tests__', 'bar.ts'), '', 'utf8');

      const opts: AnalysisOptions = {
        ...DEFAULT_OPTS,
        root: tmpDir,
        includeTests: false,
      };
      const files = collectFiles(tmpDir, opts);

      expect(files).toHaveLength(1);
      expect(files.some(f => f.endsWith('foo.ts'))).toBe(true);
      expect(files.some(f => f.endsWith('foo.test.ts'))).toBe(false);
      expect(files.some(f => f.endsWith('foo.spec.ts'))).toBe(false);
      expect(files.some(f => f.includes('__tests__'))).toBe(false);
    });

    it('includes test files when includeTests is true', () => {
      fs.writeFileSync(path.join(tmpDir, 'foo.ts'), '', 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'foo.test.ts'), '', 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'foo.spec.ts'), '', 'utf8');
      fs.mkdirSync(path.join(tmpDir, '__tests__'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, '__tests__', 'bar.ts'), '', 'utf8');

      const opts: AnalysisOptions = {
        ...DEFAULT_OPTS,
        root: tmpDir,
        includeTests: true,
      };
      const files = collectFiles(tmpDir, opts);

      expect(files).toHaveLength(4);
      expect(files.some(f => f.endsWith('foo.ts'))).toBe(true);
      expect(files.some(f => f.endsWith('foo.test.ts'))).toBe(true);
      expect(files.some(f => f.endsWith('foo.spec.ts'))).toBe(true);
      expect(
        files.some(f => f.includes('__tests__') && f.endsWith('bar.ts'))
      ).toBe(true);
    });

    it('walks nested directories', () => {
      fs.mkdirSync(path.join(tmpDir, 'src', 'utils'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'index.ts'), '', 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'src', 'app.ts'), '', 'utf8');
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'utils', 'helper.ts'),
        '',
        'utf8'
      );

      const opts: AnalysisOptions = { ...DEFAULT_OPTS, root: tmpDir };
      const files = collectFiles(tmpDir, opts);

      expect(files).toHaveLength(3);
      expect(files.some(f => f.endsWith('index.ts'))).toBe(true);
      expect(files.some(f => f.endsWith('app.ts'))).toBe(true);
      expect(files.some(f => f.endsWith('helper.ts'))).toBe(true);
    });

    it('skips non-allowed extensions', () => {
      fs.writeFileSync(path.join(tmpDir, 'a.ts'), '', 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'b.txt'), '', 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'c.json'), '', 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'd.css'), '', 'utf8');

      const opts: AnalysisOptions = { ...DEFAULT_OPTS, root: tmpDir };
      const files = collectFiles(tmpDir, opts);

      expect(files).toHaveLength(1);
      expect(files.some(f => f.endsWith('a.ts'))).toBe(true);
    });

    it('handles empty directories', () => {
      fs.mkdirSync(path.join(tmpDir, 'empty'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'only.ts'), '', 'utf8');

      const opts: AnalysisOptions = { ...DEFAULT_OPTS, root: tmpDir };
      const files = collectFiles(tmpDir, opts);

      expect(files).toHaveLength(1);
      expect(files.some(f => f.endsWith('only.ts'))).toBe(true);
    });

    it('returns sorted file paths', () => {
      fs.writeFileSync(path.join(tmpDir, 'z.ts'), '', 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'a.ts'), '', 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'm.ts'), '', 'utf8');

      const opts: AnalysisOptions = { ...DEFAULT_OPTS, root: tmpDir };
      const files = collectFiles(tmpDir, opts);

      expect(files).toHaveLength(3);
      const basenames = files.map(f => path.basename(f));
      expect(basenames).toEqual(
        [...basenames].sort((a, b) => a.localeCompare(b))
      );
    });

    it('skips minified js artifacts', () => {
      fs.writeFileSync(path.join(tmpDir, 'app.js'), '', 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'app.min.js'), '', 'utf8');

      const opts: AnalysisOptions = { ...DEFAULT_OPTS, root: tmpDir };
      const files = collectFiles(tmpDir, opts);

      expect(files.some(f => f.endsWith('app.js'))).toBe(true);
      expect(files.some(f => f.endsWith('app.min.js'))).toBe(false);
    });

    it('skips scripts files when mirrored src file exists', () => {
      fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, 'scripts'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), '', 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'scripts', 'index.js'), '', 'utf8');

      const opts: AnalysisOptions = { ...DEFAULT_OPTS, root: tmpDir };
      const files = collectFiles(tmpDir, opts);

      expect(files.some(f => f.endsWith(path.join('src', 'index.ts')))).toBe(
        true
      );
      expect(
        files.some(f => f.endsWith(path.join('scripts', 'index.js')))
      ).toBe(false);
    });

    it('keeps scripts files when no src mirror exists', () => {
      fs.mkdirSync(path.join(tmpDir, 'scripts'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'scripts', 'bootstrap.js'), '', 'utf8');

      const opts: AnalysisOptions = { ...DEFAULT_OPTS, root: tmpDir };
      const files = collectFiles(tmpDir, opts);

      expect(
        files.some(f => f.endsWith(path.join('scripts', 'bootstrap.js')))
      ).toBe(true);
    });

    it('keeps scoped scripts file even when mirrored src file exists', () => {
      fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, 'scripts'), { recursive: true });
      const scriptPath = path.join(tmpDir, 'scripts', 'index.js');
      fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), '', 'utf8');
      fs.writeFileSync(scriptPath, '', 'utf8');

      const opts: AnalysisOptions = {
        ...DEFAULT_OPTS,
        root: tmpDir,
        scope: [scriptPath],
      };
      const files = collectFiles(tmpDir, opts);

      expect(files.some(f => f === scriptPath)).toBe(true);
    });
  });

  describe('safeRead', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'discovery-saferead-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('reads existing file content', () => {
      const filePath = path.join(tmpDir, 'hello.ts');
      const content = 'const x = 1;\nconsole.log(x);';
      fs.writeFileSync(filePath, content, 'utf8');

      expect(safeRead(filePath)).toBe(content);
    });

    it('returns null for non-existent file', () => {
      const filePath = path.join(tmpDir, 'does-not-exist.ts');
      expect(safeRead(filePath)).toBeNull();
    });

    it('returns null when given a directory path', () => {
      const dirPath = path.join(tmpDir, 'adir');
      fs.mkdirSync(dirPath, { recursive: true });

      expect(safeRead(dirPath)).toBeNull();
    });
  });

  describe('listWorkspacePackages', () => {
    let tmpDir: string;
    let packagesDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'discovery-packages-'));
      packagesDir = path.join(tmpDir, 'packages');
      fs.mkdirSync(packagesDir, { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('lists packages with valid package.json', () => {
      fs.mkdirSync(path.join(packagesDir, 'pkg-a'), { recursive: true });
      fs.mkdirSync(path.join(packagesDir, 'pkg-b'), { recursive: true });
      fs.writeFileSync(
        path.join(packagesDir, 'pkg-a', 'package.json'),
        JSON.stringify({ name: 'pkg-a' }),
        'utf8'
      );
      fs.writeFileSync(
        path.join(packagesDir, 'pkg-b', 'package.json'),
        JSON.stringify({ name: 'pkg-b' }),
        'utf8'
      );

      const packages = listWorkspacePackages(tmpDir, packagesDir);

      expect(packages).toHaveLength(2);
      expect(packages.map(p => p.name)).toContain('pkg-a');
      expect(packages.map(p => p.name)).toContain('pkg-b');
      expect(packages.map(p => p.folder)).toContain('pkg-a');
      expect(packages.map(p => p.folder)).toContain('pkg-b');
    });

    it('skips directories without package.json', () => {
      fs.mkdirSync(path.join(packagesDir, 'has-pkg'), { recursive: true });
      fs.mkdirSync(path.join(packagesDir, 'no-pkg'), { recursive: true });
      fs.writeFileSync(
        path.join(packagesDir, 'has-pkg', 'package.json'),
        JSON.stringify({ name: 'has-pkg' }),
        'utf8'
      );

      const packages = listWorkspacePackages(tmpDir, packagesDir);

      expect(packages).toHaveLength(1);
      expect(packages[0].name).toBe('has-pkg');
    });

    it('skips invalid JSON in package.json', () => {
      fs.mkdirSync(path.join(packagesDir, 'valid'), { recursive: true });
      fs.mkdirSync(path.join(packagesDir, 'invalid'), { recursive: true });
      fs.writeFileSync(
        path.join(packagesDir, 'valid', 'package.json'),
        JSON.stringify({ name: 'valid' }),
        'utf8'
      );
      fs.writeFileSync(
        path.join(packagesDir, 'invalid', 'package.json'),
        '{ invalid json }',
        'utf8'
      );

      const packages = listWorkspacePackages(tmpDir, packagesDir);

      expect(packages).toHaveLength(1);
      expect(packages[0].name).toBe('valid');
    });

    it('skips package.json without name field', () => {
      fs.mkdirSync(path.join(packagesDir, 'no-name'), { recursive: true });
      fs.writeFileSync(
        path.join(packagesDir, 'no-name', 'package.json'),
        JSON.stringify({ version: '1.0.0' }),
        'utf8'
      );

      const packages = listWorkspacePackages(tmpDir, packagesDir);

      expect(packages).toHaveLength(0);
    });

    it('returns sorted results by folder name', () => {
      fs.mkdirSync(path.join(packagesDir, 'pkg-z'), { recursive: true });
      fs.mkdirSync(path.join(packagesDir, 'pkg-a'), { recursive: true });
      fs.mkdirSync(path.join(packagesDir, 'pkg-m'), { recursive: true });
      fs.writeFileSync(
        path.join(packagesDir, 'pkg-z', 'package.json'),
        JSON.stringify({ name: 'pkg-z' }),
        'utf8'
      );
      fs.writeFileSync(
        path.join(packagesDir, 'pkg-a', 'package.json'),
        JSON.stringify({ name: 'pkg-a' }),
        'utf8'
      );
      fs.writeFileSync(
        path.join(packagesDir, 'pkg-m', 'package.json'),
        JSON.stringify({ name: 'pkg-m' }),
        'utf8'
      );

      const packages = listWorkspacePackages(tmpDir, packagesDir);

      expect(packages).toHaveLength(3);
      expect(packages.map(p => p.folder)).toEqual(['pkg-a', 'pkg-m', 'pkg-z']);
    });

    it('returns empty array when packageRoot does not exist', () => {
      const packages = listWorkspacePackages(
        tmpDir,
        path.join(tmpDir, 'nonexistent')
      );
      expect(packages).toEqual([]);
    });
  });

  describe('fileSummaryWithFindings', () => {
    function makeFileEntry(override: Partial<FileEntry> = {}): FileEntry {
      return {
        package: 'pkg',
        file: 'src/file.ts',
        parseEngine: 'typescript',
        nodeCount: 1,
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
        ...override,
      };
    }

    it('merges issueIds into entries', () => {
      const entries: FileEntry[] = [
        makeFileEntry({ file: 'src/a.ts' }),
        makeFileEntry({ file: 'src/b.ts' }),
      ];
      const byFile = new Map<string, string[]>([
        ['src/a.ts', ['issue-1', 'issue-2']],
        ['src/b.ts', ['issue-3']],
      ]);

      const result = fileSummaryWithFindings(entries, byFile);

      expect(result).toHaveLength(2);
      expect(result[0].file).toBe('src/a.ts');
      expect(result[0].issueIds).toEqual(['issue-1', 'issue-2']);
      expect(result[1].file).toBe('src/b.ts');
      expect(result[1].issueIds).toEqual(['issue-3']);
    });

    it('returns empty issueIds for entries without findings', () => {
      const entries: FileEntry[] = [
        makeFileEntry({ file: 'src/a.ts' }),
        makeFileEntry({ file: 'src/b.ts' }),
      ];
      const byFile = new Map<string, string[]>([['src/a.ts', ['issue-1']]]);

      const result = fileSummaryWithFindings(entries, byFile);

      expect(result).toHaveLength(2);
      expect(result[0].issueIds).toEqual(['issue-1']);
      expect(result[1].issueIds).toEqual([]);
    });

    it('handles empty byFile map', () => {
      const entries: FileEntry[] = [makeFileEntry({ file: 'src/a.ts' })];
      const byFile = new Map<string, string[]>();

      const result = fileSummaryWithFindings(entries, byFile);

      expect(result).toHaveLength(1);
      expect(result[0].issueIds).toEqual([]);
    });

    it('handles empty entries array', () => {
      const byFile = new Map<string, string[]>([['src/a.ts', ['issue-1']]]);

      const result = fileSummaryWithFindings([], byFile);

      expect(result).toEqual([]);
    });
  });
});
