// Bounded real-provider impact on labeled fixtures, with native CLI retrieval.
// Run only after acceptance against rebuilt binaries. No solver/agent is run.
// OCTOCODE_LIVE=1 OCTOCODE_CLASSIFICATION_API=... node .../read-tool-ranking-impact.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CASES, materialize } from './read-tool-ranking/cases.mjs';
import { ROOT, contract, dataOf, hash, setup, stable, walk } from './read-tool-ranking/support.mjs';

assert.equal(process.env.OCTOCODE_LIVE, '1', 'explicit live flag required');
const key = process.env.OCTOCODE_CLASSIFICATION_API;
assert.ok(key?.trim(), 'classification key must be supplied through the environment');
const endpoint = new URL('v1/systemone', `${(process.env.OCTOCODE_CLASSIFICATION_API_HOST ?? 'https://api.typesafe.ai').replace(/\/$/, '')}/`);
assert.equal(endpoint.protocol, 'https:', 'real-provider forwarding requires HTTPS');
const output = path.join(ROOT, '.octocode/tmp/read-tool-ranking-eval', `impact-${new Date().toISOString().replace(/[:.]/g, '-')}`);
fs.mkdirSync(output, { recursive: true });
const protocol = {
  version: 3, label: 'Controlled-fixture development confirmation, one paired trial; no agent-routing benchmark',
  rfc: '.octocode/octocode-rfc-generator/2026-10-13-read-tool-relevance/RFC.md',
  rfcHash: hash(fs.readFileSync(path.join(ROOT, '.octocode/octocode-rfc-generator/2026-10-13-read-tool-relevance/RFC.md'), 'utf8')),
  casesHash: hash(fs.readFileSync(new URL('./read-tool-ranking/cases.mjs', import.meta.url), 'utf8')),
  runnerHash: hash(fs.readFileSync(new URL(import.meta.url), 'utf8')),
  supportHash: hash(fs.readFileSync(new URL('./read-tool-ranking/support.mjs', import.meta.url), 'utf8')),
  mockHash: hash(fs.readFileSync(new URL('./tool-health/mock-server.mjs', import.meta.url), 'utf8')), contract: contract.fingerprint,
  binarySha256: hash(fs.readFileSync(path.join(ROOT, `packages/octocode-native/npm/${process.platform}-${process.arch}/octocode`))),
  addonSha256: hash(fs.readFileSync(path.join(ROOT, `packages/octocode-native/octocode-native.${process.platform}-${process.arch}.node`))),
  budget: { providerRequestsPerTool: 8, providerRequestsTotal: 104, reportedInputTokens: 120000, repeats: 1, retries: 0 },
  arms: ['noClassifiers', 'disabled', 'enabled'], variants: ['descriptiveCandidate', 'ordinaryRouteControl'],
  applicability: 'Only localFetch, localSearch, ghGetFileContent, and ghSearchCode accept classifiers; run the other tools only in their ordinary arm. Missing semantic arms are inapplicable, not zero-cost savings.',
  evidence: 'Complete selected responses, all source continuations; no automatic source hydration.',
  metrics: 'Full incurred response tokens; predeclared verification-read response tokens separately (zero if no such read); provider receipts separately. Target-string arrival is a diagnostic, never semantic sufficiency.',
  verification: 'Exact verifier reads are fixed in the case catalog before provider results, repeated in each arm, and counted in full. Their anchors are supplied by the fixture author; they do not measure autonomous routing or avoided reads.',
  adjudication: 'Review every observed prefix for semantic adequacy. Metadata can answer candidate identity only. No score-based verdicts, no evidence filtering, Unknown and worse outcomes retained.',
  priorEvidence: 'localFetch/localSearch use preserved prior real-model studies because the shared judge/windowing was not changed; current binaries still receive fresh mechanical acceptance.',
  cases: CASES,
};
fs.writeFileSync(path.join(output, 'protocol.json'), JSON.stringify(protocol, null, 2));
let activeTool, activeVariant, activeArm;
const providers = [], budgetStops = [], rows = [];
const pending = new Set();
const reservedInput = () => providers.reduce((sum, row) => sum + (row.response?.usage?.input_tokens ?? row.inputReservation), 0);
const usedInput = () => providers.reduce((sum, row) => sum + (row.response?.usage?.input_tokens ?? 0), 0);
const ctx = await setup({ label: 'impact', classificationResponder: async request => {
  const reserve = Buffer.byteLength(JSON.stringify(request)) + 2048;
  if (providers.length >= 104 || providers.filter(row => row.tool === activeTool).length >= 8 || reservedInput() + reserve > 120000) {
    budgetStops.push({ tool: activeTool, reason: 'frozen provider budget', requestHash: hash(request) });
    return { status: 429, body: { error: 'frozen evaluation budget exhausted' } };
  }
  const record = { tool: activeTool, variant: activeVariant, arm: activeArm, request, requestHash: hash(request), inputReservation: reserve, started: new Date().toISOString() };
  providers.push(record);
  let finish;
  const completed = new Promise(resolve => { finish = resolve; });
  pending.add(completed);
  const started = performance.now();
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify(request), signal: AbortSignal.timeout(30000) });
    const body = await response.text();
    record.httpStatus = response.status;
    try { record.response = JSON.parse(body); } catch { record.rawResponse = body; }
    return { status: response.status, body: record.response ?? body };
  } catch (error) {
    record.error = error.message;
    return { status: 503, body: { error: 'evaluation upstream request failed' } };
  } finally {
    record.ms = performance.now() - started;
    finish();
    pending.delete(completed);
    fs.writeFileSync(path.join(output, 'provider.json'), JSON.stringify({ providers, budgetStops }, null, 2));
  }
} });

try {
  // Freeze the exact fixture bytes before making the first provider request.
  const snapshot = path.join(output, 'fixture');
  fs.cpSync(ctx.fixture, snapshot, { recursive: true });
  for (const spec of CASES) {
    activeTool = spec.tool;
    const result = { tool: spec.tool, scope: spec.scope, fixture: true, trials: [] };
    rows.push(result);
    if (['localSearch', 'localFetch'].includes(spec.tool)) {
      result.decision = 'prior-evidence';
      result.reason = 'Fresh mechanical acceptance required; prior real-model gains and negative controls retained without paid repetition of the unchanged algorithm.';
      result.priorReports = ['packages/octocode-benchmark/results/local-ranking-2026-10-13.md', 'packages/octocode-benchmark/results/selective-semantics-2026-10-13.md'];
      continue;
    }
    for (const [variant, query] of [['descriptiveCandidate', spec.query], ['ordinaryRouteControl', spec.control]]) {
      const trial = { variant, arms: {} };
      result.trials.push(trial);
      for (const arm of spec.scope === null ? ['noClassifiers'] : ['noClassifiers', 'disabled', 'enabled']) {
        activeVariant = variant;
        activeArm = arm;
        const materialized = materialize(query, ctx);
        const input = arm === 'noClassifiers' ? materialized : { ...materialized, classifiers: spec.classifiers };
        const overrides = { OCTOCODE_RANKING_MAX_CANDIDATES: '8', OCTOCODE_RANKING_MAX_CHARS: '16384',
          OCTOCODE_RANKING_TIMEOUT_MS: '30000', ...(arm === 'disabled' ? { OCTOCODE_RANKING_ENABLED: 'false' } : {}) };
        const before = providers.length;
        try {
          const run = await walk(ctx, spec, input, { overrides });
          if (spec.verification) {
            const callsBeforeVerifier = providers.length;
            run.verification = await walk(ctx, spec.verification, materialize(spec.verification.query, ctx), { overrides });
            assert.ok(run.verification.rows.length, 'predeclared verifier contains evidence');
            assert.equal(providers.length, callsBeforeVerifier, 'exact verifier never classifies');
          }
          trial.arms[arm] = { ...run, providerRequests: providers.length - before,
            targetStringArrivalPage: run.responses.findIndex(response => JSON.stringify(dataOf(response)).includes(spec.target)) + 1 || null };
        } catch (error) { trial.arms[arm] = { error: error.stack, providerRequests: providers.length - before }; }
        fs.writeFileSync(path.join(output, 'runs.json'), JSON.stringify({ protocolHash: hash(protocol), rows }, null, 2));
      }
      const plain = trial.arms.noClassifiers, ranked = trial.arms.enabled;
      if (plain.rows && ranked?.rows) {
        trial.sameEvidence = stable([...plain.rows].sort()) === stable([...ranked.rows].sort());
        trial.sameOrder = stable(plain.rows) === stable(ranked.rows);
        trial.receipts = ranked.responses.map(response => dataOf(response).ranking);
      }
    }
    result.decision = spec.scope ? 'awaiting-source-adequacy-adjudication' : 'ranking-not-supported';
    if (!spec.scope) assert.equal(providers.filter(row => row.tool === spec.tool).length, 0, `${spec.tool} unsupported read makes no paid calls`);
  }
} finally {
  // Native timeouts can finish before an upstream attempt; account for every attempt.
  await Promise.allSettled([...pending]);
  fs.writeFileSync(path.join(output, 'runs.json'), JSON.stringify({ protocolHash: hash(protocol), rows }, null, 2));
  fs.writeFileSync(path.join(output, 'provider.json'), JSON.stringify({ providers, budgetStops }, null, 2));
  fs.writeFileSync(path.join(output, 'upstream.json'), JSON.stringify(ctx.mock.requests, null, 2));
  await ctx.close();
}

const python = process.env.OCTOCODE_TOKENIZER_PYTHON ?? path.join(ROOT, '.octocode/tmp/local-relevance/tokenizer-venv/bin/python');
const tokenInput = path.join(output, 'token-input.json');
const texts = rows.flatMap(row => row.trials.flatMap(trial => Object.entries(trial.arms).flatMap(([arm, run]) =>
  ['discovery', 'verification'].flatMap(kind => ((kind === 'discovery' ? run.responses : run.verification?.responses) ?? [])
    .map((response, page) => ({ id: `${row.tool}/${trial.variant}/${arm}/${kind}/${page + 1}`, text: response.rawResponse }))) )));
fs.writeFileSync(tokenInput, JSON.stringify(texts));
if (fs.existsSync(python)) {
  const tokenized = spawnSync(python, ['-c',
    'import json,sys,tiktoken; a=json.load(open(sys.argv[1])); print(json.dumps({"tiktoken":tiktoken.__version__,"rows":[{"id":r["id"],"characters":len(r["text"]),"bytes":len(r["text"].encode()),**{n:len(tiktoken.get_encoding(n).encode(r["text"])) for n in ["o200k_base","cl100k_base"]}} for r in a]}))', tokenInput],
  { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (tokenized.status === 0) fs.writeFileSync(path.join(output, 'tokens.json'), tokenized.stdout);
  else fs.writeFileSync(path.join(output, 'tokenization-error.txt'), tokenized.stderr);
}
console.log(JSON.stringify({ output, tools: rows.length, providerRequests: providers.length, inputTokens: usedInput(), outputTokens: providers.reduce((sum, row) => sum + (row.response?.usage?.output_tokens ?? 0), 0), budgetStops: budgetStops.length }));
