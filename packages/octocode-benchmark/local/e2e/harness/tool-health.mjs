// Tool health: a fast end-to-end check of every contract tool through BOTH the
// built CLI (`packages/octocode/out/octocode.js <tool> <json> --json`) and the
// MCP stdio server (`packages/octocode-mcp/dist/index.js`).
//
// Per tool (cases in harness/tool-health/cases.mjs):
//   happy        documented primary operation: exit 0, rows with the key fields,
//                output valid against the contract outputSchema
//   continuation the page lead (`next.<lead>`) walked to its end: every page has
//                rows, no row twice, union == the unpaged rows; extra walks
//                (`walks`) cover the tool's other page channels
//   explore      every seed (happy, page, empty, `explore`, `walks`) is explored
//                by tool-health/driver.mjs: every response contract-valid, every
//                next.*/hints.* lead executed once (a repeated lead fails),
//                accepted and holding its key family's predicates
//                (lead-predicates.mjs), hints/warnings carry per-call facts only
//   empty        exit 1, every row status "empty", at least one hint or lead
//   invalid      a typed contract error (errorCode in the contract), exit 2
//   parity       CLI and MCP return the same payload, status class and query graph
//   latency      every call under the tool's budget (recorded)
//
// Hermetic: a temp OCTOCODE_HOME/HOME, no user GitHub token, local fixtures
// under fixtures/tool-health (or a per-tool temp workspace built from it), and
// a loopback mock (tool-health/mock-server.mjs) for GitHub REST, the npm
// registry, git smart HTTP and the jev classifier. Every proxy variable points
// at a dead loopback port (NO_PROXY covers loopback), so any request that would
// leave the machine fails instead of passing silently. Each tool and surface
// has its own fake GitHub token and its own MCP server, so the runtime's
// per-credential search pacing never queues one tool behind another and every
// tool runs in parallel. A latency budget scales with measured CLI startup, capped x4.
//
// Usage: node packages/octocode-benchmark/local/e2e/harness/tool-health.mjs [tool,...] [--deep]
//   --deep  explore further: more non-page leads per seed and longer page walks
// Output: one line per tool, a summary line, results/tool-health.json; exit 1 on any FAIL.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, FIXTURES, startServer, expandShared, writeResults } from './mcp-client.mjs';
import { properties } from './lead-predicates.mjs';
import { addBulkPullRequest, startMock } from './tool-health/mock-server.mjs';
import { CASES } from './tool-health/cases.mjs';
import { createQueryDefaults } from './query-defaults.mjs';
import { createDriver, dataOf, rowsOf, statusClass } from './tool-health/driver.mjs';

const started = performance.now();
const FIXTURE = path.join(FIXTURES, 'tool-health');
const CLI = path.join(ROOT, 'packages/octocode/out/octocode.js');
const args = process.argv.slice(2);
const DEEP = args.includes('--deep');
const selected = args.find(a => !a.startsWith('--'))?.split(',');
const CONCURRENCY = 8;
/** Non-page leads executed per explored seed, and the page cap of one walk. */
const MAX_CALLS = DEEP ? 40 : 6;
// Pages per walk: a runaway guard, not a size bound. The 3,000-line patch
// fixture takes about 12 pages at the default 20,000-char page.
const MAX_PAGES = DEEP ? 40 : 24;
/** A calm machine's CLI invalid-input round trip; above it the latency budget scales, up to MAX_LOAD_FACTOR. */
const CALM_CLI_MS = 500;
const MAX_LOAD_FACTOR = 4;
const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/octocode-config/contract/tool-contract.json'), 'utf8'));
const PAGE_LEADS = new Set(contract.continuationChannels.kinds.pages);
const ERROR_CODES = new Set(Object.keys(contract.errorCodes));
const CLI_ONLY = new Set(contract.tools.filter(t => t.cliOnly).map(t => t.name));
const TOOLS = new Set(contract.tools.map(t => t.name));
/** Parked tools (contract `disabled`) run on no surface, beta included. */
const PARKED = new Set(contract.tools.filter(t => t.disabled).map(t => t.name));

// ---- contract output validation (ajv and ajv-formats are devDependencies of this package)
const require = createRequire(import.meta.url);
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
/** The canonical input schema's verdict on a whole call: null when it accepts. */
const inputValidators = new Map();
const validateInput = (tool, input) => {
  if (!inputValidators.has(tool)) inputValidators.set(tool, ajv.compile(contract.tools.find(t => t.name === tool).inputSchema));
  const validate = inputValidators.get(tool);
  return validate(input) ? null : `${validate.errors[0].instancePath || '/'} ${validate.errors[0].message}`;
};

// ---- hermetic environment
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'octocode-tool-health-'));
const HOME = path.join(TMP, 'home');
fs.mkdirSync(HOME, { recursive: true });
const DEAD_PROXY = `http://127.0.0.1:${9}`;
/** One fake credential per tool and surface: the runtime paces GitHub searches per credential. */
const tokenFor = (tool, surface) => ['th', 'fake', tool, surface, String(process.pid)].join('-');
const ALL_TOKENS = contract.tools.flatMap(t => ['cli', 'mcp'].map(s => tokenFor(t.name, s)));
const baseEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(GITHUB_|GH_|OCTOCODE_|NPM_CONFIG_|npm_config_|GIT_)/.test(k) && !['ALLOWED_PATHS', 'WORKSPACE_ROOT', 'TOOLS_TO_RUN', 'DISABLE_TOOLS'].includes(k)));

const mock = await startMock({ fixtureDir: FIXTURE, tmpDir: TMP, token: ALL_TOKENS, configureModel: addBulkPullRequest });
const env = {
  ...baseEnv,
  HOME, USERPROFILE: HOME, XDG_CONFIG_HOME: path.join(HOME, '.config'), GH_CONFIG_DIR: path.join(HOME, '.gh'),
  GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0',
  // Network-hermetic by construction: anything not bound for loopback goes to a dead port.
  NO_PROXY: '127.0.0.1,localhost,::1', no_proxy: '127.0.0.1,localhost,::1',
  HTTPS_PROXY: DEAD_PROXY, https_proxy: DEAD_PROXY, HTTP_PROXY: DEAD_PROXY, http_proxy: DEAD_PROXY, ALL_PROXY: DEAD_PROXY, all_proxy: DEAD_PROXY,
  OCTOCODE_HOME: path.join(HOME, '.octocode'), OCTOCODE_BETA: 'true', OCTOCODE_LSP_AUTO_INSTALL: 'off',
  GITHUB_API_URL: `${mock.url}/api/v3`, OCTOCODE_ALLOW_PRIVATE_REGISTRY: 'true',
  OCTOCODE_CLASSIFICATION_API_HOST: mock.url,
};
const envFor = (tool, surface) => ({ ...env, ['GITHUB_' + 'TOKEN']: tokenFor(tool, surface), ['OCTOCODE_CLASSIFICATION_' + 'API']: tokenFor(tool, surface) });
const ctx = { mock, fixture: FIXTURE, tmp: TMP };

// ---- surfaces
/** The CLI, asynchronously so tools run in parallel. */
function cliArgs(cliArgv, { tool = 'schema', cwd = FIXTURE, extraEnv = {} } = {}) {
  return new Promise(resolve => {
    const t0 = performance.now();
    const child = spawn(process.execPath, [CLI, ...cliArgv], { cwd, env: { ...envFor(tool, 'cli'), ...extraEnv } });
    let stdout = '', stderr = '';
    child.stdout.on('data', c => { stdout += c; });
    child.stderr.on('data', c => { stderr += c; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 120_000);
    child.on('close', status => {
      clearTimeout(timer);
      let raw; try { raw = JSON.parse(stdout); } catch {}
      const json = expandShared(raw);
      resolve({ surface: 'cli', status, raw, json, sc: json, text: stdout + stderr, stdout, stderr, isError: !raw || (status !== 0 && !(status === 1 && ['empty', 'outOfRange'].includes(statusClass(raw)))), ms: Math.round(performance.now() - t0) });
    });
  });
}
const cliCall = (tool, input, opts = {}) => cliArgs([tool, JSON.stringify(input), '--json'], { tool, ...opts });

async function mcpServer(tool, cwd) {
  const serverEnv = envFor(tool, 'mcp');
  return startServer({ cwd, env: Object.assign(Object.fromEntries(Object.keys(process.env).filter(k => !(k in serverEnv)).map(k => [k, undefined])), serverEnv), timeoutMs: 60_000 });
}
async function mcpCall(server, tool, input) {
  const entry = await server.raw(tool, input, '', { keepRaw: true });
  let raw = entry.raw;
  if (!raw) { try { raw = JSON.parse(entry.text); } catch {} }
  const json = expandShared(raw);
  return { surface: 'mcp', isError: entry.isError, raw, json, sc: json, text: entry.text, ms: entry.ms };
}

const firstError = json => { const row = rowsOf(json).find(r => r.status === 'error' || r.error); const e = dataOf(row); return e ? `${e.errorCode}: ${String(e.error ?? '').slice(0, 140)}` : ''; };
const EXIT = { ok: 0, empty: 1, invalid: 2, tool: 5 };
const hasHintOrLead = data => {
  const hints = data?.hints;
  const n = Array.isArray(hints) && hints.every(hint => typeof hint === 'string' && hint.trim()) ? hints.length : 0;
  return n > 0 || Object.keys(data?.next ?? {}).length > 0;
};

/**
 * What both surfaces must agree on: the evidence and its continuations. `hints`
 * are surface guidance: the CLI may lead to CLI-only tools (contract `cliOnly`,
 * e.g. ghCloneRepo) where MCP, which omits those tools, gives text instead; the
 * empty checks assert a hint on each surface separately. Drops `hints`, and
 * `next` leads to CLI-only tools (and a `next` they leave empty), from a copy.
 */
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

const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
function firstDiff(a, b, at = '') {
  if (JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))) return null;
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

// ---- the driver: static text of both surfaces, accepted query fields
let driver;
const queryFields = new Map(contract.tools.map(t => [t.name, properties(t.querySchema)]));

// ---- one parked tool: the CLI refuses its happy and invalid seeds alike with
// the one disabled error (exit 5) and does nothing; MCP never lists it (the
// surfaces check). Its case stays for the day it returns.
async function runParked(name, spec) {
  const t0 = performance.now();
  const disabled = { error: `Tool ${name} is not available in this native runtime: it is disabled in this build.`, errorCode: 'toolUnavailable' };
  const checks = [];
  const timings = [];
  const resolve = query => (typeof query === 'function' ? query(ctx) : query);
  for (const [label, query] of [['happy', spec.happy.query], ['invalid', spec.invalid.query]]) {
    const res = await cliCall(name, { queries: [resolve(query)] });
    timings.push({ phase: label, surface: 'cli', ms: res.ms });
    const ok = res.status === EXIT.tool && JSON.stringify(res.raw) === JSON.stringify(disabled);
    checks.push({ check: `parked.${label}`, ok, detail: `exit ${res.status} ${res.stdout.slice(0, 200)}` });
  }
  const failed = checks.filter(c => !c.ok);
  return {
    tool: name, status: failed.length ? 'FAIL' : 'PASS', reason: 'parked (disabled on every surface)', ms: Math.round(performance.now() - t0),
    slowestMs: Math.max(...timings.map(t => t.ms)), calls: timings.length,
    firstFailure: failed[0] ? `${failed[0].check}: ${failed[0].detail}` : undefined, checks, timings,
  };
}

// ---- one tool
async function runTool(name, spec) {
  const cliOnly = spec.cliOnly;
  const checks = [];
  const timings = [];
  const skips = [];
  const record = (check, ok, detail = '') => { checks.push({ check, ok: !!ok, detail: String(detail).slice(0, 300) }); return !!ok; };
  const na = (check, reason) => checks.push({ check, ok: null, na: reason });
  let phase = 'happy';
  const surfaces = cliOnly ? ['cli'] : ['cli', 'mcp'];
  const t0 = performance.now();

  const skipReason = spec.needs ? needs[spec.needs]() : null;
  if (skipReason) return { tool: name, status: 'SKIP', reason: skipReason, checks, timings, ms: 0 };

  const cwd = spec.workspace ? spec.workspace({ ...ctx, name }) : FIXTURE;
  const server = cliOnly ? null : await mcpServer(name, cwd);
  const timed = res => { timings.push({ phase, surface: res.surface, ms: res.ms }); return res; };
  /** Any tool on one surface, in this tool's workspace and with its credential. */
  const callOn = surface => async (tool, input) => timed(surface === 'mcp' ? await mcpCall(server, tool, input) : await cliCall(tool, input, { cwd }));
  const call = (input, surface) => callOn(surface)(name, input);
  const resolve = query => (typeof query === 'function' ? query(ctx) : query);
  const q = query => ({ queries: [resolve(query)] });
  const withHints = query => ({ ...resolve(query), extras: ['hints'] });
  const reports = { cli: [], mcp: [] };
  const exploreOn = async (label, seed, opts = {}) => {
    const out = {};
    await Promise.all(surfaces.map(async s => {
      const report = await driver.explore(name, seed, { surface: s, call: callOn(s), maxCalls: MAX_CALLS, maxPages: MAX_PAGES, rows: (tool, key) => (tool === name ? spec.channels?.[key] ?? (key === spec.page.lead ? spec.page.rows ?? spec.happy.rows : undefined) : CASES[tool]?.channels?.[key]), root: cwd, ...opts });
      report.label = label;
      reports[s].push(report);
      out[s] = report;
      const seenFailures = new Set();
      for (const f of report.failures) {
        const k = `${f.check}|${f.detail}`;
        if (seenFailures.has(k)) continue;
        seenFailures.add(k);
        record(`explore.${label}.${s}.${f.check}`, false, `${f.detail} [at ${f.at}]`);
      }
      record(`explore.${label}.${s}`, true, `${report.calls.length} calls, ${report.chains.length} chains, ${report.skipped.length} skipped, ${report.budgetCut} over budget`);
    }));
    if (out.cli && out.mcp) { const d = driver.graphParity(out.cli, out.mcp); record(`parity.graph.${label}`, !d, d ?? ''); }
    return out;
  };

  try {
    // (a) happy path, (e) parity, (f) latency — the happy seed is explored with hints.
    const happyRuns = await exploreOn('happy', withHints(spec.happy.query), spec.happy.explore);
    const happy = Object.fromEntries(surfaces.map(s => [s, happyRuns[s].root]));
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

    // (b) continuation: the primary page channel, then the tool's other walks.
    phase = 'continuation';
    const walks = [...(spec.page.na ? [] : [{ label: 'page', ...spec.page }]), ...(spec.walks ?? [])];
    if (spec.page.na) na('continuation', spec.page.na);
    if (!skips.length) for (const walk of walks) {
      const tag = walk.label === 'page' ? 'continuation' : `walk.${walk.label}`;
      record(`${tag}.lead`, PAGE_LEADS.has(walk.lead), `${walk.lead} is ${PAGE_LEADS.has(walk.lead) ? '' : 'not '}a contract page channel`);
      const rowsFn = walk.rows ?? spec.channels?.[walk.lead] ?? spec.happy.rows;
      const unpaged = walk.unpaged ? await call(q(walk.unpaged), 'cli') : walk.label === 'page' ? happy.cli : null;
      const expected = walk.expect ? walk.expect(ctx) : unpaged && statusClass(unpaged.json) === 'ok' ? rowsFn(dataOf(rowsOf(unpaged.json)[0]), unpaged.json) : null;
      const runs = await exploreOn(walk.label, withHints(walk.query), { rows: (tool, key) => (tool === name && key === walk.lead ? rowsFn : spec.channels?.[key]) });
      for (const s of surfaces) {
        const report = runs[s];
        const chain = report.chains.find(c => c.key === walk.lead && c.from === 'seed');
        const rootCls = statusClass(report.root.json);
        let problem = '';
        if (rootCls !== 'ok') problem = `page 1 class ${rootCls} ${firstError(report.root.json)}`;
        else if (!chain) problem = `no next.${walk.lead} on page 1`;
        else if (chain.pages < (walk.minPages ?? 2)) problem = `${chain.pages} pages (min ${walk.minPages ?? 2})`;
        else if (!chain.ended) problem = `walk did not end within ${MAX_PAGES} pages`;
        else if (chain.rows.length === 0) problem = 'no rows on any page';
        else if (expected) {
          const missing = expected.filter(x => !chain.seenRows.has(x));
          const extra = chain.rows.filter(x => !expected.includes(x));
          if (missing.length || extra.length) problem = `paged union differs from unpaged: missing ${missing.length} (${missing.slice(0, 3).join(', ') || '-'}), extra ${extra.length} (${extra.slice(0, 3).join(', ') || '-'})`;
        }
        if (!problem && walk.check) problem = walk.check(chain.rows, ctx) ?? '';
        record(`${tag}.${s}`, !problem, problem || `${chain.pages} pages, ${chain.rows.length} rows`);
      }
    }

    // (c) empty
    phase = 'empty';
    if (spec.empty.na) na('empty', spec.empty.na);
    else {
      const runs = await exploreOn('empty', withHints(spec.empty.query));
      const res = Object.fromEntries(surfaces.map(s => [s, runs[s].root]));
      const cls = statusClass(res.cli.json);
      const data = dataOf(rowsOf(res.cli.json)[0]);
      record('empty.exit', res.cli.status === 1 && cls === 'empty', `exit ${res.cli.status}, class ${cls} ${firstError(res.cli.json)}`);
      record('empty.hint.cli', rowsOf(res.cli.json).every(r => hasHintOrLead(dataOf(r))), `hints ${JSON.stringify(data?.hints ?? null).slice(0, 120)}`);
      if (!cliOnly) {
        const ok = rowsOf(res.mcp.json).length && rowsOf(res.mcp.json).every(r => hasHintOrLead(dataOf(r)));
        record('empty.hint.mcp', ok, ok ? '' : `MCP empty row has no hint or lead: data ${JSON.stringify(dataOf(rowsOf(res.mcp.json)[0]) ?? null).slice(0, 140)}`);
      }
      if (!cliOnly) { const d = firstDiff(parityView(res.cli.json), parityView(res.mcp.json)); record('parity.empty', !d && statusClass(res.mcp.json) === cls, d ?? `mcp class ${statusClass(res.mcp.json)}`); }
    }

    // more seeds the tool's surface offers (operations, views), explored the same way
    phase = 'explore';
    for (const [i, seed] of (spec.explore ?? []).filter(x => DEEP || !x.deep).entries()) {
      const label = seed.label ?? `seed${i + 1}`;
      const runs = await exploreOn(label, withHints(seed.query));
      for (const s of surfaces) {
        const cls = statusClass(runs[s].root.json);
        record(`${label}.class.${s}`, cls === (seed.class ?? 'ok'), `class ${cls} (expected ${seed.class ?? 'ok'}) ${firstError(runs[s].root.json)}`);
        if (seed.check) { const why = seed.check(dataOf(rowsOf(runs[s].root.json)[0]), runs[s]); record(`${label}.check.${s}`, !why, why ?? ''); }
      }
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

    // per-call facts only: hints and warnings carry no static description text
    for (const s of surfaces) {
      const failures = driver.factsFailures(reports[s]);
      for (const f of failures) record(`${f.check}.${s}`, false, f.detail);
      if (!failures.length) record(`facts.${s}`, true, `${reports[s].reduce((n, r) => n + r.facts.length, 0)} responses`);
    }

    // tool-specific extras (e.g. clone auth and follow-up leads, apply on a copy, disabled clasify)
    phase = 'extra';
    if (spec.extra) for (const [check, ok, detail] of await spec.extra({ ...ctx, cwd, call, callOn, cliCall: (tool, input, { env: extraEnv, cwd: dir = cwd } = {}) => cliCall(tool, input, { cwd: dir, extraEnv }), q, surfaces, happy, happyRuns, reports, skips, validateOutput, validateInput })) record(check, ok, detail);
  } finally {
    server?.close();
  }

  // (f) latency
  // A loaded machine slows every process start: scale the budget by the tool's own
  // invalid-input CLI round trip (pure startup + validation) over a calm one, capped.
  const slowest = timings.reduce((m, t) => Math.max(m, t.ms), 0);
  const overhead = timings.find(t => t.phase === 'invalid' && t.surface === 'cli')?.ms ?? CALM_CLI_MS;
  const load = Math.min(MAX_LOAD_FACTOR, Math.max(1, overhead / CALM_CLI_MS));
  const budget = Math.round(spec.budgetMs * load);
  record('latency', slowest <= budget, `slowest call ${slowest}ms (budget ${budget}ms = ${spec.budgetMs}ms x load ${load.toFixed(2)}; CLI startup ${overhead}ms)`);
  const mine = new Set(['cli', 'mcp'].map(s => tokenFor(name, s)));
  const newUnhandled = mock.unhandledFrom.filter(u => mine.has(u.token)).map(u => u.request);
  const failed = checks.filter(c => c.ok === false);
  const status = failed.length ? 'FAIL' : skips.length ? 'SKIP' : 'PASS';
  const all = [...reports.cli, ...reports.mcp];
  return {
    tool: name, status, reason: skips.join('; ') || undefined, ms: Math.round(performance.now() - t0), slowestMs: slowest, budgetMs: budget, calls: timings.length,
    coverage: {
      seeds: reports.cli.map(r => r.label),
      leadKeys: [...new Set(all.flatMap(r => r.calls.filter(c => c.label !== 'seed').map(c => c.label.split(' > ').pop())))].sort(),
      chains: [...new Set(all.flatMap(r => r.chains.map(c => `${c.tool}.${c.key}`)))].sort(),
      skippedLeads: [...new Set(all.flatMap(r => r.skipped.map(x => `${x.key}: ${x.reason}`)))],
      overBudget: all.reduce((n, r) => n + r.budgetCut, 0),
    },
    firstFailure: failed[0] ? `${failed[0].check}: ${failed[0].detail}` : undefined,
    ...(newUnhandled.length && { mockUnhandled: newUnhandled }), checks, timings,
  };
}

// ---- run
const report = { at: new Date().toISOString(), deep: DEEP, tools: [], coverage: {} };
let exitCode = 0;
let surfaceServer;
try {
  // Coverage: every contract tool has a case, every case a contract tool.
  const contractTools = contract.tools.map(t => t.name);
  const noCase = contractTools.filter(t => !CASES[t]);
  const stale = Object.keys(CASES).filter(t => !contractTools.includes(t));
  report.coverage = { contractTools, noCase, stale };
  if (noCase.length || stale.length) { console.log(`FAIL coverage — tools without a case: ${noCase.join(', ') || '-'}; cases without a contract tool: ${stale.join(', ') || '-'}`); exitCode = 1; }

  // Surfaces list every tool: CLI schema (beta on) and MCP tools/list (non-CLI-only).
  const schema = await cliArgs(['schema']);
  surfaceServer = await mcpServer('schema', FIXTURE);
  const cliTools = (() => { try { return JSON.parse(schema.stdout).tools.map(t => t.name); } catch { return []; } })();
  const mcpTools = surfaceServer.tools.map(t => t.name);
  const cliExpected = contract.tools.filter(t => !t.disabled).map(t => t.name);
  const cliMissing = cliExpected.filter(t => !cliTools.includes(t));
  const mcpExpected = contract.tools.filter(t => !t.cliOnly && !t.disabled).map(t => t.name);
  const mcpMissing = mcpExpected.filter(t => !mcpTools.includes(t));
  const mcpExtra = mcpTools.filter(t => !mcpExpected.includes(t));
  report.surfaces = { cliTools, mcpTools, cliMissing, mcpMissing, mcpExtra };
  if (cliMissing.length || mcpMissing.length || mcpExtra.length) {
    console.log(`FAIL surfaces — CLI schema lacks: ${cliMissing.join(', ') || '-'}; MCP lacks: ${mcpMissing.join(', ') || '-'}; MCP exposes CLI-only: ${mcpExtra.join(', ') || '-'}`);
    exitCode = 1;
  }

  // Static text both surfaces publish once: server instructions, tool and field
  // descriptions. A response that repeats it carries a static note, not a fact.
  const strings = [];
  const collect = node => { if (typeof node === 'string') strings.push(node); else if (node && typeof node === 'object') Object.values(node).forEach(collect); };
  collect(surfaceServer.init?.instructions);
  collect(surfaceServer.tools);
  try { collect(JSON.parse(schema.stdout)); } catch {}
  await Promise.all(contractTools.map(async t => { const r = await cliArgs(['schema', t]); try { collect(JSON.parse(r.stdout)); } catch {} }));
  driver = createDriver({ validate: validateOutput, staticText: strings.join('\n'), tools: TOOLS, cliOnly: CLI_ONLY, propsOf: tool => queryFields.get(tool) ?? new Set(), defaultsOf: createQueryDefaults(contract.tools, ajv) });
  surfaceServer.close();
  surfaceServer = null;

  // One job per tool: each tool and surface has its own credential, so none waits on another's pacing.
  const queue = contractTools.filter(t => CASES[t] && (!selected || selected.includes(t))).map(t => [t, { ...CASES[t], cliOnly: CLI_ONLY.has(t) }]);
  // Longest first: tools with walks and LSP.
  queue.sort((a, b) => (b[1].budgetMs + (b[1].walks?.length ?? 0) * 5000) - (a[1].budgetMs + (a[1].walks?.length ?? 0) * 5000));
  const results = new Map();
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const [name, spec] = queue.shift();
      let result;
      try { result = PARKED.has(name) ? await runParked(name, spec) : await runTool(name, spec); } catch (error) { result = { tool: name, status: 'FAIL', firstFailure: `harness: ${error.stack?.split('\n').slice(0, 2).join(' ') ?? error}`, checks: [], timings: [] }; }
      results.set(name, result);
      const line = `${result.status.padEnd(4)} ${name.padEnd(17)} ${String(result.ms ?? 0).padStart(6)}ms  slowest ${String(result.slowestMs ?? 0).padStart(5)}/${String(result.budgetMs ?? '-').padEnd(5)}ms  ${String(result.calls ?? 0).padStart(3)} calls  ${result.checks.filter(c => c.ok).length}/${result.checks.filter(c => c.ok !== null).length} checks`;
      const failedCount = result.checks.filter(c => c.ok === false).length;
      const tail = result.status === 'FAIL' ? ` — ${result.firstFailure}${failedCount > 1 ? ` (+${failedCount - 1} more)` : ''}` : result.reason ? ` — ${result.reason}` : '';
      console.log(line + tail + (result.mockUnhandled ? ` [mock unhandled: ${result.mockUnhandled.slice(0, 2).join('; ')}]` : ''));
    }
  });
  await Promise.all(workers);
  report.tools = contractTools.filter(t => results.has(t)).map(t => results.get(t));
} catch (error) {
  console.log(`FAIL harness — ${error.stack ?? error}`);
  exitCode = 1;
} finally {
  surfaceServer?.close();
  await mock.close();
  fs.rmSync(TMP, { recursive: true, force: true });
}
const count = s => report.tools.filter(t => t.status === s).length;
if (count('FAIL')) {
  exitCode = 1;
  console.log('\nfailed checks:');
  for (const t of report.tools.filter(x => x.status === 'FAIL')) for (const c of t.checks.filter(x => x.ok === false)) console.log(`  ${t.tool} ${c.check}: ${c.detail}`);
}
report.seconds = Number(((performance.now() - started) / 1000).toFixed(1));
report.summary = { pass: count('PASS'), fail: count('FAIL'), skip: count('SKIP'), exitCode };
const file = writeResults('tool-health', report);
console.log(`\ntool-health${DEEP ? ' --deep' : ''}: ${count('PASS')} passed, ${count('FAIL')} failed, ${count('SKIP')} skipped of ${report.tools.length} tools, ${report.tools.reduce((n, t) => n + (t.calls ?? 0), 0)} calls in ${report.seconds}s — ${path.relative(ROOT, file)}`);
process.exitCode = exitCode;
