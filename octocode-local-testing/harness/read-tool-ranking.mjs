// All thirteen read tools: contract, evidence, scope and pagination acceptance.
// No live provider: HTTP(S) is blocked except for the shared loopback fixture.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { CASES, READ_TOOLS, materialize } from './read-tool-ranking/cases.mjs';
import { ROOT, contract, dataOf, evidence, fieldsInEveryBranch, setup, stable, startServer, success, walk } from './read-tool-ranking/support.mjs';

const require = createRequire(path.join(ROOT, 'package.json'));
const Ajv2020 = require('ajv/dist/2020').default;
const ajv = new Ajv2020({ strict: false, allErrors: false, validateFormats: false });
const validators = new Map(contract.tools.map(tool => [tool.name, ajv.compile(tool.outputSchema)]));
const schemasOnly = process.argv.includes('--schemas-only');
const selected = process.argv.slice(2).find(arg => !arg.startsWith('--'))?.split(',');
const cases = selected ? CASES.filter(row => selected.includes(row.tool)) : CASES;
assert.equal(READ_TOOLS.length, 13);
assert.equal(new Set(READ_TOOLS).size, 13);
assert.deepEqual(CASES.filter(row => row.scope).map(row => row.tool).sort(),
  ['ghGetFileContent', 'ghSearchCode', 'localFetch', 'localSearch']);
if (selected) assert.deepEqual([...cases.map(row => row.tool)].sort(), [...selected].sort(), 'unknown tool selection');
const ctx = await setup();
const checks = [], tools = [], raw = [], schemas = [];
const output = path.join(ROOT, 'octocode-local-testing/results/read-tool-ranking', ...(schemasOnly ? ['schema-recheck'] : []));
fs.mkdirSync(output, { recursive: true });
let mcp;

async function check(tool, name, run) {
  const before = ctx.calls(), started = performance.now();
  try {
    const detail = await run();
    checks.push({ tool, name, status: detail?.skip ? 'SKIP' : 'PASS', detail, providerCalls: ctx.calls() - before, ms: performance.now() - started });
    console.log(`${detail?.skip ? 'SKIP' : 'PASS'} ${tool}: ${name}${detail?.skip ? ` — ${detail.skip}` : ''}`);
    return detail;
  } catch (error) {
    checks.push({ tool, name, status: 'FAIL', error: error.stack, providerCalls: ctx.calls() - before, ms: performance.now() - started });
    console.log(`FAIL ${tool}: ${name} — ${error.message.slice(0, 400)}`);
  } finally { ctx.state.mode = 'score'; }
}
const ordinary = { OCTOCODE_RANKING_ENABLED: 'false' };
const sorted = rows => [...rows].sort();
const expectedItems = { localFetch: 80, localSearch: 5, structureSearch: 5, astSearch: 8,
  ghSearchRepo: 3, ghSearchCode: 5, ghGetFileContent: 80, ghSearchHistory: 2, artifactSearch: 3 };
function assertRankingFields(schema, spec, shown, opaque = shown) {
  const branches = schema.oneOf ?? schema.anyOf ?? [schema];
  for (const branch of branches) {
    const eligible = spec.scope !== null;
    assert.equal(fieldsInEveryBranch(branch, 'goals'), shown && eligible, `${spec.tool} goals on ${branch.properties?.operation?.const ?? 'query'}`);
    assert.equal(fieldsInEveryBranch(branch, 'ranking'), opaque && eligible, `${spec.tool} ranking on ${branch.properties?.operation?.const ?? 'query'}`);
  }
}
function valid(spec, run) {
  for (const response of run.responses) {
    const validate = validators.get(spec.tool);
    assert.ok(validate(response.json), `${spec.tool} output: ${JSON.stringify(validate.errors)}`);
  }
}
function equalEvidence(left, right, message) {
  assert.deepEqual(sorted(left.rows), sorted(right.rows), message);
  assert.deepEqual([...new Set(left.responses.map(row => row.json.root))], [...new Set(right.responses.map(row => row.json.root))], 'source roots agree');
}
function receipt(spec, run) {
  for (const response of run.responses) {
    const rank = success(response).ranking;
    assert.ok(rank && typeof rank.status === 'string', 'goals disclose a ranking receipt');
    if (rank.status === 'skipped') assert.ok(rank.reason, 'skip has a reason');
    else assert.equal(rank.scope, spec.scope, 'receipt names the actual candidate scope');
  }
}

try {
  for (const [label, overrides, shown] of [
    ['enabled', {}, true], ['disabled', ordinary, false],
    ['missing provider key', { OCTOCODE_CLASSIFICATION_API: '' }, false],
    ['public clasify hidden', { DISABLE_TOOLS: 'clasify' }, true],
    ['beta off', { OCTOCODE_BETA: 'false' }, true],
  ]) {
    await check('all13', `CLI/MCP schema gating: ${label}`, async () => {
      const server = await startServer({ env: { ...ctx.env, ...overrides }, cwd: ctx.fixture, timeoutMs: 60000 });
      try {
        schemas.push({ label, surface: 'mcp.tools/list', payload: { tools: server.tools },
          rawResponse: `${JSON.stringify({ tools: server.tools })}\n` });
        for (const spec of cases) {
          const tool = server.tools.find(row => row.name === spec.tool);
          const cliOnly = contract.tools.find(row => row.name === spec.tool).cliOnly;
          if (cliOnly) assert.equal(tool, undefined, `${spec.tool} remains CLI-only`);
          else {
            assert.ok(tool, `${spec.tool} is exposed`);
            assertRankingFields(tool.inputSchema.properties.queries.items, spec, shown, false);
          }
          const full = await ctx.cliArgs(['schema', spec.tool, '--view', 'full'], overrides);
          const schema = full.json.querySchema;
          schemas.push({ label, tool: spec.tool, surface: 'cli.schema.full', rawResponse: full.rawResponse, payload: full.json });
          assert.ok(schema, `${spec.tool} CLI schema`);
          assertRankingFields(schema, spec, shown);
        }
        for (const excluded of ['clasify', 'astRewrite', 'ghCloneRepo']) {
          const full = await ctx.cliArgs(['schema', excluded, '--view', 'full'], overrides);
          if (full.json.querySchema) assert.equal(fieldsInEveryBranch(full.json.querySchema, 'goals'), false, `${excluded} stays outside ranking`);
        }
        return { tools: cases.map(row => row.tool), shown };
      } finally { server.close(); }
    });
  }
  await check('all13', 'failed MCP provider probe hides optional fields', async () => {
    ctx.state.mode = '401';
    const server = await startServer({ env: ctx.env, cwd: ctx.fixture, timeoutMs: 60000 });
    try {
      assert.ok(!server.tools.some(row => row.name === 'clasify'));
      for (const spec of cases.filter(spec => !contract.tools.find(row => row.name === spec.tool).cliOnly)) {
        const schema = server.tools.find(row => row.name === spec.tool)?.inputSchema.properties.queries.items;
        assert.ok(schema);
        assert.equal(fieldsInEveryBranch(schema, 'goals'), false);
      }
    } finally { server.close(); }
  });
  mcp = await startServer({ env: ctx.env, cwd: ctx.fixture, timeoutMs: 60000 });
  for (const spec of schemasOnly ? [] : cases) {
    const plain = materialize(spec.query, ctx), ranked = { ...plain, goals: spec.goals };
    if (spec.scope === null) {
      await check(spec.tool, 'unsupported tools reject ranking controls and preserve complete ordinary evidence', async () => {
        const before = ctx.calls();
        const baseline = await walk(ctx, spec, plain, { overrides: ordinary });
        const enabled = await walk(ctx, spec, plain);
        for (const run of [baseline, enabled]) valid(spec, run);
        assert.ok(baseline.rows.length);
        if (expectedItems[spec.tool]) assert.equal(baseline.rows.length, expectedItems[spec.tool], 'ordinary walk covers the independent fixture inventory');
        assert.deepEqual(enabled.rows, baseline.rows, 'feature availability cannot alter ordinary evidence or order');
        assert.ok(enabled.responses.every(response => dataOf(response).ranking === undefined));
        const cliOnly = contract.tools.find(row => row.name === spec.tool).cliOnly;
        if (!cliOnly) {
          const throughMcp = await walk(ctx, spec, plain, { surface: 'mcp', mcp });
          valid(spec, throughMcp);
          assert.deepEqual(throughMcp.rows, baseline.rows);
          raw.push({ tool: spec.tool, mcp: throughMcp });
        }
        for (const field of [{ goals: spec.goals }, { ranking: 'unsupported-plan' }]) {
          const rejected = await ctx.cli(spec.tool, { ...plain, ...field });
          assert.equal(rejected.code, 2, 'CLI rejects unsupported controls');
          assert.equal(rejected.json.errorCode ?? dataOf(rejected)?.errorCode, 'invalidInput');
          if (!cliOnly) {
            const rejectedMcp = await mcp.raw(spec.tool, { queries: [{ ...plain, ...field }] });
            assert.ok(rejectedMcp.isError || rejectedMcp.sc?.errorCode || rejectedMcp.sc?.results?.some(row => row.status === 'error'), 'MCP rejects unsupported controls');
          }
        }
        assert.equal(ctx.calls(), before, 'unsupported routes never classify');
        raw.push({ tool: spec.tool, baseline, enabled });
        tools.push({ tool: spec.tool, scope: null, status: 'unsupported', pages: enabled.responses.length, evidenceItems: enabled.rows.length, providerCalls: 0 });
      });
      await check(spec.tool, 'other operations and nested clasify resources reject ranking controls', async () => {
        const variants = [spec.query, spec.control, ...(spec.protected ?? []),
          ...(spec.unsupported ?? []).map(row => row.query)];
        for (const variant of variants) {
          const query = materialize(variant, ctx), before = ctx.calls();
          // The ordinary route stays available even for operations that previously skipped ranking.
          success(await ctx.cli(spec.tool, query));
          for (const field of [{ goals: spec.goals }, { ranking: 'unsupported-plan' }]) {
            const rejected = await ctx.cli(spec.tool, { ...query, ...field });
            assert.equal(rejected.code, 2);
            assert.equal(rejected.json.errorCode ?? dataOf(rejected)?.errorCode, 'invalidInput');
            const resource = { resources: [{ id: 'source', tool: spec.tool, query: { ...query, ...field } }],
              questions: [{ id: 'answer', type: 'yesno', ask: 'Does the evidence explain greeting behavior?' }] };
            const nested = await ctx.cli('clasify', resource);
            assert.equal(nested.code, 2, 'nested queries cannot reintroduce unsupported controls');
            const nestedMcp = await mcp.raw('clasify', { queries: [resource] });
            assert.equal(nestedMcp.isError, true);
            const payloads = [nested.json];
            if (contract.tools.find(row => row.name === spec.tool).cliOnly) {
              assert.equal(nestedMcp.sc?.errorCode, 'invalidInput');
              assert.ok(nestedMcp.sc.error.includes(`Context tool ${spec.tool} is disabled`), 'MCP refuses CLI-only resources before their query is executed');
            } else payloads.push(nestedMcp.sc);
            for (const payload of payloads) {
              const rejectedResource = payload.queries?.[0]?.resources?.[0];
              assert.equal(rejectedResource?.coverage?.state, 'error');
              assert.equal(rejectedResource?.error?.errorCode, 'invalidClassificationContext');
              assert.ok(rejectedResource.error.error.includes(`Unknown field: ${Object.keys(field)[0]}`), 'the unsupported ranking field causes rejection');
            }
          }
          assert.equal(ctx.calls(), before, 'invalid controls cannot spend provider work');
        }
      });
      if (['structureSearch', 'astSearch', 'lspSearch'].includes(spec.tool)) await check(spec.tool, 'all ordinary pages preserve evidence without ranking', async () => {
        const baseline = await walk(ctx, spec, plain);
        const run = await walk(ctx, spec, { ...plain, pageSize: 3 });
        assert.ok(run.responses.length > 1, 'fixture spans multiple pages');
        assert.equal(run.providerCalls, 0);
        assert.ok(run.responses.every(response => dataOf(response).ranking === undefined));
        equalEvidence(run, baseline, 'pagination retains all original evidence');
      });
      continue;
    }
    let baseline, disabled, enabled;
    await check(spec.tool, 'no-goals / disabled / enabled preserve complete evidence', async () => {
      const before = ctx.calls();
      baseline = await walk(ctx, spec, plain);
      disabled = await walk(ctx, spec, ranked, { overrides: ordinary });
      assert.equal(ctx.calls(), before, 'ordinary and disabled routes never classify');
      assert.ok(baseline.rows.length, 'fixture contains evidence');
      const expected = expectedItems[spec.tool];
      if (expected) assert.equal(baseline.rows.length, expected, 'ordinary walk covers the independent fixture inventory');
      assert.ok(baseline.responses.every(response => dataOf(response).ranking === undefined), 'no-goals output remains ordinary');
      enabled = await walk(ctx, spec, ranked);
      for (const run of [baseline, disabled, enabled]) valid(spec, run);
      equalEvidence(disabled, baseline, 'disabled receipt cannot change evidence');
      equalEvidence(enabled, baseline, 'every original evidence item and payload remains exactly once');
      receipt(spec, enabled);
      if (spec.scope === 'selectedView') assert.ok(enabled.provider.slice(1).every(calls => calls === 0), 'same candidate view replays without classification');
      if (spec.scope === 'providerPage') enabled.responses.forEach((response, index) => {
        const items = dataOf(response)[spec.kind];
        if (Array.isArray(items) && items.length > 1) assert.ok(enabled.provider[index] > 0, 'each new multi-candidate provider page receives its own classification');
      });
      const first = dataOf(enabled.responses[0]).ranking;
      const detail = { scope: first.scope, status: first.status, reason: first.reason, pages: enabled.responses.length, evidenceItems: enabled.rows.length, providerCalls: enabled.providerCalls };
      tools.push({ tool: spec.tool, ...detail });
      raw.push({ tool: spec.tool, baseline, disabled, enabled });
      return first.status === 'skipped' && spec.scope ? { ...detail, skip: first.reason } : detail;
    });
    if (!baseline || !enabled) continue;
    await check(spec.tool, 'fresh MCP agrees on evidence and order', async () => {
      if (contract.tools.find(row => row.name === spec.tool).cliOnly) return { skip: 'CLI-only tool: MCP absence is asserted by every discovery gate.' };
      const throughMcp = await walk(ctx, spec, ranked, { surface: 'mcp', mcp });
      valid(spec, throughMcp);
      assert.deepEqual(throughMcp.rows, enabled.rows, 'MCP and CLI order the same complete evidence');
      receipt(spec, throughMcp);
      raw.push({ tool: spec.tool, mcp: throughMcp });
    });
    for (const overrides of [{ DISABLE_TOOLS: 'clasify' }, { OCTOCODE_BETA: 'false' }]) await check(spec.tool, `hidden public clasify (${Object.keys(overrides)[0]}) preserves ranked evidence and replay`, async () => {
      const hidden = await walk(ctx, spec, ranked, { overrides });
      valid(spec, hidden);
      assert.deepEqual(hidden.rows, enabled.rows, 'tool visibility does not change ranking or evidence');
      receipt(spec, hidden);
      assert.equal(hidden.providerCalls, enabled.providerCalls, 'hidden public tool leaves provider work unchanged');
      if (spec.scope === 'selectedView') assert.ok(hidden.provider.slice(1).every(calls => calls === 0), 'saved ranking replays without provider work');
    });
    await check(spec.tool, 'availability gates make zero provider calls', async () => {
      for (const overrides of [ordinary, { OCTOCODE_CLASSIFICATION_API: '' }, { ...ordinary, DISABLE_TOOLS: 'clasify' }]) {
        const before = ctx.calls();
        const output = success(await ctx.cli(spec.tool, ranked, overrides));
        assert.equal(ctx.calls(), before);
        assert.equal(output.ranking.status, 'skipped');
        assert.deepEqual(evidence(spec, output), evidence(spec, dataOf(baseline.responses[0])));
      }
    });
    await check(spec.tool, 'ordinary-route control retains evidence without goals', async () => {
      const before = ctx.calls();
      const control = materialize(spec.control, ctx);
      const run = await walk(ctx, spec, control);
      valid(spec, run);
      assert.ok(run.rows.length, 'ordinary control contains evidence');
      assert.equal(ctx.calls(), before);
      raw.push({ tool: spec.tool, control: run });
      return { pages: run.responses.length, evidenceItems: run.rows.length };
    });
    if (spec.protected?.length) await check(spec.tool, 'protected operations skip with zero provider calls', async () => {
      for (const protectedQuery of spec.protected) {
        const query = materialize(protectedQuery, ctx);
        const expected = success(await ctx.cli(spec.tool, query));
        const before = ctx.calls();
        const actual = success(await ctx.cli(spec.tool, { ...query, goals: spec.goals }));
        assert.equal(ctx.calls(), before);
        assert.equal(actual.ranking.status, 'skipped');
        const { ranking: ignored, ...payload } = actual;
        const { next: expectedNext, hints: expectedHints, snapshot: expectedSnapshot, ...expectedPayload } = expected;
        const { next, hints, snapshot, ...actualPayload } = payload;
        assert.deepEqual(actualPayload, expectedPayload, 'skip does not alter evidence');
      }
    });
    if (spec.tool === 'ghSearchCode') await check(spec.tool, 'invalid earlier batch row cannot shift the ranked query', async () => {
      const before = ctx.calls();
      const result = await ctx.cliArgs([spec.tool, JSON.stringify({ queries: [{ owner: 123 }, ranked] }), '--json']);
      const invalid = result.json.results?.find(row => row.index === 0);
      const admitted = result.json.results?.find(row => row.index === 1);
      assert.equal(invalid?.status, 'error', 'invalid first row is rejected independently');
      assert.ok(admitted?.data, 'valid second row executes');
      assert.equal(admitted.data.ranking.status, dataOf(enabled.responses[0]).ranking.status);
      assert.ok(ctx.calls() > before, 'the admitted query receives classification');
      assert.deepEqual(evidence(spec, admitted.data), evidence(spec, dataOf(enabled.responses[0])), 'ranking uses the admitted query and evidence');
      raw.push({ tool: spec.tool, admissionControl: result });
    });
    if (enabled.providerCalls === 0) continue;
    await check(spec.tool, 'opaque continuation plans reject changed goals and malformed plans', async () => {
      const lead = enabled.edges.find(edge => edge.query?.queries?.[0]?.ranking);
      if (!lead) return { skip: 'No same-view ranking continuation is exposed by this complete/provider-page fixture.' };
      for (const change of [{ goals: ['A changed evidence target'] }, { ranking: 'malformed-plan' }]) {
        const before = ctx.calls();
        const replay = await ctx.cli(spec.tool, { ...lead.query.queries[0], ...change });
        assert.equal(dataOf(replay)?.errorCode, 'staleSnapshot', JSON.stringify(replay.json));
        assert.equal(ctx.calls(), before, 'invalid replay cannot spend provider work');
      }
    });
    await check(spec.tool, 'stable ties preserve ordinary order', async () => {
      ctx.state.mode = 'tie';
      const tied = await walk(ctx, spec, ranked);
      assert.deepEqual(tied.rows, baseline.rows);
    });
    await check(spec.tool, 'candidate budget keeps the complete unranked tail', async () => {
      const limited = await walk(ctx, spec, ranked, { overrides: { OCTOCODE_RANKING_MAX_CANDIDATES: '2' } });
      equalEvidence(limited, baseline, 'budget retains every item');
      receipt(spec, limited);
    });
    await check(spec.tool, 'provider failures preserve baseline evidence and order', async () => {
      const attempts = [];
      for (const failure of ['401', '429', '500', 'malformed', 'timeout']) {
        ctx.state.mode = failure;
        const failed = await walk(ctx, spec, ranked, { overrides: failure === 'timeout' ? { OCTOCODE_RANKING_TIMEOUT_MS: '100' } : {} });
        assert.deepEqual(failed.rows, baseline.rows, `${failure} keeps baseline order`);
        assert.ok(failed.responses.some(response => dataOf(response).ranking.status === 'fallback'), `${failure} is disclosed`);
        attempts.push({ failure, providerCalls: failed.providerCalls });
      }
      return attempts;
    });
    await check(spec.tool, 'ranking does not add upstream hydration', async () => {
      const upstream = start => ctx.mock.requests.slice(start).filter(request => !request.includes('/v1/systemone')).sort();
      let start = ctx.mock.requests.length;
      await ctx.cli(spec.tool, plain);
      const ordinaryRequests = upstream(start);
      start = ctx.mock.requests.length;
      const packets = ctx.mock.classificationRequests.length;
      await ctx.cli(spec.tool, ranked);
      assert.deepEqual(upstream(start), ordinaryRequests, 'ranking retrieves no extra pages, sections, or file bodies');
      for (const packet of ctx.mock.classificationRequests.slice(packets)) {
        assert.ok(!JSON.stringify(packet.state).includes('BODY_ONLY_SENTINEL'));
        assert.ok(!JSON.stringify(packet.state).includes(ctx.fixture), 'absolute local workspace prefix stays private');
        const inspect = node => {
          if (!node || typeof node !== 'object') return;
          for (const [key, value] of Object.entries(node)) {
            assert.ok(!['next', 'hints', 'ranking', 'snapshot'].includes(key), `provider evidence contains routing metadata: ${key}`);
            inspect(value);
          }
        };
        inspect(packet.state);
      }
    });
    if (spec.narrow) await check(spec.tool, 'narrow fields never hydrate hidden bodies', async () => {
      const query = materialize(spec.narrow, ctx), before = ctx.mock.classificationRequests.length;
      await ctx.cli(spec.tool, { ...query, goals: spec.goals });
      for (const packet of ctx.mock.classificationRequests.slice(before)) {
        const state = JSON.stringify(packet.state);
        assert.ok(!state.includes('return this.prefix'), 'path-only selection gains no source body');
        assert.ok(!state.includes('BODY_ONLY_SENTINEL'));
      }
    });
  }
} finally {
  mcp?.close();
  fs.writeFileSync(path.join(output, 'raw.json'), JSON.stringify({ responses: raw, cliTrace: ctx.trace, providerPackets: ctx.mock.classificationRequests, upstream: ctx.mock.requests }, null, 2));
  fs.writeFileSync(path.join(output, 'schemas.json'), JSON.stringify(schemas, null, 2));
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ at: new Date().toISOString(), contract: contract.fingerprint,
    expectedTools: READ_TOOLS, schemasOnly, selectedTools: cases.map(row => row.tool), tools, checks,
    failed: checks.filter(row => row.status === 'FAIL').length, skipped: checks.filter(row => row.status === 'SKIP').length }, null, 2));
  await ctx.close();
}
const failed = checks.filter(row => row.status === 'FAIL');
console.log(`${checks.length - failed.length}/${checks.length} read-tool ranking checks passed or explicitly skipped`);
if (failed.length) process.exitCode = 1;
