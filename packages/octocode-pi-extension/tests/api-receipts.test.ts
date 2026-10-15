import { afterEach, describe, expect, it, vi } from 'vitest';
import { ERR, RpcError } from '../src/api/protocol.js';
import { SendReceipts } from '../src/api/receipts.js';

const accepted = (id: string) => ({ id, queued: 'turn' });
afterEach(() => vi.useRealTimers());

describe('SendReceipts', () => {
  it('keeps a keyed receipt that owns the run, and settles it with the run', async () => {
    const receipts = new SendReceipts();
    const { receipt, waiter } = receipts.open('f1', accepted('x1'), 'k1', false);
    expect(receipts.get('k1')).toBe(receipt);
    expect(receipts.activeKey).toBe('k1');
    expect(receipts.busy).toBe(true);
    receipts.accept(receipt, waiter, true);
    expect(receipt.phase).toBe('accepted');
    expect(receipts.preparingCount).toBe(0);
    expect(receipts.busy).toBe(true);
    receipts.settle({ text: 'done' });
    expect(receipt.phase).toBe('settled');
    expect(receipts.busy).toBe(false);
    await expect(receipt.settlement).resolves.toEqual({ text: 'done' });
  });

  it('does not own the run when the session was busy, and answers a caller that does not wait at once', async () => {
    const receipts = new SendReceipts();
    const { receipt, waiter } = receipts.open('f', accepted('x1'), 'k', true);
    expect(receipts.activeKey).toBeUndefined();
    receipts.accept(receipt, waiter, false);
    await expect(receipt.settlement).resolves.toEqual({ text: '' });
  });

  it('frees the key of a send that failed before dispatch, and keeps the receipt of one that failed after', async () => {
    const receipts = new SendReceipts();
    const before = receipts.open('f', accepted('x1'), 'k1', false);
    const failure = new RpcError(ERR.unavailable, 'nope', { execution: 'not-sent' });
    receipts.fail(before.receipt, before.waiter, 'k1', failure, false);
    expect(receipts.get('k1')).toBeUndefined();
    expect(receipts.activeKey).toBeUndefined();
    await expect(before.receipt.ready).rejects.toBe(failure);

    const after = receipts.open('f', accepted('x2'), 'k2', false);
    receipts.accept(after.receipt, after.waiter, true);
    receipts.fail(after.receipt, after.waiter, 'k2', failure, true);
    expect(receipts.get('k2')?.phase).toBe('uncertain');
  });

  it('cancels a send still being prepared when the run settles, and says nothing was sent', async () => {
    const receipts = new SendReceipts();
    const { receipt } = receipts.open('f', accepted('x1'), 'k', false);
    receipts.settle({ text: '' });
    expect(receipt.phase).toBe('cancelled');
    expect(receipt.controller.signal.aborted).toBe(true);
    await expect(receipt.settlement).rejects.toMatchObject({ message: 'The session ran while the message was being prepared', data: { execution: 'not-sent' } });
    expect(receipts.activeKey).toBeUndefined();
  });

  it('lets only the owner abort the run, and cancels a send still being prepared instead', () => {
    const receipts = new SendReceipts();
    expect(() => receipts.abort('none')).toThrow('This request does not own the active run');
    const { receipt } = receipts.open('f', accepted('x1'), 'k', false);
    expect(receipts.abort('k')).toBe('cancelled');
    expect(receipt.phase).toBe('cancelled');
    const next = receipts.open('f2', accepted('x2'), 'k2', false);
    receipts.accept(next.receipt, next.waiter, true);
    expect(receipts.abort('k2')).toBe('owner');
    receipts.settle({ text: '' });
    expect(() => receipts.abort('k2')).toThrow('This request does not own the active run');
  });

  it('refuses a new key at capacity but never evicts an existing receipt', () => {
    const receipts = new SendReceipts();
    for (let index = 0; index < 128; index += 1) receipts.open(`f${index}`, accepted(`x${index}`), `k${index}`, true);
    expect(() => receipts.assertRoom('another')).toThrow('message key capacity');
    expect(() => receipts.assertRoom(undefined)).not.toThrow();
    expect(receipts.get('k0')).toBeDefined();
  });

  it('drops everything of a replaced session and rejects its waiters as accepted', async () => {
    const receipts = new SendReceipts();
    receipts.follow('s1');
    const a = receipts.open('f', accepted('x1'), 'k', false);
    receipts.accept(a.receipt, a.waiter, true);
    const b = receipts.open('g', accepted('x2'), undefined, true);
    receipts.follow('s1');
    expect(receipts.get('k')).toBe(a.receipt);
    receipts.follow('s2');
    expect(receipts.get('k')).toBeUndefined();
    expect(receipts.busy).toBe(false);
    await expect(a.receipt.settlement).rejects.toMatchObject({ message: 'The session was replaced', data: { execution: 'accepted' } });
    await expect(b.receipt.settlement).rejects.toMatchObject({ message: 'The session was replaced', data: { execution: 'not-sent' } });
  });

  it('times a wait out: a delivered message says so, a send still preparing is cancelled and refused', async () => {
    vi.useFakeTimers();
    const receipts = new SendReceipts();
    const a = receipts.open('f', accepted('x1'), 'k', false);
    receipts.accept(a.receipt, a.waiter, true);
    const late = receipts.wait(a.receipt, 1_000).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await late).toMatchObject({ code: ERR.timeout, data: { id: 'x1', execution: 'accepted' } });

    const b = receipts.open('g', accepted('x2'), undefined, true);
    const refused = receipts.wait(b.receipt, 500).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(500);
    expect(await refused).toMatchObject({ code: ERR.unavailable, message: 'Message preparation timed out; nothing was sent' });
    expect(b.receipt.phase).toBe('cancelled');
  });
});
