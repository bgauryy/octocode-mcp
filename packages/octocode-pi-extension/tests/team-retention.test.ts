import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Team } from '../src/team/session.js';
import { TeamStore } from '../src/team/store.js';
import { Inbox } from '../src/team/inbox.js';
import type { Member } from '../src/team/model.js';
import { TeamTicker } from '../src/team/ticker.js';
import { fakeCtx, fakePi } from './fake-pi.js';
import { tmp } from './helpers.js';

function setup() {
  const cwd = tmp();
  const env = { OCTOCODE_AGENT_DB: path.join(tmp(), 'team.sqlite') };
  const { pi, sent } = fakePi();
  const ctx = fakeCtx({ cwd });
  const team = new Team(pi, env);
  team.start(ctx);
  const id = team.join().id;
  const store = TeamStore.open(cwd, env.OCTOCODE_AGENT_DB);
  return { team, ctx, id, store, sent, close: () => { team.stop(); store.close(); } };
}

const member = (id: string, updatedAt: number, pid = process.pid): Member => ({
  id, role: id.replace(/-[0-9a-f]{6}$/, ''), pid, status: 'idle', joinedAt: 1_000, updatedAt, toolCalls: 0, input: 0, cacheRead: 0, output: 0, cost: 0, unpriced: false,
});

describe('team after a suspend', () => {
  it('keeps the members and leases that were live when the machine slept; ones already silent still go', () => {
    const store = TeamStore.open(tmp(), path.join(tmp(), 'team.sqlite'));
    try {
      const slept = Date.now();
      store.save(member('main-aaaaaa', slept));
      store.save(member('peer-bbbbbb', slept));
      store.save(member('hung-cccccc', slept - 120_000));
      expect(store.lock('peer-bbbbbb', [{ path: 'a.ts', kind: 'file', reason: 'x' }], slept).ok).toBe(true);
      const woke = slept + 10 * 60_000;
      store.resume(slept, woke);
      expect(store.list(woke).map((m) => m.id)).toEqual(['main-aaaaaa', 'peer-bbbbbb']);
      expect(store.conflict('a.ts', 'main-aaaaaa', 'file', woke)?.owner).toBe('peer-bbbbbb');
      // Without heartbeats after the wake, the usual limits apply again.
      expect(store.list(woke + 61_000)).toEqual([]);
    } finally { store.close(); }
  });

  it('tells its source when a tick comes long after the previous one (the machine slept)', () => {
    vi.useFakeTimers({ now: 1_000_000 });
    try {
      const resumed = vi.fn();
      const ticker = new TeamTicker({ joined: () => true, beat: () => {}, dbFile: () => undefined, read: () => ({ members: [], traffic: [] }), maxAgeMs: 1_000, resumed });
      ticker.sync();
      vi.advanceTimersByTime(3_000);
      expect(resumed).not.toHaveBeenCalled();
      vi.setSystemTime(Date.now() + 10 * 60_000);
      vi.advanceTimersByTime(1_000);
      expect(resumed).toHaveBeenCalledExactlyOnceWith(1_003_000, 1_604_000);
      vi.advanceTimersByTime(1_000);
      expect(resumed).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  it('repairs the team database on the first tick after a wake, before the heartbeat', () => {
    vi.useFakeTimers();
    const s = setup();
    try {
      const resume = vi.spyOn(TeamStore.prototype, 'resume');
      vi.advanceTimersByTime(1_000);
      vi.setSystemTime(Date.now() + 10 * 60_000);
      vi.advanceTimersByTime(1_000);
      expect(resume).toHaveBeenCalledTimes(1);
    } finally { vi.restoreAllMocks(); s.close(); vi.useRealTimers(); }
  });
});

describe('team leave', () => {
  it('clears its state even when the database refuses the removal, and a new session can start', () => {
    const s = setup();
    try {
      expect(s.team.id).toBe(s.id);
      vi.spyOn(TeamStore.prototype, 'remove').mockImplementationOnce(() => { throw new Error('database is locked'); });
      expect(() => s.team.leave()).toThrow('database is locked');
      expect(s.team.id).toBeUndefined();
      // stop() clears the rest of the state despite the same failure...
      s.team.join();
      vi.spyOn(TeamStore.prototype, 'remove').mockImplementationOnce(() => { throw new Error('database is closed'); });
      expect(() => s.team.stop()).toThrow('database is closed');
      expect(s.team.id).toBeUndefined();
      expect(() => s.team.join()).toThrow('before the session starts');
      // ...and start() binds the new session instead of failing on the old one's removal.
      s.team.start(s.ctx);
      s.team.join();
      vi.spyOn(TeamStore.prototype, 'remove').mockImplementationOnce(() => { throw new Error('database is locked'); });
      expect(() => s.team.start(s.ctx)).not.toThrow();
      const joined = s.team.join().id;
      expect(joined).toMatch(/^[a-z]+(-[a-z]+)+(-\d+)?$/);
      expect(s.team.members().map((entry) => entry.id)).toContain(joined);
    } finally { vi.restoreAllMocks(); s.close(); }
  });
});

describe('team resource bounds', () => {
  it('hands a message over once, records it only when seen, and retries a failed record', () => {
    const s = setup();
    try {
      const { id } = s.store.send('peer', [s.id], 'once', { replyRequired: false });
      const inbox = new Inbox();
      const send = vi.fn(() => true);
      inbox.deliver(s.store, s.id, send);
      inbox.deliver(s.store, s.id, send);
      expect(send).toHaveBeenCalledTimes(1);
      // Handed over, not seen: still undelivered, so a departure dead-letters it.
      expect(s.store.pending(s.id).map((message) => message.id)).toEqual([id]);
      const ack = vi.spyOn(s.store, 'ack').mockImplementationOnce(() => { throw new Error('busy'); });
      expect(() => inbox.seen(s.store, s.id, [id!])).toThrow('busy');
      inbox.deliver(s.store, s.id, send);
      expect(send).toHaveBeenCalledTimes(1);
      expect(ack).toHaveBeenCalledTimes(2);
      expect(s.store.pending(s.id)).toEqual([]);
    } finally { s.close(); }
  });

  it('offers a refused batch again on the next tick', () => {
    const s = setup();
    try {
      s.store.send('peer', [s.id], 'first', { replyRequired: false });
      const inbox = new Inbox();
      const send = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
      inbox.deliver(s.store, s.id, send);
      s.store.send('peer', [s.id], 'second', { replyRequired: false });
      inbox.deliver(s.store, s.id, send);
      expect(send.mock.calls.map(([batch]) => batch.map((message: { text: string }) => message.text))).toEqual([['first'], ['first', 'second']]);
    } finally { s.close(); }
  });

  it('reads the inbox only when a message waits for this recipient', () => {
    const s = setup();
    try {
      const inbox = new Inbox();
      const pending = vi.spyOn(s.store, 'pending');
      const send = vi.fn(() => true);
      s.store.send('peer', ['someone-else'], 'not mine', { replyRequired: false });
      inbox.deliver(s.store, s.id, send);
      expect(pending).not.toHaveBeenCalled();
      s.store.send('peer', [s.id], 'mine', { replyRequired: false });
      inbox.deliver(s.store, s.id, send);
      expect(pending).toHaveBeenCalledTimes(1);
      // Handed over and not yet seen: nothing new to read.
      inbox.deliver(s.store, s.id, send);
      expect(pending).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledTimes(1);
    } finally { s.close(); }
  });

  it('prunes only resolved old messages and preserves unread mail, open questions and unreported dead letters', () => {
    const s = setup();
    try {
      const unread = s.store.send('peer', [s.id], 'unread', { replyRequired: false }).id!;
      const question = s.store.send('peer', [s.id], 'question', { replyRequired: true }).id!;
      const complete = s.store.send('peer', [s.id], 'complete', { replyRequired: false }).id!;
      s.store.ack(s.id, [question, complete]);
      s.store.save(member('departing', Date.now()));
      const dead = s.store.send('peer', ['departing'], 'dead', { replyRequired: false }).id!;
      s.store.remove('departing');
      const later = Date.now() + 25 * 3_600_000;
      s.store.renew(s.id, later);
      expect(s.store.pending(s.id).map((message) => message.id)).toEqual([unread]);
      expect(s.store.replyTarget(question)).toBeDefined();
      expect(s.store.replyTarget(complete)).toBeUndefined();
      expect(s.store.deadLetters('peer').map((letter) => letter.id)).toEqual([dead]);
      s.store.markNotified(s.store.deadLetters('peer'), later);
      s.store.renew(s.id, later + 60_000);
      expect(s.store.replyTarget(dead)).toBeUndefined();
      expect(s.store.replyTarget(unread)).toBeDefined();
      expect(s.store.replyTarget(question)).toBeDefined();
    } finally { s.close(); }
  });

  it('bounds inbox reads and retains the ordered remainder', () => {
    const s = setup();
    try {
      for (let i = 0; i < 100; i++) s.store.send('peer', [s.id], String(i), { replyRequired: false });
      const texts: string[] = [];
      while (texts.length < 100) {
        const batch = s.store.pending(s.id);
        expect(batch.length).toBeGreaterThan(0);
        expect(batch.length).toBeLessThan(100);
        texts.push(...batch.map((message) => message.text));
        s.store.ack(s.id, batch.map((message) => message.id));
      }
      expect(texts).toEqual(Array.from({ length: 100 }, (_, i) => String(i)));
    } finally { s.close(); }
  });

  it('bounds completion receipts and forgets them when the session ends', async () => {
    const s = setup();
    try {
      for (let i = 0; i < 300; i++) s.team.rememberFinished(`done-${i}`, 'report delivered');
      expect((await s.team.send('done-0', 'hello'))).not.toHaveProperty('error', expect.stringContaining('has finished'));
      expect((await s.team.send('done-299', 'hello'))).toHaveProperty('error', expect.stringContaining('has finished'));
      s.team.stop();
      s.team.start(s.ctx);
      s.team.join();
      expect((await s.team.send('done-299', 'hello'))).not.toHaveProperty('error', expect.stringContaining('has finished'));
    } finally { s.close(); }
  });

  it('delivers a backlog over multiple ticks without skips or duplicates', () => {
    vi.useFakeTimers();
    const s = setup();
    try {
      for (let i = 0; i < 100; i++) s.store.send('peer', [s.id], `batch ${i}`, { replyRequired: false });
      vi.advanceTimersByTime(1_000);
      expect(s.sent.length).toBeGreaterThan(0);
      expect(s.sent.length).toBeLessThan(100);
      vi.advanceTimersByTime(4_000);
      const texts = s.sent.flatMap((entry) => entry.message.details.messages.map((message: { text: string }) => message.text));
      expect(texts).toEqual(Array.from({ length: 100 }, (_, i) => `batch ${i}`));
    } finally { s.close(); vi.useRealTimers(); }
  });
});
