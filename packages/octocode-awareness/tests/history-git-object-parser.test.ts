import type { GitObject } from '@octocodeai/octocode-extension-rust';
import { expect, it } from 'vitest';
import { MAX_HISTORY_OBJECT_BYTES, parseHistoryCommit, parseHistoryTree, readHistoryObject } from '../src/history-git-object.js';

const oid = 'a'.repeat(40);
const parent = 'b'.repeat(40);
function object(objectType: GitObject['objectType'], value: string | Buffer): GitObject {
  const content = Buffer.from(value);
  return { objectType, size: content.length, content };
}
function entry(path: string, mode = '100644'): Buffer {
  return Buffer.concat([Buffer.from(`${mode} ${path}\0`), Buffer.from(oid, 'hex')]);
}
const committer = 'committer Test <test@localhost> 1700000000 +0230';

it('preserves commit parent order, message bytes and epoch timestamp', () => {
  const value = object('commit', `tree ${oid}\nparent ${parent}\nparent ${oid}\n${committer}\n\nmerge\nsecond line\n`);
  expect(parseHistoryCommit(value)).toEqual({ tree: oid, parents: [parent, oid], message: 'merge\nsecond line\n', timestampMs: 1700000000000 });
});

it.each([
  `tree ${oid}\n${committer}`,
  `${committer}\n\nmessage`,
  `tree invalid\n${committer}\n\nmessage`,
  `tree ${oid}\ntree ${parent}\n${committer}\n\nmessage`,
  `tree ${oid}\nparent invalid\n${committer}\n\nmessage`,
  `tree ${oid}\n${committer}\n${committer}\n\nmessage`,
  `tree ${oid}\ncommitter Test <a@b> nope +0000\n\nmessage`,
  `tree ${oid}\ncommitter Test <a@b> 9007199254740991 +0000\n\nmessage`,
])('rejects malformed commit metadata %j', value => {
  expect(() => parseHistoryCommit(object('commit', value))).toThrow(/HISTORY_OBJECT_INVALID/);
});

it('bounds commit body and header fanout before parsing untrusted metadata', () => {
  expect(() => parseHistoryCommit(object('commit', Buffer.alloc(1024 * 1024 + 1)))).toThrow(/HISTORY_OBJECT_LIMIT/);
  expect(() => parseHistoryCommit(object('commit', `${Array.from({ length: 4097 }, () => 'x').join('\n')}\n\nmessage`))).toThrow(/HISTORY_OBJECT_LIMIT/);
});

it('requires the expected object type and retained content at parser boundaries', () => {
  expect(() => parseHistoryTree(object('blob', ''))).toThrow(/expected tree/);
  expect(() => parseHistoryTree({ objectType: 'tree', size: 0 })).toThrow(/expected tree/);
  expect(() => parseHistoryCommit(object('tree', ''))).toThrow(/expected commit/);
  expect(() => parseHistoryCommit({ objectType: 'commit', size: 0 })).toThrow(/expected commit/);
});

it.each(['', '.', '..', 'a/b', 'a\\b'])('rejects non-leaf tree paths %j', path => {
  expect(() => parseHistoryTree(object('tree', entry(path)))).toThrow(/invalid or duplicate tree path/);
});

it('rejects duplicate paths, truncated binary OIDs, oversized names and unsupported modes', () => {
  expect(() => parseHistoryTree(object('tree', Buffer.concat([entry('same'), entry('same')])))).toThrow(/duplicate tree path/);
  expect(() => parseHistoryTree(object('tree', entry('short').subarray(0, -1)))).toThrow(/truncated tree entry/);
  expect(() => parseHistoryTree(object('tree', Buffer.from('no delimiters')))).toThrow(/truncated tree entry/);
  expect(() => parseHistoryTree(object('tree', entry('x'.repeat(32768))))).toThrow(/HISTORY_OBJECT_LIMIT/);
  expect(() => parseHistoryTree(object('tree', entry('gitlink', '160000')))).toThrow(/unsupported tree mode/);
});

it('preserves tree kinds, executable and symlink modes without flattening binary entries', () => {
  expect(parseHistoryTree(object('tree', Buffer.concat([entry('directory', '40000'), entry('executable', '100755'), entry('link', '120000')])))).toEqual([
    { mode: '040000', path: 'directory', oid, type: 'tree' },
    { mode: '100755', path: 'executable', oid, type: 'blob' },
    { mode: '120000', path: 'link', oid, type: 'blob' },
  ]);
});

it('rejects invalid object identity and caller limits before accessing the store', async () => {
  await expect(readHistoryObject('/nonexistent', '../escape')).rejects.toThrow(/HISTORY_OBJECT_INVALID/);
  for (const maximum of [-1, 0.5, Number.NaN, MAX_HISTORY_OBJECT_BYTES + 1]) {
    await expect(readHistoryObject('/nonexistent', oid, maximum)).rejects.toThrow(/HISTORY_OBJECT_LIMIT/);
  }
});
