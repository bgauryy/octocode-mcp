// Tool health: a fast end-to-end check of every contract tool through BOTH the
// built CLI (`packages/octocode/out/octocode.js <tool> <json> --json`) and the
// MCP stdio server (`packages/octocode-mcp/dist/index.js`).
//
// Per tool (cases in harness/tool-health/cases.mjs):
//   happy        documented primary operation: exit 0, rows with the key fields,
//                output valid against the contract outputSchema
//   continuation replay the page lead (`next.<lead>`) to the end: every page has
//                rows, no row twice, union == the unpaged rows
//   empty        exit 1, every row status "empty", at least one hint or lead
//   invalid      a typed contract error (errorCode in the contract), exit 2
//   parity       CLI and MCP return the same payload and status class
//   latency      every call under the tool's budget (recorded)
//
// Hermetic: a temp OCTOCODE_HOME/HOME, no user GitHub token, local fixtures
// under fixtures/tool-health, and a loopback mock (tool-health/mock-server.mjs)
// for GitHub REST, the npm registry, git smart HTTP and the jev classifier.
// Every proxy variable points at a dead loopback port (NO_PROXY covers loopback),
// so any request that would leave the machine fails instead of passing silently.
// Tools run four at a time; tools sharing a provider rate group (`serialGroup`)
// run in one lane. A latency budget scales with measured CLI startup, capped x4.
//
// Usage: node octocode-local-testing/harness/tool-health.mjs [tool,...]
// Output: one line per tool, a summary line, results/tool-health.json; exit 1 on any FAIL.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, FIXTURES, startServer, expandShared, writeResults } from './mcp-client.mjs';
import { startMock } from './tool-health/mock-server.mjs';
import { CASES } from './tool-health/cases.mjs';

const started = performance.now();
const FIXTURE = path.join(FIXTURES, 'tool-health');
const CLI = path.join(ROOT, 'packages/octocode/out/octocode.js');
const CONCURRENCY = 4;
const MAX_PAGES = 12;
/** A calm machine's CLI invalid-input round trip; above it the latency budget scales, up to MAX_LOAD_FACTOR. */
const CALM_CLI_MS = 500;
const MAX_LOAD_FACTOR = 4;
const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/octocode-config/contract/tool-contract.json'), 'utf8'));
const PAGE_LEADS = new Set(contract.continuationChannels.kinds.pages);
const ERROR_CODES = new Set(Object.keys(contract.errorCodes));
const selected = process.argv[2]?.split(',');

// ---- contract output validation (ajv is a root dev dependency)
const require = createRequire(path.join(ROOT, 'package.json'));
const Ajv2020 = require('ajv/dist/2020').default;
const addFormats = require('ajv-formats').default ?? require('ajv-formats');
const ajv = new Ajv2020({ strict: false, allErrors: false, validateFormats: true });
addFormats(ajv);
const validators = new Map();
const validateOutput = (tool, json) => {
  if (!validators.has(tool)) validators.set(tool, ajv.compile(contract.tools.find(t => t.name === tool).outputSchema));
  const validate = validators.get(tool);
  return validate(json) ? null : `${validate.errors[0].instancePath || '/'} ${validate.errors[0].message}`;
};

// ---- hermetic environment
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'octocode-tool-health-'));
const HOME = path.join(TMP, 'home');
fs.mkdirSync(HOME, { recursive: true });
const DEAD_PROXY = `http://127.0.0.1:${9}`;
const FAKE_TOKEN = ['th', 'fake', 'credential', String(process.pid)].join('-');
const baseEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(GITHUB_|GH_|OCTOCODE_|NPM_CONFIG_|npm_config_|GIT_)/.test(k) && !['ALLOWED_PATHS', 'WORKSPACE_ROOT', 'TOOLS_TO_RUN', 'DISABLE_TOOLS'].includes(k)));

const mock = await startMock({ fixtureDir: FIXTURE, tmpDir: TMP, token: FAKE_TOKEN });
const env = {
  ...baseEnv,
  HOME, USERPROFILE: HOME, XDG_CONFIG_HOME: path.join(HOME, '.config'), GH_CONFIG_DIR: path.join(HOME, '.gh'),
  GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0',
  // Network-hermetic by construction: anything not bound for loopback goes to a dead port.
  NO_PROXY: '127.0.0.1,localhost,::1', no_proxy: '127.0.0.1,localhost,::1',
  HTTPS_PROXY: DEAD_PROXY, https_proxy: DEAD_PROXY, HTTP_PROXY: DEAD_PROXY, http_proxy: DEAD_PROXY, ALL_PROXY: DEAD_PROXY, all_proxy: DEAD_PROXY,
  OCTOCODE_HOME: path.join(HOME, '.octocode'), OCTOCODE_BETA: 'true', OCTOCODE_LSP_AUTO_INSTALL: 'false',
  GITHUB_API_URL: `${mock.url}/api/v3`, OCTOCODE_ALLOW_PRIVATE_REGISTRY: 'true',
  OCTOCODE_CLASSIFICATION_API_HOST: mock.url,
};
env['GITHUB_' + 'TOKEN'] = FAKE_TOKEN;
env['OCTOCODE_CLASSIFICATION_' + 'API'] = FAKE_TOKEN;
const ctx = { mock, fixture: FIXTURE };

// ---- surfaces
/** The CLI, asynchronously so tools run in parallel. */
function cliCall(tool, input, extraEnv = {}) {
  return cliArgs([tool, JSON.stringify(input), '--json'], extraEnv);
}
function cliArgs(args, extraEnv = {}) {
  return new Promise(resolve => {
    const t0 = performance.now();
    const child = spawn(process.execPath, [CLI, ...args], { cwd: FIXTURE, env: { ...env, ...extraEnv } });
    let stdout = '', stderr = '';
    child.stdout.on('data', c => { stdout += c; });
    child.stderr.on('data', c => { stderr += c; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 120_000);
    child.on('close', status => {
      clearTimeout(timer);
      let json; try { json = JSON.parse(stdout); } catch {}
      resolve({ surface: 'cli', status, json: expandShared(json), stdout, stderr, ms: Math.round(performance.now() - t0) });
    });
  });
}

let mcp;
async function mcpCall(tool, input) {
  const entry = await mcp.raw(tool, input);
  let json = entry.sc;
  if (!json) { try { json = JSON.parse(entry.text); } catch {} }
  return { surface: 'mcp', isError: entry.isError, json: expandShared(json), text: entry.text, ms: entry.ms };
}

/** Rows of a response: `results` for every tool, `queries` for clasify. */
const rowsOf = json => json?.results ?? json?.queries ?? [];
const dataOf = row => row?.data ?? row;
/** Status class from the payload alone: invalid | empty | error | ok | broken. */
function statusClass(json) {
  if (!json || typeof json !== 'object') return 'broken';
  if (json.errorCode || json.error) return json.errorCode === 'invalidInput' ? 'invalid' : `error:${json.errorCode}`;
  const rows = rowsOf(json);
  if (!rows.length) return 'broken';
  if (rows.some(r => r.status === 'error' || r.error || (r.resources ?? []).some(x => x.error))) return 'error';
  if (rows.every(r => r.status === 'empty')) return 'empty';
  return 'ok';
}
const EXIT = { ok: 0, empty: 1, invalid: 2 };
const firstError = json => { const row = rowsOf(json).find(r => r.status === 'error' || r.error || r.resources?.some(x => x.error)); const d = dataOf(row); const e = d?.resources?.find(x => x.error)?.error ?? d; return e ? `${e.errorCode}: ${String(e.error ?? '').slice(0, 140)}` : ''; };

/** A continuation lead of `data.next`: { tool, query }. */
const leadOf = (json, lead) => dataOf(rowsOf(json)[0])?.next?.[lead];
const hasHintOrLead = data => {
  const hints = data?.hints;
  const n = hints && typeof hints === 'object' ? Object.entries(hints).filter(([k, v]) => k === 'text' ? v?.length : v?.tool).length : 0;
  return n > 0 || Object.keys(data?.next ?? {}).length > 0;
};

/**
 * What both surfaces must agree on: the evidence and its continuations. `hints`
 * are surface guidance: the CLI may lead to CLI-only tools (contract `cliOnly`,
 * e.g. ghCloneRepo) where MCP, which omits those tools, gives text instead; the
 * empty checks assert a hint on each surface separately. Drops `hints`, and
 * `next` leads to CLI-only tools (and a `next` they leave empty), from a copy.
 */
const CLI_ONLY = new Set(contract.tools.filter(t => t.cliOnly).map(t => t.name));
function parityView(json) {
  const strip = node => {
    if (Array.isArray(node)) return node.map(strip);
    if (!node || typeof node !== 'object') return node;
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === 'hints') continue;
      if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.tool === 'string' && CLI_ONLY.has(v.tool)) continue;
      const value = strip(v);
      if (k === 'next' && value && typeof value === 'object' && !Object.keys(value).length) continue;
      out[k] = value;
    }
    return out;
  };
  return strip(json);
}

const canon = value => Array.isArray(value) ? value.map(canon) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canon(value[k])])) : value;
function firstDiff(a, b, at = '') {
  if (JSON.stringify(canon(a)) === JSON.stringify(canon(b))) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = firstDiff(a[k], b[k], `${at}/${k}`); if (d) return d; }
  }
  return `${at || '/'}: cli=${JSON.stringify(a)?.slice(0, 80)} mcp=${JSON.stringify(b)?.slice(0, 80)}`;
}

// ---- environment capabilities (a missing one is a SKIP with its reason, never silent)
function lspAvailable() {
  const names = ['tsgo', 'tsserver', 'typescript-language-server'];
  for (let dir = FIXTURE; ; dir = path.dirname(dir)) {
    for (const n of names) if (fs.existsSync(path.join(dir, 'node_modules/.bin', n))) return null;
    if (path.dirname(dir) === dir) break;
  }
  for (const n of names) if (spawnSync('which', [n], { encoding: 'utf8' }).status === 0) return null;
  return 'no TypeScript language server (tsgo, tsserver or typescript-language-server) in node_modules/.bin or PATH';
}
const needs = {
  lsp: lspAvailable,
  clone: () => mock.git ? null : `git smart-HTTP mock unavailable: ${mock.gitUnavailable}`,
};

// ---- one tool
async function runTool(name, spec) {
  const cliOnly = spec.cliOnly;
  const checks = [];
  const timings = [];
  const skips = [];
  const record = (check, ok, detail = '') => { checks.push({ check, ok: !!ok, detail: String(detail).slice(0, 300) }); return !!ok; };
  const na = (check, reason) => checks.push({ check, ok: null, na: reason });
  let phase = 'happy';
  const timed = res => { timings.push({ phase, surface: res.surface, ms: res.ms }); return res; };
  const call = async (input, surface) => timed(surface === 'mcp' ? await mcpCall(name, input) : await cliCall(name, input));
  const q = query => ({ queries: [typeof query === 'function' ? query(ctx) : query] });
  const surfaces = cliOnly ? ['cli'] : ['cli', 'mcp'];
  const t0 = performance.now();
  const unhandledBefore = mock.unhandled.length;

  const skipReason = spec.needs ? needs[spec.needs]() : null;
  if (skipReason) return { tool: name, status: 'SKIP', reason: skipReason, checks, timings, ms: 0 };

  // (a) happy path, (e) parity, (f) latency
  const happy = {};
  for (const s of surfaces) happy[s] = await call(q(spec.happy.query), s);
  for (const s of surfaces) {
    const res = happy[s];
    const cls = statusClass(res.json);
    if (s === 'cli') record('happy.exit', res.status === 0, `exit ${res.status}, class ${cls}${cls !== 'ok' ? ` ${firstError(res.json) || res.stdout.slice(0, 160) || res.stderr.slice(0, 160)}` : ''}`);
    else record('happy.mcp', !res.isError && cls === 'ok', `isError ${res.isError}, class ${cls} ${firstError(res.json) || (cls === 'broken' ? res.text.slice(0, 160) : '')}`);
    if (cls === 'ok') {
      const data = dataOf(rowsOf(res.json)[0]);
      const missing = spec.happy.fields.filter(f => data?.[f] === undefined);
      record(`happy.fields.${s}`, !missing.length, missing.length ? `missing ${missing.join(', ')} in ${Object.keys(data ?? {}).join(',')}` : '');
      const ids = spec.happy.rows(data, res.json);
      record(`happy.rows.${s}`, ids.length >= spec.happy.min && new Set(ids).size === ids.length, `${ids.length} rows (min ${spec.happy.min}), ${ids.length - new Set(ids).size} duplicate`);
      const err = validateOutput(name, res.json);
      record(`happy.contract.${s}`, !err, err ?? '');
      if (spec.happy.check) { const why = spec.happy.check(data); record(`happy.check.${s}`, !why, why ?? ''); }
    }
  }
  if (happy.cli.json && statusClass(happy.cli.json) === 'error' && spec.skipOnError) {
    const reason = spec.skipOnError(happy.cli.json);
    if (reason) { checks.length = 0; skips.push(`happy: ${reason}`); }
  }
  if (!cliOnly) {
    const d = firstDiff(parityView(happy.cli.json), parityView(happy.mcp.json));
    record('parity.happy', !d && statusClass(happy.cli.json) === statusClass(happy.mcp.json), d ?? '');
  } else na('parity', 'CLI-only per contract (not exposed over MCP)');

  // (b) continuation
  phase = 'continuation';
  if (spec.page.na) na('continuation', spec.page.na);
  else if (!skips.length) {
    record('continuation.lead', PAGE_LEADS.has(spec.page.lead), `${spec.page.lead} is ${PAGE_LEADS.has(spec.page.lead) ? '' : 'not '}a contract page channel`);
    const unpaged = spec.page.unpaged ? await call(q(spec.page.unpaged), 'cli') : happy.cli;
    const rowsFn = spec.page.rows ?? spec.happy.rows;
    const expected = spec.page.expect ? spec.page.expect(ctx) : statusClass(unpaged.json) === 'ok' ? rowsFn(dataOf(rowsOf(unpaged.json)[0]), unpaged.json) : [];
    for (const s of surfaces) {
      let res = await call(q(spec.page.query), s);
      const seen = [];
      let pages = 0, problem = '';
      for (;;) {
        const cls = statusClass(res.json);
        if (cls !== 'ok') { problem = `page ${pages + 1} class ${cls} ${firstError(res.json)}`; break; }
        const ids = rowsFn(dataOf(rowsOf(res.json)[0]), res.json);
        if (!ids.length) { problem = `page ${pages + 1} has no rows`; break; }
        const dup = ids.find(id => seen.includes(id));
        if (dup) { problem = `page ${pages + 1} repeats ${dup}`; break; }
        seen.push(...ids);
        pages++;
        const lead = leadOf(res.json, spec.page.lead);
        if (!lead) break;
        if (pages >= MAX_PAGES) { problem = `still paging after ${MAX_PAGES} pages`; break; }
        if (lead.tool !== name) { problem = `lead names ${lead.tool}`; break; }
        res = await call(lead.query, s);
      }
      if (!problem && pages < 2) problem = `no next.${spec.page.lead} on page 1 (${seen.length} rows)`;
      const missing = expected.filter(id => !seen.includes(id));
      const extra = seen.filter(id => !expected.includes(id));
      if (!problem && (missing.length || extra.length)) problem = `paged union differs from unpaged: missing ${missing.slice(0, 3).join(', ') || '-'}, extra ${extra.slice(0, 3).join(', ') || '-'}`;
      record(`continuation.${s}`, !problem, problem || `${pages} pages, ${seen.length} rows`);
    }
  }

  // (c) empty
  phase = 'empty';
  if (spec.empty.na) na('empty', spec.empty.na);
  else {
    const res = {};
    for (const s of surfaces) res[s] = await call(q(spec.empty.query), s);
    const cls = statusClass(res.cli.json);
    const data = dataOf(rowsOf(res.cli.json)[0]);
    record('empty.exit', res.cli.status === 1 && cls === 'empty', `exit ${res.cli.status}, class ${cls} ${firstError(res.cli.json)}`);
    record('empty.hint.cli', rowsOf(res.cli.json).every(r => hasHintOrLead(dataOf(r))), `hints ${JSON.stringify(data?.hints ?? null).slice(0, 120)}`);
    if (!cliOnly) record('empty.hint.mcp', rowsOf(res.mcp.json).length && rowsOf(res.mcp.json).every(r => hasHintOrLead(dataOf(r))), `MCP empty row has no hint or lead: data ${JSON.stringify(dataOf(rowsOf(res.mcp.json)[0]) ?? null).slice(0, 140)}`);
    if (cls === 'empty') { const err = validateOutput(name, res.cli.json); record('empty.contract', !err, err ?? ''); }
    if (!cliOnly) { const d = firstDiff(parityView(res.cli.json), parityView(res.mcp.json)); record('parity.empty', !d && statusClass(res.mcp.json) === cls, d ?? `mcp class ${statusClass(res.mcp.json)}`); }
  }

  // (d) invalid input
  phase = 'invalid';
  {
    const res = {};
    for (const s of surfaces) res[s] = await call(q(spec.invalid.query), s);
    const code = res.cli.json?.errorCode;
    record('invalid.exit', res.cli.status === EXIT.invalid && statusClass(res.cli.json) === 'invalid', `exit ${res.cli.status}, errorCode ${code}`);
    record('invalid.typed', ERROR_CODES.has(code) && typeof res.cli.json?.error === 'string' && res.cli.json.error.length > 0, `errorCode ${code}`);
    if (!cliOnly) record('parity.invalid', res.mcp.isError && res.mcp.json?.errorCode === code, `mcp isError ${res.mcp.isError}, errorCode ${res.mcp.json?.errorCode ?? res.mcp.text.slice(0, 100)}`);
  }

  // tool-specific extras (e.g. clone auth, disabled clasify)
  phase = 'extra';
  if (spec.extra) for (const [check, ok, detail] of await spec.extra({ ...ctx, call, cliCall, q, happy, skips })) record(check, ok, detail);

  // (f) latency
  // A loaded machine slows every process start: scale the budget by the tool's own
  // invalid-input CLI round trip (pure startup + validation) over a calm one, capped.
  const slowest = timings.reduce((m, t) => Math.max(m, t.ms), 0);
  const overhead = timings.find(t => t.phase === 'invalid' && t.surface === 'cli')?.ms ?? CALM_CLI_MS;
  const load = Math.min(MAX_LOAD_FACTOR, Math.max(1, overhead / CALM_CLI_MS));
  const budget = Math.round(spec.budgetMs * load);
  record('latency', slowest <= budget, `slowest call ${slowest}ms (budget ${budget}ms = ${spec.budgetMs}ms x load ${load.toFixed(2)}; CLI startup ${overhead}ms)`);
  const newUnhandled = mock.unhandled.slice(unhandledBefore);
  const failed = checks.filter(c => c.ok === false);
  const status = failed.length ? 'FAIL' : skips.length ? 'SKIP' : 'PASS';
  return {
    tool: name, status, reason: skips.join('; ') || undefined, ms: Math.round(performance.now() - t0), slowestMs: slowest, budgetMs: budget, calls: timings.length,
    happySample: failed.length ? happy.cli?.stdout?.slice(0, 2000) : undefined,
    firstFailure: failed[0] ? `${failed[0].check}: ${failed[0].detail}` : undefined,
    ...(newUnhandled.length && { mockUnhandled: newUnhandled }), checks, timings,
  };
}

// ---- run
const report = { at: new Date().toISOString(), tools: [], coverage: {} };
let exitCode = 0;
try {
  // Coverage: every contract tool has a case, every case a contract tool.
  const contractTools = contract.tools.map(t => t.name);
  const noCase = contractTools.filter(t => !CASES[t]);
  const stale = Object.keys(CASES).filter(t => !contractTools.includes(t));
  report.coverage = { contractTools, noCase, stale };
  if (noCase.length || stale.length) { console.log(`FAIL coverage — tools without a case: ${noCase.join(', ') || '-'}; cases without a contract tool: ${stale.join(', ') || '-'}`); exitCode = 1; }

  // Surfaces list every tool: CLI schema (beta on) and MCP tools/list (non-CLI-only).
  const schema = await cliArgs(['schema']);
  mcp = await startServer({ cwd: FIXTURE, env: Object.assign(Object.fromEntries(Object.keys(process.env).filter(k => !(k in env)).map(k => [k, undefined])), env), timeoutMs: 60_000 });
  const cliTools = (() => { try { return JSON.parse(schema.stdout).tools.map(t => t.name); } catch { return []; } })();
  const mcpTools = mcp.tools.map(t => t.name);
  const cliMissing = contractTools.filter(t => !cliTools.includes(t));
  const mcpExpected = contract.tools.filter(t => !t.cliOnly).map(t => t.name);
  const mcpMissing = mcpExpected.filter(t => !mcpTools.includes(t));
  const mcpExtra = mcpTools.filter(t => !mcpExpected.includes(t));
  report.surfaces = { cliTools, mcpTools, cliMissing, mcpMissing, mcpExtra };
  if (cliMissing.length || mcpMissing.length || mcpExtra.length) {
    console.log(`FAIL surfaces — CLI schema lacks: ${cliMissing.join(', ') || '-'}; MCP lacks: ${mcpMissing.join(', ') || '-'}; MCP exposes CLI-only: ${mcpExtra.join(', ') || '-'}`);
    exitCode = 1;
  }

  // One job per tool, except tools that share a provider rate group (`serialGroup`):
  // those run one after another in a single job, first, since it is the longest.
  const jobs = new Map();
  for (const t of contractTools.filter(t => CASES[t] && (!selected || selected.includes(t)))) {
    const spec = { ...CASES[t], cliOnly: contract.tools.find(x => x.name === t).cliOnly };
    const key = spec.serialGroup ?? t;
    jobs.set(key, [...(jobs.get(key) ?? []), [t, spec]]);
  }
  const queue = [...jobs.values()].sort((a, b) => b.length - a.length);
  const results = new Map();
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) for (const [name, spec] of queue.shift()) {
      let result;
      try { result = await runTool(name, spec); } catch (error) { result = { tool: name, status: 'FAIL', firstFailure: `harness: ${error.stack?.split('\n').slice(0, 2).join(' ') ?? error}`, checks: [], timings: [] }; }
      results.set(name, result);
      const line = `${result.status.padEnd(4)} ${name.padEnd(17)} ${String(result.ms ?? 0).padStart(6)}ms  slowest ${String(result.slowestMs ?? 0).padStart(5)}/${String(result.budgetMs ?? '-').padEnd(5)}ms  ${result.checks.filter(c => c.ok).length}/${result.checks.filter(c => c.ok !== null).length} checks`;
      const tail = result.status === 'FAIL' ? ` — ${result.firstFailure}` : result.reason ? ` — ${result.reason}` : '';
      console.log(line + tail + (result.mockUnhandled ? ` [mock unhandled: ${result.mockUnhandled.slice(0, 2).join('; ')}]` : ''));
    }
  });
  await Promise.all(workers);
  report.tools = contractTools.filter(t => results.has(t)).map(t => results.get(t));
} catch (error) {
  console.log(`FAIL harness — ${error.stack ?? error}`);
  exitCode = 1;
} finally {
  mcp?.close();
  await mock.close();
  fs.rmSync(TMP, { recursive: true, force: true });
}
const count = s => report.tools.filter(t => t.status === s).length;
if (count('FAIL')) exitCode = 1;
report.seconds = Number(((performance.now() - started) / 1000).toFixed(1));
report.summary = { pass: count('PASS'), fail: count('FAIL'), skip: count('SKIP'), exitCode };
const file = writeResults('tool-health', report);
console.log(`\ntool-health: ${count('PASS')} passed, ${count('FAIL')} failed, ${count('SKIP')} skipped of ${report.tools.length} tools in ${report.seconds}s — ${path.relative(ROOT, file)}`);
process.exitCode = exitCode;
