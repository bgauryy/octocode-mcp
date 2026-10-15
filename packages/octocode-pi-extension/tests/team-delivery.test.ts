import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEASE_IDLE_MS } from '../src/team/held.js';
import { MESSAGE_TYPE, parentProcessGone, Team, USER_SENDER } from '../src/team/session.js';
import { registerCollab } from '../src/team/tools.js';
import { leaseAge, resolveTarget, sessionTree, wakes } from '../src/team/routing.js';
import type { Member } from '../src/team/model.js';
import { LEASE_MS, TeamStore } from '../src/team/store.js';
import { trafficRow, widgetLines } from '../src/team/panel.js';
import { fakeCtx, fakePi, theme } from './fake-pi.js';
import { tmp } from './helpers.js';

const row = (id: string, extra: Partial<Member> = {}): Member => ({
  id, role: id.replace(/-[0-9a-f]{6}$/, ''), pid: process.pid, status: 'idle', joinedAt: 1_000, updatedAt: Date.now(), toolCalls: 0, input: 0, cacheRead: 0, output: 0, cost: 0, unpriced: false, ...extra,
});

const repo = () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, '.git'));
  return dir;
};

const stores: TeamStore[] = [];
const open = (cwd: string, file: string) => {
  const store = TeamStore.open(cwd, file, {});
  stores.push(store);
  return store;
};

const teams: Array<{ team: Team; ctx: ReturnType<typeof fakeCtx> }> = [];
function agent(dbFile: string, cwd: string, env: Record<string, string> = {}, hasUI = true, idle = true) {
  const fake = fakePi();
  const team = new Team(fake.pi, { OCTOCODE_AGENT_DB: dbFile, ...env });
  registerCollab(fake.pi, team);
  const ctx = fakeCtx({ cwd, hasUI, idle });
  team.start(ctx);
  teams.push({ team, ctx });
  return { ...fake, team, ctx };
}

afterEach(() => {
  vi.useRealTimers();
  for (const { team } of teams.splice(0)) team.stop();
  for (const store of stores.splice(0)) store.close();
});

describe('message wake rule', () => {
  it('wakes the asker with the answer to its open question, never with a thank-you or a second answer', () => {
    const store = open(repo(), path.join(tmp(), 'team.sqlite'));
    store.save(row('a'));
    store.save(row('b'));
    const question = store.send('a', ['b'], 'which file?', { replyRequired: true }).id!;
    expect(wakes(store.pending('b')[0]!)).toBe(true);
    const answer = store.send('b', ['a'], 'src/x.ts', { replyRequired: false, replyTo: question }).id!;
    expect(store.pending('a').find((message) => message.id === answer)).toMatchObject({ wake: true });
    // A reply to an FYI (the answer asked for nothing) does not wake its recipient.
    const thanks = store.send('a', ['b'], 'thanks', { replyRequired: false, replyTo: answer }).id!;
    expect(store.pending('b').find((message) => message.id === thanks)).toMatchObject({ wake: false });
    // The question is answered: answering it again is an FYI.
    const again = store.send('b', ['a'], 'also y.ts', { replyRequired: false, replyTo: question }).id!;
    expect(store.pending('a').find((message) => message.id === again)).toMatchObject({ wake: false });
    expect(store.replyTarget(question)).toEqual({ from: 'a', replyRequired: true });
    expect(store.replyTarget(999_999)).toBeUndefined();
  });

  it('refuses a replyTo that names no message in the repository', async () => {
    const cwd = repo();
    const db = path.join(tmp(), 'team.sqlite');
    const a = agent(db, cwd);
    const b = agent(db, cwd);
    a.team.join();
    b.team.join();
    expect((await a.team.send(b.team.id!, 'hi', { replyTo: 424242 }))).toEqual({ error: expect.stringContaining('No message #424242') });
  });
});

describe('broadcast scope', () => {
  it('reaches the sender\'s session tree only, never another session in the same repository', () => {
    const members = [
      row('main-aaaaaa'), row('researcher-bbbbbb', { parentId: 'main-aaaaaa' }), row('reviewer-cccccc', { parentId: 'researcher-bbbbbb' }),
      row('main-zzzzzz'), row('general-yyyyyy', { parentId: 'main-zzzzzz' }),
    ];
    expect([...sessionTree(members, 'reviewer-cccccc')].sort()).toEqual(['main-aaaaaa', 'researcher-bbbbbb', 'reviewer-cccccc']);
    const ids = (result: Member[] | string) => (typeof result === 'string' ? result : result.map((member) => member.id).sort());
    expect(ids(resolveTarget(members, 'reviewer-cccccc', 'all'))).toEqual(['main-aaaaaa', 'researcher-bbbbbb']);
    // The user's broadcast is scoped to the session it was typed in.
    expect(ids(resolveTarget(members, USER_SENDER, 'all', undefined, 'main-zzzzzz'))).toEqual(['general-yyyyyy', 'main-zzzzzz']);
    expect(ids(resolveTarget([row('main-aaaaaa'), row('main-zzzzzz')], 'main-aaaaaa', 'all'))).toMatch(/No other agents are in your session tree/);
  });

  it('sends /agents tell all only to this session and its subagents', async () => {
    const cwd = repo();
    const db = path.join(tmp(), 'team.sqlite');
    const main = agent(db, cwd);
    const mine = main.team.join().id;
    const child = agent(db, cwd, { OCTOCODE_AGENT_ID: 'general-111111', OCTOCODE_PARENT_ID: mine });
    const stranger = agent(db, cwd);
    child.team.join();
    stranger.team.join();
    const result = (await main.team.send('all', 'stop and report', { from: USER_SENDER }));
    expect('sent' in result && result.sent.sort()).toEqual(['general-111111', mine].sort());
  });
});

/** The team messages Pi was handed, in order. */
const teamMail = (sent: Array<{ message: any; options: any }>) => sent.filter((entry) => entry.message.customType === MESSAGE_TYPE && Array.isArray(entry.message.details?.messages));
/**
 * Pi is about to call the model with this message in the conversation: it emits `context` with the messages. (An FYI
 * appended while idle, or flushed at the end of a turn, reaches extensions no other way: Pi's append never emits
 * message_start to them.)
 */
const seen = (who: ReturnType<typeof agent>, entry: { message: any }) =>
  who.emit('context', { messages: [{ role: 'user', content: 'task' }, { role: 'custom', customType: MESSAGE_TYPE, content: entry.message.content, details: entry.message.details }] }, who.ctx);

describe('delivery acknowledgement', () => {
  it('records a message delivered only once the model sees it', async () => {
    const cwd = repo();
    const db = path.join(tmp(), 'team.sqlite');
    const a = agent(db, cwd);
    const b = agent(db, cwd);
    a.team.join();
    b.team.join();
    const { id } = (await a.team.send(b.team.id!, 'check auth.ts', { replyRequired: false })) as { id: number };
    await vi.waitFor(() => expect(teamMail(b.sent)).toHaveLength(1), { timeout: 3_000 });
    const store = open(cwd, db);
    // Handed to Pi is not read: a queued steer can still be dropped by a kill.
    expect(store.recent().find((entry) => entry.id === id)?.state).toBe('queued');
    await seen(b, teamMail(b.sent)[0]!);
    expect(store.recent().find((entry) => entry.id === id)?.state).toBe('delivered');
    // Never handed over twice, and later model calls (the message stays in the conversation) record nothing again.
    const ack = vi.spyOn(TeamStore.prototype, 'ack');
    await seen(b, teamMail(b.sent)[0]!);
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    expect(teamMail(b.sent)).toHaveLength(1);
    expect(ack).not.toHaveBeenCalled();
    ack.mockRestore();
  });

  it('records a quiet FYI once the model is called with it, however Pi added it', async () => {
    const cwd = repo();
    const db = path.join(tmp(), 'team.sqlite');
    const a = agent(db, cwd);
    const b = agent(db, cwd);
    a.team.join();
    b.team.join();
    const { id } = (await a.team.send(b.team.id!, 'fyi: tests are green', { replyRequired: false })) as { id: number };
    await vi.waitFor(() => expect(teamMail(b.sent)).toHaveLength(1), { timeout: 3_000 });
    expect(teamMail(b.sent)[0]!.options).toEqual({ triggerTurn: false, deliverAs: 'steer' });
    await seen(b, teamMail(b.sent)[0]!);
    expect(open(cwd, db).recent().find((entry) => entry.id === id)?.state).toBe('delivered');
  });

  it('records mail the model saw before leaving, even when the database was busy at the time', async () => {
    const cwd = repo();
    const db = path.join(tmp(), 'team.sqlite');
    const a = agent(db, cwd);
    const b = agent(db, cwd);
    a.team.join();
    b.team.join();
    const { id } = (await a.team.send(b.team.id!, 'read me', { replyRequired: false })) as { id: number };
    await vi.waitFor(() => expect(teamMail(b.sent)).toHaveLength(1), { timeout: 3_000 });
    const ack = vi.spyOn(TeamStore.prototype, 'ack').mockImplementationOnce(() => { throw new Error('database is locked'); });
    try {
      await seen(b, teamMail(b.sent)[0]!);
      b.team.leave();
      expect(open(cwd, db).recent().find((entry) => entry.id === id)?.state).toBe('delivered');
    } finally { ack.mockRestore(); }
  });

  it('dead-letters a message handed to Pi that its recipient left without seeing, and tells the sender', async () => {
    const cwd = repo();
    const db = path.join(tmp(), 'team.sqlite');
    const a = agent(db, cwd);
    const b = agent(db, cwd);
    a.team.join();
    b.team.join();
    const { id } = (await a.team.send(b.team.id!, 'stop, the plan changed', { replyRequired: false })) as { id: number };
    await vi.waitFor(() => expect(teamMail(b.sent)).toHaveLength(1), { timeout: 3_000 });
    b.team.leave(); // killed before Pi drained its steering queue
    await vi.waitFor(() => expect(a.sent.some((entry) => String(entry.message.content).startsWith(`Message #${id} to `))).toBe(true), { timeout: 8_000 });
  }, 10_000);

  it('retries a failed acknowledgement on the next tick', async () => {
    const cwd = repo();
    const db = path.join(tmp(), 'team.sqlite');
    const a = agent(db, cwd);
    const b = agent(db, cwd);
    a.team.join();
    b.team.join();
    const { id } = (await a.team.send(b.team.id!, 'once', { replyRequired: false })) as { id: number };
    await vi.waitFor(() => expect(teamMail(b.sent)).toHaveLength(1), { timeout: 3_000 });
    const ack = vi.spyOn(TeamStore.prototype, 'ack').mockImplementationOnce(() => { throw new Error('database is locked'); });
    try {
      await seen(b, teamMail(b.sent)[0]!);
      const store = open(cwd, db);
      expect(store.recent().find((entry) => entry.id === id)?.state).toBe('queued');
      await vi.waitFor(() => expect(store.recent().find((entry) => entry.id === id)?.state).toBe('delivered'), { timeout: 3_000 });
      expect(teamMail(b.sent)).toHaveLength(1);
    } finally { ack.mockRestore(); }
  });

  it('ignores messages started for another recipient or without team ids', async () => {
    const cwd = repo();
    const db = path.join(tmp(), 'team.sqlite');
    const b = agent(db, cwd);
    b.team.join();
    const store = open(cwd, db);
    store.save(row('peer-000001'));
    store.save(row('other-000002'));
    const id = store.send('peer-000001', ['other-000002'], 'not for b', { replyRequired: false }).id!;
    await b.emit('context', { messages: [{ role: 'custom', customType: MESSAGE_TYPE, details: { messages: [{ id, to: 'other-000002' }] } }, { role: 'custom', customType: MESSAGE_TYPE, details: { from: 'team', text: 'notice' } }, { role: 'custom', customType: MESSAGE_TYPE, details: null }] }, b.ctx);
    expect(store.pending('other-000002').map((message) => message.id)).toEqual([id]);
  });

  it('keeps a question completed when its acknowledgement is retried after the reply', async () => {
    const cwd = repo();
    const db = path.join(tmp(), 'team.sqlite');
    const a = agent(db, cwd);
    const b = agent(db, cwd);
    a.team.join();
    b.team.join();
    const { id } = (await a.team.send(b.team.id!, 'question', { replyRequired: true })) as { id: number };
    await vi.waitFor(() => expect(teamMail(b.sent)).toHaveLength(1), { timeout: 3_000 });
    const ack = vi.spyOn(TeamStore.prototype, 'ack').mockImplementationOnce(() => { throw new Error('database is locked'); });
    try {
      await seen(b, teamMail(b.sent)[0]!);
      expect((await b.team.send(a.team.id!, 'answer', { replyTo: id, replyRequired: false }))).toMatchObject({ sent: [a.team.id] });
      await vi.waitFor(() => expect(ack).toHaveBeenCalledTimes(2), { timeout: 3_000 });
      expect(open(cwd, db).recent().find((entry) => entry.id === id)?.state).toBe('answered');
    } finally { ack.mockRestore(); }
  });
});

describe('batched delivery', () => {
  it('hands every waiting message to Pi as one message, in order, waking when any one asks for action', async () => {
    const cwd = repo();
    const db = path.join(tmp(), 'team.sqlite');
    const b = agent(db, cwd);
    const me = b.team.join().id;
    const store = open(cwd, db);
    store.save(row('peer-000001'));
    store.send('peer-000001', [me], 'first fyi', { replyRequired: false });
    store.send('peer-000001', [me], 'the build failed: which test?', { replyRequired: true });
    store.send('peer-000001', [me], 'third fyi', { replyRequired: false });
    await vi.waitFor(() => expect(teamMail(b.sent)).toHaveLength(1), { timeout: 3_000 });
    const [batch] = teamMail(b.sent);
    expect(batch!.options).toEqual({ triggerTurn: true, deliverAs: 'steer' });
    expect(batch!.message.details.messages.map((message: { text: string }) => message.text)).toEqual(['first fyi', 'the build failed: which test?', 'third fyi']);
    const content = String(batch!.message.content);
    expect(content.indexOf('first fyi')).toBeLessThan(content.indexOf('which test?'));
    expect(content.indexOf('which test?')).toBeLessThan(content.indexOf('third fyi'));
    await seen(b, batch!);
    expect(store.pending(me)).toEqual([]);
  });

  it('keeps a batch of FYIs quiet', async () => {
    const cwd = repo();
    const db = path.join(tmp(), 'team.sqlite');
    const b = agent(db, cwd);
    const me = b.team.join().id;
    const store = open(cwd, db);
    store.save(row('peer-000001'));
    store.send('peer-000001', [me], 'one', { replyRequired: false });
    store.send('peer-000001', [me], 'two', { replyRequired: false });
    await vi.waitFor(() => expect(teamMail(b.sent)).toHaveLength(1), { timeout: 3_000 });
    expect(teamMail(b.sent)[0]!.options).toEqual({ triggerTurn: false, deliverAs: 'steer' });
  });
});

describe('dead letters', () => {
  it('tells the sender once, without waking it, that a recipient left before reading', async () => {
    const cwd = repo();
    const db = path.join(tmp(), 'team.sqlite');
    const a = agent(db, cwd);
    const b = agent(db, cwd);
    a.team.join();
    b.team.join();
    const sent = (await a.team.send(b.team.id!, 'please check auth.ts\nmore detail', { replyRequired: false }));
    expect('id' in sent).toBe(true);
    const id = (sent as { id: number }).id;
    b.team.leave();
    // Dead letters are checked with the 5-second heartbeat.
    await vi.waitFor(() => expect(a.sent.some((entry) => String(entry.message.content).startsWith(`Message #${id} to ${b.team.id ?? ''}`))).toBe(true), { timeout: 8_000 });
    const notice = a.sent.find((entry) => String(entry.message.content).includes(`Message #${id}`))!;
    expect(notice.message).toMatchObject({ customType: MESSAGE_TYPE, content: expect.stringContaining('was not read') });
    expect(notice.message.content).toContain('"please check auth.ts"');
    expect(notice.options).toEqual({ triggerTurn: false, deliverAs: 'steer' });
    // Once only.
    const store = open(cwd, db);
    expect(store.deadLetters(a.team.id!)).toEqual([]);
  }, 10_000);

  it('marks dead letters notified in the store', () => {
    const store = open(repo(), path.join(tmp(), 'team.sqlite'));
    store.save(row('a'));
    store.save(row('b'));
    store.save(row('c'));
    const id = store.send('a', ['b', 'c'], 'hello', { replyRequired: false }).id!;
    store.remove('b');
    store.remove('c');
    const letters = store.deadLetters('a');
    expect(letters).toEqual([{ id, recipients: ['b', 'c'], text: 'hello' }]);
    store.markNotified(letters);
    expect(store.deadLetters('a')).toEqual([]);
  });
});

describe('headless subagent exit', () => {
  it('stops a subagent whose parent process is gone through Pi\'s own SIGTERM shutdown', () => {
    vi.useFakeTimers();
    const kill = vi.spyOn(process, 'kill').mockImplementation((pid) => {
      if (pid === process.pid) return true;
      throw Object.assign(new Error('no such process'), { code: 'ESRCH' });
    });
    try {
      const db = path.join(tmp(), 'team.sqlite');
      const live = agent(db, repo(), { OCTOCODE_AGENT_ID: 'live-000001', OCTOCODE_PARENT_PID: String(process.pid) }, false);
      vi.advanceTimersByTime(1_500);
      expect(kill).not.toHaveBeenCalledWith(process.pid, 'SIGTERM');
      live.team.stop();
      agent(db, repo(), { OCTOCODE_AGENT_ID: 'orphan-000001', OCTOCODE_PARENT_PID: String(2 ** 22 + 12345) }, false);
      vi.advanceTimersByTime(1_500);
      expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
    } finally {
      kill.mockRestore();
    }
  });

  it('stops a subagent whose parent died even when the parent pid is alive again (reused)', () => {
    vi.useFakeTimers();
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const parentPid = process.ppid;
    const ppid = vi.spyOn(process, 'ppid', 'get').mockReturnValue(parentPid);
    try {
      agent(path.join(tmp(), 'team.sqlite'), repo(), { OCTOCODE_AGENT_ID: 'child-000001', OCTOCODE_PARENT_PID: String(parentPid) }, false);
      vi.advanceTimersByTime(1_500);
      expect(kill).not.toHaveBeenCalledWith(process.pid, 'SIGTERM');
      // Reparented: the parent exited, whatever now owns its pid.
      ppid.mockReturnValue(1);
      vi.advanceTimersByTime(1_500);
      expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
    } finally {
      ppid.mockRestore();
      kill.mockRestore();
    }
  });

  it('stops a subagent whose parent is gone even when it never joined the team', () => {
    vi.useFakeTimers();
    const kill = vi.spyOn(process, 'kill').mockImplementation((pid) => {
      if (pid === process.pid) return true;
      throw Object.assign(new Error('no such process'), { code: 'ESRCH' });
    });
    try {
      // No agent id: the child does not join, and the team database is never opened.
      const fake = fakePi();
      const team = new Team(fake.pi, { OCTOCODE_AGENT_DB: path.join(tmp(), 'missing', 'team.sqlite'), OCTOCODE_PARENT_PID: String(2 ** 22 + 12345) });
      const ctx = fakeCtx({ cwd: repo(), hasUI: false });
      team.start(ctx);
      teams.push({ team, ctx });
      expect(team.id).toBeUndefined();
      vi.advanceTimersByTime(1_500);
      expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
    } finally {
      kill.mockRestore();
    }
  });

  it('tells a parent that reused its pid from the parent by its start time', () => {
    const ppid = vi.spyOn(process, 'ppid', 'get').mockReturnValue(1);
    try {
      // Through a launcher (the parent is not our ppid): the recorded start time decides.
      expect(parentProcessGone(`${process.pid} Thu Jan  1 00:00:00 1970`)).toBe(process.platform !== 'win32');
      expect(parentProcessGone(String(process.pid))).toBe(false);
      expect(parentProcessGone('garbage')).toBe(false);
    } finally {
      ppid.mockRestore();
    }
  });

  it('keeps a child whose launcher exited while its parent still runs', () => {
    vi.useFakeTimers();
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const ppid = vi.spyOn(process, 'ppid', 'get').mockReturnValue(process.ppid);
    try {
      // The parent pid is not our ppid at load: something (a launcher) sat in between.
      agent(path.join(tmp(), 'team.sqlite'), repo(), { OCTOCODE_AGENT_ID: 'child-000002', OCTOCODE_PARENT_PID: String(process.pid) }, false);
      ppid.mockReturnValue(1);
      vi.advanceTimersByTime(1_500);
      expect(kill).not.toHaveBeenCalledWith(process.pid, 'SIGTERM');
    } finally {
      ppid.mockRestore();
      kill.mockRestore();
    }
  });

  it('takes no message while idle, so mail that arrives after its last turn is a dead letter, not acked unread', async () => {
    const cwd = repo();
    const db = path.join(tmp(), 'team.sqlite');
    const parent = agent(db, cwd);
    const parentId = parent.team.join().id;
    const child = agent(db, cwd, { OCTOCODE_AGENT_ID: 'general-333333', OCTOCODE_PARENT_ID: parentId }, false, true);
    child.team.join();
    const { id } = (await parent.team.send('general-333333', 'one more thing', { replyRequired: false })) as { id: number };
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    expect(teamMail(child.sent)).toEqual([]);
    await child.emit('agent_settled', {}, child.ctx);
    await vi.waitFor(() => expect(parent.sent.some((entry) => String(entry.message.content).startsWith(`Message #${id} to general-333333`))).toBe(true), { timeout: 8_000 });
  }, 10_000);

  it('takes messages while its run is active', async () => {
    const cwd = repo();
    const db = path.join(tmp(), 'team.sqlite');
    const parent = agent(db, cwd);
    const parentId = parent.team.join().id;
    const child = agent(db, cwd, { OCTOCODE_AGENT_ID: 'general-444444', OCTOCODE_PARENT_ID: parentId }, false, false);
    child.team.join();
    (await parent.team.send('general-444444', 'use the v2 API'));
    await vi.waitFor(() => expect(teamMail(child.sent)).toHaveLength(1), { timeout: 3_000 });
  });

  it('leaves the team when its run settles, so later messages are refused instead of acked unread', async () => {
    const cwd = repo();
    const db = path.join(tmp(), 'team.sqlite');
    const parent = agent(db, cwd);
    const parentId = parent.team.join().id;
    const child = agent(db, cwd, { OCTOCODE_AGENT_ID: 'general-222222', OCTOCODE_PARENT_ID: parentId }, false);
    child.team.join();
    child.team.lock(['src/a.ts'], 'work');
    await child.emit('agent_settled', {}, child.ctx);
    expect(parent.team.members().map((member) => member.id)).not.toContain('general-222222');
    expect(parent.team.reservation(path.join(cwd, 'src/a.ts'), 'src/a.ts')).toBeUndefined();
    expect((await parent.team.send('general-222222', 'one more'))).toEqual({ error: expect.any(String) });
  });

  it('stays joined when a session with a UI goes idle', async () => {
    const cwd = repo();
    const db = path.join(tmp(), 'team.sqlite');
    const main = agent(db, cwd);
    const id = main.team.join().id;
    await main.emit('agent_settled', {}, main.ctx);
    expect(main.team.members().map((member) => member.id)).toContain(id);
  });
});

describe('reservation lifetime', () => {
  it('lets a lease lapse unless its owner renews it', () => {
    const store = open(repo(), path.join(tmp(), 'team.sqlite'));
    const now = Date.now();
    // Its owner keeps heartbeating through the whole test: only the lease's own expiry is under test.
    store.save(row('one', { updatedAt: now + 2 * LEASE_MS }));
    store.lock('one', [{ path: 'a.ts', kind: 'file', reason: 'x' }], now);
    expect(store.conflict('a.ts', 'two', 'file', now + LEASE_MS - 1)).toBeDefined();
    expect(store.conflict('a.ts', 'two', 'file', now + LEASE_MS + 1)).toBeUndefined();
    store.renew('one', now + LEASE_MS - 1);
    expect(store.conflict('a.ts', 'two', 'file', now + LEASE_MS + 1)).toBeDefined();
  });

  it('stops renewing an idle session\'s reservations once it has been idle past the limit', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const cwd = repo();
    const db = path.join(tmp(), 'team.sqlite');
    const owner = agent(db, cwd);
    const peer = agent(db, cwd);
    owner.team.lock(['src/a.ts'], 'auth');
    peer.team.join();
    expect(peer.team.reservation(path.join(cwd, 'src/a.ts'), 'src/a.ts')).toMatch(/reserved by .* \(auth; locked \d+s ago\)/);
    // Idle past the limit: heartbeats continue (the row stays fresh) but the lease is not renewed and runs out.
    const until = Date.now() + LEASE_IDLE_MS + 2 * LEASE_MS;
    while (Date.now() < until) {
      vi.setSystemTime(Date.now() + 40_000);
      owner.team.join(); // a heartbeat-equivalent flush
      peer.team.join();
    }
    expect(peer.team.reservation(path.join(cwd, 'src/a.ts'), 'src/a.ts')).toBeUndefined();
    expect(owner.sent.some((entry) => /lapsed after \d+m idle/.test(String(entry.message.content)))).toBe(true);
  });

  it('formats the lock age', () => {
    expect(leaseAge({ id: 1, path: 'a', kind: 'file', owner: 'o', reason: '', acquiredAt: 0, expiresAt: 0 })).toBe('locked');
    expect(leaseAge({ id: 1, path: 'a', kind: 'file', owner: 'o', reason: '', acquiredAt: 1_000, expiresAt: 0 }, 1_000 + 12 * 60_000)).toMatch(/^locked 12m/);
  });

  it('ignores a lease whose owner has no agent row (it left)', () => {
    const store = open(repo(), path.join(tmp(), 'team.sqlite'));
    store.save(row('two'));
    expect(store.lock('ghost', [{ path: 'src/a.ts', kind: 'file', reason: '' }]).ok).toBe(true);
    expect(store.lock('two', [{ path: 'src/a.ts', kind: 'file', reason: '' }]).ok).toBe(true);
  });
});

describe('panel sanitizing', () => {
  it('strips terminal escapes from other processes\' task, activity and message text', () => {
    const evil = '\u001b]52;c;cHduZWQ=\u0007\u001b[2Jhi';
    const now = Date.now();
    const lines = widgetLines([row('main-aaaaaa', { status: 'working' }), row('general-bbbbbb', { parentId: 'main-aaaaaa', status: 'working', goal: evil, activity: evil })], 'main-aaaaaa', now, theme, 120).join('\n');
    expect(lines).toContain('general-bbbbbb');
    expect(lines).not.toMatch(/\u001b\]52|\u001b\[2J|\u0007/);
    const traffic = trafficRow({ id: 1, from: 'a', to: ['b'], text: evil, at: now, state: 'queued' }, now, theme, 120);
    expect(traffic).not.toMatch(/\u001b\]52|\u001b\[2J|\u0007/);
    expect(traffic).toContain('hi');
  });
});

describe('delivery edge cases', () => {
  const mailOf = (sent: Array<{ message: any }>) => sent.filter((entry) => entry.message.customType === MESSAGE_TYPE && entry.message.details?.messages?.some((m: { id?: number }) => typeof m.id === 'number'));

  it('leaves the team before ending a subagent whose parent is gone, so its row does not wait for a sweep', () => {
    vi.useFakeTimers();
    const kill = vi.spyOn(process, 'kill').mockImplementation((pid) => {
      if (pid === process.pid) return true;
      throw Object.assign(new Error('no such process'), { code: 'ESRCH' });
    });
    try {
      const db = path.join(tmp(), 'team.sqlite');
      const cwd = repo();
      const child = agent(db, cwd, { OCTOCODE_AGENT_ID: 'child-000003', OCTOCODE_PARENT_PID: String(2 ** 22 + 54321) }, false);
      expect(child.team.id).toBe('child-000003');
      vi.advanceTimersByTime(1_500);
      expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
      expect(child.team.id).toBeUndefined();
      expect(open(cwd, db).list().map((member) => member.id)).not.toContain('child-000003');
    } finally {
      kill.mockRestore();
    }
  });

  it('compares a parent\'s start time only when asked, so a poll does not run ps every second', () => {
    const ppid = vi.spyOn(process, 'ppid', 'get').mockReturnValue(1);
    try {
      expect(parentProcessGone(`${process.pid} Thu Jan  1 00:00:00 1970`, false)).toBe(false);
    } finally {
      ppid.mockRestore();
    }
  });

  it('tells the user once when an idle agent was handed a waking message and Pi started no turn', async () => {
    const cwd = repo();
    const db = path.join(tmp(), 'team.sqlite');
    const sender = agent(db, cwd);
    sender.team.join();
    const idle = agent(db, cwd);
    idle.team.join();
    await sender.team.send(idle.team.id!, 'are you there?', { replyRequired: true });
    await vi.waitFor(() => expect(mailOf(idle.sent)).toHaveLength(1), { timeout: 3_000 });
    expect(idle.ctx.ui.notes).toEqual([]);
    // Ten seconds pass and the model was never called with it (no model, or no sign-in).
    const later = Date.now() + 11_000;
    const now = vi.spyOn(Date, 'now').mockImplementation(() => later);
    try {
      await vi.waitFor(() => expect(idle.ctx.ui.notes).toHaveLength(1), { timeout: 3_000 });
      expect(idle.ctx.ui.notes[0]).toMatchObject({ type: 'warning', message: expect.stringContaining('did not run one') });
      await new Promise((resolve) => setTimeout(resolve, 1_300));
      expect(idle.ctx.ui.notes).toHaveLength(1);
    } finally {
      now.mockRestore();
    }
  }, 15_000);

  it('does not warn when the model was called with the message', async () => {
    const cwd = repo();
    const db = path.join(tmp(), 'team.sqlite');
    const sender = agent(db, cwd);
    sender.team.join();
    const idle = agent(db, cwd);
    idle.team.join();
    await sender.team.send(idle.team.id!, 'are you there?', { replyRequired: true });
    await vi.waitFor(() => expect(mailOf(idle.sent)).toHaveLength(1), { timeout: 3_000 });
    await idle.emit('context', { messages: [{ role: 'custom', customType: MESSAGE_TYPE, details: mailOf(idle.sent)[0]!.message.details }] }, idle.ctx);
    const later = Date.now() + 11_000;
    const shifted = vi.spyOn(Date, 'now').mockImplementation(() => later);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1_300));
      expect(idle.ctx.ui.notes).toEqual([]);
    } finally {
      shifted.mockRestore();
    }
  }, 15_000);

  it('hands over new messages after the team database was emptied under a live session', async () => {
    const cwd = repo();
    const db = path.join(tmp(), 'team.sqlite');
    const sender = agent(db, cwd);
    sender.team.join();
    const receiver = agent(db, cwd);
    receiver.team.join();
    for (const text of ['one', 'two']) {
      await sender.team.send(receiver.team.id!, text, { replyRequired: false });
    }
    await vi.waitFor(() => expect(mailOf(receiver.sent)).toHaveLength(1), { timeout: 3_000 });
    await receiver.emit('context', { messages: [{ role: 'custom', customType: MESSAGE_TYPE, details: mailOf(receiver.sent)[0]!.message.details }] }, receiver.ctx);
    // The messages are wiped and their numbers start again, as in a replaced database.
    const { DatabaseSync } = await import('node:sqlite');
    const raw = new DatabaseSync(db);
    raw.exec("DELETE FROM messages; DELETE FROM sqlite_sequence WHERE name = 'messages'");
    raw.close();
    const id = ((await sender.team.send(receiver.team.id!, 'after the reset', { replyRequired: false })) as { id: number }).id;
    expect(id).toBe(1);
    await vi.waitFor(() => expect(mailOf(receiver.sent)).toHaveLength(2), { timeout: 3_000 });
    expect(mailOf(receiver.sent)[1]!.message.content).toContain('after the reset');
  }, 15_000);
});
