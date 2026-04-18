import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const skillRoot = resolve(here, '..');
const scriptsDir = join(skillRoot, 'scripts');

const PROHIBITED_EXTERNALS = ['typescript'];

function hasTopLevelImportFrom(src: string, pkg: string): boolean {
  const escaped = pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `(?:^|[;}\\s])(?:import|export)[^"'\\n;]*?from\\s*["']${escaped}["']`,
    'm',
  );
  return re.test(src);
}

describe('build output', () => {
  const runPath = join(scriptsDir, 'run.js');
  const searchPath = join(scriptsDir, 'ast', 'search.js');
  const treeSearchPath = join(scriptsDir, 'ast', 'tree-search.js');
  const indexPath = join(scriptsDir, 'index.js');

  it('produces exactly the three documented entry points', () => {
    expect(existsSync(runPath), 'scripts/run.js missing').toBe(true);
    expect(existsSync(searchPath), 'scripts/ast/search.js missing').toBe(true);
    expect(existsSync(treeSearchPath), 'scripts/ast/tree-search.js missing').toBe(true);
  });

  it('does not emit the undocumented index.js entry', () => {
    expect(existsSync(indexPath), 'scripts/index.js is dead weight; drop index entry from build.mjs').toBe(false);
  });

  describe.each([
    ['run.js', runPath],
    ['ast/search.js', searchPath],
    ['ast/tree-search.js', treeSearchPath],
  ])('%s bundle', (_label, path) => {
    it.each(PROHIBITED_EXTERNALS)(
      'inlines pure-JS dep %s instead of leaving it external',
      (pkg) => {
        if (!existsSync(path)) return;
        const src = readFileSync(path, 'utf8');
        expect(
          hasTopLevelImportFrom(src, pkg),
          `${pkg} is imported externally; should be inlined into the bundle`,
        ).toBe(false);
      },
    );
  });

  it('scripts/run.js --help runs without missing-module errors', () => {
    if (!existsSync(runPath)) return;
    expect(() =>
      execFileSync(process.execPath, [runPath, '--help'], {
        cwd: skillRoot,
        stdio: 'pipe',
        timeout: 15_000,
      }),
    ).not.toThrow();
  });

  it('scripts/ast/search.js --list-presets runs without missing-module errors', () => {
    if (!existsSync(searchPath)) return;
    expect(() =>
      execFileSync(process.execPath, [searchPath, '--list-presets'], {
        cwd: skillRoot,
        stdio: 'pipe',
        timeout: 15_000,
      }),
    ).not.toThrow();
  });

  it('scripts/ast/tree-search.js --help runs without missing-module errors', () => {
    if (!existsSync(treeSearchPath)) return;
    expect(() =>
      execFileSync(process.execPath, [treeSearchPath, '--help'], {
        cwd: skillRoot,
        stdio: 'pipe',
        timeout: 15_000,
      }),
    ).not.toThrow();
  });
});
