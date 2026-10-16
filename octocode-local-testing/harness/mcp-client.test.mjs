import assert from 'node:assert/strict';
import test from 'node:test';
import { expandShared } from './mcp-client.mjs';

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
