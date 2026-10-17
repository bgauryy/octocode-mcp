#!/usr/bin/env node
// Controlled question and source-selection experiment; no autonomous host is simulated.
import fs from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { propagateOctocodeEnv } from '@octocodeai/config';
import { hermeticEnv } from '../../../test-utils/hermetic-env.ts';
import { judgmentCases, noveltyCases } from '../experiments/jev-proposal-poc/question-cases.mjs';
import { locateCases } from '../experiments/jev-proposal-poc/locate-cases.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CLI = path.join(ROOT, 'packages/octocode/out/octocode.js');
const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export const STYLES = ['compound', 'atomic', 'atomic-evidence'];

/** Keyed provider Noul questions: does the supplied state establish each claim? */
export function questions(item, style) {
  if (!STYLES.includes(style)) throw new Error('Unknown question style');
  if (style === 'compound') return { whole: { type: 'noul', instructions: item.compound ?? item.broad } };
  return Object.fromEntries(item.atoms.map((atom, index) => [`fact${index + 1}`, { type: 'noul',
    instructions: style === 'atomic' ? atom.claim ?? atom.ask : `${atom.claim ?? atom.ask}\nRequired evidence: ${atom.evidence}\nUse only supplied source. Keep the stated conditions; names or comments alone do not establish implementation behavior. Missing evidence remains unresolved.` }]));
}

/** The Noul value of every answer of the one held-state row, by question key. */
export function heldAnswers(outputs) {
  if (outputs.length !== 1) throw new Error('Held state unexpectedly paged');
  const answers = outputs[0].json.queries?.[0]?.answers;
  if (!answers) throw new Error('Held state returned no answers');
  return Object.fromEntries(Object.entries(answers).map(([key, answer]) => [key, answer?.noul ?? null]));
}

export function mergeRanges(ranges) {
  const sorted = ranges.map(([start, end]) => {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start) throw new Error('Invalid source range');
    return [start, end];
  }).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const result = [];
  for (const range of sorted) {
    const last = result.at(-1);
    if (last && range[0] <= last[1] + 1) last[1] = Math.max(last[1], range[1]);
    else result.push(range);
  }
  return result;
}

export function classifyDecision(values, threshold = 0.8) {
  if (!values.length || values.some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)) return null;
  return values.every(value => value >= threshold);
}

export function sourceCoverage(responses, item) {
  const lines = item.source.split('\n');
  const seen = new Map();
  let corrupt = false, duplicateLines = 0;
  for (const response of responses) for (const row of response.json?.results ?? []) {
    for (const match of row.data?.content?.matchAll(/^(\d+)\t(.*)$/gm) ?? []) {
      const id = Number(match[1]);
      if (seen.has(id)) duplicateLines++;
      seen.set(id, match[2]);
      if (lines[id - 1] !== match[2]) corrupt = true;
    }
  }
  const facts = item.atoms.map(atom => atom.gold.every(id => seen.has(id)));
  return { facts, complete: facts.every(Boolean) && !corrupt, corrupt, distinctLines: seen.size, duplicateLines };
}

export async function invoke(tool, input, cwd, env) {
  const args = typeof input === 'string' ? [tool, ...input.split(' ')] : [tool, JSON.stringify(input), '--json'];
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const child = spawn(process.execPath, [CLI, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', killed = false;
    const timer = setTimeout(() => { killed = true; child.kill('SIGKILL'); }, 45000);
    child.stdout.on('data', data => { stdout += data; if (stdout.length > 8e6) { killed = true; child.kill('SIGKILL'); } });
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      let json; try { json = JSON.parse(stdout); } catch { /* Invalid output remains a recorded failure. */ }
      resolve({ tool, input, argumentText: typeof input === 'string' ? input : JSON.stringify(input), stdout, stderr, code, killed, json, ms: performance.now() - started });
    });
  });
}

function ensure(response) {
  if (response.code !== 0 || !response.json || response.killed) throw new Error(`CLI failure: ${response.tool}; exit ${response.code}`);
  if (response.json.results?.some(row => row.status === 'error')) throw new Error('Tool row error');
  if (response.json.queries?.some(row => row.error)) throw new Error('Classification row error');
}

async function main() {
  const args = process.argv.slice(2);
  const value = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
  if (args.includes('--help')) { console.log('node scripts/jev_question_poc.mjs --out <new-dir> [--model jev-1.13.0] [--smoke]'); return; }
  if (!value('--out')) throw new Error('--out must name a new run directory');
  const out = path.resolve(value('--out'));
  const model = value('--model') ?? 'jev-1.13.0';
  const smoke = args.includes('--smoke');
  const upstream = { ...process.env }; propagateOctocodeEnv({ trusted: false, env: upstream });
  const key = upstream.OCTOCODE_CLASSIFICATION_API;
  if (!key?.trim()) throw new Error('Classification credential unavailable');
  const endpoint = new URL('v1/systemone', `${(upstream.OCTOCODE_CLASSIFICATION_API_HOST ?? 'https://api.typesafe.ai').replace(/\/$/, '')}/`);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) throw new Error('Provider requires HTTPS without URL credentials');
  await fs.mkdir(path.dirname(out), { recursive: true }); await fs.mkdir(out);
  const fixture = path.join(out, 'fixtures'); await fs.mkdir(fixture);
  const isolated = hermeticEnv(process.env, 'jev-question-poc');
  const { resolveNativeBinaryPath } = createRequire(CLI)('@octocodeai/octocode-native/bin/resolve-binary.cjs');
  const nativeBinary = resolveNativeBinaryPath();
  const allCases = { judgment: judgmentCases(), novelty: noveltyCases(), locate: await locateCases(ROOT) };
  const suite = smoke ? Object.fromEntries(Object.entries(allCases).map(([name, items]) => [name, items.slice(0, 1)])) : allCases;
  const run = { version: 3, split: 'development', smoke, model, styles: STYLES, suite,
    primary: 'Support task accuracy first; complete required-source coverage and exact full CLI exchange tokens for fixed selection policies. No autonomous host or answer-quality claim.',
    selection: 'Keep a question policy only with no observed family regression. Source selection must retain both gold facts; cheaper incomplete selections fail. Token reduction target 15% paired, descriptive only on this development suite.',
    policy: { supportThreshold: 0.8, questions: 'provider Noul over the supplied state; novelty arms ask relevance to the target, or new evidence beyond the known facts', classifiers: 'first two pages of 25 lines, regardless of gold', repeats: 1, order: 'styles rotate by case index', absence: 'unsupported or unlocated stays unresolved, never global absence', tokenizer: 'tiktoken 0.14.0 o200k_base primary, cl100k_base sensitivity; exact CLI stdout and serialized arguments separately; no host framing/history/reasoning' },
    budget: { requests: smoke ? 40 : 256, inputTokens: smoke ? 100000 : 600000, wallMs: 900000, requestMs: 20000, retries: 0 },
    source: { nativeBinary, nativeHash: hash(await fs.readFile(nativeBinary)), cliHash: hash(await fs.readFile(CLI)), harnessHash: hash(await fs.readFile(fileURLToPath(import.meta.url))), casesHash: hash(suite) },
    rows: [], ledger: [], errors: [] };
  const save = () => fs.writeFile(path.join(out, 'run.json'), JSON.stringify(run, null, 2), { mode: 0o600 });
  await save();
  const started = Date.now();
  let current, calls = 0, inputTokens = 0, outputTokens = 0, stopped = false;
  const pending = new Set();
  const server = http.createServer((request, response) => {
    const operation = (async () => {
      const record = { case: current?.case, lane: current?.lane, arm: current?.arm };
      try {
        if (request.method !== 'POST' || request.url !== '/v1/systemone') { response.writeHead(404).end(); return; }
        const buffers = []; let bytes = 0;
        for await (const chunk of request) { bytes += chunk.length; if (bytes > 2e6) throw new Error('Request too large'); buffers.push(chunk); }
        const body = JSON.parse(Buffer.concat(buffers)); body.model = model;
        run.ledger.push(record);
        if (stopped || calls >= run.budget.requests || inputTokens >= run.budget.inputTokens || Date.now() - started >= run.budget.wallMs) throw new Error('Campaign budget stop');
        calls++; record.request = body; record.requestHash = hash(body);
        const begin = performance.now();
        const result = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(run.budget.requestMs) });
        const raw = await result.text();
        let json; try { json = JSON.parse(raw); } catch { /* Unknown usage stops this run. */ }
        Object.assign(record, { httpStatus: result.status, ms: performance.now() - begin, resolvedModel: json?.model ?? null, inputTokens: json?.usage?.input_tokens ?? null, outputTokens: json?.usage?.output_tokens ?? null, answers: json?.answers ?? null });
        if (![record.inputTokens, record.outputTokens].every(x => Number.isSafeInteger(x) && x >= 0)) stopped = true;
        else { inputTokens += record.inputTokens; outputTokens += record.outputTokens; }
        if (!result.ok) stopped = true;
        response.writeHead(result.status, { 'content-type': 'application/json' }).end(raw);
      } catch (error) { record.error = error.message; stopped = true; response.writeHead(502).end('{"error":"POC transport failure"}'); }
    })();
    pending.add(operation); operation.finally(() => pending.delete(operation));
  });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const env = { ...isolated, OCTOCODE_CLASSIFICATION_API: 'loopback-only', OCTOCODE_CLASSIFICATION_API_HOST: `http://127.0.0.1:${server.address().port}`,
      OCTOCODE_BETA: 'true', OCTOCODE_RANKING_ENABLED: 'true', OCTOCODE_ENABLE_LOCAL: 'true', OCTOCODE_ENABLE_STATS: 'false', OCTOCODE_STORAGE_MODE: 'memory',
      OCTOCODE_RANKING_MAX_CANDIDATES: '64', OCTOCODE_RANKING_MAX_CHARS: '131072', OCTOCODE_RANKING_TIMEOUT_MS: '20000',
      OCTOCODE_LSP_PREWARM: 'off', WORKSPACE_ROOT: fixture, ALLOWED_PATHS: fixture, DISABLE_TOOLS: '', TOOLS_TO_RUN: '' };
    run.schema = await invoke('schema', 'clasify --view full', fixture, env); ensure(run.schema);
    const call = async (tool, input, into) => { const response = await invoke(tool, input, fixture, env); into.push(response); ensure(response); return response.json; };
    const read = async (query, into, maxPages = 100) => {
      let input = { queries: [query] }; const seen = new Set();
      for (let i = 0; input && i < maxPages; i++) {
        if (seen.has(hash(input))) throw new Error('Repeated read continuation'); seen.add(hash(input));
        const json = await call('localFetch', input, into);
        const leads = Object.values(json.results?.[0]?.data?.next ?? {});
        if (leads.length > 1 || leads.some(lead => lead.tool !== 'localFetch')) throw new Error('Unexpected read continuation');
        input = leads[0]?.query;
      }
      return Boolean(input);
    };
    const classify = (query, into) => call('clasify', { queries: [query] }, into);
    const trial = async (lane, item, arm, work) => {
      if (stopped) return;
      current = { lane, case: item.id, arm, responses: [] }; const begin = run.ledger.length; const time = performance.now();
      try { await work(current); } catch (error) { current.error = error.message; }
      await Promise.allSettled([...pending]);
      current.ms = performance.now() - time; current.providerCalls = run.ledger.length - begin;
      run.rows.push(current); await save();
      console.log(JSON.stringify({ lane, case: item.id, arm, error: current.error, calls, inputTokens, stopped }));
    };
    for (const [index, item] of suite.judgment.entries()) {
      const order = [...STYLES.slice(index % 3), ...STYLES.slice(0, index % 3)];
      for (const arm of order) await trial('judgment', item, arm, async row => {
        const qs = questions(item, arm);
        await classify({ state: item.source, questions: qs }, row.responses);
        const answers = heldAnswers(row.responses);
        row.values = Object.keys(qs).map(key => answers[key] ?? null);
        row.decision = classifyDecision(row.values); row.expected = item.expected.every(Boolean);
        row.correct = row.decision !== null && row.decision === row.expected;
        row.atomCorrect = arm === 'compound' ? null : row.values.map((value, i) => typeof value === 'number' && (value >= 0.8) === item.expected[i]);
      });
    }
    for (const [index, item] of suite.novelty.entries()) for (const arm of index % 2 ? ['adds', 'relevant'] : ['relevant', 'adds']) await trial('novelty', item, arm, async row => {
      const question = arm === 'adds'
        ? { state: { known: item.known, source: item.source }, instructions: `Does the source add evidence for this target beyond the known facts? Target: ${item.target}` }
        : { state: item.source, instructions: `Does the source contain evidence for this target? Target: ${item.target}` };
      await classify({ state: question.state, questions: { read: { type: 'noul', instructions: question.instructions } } }, row.responses);
      const value = heldAnswers(row.responses).read;
      row.value = value; row.decision = classifyDecision([value]); row.expected = item.expected; row.correct = row.decision !== null && row.decision === item.expected;
      row.interpretation = 'Use this judgment to prioritize another read for new evidence; relevant is a comparator for routing, not a novelty classifier.';
    });
    for (const item of suite.locate) {
      const file = path.join(fixture, `${item.id}.rs`); await fs.writeFile(file, item.source);
      // The pre-RFC Locate arms (public clasify locate) were removed with that API.
      for (const arm of ['full-read', 'direct-search', 'source-prefix', 'classifiers-compound', 'classifiers-atomic']) await trial('selection', item, arm, async row => {
        const query = { path: file };
        if (arm === 'full-read') query.fullContent = true;
        if (arm === 'direct-search') Object.assign(query, item.direct);
        if (['source-prefix', 'classifiers-compound', 'classifiers-atomic'].includes(arm)) Object.assign(query, { unit: 'lines', length: 25 });
        if (arm === 'classifiers-compound') query.classifiers = [item.broad];
        if (arm === 'classifiers-atomic') query.classifiers = item.atoms.map(atom => atom.ask);
        row.remaining = await read(query, row.responses, ['full-read', 'direct-search'].includes(arm) ? 100 : 2);
        row.coverage = sourceCoverage(row.responses, item);
      });
    }
  } catch (error) { run.errors.push(error.message); }
  finally {
    await Promise.allSettled([...pending]);
    run.totals = { calls, inputTokens, outputTokens, stopped, ms: Date.now() - started, errors: run.errors.length + run.rows.filter(row => row.error).length };
    run.source.nativeUnchanged = run.source.nativeHash === hash(await fs.readFile(nativeBinary));
    await save(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await fs.rm(isolated.OCTOCODE_HOME, { recursive: true, force: true });
  }
  console.log(JSON.stringify({ out, ...run.totals }));
  if (stopped || run.totals.errors || !run.source.nativeUnchanged) process.exitCode = 1;
}

// argv[1] keeps a symlinked path while import.meta.url is the real path, so compare real paths.
const realOrSelf = p => { try { return realpathSync(p); } catch { return path.resolve(p); } };
if (process.argv[1] && realOrSelf(process.argv[1]) === realOrSelf(fileURLToPath(import.meta.url))) main().catch(error => { console.error(error.message); process.exitCode = 1; });
