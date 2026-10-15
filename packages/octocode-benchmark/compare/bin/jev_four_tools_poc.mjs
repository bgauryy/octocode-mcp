#!/usr/bin/env node
// Fixed routing policies over public, revision-pinned source; no simulated host decisions.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { propagateOctocodeEnv } from '@octocodeai/config';
import { hermeticEnv } from '../../../../test-utils/hermetic-env.ts';
import { invoke } from './jev_question_poc.mjs';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const CLI = path.join(ROOT, 'packages/octocode/out/octocode.js');
const REPO = path.join(ROOT, 'octocode-local-testing/repos/python');
const REF = '4fab678a0739d54401ccee7eb587553657c9f76e';
const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const TOOLS = ['localSearch', 'localFetch', 'ghSearchCode', 'ghGetFileContent'];
const isSearch = tool => tool === 'localSearch' || tool === 'ghSearchCode';
const isLocal = tool => tool.startsWith('local');
const readTool = tool => isLocal(tool) ? 'localFetch' : 'ghGetFileContent';
// The pre-RFC Locate arm (public clasify locate matrices) was removed with that API; its
// recorded runs stay historical evidence.
const armsFor = tool => isSearch(tool) ? ['ordinary', 'classifiers', 'direct'] : ['ordinary', 'classifiers', 'direct', 'full'];

export const CASES = [
  { id: 'cache-expiry', directory: 'django/core/cache/backends', file: 'locmem.py', keyword: 'timeout',
    atoms: [
      { ask: 'When a local-memory cache entry has expired, what does get do with the entry and return to the caller?', gold: [35, 37, 38, 39, 40] },
      { ask: 'What does local-memory cache add return when the key already exists and has not expired?', gold: [26, 29, 30, 31, 32, 33] },
    ], anchors: ['def get(', 'def add('] },
  { id: 'smtp-connection', directory: 'django/core/mail/backends', file: 'smtp.py', keyword: 'send_messages',
    atoms: [
      { ask: 'Under what condition does SMTP send_messages close the connection after attempting the messages?', gold: [183, 191, 197, 202, 203, 204] },
      { ask: 'What does SMTP send_messages return when opening leaves no connection or returns None?', gold: [183, 191, 192, 195] },
    ], anchors: ['def send_messages('] },
];

export function evidenceCoverage(responses, item, sources, fixture) {
  const expectedPath = `${item.directory}/${item.file}`;
  const seen = new Map(); let corrupt = false, duplicates = 0;
  const relative = value => path.isAbsolute(value) ? path.relative(fixture, value) : value;
  for (const response of responses) for (const row of response.json?.results ?? []) {
    const data = row.data;
    // Judge source reads only. Snippet relevance and echoed questions cannot satisfy facts.
    if (!data?.content || !data.path) continue;
    const name = relative(data.path);
    const original = sources[name]?.split('\n');
    for (const match of data.content.matchAll(/^(\d+)\t(.*)$/gm)) {
      const line = Number(match[1]), key = `${name}:${line}`;
      if (seen.has(key)) duplicates++;
      seen.set(key, match[2]);
      if (!original || original[line - 1] !== match[2]) corrupt = true;
    }
  }
  const facts = item.atoms.map(atom => atom.gold.every(line => seen.has(`${expectedPath}:${line}`)));
  return { facts, complete: facts.every(Boolean) && !corrupt, corrupt, distinctLines: seen.size, duplicates };
}

function ensure(response) {
  if (response.code !== 0 || !response.json || response.killed) throw new Error(`CLI ${response.tool} failed (${response.code})`);
  if (response.json.results?.some(row => row.status === 'error' || row.error)) throw new Error('Tool row error');
}

async function main() {
  if (process.argv.includes('--help')) { console.log('node compare/bin/jev_four_tools_poc.mjs --out <new-dir> [--smoke]'); return; }
  const index = process.argv.indexOf('--out');
  if (index < 0 || !process.argv[index + 1]) throw new Error('--out is required');
  const out = path.resolve(process.argv[index + 1]), smoke = process.argv.includes('--smoke');
  await fs.mkdir(path.dirname(out), { recursive: true }); await fs.mkdir(out);
  const fixture = path.join(out, 'fixture'); await fs.mkdir(fixture);
  const sources = {};
  // Read committed public bytes, never mutable local modifications or private files.
  for (const directory of new Set(CASES.map(item => item.directory))) {
    const files = execFileSync('git', ['-C', REPO, 'ls-tree', '-r', '--name-only', REF, '--', directory], { encoding: 'utf8' }).trim().split('\n');
    for (const name of files) {
      sources[name] = execFileSync('git', ['-C', REPO, 'show', `${REF}:${name}`], { encoding: 'utf8' });
      await fs.mkdir(path.dirname(path.join(fixture, name)), { recursive: true });
      await fs.writeFile(path.join(fixture, name), sources[name]);
    }
  }
  const upstream = { ...process.env }; propagateOctocodeEnv({ trusted: false, env: upstream });
  const key = upstream.OCTOCODE_CLASSIFICATION_API;
  let github = upstream.GH_TOKEN ?? upstream.GITHUB_TOKEN;
  if (!github) github = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 }).trim();
  if (!key?.trim() || !github?.trim()) throw new Error('Provider/GitHub credentials unavailable');
  const endpoint = new URL('https://api.typesafe.ai/v1/systemone');
  const isolated = hermeticEnv(process.env, 'jev-four-tools');
  const { resolveNativeBinaryPath } = createRequire(CLI)('@octocodeai/octocode-native/bin/resolve-binary.cjs');
  const native = resolveNativeBinaryPath();
  const suite = smoke ? CASES.slice(1) : CASES;
  const run = { version: 3, split: 'development-transfer', smoke, model: 'jev-1.13.0', tools: TOOLS, suite,
    question: 'Which fixed retrieval route returns all required implementation evidence with the least full CLI exchange context on each of four tools?',
    primary: 'All required source facts, then paired complete exchange tokens. Target >=15% saving with no quality regression. Two public cases cannot establish population or host-agent benefit.',
    policy: { arms: Object.fromEntries(TOOLS.map(tool => [tool, armsFor(tool)])), search: 'First provider/files page of 10, read first two distinct files completely; classifiers change only their ordering. Other hits and match continuations remain explicitly unread.',
      read: 'First two pages of 25 lines; full control traverses all pages.',
      direct: 'Separate known-anchor stratum: filename and literal method anchors supplied in advance, then complete containing blocks.',
      order: 'Case-major, tool order rotates by case; arm order rotates by case/tool.', repeats: 1,
      tokenizer: 'tiktoken 0.14.0, o200k_base primary and cl100k_base sensitivity; complete exact stdout plus arguments, no host framing/history/reasoning/final answers.',
      githubIndex: 'Live default-branch candidate index, source lines re-read at immutable ref. Not a revision-pinned discovery index.',
      exposure: 'Questions authored from source before any new JEV result. No sealed holdout or autonomous agent.' },
    budget: { requests: smoke ? 80 : 220, inputTokens: smoke ? 150000 : 450000, wallMs: 900000, requestMs: 20000, retries: 0 },
    provenance: { repository: 'https://github.com/django/django', ref: REF, sourceHashes: Object.fromEntries(Object.entries(sources).map(([name, content]) => [name, hash(content)])), native, nativeHash: hash(await fs.readFile(native)), cliHash: hash(await fs.readFile(CLI)), harnessHash: hash(await fs.readFile(fileURLToPath(import.meta.url))), helperHash: hash(await fs.readFile(new URL('./jev_question_poc.mjs', import.meta.url))) },
    rows: [], ledger: [], errors: [], preflight: [] };
  const save = () => fs.writeFile(path.join(out, 'run.json'), JSON.stringify(run, null, 2), { mode: 0o600 });
  await fs.copyFile(fileURLToPath(import.meta.url), path.join(out, 'harness.mjs'));
  await save();
  let current, stopped = false, calls = 0, inputTokens = 0, outputTokens = 0;
  const started = Date.now(), pending = new Set();
  const server = http.createServer((request, response) => {
    const operation = (async () => {
      const record = { case: current?.case, tool: current?.tool, arm: current?.arm };
      try {
        if (request.method !== 'POST' || request.url !== '/v1/systemone') { response.writeHead(404).end(); return; }
        const buffers = []; let bytes = 0;
        for await (const chunk of request) { bytes += chunk.length; if (bytes > 2e6) throw new Error('Request too large'); buffers.push(chunk); }
        const body = JSON.parse(Buffer.concat(buffers)); body.model = run.model;
        run.ledger.push(record);
        if (stopped || calls >= run.budget.requests || inputTokens >= run.budget.inputTokens || Date.now() - started >= run.budget.wallMs) throw new Error('Campaign budget stop');
        calls++; record.request = body; record.requestHash = hash(body);
        const begin = performance.now();
        const result = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(run.budget.requestMs) });
        const raw = await result.text(); let json; try { json = JSON.parse(raw); } catch { /* Unknown usage stops the campaign. */ }
        Object.assign(record, { status: result.status, ms: performance.now() - begin, resolvedModel: json?.model ?? null, inputTokens: json?.usage?.input_tokens ?? null, outputTokens: json?.usage?.output_tokens ?? null, answers: json?.answers ?? null });
        if (![record.inputTokens, record.outputTokens].every(value => Number.isSafeInteger(value) && value >= 0)) stopped = true;
        else { inputTokens += record.inputTokens; outputTokens += record.outputTokens; }
        if (!result.ok) stopped = true;
        response.writeHead(result.status, { 'content-type': 'application/json' }).end(raw);
      } catch (error) { record.error = error.message; stopped = true; response.writeHead(502).end('{"error":"POC transport failure"}'); }
    })(); pending.add(operation); operation.finally(() => pending.delete(operation));
  });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const env = { ...isolated, GH_TOKEN: github, OCTOCODE_CLASSIFICATION_API: 'loopback-only', OCTOCODE_CLASSIFICATION_API_HOST: `http://127.0.0.1:${server.address().port}`,
      OCTOCODE_BETA: 'true', OCTOCODE_RANKING_ENABLED: 'true', OCTOCODE_ENABLE_LOCAL: 'true', OCTOCODE_ENABLE_STATS: 'false', OCTOCODE_STORAGE_MODE: 'memory',
      OCTOCODE_RANKING_MAX_CANDIDATES: '64', OCTOCODE_RANKING_MAX_CHARS: '131072', OCTOCODE_RANKING_TIMEOUT_MS: '20000', OCTOCODE_CLASSIFICATION_CONCURRENCY: '1',
      OCTOCODE_OUTPUT_DEFAULT_CHAR_LENGTH: '20000', OCTOCODE_LSP_PREWARM: 'off', MAX_RETRIES: '0', WORKSPACE_ROOT: fixture, ALLOWED_PATHS: fixture, DISABLE_TOOLS: '', TOOLS_TO_RUN: '' };
    for (const name of ['HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'https_proxy', 'http_proxy', 'all_proxy']) delete env[name];
    const gh = { owner: 'django', repo: 'django', ref: REF };
    const call = async (tool, input, into) => { const response = await invoke(tool, input, fixture, env); into.push(response); ensure(response); return response.json; };
    const walkRead = async (tool, query, into, limit = 40) => {
      let input = { queries: [query] }; const seen = new Set();
      for (let page = 0; input && page < limit; page++) {
        if (seen.has(hash(input))) throw new Error('Repeated source continuation'); seen.add(hash(input));
        const json = await call(tool, input, into);
        const leads = Object.values(json.results?.[0]?.data?.next ?? {});
        if (leads.some(lead => lead.tool !== tool) || leads.length > 1) throw new Error('Unexpected source continuation');
        input = leads[0]?.query;
      }
      if (input && limit === 40) throw new Error('Complete read exceeded page ceiling');
      return input ?? null;
    };
    // Source equality is an evaluator check, performed before the scored routes.
    for (const item of suite) {
      const into = []; await walkRead('ghGetFileContent', { ...gh, path: `${item.directory}/${item.file}`, minify: 'none', fullContent: true }, into);
      const coverage = evidenceCoverage(into, item, sources, fixture);
      run.preflight.push({ case: item.id, responses: into, coverage });
      if (!coverage.complete || coverage.distinctLines !== sources[`${item.directory}/${item.file}`].trimEnd().split('\n').length) throw new Error('Pinned GitHub/local source mismatch');
    }
    await save();
    for (const [caseIndex, item] of suite.entries()) {
      const order = [...TOOLS.slice(caseIndex), ...TOOLS.slice(0, caseIndex)];
      for (const [toolIndex, tool] of order.entries()) {
        const arms = armsFor(tool), offset = (caseIndex + toolIndex) % arms.length;
        for (const arm of [...arms.slice(offset), ...arms.slice(0, offset)]) {
          if (stopped) continue;
          current = { case: item.id, tool, arm, responses: [] }; const begin = run.ledger.length, time = performance.now();
          try {
            const name = `${item.directory}/${item.file}`;
            const baseRead = name => ({ ...(isLocal(tool) ? {} : gh), path: isLocal(tool) ? path.resolve(fixture, name) : name, minify: 'none' });
            let query = isSearch(tool)
              ? isLocal(tool) ? { path: path.join(fixture, item.directory), matchString: item.keyword, pageSize: 10, matchPageSize: 5 }
                : { ...gh, path: item.directory, keywords: [item.keyword], pageSize: 10 }
              : { ...baseRead(name), unit: 'lines', length: 25 };
            if (arm === 'classifiers') query.classifiers = item.atoms.map(atom => atom.ask);
            if (arm === 'direct' && isSearch(tool)) query = { ...query, ...(isLocal(tool) ? { include: [item.file] } : { filename: item.file }) };
            if (isSearch(tool)) {
              const json = await call(tool, { queries: [query] }, current.responses), data = json.results[0].data;
              current.searchCandidates = (data.files ?? []).map(file => file.path);
              current.unreadSearchContinuations = data.next ?? null;
              const selected = [...new Set(current.searchCandidates)].slice(0, 2);
              current.unreadFiles = current.searchCandidates.filter(name => !selected.includes(name));
              for (const candidate of selected) await walkRead(readTool(tool), { ...baseRead(candidate), ...(arm === 'direct' ? { matchString: item.anchors, block: true } : { fullContent: true }) }, current.responses);
            } else {
              if (arm === 'direct') query = { ...baseRead(name), matchString: item.anchors, block: true };
              if (arm === 'full') query = { ...baseRead(name), fullContent: true };
              current.remaining = await walkRead(tool, query, current.responses, ['direct', 'full'].includes(arm) ? 40 : 2);
            }
            current.coverage = evidenceCoverage(current.responses, item, sources, fixture);
          } catch (error) { current.error = error.message; }
          await Promise.allSettled([...pending]);
          current.ms = performance.now() - time; current.providerCalls = run.ledger.length - begin;
          run.rows.push(current); await save();
          console.log(JSON.stringify({ case: current.case, tool, arm, quality: current.coverage?.complete, error: current.error, calls, inputTokens, stopped }));
        }
      }
    }
  } catch (error) { run.errors.push(error.message); }
  finally {
    await Promise.allSettled([...pending]);
    run.totals = { calls, inputTokens, outputTokens, stopped, ms: Date.now() - started, errors: run.errors.length + run.rows.filter(row => row.error).length };
    run.provenance.nativeUnchanged = run.provenance.nativeHash === hash(await fs.readFile(native));
    run.provenance.fixturesUnchanged = (await Promise.all(Object.entries(sources).map(async ([name, content]) => hash(await fs.readFile(path.join(fixture, name))) === hash(content)))).every(Boolean);
    await save(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await fs.rm(isolated.OCTOCODE_HOME, { recursive: true, force: true });
  }
  console.log(JSON.stringify({ out, ...run.totals }));
  if (stopped || run.totals.errors || !run.provenance.nativeUnchanged || !run.provenance.fixturesUnchanged) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
