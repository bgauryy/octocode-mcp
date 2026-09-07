import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'vitest';
// @ts-expect-error The private build-script test seam is not a package API.
import { __test__ as lock } from '../scripts/build.mjs';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function tempLock(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'octocode-build-lock-'));
  roots.push(root);
  return path.join(root, 'build.lock');
}

test('build lock immediately reclaims a dead recorded owner', async () => {
  const lockPath = tempLock();
  fs.writeFileSync(lockPath, JSON.stringify({ pid: 2_147_483_647, token: 'dead-owner' }));

  const acquired = await lock.acquireBuildLock(lockPath, { waitMs: 500 });
  const owner = lock.readBuildLockOwner(lockPath);
  assert.equal(owner?.pid, process.pid);
  assert.notEqual(owner?.token, 'dead-owner');

  lock.releaseBuildLock(acquired, lockPath);
  assert.equal(fs.existsSync(lockPath), false);
});

test('build lock protects a live owner and gives malformed locks an orphan grace period', () => {
  const livePath = tempLock();
  fs.writeFileSync(livePath, JSON.stringify({ pid: process.pid, token: 'live-owner' }));
  assert.equal(lock.buildLockCanBeReclaimed(livePath, 0), false);

  const malformedPath = tempLock();
  fs.writeFileSync(malformedPath, '');
  assert.equal(lock.buildLockCanBeReclaimed(malformedPath, 60_000), false);
  const old = new Date(Date.now() - 120_000);
  fs.utimesSync(malformedPath, old, old);
  assert.equal(lock.buildLockCanBeReclaimed(malformedPath, 60_000), true);
});

test('build lock release cannot delete a replacement owner', async () => {
  const lockPath = tempLock();
  const acquired = await lock.acquireBuildLock(lockPath, { waitMs: 500 });
  fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, token: 'replacement-owner' }));

  lock.releaseBuildLock(acquired, lockPath);
  assert.equal(lock.readBuildLockOwner(lockPath)?.token, 'replacement-owner');
});
