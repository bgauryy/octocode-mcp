import assert from 'node:assert/strict';
import test from 'node:test';
import { expandShared, sourceLines } from './mcp-client.mjs';

test('shared revisions restore rows without corrupting entry revisions or source evidence', () => {
  const wire = {
    shared: { commitSha: 'head', language: 'rust' },
    results: [
      { index: 0, data: { content: '1\tfn run() {}', commits: [{ commitSha: 'historical' }], files: [{ path: 'a.rs' }] } },
      { index: 1, data: { commitSha: 'explicit', files: [{ path: 'b.rs', language: 'python' }] } },
    ],
  };
  const before = structuredClone(wire);
  const restored = expandShared(wire);
  assert.deepEqual(wire, before);
  assert.equal(restored.results[0].data.commitSha, 'head');
  assert.equal(restored.results[1].data.commitSha, 'explicit');
  assert.equal(restored.results[0].data.commits[0].commitSha, 'historical');
  assert.deepEqual(restored.results[0].data.files[0], { path: 'a.rs', language: 'rust' });
  assert.deepEqual(restored.results[1].data.files[0], { path: 'b.rs', language: 'python' });
  assert.equal(restored.results[0].data.content, before.results[0].data.content);
});

test('source lines preserve numbered text, blank lines and gaps', () => {
  assert.deepEqual(sourceLines({ content: '41\tfirst\n42\t\n--\n527\t\tindented\n' }), [
    [41, 'first'], [42, ''], [527, '\tindented'],
  ]);
  assert.deepEqual(sourceLines({ content: '41\t--\n--\n527\tvalue\n' }), [[41, '--'], [527, 'value']]);
});

test('source lines recover a selected page spanning disjoint source ranges', () => {
  assert.deepEqual(sourceLines({
    content: 'first\nsecond\n... [lines 43-526 not selected] ...\nthird\nfourth\n',
    sourceLineRanges: [{ line: 41, endLine: 42 }, { line: 527, endLine: 528 }],
  }), [[41, 'first'], [42, 'second'], [527, 'third'], [528, 'fourth']]);
});

test('source lines retain literal markers and tolerate page-edge gap markers', () => {
  assert.deepEqual(sourceLines({
    content: '... [lines 1-40 not selected] ...\n--\nvalue\n... [lines 43-100 not selected] ...\n',
    sourceLineRanges: [{ line: 41, endLine: 42 }],
  }), [[41, '--'], [42, 'value']]);
  assert.deepEqual(sourceLines({ content: '9\tliteral tab\n', sourceLineRanges: [{ line: 41, endLine: 41 }] }), [[41, '9\tliteral tab']]);
});

test('source lines reject incomplete or unanchored evidence instead of dropping it', () => {
  assert.deepEqual(sourceLines(undefined), []);
  assert.throws(() => sourceLines({ content: 'one\n', sourceLineRanges: [{ line: 4, endLine: 5 }] }), /shorter/);
  assert.throws(() => sourceLines({ content: 'one\ntwo\n', sourceLineRanges: [{ line: 4, endLine: 4 }] }), /does not match/);
  assert.throws(() => sourceLines({ content: 'unanchored\n' }), /does not match/);
  assert.throws(() => sourceLines({ content: 'one\n', sourceLineRanges: [{ line: 4, endLine: 3 }] }), /Invalid/);
});
