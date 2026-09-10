import { expect, test, vi } from 'vitest';
import { createCatalogRefreshQueue } from '../src/tools/mcp/catalog-refresh.js';

test('coalesces invalidations and discards queued work from a replaced session', async () => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const work: Promise<void>[] = [];
  const refresh = vi.fn(async () => undefined);
  const queue = createCatalogRefreshQueue({ pending: () => pending, refresh, onError: error => { throw error; }, track: promise => { work.push(promise); } });
  queue.schedule('workspace', { cwd: '/old-session' });
  queue.schedule('workspace', { cwd: '/duplicate' });
  expect(work).toHaveLength(1);
  queue.clear();
  queue.schedule('workspace', { cwd: '/new-session' });
  release();
  await Promise.all(work);
  expect(refresh.mock.calls).toEqual([[{ cwd: '/new-session' }]]);
});

test('a failed pending discovery still permits one replacement refresh', async () => {
  const work: Promise<void>[] = [];
  const refresh = vi.fn(async () => undefined);
  const queue = createCatalogRefreshQueue({ pending: () => Promise.reject(new Error('old discovery failed')), refresh, onError: vi.fn(), track: promise => { work.push(promise); } });
  queue.schedule('workspace');
  await Promise.all(work);
  expect(refresh).toHaveBeenCalledTimes(1);
});
