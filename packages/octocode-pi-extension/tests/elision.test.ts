import { describe, expect, it } from 'vitest';
import { copiedElision } from '../src/files/tool.js';
import { capChars, capOutput, elisionMarkers } from '../src/shared/util.js';
import { capOutputToFile } from '../src/shared/spill.js';

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

  it('match the notes of a spilled result, a trimmed result and a file read back after compaction', () => {
    const page = Array.from({ length: 3_000 }, (_, i) => `row ${i}`).join('\n');
    const spilled = capOutputToFile(page, { label: 'web', maxBytes: 4_096 });
    const markers = elisionMarkers(spilled);
    expect(markers).toHaveLength(2);
    expect(markers[0]).toMatch(/^\[… \d+ lines omitted …\]$/);
    expect(markers[1]).toMatch(/^\[Output trimmed: showing \d+ of 3000 lines/);
    expect(elisionMarkers('[… 2.0KB omitted …]')).toHaveLength(1);
    expect(elisionMarkers(capOutput(page, 1_024))).toHaveLength(1);
    expect(elisionMarkers('x\n[… shown lines 1500–1900 of 3000, from where you last read or changed it; read the file with an offset for the rest]')).toHaveLength(1);
    expect(elisionMarkers('[Output trimmed] and [… 3 lines]')).toEqual([]);
  });

  it('names the exact lines a spilled preview leaves out and the read that shows them', () => {
    const page = Array.from({ length: 3_000 }, (_, i) => `row ${i + 1}`).join('\n');
    const preview = capOutputToFile(page, { label: 'web', maxBytes: 4_096 });
    const gap = /^\[… (\d+) lines omitted …\] \(lines (\d+)–(\d+) of 3000; read them from the full output with offset \2 and limit \1\)$/m.exec(preview);
    expect(gap).not.toBeNull();
    const [, count, first, last] = gap!.map(Number);
    expect(last! - first! + 1).toBe(count);
    const lines = preview.split('\n');
    const at = lines.findIndex((line) => line.startsWith('[…'));
    expect(lines[at - 2]).toBe(`row ${first! - 1}`);
    expect(lines[at + 2]).toBe(`row ${last! + 1}`);
  });

  it('refuses writing a spilled preview (a web page fetched over 50 KB) as if it were the content', () => {
    const page = Array.from({ length: 3_000 }, (_, i) => `row ${i}`).join('\n');
    const preview = capOutputToFile(page, { label: 'web', maxBytes: 4_096 });
    expect(copiedElision({ type: 'write', content: preview }, '')).toMatch(/^\[… \d+ lines omitted …\]$/);
    expect(copiedElision({ type: 'write', content: preview.replace(/\[… \d+ lines omitted …\]/, '') }, '')).toMatch(/^\[Output trimmed: /);
  });
});