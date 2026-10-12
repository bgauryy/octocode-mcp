import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Team } from '../src/team/session.js';
import { TeamStore } from '../src/team/store.js';
import { Inbox } from '../src/team/inbox.js';
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
      expect(s.team.join().id).toBeDefined();
    } finally { vi.restoreAllMocks(); s.close(); }
  });
});

describe('team resource bounds', () => {
  it('retries a failed acknowledgement without delivering accepted messages twice', () => {
    const s = setup();
    try {
      s.store.send('peer', [s.id], 'once', { replyRequired: false });
      const inbox = new Inbox();
      const send = vi.fn(() => true);
      const ack = vi.spyOn(s.store, 'ack').mockImplementationOnce(() => { throw new Error('busy'); });
      expect(() => inbox.deliver(s.store, s.id, send)).toThrow('busy');
      inbox.deliver(s.store, s.id, send);
      expect(send).toHaveBeenCalledTimes(1);
      expect(ack).toHaveBeenCalledTimes(2);
      expect(s.store.pending(s.id)).toEqual([]);
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
      expect(send).toHaveBeenCalledTimes(1);
    } finally { s.close(); }
  });

  it('prunes expired messages on heartbeats without requiring a new lock', () => {
    const s = setup();
    try {
      s.store.send('peer', [s.id], 'old', { replyRequired: false });
      s.store.renew(s.id, Date.now() + 25 * 3_600_000);
      expect(s.store.pending(s.id)).toEqual([]);
      expect(s.store.recent()).toEqual([]);
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

  it('bounds completion receipts and forgets them when the session ends', () => {
    const s = setup();
    try {
      for (let i = 0; i < 300; i++) s.team.rememberFinished(`done-${i}`, 'report delivered');
      expect(s.team.send('done-0', 'hello')).not.toHaveProperty('error', expect.stringContaining('has finished'));
      expect(s.team.send('done-299', 'hello')).toHaveProperty('error', expect.stringContaining('has finished'));
      s.team.stop();
      s.team.start(s.ctx);
      s.team.join();
      expect(s.team.send('done-299', 'hello')).not.toHaveProperty('error', expect.stringContaining('has finished'));
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
      expect(s.sent).toHaveLength(100);
      expect(s.sent.map((entry) => /batch \d+/.exec(String(entry.message.content))?.[0])).toEqual(Array.from({ length: 100 }, (_, i) => `batch ${i}`));
    } finally { s.close(); vi.useRealTimers(); }
  });
});
