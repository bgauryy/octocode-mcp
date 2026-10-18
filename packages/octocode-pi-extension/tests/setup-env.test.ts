import { describe, expect, it, vi } from 'vitest';

describe('test setup: vi.waitFor limit', () => {
  it('waits past vitest’s 1 s default, so polling work done by children does not fail on a loaded machine', async () => {
    const readyAt = Date.now() + 1_300;
    await vi.waitFor(() => expect(Date.now()).toBeGreaterThanOrEqual(readyAt));
  });

  it('keeps the limit a caller passes, as an option or a number', async () => {
    await expect(vi.waitFor(() => { throw new Error('never'); }, { timeout: 100 })).rejects.toThrow('never');
    await expect(vi.waitFor(() => { throw new Error('never'); }, 100)).rejects.toThrow('never');
  });
});
