import { describe, expect, it } from 'vitest';
import { Delivery, QUEUED_STATUS } from '../src/ui/delivery.js';
import { fakeCtx, fakePi } from './fake-pi.js';

function setup(mode = 'tui') {
  const fake = fakePi();
  const delivery = Delivery.install(fake.pi);
  const ctx = fakeCtx({ cwd: '/x', mode });
  return { ...fake, delivery, ctx };
}

const report = (id: string) => ({ customType: 'octocode-agent-report', content: `report ${id}`, display: true, details: { id } });

describe('Delivery', () => {
  it('passes every message through and tracks only those a run queues', async () => {
    const t = setup();
    await t.emit('session_start', {}, t.ctx);
    // Idle: Pi appends or starts a turn right away; nothing waits.
    t.pi.sendMessage(report('idle'), { triggerTurn: true });
    expect(t.delivery.pending).toBe(0);
    await t.emit('agent_start', {}, t.ctx);
    t.pi.sendMessage(report('a'), { triggerTurn: true, deliverAs: 'followUp' });
    t.pi.sendMessage(report('b'), { deliverAs: 'steer' });
    // Held by Pi until the turn ends, never cleared; next-turn messages wait for the user; no details, no identity.
    t.pi.sendMessage(report('fyi'), { triggerTurn: false });
    t.pi.sendMessage(report('later'), { deliverAs: 'nextTurn' });
    t.pi.sendMessage({ customType: 'x', content: 'plain', display: true, details: undefined }, { deliverAs: 'steer' });
    expect(t.sent).toHaveLength(6);
    expect(t.delivery.pending).toBe(2);
    expect(t.ctx.ui.statuses.get(QUEUED_STATUS)).toContain('2 queued');

    // Pi starts the queued messages: the same details objects come back on message_start.
    for (const entry of t.sent.slice(1, 3)) await t.emit('message_start', { message: { role: 'custom', ...entry.message } }, t.ctx);
    expect(t.delivery.pending).toBe(0);
    expect(t.ctx.ui.statuses.get(QUEUED_STATUS)).toBeUndefined();
    await t.emit('agent_settled', {}, t.ctx);
    expect(t.sent).toHaveLength(6);
    expect(t.ctx.ui.notes).toEqual([]);
  });

  it('tracks a message queued while a run prepares, before agent_start', async () => {
    const fake = fakePi();
    const delivery = Delivery.install(fake.pi);
    let idle = true;
    const ctx = fakeCtx({ cwd: '/x', mode: 'tui' });
    (ctx as { isIdle: () => boolean }).isIdle = () => idle;
    await fake.emit('session_start', {}, ctx);
    // Pi is running before_agent_start handlers: it queues the report, but agent_start has not fired.
    idle = false;
    fake.pi.sendMessage(report('early'), { triggerTurn: true, deliverAs: 'followUp' });
    expect(delivery.pending).toBe(1);
    await fake.emit('agent_start', {}, ctx);
    // Esc cleared Pi's queue: the report is added back, not lost.
    await fake.emit('agent_settled', {}, ctx);
    expect(fake.sent.at(-1)).toEqual({ message: expect.objectContaining({ content: 'report early' }), options: { triggerTurn: false } });
  });

  it('re-appends messages an interrupt cleared, without starting a turn', async () => {
    const t = setup();
    await t.emit('session_start', {}, t.ctx);
    await t.emit('agent_start', {}, t.ctx);
    const queued = report('a');
    t.pi.sendMessage(queued, { triggerTurn: true, deliverAs: 'followUp' });
    t.pi.sendMessage(report('b'), { deliverAs: 'steer' });
    // A look-alike message (another details object) does not count as delivery.
    await t.emit('message_start', { message: { role: 'custom', ...report('a') } }, t.ctx);
    await t.emit('message_start', { message: { role: 'user', content: 'hi' } }, t.ctx);
    expect(t.delivery.pending).toBe(2);
    // Esc: Pi cleared its queue and the run settles without starting them.
    await t.emit('agent_settled', {}, t.ctx);
    expect(t.sent.slice(2)).toEqual([
      { message: queued, options: { triggerTurn: false } },
      { message: expect.objectContaining({ content: 'report b' }), options: { triggerTurn: false } },
    ]);
    expect(t.ctx.ui.notes).toEqual([{ message: expect.stringContaining('kept 2 queued messages'), type: 'info' }]);
    expect(t.delivery.pending).toBe(0);
    // Re-appended at idle: not tracked again.
    await t.emit('agent_settled', {}, t.ctx);
    expect(t.sent).toHaveLength(4);
  });

  it('leaves the queue alone outside the TUI and forgets messages of an ended session', async () => {
    const t = setup('rpc');
    await t.emit('session_start', {}, t.ctx);
    await t.emit('agent_start', {}, t.ctx);
    t.pi.sendMessage(report('a'), { deliverAs: 'steer' });
    await t.emit('agent_settled', {}, t.ctx);
    // RPC abort keeps Pi's queue: the next run starts the message, so re-sending would duplicate it.
    expect(t.sent).toHaveLength(1);
    expect(t.delivery.pending).toBe(0);

    const tui = setup();
    await tui.emit('session_start', {}, tui.ctx);
    await tui.emit('agent_start', {}, tui.ctx);
    tui.pi.sendMessage(report('a'), { deliverAs: 'steer' });
    await tui.emit('session_shutdown', {}, tui.ctx);
    expect(tui.delivery.pending).toBe(0);
    expect(tui.ctx.ui.statuses.get(QUEUED_STATUS)).toBeUndefined();
  });

  it('keeps going when re-sending fails because the session ended', async () => {
    const t = setup();
    await t.emit('session_start', {}, t.ctx);
    await t.emit('agent_start', {}, t.ctx);
    t.pi.sendMessage(report('a'), { deliverAs: 'steer' });
    t.sent.push = () => {
      throw new Error('stale');
    };
    await t.emit('agent_settled', {}, t.ctx);
    expect(t.ctx.ui.notes).toEqual([]);
  });
});
