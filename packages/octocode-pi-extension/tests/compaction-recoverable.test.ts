import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { planTooLargeRecovery } from '../src/compaction/images.js';
import { KEEP_RECENT_RESULTS, planContextTrims } from '../src/compaction/register.js';

const PNG = Buffer.from('89504e470d0a1a0a' + 'ab'.repeat(60_000), 'hex').toString('base64');
const resolve = (shown: string) => (shown.startsWith('~') ? path.join(os.homedir(), shown.slice(2)) : path.resolve(shown));
const savedPaths = (text: string) => [...text.matchAll(/saved at ([^\s;,\]]+)/g)].map((match) => resolve(match[1]!));
/** Every `<path> (sha256 <prefix>, <n> bytes)` pointer in a note checks out against its file. */
const checkedPointers = (text: string) =>
  [...text.matchAll(/([^\s;,\]]+) \(sha256 ([0-9a-f]{16}), (\d+) bytes\)/g)].map((match) => {
    const bytes = fs.readFileSync(resolve(match[1]!));
    expect(createHash('sha256').update(bytes).digest('hex').slice(0, 16)).toBe(match[2]);
    expect(bytes.length).toBe(Number(match[3]));
    return match[1]!;
  });

const bashCall = (index: number) => ({ id: `a${index}`, message: { role: 'assistant', content: [{ type: 'toolCall', id: `c${index}`, name: 'bash', arguments: { command: `run ${index}` } }] } });
const bashResult = (index: number) => ({
  id: `r${index}`,
  message: { role: 'toolResult', toolName: 'bash', toolCallId: `c${index}`, content: [{ type: 'text', text: `HEAD${index} ${'o'.repeat(30_000)} TAIL${index}` }] },
});
const writeCall = (index: number) => ({
  id: `w${index}`,
  message: { role: 'assistant', content: [{ type: 'toolCall', id: `f${index}`, name: 'file', arguments: { queries: [{ type: 'write', path: `src/f${index}.ts`, content: `export const v${index} = '${'z'.repeat(9_000)}';` }] } }] },
});
const writeResult = (index: number) => ({ id: `wr${index}`, message: { role: 'toolResult', toolName: 'file', toolCallId: `f${index}`, content: [{ type: 'text', text: 'ok' }] } });
const shotResult = (index: number) => ({
  id: `s${index}`,
  message: { role: 'toolResult', toolName: 'browser', toolCallId: `c${index}`, content: [{ type: 'text', text: 'screenshot' }, { type: 'image', data: PNG, mimeType: 'image/png' }] },
});

const textsOf = (value: unknown): string[] =>
  typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap(textsOf) : value && typeof value === 'object' ? Object.values(value).flatMap(textsOf) : [];

describe('no data loss', () => {
  it('saves the actual result even when its text contains a misleading log pointer', () => {
    const text = `HEAD ${'a'.repeat(30_000)} UNIQUE EVIDENCE ${'b'.repeat(30_000)}\nLog: /nonexistent/tool-output.log`;
    const entries = [
      bashCall(0),
      { ...bashResult(0), message: { ...bashResult(0).message, content: [{ type: 'text', text }] } },
      ...Array.from({ length: KEEP_RECENT_RESULTS }, (_, index) => [bashCall(index + 1), bashResult(index + 1)]).flat(),
    ];
    const edit = planContextTrims(entries).find((candidate) => candidate.targetId === 'r0')!;
    expect(edit).toBeDefined();
    const files = textsOf(edit.replacement).flatMap(savedPaths);
    expect(files.length).toBeGreaterThan(0);
    expect(files.map((file) => fs.readFileSync(file, 'utf8'))).toContain(text);
  });

  it('leaves, for every trim, a readable pointer to the exact removed bytes', () => {
    const entries = [
      ...[0, 1, 2].flatMap((index) => [writeCall(index), writeResult(index)]),
      ...[3, 4, 5].flatMap((index) => [bashCall(index), bashResult(index)]),
      ...[6, 7].flatMap((index) => [bashCall(index), shotResult(index)]),
      ...Array.from({ length: KEEP_RECENT_RESULTS }, (_, index) => [bashCall(20 + index), { ...bashResult(20 + index), message: { ...bashResult(20 + index).message, content: [{ type: 'text', text: 'small' }] } }]).flat(),
    ];
    const byId = new Map(entries.map((entry) => [entry.id, entry.message as { content: Array<Record<string, unknown>> }]));
    const edits = planContextTrims(entries);
    expect(edits.length).toBeGreaterThanOrEqual(8);
    // Every pointer Octocode wrote names its hash and size, and they match; planning again reuses the same files.
    expect(textsOf(edits).flatMap(checkedPointers).length).toBeGreaterThanOrEqual(8);
    expect(planContextTrims(entries)).toEqual(edits);
    for (const edit of edits) {
      const original = byId.get(edit.targetId)!;
      const replaced = (edit.replacement as { content: unknown }).content;
      const files = textsOf(replaced).flatMap(savedPaths);
      expect(files.length, `${edit.targetId} names where its removed bytes are`).toBeGreaterThan(0);
      const saved = files.map((file) => fs.readFileSync(file));
      for (const part of original.content) {
        if (part['type'] === 'toolCall') expect(saved.map((bytes) => JSON.parse(bytes.toString('utf8')))).toContainEqual(part['arguments']);
        if (part['type'] === 'image') expect(saved.some((bytes) => bytes.equals(Buffer.from(String(part['data']), 'base64')))).toBe(true);
        if (part['type'] === 'text' && original.content.every((item) => item['type'] === 'text')) expect(saved.map(String)).toContain(String(part['text']));
      }
    }
  });

  it('names the saved image when a request rejected as too large loses its images', () => {
    const entries = [bashCall(0), shotResult(0), bashCall(1), shotResult(1)];
    const edits = planTooLargeRecovery(entries, undefined, 0)!;
    for (const edit of edits) {
      const [file] = textsOf((edit.replacement as { content: unknown }).content).flatMap(savedPaths);
      expect(fs.readFileSync(file!).equals(Buffer.from(PNG, 'base64'))).toBe(true);
      expect(file!.endsWith('.png')).toBe(true);
    }
  });
});
