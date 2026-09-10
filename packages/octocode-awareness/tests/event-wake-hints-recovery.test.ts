import { EventEmitter } from 'node:events';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { watchAwarenessEventHints } from '../src/event-wake-hints.js';

const watched = vi.hoisted(() => ({ watch: vi.fn() }));
vi.mock('node:fs', async importOriginal => ({ ...await importOriginal<typeof import('node:fs')>(), watch: watched.watch }));

class WatchHandle extends EventEmitter {
  readonly close = vi.fn();
  constructor(readonly change: (event: string, filename: string | null) => void) { super(); }
}
let root: string;
let database: string;
let db: DatabaseSync;
let owner: ReturnType<typeof watchAwarenessEventHints> | undefined;
let handles: Map<string, WatchHandle[]>;
beforeEach(() => {
  vi.useFakeTimers();
  root = realpathSync(mkdtempSync(join(tmpdir(), 'awareness-wake-recovery-')));
  database = join(root, 'selected.sqlite3');
  db = new DatabaseSync(database);
  db.exec('CREATE TABLE event_outbox(sequence INTEGER PRIMARY KEY)');
  handles = new Map();
  watched.watch.mockReset().mockImplementation((file: string, _options: unknown, change: WatchHandle['change']) => {
    const handle = new WatchHandle(change);
    handles.set(file, [...(handles.get(file) ?? []), handle]);
    return handle;
  });
});
afterEach(() => { owner?.close(); owner = undefined; db.close(); vi.useRealTimers(); vi.restoreAllMocks(); rmSync(root, { recursive: true, force: true }); });
const latest = (file: string) => handles.get(file)!.at(-1)!;

it('keeps in-memory sessions free of watchers and makes their disposal harmless', async () => {
  const onHint = vi.fn();
  owner = watchAwarenessEventHints({ database: ':memory:', onHint });
  owner.close(); owner.close();
  await vi.runAllTimersAsync();
  expect(watched.watch).not.toHaveBeenCalled();
  expect(onHint).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('cancels the initial check and ignores queued notifications and errors after disposal', async () => {
  db.exec('INSERT INTO event_outbox VALUES (1)');
  const onHint = vi.fn();
  const onError = vi.fn();
  owner = watchAwarenessEventHints({ database, onHint, onError });
  const directory = latest(dirname(database));
  const file = latest(database);
  owner.close();
  directory.change('change', null);
  file.emit('error', new Error('late watcher failure'));
  await vi.runAllTimersAsync();
  expect(onHint).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
  expect(directory.close).toHaveBeenCalledOnce();
  expect(latest(`${database}-wal`).close).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it('reattaches a failed directory watcher even when the diagnostic callback throws', async () => {
  const onHint = vi.fn();
  const onError = vi.fn(() => { throw new Error('stale UI'); });
  owner = watchAwarenessEventHints({ database, onHint, onError });
  await vi.advanceTimersByTimeAsync(50);
  const directory = latest(dirname(database));
  expect(() => directory.emit('error', new Error('directory watch failed'))).not.toThrow();
  expect(directory.close).toHaveBeenCalledOnce();
  db.exec('INSERT INTO event_outbox VALUES (1)');
  await vi.advanceTimersByTimeAsync(100);
  expect(handles.get(dirname(database))).toHaveLength(2);
  expect(onError).toHaveBeenCalledOnce();
  expect(onHint).toHaveBeenCalledOnce();
  // Unrelated directory traffic must not query or deliver this selected database.
  latest(dirname(database)).change('change', 'other.sqlite3');
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['rename', 'error'])('reattaches the WAL after %s and coalesces directory hints', async kind => {
  const onHint = vi.fn();
  const onError = vi.fn();
  owner = watchAwarenessEventHints({ database, onHint, onError });
  await vi.advanceTimersByTimeAsync(50);
  const wal = latest(`${database}-wal`);
  if (kind === 'rename') wal.change('rename', null);
  else wal.emit('error', new Error('old WAL handle invalidated'));
  expect(wal.close).toHaveBeenCalledOnce();
  const directory = latest(dirname(database));
  directory.change('rename', 'selected.sqlite3-wal');
  directory.change('change', null);
  expect(vi.getTimerCount()).toBe(1);
  db.exec('INSERT INTO event_outbox VALUES (1)');
  await vi.runAllTimersAsync();
  expect(handles.get(`${database}-wal`)).toHaveLength(2);
  expect(onHint).toHaveBeenCalledOnce();
  expect(onError).toHaveBeenCalledTimes(kind === 'error' ? 1 : 0);
  db.exec('INSERT INTO event_outbox VALUES (2)');
  latest(`${database}-wal`).change('change', null);
  await vi.advanceTimersByTimeAsync(50);
  expect(onHint).toHaveBeenCalledTimes(2);
});

it('retries a file-watch permission failure and then resumes authoritative checks', async () => {
  const attach = watched.watch.getMockImplementation()!;
  let denied = true;
  watched.watch.mockImplementation((file: string, options: unknown, change: WatchHandle['change']) => {
    if (file === database && denied) {
      denied = false;
      throw Object.assign(new Error('watch permission unavailable'), { code: 'EACCES' });
    }
    return attach(file, options, change);
  });
  const onHint = vi.fn();
  const onError = vi.fn();
  owner = watchAwarenessEventHints({ database, onHint, onError });
  db.exec('INSERT INTO event_outbox VALUES (1)');
  await vi.runAllTimersAsync();
  expect(onError).toHaveBeenCalledOnce();
  expect(onHint).toHaveBeenCalledOnce();
  expect(handles.get(database)).toHaveLength(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('recovers from a temporarily unreadable outbox without treating failure as an empty queue', async () => {
  db.exec('DROP TABLE event_outbox');
  const onHint = vi.fn();
  const onError = vi.fn();
  owner = watchAwarenessEventHints({ database, onHint, onError });
  await vi.advanceTimersByTimeAsync(50);
  expect(onError).toHaveBeenCalledOnce();
  expect(onHint).not.toHaveBeenCalled();
  db.exec('CREATE TABLE event_outbox(sequence INTEGER PRIMARY KEY); INSERT INTO event_outbox VALUES (1)');
  await vi.advanceTimersByTimeAsync(100);
  expect(onHint).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it('retries a rejected hint without advancing its observed sequence or losing the pending notification', async () => {
  db.exec('INSERT INTO event_outbox VALUES (1)');
  const onHint = vi.fn().mockImplementationOnce(() => { throw new Error('scheduler temporarily unavailable'); }).mockImplementation(() => undefined);
  const onError = vi.fn();
  owner = watchAwarenessEventHints({ database, onHint, onError });
  await vi.advanceTimersByTimeAsync(50);
  expect(onHint).toHaveBeenCalledOnce();
  expect(onError).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(100);
  expect(onHint).toHaveBeenCalledTimes(2);
  latest(database).change('change', null);
  await vi.advanceTimersByTimeAsync(50);
  expect(onHint).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});
