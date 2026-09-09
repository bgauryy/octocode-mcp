import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import type { CheckpointInfo } from '../src/tools/checkpoints.js';
import {
  buildCheckpointItems,
  formatDiffStat,
  registerRewindCommand,
} from '../src/tools/rewind-command.js';

const CP1: CheckpointInfo = {
  id: 'a1b2c3d4e5f60718',
  label: 'before: fix bug',
  ts: 1_700_000_000_000,
  filesChanged: 2,
};
const CP2: CheckpointInfo = {
  id: 'ffee00112233aabb',
  label: '',
  ts: 1_700_000_100_000,
  filesChanged: 0,
};

// ─── Pure helpers ────────────────────────────────────────────────────────────

test('buildCheckpointItems carries operation id and file count', () => {
  const items = buildCheckpointItems([CP1, CP2]);
  assert.equal(items[0]!.value, CP1.id);
  assert.match(items[0]!.description!, /2 files · a1b2c3d4/);
  assert.match(items[1]!.label, /\(no label\)/);
});

test('rewind follows an empty continuation page and never applies a declined preview', async () => {
  let handler: ((args: string, ctx: any) => Promise<void>) | undefined;
  const nextCall = { command: 'history timeline', params: { limit: 1 } };
  const list = vi
    .fn()
    .mockResolvedValueOnce({ checkpoints: [], nextCall })
    .mockResolvedValueOnce({ checkpoints: [CP2] });
  const restoreFiles = vi.fn();
  const diffStat = vi.fn(async () => [{ status: 'M', path: 'a.txt' }]);
  const notify = vi.fn();
  const select = vi
    .fn()
    .mockResolvedValueOnce('Load more…')
    .mockImplementationOnce(async (_title, items) => items[0]);
  const confirm = vi.fn(async () => false);
  registerRewindCommand(
    {
      registerCommand: (_name: string, command: any) => {
        handler = command.handler;
      },
    } as any,
    {
      getEngine: async () => ({
        listCheckpoints: list,
        diffStat,
        restoreFiles,
      }),
    }
  );
  await handler?.('', { hasUI: true, ui: { select, confirm, notify } });
  assert.deepEqual(list.mock.calls, [[30], [30, nextCall]]);
  assert.deepEqual(diffStat.mock.calls, [[CP2.id]]);
  assert.deepEqual(confirm.mock.calls, [['Apply this restore?', 'M a.txt']]);
  assert.equal(restoreFiles.mock.calls.length, 0);
});

test('restore preview formats changed paths and empty differences', () => {
  assert.match(formatDiffStat([{ status: 'M', path: 'a.txt' }]), /^M a\.txt$/);
  assert.match(formatDiffStat([]), /No differences/);
});

test('rewind reports the restore receipt as pending verification', async () => {
  let handler: ((args: string, ctx: any) => Promise<void>) | undefined;
  const notices: string[] = [];
  registerRewindCommand(
    {
      registerCommand: (_name: string, command: any) => {
        handler = command.handler;
      },
    } as any,
    {
      getEngine: async () => ({
        listCheckpoints: async () => ({ checkpoints: [CP1] }),
        diffStat: async () => [{ status: 'M', path: 'a.txt' }],
        restoreFiles: async () => ({ verificationRunId: 'verify-run-7' }),
      }),
    }
  );
  await handler?.('', {
    hasUI: true,
    ui: {
      select: async (_title: string, items: string[]) => items[0],
      confirm: async () => true,
      notify: (message: string) => notices.push(message),
    },
  });
  assert.match(notices[0]!, /Verification pending: verify-run-7/);
});
