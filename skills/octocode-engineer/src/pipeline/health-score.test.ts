import { describe, expect, it } from 'vitest';

import { computeGateScore } from './main.js';

describe('computeGateScore', () => {
  it('returns 100 for 0 findings', () => {
    expect(computeGateScore(0, 100)).toBe(100);
  });

  it('returns 100 for 0 findings and 0 files', () => {
    expect(computeGateScore(0, 0)).toBe(100);
  });

  it('decreases as findings increase', () => {
    const score10 = computeGateScore(10, 100);
    const score50 = computeGateScore(50, 100);
    const score200 = computeGateScore(200, 100);

    expect(score10).toBeGreaterThan(score50);
    expect(score50).toBeGreaterThan(score200);
  });

  it('returns higher score for same findings with more files', () => {
    const smallProject = computeGateScore(50, 10);
    const bigProject = computeGateScore(50, 1000);

    expect(bigProject).toBeGreaterThan(smallProject);
  });

  it('is always between 0 and 100', () => {
    for (const [f, t] of [
      [0, 1],
      [1, 1],
      [100, 10],
      [1000, 50],
      [10000, 100],
    ]) {
      const score = computeGateScore(f, t);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it('returns reasonable score for typical project (10 findings / 100 files)', () => {
    const score = computeGateScore(10, 100);
    expect(score).toBeGreaterThan(90);
  });

  it('returns low score for finding-heavy project (500 findings / 50 files)', () => {
    const score = computeGateScore(500, 50);
    expect(score).toBeLessThanOrEqual(50);
  });

  it('handles totalFiles=0 without division by zero', () => {
    expect(() => computeGateScore(10, 0)).not.toThrow();
    const score = computeGateScore(10, 0);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('returns integer values', () => {
    const score = computeGateScore(17, 33);
    expect(Number.isInteger(score)).toBe(true);
  });
});
