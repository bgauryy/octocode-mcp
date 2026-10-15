import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RESTORE_FILE_CHARS, RESTORE_MAX_FILES, RESTORE_MIN_FILE_CHARS, RESTORE_SHARE, RESTORE_TOTAL_CHARS, deliverRestoredFiles, recentFiles, restoreFiles, settleRestoredFiles } from '../src/compaction/restore.js';
import { CHARS_PER_TOKEN } from '../src/shared/tokens.js';
import { windowBudget } from '../src/compaction/summary.js';
import { RESTORED_FILES_TYPE, seenFiles } from '../src/files/reads.js';
import { FileGuard } from '../src/files/tool.js';
import { canonicalPath } from '../src/shared/home.js';
import { tmp } from './helpers.js';

const call = (id: string, name: string, args: Record<string, unknown>) => ({ role: 'assistant', content: [{ type: 'toolCall', id, name, arguments: args }] });
const result = (id: string, toolName: string, timestamp: number, extra: Record<string, unknown> = {}) => ({ role: 'toolResult', toolCallId: id, toolName, content: [{ type: 'text', text: '' }], isError: false, timestamp, ...extra });
/** Restore candidates with no known work position (the head of a long file is shown). */
const plain = (...files: string[]) => files.map((file) => ({ file }));

describe('file restore after compaction', () => {
  it('lists the files read or changed in the summarized part, most recent first', () => {
    const messages = [
      call('1', 'read', { path: 'a.ts' }), result('1', 'read', 100),
      call('2', 'file', { queries: [] }), result('2', 'file', 300, { details: { outcomes: [{ ok: true, path: 'b.ts' }] } }),
      call('3', 'read', { path: 'c.ts' }), result('3', 'read', 200),
    ];
    expect(recentFiles({ messagesToSummarize: messages.slice(0, 4) as never, turnPrefixMessages: messages.slice(4) as never }, '/w').map((entry) => entry.file)).toEqual(['/w/b.ts', '/w/c.ts', '/w/a.ts']);
  });

  it('ranks a file read back by an earlier compaction by the work it stands for, not by the read-back', () => {
    const restored = { role: 'custom', customType: RESTORED_FILES_TYPE, timestamp: 900, details: { id: 'x', files: ['/w/old.ts', '/w/legacy.ts'], worked: [{ file: '/w/old.ts', workedAt: 50, line: 40 }] } };
    const messages = [restored, call('1', 'read', { path: 'new.ts', offset: 7 }), result('1', 'read', 300), call('2', 'file', {}), result('2', 'file', 400, { details: { outcomes: [{ ok: true, path: 'edited.ts', diff: '  3 a\n- 4 b\n+ 4 c' }] } })];
    expect(recentFiles({ messagesToSummarize: messages as never, turnPrefixMessages: [] }, '/w')).toEqual([
      { file: '/w/edited.ts', workedAt: 400, line: 4 },
      { file: '/w/new.ts', workedAt: 300, line: 7 },
      { file: '/w/old.ts', workedAt: 50, line: 40 },
      // Read back by an older build that recorded no work time: last.
      { file: '/w/legacy.ts' },
    ]);
  });

  it('reads back text files the context does not show, skipping binary and missing ones, within the file count', () => {
    const dir = tmp();
    const files = Array.from({ length: RESTORE_MAX_FILES + 2 }, (_, i) => path.join(dir, `f${i}.txt`));
    for (const file of files) fs.writeFileSync(file, `content of ${path.basename(file)}\n`);
    const binary = path.join(dir, 'bin.dat');
    fs.writeFileSync(binary, Buffer.from([1, 0, 2]));
    const restored = restoreFiles(plain(binary, path.join(dir, 'gone.txt'), ...files), new Set([canonicalPath(files[1]!)]), dir)!;
    expect(restored.files.map((entry) => path.basename(entry.file))).toEqual(['f0.txt', 'f2.txt', 'f3.txt', 'f4.txt', 'f5.txt']);
    expect(restored.content).toMatch(/^\[After compaction\] The files you were working on, read again from disk just now\. They count as read/);
    expect(restored.content).toContain('<file path="f0.txt">\ncontent of f0.txt\n</file>');
    expect(restored.files[0]).toMatchObject({ whole: true, size: 'content of f0.txt\n'.length });
    expect(restoreFiles(plain(binary), new Set(), dir)).toBeUndefined();
  });

  it('cuts a long file at a line within the per-file and total budgets, and says where it continues', () => {
    const dir = tmp();
    const line = `${'z'.repeat(99)}\n`;
    const big = path.join(dir, 'big.txt');
    fs.writeFileSync(big, line.repeat(Math.ceil((RESTORE_FILE_CHARS * 2) / line.length)));
    const others = Array.from({ length: 4 }, (_, i) => path.join(dir, `o${i}.txt`));
    for (const file of others) fs.writeFileSync(file, line.repeat(Math.ceil(RESTORE_FILE_CHARS / line.length) + 5));
    const restored = restoreFiles(plain(big, ...others), new Set(), dir)!;
    expect(restored.files[0]).toEqual({ file: big, whole: false });
    expect(restored.content).toMatch(/\[… shown lines 1–200 of 400; read the file with an offset for the rest\]/);
    const body = restored.content.split('\n').filter((text) => text.startsWith('z')).join('\n');
    expect(body.length).toBeLessThanOrEqual(RESTORE_TOTAL_CHARS);
    expect(restored.files.length).toBeLessThan(5);
  });

  it('returns nothing when the session was replaced, and lets any other failure through', () => {
    const dir = tmp();
    const file = path.join(dir, 'w.ts');
    fs.writeFileSync(file, 'export {};\n');
    const ctx = { cwd: dir, sessionManager: { getBranch: () => [], buildSessionProjection: () => ({ entries: [] }) } };
    const deliver = (error: Error) => deliverRestoredFiles({ sendMessage: () => { throw error; } } as never, [{ file, workedAt: 3 }], ctx as never, RESTORE_TOTAL_CHARS);
    expect(deliver(new Error('This extension ctx is stale after session replacement or reload. Do not use a captured pi or command ctx.'))).toBeUndefined();
    expect(() => deliver(new Error('disk full'))).toThrow('disk full');
  });

  it('sends the files as a hidden message and records them only once a model call carries it', () => {
    const dir = tmp();
    const file = path.join(dir, 'w.ts');
    fs.writeFileSync(file, 'export {};\n');
    const sent: Array<{ message: { customType: string; details: { id: string; files: string[] } }; options: unknown }> = [];
    const pi = { sendMessage: (message: never, options: unknown) => void sent.push({ message, options }) };
    const guard = new FileGuard();
    guard.restore([]);
    expect(guard.check(file, 'edit', 'w.ts')).toMatch(/not read in this session/);
    const ctx = { cwd: dir, sessionManager: { getBranch: () => [], buildSessionProjection: () => ({ entries: [] }) } };
    const pending = deliverRestoredFiles(pi as never, [{ file, workedAt: 3, line: 1 }], ctx as never, RESTORE_TOTAL_CHARS)!;
    expect(sent).toHaveLength(1);
    expect(sent[0]!.message).toMatchObject({ customType: RESTORED_FILES_TYPE, details: { id: pending.id, files: [file], worked: [{ file, workedAt: 3, line: 1 }] } });
    expect(sent[0]!.options).toEqual({ triggerTurn: false });
    // Pi holds the message until the running turn ends: a model call without it records nothing.
    expect(settleRestoredFiles([{ role: 'user', content: 'x' }], pending, guard)).toBe(false);
    expect(guard.check(file, 'edit', 'w.ts')).toMatch(/not read in this session/);
    expect(settleRestoredFiles([{ role: 'custom', customType: RESTORED_FILES_TYPE, details: { id: 'other' } }], pending, guard)).toBe(false);
    expect(settleRestoredFiles([sent[0]!.message as never].map((message) => ({ role: 'custom', ...(message as object) })), pending, guard)).toBe(true);
    expect(guard.check(file, 'edit', 'w.ts')).toBeUndefined();
    const seen = seenFiles([{ id: 'c1', message: { role: 'custom', customType: RESTORED_FILES_TYPE, details: sent[0]!.message.details, timestamp: 5 } }], dir);
    // Read at 5 (for the guard), worked on at 3 (for ranking).
    expect(seen.get(file)).toEqual({ file, id: 'c1', at: 5, workedAt: 3, line: 1 });
  });

  it('records a file restored only in part as a partial read: edit is allowed, write is not', () => {
    const dir = tmp();
    const file = path.join(dir, 'big.txt');
    fs.writeFileSync(file, Array.from({ length: 400 }, (_, i) => `z${i}`.padEnd(60, 'z')).join('\n'));
    const sent: Array<{ message: { details: { id: string; files: string[]; partial?: string[] } } }> = [];
    const pi = { sendMessage: (message: never) => void sent.push({ message }) };
    const guard = new FileGuard();
    guard.restore([]);
    const ctx = { cwd: dir, sessionManager: { getBranch: () => [], buildSessionProjection: () => ({ entries: [] }) } };
    const pending = deliverRestoredFiles(pi as never, [{ file, workedAt: 3 }], ctx as never, RESTORE_TOTAL_CHARS)!;
    expect(pending.files[0]).toMatchObject({ file, whole: false });
    expect(sent[0]!.message.details.partial).toEqual([file]);
    expect(settleRestoredFiles([{ role: 'custom', ...(sent[0]!.message as object) }], pending, guard)).toBe(true);
    expect(guard.check(file, 'edit', 'big.txt')).toBeUndefined();
    expect(guard.check(file, 'write', 'big.txt')).toMatch(/whole file/);
    const seen = seenFiles([{ id: 'c1', message: { role: 'custom', customType: RESTORED_FILES_TYPE, details: sent[0]!.message.details, timestamp: 5 } }], dir);
    expect(seen.get(file)?.partial).toBe(true);
  });

  it('fits the window: a small budget restores fewer files, and none below the per-file minimum', () => {
    const dir = tmp();
    const files = Array.from({ length: 3 }, (_, i) => path.join(dir, `f${i}.txt`));
    for (const file of files) fs.writeFileSync(file, 'x'.repeat(3_000));
    expect(restoreFiles(plain(...files), new Set(), dir, 7_000)!.files).toHaveLength(2);
    expect(restoreFiles(plain(...files), new Set(), dir, RESTORE_MIN_FILE_CHARS - 1)).toBeUndefined();
    expect(windowBudget(32_000, 16_384, RESTORE_SHARE, RESTORE_TOTAL_CHARS)).toBe(Math.floor((32_000 - 16_384) * CHARS_PER_TOKEN * RESTORE_SHARE));
    expect(windowBudget(1_000_000, 40_000, RESTORE_SHARE, RESTORE_TOTAL_CHARS)).toBe(RESTORE_TOTAL_CHARS);
    expect(windowBudget(10_000, 16_384, RESTORE_SHARE, RESTORE_TOTAL_CHARS)).toBe(0);
  });

  it('keeps a file that contains the closing tag exact inside a tag it cannot close', () => {
    const dir = tmp();
    const file = path.join(dir, 'x.html');
    fs.writeFileSync(file, 'a</file>b\n');
    const restored = restoreFiles(plain(file), new Set(), dir)!;
    expect(restored.content).toMatch(/<(file-[0-9a-f]{8}) path="x.html">\na<\/file>b\n<\/\1>/);
  });

  it('shows a long file from the line last read or changed, naming the lines, and fills back from the end', () => {
    const dir = tmp();
    const file = path.join(dir, 'long.ts');
    const lines = Array.from({ length: 3_000 }, (_, i) => `line ${i + 1} ${'x'.repeat(40)}\n`);
    fs.writeFileSync(file, lines.join(''));
    const middle = restoreFiles([{ file, line: 1_500 }], new Set(), dir)!;
    expect(middle.content).toMatch(/<file path="long.ts">\nline 1500 x+\n/);
    expect(middle.content).toMatch(/\[… shown lines 1500–\d+ of 3000, from where you last read or changed it; read the file with an offset for the rest\]$/);
    expect(middle.files[0]).toEqual({ file, whole: false });
    // Near the end the window starts earlier, so it is as full as from the head.
    const end = restoreFiles([{ file, line: 2_990 }], new Set(), dir)!;
    expect(end.content).toMatch(/line 3000 x+\n<\/file>/);
    const shown = /shown lines (\d+)–(\d+)/.exec(end.content)!;
    expect(Number(shown[2])).toBe(3_000);
    expect(Number(shown[1])).toBeLessThan(2_990);
  });
});