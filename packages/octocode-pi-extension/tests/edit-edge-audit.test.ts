import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { registerFileTool } from '../src/tools/file-tool.js';
import { registerUniqueTool } from '../src/tools/octocode-tools.js';
import { clearReadStatesForTests, recordFileReadState } from '../src/tools/file-state.js';
import type { ToolDefinition } from '../src/types.js';

let cwd: string;
let tool: ToolDefinition;
beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-edge-audit-'));
  clearReadStatesForTests();
  registerFileTool({ registerTool: value => { tool = value; } }, new Set(), registerUniqueTool);
});
afterEach(() => { clearReadStatesForTests(); fs.rmSync(cwd, { recursive: true, force: true }); });
const execute = (edits: unknown[], extra: Record<string, unknown> = {}) => tool.execute('edge', {
  queries: [{ type: 'edit', reasoning: 'Verify exact file mutation behavior', path: 'target', edits, ...extra }],
}, undefined, undefined, { cwd });

it.each([
  ['mixed LF and CRLF', 'first\r\ntarget\nlast\r\n', 'first\r\nchanged\nlast\r\n'],
  ['CR-only', 'first\rtarget\rlast\r', 'first\rchanged\rlast\r'],
  ['CRLF', 'first\r\ntarget\r\nlast\r\n', 'first\r\nchanged\r\nlast\r\n'],
  ['BOM and mixed endings', '\uFEFFfirst\r\ntarget\nlast\r\n', '\uFEFFfirst\r\nchanged\nlast\r\n'],
])('preserves bytes outside a replacement in %s text', async (_label, original, expected) => {
  fs.writeFileSync(path.join(cwd, 'target'), original!);
  await execute([{ oldText: 'target', newText: 'changed' }]);
  expect(fs.readFileSync(path.join(cwd, 'target'), 'utf8')).toBe(expected);
});

it('matches a normalized anchor ending in a newline in the middle of a file', async () => {
  fs.writeFileSync(path.join(cwd, 'target'), 'head\n  target  value\ntail\n');
  await execute([{ matchMode: 'normalized', oldText: 'target value\n', newText: 'changed\n' }]);
  expect(fs.readFileSync(path.join(cwd, 'target'), 'utf8')).toBe('head\nchanged\ntail\n');
});

it('rejects overlapping occurrences of an ambiguous exact anchor', async () => {
  fs.writeFileSync(path.join(cwd, 'target'), 'ababa');
  await expect(execute([{ oldText: 'aba', newText: 'changed' }])).rejects.toThrow(/occurrences|unique/);
  expect(fs.readFileSync(path.join(cwd, 'target'), 'utf8')).toBe('ababa');
});

it.each([
  { oldText: 'target', newText: 'changed', replaceAl: true },
  { oldText: 'target', newText: 'changed', startLine: 1, endLine: 1 },
])('rejects unrecognized or inapplicable edit fields before writing', async edit => {
  fs.writeFileSync(path.join(cwd, 'target'), 'target');
  await expect(execute([edit])).rejects.toThrow();
  expect(fs.readFileSync(path.join(cwd, 'target'), 'utf8')).toBe('target');
});

it('does not silently discard an invalid freshness option', async () => {
  fs.writeFileSync(path.join(cwd, 'target'), 'target');
  await expect(execute([{ oldText: 'target', newText: 'changed' }], { requireRecentRead: 'true' })).rejects.toThrow();
  expect(fs.readFileSync(path.join(cwd, 'target'), 'utf8')).toBe('target');
});

it('requires a recorded read for an unanchored line-range edit', async () => {
  const file = path.join(cwd, 'target');
  fs.writeFileSync(file, 'head\ntarget\n');
  const edits = [{ matchMode: 'lineRange', startLine: 2, endLine: 2, newText: 'changed\n' }];
  await expect(execute(edits)).rejects.toThrow(/read state|Re-read/);
  expect(fs.readFileSync(file, 'utf8')).toBe('head\ntarget\n');
  await recordFileReadState(file);
  await execute(edits);
  expect(fs.readFileSync(file, 'utf8')).toBe('head\nchanged\n');
});

it.each([Buffer.from([0xff, 0x74, 0x61, 0x72, 0x67, 0x65, 0x74]), Buffer.from('binary\0target')])('rejects non-text input without rewriting unrelated bytes', async bytes => {
  const file = path.join(cwd, 'target');
  fs.writeFileSync(file, bytes);
  await expect(execute([{ oldText: 'target', newText: 'changed' }])).rejects.toThrow(/UTF-8|binary|text/);
  expect(fs.readFileSync(file)).toEqual(bytes);
});

it.each([
  { oldText: '\ud83d', newText: 'X' },
  { oldText: '😀', newText: '\udc00' },
])('rejects malformed Unicode edit inputs without splitting existing characters', async edit => {
  const file = path.join(cwd, 'target');
  fs.writeFileSync(file, 'a😀b');
  await expect(execute([edit])).rejects.toThrow(/Unicode|surrogate/);
  expect(fs.readFileSync(file, 'utf8')).toBe('a😀b');
});
