import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { registerStaleBundleWarning, staleBundleWarning } from '../src/shared/stale-bundle.js';
import { fakeCtx, fakePi } from './fake-pi.js';
import { tmp } from './helpers.js';

const HOUR = 3600;

/** A package root with a built bundle at `bundleAge` seconds old and, when `withSrc`, source files at the given ages. */
function packageAt(options: { withSrc?: boolean; sources?: Record<string, number>; bundleAge?: number; pointer?: boolean } = {}): string {
  const root = tmp('octocode-stale-');
  const now = Date.now() / 1000;
  const touch = (file: string, age: number) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '');
    fs.utimesSync(file, now - age, now - age);
  };
  if (options.pointer !== false) {
    fs.mkdirSync(path.join(root, 'dist', 'pi'), { recursive: true });
    fs.writeFileSync(path.join(root, 'dist', 'pi', 'current'), 'octocode-new.js\n');
    touch(path.join(root, 'dist', 'pi', 'octocode-new.js'), options.bundleAge ?? HOUR);
    // An older bundle kept for a process that read the previous pointer must not decide.
    touch(path.join(root, 'dist', 'pi', 'octocode-old.js'), 100 * HOUR);
  }
  if (options.withSrc ?? true) for (const [name, age] of Object.entries(options.sources ?? {})) touch(path.join(root, 'src', name), age);
  return root;
}

describe('staleBundleWarning', () => {
  it('names the file and the fix when a source file is newer than the current bundle, however deep', () => {
    const root = packageAt({ sources: { 'index.ts': 2 * HOUR, 'deep/er/changed.ts': 60 } });
    const text = staleBundleWarning(root);
    expect(text).toContain('yarn build');
    expect(text).toContain('packages/octocode-pi-extension');
    expect(text).toContain('/reload');
    expect(text).toContain('deep/er/changed.ts');
  });

  it('says nothing when the bundle is newer than every source file', () => {
    expect(staleBundleWarning(packageAt({ sources: { 'index.ts': 2 * HOUR, 'a/b.ts': 3 * HOUR } }))).toBeUndefined();
  });

  it('ignores files that are not TypeScript sources', () => {
    expect(staleBundleWarning(packageAt({ sources: { 'notes.md': 1, 'data.json': 1 } }))).toBeUndefined();
  });

  it('says nothing in an installed package: no src folder beside dist', () => {
    const root = packageAt({ withSrc: false });
    expect(fs.existsSync(path.join(root, 'src'))).toBe(false);
    expect(staleBundleWarning(root)).toBeUndefined();
  });

  it('says nothing when there is no bundle to compare with, and never throws', () => {
    expect(staleBundleWarning(packageAt({ pointer: false, sources: { 'index.ts': 1 } }))).toBeUndefined();
    const root = packageAt({ sources: { 'index.ts': 1 } });
    fs.writeFileSync(path.join(root, 'dist', 'pi', 'current'), 'missing.js');
    expect(staleBundleWarning(root)).toBeUndefined();
    expect(staleBundleWarning(path.join(root, 'does', 'not', 'exist'))).toBeUndefined();
  });
});

describe('registerStaleBundleWarning', () => {
  const start = async (root: string, options: { hasUI?: boolean; isSubagent?: boolean } = {}) => {
    const fake = fakePi();
    registerStaleBundleWarning(fake.pi, { isSubagent: options.isSubagent ?? false, root });
    const ctx = fakeCtx({ cwd: tmp(), hasUI: options.hasUI ?? true });
    const notices = ctx.ui.notes;
    const fire = () => fake.fire('session_start', { type: 'session_start', reason: 'startup' }, ctx);
    return { notices, fire };
  };

  it('warns once at session_start in a stale development checkout, not again on later starts', async () => {
    const { notices, fire } = await start(packageAt({ sources: { 'index.ts': 60 } }));
    await fire();
    await fire();
    expect(notices).toHaveLength(1);
    expect(notices[0]!.type).toBe('warning');
    expect(notices[0]!.message).toContain('yarn build');
  });

  it('stays silent for a current bundle, an installed package, and a run without a person watching', async () => {
    for (const [root, options] of [
      [packageAt({ sources: { 'index.ts': 2 * HOUR } }), {}],
      [packageAt({ withSrc: false }), {}],
      [packageAt({ sources: { 'index.ts': 60 } }), { hasUI: false }],
      [packageAt({ sources: { 'index.ts': 60 } }), { isSubagent: true }],
    ] as const) {
      const { notices, fire } = await start(root, options);
      await fire();
      expect(notices).toEqual([]);
    }
  });

  it('does not let a failing check break session start', async () => {
    const { notices, fire } = await start(path.join(tmp(), 'missing'));
    await expect(fire()).resolves.not.toThrow();
    expect(notices).toEqual([]);
  });
});
