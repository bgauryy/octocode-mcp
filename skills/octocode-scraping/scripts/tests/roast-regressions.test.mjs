import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { concatCleanParts } from '../lib/bridge.mjs';
import { classifyWorkflow } from '../lib/analyzers.mjs';
import { extractLinksFromHtml, extractHeadings, extractTablesFromHtml, extractResourcesFromHtml } from '../lib/extractors.mjs';
import { discoverSitemap } from '../lib/client.mjs';
import { safeSessionId } from '../lib/args.mjs';

// Fixtures run on plain-HTTP 127.0.0.1; the network guard allows exactly that under this test flag.
process.env.OCTOCODE_NET_GUARD_TEST_LOOPBACK = '1';

const scripts = fileURLToPath(new URL('../', import.meta.url));
const node = (script, args, opts = {}) => spawnSync(process.execPath, [join(scripts, script), ...args], { encoding: 'utf8', ...opts });
const withDir = async (fn) => { const dir = mkdtempSync(join(tmpdir(), 'scrape-roast-')); try { return await fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); } };

test('#7 clean parts rejoin byte-exact and in numeric order', async () => withDir(async (dir) => {
  mkdirSync(join(dir, 'text'));
  const parts = Array.from({ length: 11 }, (_, i) => `chunk${i}`);
  parts.forEach((p, i) => writeFileSync(join(dir, 'text', `page-001.clean.part-${String(i + 1).padStart(i === 10 ? 4 : 3, '0')}.md`), p));
  writeFileSync(join(dir, 'text', 'page-001.clean.part-999.md'), 'x');
  writeFileSync(join(dir, 'text', 'page-001.clean.part-1000.md'), 'y');
  const { text } = await concatCleanParts(dir, 'page-001');
  assert.ok(!text.includes('\n'), 'no separator may be inserted between byte-exact parts');
  assert.ok(text.endsWith('xy'), `part-999 must precede part-1000: ${text.slice(-6)}`);
}));

test('#9 workflow rules match whole words only', () => {
  assert.equal(classifyWorkflow('an explanation of the planning process'), null);
  assert.equal(classifyWorkflow('the capital city'), null);
  assert.equal(classifyWorkflow('edit the dockerfile'), null);
  assert.equal(classifyWorkflow('/docs/getting-started'), 'docs');
  assert.equal(classifyWorkflow('See pricing plans'), 'pricing');
  assert.equal(classifyWorkflow('/api/v1/users'), 'api-reference');
});

test('#12 #13 #34 #35 extractors keep every row, read whole attribute names, keep C#, and never fake a table selector', () => {
  const many = Array.from({ length: 1200 }, (_, i) => `<a href="/p${i}">p${i}</a>`).join('');
  assert.equal(extractLinksFromHtml(many, 'https://x.test/', 'p').length, 1200);
  const [link] = extractLinksFromHtml('<a data-href="/tracker" href="/docs">Docs</a>', 'https://x.test/', 'p');
  assert.equal(link.href, 'https://x.test/docs');
  assert.deepEqual(extractResourcesFromHtml('<script src=/s.js></script>', 'https://x.test/', 'p').map((r) => r.src), ['https://x.test/s.js']);
  assert.equal(extractHeadings('# Getting started with C#\n## Closing ##', 'p')[0].text, 'Getting started with C#');
  assert.equal(extractHeadings('## Closing ##', 'p')[0].text, 'Closing');
  const [plain, named] = extractTablesFromHtml('<table><tr><td>a</td></tr></table><table id="prices"><tr><td>b</td></tr></table>', 'p');
  assert.equal(plain.selector, null);
  assert.equal(plain.position, 1);
  assert.equal(named.selector, 'table#prices');
});

test('#18 a sitemap index is followed to its child sitemaps', async () => {
  const server = createServer((req, res) => {
    const base = `http://127.0.0.1:${server.address().port}`;
    if (req.url === '/sitemap.xml') res.end(`<?xml version="1.0"?><sitemapindex><sitemap><loc>${base}/sm1.xml</loc></sitemap></sitemapindex>`);
    else if (req.url === '/sm1.xml') res.end(`<urlset><url><loc>${base}/a</loc></url><url><loc>${base}/b</loc></url></urlset>`);
    else { res.statusCode = 404; res.end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const { discovered, error } = await discoverSitemap({ targetUrl: `${base}/`, maxPages: 5 });
    assert.equal(error, null);
    assert.deepEqual(discovered, [`${base}/a`, `${base}/b`]);
  } finally { server.close(); }
});

test('#23 dot-only session ids are rejected', () => {
  for (const id of ['.', '..', '...']) assert.throws(() => safeSessionId(id, 'https://x.test/'), /Invalid --session/);
  assert.equal(safeSessionId('run.1', 'https://x.test/'), 'run.1');
});

test('#10 #19 corpus-run searches reports, honors --roots, and continues from any cwd', () => withDir((dir) => {
  for (const sub of ['reports', 'text', 'raw']) mkdirSync(join(dir, sub));
  writeFileSync(join(dir, 'AGENT_INDEX.json'), JSON.stringify({ sessionId: 's', note: 'needle' }));
  writeFileSync(join(dir, 'reports', 'summary.md'), 'needle in report\n');
  writeFileSync(join(dir, 'raw', 'page-001.html'), 'needle in raw\n');
  for (let i = 0; i < 3; i += 1) writeFileSync(join(dir, 'text', `page-00${i}.clean.part-001.md`), 'needle\n');
  const all = JSON.parse(node('corpus-run.mjs', ['--session-dir', dir, '--regex', 'needle', '--view', 'matches']).stdout);
  const files = new Set(all.matches.map((m) => m.file));
  assert.ok(files.has('reports/summary.md'), 'reports/ must be searched by default');
  assert.ok(!files.has('raw/page-001.html'), 'raw/ is audit data, not a default root');
  const textOnly = JSON.parse(node('corpus-run.mjs', ['--session-dir', dir, '--roots', 'text', '--regex', 'needle', '--view', 'matches']).stdout);
  assert.ok(textOnly.matches.every((m) => m.file.startsWith('text/')), '--roots text must not scan AGENT_INDEX.json');
  const rel = node('corpus-run.mjs', ['--session-dir', '.', '--roots', 'text', '--regex', 'needle', '--limit', '1', '--view', 'matches'], { cwd: dir });
  const next = JSON.parse(rel.stdout).next.matches;
  const dirArg = next.args[next.args.indexOf('--session-dir') + 1];
  assert.ok(isAbsolute(dirArg), `continuation keeps a relative path: ${dirArg}`);
  assert.equal(spawnSync(next.command, next.args, { encoding: 'utf8', cwd: tmpdir() }).status, 0);
}));

test('#14 #15 #25 har-ingest reruns replace rows, label raw HARs honestly, and accept --min-ms 0', () => withDir((dir) => {
  const session = join(dir, 'sess');
  mkdirSync(session);
  const har = join(dir, 'net.har');
  writeFileSync(har, JSON.stringify({ log: { entries: [{ request: { method: 'GET', url: 'https://x.test/api', headers: [] }, response: { status: 200, headers: [], content: { mimeType: 'application/json', text: '{}' } }, time: 0 }] } }));
  for (let run = 0; run < 2; run += 1) assert.equal(node('har-ingest.mjs', ['--session-dir', session, '--har', har]).status, 0);
  const lines = (rel) => readFileSync(join(session, rel), 'utf8').trim().split('\n');
  assert.equal(lines('extracts/cdp-network.jsonl').length, 1, 'rerun duplicated network rows');
  assert.equal(lines('sources.jsonl').length, 1, 'rerun duplicated source rows');
  const raw = node('har-ingest.mjs', ['--session-dir', session, '--har', har, '--no-redact', '--filter', 'slow', '--min-ms', '0']);
  assert.equal(raw.status, 0, raw.stdout);
  const out = JSON.parse(raw.stdout);
  assert.ok(out.cdpFiles.some((f) => f.endsWith('.raw.har')), 'an unredacted HAR must not be named .redacted.har');
  assert.equal(out.filteredNetworkRows, 1, '--min-ms 0 must keep a 0 ms entry');
  const handoff = readFileSync(join(session, 'extracts/bridge-handoff.json'), 'utf8');
  assert.ok(!handoff.includes('graph-actionability-check'), 'handoff names a script that does not exist');
}));

test('#16 resource-list lists page assets, and queries match values only', () => withDir((dir) => {
  mkdirSync(join(dir, 'extracts'));
  writeFileSync(join(dir, 'extracts/links.jsonl'), `${JSON.stringify({ pageId: 'p', href: 'https://x.test/docs', text: 'Docs', source: 'html' })}\n`);
  writeFileSync(join(dir, 'extracts/resources.jsonl'), `${JSON.stringify({ pageId: 'p', kind: 'script', src: 'https://cdn.test/app.js', source: 'html' })}\n`);
  const scriptsOnly = JSON.parse(node('resource-list.mjs', ['--session-dir', dir, '--kind', 'script']).stdout);
  assert.equal(scriptsOnly.totalMatches, 1);
  const byKey = JSON.parse(node('resource-list.mjs', ['--session-dir', dir, '--query', 'source']).stdout);
  assert.equal(byKey.totalMatches, 0);
}));

test('#24 #31 #33 flags without values and every error share one stdout shape', () => withDir((dir) => {
  const cases = [
    ['provider-usage.mjs', ['--provider'], 2, 'invalidArguments'],
    ['corpus-run.mjs', ['--session-dir', '--regex', 'x'], 2, 'invalidArguments'],
    ['corpus-run.mjs', ['--session-dir', join(dir, 'missing'), '--regex', 'x'], 1, 'sessionNotFound'],
    ['corpus-run.mjs', ['--session-dir', dir, '--regex', '('], 2, 'invalidArguments'],
    ['source-query.mjs', [], 2, 'invalidArguments'],
    ['har-ingest.mjs', ['--session-dir', join(dir, 'missing'), '--har', 'x.har'], 1, 'sessionNotFound'],
    ['fetch.mjs', ['--url', 'https://x.test/', '--session', '..'], 2, 'invalidArguments'],
  ];
  for (const [script, args, exit, code] of cases) {
    const res = node(script, args, { cwd: dir });
    assert.equal(res.status, exit, `${script} ${args.join(' ')}: ${res.stdout}${res.stderr}`);
    const body = JSON.parse(res.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.error.code, code, `${script}: ${res.stdout}`);
    assert.equal(typeof body.error.message, 'string');
  }
}));

test('provider-usage --check reports the key state offline and never prints the key', () => {
  const env = { ...process.env };
  delete env.SCRAPING_ANT;
  const missing = node('provider-usage.mjs', ['--check'], { env });
  assert.equal(missing.status, 1);
  assert.equal(JSON.parse(missing.stdout).error.code, 'missingKey');
  const set = node('provider-usage.mjs', ['--check'], { env: { ...env, SCRAPING_ANT: 'sk-secret-value' } });
  assert.equal(set.status, 0);
  assert.equal(JSON.parse(set.stdout).key, 'set');
  assert.ok(!set.stdout.includes('sk-secret-value'));
});

test('#31 a body cut at the network cap marks raw and text truncated', () => withDir((dir) => {
  const big = join(dir, 'big.html');
  writeFileSync(big, `<html><body><h1>Big</h1><p>${'word '.repeat(40000)}</p></body></html>`);
  const res = node('fetch.mjs', ['--url', 'https://x.test/', '--provider', 'direct', '--mock-status', '200', '--mock-body-file', big, '--mock-content-type', 'text/html', '--max-raw-bytes', '1000', '--max-text-bytes', '1000'], { cwd: dir });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  const sessionDir = JSON.parse(res.stdout).sessionDir;
  const source = JSON.parse(readFileSync(join(sessionDir, 'sources.jsonl'), 'utf8').trim().split('\n')[0]);
  assert.equal(source.rawTruncated, source.networkTruncated);
  assert.equal(source.textTruncated, source.networkTruncated);
}));

test('#1 a crawl refuses private hosts it is linked to or redirected to, and the start URL needs --allow-private-host', async () => withDir(async (dir) => {
  const internal = createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end('<h1>internal secret</h1>'); });
  await new Promise((r) => internal.listen(0, '127.0.0.1', r));
  const internalPort = internal.address().port;
  const site = createServer((req, res) => {
    if (req.url === '/robots.txt') { res.statusCode = 404; return res.end(); }
    if (req.url === '/hop') { res.statusCode = 302; res.setHeader('location', `http://localhost:${internalPort}/via-redirect`); return res.end(); }
    res.setHeader('content-type', 'text/html');
    res.end(`<a href="http://localhost:${internalPort}/internal">a</a> <a href="http://169.254.169.254/latest/meta-data/">b</a> <a href="/hop">c</a>`);
  });
  await new Promise((r) => site.listen(0, '127.0.0.1', r));
  const start = `http://127.0.0.1:${site.address().port}/`;
  // The fixture servers live in this process, so the child must run without blocking the event loop.
  const nodeAsync = (args) => new Promise((resolve) => {
    const child = spawn(process.execPath, [join(scripts, 'fetch.mjs'), ...args], { cwd: dir, env: { PATH: process.env.PATH } });
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.on('close', (status) => resolve({ status, stdout }));
  });
  try {
    const denied = await nodeAsync(['--url', start, '--provider', 'direct']);
    assert.equal(denied.status, 2, denied.stdout);
    assert.equal(JSON.parse(denied.stdout).error.code, 'refusedHost');

    const crawl = await nodeAsync(['--url', start, '--provider', 'direct', '--allow-private-host', '--crawl', '--span-hosts', '--max-pages', '5', '--delay-ms', '0']);
    const out = JSON.parse(crawl.stdout);
    const refusedUrls = out.warnings.filter((w) => /^refused /.test(w.warning)).map((w) => w.warning.split(' ')[1].replace(/:$/, ''));
    assert.ok(refusedUrls.includes(`http://localhost:${internalPort}/internal`), crawl.stdout);
    assert.ok(refusedUrls.includes('http://169.254.169.254/latest/meta-data/'), crawl.stdout);
    const corpus = readdirSync(join(out.sessionDir, 'text')).map((f) => readFileSync(join(out.sessionDir, 'text', f), 'utf8')).join('\n');
    assert.ok(!corpus.includes('internal secret'), 'an internal page reached the corpus');
    const sources = readFileSync(join(out.sessionDir, 'sources.jsonl'), 'utf8');
    assert.match(sources, /redirect target refused/, sources);
  } finally { site.close(); internal.close(); }
}));

test('the network guard matches the octocode-brainstorming copy when both skills are present', () => {
  const sibling = join(scripts, '..', '..', 'octocode-brainstorming', 'scripts', 'lib', 'net-guard.mjs');
  if (!existsSync(sibling)) return;
  assert.ok(readFileSync(join(scripts, 'lib', 'net-guard.mjs')).equals(readFileSync(sibling)), 'run node skills/common/build.mjs to refresh the network guard copies');
});
