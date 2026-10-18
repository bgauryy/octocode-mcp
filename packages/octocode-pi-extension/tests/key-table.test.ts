import { describe, expect, it } from 'vitest';
import { KeyTable } from '../src/permission/key-table.js';

/** A seeded generator, so a failure repeats. */
function random(seed: number): () => number {
  return () => (seed = (seed * 48_271) % 2_147_483_647) / 2_147_483_647;
}

describe('KeyTable', () => {
  it('is empty until set, and clear empties it', () => {
    const table = new KeyTable(100);
    expect(table.size).toBe(0);
    expect(table.get(0)).toBeUndefined();
    expect(table.has(5)).toBe(false);
    table.delete(5);
    table.set(0, 0);
    table.set(2 ** 52 + 3, 7);
    expect([table.get(0), table.get(2 ** 52 + 3), table.size]).toEqual([0, 7, 2]);
    table.clear();
    expect([table.get(0), table.size]).toEqual([undefined, 0]);
    table.set(1, 1);
    expect(table.size).toBe(1);
  });

  it('replaces the slot of a key set again without growing', () => {
    const table = new KeyTable(10);
    table.set(42, 1);
    table.set(42, 9);
    expect([table.get(42), table.size]).toEqual([9, 1]);
  });

  it.each([8, 300, 2_000])('matches a Map through random sets and deletes at its limit of %i keys (clustered cells included)', (limit) => {
    const next = random(limit);
    const table = new KeyTable(limit);
    const model = new Map<number, number>();
    // A small key space makes keys collide and deletes land in the middle of a run, the case backward shifting must keep reachable.
    const space = Math.max(limit * 3, 20);
    const keyAt = () => Math.floor(next() * space) * 4_194_304 + Math.floor(next() * 3);
    for (let step = 0; step < limit * 20; step++) {
      const key = keyAt();
      if (model.has(key) || (model.size < limit && next() < 0.6)) {
        table.set(key, step);
        model.set(key, step);
      } else {
        const victim = [...model.keys()][Math.floor(next() * model.size)];
        if (victim !== undefined) {
          table.delete(victim);
          model.delete(victim);
        }
      }
      if (step % 211 === 0) {
        expect(table.size).toBe(model.size);
        for (const [stored, slot] of model) expect(table.get(stored)).toBe(slot);
      }
    }
    expect(table.size).toBe(model.size);
    for (const [stored, slot] of model) expect(table.get(stored)).toBe(slot);
    for (let probe = 0; probe < 200; probe++) {
      const key = keyAt();
      expect(table.get(key)).toBe(model.get(key));
    }
  });
});
