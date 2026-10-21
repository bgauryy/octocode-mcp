import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { startProxy } from './classification_proxy.mjs';

test('forwards exact bytes and meters successes/failures without source or credentials', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'jev-meter-'));
  let received = null, receivedHeaders = null, calls = 0;
  const upstream = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received = Buffer.concat(chunks).toString();
    receivedHeaders = req.headers;
    calls++;
    if (calls === 1) res.writeHead(200, { 'content-type': 'application/json' })
      .end('{"model":"fixed-revision","usage":{"input_tokens":17,"output_tokens":3},"answers":{}}');
    else res.writeHead(429, { 'retry-after': '2' }).end('busy');
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const log = join(directory, 'requests.jsonl');
  const proxy = await startProxy({ endpoint: `http://127.0.0.1:${upstream.address().port}/v1/systemone`,
    key: 'private-test-key', log, allowLoopback: true });
  try {
    const body = '{ "model": "requested-alias", "state": "PRIVATE_SOURCE_SENTINEL" }';
    const first = await fetch(`${proxy.url}/v1/systemone`, { method: 'POST', body,
      headers: {
        'TypeSafe-Danger-Zone-Images': 'true',
        'TypeSafe-Danger-Zone-Long-Context': 'true',
        authorization: 'Bearer untrusted-caller-key',
        'x-untrusted-header': 'do-not-forward',
      } });
    assert.equal(first.status, 200);
    assert.equal((await first.json()).model, 'fixed-revision');
    assert.equal(received, body);
    assert.equal(receivedHeaders.authorization, 'Bearer private-test-key');
    assert.equal(receivedHeaders['typesafe-danger-zone-images'], 'true');
    assert.equal(receivedHeaders['typesafe-danger-zone-long-context'], 'true');
    assert.equal(receivedHeaders['x-untrusted-header'], undefined);
    const second = await fetch(`${proxy.url}/v1/systemone`, { method: 'POST', body });
    assert.equal(second.status, 429);
    assert.equal(second.headers.get('retry-after'), '2');
    assert.equal(await second.text(), 'busy');
    assert.equal(receivedHeaders['typesafe-danger-zone-images'], undefined);
    assert.equal(receivedHeaders['typesafe-danger-zone-long-context'], undefined);
    const raw = readFileSync(log, 'utf8');
    assert.ok(!raw.includes('private-test-key'));
    assert.ok(!raw.includes('untrusted-caller-key'));
    assert.ok(!raw.includes('PRIVATE_SOURCE_SENTINEL'));
    const rows = raw.trim().split('\n').map(JSON.parse);
    assert.equal(rows.filter(row => row.event === 'started').length, 2);
    const finished = rows.filter(row => row.event === 'finished');
    assert.equal(finished[0].inputTokens, 17);
    assert.equal(finished[0].outputTokens, 3);
    assert.equal(finished[1].inputTokens, null);
    assert.equal(finished[1].httpStatus, 429);
  } finally {
    await proxy.close();
    upstream.closeAllConnections();
    await new Promise(resolve => upstream.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  }
});

test('forwards model discovery and enforces the request cap before contacting upstream', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'jev-meter-cap-'));
  const seen = [];
  const upstream = createServer((req, res) => {
    seen.push({ method: req.method, path: req.url, authorization: req.headers.authorization });
    res.writeHead(200, { 'content-type': 'application/json' }).end('{"models":[]}');
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const log = join(directory, 'requests.jsonl');
  const proxy = await startProxy({ endpoint: `http://127.0.0.1:${upstream.address().port}/v1/systemone`,
    key: 'private-test-key', log, allowLoopback: true, maxRequests: 1 });
  try {
    const models = await fetch(`${proxy.url}/v1/models`);
    assert.equal(models.status, 200);
    assert.deepEqual(await models.json(), { models: [] });
    const capped = await fetch(`${proxy.url}/v1/systemone`, { method: 'POST', body: '{}' });
    assert.equal(capped.status, 402);
    assert.deepEqual(seen, [{ method: 'GET', path: '/v1/models', authorization: 'Bearer private-test-key' }]);
    const rows = readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepEqual(rows.at(-1), { event: 'rejected', reason: 'benchmarkRequestCap', limit: 1 });
  } finally {
    await proxy.close();
    upstream.closeAllConnections();
    await new Promise(resolve => upstream.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  }
});
