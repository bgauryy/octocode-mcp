import { describe, it, expect } from 'vitest';
import { settleAll } from '../../utils/promiseUtils.js';

describe('promiseUtils', () => {
  it('settleAll returns both fulfilled and rejected results', async () => {
    const promises = [
      Promise.resolve(1),
      Promise.reject(new Error('nope')),
      Promise.resolve(3),
    ];
    const results = await settleAll(promises);
    const statuses = results.map(r => r.status);
    expect(statuses.sort()).toEqual(
      ['fulfilled', 'fulfilled', 'rejected'].sort()
    );
  });
});
