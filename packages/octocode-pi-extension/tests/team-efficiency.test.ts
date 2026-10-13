import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Inbox } from '../src/team/inbox.js';
import { Mail, MESSAGE_TYPE } from '../src/team/mail.js';
import type { Member } from '../src/team/model.js';
import { Team } from '../src/team/session.js';
import { INBOX_BATCH_SIZE, TeamStore } from '../src/team/store.js';
import { TeamTicker, type TeamView } from '../src/team/ticker.js';
import { fakeCtx, fakePi } from './fake-pi.js';
import { tmp } from './helpers.js';

const member = (id: string): Member => ({
  id, role: 'reviewer', pid: process.pid, status: 'working', joinedAt: Date.now(), updatedAt: Date.now(),
  toolCalls: 0, input: 0, cacheRead: 0, output: 0, cost: 0, unpriced: false,
});

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('team delivery efficiency', () => {
  it('batches every dead-letter notice and retries its database acknowledgement without sending it twice', () => {
    const store = TeamStore.open(tmp(), path.join(tmp(), 'team.sqlite'));
    const { pi, sent } = fakePi();
    const mail = new Mail(pi);
    try {
      store.save(member('recipient'));
      const ids = Array.from({ length: INBOX_BATCH_SIZE + 3 }, (_, i) =>
        store.send('sender', ['recipient'], `request ${i}`, { replyRequired: true }).id!);
      store.remove('recipient');
      const mark = vi.spyOn(store, 'markNotified').mockImplementationOnce(() => { throw new Error('busy'); });
      expect(() => mail.reportDeadLetters(store, 'sender')).toThrow('busy');
      expect(sent).toHaveLength(1);
      mail.reportDeadLetters(store, 'sender');
      mail.reportDeadLetters(store, 'sender');
      expect(sent).toHaveLength(2);
      expect(mark).toHaveBeenCalledTimes(3);
      expect(store.deadLetters('sender')).toEqual([]);
      const notices = sent.map((entry) => String(entry.message.content)).join('\n');
      for (const id of ids) expect(notices.split(`Message #${id} to `)).toHaveLength(2);
      for (const entry of sent) expect(entry.options).toEqual({ triggerTurn: false, deliverAs: 'steer' });
    } finally { store.close(); }
  });

  it('keeps all dead letters pending when Pi refuses the notice batch', () => {
    const store = TeamStore.open(tmp(), path.join(tmp(), 'team.sqlite'));
    const { pi, sent } = fakePi();
    const mail = new Mail(pi);
    try {
      store.save(member('recipient'));
      store.send('sender', ['recipient'], 'request', { replyRequired: true });
      store.remove('recipient');
      vi.spyOn(pi, 'sendMessage').mockImplementationOnce(() => { throw new Error('not ready'); });
      mail.reportDeadLetters(store, 'sender');
      expect(store.deadLetters('sender')).toHaveLength(1);
      mail.reportDeadLetters(store, 'sender');
      expect(sent).toHaveLength(1);
      expect(store.deadLetters('sender')).toEqual([]);
    } finally { store.close(); }
  });

  it('forgets notice acknowledgements at a session reset without acknowledging colliding IDs in a new database', () => {
    const oldStore = TeamStore.open(tmp(), path.join(tmp(), 'old.sqlite'));
    const newStore = TeamStore.open(tmp(), path.join(tmp(), 'new.sqlite'));
    const { pi, sent } = fakePi();
    const mail = new Mail(pi);
    try {
      for (const store of [oldStore, newStore]) {
        store.save(member('recipient'));
        store.send('sender', ['recipient'], store === oldStore ? 'old session' : 'new session', { replyRequired: true });
        store.remove('recipient');
      }
      vi.spyOn(oldStore, 'markNotified').mockImplementationOnce(() => { throw new Error('busy'); });
      expect(() => mail.reportDeadLetters(oldStore, 'sender')).toThrow('busy');
      mail.reset();
      mail.reportDeadLetters(newStore, 'sender');
      expect(sent).toHaveLength(2);
      expect(sent[1]!.message.content).toContain('new session');
      expect(newStore.deadLetters('sender')).toEqual([]);
      expect(oldStore.deadLetters('sender')).toHaveLength(1);
    } finally { oldStore.close(); newStore.close(); }
  });

  it('does not rescan historical context or touch the database once handed mail is acknowledged', () => {
    vi.useFakeTimers();
    const cwd = tmp();
    const env = { OCTOCODE_AGENT_DB: path.join(tmp(), 'team.sqlite') };
    const { pi, sent } = fakePi();
    const team = new Team(pi, env);
    team.start(fakeCtx({ cwd }));
    const recipient = team.join().id;
    const store = TeamStore.open(cwd, env.OCTOCODE_AGENT_DB);
    try {
      store.send('sender', [recipient], 'read me', { replyRequired: false });
      vi.advanceTimersByTime(1_000);
      const context = sent.map(({ message }) => ({ role: 'custom', customType: MESSAGE_TYPE, details: message.details }));
      team.onContext(context);
      expect(store.pending(recipient)).toEqual([]);
      const scan = vi.spyOn(context, 'flatMap');
      const quick = vi.spyOn(TeamStore.prototype, 'quick');
      for (let i = 0; i < 100; i++) team.onContext(context);
      expect(scan).not.toHaveBeenCalled();
      expect(quick).not.toHaveBeenCalled();
      store.send('sender', [recipient], 'new mail', { replyRequired: false });
      vi.advanceTimersByTime(1_000);
      team.onContext(sent.map(({ message }) => ({ role: 'custom', customType: MESSAGE_TYPE, details: message.details })));
      expect(store.pending(recipient)).toEqual([]);
    } finally { team.stop(); store.close(); }
  });

  it('tolerates a recipient departing between its waiting count and batch read', () => {
    const store = TeamStore.open(tmp(), path.join(tmp(), 'team.sqlite'));
    try {
      store.save(member('recipient'));
      store.send('sender', ['recipient'], 'request', { replyRequired: false });
      const pending = store.pending.bind(store);
      vi.spyOn(store, 'pending').mockImplementation((id, after) => { store.remove(id); return pending(id, after); });
      const send = vi.fn(() => true);
      expect(() => new Inbox().deliver(store, 'recipient', send)).not.toThrow();
      expect(send).not.toHaveBeenCalled();
      expect(store.deadLetters('sender')).toHaveLength(1);
    } finally { store.close(); }
  });
});

describe('team view cache', () => {
  it('retries a transient failed snapshot even when the database stamp is unchanged', () => {
    vi.useFakeTimers();
    const file = path.join(tmp(), 'team.sqlite');
    fs.writeFileSync(file, 'unchanged');
    const read = vi.fn<() => TeamView>()
      .mockReturnValueOnce({ members: [], traffic: [], error: 'busy', retrying: true })
      .mockReturnValue({ members: [], traffic: [] });
    const ticker = new TeamTicker({ joined: () => false, beat: () => {}, dbFile: () => file, read, maxAgeMs: 5_000, resumed: () => {} });
    const stop = ticker.watch(() => {});
    try {
      expect(ticker.view.retrying).toBe(true);
      vi.advanceTimersByTime(1_000);
      expect(read).toHaveBeenCalledTimes(2);
      expect(ticker.view.error).toBeUndefined();
      vi.advanceTimersByTime(20_000);
      expect(read).toHaveBeenCalledTimes(2);
    } finally { stop(); }
  });

  it('expires recent traffic even when no members or database writes remain', () => {
    vi.useFakeTimers();
    const file = path.join(tmp(), 'team.sqlite');
    fs.writeFileSync(file, 'unchanged');
    const read = vi.fn<() => TeamView>()
      .mockReturnValueOnce({ members: [], traffic: [{ id: 1, from: 'sender', to: ['recipient'], text: 'old', at: 1, state: 'delivered' }] })
      .mockReturnValue({ members: [], traffic: [] });
    const ticker = new TeamTicker({ joined: () => false, beat: () => {}, dbFile: () => file, read, maxAgeMs: 5_000, resumed: () => {} });
    const stop = ticker.watch(() => {});
    try {
      vi.advanceTimersByTime(4_000);
      expect(read).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1_000);
      expect(read).toHaveBeenCalledTimes(2);
      expect(ticker.view.traffic).toEqual([]);
    } finally { stop(); }
  });
});
