import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openHistoryGitStore } from '../src/history-git.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'awareness-history-git-'));
  roots.push(root);
  return root;
}

describe('private history Git object store', () => {
  it('stores raw blobs and recursive trees without reading or changing workspace Git', async () => {
    const root = await tempRoot();
    const userGit = join(root, 'workspace', '.git');
    await mkdir(userGit, { recursive: true });
    await writeFile(join(userGit, 'HEAD'), 'user-head\n');
    await writeFile(join(root, 'sentinel'), 'outside');
    const oldPath = process.env.PATH;
    process.env.PATH = '';
    let store!: Awaited<ReturnType<typeof openHistoryGitStore>>;
    let blob!: Awaited<ReturnType<Awaited<ReturnType<typeof openHistoryGitStore>>['writeBlob']>>;
    try {
      store = await openHistoryGitStore({ historyRoot: join(root, 'history'), storeId: 'awareness-v1', workspaceId: 'a'.repeat(64) });
      blob = await store.writeBlob(Buffer.from('hello\0world'));
    } finally {
      process.env.PATH = oldPath;
    }
    expect(Buffer.from(await store.readBlob(blob.oid))).toEqual(Buffer.from('hello\0world'));
    const tree = await store.writeTree([
      { path: 'src/a.txt', oid: blob.oid, mode: '100644' },
      { path: 'tool.sh', oid: blob.oid, mode: '100755' },
    ]);
    expect(await store.readTree(tree)).toEqual([
      { path: 'src/a.txt', oid: blob.oid, mode: '100644' },
      { path: 'tool.sh', oid: blob.oid, mode: '100755' },
    ]);
    expect(store.gitdir.startsWith(join(root, 'history'))).toBe(true);
    expect(await readFile(join(userGit, 'HEAD'), 'utf8')).toBe('user-head\n');
    expect((await stat(store.rootDir)).mode & 0o777).toBe(0o700);
    expect((await stat(join(store.rootDir, 'history-store.json'))).mode & 0o777).toBe(0o600);
    expect((await stat(join(store.gitdir, 'objects', blob.oid.slice(0, 2), blob.oid.slice(2)))).mode & 0o777).toBe(0o600);
  });

  it('publishes only immutable operation refs', async () => {
    const store = await openHistoryGitStore({ historyRoot: await tempRoot(), storeId: 'v1', workspaceId: 'b'.repeat(64) });
    const blob = await store.writeBlob(Buffer.from('v1'));
    expect(await store.verifyObject(blob.oid, 'blob')).toBe(true);
    expect(await store.verifyObject('0'.repeat(40), 'blob')).toBe(false);
    const tree = await store.writeTree([{ path: 'a', oid: blob.oid, mode: '100644' }]);
    const commit = await store.writeCommit({ tree, message: 'before', timestampMs: 1_700_000_000_000 });
    const ref = `refs/octocode/${'c'.repeat(64)}/before`;
    await store.publishRef(ref, commit);
    expect(await store.resolveRef(ref)).toBe(commit);
    expect(await store.verifyObject(tree, 'tree')).toBe(true);
    expect(await store.verifyObject(commit, 'commit')).toBe(true);
    expect(await store.verifyObject(blob.oid, 'tree')).toBe(false);
    expect(await store.verifyObject(tree, 'commit')).toBe(false);
    await expect(store.publishRef(ref, commit)).rejects.toThrow(/already exists/i);
    await expect(store.publishRef('refs/heads/main', commit)).rejects.toThrow(/invalid history ref/i);
  });

  it('reports a corrupt retained object as unavailable', async () => {
    const store = await openHistoryGitStore({ historyRoot: await tempRoot(), storeId: 'awareness-v1', workspaceId: '9'.repeat(64) });
    const blob = await store.writeBlob(Buffer.from('retained bytes'));
    const objectPath = join(store.gitdir, 'objects', blob.oid.slice(0, 2), blob.oid.slice(2));
    await writeFile(objectPath, Buffer.from('corrupt'));
    expect(await store.verifyObject(blob.oid)).toBe(false);
    await expect(store.readBlob(blob.oid)).rejects.toThrow();
  });

  it('rejects path traversal in identities and tree entries', async () => {
    const root = await tempRoot();
    await expect(openHistoryGitStore({ historyRoot: root, storeId: '../escape', workspaceId: 'a'.repeat(64) })).rejects.toThrow(/invalid store/i);
    const store = await openHistoryGitStore({ historyRoot: root, storeId: 'v1', workspaceId: 'a'.repeat(64) });
    const blob = await store.writeBlob(Buffer.from('x'));
    await expect(store.writeTree([{ path: '../x', oid: blob.oid, mode: '100644' }])).rejects.toThrow(/invalid history path/i);
  });

  it('rejects symlinked store roots and identity directories', async () => {
    const root = await tempRoot();
    const target = join(root, 'target');
    await mkdir(target);
    const linkedRoot = join(root, 'linked');
    await symlink(target, linkedRoot);
    await expect(openHistoryGitStore({ historyRoot: linkedRoot, storeId: 'awareness-v1', workspaceId: 'a'.repeat(64) })).rejects.toThrow(/symlink/i);
    const historyRoot = join(root, 'history');
    await mkdir(historyRoot);
    await symlink(target, join(historyRoot, 'awareness-v1'));
    await expect(openHistoryGitStore({ historyRoot, storeId: 'awareness-v1', workspaceId: 'a'.repeat(64) })).rejects.toThrow(/symlink/i);
  });

  it('opens one fresh store concurrently without a partial marker race', async () => {
    const historyRoot = await tempRoot();
    const options = { historyRoot, storeId: 'awareness-v1', workspaceId: 'e'.repeat(64) };
    const stores = await Promise.all(Array.from({ length: 8 }, () => openHistoryGitStore(options)));
    expect(new Set(stores.map(store => store.gitdir))).toHaveLength(1);
    const marker = JSON.parse(await readFile(join(stores[0]!.rootDir, 'history-store.json'), 'utf8')) as Record<string, unknown>;
    expect(marker).toEqual({ formatVersion: 1, storeId: 'awareness-v1', workspaceId: 'e'.repeat(64), objectFormat: 'sha1' });
  });

  it('rejects symlinked git metadata and object/ref ancestors before writes', async () => {
    const historyRoot = await tempRoot();
    const workspaceId = 'f'.repeat(64);
    const workspaceRoot = join(historyRoot, 'awareness-v1', workspaceId);
    const target = join(historyRoot, 'target');
    await mkdir(workspaceRoot, { recursive: true });
    await mkdir(target);
    await symlink(target, join(workspaceRoot, 'repo.git'));
    await expect(openHistoryGitStore({ historyRoot, storeId: 'awareness-v1', workspaceId })).rejects.toThrow(/symlink/i);
    await rm(join(workspaceRoot, 'repo.git'));
    const store = await openHistoryGitStore({ historyRoot, storeId: 'awareness-v1', workspaceId });
    await symlink(target, join(store.gitdir, 'objects', 'aa'));
    await expect(store.writeBlob(Buffer.from('blocked'))).rejects.toThrow(/symlink/i);
    await rm(join(store.gitdir, 'objects', 'aa'));
    const blob = await store.writeBlob(Buffer.from('safe'));
    const tree = await store.writeTree([{ path: 'a', oid: blob.oid, mode: '100644' }]);
    const commit = await store.writeCommit({ tree, message: 'safe' });
    await mkdir(join(store.gitdir, 'refs'), { recursive: true });
    await symlink(target, join(store.gitdir, 'refs', 'octocode'));
    await expect(store.publishRef(`refs/octocode/${'4'.repeat(64)}/before`, commit)).rejects.toThrow(/symlink/i);
  });

  it('allows parallel distinct refs and atomically rejects a same-ref collision', async () => {
    const store = await openHistoryGitStore({ historyRoot: await tempRoot(), storeId: 'awareness-v1', workspaceId: 'd'.repeat(64) });
    const [one, two] = await Promise.all([store.writeBlob(Buffer.from('one')), store.writeBlob(Buffer.from('two'))]);
    const [treeOne, treeTwo] = await Promise.all([
      store.writeTree([{ path: 'a', oid: one.oid, mode: '100644' }]),
      store.writeTree([{ path: 'a', oid: two.oid, mode: '100644' }]),
    ]);
    const [commitOne, commitTwo] = await Promise.all([
      store.writeCommit({ tree: treeOne, message: 'one' }), store.writeCommit({ tree: treeTwo, message: 'two' }),
    ]);
    const distinct = [`refs/octocode/${'1'.repeat(64)}/before`, `refs/octocode/${'2'.repeat(64)}/before`];
    await Promise.all([store.publishRef(distinct[0]!, commitOne), store.publishRef(distinct[1]!, commitTwo)]);
    const collision = `refs/octocode/${'3'.repeat(64)}/after`;
    const outcomes = await Promise.allSettled([store.publishRef(collision, commitOne), store.publishRef(collision, commitTwo)]);
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(outcome => outcome.status === 'rejected')).toHaveLength(1);
    expect([commitOne, commitTwo]).toContain(await store.resolveRef(collision));
  });
});
