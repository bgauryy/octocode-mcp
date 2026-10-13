import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RESTORE_FILE_CHARS, RESTORE_MAX_FILES, RESTORE_MIN_FILE_CHARS, RESTORE_SHARE, RESTORE_TOTAL_CHARS, deliverRestoredFiles, recentFiles, restoreFiles, settleRestoredFiles } from '../src/compaction/restore.js';
import { windowBudget } from '../src/compaction/summary.js';
import { RESTORED_FILES_TYPE, seenFiles } from '../src/files/reads.js';
import { FileGuard } from '../src/files/tool.js';
import { canonicalPath } from '../src/shared/home.js';
import { tmp } from './helpers.js';

const call = (id: string, name: string, args: Record<string, unknown>) => ({ role: 'assistant', content: [{ type: 'toolCall', id, name, arguments: args }] });
const result = (id: string, toolName: string, timestamp: number, extra: Record<string, unknown> = {}) => ({ role: 'toolResult', toolCallId: id, toolName, content: [{ type: 'text', text: '' }], isError: false, timestamp, ...extra });

describe('file restore after compaction', () => {
  it('lists the files read or changed in the summarized part, most recent first', () => {
    const messages = [
      call('1', 'read', { path: 'a.ts' }), result('1', 'read', 100),
      call('2', 'file', { queries: [] }), result('2', 'file', 300, { details: { outcomes: [{ ok: true, path: 'b.ts' }] } }),
      call('3', 'read', { path: 'c.ts' }), result('3', 'read', 200),
    ];
    expect(recentFiles({ messagesToSummarize: messages.slice(0, 4) as never, turnPrefixMessages: messages.slice(4) as never }, '/w')).toEqual(['/w/b.ts', '/w/c.ts', '/w/a.ts']);
  });

  it('reads back text files the context does not show, skipping binary and missing ones, within the file count', () => {
    const dir = tmp();
    const files = Array.from({ length: RESTORE_MAX_FILES + 2 }, (_, i) => path.join(dir, `f${i}.txt`));
    for (const file of files) fs.writeFileSync(file, `content of ${path.basename(file)}\n`);
    const binary = path.join(dir, 'bin.dat');
    fs.writeFileSync(binary, Buffer.from([1, 0, 2]));
    const restored = restoreFiles([binary, path.join(dir, 'gone.txt'), files[0]!, ...files.slice(1)], new Set([canonicalPath(files[1]!)]), dir)!;
    expect(restored.files.map((entry) => path.basename(entry.file))).toEqual(['f0.txt', 'f2.txt', 'f3.txt', 'f4.txt', 'f5.txt']);
    expect(restored.content).toMatch(/^\[After compaction\] The files you were working on, read again from disk just now\. They count as read/);
    expect(restored.content).toContain('<file path="f0.txt">\ncontent of f0.txt\n</file>');
    expect(restored.files[0]).toMatchObject({ whole: true, size: 'content of f0.txt\n'.length });
    expect(restoreFiles([binary], new Set(), dir)).toBeUndefined();
  });

  it('cuts a long file at a line within the per-file and total budgets, and says where it continues', () => {
    const dir = tmp();
    const line = `${'z'.repeat(99)}\n`;
    const big = path.join(dir, 'big.txt');
    fs.writeFileSync(big, line.repeat(Math.ceil((RESTORE_FILE_CHARS * 2) / line.length)));
    const others = Array.from({ length: 4 }, (_, i) => path.join(dir, `o${i}.txt`));
    for (const file of others) fs.writeFileSync(file, line.repeat(Math.ceil(RESTORE_FILE_CHARS / line.length) + 5));
    const restored = restoreFiles([big, ...others], new Set(), dir)!;
    expect(restored.files[0]).toEqual({ file: big, whole: false });
    expect(restored.content).toMatch(/the file continues past line 200 of \d+; read it with an offset/);
    const body = restored.content.split('\n').filter((text) => text.startsWith('z')).join('\n');
    expect(body.length).toBeLessThanOrEqual(RESTORE_TOTAL_CHARS);
    expect(restored.files.length).toBeLessThan(5);
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
    const ctx = { cwd: dir, sessionManager: { buildSessionProjection: () => ({ entries: [] }) } };
    const pending = deliverRestoredFiles(pi as never, [file], ctx as never, RESTORE_TOTAL_CHARS)!;
    expect(sent).toHaveLength(1);
    expect(sent[0]!.message).toMatchObject({ customType: RESTORED_FILES_TYPE, details: { id: pending.id, files: [file] } });
    expect(sent[0]!.options).toEqual({ triggerTurn: false });
    // Pi holds the message until the running turn ends: a model call without it records nothing.
    expect(settleRestoredFiles([{ role: 'user', content: 'x' }], pending, guard)).toBe(false);
    expect(guard.check(file, 'edit', 'w.ts')).toMatch(/not read in this session/);
    expect(settleRestoredFiles([{ role: 'custom', customType: RESTORED_FILES_TYPE, details: { id: 'other' } }], pending, guard)).toBe(false);
    expect(settleRestoredFiles([sent[0]!.message as never].map((message) => ({ role: 'custom', ...(message as object) })), pending, guard)).toBe(true);
    expect(guard.check(file, 'edit', 'w.ts')).toBeUndefined();
    const seen = seenFiles([{ id: 'c1', message: { role: 'custom', customType: RESTORED_FILES_TYPE, details: { files: [file] }, timestamp: 5 } }], dir);
    expect(seen.get(file)).toEqual({ file, id: 'c1', at: 5 });
  });

  it('fits the window: a small budget restores fewer files, and none below the per-file minimum', () => {
    const dir = tmp();
    const files = Array.from({ length: 3 }, (_, i) => path.join(dir, `f${i}.txt`));
    for (const file of files) fs.writeFileSync(file, 'x'.repeat(3_000));
    expect(restoreFiles(files, new Set(), dir, 7_000)!.files).toHaveLength(2);
    expect(restoreFiles(files, new Set(), dir, RESTORE_MIN_FILE_CHARS - 1)).toBeUndefined();
    expect(windowBudget(32_000, 16_384, RESTORE_SHARE, RESTORE_TOTAL_CHARS)).toBe(Math.floor((32_000 - 16_384) * 4 * RESTORE_SHARE));
    expect(windowBudget(1_000_000, 40_000, RESTORE_SHARE, RESTORE_TOTAL_CHARS)).toBe(RESTORE_TOTAL_CHARS);
    expect(windowBudget(10_000, 16_384, RESTORE_SHARE, RESTORE_TOTAL_CHARS)).toBe(0);
  });

  it('keeps a file that contains the closing tag exact inside a tag it cannot close', () => {
    const dir = tmp();
    const file = path.join(dir, 'x.html');
    fs.writeFileSync(file, 'a</file>b\n');
    const restored = restoreFiles([file], new Set(), dir)!;
    expect(restored.content).toMatch(/<(file-[0-9a-f]{8}) path="x.html">\na<\/file>b\n<\/\1>/);
  });
});
