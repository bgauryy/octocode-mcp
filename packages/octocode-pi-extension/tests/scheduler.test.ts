import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { createOctocodeCronScheduler } from '../src/scheduler.js';
import type { executeAwarenessCommand } from '@octocodeai/octocode-awareness';

test('status maintenance is off by default', () => {
  const scheduler = createOctocodeCronScheduler({ env: {} });
  scheduler.start({ cwd: '/workspace' });
  assert.equal(scheduler.list()[0]?.enabled, false);
  assert.equal(scheduler.list()[0]?.status, 'cancelled');
  scheduler.stop();
});

test('manual checks use the package API with trusted workspace bindings', async () => {
  const run = vi.fn<typeof executeAwarenessCommand>(async () => ({
    payload: { ok: true },
    exitCode: 0,
  }));
  const scheduler = createOctocodeCronScheduler({ env: {}, run });
  const result = await scheduler.runNow(undefined, { cwd: '/repo' });
  assert.equal(result[0]?.status, 'succeeded');
  assert.deepEqual(run.mock.calls[0]?.[0], { command: 'status' });
  assert.equal(run.mock.calls[0]?.[1]?.workspace, '/repo');
});

test('explicit status scheduling can be cancelled and rejects unknown jobs', async () => {
  const scheduler = createOctocodeCronScheduler({
    env: {
      OCTOCODE_CRON: '1',
      OCTOCODE_CRON_STATUS: '1',
      OCTOCODE_CRON_STATUS_INTERVAL_MS: '600000',
    },
    run: async () => ({ payload: { ok: true }, exitCode: 0 }),
  });
  try {
    scheduler.start({ cwd: '/repo' });
    assert.equal((await scheduler.runNow('all'))[0]?.status, 'succeeded');
    assert.equal(scheduler.list()[0]?.status, 'scheduled');
    assert.deepEqual(scheduler.cancel(), ['awareness-status']);
    assert.equal(scheduler.list()[0]?.enabled, false);
    assert.equal(scheduler.list()[0]?.nextRunAt, undefined);
    assert.deepEqual(scheduler.cancel('missing'), []);
    assert.equal((await scheduler.runNow('missing'))[0]?.status, 'failed');
  } finally {
    scheduler.stop();
  }
});
