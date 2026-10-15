// Hermetic classification cache, retry, and ranking replay checks on built hosts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NativeRuntime } from '../../packages/octocode-native/js/runtime.js';
import { checks, collect, rowData, writeResults } from './mcp-client.mjs';
import { answer, pages, setup, stable, startServer, success } from './read-tool-ranking/support.mjs';

const { check, summary } = checks('classification-retry');
let mode = 'success';
let remainingFailures = 0;
const ctx = await setup({ label: 'cache-retry', classificationResponder: async request => {
  if (['slow', 'unauthorized-slow'].includes(mode)) await new Promise(resolve => setTimeout(resolve, 150));
  if (['unauthorized', 'unauthorized-slow'].includes(mode)) return { status: 401, body: { error: 'fixture authentication failure' } };
  if (mode === 'malformed') return { body: '{invalid' };
  if (mode === 'throttle' && remainingFailures-- > 0) return { status: 429, body: { error: 'fixture throttle' } };
  const body = answer(request);
  for (const value of Object.values(body.answers)) {
    if (value.type === 'noul') value.noul = request.state?.x === null ? 0.9 : 0.1;
  }
  return { body };
} });
// Session stats (persistent storage only) are the accounting surface for
// provider requests: a row carries the provider's usage, not request counts.
const env = { ...ctx.env, MAX_RETRIES: '1', OCTOCODE_STORAGE_MODE: 'persistent', OCTOCODE_ENABLE_STATS: 'true' };
const statsFile = path.join(env.OCTOCODE_HOME, 'stats.json');
const usageTotals = () => {
  try { return JSON.parse(fs.readFileSync(statsFile, 'utf8')).stats?.clasify ?? {}; } catch { return {}; }
};
const usageSince = before => {
  const now = usageTotals();
  return Object.fromEntries(['calls', 'known_usage_calls', 'unknown_usage_calls', 'input_tokens', 'output_tokens']
    .map(key => [key, (now[key] ?? 0) - (before[key] ?? 0)]));
};
let client;
const traces = [];
const query = (state, instructions = 'Does the evidence contain an explicit null field?') => ({
  state,
  questions: { answer: { type: 'noul', instructions } },
});
const verdicts = result => collect(result.json ?? result.sc, value => value.type === 'noul' && typeof value.noul === 'number').map(value => value.noul);
const row = result => (result.json ?? result.sc)?.queries?.[0];
const errors = result => collect(result.json ?? result.sc, value => typeof value.errorCode === 'string').map(value => value.errorCode);
const call = async (input, label) => {
  const before = ctx.calls();
  const result = await client.call('clasify', input, {}, label);
  const calls = ctx.calls() - before;
  traces.push({ label, result, providerCalls: calls });
  return { result, calls };
};

try {
  client = await startServer({ env, cwd: ctx.fixture });
  assert.ok(client.tools.some(tool => tool.name === 'clasify'), 'clasify must be available');

  const first = await call(query({ stable: 'evidence', x: null }), 'explicit null');
  check('cold judgment sends one request and returns its answer', first.calls === 1 && verdicts(first.result).includes(0.9));
  const same = await call(query({ stable: 'evidence', x: null }), 'same exact evidence');
  check('warm judgment sends no request and marks the saved answer as replayed', same.calls === 0 && row(same.result)?.replayed === true && row(first.result)?.replayed === undefined && verdicts(same.result).includes(0.9));
  const missing = await call(query({ stable: 'evidence' }), 'missing field');
  check('removing an explicit null invalidates the judgment', missing.calls === 1 && verdicts(missing.result).includes(0.1), JSON.stringify({ calls: missing.calls, errors: errors(missing.result) }));
  const ordered = await call(query({ x: null, nested: { b: 2, a: 1 } }), 'object order original');
  const reordered = await call(query({ nested: { a: 1, b: 2 }, x: null }), 'object order reversed');
  // The provider receives the row's own state in its own key order, so a
  // reordered object is different provider input: an exact-state cache judges it fresh.
  check('a reordered state object is judged fresh, not replayed', ordered.calls === 1 && reordered.calls === 1 && row(reordered.result)?.replayed === undefined,
    JSON.stringify({ ordered: ordered.calls, reordered: reordered.calls, replayed: row(reordered.result)?.replayed ?? false }));
  const changedQuestion = await call(query({ stable: 'evidence', x: null }, 'Is the x field present with a null value?'), 'different question');
  check('changing the question requires a fresh judgment', changedQuestion.calls === 1 && verdicts(changedQuestion.result).includes(0.9));

  mode = 'slow';
  const beforeWave = ctx.calls();
  const waveUsage = usageTotals();
  const wave = await Promise.all(Array.from({ length: 4 }, () => client.call('clasify', query({ wave: 'success' }))));
  check('concurrent identical callers share one successful request', ctx.calls() - beforeWave === 1 && wave.every(result => verdicts(result).includes(0.1)));
  const fresh = wave.filter(result => row(result)?.replayed !== true).length;
  const waveCharged = usageSince(waveUsage);
  check('shared-flight usage is charged to one caller', fresh === 1 && waveCharged.calls === 1 && waveCharged.input_tokens === 10, JSON.stringify({ fresh, waveCharged }));

  mode = 'unauthorized-slow';
  const beforeFailedWave = ctx.calls();
  const failedUsage = usageTotals();
  const failedWave = await Promise.all(Array.from({ length: 4 }, () => client.call('clasify', query({ wave: 'failed' }))));
  check('concurrent identical callers share one provider failure', ctx.calls() - beforeFailedWave === 1 && failedWave.every(result => errors(result).includes('classificationProviderError')));
  const failedCharged = usageSince(failedUsage);
  check('shared failed-flight usage counts one attempted request', failedCharged.calls === 1, JSON.stringify(failedCharged));

  mode = 'throttle';
  remainingFailures = 1;
  const retryStart = ctx.calls();
  const retryUsage = usageTotals();
  const retried = await call(query({ retry: 'throttle' }), '429 then success');
  const packets = ctx.mock.classificationRequests.slice(retryStart);
  check('transient failure retries once with identical provider input', retried.calls === 2 && packets.length === 2 && stable(packets[0]) === stable(packets[1]) && verdicts(retried.result).includes(0.1));
  // The row shows the provider's reported usage; the throttled attempt
  // reported none, so it is counted as an attempt with unknown usage.
  const retryCharged = usageSince(retryUsage);
  check('retry usage counts both attempts without inventing missing tokens',
    stable(row(retried.result)?.usage) === stable({ input_tokens: 10, output_tokens: 2 })
      && retryCharged.calls === 2 && retryCharged.known_usage_calls === 1 && retryCharged.unknown_usage_calls === 1 && retryCharged.input_tokens === 10,
    JSON.stringify({ usage: row(retried.result)?.usage, retryCharged }));
  remainingFailures = 10;
  const beforeNoRetry = ctx.calls();
  const noRetry = await ctx.cli('clasify', query({ retry: 'disabled' }), { MAX_RETRIES: '0' });
  check('zero retries makes exactly one failed provider attempt', ctx.calls() - beforeNoRetry === 1 && errors(noRetry).includes('classificationRateLimited'));
  const beforeExhausted = ctx.calls();
  const exhausted = await ctx.cli('clasify', query({ retry: 'exhausted' }), { MAX_RETRIES: '1' });
  check('exhausted retry budget stops after the initial attempt plus one retry', ctx.calls() - beforeExhausted === 2 && errors(exhausted).includes('classificationRateLimited'));

  mode = 'unauthorized';
  const rejected = await call(query({ retry: 'auth' }), '401 terminal');
  check('authentication failure is terminal despite retry allowance', rejected.calls === 1 && errors(rejected.result).includes('classificationProviderError') && rejected.result.text.includes('401'), JSON.stringify(errors(rejected.result)));
  mode = 'success';
  const repaired = await call(query({ retry: 'auth' }), 'provider recovered');
  check('failed wave is not a persistent negative cache', repaired.calls === 1 && verdicts(repaired.result).includes(0.1));

  mode = 'malformed';
  const malformed = await call(query({ retry: 'invalid-response' }), 'invalid response');
  check('invalid provider response is not retried', malformed.calls === 1 && errors(malformed.result).includes('invalidClassificationResponse'));
  mode = 'success';
  const corrected = await call(query({ retry: 'invalid-response' }), 'valid response later');
  check('invalid provider response is not cached', corrected.calls === 1 && verdicts(corrected.result).includes(0.1));

  // Each CLI invocation is a fresh process: the process-local cache cannot persist.
  const coldBefore = ctx.calls();
  for (let i = 0; i < 2; i++) {
    const result = await ctx.cli('clasify', query({ cli: 'same' }));
    assert.ok(verdicts(result).includes(0.1), JSON.stringify(result.json));
  }
  check('separate CLI processes do not pretend to share cached judgments', ctx.calls() - coldBefore === 2);

  // Multiple runtimes can coexist in a host process; account boundaries must
  // hold there, where the process-global cache is actually shared.
  const runtimes = ['fixture-account-a', 'fixture-account-b'].map(key => new NativeRuntime({
    surface: 'mcp', cwd: ctx.fixture, env: { ...env, OCTOCODE_CLASSIFICATION_API: key },
  }));
  try {
    const beforeAccounts = ctx.calls();
    for (const [index, runtime] of runtimes.entries()) {
      const result = await runtime.executeMcp(`account-${index}`, 'clasify', { queries: [query({ account: 'same-state' })] });
      assert.ok(verdicts({ sc: result.structuredContent }).includes(0.1), JSON.stringify(result));
    }
    check('same-process runtimes with different accounts judge independently', ctx.calls() - beforeAccounts === 2);
    const beforeWarmAccount = ctx.calls();
    const warmAccount = await runtimes[0].executeMcp('account-warm', 'clasify', { queries: [query({ account: 'same-state' })] });
    check('returning to the original account still reuses its own judgment', ctx.calls() === beforeWarmAccount && verdicts({ sc: warmAccount.structuredContent }).includes(0.1));
  } finally {
    await Promise.all(runtimes.map(runtime => runtime.close()));
  }

  const file = path.join(ctx.fixture, 'ranking-guide.txt');
  const sourceQuery = { path: file, length: 10, classifiers: ['Find the cancellation rule.'] };
  const beforeRanking = ctx.calls();
  const initial = await ctx.cli('localFetch', sourceQuery);
  const data = success(initial);
  check('replay fixture starts from a provider-ranked source', data.ranking?.status === 'ranked' && ctx.calls() > beforeRanking, JSON.stringify(data.ranking));
  const next = pages(data).find(lead => lead.tool === 'localFetch');
  assert.ok(next, 'ranked source must emit an executable continuation');
  const beforeReplay = ctx.calls();
  const replay = await ctx.cliArgs([next.tool, JSON.stringify(next.query), '--json']);
  success(replay);
  check('saved order replays across processes without another judgment', ctx.calls() === beforeReplay);

  const accountChanged = await ctx.cliArgs([next.tool, JSON.stringify(next.query), '--json'], { OCTOCODE_CLASSIFICATION_API: 'fixture-key-rotated' });
  check('account change rejects old order before provider work', errors(accountChanged).includes('staleSnapshot') && ctx.calls() === beforeReplay);
  const newClassifiers = structuredClone(next.query);
  newClassifiers.queries[0].classifiers = ['Find the bookkeeping rule.'];
  const classifiersChanged = await ctx.cliArgs([next.tool, JSON.stringify(newClassifiers), '--json']);
  check('classifier change rejects old order before provider work', errors(classifiersChanged).includes('staleSnapshot') && ctx.calls() === beforeReplay);

  // Replays through a fresh MCP process use the same saved identity.
  const replayMcp = await client.raw(next.tool, next.query);
  check('MCP also replays the saved order without provider work', !replayMcp.isError && !replayMcp.rowErrors && ctx.calls() === beforeReplay);
  fs.appendFileSync(file, 'The source changed after the saved page.\n');
  const staleCli = await ctx.cliArgs([next.tool, JSON.stringify(next.query), '--json']);
  const staleMcp = await client.raw(next.tool, next.query);
  check('source changes are stale on CLI and MCP without hidden reclassification', errors(staleCli).includes('staleSnapshot') && errors(staleMcp).includes('staleSnapshot') && ctx.calls() === beforeReplay);
  const restart = rowData(staleMcp)?.next?.restart;
  assert.ok(restart, 'stale source must offer restart');
  const restarted = await client.follow(restart);
  check('the emitted restart is executable against the new source', !restarted.isError && !restarted.rowErrors && ctx.calls() > beforeReplay);
} finally {
  client?.close();
  await ctx.close();
}
const result = summary();
writeResults('classification-retry', { ...result, traces });
process.exitCode = result.failed.length ? 1 : 0;
