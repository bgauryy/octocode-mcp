// Classifier ranking acceptance against a loopback classifier, on fresh CLI processes
// and MCP. This checks protocol/evidence correctness, not semantic model quality.
// Run after native + CLI + MCP builds: node octocode-local-testing/harness/local-ranking.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { ROOT, RESULTS, startServer, expandShared, hermeticEnv } from './mcp-client.mjs';

const fixture = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'octocode-ranking-')));
const cliPath = path.join(ROOT, 'packages/octocode/out/octocode.js');
const marker = 'SEMANTIC_TARGET_EVIDENCE';
const classifiers = ['Find evidence explaining cancellation of a waiting request'];
const searchDir = path.join(fixture, 'search');
fs.mkdirSync(searchDir);
for (let i = 0; i < 5; i++) {
  const lines = Array.from({ length: 6 - i }, (_, j) => `topic ${i}.${j}: ordinary bookkeeping details`);
  if (i === 4) lines.push(`topic: ${marker} A waiting request is cancelled before it starts.`);
  fs.writeFileSync(path.join(searchDir, `${i}.txt`), `${lines.join('\n')}\n`);
}
const docLines = Array.from({ length: 1200 }, (_, i) => `Entry ${i + 1}: ordinary background records ${'without requested evidence '.repeat(2)}`);
docLines[900] = `${marker} Cancelling a waiting request removes it before any work begins.`;
const docPath = path.join(fixture, 'large-document.txt');
fs.writeFileSync(docPath, `${docLines.join('\n')}\n`);

let mode = 'score';
let calls = 0;
const sentStates = [];
const sentQuestions = [];
const mock = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  calls++;
  const request = JSON.parse(Buffer.concat(chunks).toString());
  sentStates.push(request.state);
  sentQuestions.push(Object.values(request.questions ?? {}));
  if (mode === 'timeout') await new Promise(resolve => setTimeout(resolve, 500));
  if (mode === '429' || mode === '500' || mode === '401') {
    res.writeHead(Number(mode), { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'synthetic provider failure' }));
    return;
  }
  if (mode === 'malformed') { res.end('{broken'); return; }
  const high = mode === 'tie' || JSON.stringify(request.state).includes(marker);
  const answers = Object.fromEntries(Object.entries(request.questions ?? {}).map(([id, q]) => {
    if (q.type === 'noul') return [id, { type: 'noul', noul: high ? 0.99 : 0.01 }];
    assert.equal(q.type, 'score', 'ranking uses a relevance score or yes/no question');
    const levels = q.criteria;
    const score = high ? levels.length - 1 : 0;
    return [id, { type: 'score', score, confidence: 1,
      probabilities: Object.fromEntries(levels.map((_, i) => [String(i), Number(i === score)])),
      legend: Object.fromEntries(levels.map((level, i) => [String(i), level])),
    }];
  }));
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ model: request.model, answers, usage: { input_tokens: 10, output_tokens: 2 } }));
});
await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
const isolated = hermeticEnv(process.env, 'local-ranking');
const env = {
  ...isolated,
  OCTOCODE_CLASSIFICATION_API: 'fixture-key',
  OCTOCODE_CLASSIFICATION_API_HOST: `http://127.0.0.1:${mock.address().port}`,
  OCTOCODE_RANKING_ENABLED: 'true',
  OCTOCODE_BETA: 'true',
  OCTOCODE_RANKING_MAX_CANDIDATES: '256',
  OCTOCODE_RANKING_MAX_CHARS: '1048576',
  OCTOCODE_RANKING_TIMEOUT_MS: '10000',
  OCTOCODE_STORAGE_MODE: 'memory',
  OCTOCODE_LSP_PREWARM: 'off',
  MAX_RETRIES: '0',
  DISABLE_TOOLS: '', TOOLS_TO_RUN: '', ALLOWED_PATHS: fixture, WORKSPACE_ROOT: fixture,
};
const checks = [];
fs.mkdirSync(RESULTS, { recursive: true });
let mcp;

async function cliArgs(args, overrides = {}) {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], { cwd: fixture, env: { ...env, ...overrides } });
    let stdout = '', stderr = '';
    child.stdout.on('data', value => { stdout += value; });
    child.stderr.on('data', value => { stderr += value; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 25000);
    child.on('error', reject);
    child.on('close', code => {
      clearTimeout(timer);
      try { resolve({ json: expandShared(JSON.parse(stdout)), code, chars: stdout.length, ms: performance.now() - started }); }
      catch { reject(new Error(`CLI ${code}: ${stderr.slice(0, 400)} ${stdout.slice(0, 400)}`)); }
    });
  });
}
const cli = (tool, query, overrides) => cliArgs([tool, JSON.stringify({ queries: [query] }), '--json'], overrides);
const data = result => result.json?.results?.[0]?.data;
function successful(result) {
  assert.ok(result.json?.results?.length, JSON.stringify(result.json));
  assert.notEqual(result.json.results[0].status, 'error', JSON.stringify(result.json));
  return data(result);
}
async function check(name, run) {
  if (process.argv[2] && !name.includes(process.argv[2])) return;
  mode = 'score';
  const started = performance.now();
  try { const detail = await run(); checks.push({ name, passed: true, ms: Math.round(performance.now() - started), detail }); console.log(`PASS ${name}`); }
  catch (error) { checks.push({ name, passed: false, ms: Math.round(performance.now() - started), error: error.message }); console.log(`FAIL ${name}: ${error.message.slice(0, 250)}`); }
  finally { mode = 'score'; }
}
const sourceRows = row => String(row.content ?? '').split('\n').filter(line => /^\d+\t/.test(line));
const matchRows = row => (row.files ?? []).flatMap(file => (file.matches ?? []).map(match => `${file.path}:${match.line}:${match.value ?? ''}`));
async function walk(call, tool, query) {
  const pending = [query], seen = new Set(), rows = [], results = [];
  while (pending.length) {
    assert.ok(results.length < 160, 'continuation walk terminates');
    const next = pending.shift();
    const id = JSON.stringify(next);
    if (seen.has(id)) fs.writeFileSync(path.join(RESULTS, 'local-ranking-duplicate-edge.json'), JSON.stringify({ tool, initial: query, repeated: next, pending, rows, results }, null, 2));
    assert.ok(!seen.has(id), `a continuation edge must not repeat: ${id}`);
    seen.add(id);
    const result = await call(tool, next);
    const row = successful(result);
    results.push(result);
    rows.push(...(tool === 'localFetch' ? sourceRows(row) : matchRows(row)));
    for (const [kind, lead] of Object.entries(row.next ?? {})) {
      if (!['nextPage', 'nextMatchPage', 'continueWindow'].includes(kind)) continue;
      assert.equal(lead.tool, tool);
      assert.ok(Array.isArray(lead.query.queries), 'continuation carries the whole envelope');
      pending.push(...lead.query.queries);
    }
  }
  return { rows, results };
}

const search = { path: searchDir, matchString: 'topic', classifiers, pageSize: 1, matchPageSize: 100 };
const fetch = { path: docPath, classifiers, unit: 'lines', length: 80 };
try {
  for (const [label, overrides, shown] of [
    ['enabled', {}, true],
    ['disabled', { OCTOCODE_RANKING_ENABLED: 'false' }, false],
    ['missing key', { OCTOCODE_CLASSIFICATION_API: '' }, false],
    ['clasify hidden', { DISABLE_TOOLS: 'clasify' }, true],
    ['beta off', { OCTOCODE_BETA: 'false' }, true],
    ['read-only allowlist', { TOOLS_TO_RUN: 'localSearch,localFetch' }, true],
  ]) {
    await check(`schema: ${label} on CLI and fresh MCP`, async () => {
      const server = await startServer({ env: { ...env, ...overrides }, cwd: fixture, timeoutMs: 25000 });
      try {
        for (const tool of ['localSearch', 'localFetch']) {
          const mcpSchema = server.tools.find(entry => entry.name === tool)?.inputSchema.properties?.queries?.items;
          assert.ok(mcpSchema);
          assert.equal(Boolean(mcpSchema.properties?.classifiers), shown);
          assert.ok(!mcpSchema.required?.includes('classifiers'));
          for (const view of ['query', 'full']) {
            const result = await cliArgs(['schema', tool, '--view', view], overrides);
            assert.equal(result.code, 0);
            assert.equal(Boolean(result.json.querySchema?.properties?.classifiers), shown);
            assert.ok(!result.json.querySchema.required?.includes('classifiers'));
            const continuation = view === 'query' ? result.json.continuationFields : result.json.querySchema.properties;
            assert.equal(Boolean(continuation?.ranking), shown);
          }
        }
      } finally { server.close(); }
    });
  }
  // MCP discovery never contacts the provider (the startup probe was removed):
  // a failing provider keeps every advertised surface and surfaces per call.
  for (const overrides of [{}, { DISABLE_TOOLS: 'clasify' }]) await check(`schema: a failing provider is not probed at discovery and fails per call (${Object.keys(overrides)[0] ?? 'default'})`, async () => {
    mode = '401';
    const before = calls;
    const server = await startServer({ env: { ...env, ...overrides }, cwd: fixture, timeoutMs: 25000 });
    try {
      assert.equal(calls, before, 'discovery makes no provider call');
      assert.equal(server.tools.some(tool => tool.name === 'clasify'), !overrides.DISABLE_TOOLS);
      for (const name of ['localSearch', 'localFetch']) {
        const schema = server.tools.find(tool => tool.name === name)?.inputSchema.properties.queries.items;
        assert.ok(schema?.properties.classifiers, `${name} keeps classifiers`);
      }
      const row = successful({ json: (await server.call('localSearch', search)).sc });
      assert.equal(row.ranking?.status, 'fallback');
      assert.ok(calls > before, 'the call attempts the provider');
    } finally { server.close(); }
  });
  await check('schema: no usable semantic surface makes no startup provider call', async () => {
    for (const overrides of [
      { DISABLE_TOOLS: 'clasify', OCTOCODE_RANKING_ENABLED: 'false' },
      { OCTOCODE_BETA: 'false', OCTOCODE_RANKING_ENABLED: 'false' },
      { TOOLS_TO_RUN: 'ghGetHistoryItem' },
      { OCTOCODE_CLASSIFICATION_API: '' },
    ]) {
      const before = calls;
      const server = await startServer({ env: { ...env, ...overrides }, cwd: fixture, timeoutMs: 25000 });
      try {
        assert.equal(calls, before, 'no usable semantic surface means no probe');
        assert.ok(!server.tools.some(tool => tool.name === 'clasify'));
      } finally { server.close(); }
    }
  });
  for (const overrides of [{ DISABLE_TOOLS: 'clasify' }, { OCTOCODE_BETA: 'false' }]) await check(`hidden clasify (${Object.keys(overrides)[0]}): classifiers work, public calls and handoffs stay disabled`, async () => {
    const server = await startServer({ env: { ...env, ...overrides }, cwd: fixture, timeoutMs: 25000 });
    try {
      assert.ok(!server.tools.some(tool => tool.name === 'clasify'));
      const publicQuery = { state: { evidence: 'waiting request' }, questions: { q: { type: 'noul', instructions: 'Does the evidence mention a waiting request?' } } };
      const beforePublic = calls;
      const cliRejected = await cli('clasify', publicQuery, overrides);
      assert.notEqual(cliRejected.code, 0, 'CLI rejects hidden public clasify');
      assert.equal(cliRejected.json.errorCode, overrides.DISABLE_TOOLS ? 'toolUnavailable' : 'missingConfiguration', JSON.stringify(cliRejected.json));
      const mcpRejected = await server.raw('clasify', { queries: [publicQuery] });
      assert.ok(mcpRejected.isError || mcpRejected.sc?.errorCode, 'MCP rejects hidden public clasify');
      assert.equal(calls, beforePublic, 'rejected public calls do not send evidence');
      // Retrieval emits no clasify handoff on any surface (RFC: Scout/handoff flows removed).
      const plain = { ...search, classifiers: undefined, matchString: 'ordinary bookkeeping', pageSize: 5, extras: ['hints'], mainGoal: classifiers[0] };
      for (const result of [await cli('localSearch', plain), await cli('localSearch', plain, overrides), { json: (await server.call('localSearch', plain)).sc }]) {
        const row = successful(result);
        assert.equal(row.hints?.clasify, undefined);
        assert.equal(row.next?.clasify, undefined);
        assert.ok(!JSON.stringify(result.json).includes('"tool":"clasify"'), 'retrieval returns no clasify lead');
      }
      const beforeRank = calls;
      const cliRanked = successful(await cli('localSearch', search, overrides));
      const mcpRanked = successful({ json: (await server.call('localSearch', search)).sc });
      for (const row of [cliRanked, mcpRanked]) {
        assert.equal(row.ranking?.status, 'ranked');
        assert.ok(JSON.stringify(row).includes(marker));
      }
      assert.ok(calls > beforeRank, 'classifiers invoke the provider with public clasify hidden');
      return { tools: server.tools.length, discoveryChars: JSON.stringify(server.tools).length, instructionChars: server.init.instructions?.length ?? 0 };
    } finally { server.close(); }
  });
  for (const [label, query, tool] of [['search', search, 'localSearch'], ['fetch', fetch, 'localFetch']]) {
    await check(`${label}: gates make no provider calls`, async () => {
      for (const overrides of [{ OCTOCODE_RANKING_ENABLED: 'false' }, { OCTOCODE_CLASSIFICATION_API: '' }, { OCTOCODE_CLASSIFICATION_API: '   ' }, { OCTOCODE_CLASSIFICATION_API: undefined }, { DISABLE_TOOLS: 'clasify', OCTOCODE_RANKING_ENABLED: 'false' }]) {
        const before = calls;
        const row = successful(await cli(tool, query, overrides));
        assert.equal(calls, before);
        assert.equal(row.ranking?.status, 'skipped');
      }
      const { classifiers: omitted, ...plain } = query;
      assert.ok(omitted);
      const before = calls;
      assert.equal(successful(await cli(tool, plain)).ranking, undefined);
      assert.equal(calls, before);
    });
    await check(`${label}: promotion, complete evidence, fresh-process replay`, async () => {
      const baseline = await walk((tool, query) => cli(tool, query, { OCTOCODE_RANKING_ENABLED: 'false' }), tool, query);
      const firstLead = data(baseline.results[0]).next?.continueWindow ?? data(baseline.results[0]).next?.nextPage;
      assert.ok(!path.isAbsolute(firstLead.query.queries[0].path), 'response normalizes an absolute source path to its workspace-relative continuation');
      const before = calls;
      let firstCalls;
      const ranked = await walk(async (tool, query) => {
        const result = await cli(tool, query);
        if (firstCalls === undefined) { firstCalls = calls; assert.ok(calls > before); }
        else assert.equal(calls, firstCalls, 'a fresh CLI continuation must not classify again');
        return result;
      }, tool, query);
      assert.equal(data(ranked.results[0]).ranking.status, 'ranked');
      assert.ok(JSON.stringify(data(ranked.results[0])).includes(marker), 'first ranked page contains target evidence');
      fs.writeFileSync(path.join(RESULTS, `local-ranking-${label}-walk.json`), JSON.stringify({ baseline, ranked }, null, 2));
      assert.deepEqual([...ranked.rows].sort(), [...baseline.rows].sort(), 'all selected evidence survives exactly once');
      assert.equal(new Set(ranked.rows).size, ranked.rows.length, 'no duplicated source anchors');
      return { pages: ranked.results.length, providerCalls: firstCalls - before, evidenceRows: ranked.rows.length };
    });
    await check(`${label}: failure freezes baseline order`, async () => {
      const baseline = successful(await cli(tool, query, { OCTOCODE_RANKING_ENABLED: 'false' }));
      const attempts = [];
      for (const failure of ['401', '429', '500', 'malformed', 'timeout']) {
        mode = failure;
        const startedCalls = calls;
        const result = await cli(tool, query, failure === 'timeout' ? { OCTOCODE_RANKING_TIMEOUT_MS: '100' } : {});
        const row = successful(result);
        attempts.push({ failure, providerCalls: calls - startedCalls, reason: row.ranking?.reason });
        assert.equal(row.ranking?.status, 'fallback', failure);
        assert.deepEqual(tool === 'localFetch' ? sourceRows(row) : matchRows(row), tool === 'localFetch' ? sourceRows(baseline) : matchRows(baseline));
        const lead = row.next?.continueWindow ?? row.next?.nextPage;
        if (lead) {
          mode = 'score';
          const before = calls;
          successful(await cli(tool, lead.query.queries[0], failure === 'timeout' ? { OCTOCODE_RANKING_TIMEOUT_MS: '100' } : {}));
          assert.equal(calls, before, 'provider recovery cannot reorder a continuation');
        }
      }
      mode = 'score';
      return attempts;
    });
    await check(`${label}: malformed plan, changed classifiers or changed view reject replay`, async () => {
      const row = successful(await cli(tool, query));
      const lead = row.next?.continueWindow ?? row.next?.nextPage;
      assert.ok(lead);
      for (const change of [{ ranking: 'bad-plan' }, { classifiers: ['A different classifier'] }]) {
        const result = await cli(tool, { ...lead.query.queries[0], ...change });
        assert.equal(data(result)?.errorCode, 'staleSnapshot');
        assert.ok(data(result)?.next?.restart);
      }
      if (tool === 'localFetch') {
        const changedView = { ...lead.query.queries[0], fullContent: true };
        for (const field of ['offset', 'length', 'unit']) delete changedView[field];
        assert.equal(data(await cli(tool, changedView))?.errorCode, 'staleSnapshot');
      }
    });
  }
  await check('explicit sort and transformed fetch skip ranking', async () => {
    for (const [tool, query] of [['localSearch', { ...search, sort: 'path' }], ['localSearch', { ...search, reverse: true }], ['localSearch', { ...search, resultView: 'files' }], ['localSearch', { ...search, resultView: 'countMatches' }], ['localFetch', { ...fetch, unit: 'bytes' }], ['localFetch', { path: path.join(searchDir, '0.txt'), classifiers, fullContent: true }], ['localFetch', { path: docPath, classifiers, minify: 'standard' }]]) {
      const before = calls;
      const row = successful(await cli(tool, query));
      assert.equal(row.ranking?.status, 'skipped');
      assert.equal(calls, before);
    }
  });
  await check('empty selections disclose no candidates without provider calls', async () => {
    for (const [tool, query] of [['localSearch', { ...search, matchString: 'NO_MATCH_EXISTS' }], ['localFetch', { ...fetch, matchString: 'NO_MATCH_EXISTS' }]]) {
      const before = calls;
      const row = successful(await cli(tool, query));
      assert.equal(row.ranking.status, 'skipped');
      assert.equal(row.ranking.totalItems, 0);
      assert.equal(calls, before);
    }
  });
  await check('one candidate needs no classification to preserve its order', async () => {
    const oneDir = path.join(fixture, 'one-candidate');
    fs.mkdirSync(oneDir);
    const onePath = path.join(oneDir, 'note.txt');
    fs.writeFileSync(onePath, 'topic: one complete evidence unit.\n');
    for (const [tool, query] of [['localSearch', { path: oneDir, matchString: 'topic', classifiers }], ['localFetch', { path: onePath, classifiers }]]) {
      const before = calls;
      const row = successful(await cli(tool, query));
      assert.equal(row.ranking.status, 'skipped');
      assert.equal(row.ranking.reason, 'singleCandidate');
      assert.equal(calls, before);
    }
  });
  await check('candidate budget retains the complete unranked tail', async () => {
    const baseline = await walk((t, q) => cli(t, q, { OCTOCODE_RANKING_ENABLED: 'false' }), 'localSearch', search);
    const limited = await walk((t, q) => cli(t, q, { OCTOCODE_RANKING_MAX_CANDIDATES: '2' }), 'localSearch', search);
    assert.equal(data(limited.results[0]).ranking.status, 'partial');
    assert.equal(data(limited.results[0]).ranking.rankedItems, 2);
    assert.deepEqual(limited.rows.sort(), baseline.rows.sort());
  });
  await check('character budget bounds complete outgoing evidence and preserves the tail', async () => {
    const before = sentStates.length;
    const limited = await walk((t, q) => cli(t, q, { OCTOCODE_RANKING_MAX_CHARS: '1024' }), 'localSearch', search);
    const outgoingChars = sentStates.slice(before).reduce((sum, state) => sum + [...JSON.stringify(state)].length, 0);
    assert.ok(outgoingChars <= 1024);
    assert.equal(data(limited.results[0]).ranking.status, 'partial');
    const baseline = await walk((t, q) => cli(t, q, { OCTOCODE_RANKING_ENABLED: 'false' }), 'localSearch', search);
    assert.deepEqual(limited.rows.sort(), baseline.rows.sort());
  });
  await check('tied scores preserve original order across both pagination axes', async () => {
    mode = 'tie';
    const query = { ...search, pageSize: 2, matchPageSize: 2 };
    const baseline = await walk((t, q) => cli(t, q, { OCTOCODE_RANKING_ENABLED: 'false' }), 'localSearch', query);
    const ranked = await walk(cli, 'localSearch', query);
    const expectedCount = fs.readdirSync(searchDir).reduce((sum, file) => sum + fs.readFileSync(path.join(searchDir, file), 'utf8').split('\n').filter(line => line.includes('topic')).length, 0);
    assert.equal(baseline.rows.length, expectedCount, 'every fixture match is reached');
    assert.equal(new Set(baseline.rows).size, expectedCount, 'each original match occurs once');
    assert.deepEqual(ranked.rows, baseline.rows);
    fs.writeFileSync(path.join(RESULTS, 'local-ranking-tied-walk.json'), JSON.stringify({ expectedCount, baseline, ranked }, null, 2));
  });
  await check('fetch defaults and multiple classifiers survive continuation replay', async () => {
    const query = { path: docPath, classifiers: [...classifiers, 'Find bookkeeping background records'] };
    const ranked = await walk(cli, 'localFetch', query);
    const baseline = await walk((t, q) => cli(t, q, { OCTOCODE_RANKING_ENABLED: 'false' }), 'localFetch', query);
    assert.deepEqual(ranked.rows.sort(), baseline.rows.sort());
  });
  await check('missing plans and changed ranking settings reject replay', async () => {
    for (const [tool, query] of [['localSearch', search], ['localFetch', fetch]]) {
      const row = successful(await cli(tool, query));
      const lead = row.next?.continueWindow ?? row.next?.nextPage;
      const { ranking: omitted, ...withoutPlan } = lead.query.queries[0];
      assert.ok(omitted);
      assert.equal(data(await cli(tool, withoutPlan))?.errorCode, 'staleSnapshot');
      assert.equal(data(await cli(tool, lead.query.queries[0], { OCTOCODE_RANKING_MAX_CANDIDATES: '2' }))?.errorCode, 'staleSnapshot');
    }
  });
  await check('Unicode, CRLF, missing final newline and limited fetch preserve exact anchors', async () => {
    const edgePath = path.join(fixture, 'unicode.txt');
    const lines = Array.from({ length: 160 }, (_, i) => `Row ${i}: שלום 世界 🐙 ${'background '.repeat(8)}`);
    lines[135] = `${marker} בקשה מבוטלת before it starts.`;
    fs.writeFileSync(edgePath, lines.join('\r\n'));
    const query = { path: edgePath, classifiers, unit: 'lines', length: 17 };
    const baseline = await walk((t, q) => cli(t, q, { OCTOCODE_RANKING_ENABLED: 'false' }), 'localFetch', query);
    const ranked = await walk(cli, 'localFetch', query);
    assert.deepEqual(ranked.rows.sort(), baseline.rows.sort());
    assert.equal(new Set(ranked.rows).size, 160);
    const limited = await walk((t, q) => cli(t, q, { OCTOCODE_RANKING_MAX_CANDIDATES: '2' }), 'localFetch', query);
    assert.equal(data(limited.results[0]).ranking.status, 'partial');
    assert.deepEqual(limited.rows.sort(), baseline.rows.sort());
  });
  await check('streaming files disclose skipped ranking and continue without classification', async () => {
    const streamPath = path.join(fixture, 'stream.txt');
    fs.writeFileSync(streamPath, 'Large streaming source evidence.\n'.repeat(350000));
    const before = calls;
    const row = successful(await cli('localFetch', { path: streamPath, classifiers, unit: 'lines', length: 10 }));
    assert.equal(row.ranking.status, 'skipped');
    assert.equal(row.ranking.reason, 'streamingSource');
    const next = successful(await cli('localFetch', row.next.continueWindow.query.queries[0]));
    assert.equal(next.ranking.status, 'skipped');
    assert.equal(calls, before);
    assert.equal(sourceRows(row)[0].split('\t')[0], '1');
    assert.equal(sourceRows(next)[0].split('\t')[0], '11');
  });
  await check('disjoint fetch ranges retain source anchors after ranking', async () => {
    const query = { path: docPath, classifiers, ranges: ['5-35', '885-925'], unit: 'lines', length: 31 };
    const baseline = await walk((t, q) => cli(t, q, { OCTOCODE_RANKING_ENABLED: 'false' }), 'localFetch', query);
    const ranked = await walk(cli, 'localFetch', query);
    assert.deepEqual(ranked.rows.sort(), baseline.rows.sort());
    assert.ok(JSON.stringify(data(ranked.results[0])).includes(marker));
  });
  await check('provider receives sanitized search and fetch evidence', async () => {
    const secretDir = path.join(fixture, 'secrets');
    fs.mkdirSync(secretDir);
    const secretPath = path.join(secretDir, 'example.txt');
    const password = 'hunter2secretpw';
    const body = 'MIIEpQIBAAKCAQEAinteriorKeyBodyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    fs.writeFileSync(secretPath, `topic postgres://admin:${password}@db.example.com/app\n-----BEGIN RSA PRIVATE KEY-----\n${`${body}\n`.repeat(100)}-----END RSA PRIVATE KEY-----\n`);
    fs.writeFileSync(path.join(secretDir, 'public.txt'), 'topic public documentation.\n');
    const before = sentStates.length;
    successful(await cli('localSearch', { path: secretDir, matchString: 'topic', classifiers }));
    successful(await cli('localFetch', { path: secretPath, classifiers, unit: 'lines', length: 10 }));
    const outgoing = JSON.stringify(sentStates.slice(before));
    assert.ok(sentStates.length > before);
    assert.ok(!outgoing.includes(password));
    assert.ok(!outgoing.includes('interiorKeyBody'));
  });
  await check('provider paths use workspace-relative identities for search and fetch', async () => {
    for (const [tool, query] of [['localSearch', search], ['localFetch', fetch]]) {
      const before = sentStates.length;
      successful(await cli(tool, query, { OCTOCODE_RANKING_MAX_CANDIDATES: '2' }));
      const states = sentStates.slice(before);
      assert.equal(states.length, 2);
      for (const state of states) {
        assert.equal(path.isAbsolute(state.path), false, `${tool} sent an absolute provider path`);
        assert.ok(!JSON.stringify(state).includes(fixture), 'local workspace prefix stays private');
      }
    }
  });
  await check('clasify source judges one captured selection with no ranking pass and a pinned read lead', async () => {
    const before = calls;
    const start = sentQuestions.length;
    const result = await cli('clasify', {
      source: { tool: 'localFetch', query: { path: docPath, ranges: ['880-920'] } },
      questions: { answer: { type: 'noul', instructions: 'Does this evidence explain cancellation of a waiting request?' } },
    });
    assert.equal(result.code, 0, JSON.stringify(result.json));
    const row = result.json.queries[0];
    assert.equal(row.answers.answer.type, 'noul');
    assert.equal(row.answers.answer.noul, 0.99, 'the captured selection includes the target line');
    assert.equal(calls - before, 1, 'one provider request for one selected state');
    assert.deepEqual(sentQuestions.slice(start).flat().map(question => question.type), ['noul'], 'no ranking question is sent');
    assert.ok(!JSON.stringify(row).includes('Cancelling a waiting request'), 'no source body is returned');
    const read = row.hints.read;
    assert.equal(read.tool, 'localFetch');
    const exact = read.query.queries[0];
    assert.deepEqual(exact.ranges, ['880-920']);
    assert.equal(exact.minify, 'none');
    assert.ok(exact.snapshot, 'the lead pins the captured snapshot');
    assert.equal(exact.classifiers, undefined, 'source verification does not add a ranking stage');
    assert.equal(exact.ranking, undefined, 'source verification carries no ranking plan');
    const lines = sourceRows(successful(await cli(read.tool, exact)));
    assert.equal(lines.length, 41);
    assert.ok(lines.some(line => line.includes(marker)));
    assert.equal(calls - before, 1, 'verification makes no provider call');
  });
  await check('nested classifiers in a clasify source and legacy inputs are rejected before provider access', async () => {
    const before = calls;
    const nested = await cli('clasify', {
      source: { tool: 'localFetch', query: { path: docPath, ranges: ['1-10'], classifiers } },
      questions: { answer: { type: 'noul', instructions: 'Is cancellation explained?' } },
    });
    assert.equal(nested.json.errorCode, 'invalidInput', JSON.stringify(nested.json));
    const legacy = await cli('clasify', {
      resources: [{ id: 'document', tool: 'localFetch', query: { path: docPath } }],
      questions: [{ id: 'answer', type: 'yesno', ask: 'Is cancellation explained?' }],
    });
    assert.deepEqual(legacy.json, {
      error: 'queries.0.resources: Unknown field: resources',
      details: ['queries.0.state: Missing required field: state', 'queries.0.questions: Expected object'],
      errorCode: 'invalidInput',
    });
    for (const tool of ['localSearch', 'localFetch']) {
      const { classifiers: omitted, ...plain } = tool === 'localSearch' ? search : fetch;
      assert.ok(omitted);
      const result = await cli(tool, { ...plain, goals: classifiers });
      assert.deepEqual(result.json, { error: 'Remove unknown field(s) from queries[0]: goals', errorCode: 'invalidInput' });
    }
    assert.equal(calls, before, 'rejected inputs send no evidence');
  });
  await check('ranked fetch pages carry no verification reread hint and no lead inherits a ranking plan', async () => {
    const pages = await walk(cli, 'localFetch', { ...fetch, extras: ['hints'] });
    assert.equal(data(pages.results[0]).ranking.status, 'ranked');
    for (const result of pages.results) {
      const row = data(result);
      assert.equal(row.hints?.readBlock, undefined);
      for (const [name, lead] of Object.entries(row.hints ?? {})) {
        if (name === 'text') continue;
        for (const query of lead.query?.queries ?? []) assert.equal(query.ranking, undefined, `hints.${name} inherits no ranking plan`);
      }
    }
  });
  await check('oversized indivisible line stays available without provider clipping', async () => {
    const giantPath = path.join(fixture, 'giant.txt');
    fs.writeFileSync(giantPath, `${marker} ${'x'.repeat(9000)}\n`);
    const query = { path: giantPath, classifiers, unit: 'lines', length: 1 };
    const before = calls;
    const ranked = successful(await cli('localFetch', query));
    const baseline = successful(await cli('localFetch', query, { OCTOCODE_RANKING_ENABLED: 'false' }));
    assert.equal(ranked.ranking.status, 'skipped');
    assert.equal(calls, before);
    assert.deepEqual(sourceRows(ranked), sourceRows(baseline));
    assert.ok(ranked.content.includes('x'.repeat(9000)));
  });
  await check('source mutation rejects a ranked continuation', async () => {
    const row = successful(await cli('localFetch', fetch));
    fs.appendFileSync(docPath, 'A new source line.\n');
    const result = await cli('localFetch', row.next.continueWindow.query.queries[0]);
    assert.equal(data(result)?.errorCode, 'staleSnapshot');
    assert.ok(data(result)?.next?.restart);
    fs.writeFileSync(docPath, `${docLines.join('\n')}\n`);
  });
  await check('same bytes at a different source path reject a ranking plan', async () => {
    const copyPath = path.join(fixture, 'source with spaces 🐙.txt');
    fs.copyFileSync(docPath, copyPath);
    const row = successful(await cli('localFetch', fetch));
    const continued = row.next.continueWindow.query.queries[0];
    const result = await cli('localFetch', { ...continued, path: copyPath });
    assert.equal(data(result)?.errorCode, 'staleSnapshot');
  });
  await check('ranking reports provider usage through existing opt-in statistics', async () => {
    const before = calls;
    const row = successful(await cli('localSearch', search, { OCTOCODE_STORAGE_MODE: 'persistent', OCTOCODE_ENABLE_STATS: 'true' }));
    assert.equal(row.ranking.status, 'ranked');
    const usage = JSON.parse(fs.readFileSync(path.join(isolated.OCTOCODE_HOME, 'stats.json'), 'utf8')).stats.clasify;
    assert.equal(usage.calls, calls - before);
    assert.equal(usage.input_tokens, 10 * usage.calls);
    assert.equal(usage.output_tokens, 2 * usage.calls);
    assert.equal(usage.unknown_usage_calls, 0);
  });
  await check('MCP and CLI rank the same evidence and replay without classification', async () => {
    mode = 'score';
    mcp = await startServer({ env, cwd: fixture, timeoutMs: 25000 });
    const callMcp = async (tool, query) => {
      const result = await mcp.call(tool, query);
      return { json: result.sc, chars: result.text.length, ms: result.ms };
    };
    for (const [tool, query] of [['localSearch', search], ['localFetch', fetch]]) {
      const baseline = await walk(cli, tool, query);
      let firstCalls;
      const throughMcp = await walk(async (tool, query) => {
        const result = await callMcp(tool, query);
        if (firstCalls === undefined) firstCalls = calls;
        else assert.equal(calls, firstCalls);
        return result;
      }, tool, query);
      assert.deepEqual(throughMcp.rows, baseline.rows);
    }
  });
} finally {
  mcp?.close();
  mock.closeAllConnections();
  await new Promise(resolve => mock.close(resolve));
  fs.rmSync(fixture, { recursive: true, force: true });
  fs.rmSync(isolated.OCTOCODE_HOME, { recursive: true, force: true });
}
fs.mkdirSync(RESULTS, { recursive: true });
fs.writeFileSync(path.join(RESULTS, 'local-ranking.json'), `${JSON.stringify({ checks, providerCalls: calls, failed: checks.filter(c => !c.passed).length }, null, 2)}\n`);
console.log(`${checks.filter(c => c.passed).length}/${checks.length} ranking acceptance checks passed`);
if (checks.some(c => !c.passed)) process.exitCode = 1;
