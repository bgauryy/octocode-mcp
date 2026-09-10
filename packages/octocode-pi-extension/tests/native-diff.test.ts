import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, vi } from 'vitest';
import { computeLineDiff, generateDiffArtifactsAsync } from '@octocodeai/octocode-extension-rust';
import { prepareEdit, commitPreparedEdit, renderEditResult, generateDiffArtifacts } from '../src/tools/edit-tool.js';

vi.mock('@octocodeai/octocode-extension-rust', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@octocodeai/octocode-extension-rust')>();
  return { ...actual, computeLineDiff: vi.fn(actual.computeLineDiff) };
});

test('native compact artifacts preserve the synchronous contract on empty, Unicode, and multi-hunk inputs', async () => {
  const cases = ['', '\n', 'a', 'a\n', 'a\n\n', 'a\nb', '😀\r\n界', 'a\na\nb'];
  for (const oldContent of cases) for (const newContent of cases) {
    const expected = generateDiffArtifacts('file.ts', oldContent, newContent);
    const actual = await generateDiffArtifactsAsync('file.ts', oldContent, newContent);
    assert.equal(actual.diff, expected.diff);
    assert.equal(actual.patch, expected.patch);
  }
});

test('rendering a prepared edit reuses asynchronous evidence diff without invoking synchronous native work', async () => {
  const cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'native-diff-')));
  try {
    fs.writeFileSync(path.join(cwd, 'file'), 'alpha\nbeta\ngamma\n');
    const prepared = await prepareEdit({ path: 'file', edits: [
      { oldText: 'alpha', newText: 'ALPHA', reasoning: 'rename first' },
      { oldText: 'gamma', newText: 'GAMMA', reasoning: 'rename last' },
    ] }, cwd, false);
    const result = await commitPreparedEdit(prepared);
    vi.mocked(computeLineDiff).mockClear();
    renderEditResult(result, { expanded: false }, undefined);
    renderEditResult(result, { expanded: true }, undefined);
    assert.equal(vi.mocked(computeLineDiff).mock.calls.length, 0);
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
});
