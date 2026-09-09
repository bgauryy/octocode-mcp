import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { allowLocalFixtureProcesses } from '../../../test-utils/external-effects-guard.js';
import { openHistoryGitStore } from '../src/history-git.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));

const require = createRequire(import.meta.url);
const vitestRoot = dirname(require.resolve('vitest/package.json'));
const defaultConfig = fileURLToPath(new URL('../vitest.config.ts', import.meta.url));

function runChild(configPath: string, env: NodeJS.ProcessEnv): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(vitestRoot, 'vitest.mjs'), 'run', '--config', configPath, '--maxWorkers=1'], {
      env, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`History fixture exceeded 20s: ${output}`)); }, 20_000);
    child.stdout.on('data', chunk => { output += String(chunk); });
    child.stderr.on('data', chunk => { output += String(chunk); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); resolve({ code, output }); });
  });
}

describe('private history Git cross-process publication', () => {
  it('rejects a symlinked ancestor between the boundary and history root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'awareness-history-git-boundary-'));
    roots.push(root);
    const workspace = join(root, 'workspace');
    const linked = join(root, 'linked-workspace');
    await mkdir(workspace);
    await symlink(workspace, linked);
    await expect(openHistoryGitStore({
      historyRoot: join(linked, '.octocode', '.localGit'),
      boundaryRoot: linked,
      storeId: 'v1',
      workspaceId: 'c'.repeat(64),
    })).rejects.toThrow(/symlink/i);
    await expect(access(join(workspace, '.octocode'))).rejects.toThrow();
  });

  it('rechecks the boundary before using an already opened store', async () => {
    const root = await mkdtemp(join(tmpdir(), 'awareness-history-git-swap-'));
    roots.push(root);
    const workspace = join(root, 'workspace');
    const outside = join(root, 'outside');
    await mkdir(workspace);
    await mkdir(outside);
    const store = await openHistoryGitStore({ historyRoot: join(workspace, '.octocode', '.localGit'), boundaryRoot: workspace, storeId: 'v1', workspaceId: 'd'.repeat(64) });
    await rm(join(workspace, '.octocode'), { recursive: true, force: true });
    await symlink(outside, join(workspace, '.octocode'));
    await expect(store.writeBlob(Buffer.from('blocked'))).rejects.toThrow(/symlink/i);
  });

  it('serializes same-ref publication across independent processes', async () => {
    const restoreProcesses = allowLocalFixtureProcesses();
    try {
      const historyRoot = await mkdtemp(join(tmpdir(), 'awareness-history-git-concurrency-'));
      roots.push(historyRoot);
      const options = { historyRoot, storeId: 'v1', workspaceId: 'a'.repeat(64) };
      const store = await openHistoryGitStore(options);
      const blob = await store.writeBlob(Buffer.from('value'));
      const tree = await store.writeTree([{ path: 'a', oid: blob.oid, mode: '100644' }]);
      const first = await store.writeCommit({ tree, message: 'first' });
      const second = await store.writeCommit({ tree, message: 'second' });
      const ref = `refs/octocode/${'b'.repeat(64)}/before`;
      const barrier = join(historyRoot, 'barrier');
      await mkdir(barrier);
      const childPath = join(historyRoot, 'child.test.ts');
      const configPath = join(historyRoot, 'child.config.mjs');
      // Normal checkouts use the package config. An explicit override lets a
      // dependency-resolution audit use real local packages without baking its
      // scratch directory into the shipped test.
      const baseConfig = process.env.OCTOCODE_TEST_VITEST_CONFIG ?? defaultConfig;
      await writeFile(configPath, `import base from ${JSON.stringify(pathToFileURL(baseConfig).href)};
export default { ...base, test: { ...base.test, root: ${JSON.stringify(historyRoot)}, include: ['child.test.ts'], setupFiles: [], coverage: { enabled: false }, testTimeout: 10000 } };`);
      const source = `import { access, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openHistoryGitStore } from ${JSON.stringify(new URL('../src/history-git.ts', import.meta.url).href)};
import { expect, it } from ${JSON.stringify(pathToFileURL(join(vitestRoot, 'dist/index.js')).href)};
it('publishes one ref', async () => {
  const store = await openHistoryGitStore(${JSON.stringify(options)});
  expect(await store.resolveRef(${JSON.stringify(ref)})).toBeNull();
  const marker = join(process.env.OCTO_TEST_BARRIER!, process.env.OCTO_TEST_OID!);
  await writeFile(marker, 'ready');
  const deadline = Date.now() + 5000;
  while (true) {
    try { await access(join(process.env.OCTO_TEST_BARRIER!, ${JSON.stringify(first)})); await access(join(process.env.OCTO_TEST_BARRIER!, ${JSON.stringify(second)})); break; }
    catch { if (Date.now() > deadline) throw new Error('publication rendezvous timed out'); await new Promise(resolve => setTimeout(resolve, 5)); }
  }
  await expect(store.publishRef(${JSON.stringify(ref)}, process.env.OCTO_TEST_OID!)).resolves.toBeUndefined();
});
`;
      await writeFile(childPath, source);
      try {
        const env = { ...process.env };
        const [one, two] = await Promise.all([
          runChild(configPath, { ...env, OCTO_TEST_OID: first, OCTO_TEST_BARRIER: barrier }),
          runChild(configPath, { ...env, OCTO_TEST_OID: second, OCTO_TEST_BARRIER: barrier }),
        ]);
        expect([one.code, two.code].sort(), `${one.output}\n${two.output}`).toEqual([0, 1]);
        expect((one.code === 1 ? one : two).output).toContain('history ref already exists');
      } finally {
        await rm(childPath, { force: true });
      }
      const published = await store.resolveRef(ref);
      expect([first, second]).toContain(published);
      expect(await store.readCommit(published!)).toMatchObject({ oid: published, tree });
      expect((await readdir(store.gitdir)).filter(name => name.startsWith('.octocode-ref-'))).toEqual([]);
    } finally {
      restoreProcesses();
    }
  });

  it('does not treat an interrupted publication temporary file as a lease', async () => {
    const root = await mkdtemp(join(tmpdir(), 'awareness-history-git-residue-'));
    roots.push(root);
    const options = { historyRoot: root, storeId: 'v1', workspaceId: 'e'.repeat(64) };
    const store = await openHistoryGitStore(options);
    // A killed writer can leave this unpublished residue; it grants no lock.
    const residue = join(store.gitdir, '.octocode-ref-interrupted.tmp');
    await writeFile(residue, 'incomplete');
    const reopened = await openHistoryGitStore(options);
    const blob = await reopened.writeBlob(Buffer.from('retained'));
    const tree = await reopened.writeTree([{ path: 'a', oid: blob.oid, mode: '100644' }]);
    const commit = await reopened.writeCommit({ tree, message: 'next writer' });
    const ref = `refs/octocode/${'f'.repeat(64)}/before`;
    await reopened.publishRef(ref, commit);
    expect(await reopened.resolveRef(ref)).toBe(commit);
    expect(await readFile(residue, 'utf8')).toBe('incomplete');
  });

});
