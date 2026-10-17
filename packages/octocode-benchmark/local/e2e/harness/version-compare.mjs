#!/usr/bin/env node
// Rate every tool of the local build against a published release with the SAME
// research steps (harness/version-compare/cases.mjs). Per side and check it records
// success, characters the model reads (MCP text content), latency, continuation
// completeness (the named next.* lead replayed to the end versus an unpaged call),
// guidance on empty and invalid queries, output-contract validity (local only: the
// published MCP declares no output schemas) and CLI/MCP parity on the happy call.
//
//   node packages/octocode-benchmark/local/e2e/harness/version-compare.mjs --side local|published \
//     [--version 19.1.0] [--tools a,b] [--out file.json] [--probe dir]
//
// GitHub tools call live GitHub with the token from `gh auth token`; local tools read
// fixtures/tool-health. The published side installs octocode-mcp@<v> and octocode@<v>
// into a temp prefix and runs them with node, so startup and latency are measured
// the same way as the local dist. Each side gets its own temp OCTOCODE_HOME.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { ROOT, FIXTURES, expandShared } from './mcp-client.mjs';
import { CASES } from './version-compare/cases.mjs';

const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; };
const SIDE = arg('side', 'local');
const VERSION = arg('version', '19.1.0');
const ONLY = arg('tools')?.split(',');
const PROBE = arg('probe');
const OUT = arg('out', path.join(os.tmpdir(), `version-compare-${SIDE}.json`));
const CWD = path.join(FIXTURES, 'tool-health');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), `octocode-vc-${SIDE}-`));
const CALL_TIMEOUT = 180_000;

// ---- side wiring
let mcpCmd, cliRun, contract = null;
if (SIDE === 'local') {
  mcpCmd = ['node', [path.join(ROOT, 'packages/octocode-mcp/dist/index.js')]];
  const cli = path.join(ROOT, 'packages/octocode/out/octocode.js');
  cliRun = (tool, query) => ['node', [cli, tool, JSON.stringify({ queries: [query] }), '--json']];
  contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/octocode-config/contract/tool-contract.json'), 'utf8'));
} else {
  const prefix = path.join(os.tmpdir(), `octocode-vc-published-${VERSION}`);
  if (!fs.existsSync(path.join(prefix, 'node_modules/octocode/out/octocode.js'))) {
    execFileSync('npm', ['i', '--no-save', '--no-audit', '--no-fund', '--prefix', prefix, `octocode-mcp@${VERSION}`, `octocode@${VERSION}`], { stdio: 'inherit' });
  }
  mcpCmd = ['node', [path.join(prefix, 'node_modules/octocode-mcp/dist/index.js')]];
  const cli = path.join(prefix, 'node_modules/octocode/out/octocode.js');
  cliRun = (tool, query) => ['node', [cli, 'tools', tool, '--queries', JSON.stringify([query]), '--json']];
}
const token = (() => { try { return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim(); } catch { return ''; } })();
const env = {
  ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(GITHUB_|GH_|OCTOCODE_)/.test(k))),
  OCTOCODE_HOME: path.join(TMP, 'home'), GITHUB_TOKEN: token, OCTOCODE_BETA: 'true',
  OCTOCODE_CLASSIFICATION_API: '', ENABLE_CLONE: 'true', ENABLE_LOCAL: 'true',
};
fs.mkdirSync(env.OCTOCODE_HOME, { recursive: true });

// ---- minimal MCP stdio client (one server per side, like an agent session)
function startMcp() {
  const child = spawn(mcpCmd[0], mcpCmd[1], { cwd: CWD, env, stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '', id = 0; const pending = new Map();
  child.stderr.on('data', () => {});
  child.stdout.on('data', c => {
    buf += c; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.id != null && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    }
  });
  const request = (method, params) => new Promise((resolve, reject) => {
    const myId = ++id; const t = setTimeout(() => { pending.delete(myId); reject(new Error(`timeout ${method}`)); }, CALL_TIMEOUT);
    pending.set(myId, m => { clearTimeout(t); resolve(m); });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: myId, method, params }) + '\n');
  });
  return {
    async init() {
      await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'version-compare', version: '1' } });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
      const list = await request('tools/list', {});
      return list.result.tools;
    },
    async call(name, args) {
      const t0 = performance.now();
      const m = await request('tools/call', { name, arguments: args });
      const ms = Math.round(performance.now() - t0);
      const r = m.result ?? {};
      const text = (r.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n');
      return { ms, isError: Boolean(r.isError || m.error), rpcError: m.error?.message, text, sc: r.structuredContent ?? null };
    },
    close() { child.kill(); },
  };
}

function runCli(tool, query) {
  const [cmd, argv] = cliRun(tool, query);
  const t0 = performance.now();
  return new Promise(resolve => {
    const child = spawn(cmd, argv, { cwd: CWD, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    const t = setTimeout(() => child.kill(), CALL_TIMEOUT);
    child.stdout.on('data', c => { out += c; }); child.stderr.on('data', c => { err += c; });
    child.on('close', code => { clearTimeout(t); let json = null; try { json = JSON.parse(out); } catch {} resolve({ code, json, ms: Math.round(performance.now() - t0), err: err.slice(0, 300) }); });
  });
}

// ---- response shape helpers (both versions return results[] rows with data)
const rowsOf = sc => {
  if (!sc) return [];
  const x = expandShared(sc);
  return Array.isArray(x.results) ? x.results : [x];
};
const SKIP = new Set(['next', 'hints', 'pagination', 'meta', 'stats', 'receipts', 'echo', 'diagnostics', 'shared', 'query']);
// Stable identities for evidence rows: works per side (paged vs unpaged on the same
// version), not across versions.
function identities(data) {
  const out = [];
  const keyish = ['file', 'target', 'owner', 'repo', 'path', 'line', 'sha', 'commitSha', 'oid', 'number', 'id', 'name', 'fullName', 'filename', 'nameWithOwner', 'url', 'version', 'createdAt', 'author', 'startLine', 'uri'];
  const pathToken = (s, dir) => {
    const tok = s.split(/\s+/).find(t => t && !/^[+-]?\d+$|^\(.*\)$|^[A-Z]$/.test(t)) ?? s;
    return !dir || tok.includes('/') ? tok : `${String(dir).replace(/\/$/, '')}/${tok}`.replace(/^\.\//, '');
  };
  const walk = (v, trail, root) => {
    if (Array.isArray(v)) { v.forEach(x => walk(x, trail)); return; }
    if (!v || typeof v !== 'object') return;
    const own = keyish.filter(k => v[k] != null && typeof v[k] !== 'object').map(k => `${k}=${v[k]}`);
    const here = own.length && !root ? `${trail}/${own.join(',')}` : trail;
    const before = out.length;
    for (const [k, x] of Object.entries(v)) {
      if (!SKIP.has(k) && Array.isArray(x) && !/^(partialReasons|labels|warnings|parents|topics|languages|reviewers|assignees)$/.test(k)) for (const s of x) if (typeof s === 'string') out.push(`str:${pathToken(s, v.dir ?? (k.endsWith('/') ? k : null))}`);
    }
    for (const [k, x] of Object.entries(v)) if (!SKIP.has(k)) walk(x, here);
    // A row is a leaf: a parent (a file with match children) counts only when
    // nothing below it carries an identity.
    if (own.length && !root && out.length === before) out.push(`${trail}|${own.join(',')}`);
  };
  walk(data, '', true);
  return out;
}
const CONTENT_KEYS = ['content', 'patch', 'body', 'text', 'value', 'diff', 'lines'];
function contentOf(data) {
  const parts = [];
  const walk = (v, k) => {
    if (typeof v === 'string') { if (CONTENT_KEYS.includes(k)) parts.push(v); return; }
    if (Array.isArray(v)) { v.forEach(x => walk(x, k)); return; }
    if (v && typeof v === 'object') for (const [kk, x] of Object.entries(v)) if (!SKIP.has(kk)) walk(x, kk);
  };
  walk(data, '');
  return parts.join('');
}
const stripNumbers = s => s.split('\n').map(l => l.replace(/^\d+\t/, '')).join('\n');
function guidance(row) {
  const leads = [], texts = [];
  const walk = (v, k) => {
    if (Array.isArray(v)) { v.forEach(x => walk(x, k)); return; }
    if (typeof v === 'string') { if (/hint|suggest|warning|message|error|guidance|next|reason|recovery/i.test(k)) texts.push(v); return; }
    if (!v || typeof v !== 'object') return;
    if (typeof v.tool === 'string' && v.query) leads.push(v.tool);
    for (const [kk, x] of Object.entries(v)) walk(x, `${k}.${kk}`);
  };
  walk(row, '');
  return { leads: leads.length, leadTools: [...new Set(leads)], texts: texts.slice(0, 6).map(s => s.slice(0, 200)) };
}
const status = (res) => {
  const rows = rowsOf(res.sc);
  const r = rows[0] ?? {};
  if (res.rpcError) return 'rpcError';
  if (r.status === 'error' || r.status === 'empty') return r.status;
  if (r.status) return `ok(${r.status})`;
  if (r.error || r.errorCode || r.data?.error) return 'error';
  if (res.isError) return 'error';
  return 'ok';
};
const nextOf = data => data?.next ?? {};
const firstDiff = (a, b) => { const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i; return a.length === b.length ? -1 : n; };
function readTruth(t) {
  if (t.file) return fs.readFileSync(path.join(CWD, t.file), 'utf8');
  return execFileSync('gh', ['api', '-H', 'Accept: application/vnd.github.raw', `repos/${t.owner}/${t.repo}/contents/${t.path}?ref=${t.ref}`], { encoding: 'utf8', maxBuffer: 64 << 20 });
}

const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020').default;
const addFormats = require('ajv-formats').default ?? require('ajv-formats');
let ajv = null; const validators = new Map();
function contractCheck(tool, sc) {
  if (!contract) return 'n/a (no published output schema)';
  const def = contract.tools.find(t => t.name === tool);
  if (!def?.outputSchema) return 'n/a';
  if (!ajv) { ajv = new Ajv2020({ strict: false, allErrors: false, validateFormats: true }); addFormats(ajv); }
  if (!validators.has(tool)) validators.set(tool, ajv.compile(def.outputSchema));
  const v = validators.get(tool);
  return v(sc) ? 'valid' : `invalid ${v.errors[0].instancePath || '/'} ${v.errors[0].message}`;
}

// ---- run
const mcp = startMcp();
const listed = await mcp.init();
const listedNames = new Set(listed.map(t => t.name));
const toolsListChars = JSON.stringify({ tools: listed }).length;
const wrap = (tool, query) => (SIDE === 'local' ? { queries: [query] } : { queries: [query] });
const cliOnly = tool => SIDE === 'local' && !listedNames.has(tool) && contract?.tools.some(t => t.name === tool);

async function callOnce(tool, query) {
  if (cliOnly(tool)) {
    const r = await runCli(tool, query);
    const text = r.json ? JSON.stringify(r.json) : '';
    return { ms: r.ms, isError: r.code !== 0 && !r.json, text, sc: r.json, via: 'cli', cliErr: r.code !== 0 ? r.err : undefined };
  }
  if (!listedNames.has(tool)) return { unavailable: true };
  return { ...(await mcp.call(tool, wrap(tool, query))), via: 'mcp' };
}

function summarize(tool, res) {
  if (res.unavailable) return { status: 'unavailable' };
  const rows = rowsOf(res.sc);
  const data = rows[0]?.data ?? rows[0] ?? {};
  return {
    via: res.via, status: status(res), ms: res.ms, textChars: res.text.length, scChars: res.sc ? JSON.stringify(res.sc).length : 0,
    rows: identities(data).length, contentChars: contentOf(data).length, nextLeads: Object.keys(nextOf(data)),
    guidance: res.sc ? guidance(rows[0] ?? {}) : { leads: 0, leadTools: [], texts: res.text ? [res.text.slice(0, 200)] : [] }, contract: res.via === 'mcp' ? contractCheck(tool, res.sc) : 'cli',
    errorCode: rows[0]?.errorCode ?? rows[0]?.data?.errorCode ?? rows[0]?.error?.code ?? undefined,
    excerpt: res.text.slice(0, 400),
  };
}

const probeDump = (name, res) => { if (PROBE) { fs.mkdirSync(PROBE, { recursive: true }); fs.writeFileSync(path.join(PROBE, `${name}.txt`), `${res.text ?? ''}\n\n--- sc ---\n${JSON.stringify(res.sc, null, 1)}`); } };

async function replay(tool, first, lead, maxPages) {
  const pages = [first]; let cur = first; let used = lead;
  for (let i = 0; i < (maxPages ?? 30); i++) {
    const data = rowsOf(cur.sc)[0]?.data ?? {};
    const next = nextOf(data);
    let entry = next[lead];
    if (!entry) { const k = Object.keys(next).find(key => next[key]?.tool === tool && /page|continue|chunk|window|more/i.test(key)); entry = k ? next[k] : null; if (k) used = k; }
    if (!entry) break;
    const q = entry.query?.queries ? entry.query.queries[0] : entry.query;
    cur = await callOnce(entry.tool ?? tool, q);
    pages.push(cur);
  }
  return { pages, leadUsed: pages.length > 1 ? used : null };
}

const report = { side: SIDE, version: SIDE === 'local' ? 'local' : VERSION, startedAt: new Date().toISOString(), toolsList: { count: listed.length, chars: toolsListChars, names: [...listedNames] }, tools: {} };
for (const [tool, spec] of Object.entries(CASES)) {
  if (ONLY && !ONLY.includes(tool)) continue;
  const pubTool = spec.pub;
  const out = report.tools[tool] = { counterpart: SIDE === 'local' ? tool : pubTool, checks: [] };
  if (SIDE !== 'local' && !pubTool) { out.na = spec.naReason; continue; }
  for (const check of spec.checks) {
    const name = check.name ?? check.kind;
    const side = SIDE === 'local' ? (check.loc ? { query: check.loc } : { na: 'no local case' }) : (check.pub ?? { na: spec.naReason ?? 'no published case' });
    if (side.na) { out.checks.push({ name, kind: check.kind, na: side.na }); continue; }
    const callTool = SIDE === 'local' ? tool : (side.tool ?? pubTool);
    let res;
    try { res = await callOnce(callTool, side.query); } catch (e) { out.checks.push({ name, kind: check.kind, status: 'exception', error: String(e.message) }); continue; }
    probeDump(`${tool}-${name}`, res);
    const rec = { name, kind: check.kind, ...summarize(callTool, res) };
    if (check.kind === 'page' && !res.unavailable) {
      const lead = SIDE === 'local' ? check.lead?.loc : check.lead?.pub;
      const { pages, leadUsed } = await replay(callTool, res, lead, check.maxPages);
      pages.slice(1).forEach((p, i) => probeDump(`${tool}-${name}-p${i + 2}`, p));
      const pageData = pages.map(p => rowsOf(p.sc)[0]?.data ?? {});
      rec.pages = pages.length; rec.leadUsed = leadUsed;
      rec.pageMs = pages.reduce((a, p) => a + (p.ms ?? 0), 0);
      rec.pageTextChars = pages.reduce((a, p) => a + (p.text?.length ?? 0), 0);
      rec.pageStatuses = pages.map(p => status(p));
      const unpagedQ = SIDE === 'local' ? (check.unpaged?.loc ?? (() => { const q = { ...side.query }; delete q.pageSize; delete q.length; delete q.offset; delete q.unit; return q; })()) : (check.unpaged?.pub?.query ?? (() => { const q = { ...side.query }; delete q.pageSize; delete q.charLength; delete q.charOffset; return q; })());
      const unpaged = await callOnce(callTool, unpagedQ);
      probeDump(`${tool}-${name}-unpaged`, unpaged);
      const uData = rowsOf(unpaged.sc)[0]?.data ?? {};
      rec.unpaged = { status: status(unpaged), textChars: unpaged.text?.length ?? 0, ms: unpaged.ms, nextLeads: Object.keys(nextOf(uData)) };
      if (check.content) {
        const joined = stripNumbers(pageData.map(contentOf).join(''));
        const whole = stripNumbers(contentOf(uData));
        const squash = s => s.replace(/\s+/g, '');
        const truth = check.truth ? readTruth(check.truth) : null;
        rec.content = { pages: pages.length, pagedChars: joined.length, unpagedChars: whole.length, equalUnpaged: squash(joined) === squash(whole), unpagedHasNext: Object.keys(nextOf(uData)).length > 0 };
        if (truth != null) Object.assign(rec.content, { truthChars: truth.length, equalTruth: squash(joined) === squash(truth), firstDiffAt: firstDiff(squash(joined), squash(truth)) });
      } else {
        // Rows repeated on every page (the resolved symbol, the PR header) are
        // page headers, not collection rows.
        const perPage = pageData.map(d => new Set(identities(d)));
        const header = perPage.length > 1 ? new Set([...perPage[0]].filter(x => perPage.every(s => s.has(x)))) : new Set();
        const paged = pageData.flatMap(identities).filter(x => !header.has(x));
        const all = identities(uData).filter(x => !header.has(x));
        const pagedSet = new Set(paged);
        const missing = all.filter(x => !pagedSet.has(x));
        const seen = new Set(); const dups = paged.filter(x => (seen.has(x) ? true : (seen.add(x), false)));
        rec.rows = { paged: paged.length, pagedUnique: pagedSet.size, duplicates: dups.length, unpaged: all.length, missing: missing.length, expect: check.expectRows, missingSample: missing.slice(0, 3), dupSample: dups.slice(0, 3) };
      }
    }
    if (check.kind === 'happy' && res.via === 'mcp') {
      try {
        const c = await runCli(callTool, side.query);
        const a = identities(rowsOf(res.sc)[0]?.data ?? {}).sort().join('\n');
        const b = c.json ? identities(rowsOf(c.json)[0]?.data ?? {}).sort().join('\n') : null;
        rec.cliParity = { cliStatus: c.code, sameRows: a === b, cliMs: c.ms };
      } catch (e) { rec.cliParity = { error: String(e.message) }; }
    }
    out.checks.push(rec);
    console.log(`${SIDE} ${tool}/${name}: ${rec.status} ${rec.ms ?? ''}ms ${rec.textChars ?? ''}ch rows=${typeof rec.rows === 'object' ? JSON.stringify(rec.rows) : rec.rows}${rec.content ? ' content=' + JSON.stringify(rec.content) : ''}${rec.pages ? ' pages=' + rec.pages : ''}`);
  }
}
mcp.close();
report.finishedAt = new Date().toISOString();
fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log(`wrote ${OUT}`);
