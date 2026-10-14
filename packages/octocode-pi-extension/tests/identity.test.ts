import { describe, expect, it } from 'vitest';
import { ADJECTIVES, AGENT_NAMES, agentName, checkGoal, CREATURES, MAX_NAME_CHARS } from '../src/team/identity.js';

describe('agent names', () => {
  it('is a closed list of short, plain adjective-creature words', () => {
    expect(ADJECTIVES.length).toBeGreaterThanOrEqual(16);
    expect(CREATURES.length).toBeGreaterThanOrEqual(16);
    for (const word of [...ADJECTIVES, ...CREATURES]) expect(word).toMatch(/^[a-z]+$/);
    expect(new Set(ADJECTIVES).size).toBe(ADJECTIVES.length);
    expect(new Set(CREATURES).size).toBe(CREATURES.length);
    // No word is both: a name never reads `ink-ink`.
    expect(ADJECTIVES.filter((word) => CREATURES.includes(word))).toEqual([]);
  });

  it('offers only unique names that fit in 16 characters and are safe as ids (refs, folders, targets)', () => {
    expect(AGENT_NAMES.length).toBeGreaterThanOrEqual(200);
    expect(new Set(AGENT_NAMES).size).toBe(AGENT_NAMES.length);
    for (const name of AGENT_NAMES) {
      expect(name.length).toBeLessThanOrEqual(MAX_NAME_CHARS);
      expect(name).toMatch(/^[a-z]+-[a-z]+$/);
    }
    expect(AGENT_NAMES).toContain('inky-kraken');
  });

  it('picks from the list, deterministically for a given random source', () => {
    const name = agentName([], () => 0);
    expect(AGENT_NAMES).toContain(name);
    expect(agentName([], () => 0)).toBe(name);
    expect(agentName([], () => 0.999999)).not.toBe(name);
  });

  it('skips names in use, whatever the random source says', () => {
    const first = agentName([], () => 0);
    const next = agentName([first], () => 0);
    expect(next).not.toBe(first);
    expect(AGENT_NAMES).toContain(next);
    // Every name but one is taken: the one left is picked.
    const [left, ...rest] = AGENT_NAMES.slice().reverse();
    expect(agentName(new Set(rest), () => 0.5)).toBe(left);
  });

  it('adds the smallest free numeric suffix once the space is used up', () => {
    const all = new Set(AGENT_NAMES);
    const second = agentName(all, () => 0);
    expect(second).toMatch(/^[a-z]+-[a-z]+-2$/);
    expect(AGENT_NAMES).toContain(second.replace(/-2$/, ''));
    const withTwos = new Set([...all, ...AGENT_NAMES.map((name) => `${name}-2`)]);
    expect(agentName(withTwos, () => 0)).toMatch(/^[a-z]+-[a-z]+-3$/);
  });
});


describe('agent goal', () => {
  it('accepts a goal with punctuation', () => {
    expect(checkGoal('audit auth token refresh')).toBe('audit auth token refresh');
    expect(checkGoal('PR9 policy + PR12 gate wiring')).toBe('PR9 policy + PR12 gate wiring');
  });

  it('collapses whitespace and strips terminal escapes instead of storing them', () => {
    expect(checkGoal('  audit \n auth\ttoken  ')).toBe('audit auth token');
    expect(checkGoal('fix\u001b[2J the\u{e0041} bug')).toBe('fix the bug');
  });

  it('accepts a long goal whole: it is a label, clipped only where it is shown', () => {
    const long = 'audit the auth token refresh flow end to end across every service';
    expect(checkGoal(long)).toBe(long);
  });

  it('refuses a missing, blank or non-text goal and says what to write', () => {
    for (const bad of [undefined, '', '   \n', 5]) expect(() => checkGoal(bad)).toThrow(/goal.*audit auth token refresh/s);
  });
});
