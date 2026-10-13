import { describe, expect, it } from 'vitest';
import { copiedElision } from '../src/files/tool.js';
import { capChars, elisionMarkers } from '../src/shared/util.js';

const marker = elisionMarkers(capChars('z'.repeat(100), 10, 'use a range'))[0]!;

describe('elision markers', () => {
  it('match what capChars emits, not ordinary text', () => {
    expect(marker).toMatch(/^.… 90 more characters cut; use a range.$/);
    expect(elisionMarkers(capChars('z'.repeat(100), 10))).toHaveLength(1);
    expect(elisionMarkers('ordinary text [… more] and 12 more characters')).toEqual([]);
    expect(elisionMarkers('a\n[… 12 characters of this message are left out here; the transcript has it whole]\nb')).toHaveLength(1);
    expect(elisionMarkers('a\n[… 40 characters in the middle left out for the summary; the transcript has them]\nb')).toHaveLength(1);
  });

  it('refuses a write or edit that adds a marker', () => {
    expect(copiedElision({ type: 'write', content: `a\n${marker}\nb` }, '')).toBe(marker);
    expect(copiedElision({ type: 'edit', edits: [{ oldText: 'a', newText: `| row ${marker}` }] }, 'a')).toBe(marker);
  });

  it('allows markers that are already there or being replaced, and other types', () => {
    expect(copiedElision({ type: 'write', content: `x ${marker}` }, `old ${marker}`)).toBeUndefined();
    expect(copiedElision({ type: 'edit', edits: [{ oldText: `k ${marker}`, newText: `k2 ${marker}` }] }, `k ${marker}`)).toBeUndefined();
    expect(copiedElision({ type: 'delete' }, '')).toBeUndefined();
    expect(copiedElision({ type: 'write', content: 'plain' }, '')).toBeUndefined();
  });
});
