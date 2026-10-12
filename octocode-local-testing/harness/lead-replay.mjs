// Lead replay: run every follow-up lead a fixture call emits and
// check it does what its key promises. A lead is `{tool, query}` under `next.*`
// or `hints.*`; the recurring defect is a key that says one thing while its
// query does another (an includeIgnored lead that only lifts defaultExcludes, a
// findText lead whose regex ran as literal text, a narrowScope lead with an
// unpinned ref that returns notFound, a viewReleaseSource lead on a build path).
//
// Phase 1 runs a fixture set over the local corpus (a synthetic workspace with
// ignored/hidden/excluded/paged content, repos/*, fixtures/large) and, when a
// GitHub token is present, a few GitHub calls. Phase 2 executes every distinct
// lead verbatim (bounded per key, two levels deep). Each lead is checked by
// predicates chosen from its KEY FAMILY (docs/OCTOCODE_TOOLS.md,
// docs/TOOL_DATA_CONTRACT.md), never per fixture:
//   valid         the lead is accepted (no transport error, no invalid* row error)
//   executes      no error row (notFound, fileAccessFailed, ...)
//   key-tool      the key's tool/operation matches (findCallers -> lspSearch callers)
//   lifts-flag    include* keys set the flag they name (includeIgnored:true, ...)
//   keeps-scope   same-tool lead keeps every source field it does not mutate
//   extras        same-tool lead inherits extras; no lead inherits mainGoal/reasoning
//   ref-pinned    a lead ref equals the source ref or is a full commit SHA
//   non-empty     a lead that promises evidence returns some
//   fresh         a paging lead returns rows not already shown, or states terminalLimit
//   hits-match    a findText lead's hits match its own matchString under its regex mode
//   finds-anchor  a findText lead finds the source anchor text when its file holds it
//   covers-anchor a read lead shows a source anchor line or its matchString
//   anchor-line   an lspSearch lead's line holds its symbolName
//   not-build     a release-source lead is not a build-output path
// Known-open defects are listed in KNOWN_OPEN with their backlog ID and print as
// XFAIL (neither pass nor fail). Anything else FAILs with source, key, query, outcome.
//
//   node harness/lead-replay.mjs      (OCTOCODE_LEAD_REPLAY_BUDGET_MS, default 140000)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { FIXTURES, REPOS, ROOT, checks, cliEntry, startServer, writeResults } from './mcp-client.mjs';

const SUITE = 'lead-replay';
const { check, skip, summary, results } = checks(SUITE);
const BUDGET_MS = Number(process.env.OCTOCODE_LEAD_REPLAY_BUDGET_MS ?? 140_000);
const STARTED = Date.now();
const PER_KEY = Number(process.env.OCTOCODE_LEAD_REPLAY_PER_KEY ?? 4);
const CONCURRENCY = 4;
const MAX_DEPTH = 2;
const WALK_PAGES = 2;

// Known-open defects: shown as XFAIL with the backlog ID, never hidden.
const KNOWN_OPEN = [
  {
    id: 'B38', assertion: 'lifts-flag', key: /^includeIgnored$/,
    why: 'the shared includeIgnored key also runs defaultExcludes:false or includeHidden:true (name it by what it lifts)',
  },
];
const knownOpen = (assertion, key) => KNOWN_OPEN.find(k => k.assertion === assertion && k.key.test(key));

// Key families.
const PAGE_KEYS = /^(nextPage|nextMatchPage|nextFilePage|nextCommitPage|nextCommentPage|nextReviewPage|nextImporterPage|nextDiagnosticPage|continue[A-Za-z]*|expandScan|readHits|readDeclaration|wholeLines|readBoundedLines|responsePagination\.next)$/;
const FLAG_KEYS = { includeIgnored: 'includeIgnored', includeHidden: 'includeHidden', includeArchived: 'includeArchived' };
// Leads that promise evidence the source row is known to hold. find* leads may legitimately answer empty (the source found nothing either).
const NOT_EMPTY_KEYS = /^(read(Block|Files|Commit|Issue|PullRequest|AtCommit|AtMerge|MergeCommit|Parent|Patches|SelectedPatches|FullPatches)?|include(Ignored|Hidden|Archived)|narrowScope|view(Tree|Repo|Refs|ReleaseSource)|repair|ignoreCase)$/;
const SAME_TOOL_PAGE_KEYS = /^(next[A-Za-z]*Page|continue[A-Za-z]*|expandScan|restart)$/;
// Fields a same-tool lead may change (besides CONTINUATION_FIELDS), per key family.
const MUTABLE = [
  [/^include(Ignored|Hidden|Archived)$/, new Set(['includeIgnored', 'includeHidden', 'includeArchived', 'defaultExcludes'])],
  [/^expandScan$/, new Set(['maxEntries', 'maxFiles', 'maxDepth'])],
  [/^continue[A-Za-z]*$/, new Set(['fullContent'])],
];
// Enrichment and clipped-read leads add the option that widens the same read.
const ADDS_OPTIONS = /^(expand[A-Za-z]*|wholeLines|readBoundedLines|readHits|readDeclaration)$/;
const SAME_TOOL_KEYS = /^(includeIgnored|includeHidden|includeArchived|narrowScope|restart|retry|repair|broadenSearch|ignoreCase)$/;
const SKIP_EXEC_KEYS = { cloneRepo: 'writes the clone cache', exploreClone: 'writes the clone cache', clasify: 'paid provider call' };
const CONTINUATION_FIELDS = new Set(['page', 'snapshot', 'scanOffset', 'matchPage', 'offset', 'importerPage', 'diagnosticPage', 'diagnosticSnapshot', 'supersedes', 'materializeOffset', 'extras', 'mainGoal', 'reasoning', 'ranges', 'length', 'unit']);
const KEY_TOOLS = [
  [/^findText$/, { tools: ['localSearch', 'ghSearchCode', 'ghGetFileContent', 'localFetch'] }],
  [/^(findCallers|callers)$/, { tools: ['lspSearch'], operation: 'callers' }],
  [/^(findReferences|references)$/, { tools: ['lspSearch'], operation: 'references' }],
  [/^findCode$/, { tools: ['ghSearchCode'] }],
  [/^findRepository$/, { tools: ['ghSearchRepo'] }],
  [/^findPullRequest$/, { tools: ['ghSearchHistory'], operation: 'pullRequest' }],
  [/^findIssue$/, { tools: ['ghSearchHistory'], operation: 'issue' }],
  [/^findCommit$/, { tools: ['ghSearchHistory'], operation: 'commit' }],
  [/^readPullRequest$/, { tools: ['ghGetHistoryItem'], operation: 'pullRequest' }],
  [/^readIssue$/, { tools: ['ghGetHistoryItem'], operation: 'issue' }],
  [/^readCommit$/, { tools: ['ghGetHistoryItem', 'ghGetFileContent'] }],
  [/^view(Tree|Refs|ReleaseSource)$/, { tools: ['ghStructure', 'structureSearch'] }],
  [/^viewRepo$/, { tools: ['ghStructure', 'ghSearchRepo'] }],
  [/^readDiagnostics$/, { tools: ['lspSearch', 'astTopology'] }],
  [/^read(Block|Hits|Declaration|Files)?$/, { tools: ['localFetch', 'ghGetFileContent', 'ghGetHistoryItem'] }],
];
const BUILD_OUTPUT = /(^|\/)(dist|build|out|target|lib|coverage|\.next|node_modules)(\/|$)|\.min\.(js|css)$|\.map$/;

// Helpers.
const short = (v, n = 240) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s.length > n ? `${s.slice(0, n - 1)}...` : s; };
const isLead = node => node && typeof node === 'object' && typeof node.tool === 'string' && node.query && typeof node.query === 'object';
const rowOf = (query, i = 0) => query?.queries?.[i] ?? {};
const sortKeys = v => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])) : v);
const canon = value => JSON.stringify(sortKeys(value));
const sameJson = (a, b) => canon(a) === canon(b);
const properties = schema => { const out = new Set(); const walk = n => { if (!n || typeof n !== 'object') return; for (const [k, v] of Object.entries(n)) { if (k === 'properties' && v && typeof v === 'object') Object.keys(v).forEach(p => out.add(p)); walk(v); } }; walk(schema); return out; };

/** Every `{tool, query}` lead under `next.*` / `hints.*` (text tips excluded) with its row index. */
function leadsOf(sc) {
  const out = [];
  const visit = (node, at, rowIndex) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((c, i) => visit(c, `${at}[${i}]`, rowIndex)); return; }
    for (const [key, child] of Object.entries(node)) {
      if ((key === 'next' || key === 'hints') && child && typeof child === 'object' && !Array.isArray(child)) {
        for (const [name, lead] of Object.entries(child)) {
          if (name !== 'text' && isLead(lead)) out.push({ path: `${at}.${key}.${name}`, container: key, key: name, tool: lead.tool, query: lead.query, rowIndex });
        }
      }
      visit(child, `${at}.${key}`, rowIndex);
    }
  };
  (sc?.results ?? []).forEach((row, i) => visit(row, `.results[${i}]`, i));
  const envelope = sc?.responsePagination?.next;
  if (isLead(envelope)) out.push({ path: '.responsePagination.next', container: 'next', key: 'responsePagination.next', tool: envelope.tool, query: envelope.query, rowIndex: null });
  return out;
}

/** Evidence atoms of a result: every scalar outside pagination/hint metadata, keyed by its enclosing path. */
const NOISE = new Set(['next', 'hints', 'pagination', 'contentPagination', 'filePagination', 'matchPagination', 'warnings', 'summary', 'snapshot', 'root', 'index', 'status', 'terminalLimit', 'coverage', 'completeness', 'complete', 'isPartial', 'partialReasons', 'atLeast', 'truncated', 'filesScanned', 'matchCount', 'matchedLineCount', 'fileCount', 'totalFiles', 'moreLines', 'currentPage', 'totalPages', 'totalItems', 'hasMore', 'pageSize', 'extras', 'echo', 'receipts', 'stats']);
function atoms(sc) {
  const out = new Set();
  const walk = (node, ctx, key) => {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) { node.forEach(c => walk(c, ctx, key)); return; }
    if (typeof node === 'object') {
      const here = typeof node.path === 'string' ? node.path : typeof node.dir === 'string' ? node.dir : ctx;
      for (const [k, v] of Object.entries(node)) if (!NOISE.has(k)) walk(v, here, k);
      return;
    }
    if (typeof node === 'string') { for (const line of node.split('\n')) if (line.trim()) out.add(`${ctx}|${key}|${line}`); }
    else out.add(`${ctx}|${key}|${node}`);
  };
  for (const row of sc?.results ?? []) walk(row?.data ?? {}, '', '');
  return out;
}
const terminal = entry => /terminalLimit"?:\s*true|terminal limit/i.test(JSON.stringify(entry.sc ?? '') + entry.text);

/** Anchor lines (per path) and symbol names in a source result. */
function anchorsOf(sc, rowIndex) {
  const lines = new Map();
  const texts = new Set();
  const add = (p, l) => { if (!lines.has(p)) lines.set(p, new Set()); lines.get(p).add(l); };
  const walk = (node, ctx) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(c => walk(c, ctx)); return; }
    const here = typeof node.path === 'string' ? node.path : ctx;
    if (Number.isInteger(node.line) && here) {
      add(here, node.line);
      if (Number.isInteger(node.endLine)) for (let l = node.line; l <= Math.min(node.endLine, node.line + 400); l++) add(here, l);
    }
    if (typeof node.symbolName === 'string') texts.add(node.symbolName);
    for (const [k, v] of Object.entries(node)) if (k !== 'next' && k !== 'hints') walk(v, here);
  };
  const rows = sc?.results ?? [];
  walk(rowIndex === null || rowIndex === undefined ? rows : rows[rowIndex], '');
  return { lines, texts };
}

/** Line numbers a result shows: numbered gutters ("12\ttext") and {line}/{start,end} objects. */
function shownLines(entry) {
  const found = new Set();
  const text = JSON.stringify(entry.sc?.results ?? '');
  for (const m of text.matchAll(/(?:\\n|"|^)(\d{1,7})(?:\\t|: |\|)/g)) found.add(Number(m[1]));
  const walk = n => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (Number.isInteger(n.line)) found.add(n.line);
    if (Number.isInteger(n.start) && Number.isInteger(n.end)) for (let l = n.start; l <= Math.min(n.end, n.start + 2000); l++) found.add(l);
    Object.values(n).forEach(walk);
  };
  walk(entry.sc?.results);
  return found;
}

/** Matchers for a query's matchString under its regex mode (smart-case literal by default). */
function matchersOf(q) {
  const list = Array.isArray(q.matchString) ? q.matchString : [q.matchString];
  return list.filter(x => typeof x === 'string').map(x => {
    if (q.regex === 'rust' || q.regex === 'pcre2') { try { return new RegExp(x, /[A-Z]/.test(x) ? '' : 'i'); } catch { return null; } }
    return { test: line => (x === x.toLowerCase() ? line.toLowerCase().includes(x) : line.includes(x)) };
  }).filter(Boolean);
}
const hitValues = sc => {
  const out = [];
  const walk = n => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (typeof n.value === 'string' && Number.isInteger(n.line)) out.push(n.value);
    for (const [k, v] of Object.entries(n)) if (k !== 'next' && k !== 'hints') walk(v);
  };
  walk(sc?.results);
  return out;
};

// Fixture workspace: own git repo so its .gitignore applies; ignored, hidden, default-excluded, paged and binary content.
const WREL = `.octocode/tmp/lead-replay-${process.pid}`;
const WABS = path.join(ROOT, WREL);
const SREL = `${WREL}-stale`; // its own corpus: mutating it must not stale any snapshot taken from the main workspace
const SABS = path.join(ROOT, SREL);
const write = (rel, text, base = WABS) => { const f = path.join(base, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
function buildWorkspace() {
  fs.rmSync(WABS, { recursive: true, force: true });
  fs.rmSync(SABS, { recursive: true, force: true });
  fs.mkdirSync(WABS, { recursive: true });
  fs.mkdirSync(SABS, { recursive: true });
  for (const dir of [WABS, SABS]) spawnSync('git', ['init', '-q'], { cwd: dir });
  write('.gitignore', 'build/\n*.log\n');
  write('package.json', JSON.stringify({ name: 'lead-replay-fixture', private: true, main: 'src/a.ts' }));
  write('tsconfig.json', JSON.stringify({ compilerOptions: { target: 'es2022', module: 'esnext', strict: true } }));
  write('src/a.ts', "import { helper } from './b';\nexport function visibleSym(n: number): number {\n  return helper(n) + 1;\n}\nexport const needleToken = 'needleToken';\n");
  write('src/b.ts', "import { visibleSym } from './a';\nexport function helper(n: number): number {\n  return n > 100 ? visibleSym(n - 1) : n * 2;\n}\n");
  write('src/many.ts', Array.from({ length: 90 }, (_, i) => `export const needleToken_${i} = ${i}; // needleToken ${i}`).join('\n') + '\n');
  for (let i = 0; i < 25; i++) write(`src/gen/f${String(i).padStart(2, '0')}.ts`, `export const gen${i} = ${i}; // needleToken in gen ${i}\n`);
  for (let i = 0; i < 8; i++) write(`s${String(i).padStart(2, '0')}.ts`, `export const s${i} = ${i}; // needleStale ${i}\n`, SABS);
  write('src/shapes.ts', 'export interface Shape { area(): number }\nexport class Circle implements Shape { area(): number { return 3; } }\nexport class Square implements Shape { area(): number { return 4; } }\nexport class Rounded extends Circle {}\n');
  write('build/out.js', 'export function ignoredSym() { return 1; }\n');
  write('app.log', 'ignoredSym in a log\n');
  write('.hidden/h.ts', 'export function hiddenSym() { return 1; }\n');
  write('node_modules/pkg/i.js', 'export function defaultExcludedSym() { return 1; }\n');
  write('big.txt', Array.from({ length: 4000 }, (_, i) => `line ${i + 1} lorem ipsum dolor sit amet needleBig${i % 500 === 0 ? 'Hit' : ''}`).join('\n') + '\n');
  write('minified.js', `${Array.from({ length: 3500 }, (_, i) => `function f${i}(a){return a+${i}}`).join(';')};var needleToken=1;\n`);
  fs.writeFileSync(path.join(WABS, 'blob.bin'), Buffer.from(Array.from({ length: 2048 }, (_, i) => (i * 7) % 256)));
}

// Fixture calls: [tool, query, label]. Empty, scope-miss, gitignored, paging and failure cases per tool.
const W = WREL;
const RS = 'octocode-local-testing/repos/rust/tokio';
const H = ['hints'];
const fixtures = () => [
  // localSearch
  ['localSearch', { path: RS, matchString: 'fn spawn', pageSize: 3, extras: H, mainGoal: 'find spawn', reasoning: 'inheritance probe' }, 'ls tokio paged + mainGoal'],
  ['localSearch', { path: `${W}/src`, matchString: 'needleToken', pageSize: 5, extras: H }, 'ls fixture paged'],
  ['localSearch', { path: SREL, matchString: 'needleStale', pageSize: 3, extras: H }, 'ls stale source'],
  ['localSearch', { path: `${W}/src/gen`, matchString: 'needleToken', pageSize: 4, resultView: 'files', extras: H }, 'ls files view paged'],
  ['localSearch', { path: `${RS}/src`, matchString: 'fn ', extras: H }, 'ls tokio default size'],
  ['localSearch', { path: `${RS}/src/runtime`, matchString: 'fn (spawn|block_on)\\b', regex: 'rust', pageSize: 4, extras: H }, 'ls regex rust'],
  ['localSearch', { path: `${RS}/src`, matchString: 'spawn(|block_on', regex: 'rust', extras: H }, 'ls regex broken (repair)'],
  ['localSearch', { path: `${W}/src`, matchString: 'NEEDLETOKEN', extras: H }, 'ls case mismatch'],
  ['localSearch', { path: `${W}/src`, matchString: 'needleToken_(?=1\\d)\\w+', regex: 'pcre2', pageSize: 5, extras: H }, 'ls regex pcre2'],
  ['localSearch', { path: `${W}/src`, matchString: 'needleToken|visibleSym', pageSize: 5, extras: H }, 'ls literal pipe'],
  ['localSearch', { path: W, matchString: 'zzqqNeverMatches', extras: H }, 'ls empty'],
  ['localSearch', { path: `${W}/nope`, matchString: 'x', extras: H }, 'ls scope miss'],
  ['localSearch', { path: W, matchString: 'ignoredSym', extras: H }, 'ls gitignored only'],
  ['localSearch', { path: W, matchString: 'hiddenSym', extras: H }, 'ls hidden only'],
  ['localSearch', { path: W, matchString: 'defaultExcludedSym', extras: H }, 'ls default-excluded only'],
  ['localSearch', { path: W, matchString: 'Sym', extras: H }, 'ls visible + skipped'],
  ['localSearch', { path: `${W}/src`, matchString: 'needleToken', resultView: 'filesWithout', extras: H }, 'ls filesWithout'],
  ['localSearch', { path: `${W}/src`, matchString: 'needleToken', resultView: 'countLines', extras: H }, 'ls countLines'],
  ['localSearch', { path: `${W}/src`, matchString: 'needleToken', resultView: 'countMatches', extras: H }, 'ls countMatches'],
  ['localSearch', { path: `${W}/src`, matchString: 'needleToken', resultView: 'matchOnly', pageSize: 5, extras: H }, 'ls matchOnly'],
  ['localSearch', { path: `${W}/src`, matchString: 'needleToken', fileHas: ['visibleSym'], fileLacks: ['zzqq'], extras: H }, 'ls fileHas/fileLacks'],
  ['localSearch', { path: `${W}/src`, matchString: 'needleToken', include: ['*.ts'], exclude: ['gen'], contextLines: 2, pageSize: 3, extras: H }, 'ls include/exclude/context'],
  ['localSearch', { path: `${W}/minified.js`, matchString: 'needleToken', extras: H }, 'ls minified clipped line'],
  ['localSearch', { path: 'octocode-local-testing/repos/javascript', matchString: 'function', pageSize: 3, extras: H }, 'ls javascript corpus'],
  ['localSearch', { path: 'octocode-local-testing/repos/python', matchString: 'def ', pageSize: 3, extras: H }, 'ls python corpus'],
  // localFetch
  ['localFetch', { path: `${W}/big.txt`, extras: H }, 'lf large default window'],
  ['localFetch', { path: `${W}/big.txt`, fullContent: true, extras: H }, 'lf large fullContent'],
  ['localFetch', { path: `${W}/big.txt`, matchString: 'needleBigHit', contextLines: 1, extras: H }, 'lf matchString windows'],
  ['localFetch', { path: `${W}/big.txt`, ranges: ['10-20', '300-305'], extras: H }, 'lf ranges'],
  ['localFetch', { path: `${W}/big.txt`, matchString: 'needleBig(Hit)?', regex: 'rust', extras: H }, 'lf regex rust'],
  ['localFetch', { path: `${RS}/src/task/join_set.rs`, matchString: 'pub fn spawn<F>', block: true, extras: H }, 'lf block'],
  ['localFetch', { path: `${RS}/src/task/join_set.rs`, minify: 'symbols', extras: H }, 'lf outline'],
  ['localFetch', { path: `${W}/minified.js`, extras: H }, 'lf minified one line'],
  ['localFetch', { path: `${W}/minified.js`, matchString: 'needleToken', extras: H }, 'lf minified match'],
  ['localFetch', { path: `${W}/big.txt`, matchString: 'zzqqNeverMatches', extras: H }, 'lf empty'],
  ['localFetch', { path: `${W}/big.txt`, matchString: 'NeedleBighit', extras: H }, 'lf smart-case miss'],
  ['localFetch', { path: `${W}/nope.txt`, extras: H }, 'lf scope miss'],
  ['localFetch', { path: `${W}/blob.bin`, extras: H }, 'lf binary'],
  ['localFetch', { path: path.join(FIXTURES, 'large/huge.log'), extras: H }, 'lf huge log'],
  ['localFetch', { path: `${W}/build/out.js`, matchString: 'ignoredSym', extras: H }, 'lf gitignored file'],
  // structureSearch
  ['structureSearch', { path: RS, extras: H }, 'ss tree'],
  ['structureSearch', { path: W, maxDepth: 2, extras: H }, 'ss tree fixture'],
  ['structureSearch', { path: `${W}/src`, operation: 'tree', pageSize: 5, extras: H }, 'ss tree paged'],
  ['structureSearch', { path: 'octocode-local-testing/repos/python', operation: 'files', include: ['*.py'], extras: H }, 'ss files python size page'],
  ['structureSearch', { path: RS, operation: 'files', extensions: ['rs'], maxEntries: 40, extras: H }, 'ss files maxEntries ceiling'],
  ['structureSearch', { path: `${W}/src`, operation: 'files', extensions: ['ts'], pageSize: 6, extras: H }, 'ss files paged'],
  ['structureSearch', { path: W, operation: 'files', include: ['out.js'], extras: H }, 'ss files gitignored only'],
  ['structureSearch', { path: W, operation: 'files', include: ['h.ts'], extras: H }, 'ss files hidden only'],
  ['structureSearch', { path: W, operation: 'files', include: ['i.js'], extras: H }, 'ss files default-excluded only'],
  ['structureSearch', { path: W, operation: 'files', include: ['*.zzqq'], extras: H }, 'ss files empty'],
  ['structureSearch', { path: `${W}/nope`, extras: H }, 'ss scope miss'],
  ['structureSearch', { path: 'octocode-local-testing/repos/typescript', operation: 'files', include: ['**/*.ts'], extras: H }, 'ss files huge corpus'],
  // astSearch
  ['astSearch', { path: `${RS}/src/task/join_set.rs`, operation: 'symbols', extras: H }, 'as symbols file'],
  ['astSearch', { path: `${RS}/src/task`, operation: 'symbols', kinds: ['function'], extras: H }, 'as symbols dir'],
  ['astSearch', { path: `${W}/src`, operation: 'symbols', symbolName: 'gen', extras: H }, 'as symbols by name'],
  ['astSearch', { path: `${RS}/src/task`, operation: 'match', pattern: 'pub fn $NAME($$$ARGS) $$$RET { $$$BODY }', language: 'rust', extras: H }, 'as match'],
  ['astSearch', { path: `${W}/src`, operation: 'match', pattern: 'export const $N = $V', language: 'typescript', extras: H }, 'as match fixture'],
  ['astSearch', { path: `${W}/src`, operation: 'match', rule: { kind: 'function_declaration', has: { pattern: 'helper($A)', stopBy: 'end' } }, language: 'typescript', extras: H }, 'as rule'],
  ['astSearch', { path: `${W}/src/a.ts`, operation: 'syntaxTree', extras: H }, 'as syntaxTree'],
  ['astSearch', { path: `${W}/src`, operation: 'symbols', symbolName: 'zzqqNeverMatches', extras: H }, 'as empty'],
  ['astSearch', { path: W, operation: 'symbols', symbolName: 'ignoredSym', extras: H }, 'as gitignored only'],
  ['astSearch', { path: `${W}/src`, operation: 'match', pattern: 'function $F(', language: 'typescript', extras: H }, 'as invalid pattern'],
  ['astSearch', { path: `${W}/nope`, operation: 'symbols', extras: H }, 'as scope miss'],
  ['astSearch', { path: path.join(FIXTURES, 'large/many-functions.ts'), operation: 'symbols', symbolName: 'helper', extras: H }, 'as too-large file'],
  // lspSearch
  ['lspSearch', { path: `${W}/src/a.ts`, operation: 'documentSymbols', extras: H }, 'lsp documentSymbols'],
  ['lspSearch', { path: `${W}/src/b.ts`, operation: 'definition', symbolName: 'visibleSym', line: 3, extras: H }, 'lsp definition'],
  ['lspSearch', { path: `${W}/src/a.ts`, operation: 'references', symbolName: 'visibleSym', line: 2, extras: H }, 'lsp references'],
  ['lspSearch', { path: `${W}/src/a.ts`, operation: 'callers', symbolName: 'visibleSym', line: 2, extras: H }, 'lsp callers'],
  ['lspSearch', { path: `${W}/src/a.ts`, operation: 'callees', symbolName: 'visibleSym', line: 2, extras: H }, 'lsp callees'],
  ['lspSearch', { path: `${W}/src/a.ts`, operation: 'hover', symbolName: 'visibleSym', line: 2, extras: H }, 'lsp hover'],
  ['lspSearch', { path: `${W}/src/shapes.ts`, operation: 'typeDefinition', symbolName: 'Shape', line: 2, extras: H }, 'lsp typeDefinition'],
  ['lspSearch', { path: `${W}/src/shapes.ts`, operation: 'implementation', symbolName: 'Shape', line: 1, extras: H }, 'lsp implementation'],
  ['lspSearch', { path: `${W}/src/shapes.ts`, operation: 'supertypes', symbolName: 'Rounded', line: 4, extras: H }, 'lsp supertypes'],
  ['lspSearch', { path: `${W}/src/shapes.ts`, operation: 'subtypes', symbolName: 'Circle', line: 2, extras: H }, 'lsp subtypes'],
  ['lspSearch', { path: `${W}/src/a.ts`, operation: 'diagnostic', extras: H }, 'lsp diagnostic'],
  ['lspSearch', { symbolName: 'visibleSym', workspaceRoot: WABS, operation: 'workspaceSymbol', extras: H }, 'lsp workspaceSymbol'],
  ['lspSearch', { path: `${W}/src/a.ts`, operation: 'definition', symbolName: 'visibleSym', line: 5, extras: H }, 'lsp anchor miss'],
  ['lspSearch', { path: `${W}/nope.ts`, operation: 'documentSymbols', extras: H }, 'lsp scope miss'],
  // astTopology (CLI when it is not on the MCP surface)
  ['astTopology', { path: WABS, operation: 'cycles', extras: H }, 'topology cycles'],
  ['astTopology', { path: WABS, operation: 'dependencies', source: 'src/a.ts', extras: H }, 'topology dependencies'],
  ['astTopology', { path: WABS, operation: 'dependents', source: 'src/b.ts', extras: H }, 'topology dependents'],
  ['astTopology', { path: WABS, operation: 'deadCode', pageSize: 5, maxFiles: 8, extras: H }, 'topology deadCode ceiling'],
  ['astTopology', { path: WABS, operation: 'reachability', entrypoints: ['src/a.ts'], extras: H }, 'topology reachability'],
  ['astTopology', { path: WABS, operation: 'path', source: 'src/a.ts', target: 'src/b.ts', extras: H }, 'topology path'],
  ['astTopology', { path: WABS, operation: 'dependencies', source: 'src/nope.ts', extras: H }, 'topology scope miss'],
  ['astTopology', { path: WABS, operation: 'drift', baseline: path.join(FIXTURES, 'lsp/esm-tsconfig'), extras: H }, 'topology drift'],
  ['astTopology', { path: path.join(REPOS, 'javascript'), operation: 'deadCode', pageSize: 3, extras: H }, 'topology javascript corpus paged'],
  // astRewrite: the preview carries hints.apply (executed against the fixture workspace)
  ['astRewrite', { path: `${W}/src`, pattern: 'helper($A)', rewrite: 'helper($A + 0)', language: 'typescript', extras: H }, 'rewrite preview'],
  ['astRewrite', { path: `${W}/src`, pattern: 'zzqqNeverMatches($A)', rewrite: 'x($A)', language: 'typescript', extras: H }, 'rewrite empty'],
  ['astRewrite', { path: `${W}/nope`, pattern: 'helper($A)', rewrite: 'x($A)', extras: H }, 'rewrite scope miss'],
];

const GH = { owner: 'bgauryy', repo: 'octocode' }; // the canonical name: a renamed repo would make every lead differ from its source
const githubFixtures = [
  ['ghSearchRepo', { keywords: ['octocode'], owner: 'bgauryy', pageSize: 5, extras: H }, 'gh repo search'],
  ['ghSearchRepo', { keywords: ['zzqqnevermatchesrepo12345'], extras: H }, 'gh repo empty'],
  ['ghSearchRepo', { ...GH, extras: H }, 'gh repo facts'],
  ['ghSearchCode', { ...GH, keywords: ['continuation'], pageSize: 3, extras: H }, 'gh code'],
  ['ghSearchCode', { ...GH, keywords: ['continuation'], ref: 'main', pageSize: 3, extras: H }, 'gh code ref'],
  ['ghSearchCode', { ...GH, keywords: ['zzqqnevermatchescode12345'], extras: H }, 'gh code empty'],
  ['ghStructure', { ...GH, path: 'packages', extras: H }, 'gh structure dir'],
  ['ghStructure', { ...GH, path: 'packages/zzqqnope', extras: H }, 'gh structure miss'],
  ['ghStructure', { ...GH, operation: 'refs', extras: H }, 'gh structure refs'],
  ['ghGetFileContent', { ...GH, path: 'README.md', extras: H }, 'gh file'],
  ['ghGetFileContent', { ...GH, path: 'README.md', matchString: 'zzqqnevermatches', extras: H }, 'gh file empty'],
  ['ghGetFileContent', { ...GH, path: 'zzqq/nope.md', extras: H }, 'gh file miss'],
  ['ghSearchHistory', { ...GH, operation: 'pullRequest', state: 'merged', pageSize: 3, extras: H }, 'gh history prs'],
  ['ghSearchHistory', { ...GH, operation: 'commit', pageSize: 3, extras: H }, 'gh history commits'],
  ['ghSearchHistory', { ...GH, operation: 'issue', pageSize: 3, extras: H }, 'gh history issues'],
  ['ghSearchHistory', { ...GH, operation: 'issue', keywords: ['zzqqnevermatcheshistory12345'], extras: H }, 'gh history empty'],
  ['artifactSearch', { ecosystem: 'npm', packageName: 'octocode-mcp', extras: H }, 'artifact npm'],
  ['artifactSearch', { ecosystem: 'crates', packageName: 'tokio', extras: H }, 'artifact crates'],
  ['artifactSearch', { ecosystem: 'npm', packageName: 'zzqq-nope-pkg-12345', extras: H }, 'artifact miss'],
];

// Execution.
const octocodeBin = path.join(ROOT, 'packages/octocode/out/octocode.js');
function tokenAvailable() {
  if (process.env.GITHUB_TOKEN || process.env.GH_TOKEN) return true;
  return spawnSync(process.execPath, [octocodeBin, 'auth', 'status'], { encoding: 'utf8', timeout: 20_000 }).status === 0;
}
buildWorkspace();
const client = await startServer({ env: { OCTOCODE_BETA: 'true', PATH: `${path.join(ROOT, 'node_modules', '.bin')}${path.delimiter}${process.env.PATH}` }, timeoutMs: 90_000 });
const mcpTools = new Set(client.tools.map(t => t.name));
const onMcp = name => mcpTools.has(name);
const CLI_ONLY = new Set(['astTopology', 'astRewrite']); // graph/rewrite tools reached through the CLI when the MCP server does not list them
const exec = (tool, args, label) => (onMcp(tool) ? client.raw(tool, args, label) : cliEntry(tool, args, { label, timeout: 90_000 }));
// The published MCP schema leaves some fields out (e.g. astSearch includeIgnored); the CLI `schema --view query` lists every accepted field.
const fieldProps = new Map();
function propsOf(tool) {
  if (!fieldProps.has(tool)) {
    const run = spawnSync(process.execPath, [octocodeBin, 'schema', tool, '--view', 'query'], { encoding: 'utf8', timeout: 30_000 });
    try { fieldProps.set(tool, properties(JSON.parse(run.stdout).querySchema)); } catch { fieldProps.set(tool, new Set()); }
  }
  return fieldProps.get(tool);
}
async function pool(items, worker) {
  let i = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => { while (i < items.length) await worker(items[i++]); }));
}

const haveGithub = tokenAvailable();
const plan = fixtures().filter(([tool, , label]) => {
  if (onMcp(tool) || CLI_ONLY.has(tool)) return true;
  skip(`fixture ${label}`, `${tool} is not registered on this server`);
  return false;
});
if (haveGithub) plan.push(...githubFixtures);
else skip('GitHub fixtures', 'no GitHub token (GITHUB_TOKEN, GH_TOKEN or `octocode auth status`): GitHub leads are not replayed');

// A brief on these fixtures probes that no continuation inherits mainGoal/reasoning (one per tool family).
const BRIEF = new Set(['lf large default window', 'ss files paged', 'as symbols dir', 'lsp references', 'gh code', 'gh history prs', 'topology deadCode ceiling', 'lf matchString windows']);
const sources = [];
await pool(plan, async ([tool, rawQuery, label]) => {
  const query = BRIEF.has(label) ? { ...rawQuery, mainGoal: 'lead replay probe', reasoning: 'brief inheritance probe' } : rawQuery;
  const args = { queries: [query] };
  sources.push({ label, tool, args, entry: await exec(tool, args, label), depth: 0 });
});
sources.sort((a, b) => plan.findIndex(p => p[2] === a.label) - plan.findIndex(p => p[2] === b.label));

// A stale snapshot: the page-2 lead of a fixture search after the corpus changed must offer next.restart.
{
  const probe = sources.find(s => s.label === 'ls stale source');
  if (probe) probe.noReplay = true; // its own page leads go stale on purpose below
  const page = leadsOf(probe?.entry.sc).find(l => l.key === 'nextPage');
  if (page) {
    fs.appendFileSync(path.join(SABS, 's00.ts'), 'export const staleProbe = 1; // needleStale\n');
    sources.push({ label: 'ls stale snapshot', tool: page.tool, args: page.query, entry: await exec(page.tool, page.query, 'stale page'), depth: 0 });
  }
}

// Judging.
const failures = [];
const xfails = [];
const replayed = [];
const stats = { sourceCalls: sources.length, leadsSeen: 0, replayed: 0, duplicates: 0, capped: 0, overBudget: 0, skipped: {}, assertions: 0 };

function outcomeOf(entry) {
  const rows = entry.sc?.results ?? [];
  const statuses = rows.map(r => r.status ?? 'ok');
  const codes = rows.map(r => r.data?.errorCode).filter(Boolean);
  const error = entry.isError || statuses.includes('error');
  return { rows, codes, error, empty: rows.length > 0 && statuses.every(s => s === 'empty'), text: `${error ? 'error' : statuses.every(s => s === 'empty') ? 'empty' : 'ok'} ${codes.join(',')} ${entry.isError && !rows.length ? short(entry.text, 200) : ''}`.trim() };
}

let batch = [];
function record(_lead, _source, assertion, ok, detail) { batch.push({ assertion, ok: !!ok, detail }); stats.assertions += 1; return ok; }
/** One PASS line per lead listing the assertions that held; a FAIL (or XFAIL) line each for the rest. */
function flush(lead, source) {
  const base = `${source.label} :: ${lead.key} (${lead.container}) -> ${lead.tool}`;
  const passed = batch.filter(b => b.ok).map(b => b.assertion);
  if (passed.length) check(`${base} :: ${passed.join(',')}`, true);
  for (const { assertion, detail } of batch.filter(b => !b.ok)) {
    const name = `${base} :: ${assertion}`;
    const known = knownOpen(assertion, lead.key);
    const info = { source: source.label, sourceTool: source.tool, sourceQuery: source.args, leadPath: lead.path, key: lead.key, tool: lead.tool, query: lead.query, assertion, outcome: short(detail, 600), ...(known && { knownOpen: known.id }) };
    if (known) {
      xfails.push(info);
      results.push({ suite: SUITE, name, ok: null, skipped: `expected failure ${known.id}: ${known.why}`, detail: short(detail, 220) });
      console.log(`XFAIL [${SUITE}] ${name} - ${known.id}: ${short(detail, 160)}`);
      continue;
    }
    failures.push(info);
    check(name, false, detail);
    console.log(`  source: ${source.tool} ${short(canon(source.args), 300)}\n  lead  : ${lead.key} ${short(canon(lead.query), 400)}\n  result: ${short(detail, 400)}`);
  }
  batch = [];
}

const SCOPE_FIELDS = new Set(['path', 'include', 'exclude', 'extensions', 'maxDepth', 'minDepth', 'maxEntries', 'maxFiles', 'fileHas', 'fileLacks', 'kinds', 'language', 'filename', 'entryType', 'nameRegex', 'pageSize', 'resultView', 'owner', 'repo']);
const stripContinuation = q => Object.fromEntries(Object.entries(q).filter(([k]) => !CONTINUATION_FIELDS.has(k)));
const PATH_FIELDS = new Set(['path', 'baseline', 'workspaceRoot']);
const norm = (k, v) => (PATH_FIELDS.has(k) && typeof v === 'string' ? path.resolve(ROOT, v) : v ?? null);
const pinnedRef = (k, src, v) => k === 'ref' && src === undefined && /^[0-9a-f]{40}$/.test(v); // pinning an unset ref to its SHA keeps the revision
function scopeChanges(src, lead, { mutable = new Set(), additions = false } = {}) {
  const changed = [];
  for (const k of new Set([...Object.keys(stripContinuation(src)), ...Object.keys(stripContinuation(lead))])) {
    if (mutable.has(k) || pinnedRef(k, src[k], lead[k])) continue;
    if (additions && !(k in src)) continue;
    if (!sameJson(norm(k, src[k]), norm(k, lead[k]))) changed.push(`${k}: ${short(src[k] ?? null, 50)} -> ${short(lead[k] ?? null, 50)}`);
  }
  return changed;
}
function fileHolds(rel, text) {
  const abs = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
  try {
    const smart = text === text.toLowerCase(); // smart-case: an uppercase letter makes the match case-sensitive
    if (fs.statSync(abs).isFile()) return smart ? fs.readFileSync(abs, 'utf8').toLowerCase().includes(text) : fs.readFileSync(abs, 'utf8').includes(text);
    const run = spawnSync('grep', [smart ? '-rIlFi' : '-rIlF', '--exclude-dir=node_modules', '--exclude-dir=.git', '--exclude-dir=target', '--exclude-dir=build', '--exclude-dir=dist', '--exclude=*.log', text, abs], { encoding: 'utf8', timeout: 10_000 });
    return run.stdout.split('\n').filter(Boolean).some(f => !path.relative(abs, f).split(path.sep).some(seg => seg.startsWith('.')));
  } catch { return null; }
}

/** Judge one executed lead against the predicates of its key family. */
function judge(lead, source, entry, shown, { walked = false } = {}) {
  const out = outcomeOf(entry);
  const lq = rowOf(lead.query);
  const sq = rowOf(source.args, lead.rowIndex ?? 0);
  const single = (lead.query.queries ?? []).length === 1;
  const sameTool = lead.tool === source.tool;
  const { key } = lead;
  const text = `${JSON.stringify(entry.sc ?? '')}${entry.text}`;

  const invalid = (entry.isError && !out.rows.length) || out.codes.some(c => /^invalid/.test(c));
  record(lead, source, 'valid', !invalid, out.text);
  if (key !== 'retry') record(lead, source, 'executes', invalid || !out.error, out.text);

  // Channel: withheld evidence is a `next` page; a lead lives under `hints`.
  if (!walked && PAGE_KEYS.test(key) && key !== 'responsePagination.next') record(lead, source, 'channel', lead.container === 'next', `${key} is a page but sits under ${lead.container}`);

  const rule = KEY_TOOLS.find(([re]) => re.test(key))?.[1];
  if (rule && !walked) record(lead, source, 'key-tool', rule.tools.includes(lead.tool) && (!rule.operation || lq.operation === rule.operation), `${lead.tool} operation=${lq.operation ?? '-'}; ${key} expects ${rule.tools.join('|')}${rule.operation ? ` ${rule.operation}` : ''}`);
  if (!walked && (SAME_TOOL_KEYS.test(key) || SAME_TOOL_PAGE_KEYS.test(key))) record(lead, source, 'key-tool', sameTool || (key === 'includeArchived' && lead.tool === 'ghSearchRepo'), `${lead.tool} lead from a ${source.tool} row`);

  // Request-level fields (TOOL_DATA_CONTRACT): no continuation inherits mainGoal/reasoning; a same-tool lead inherits extras, a cross-tool lead only `hints`.
  if (single && !walked && lead.tool !== 'clasify') {
    record(lead, source, 'no-brief', !('mainGoal' in lq) && !('reasoning' in lq), `lead carries mainGoal=${short(lq.mainGoal ?? null, 40)} reasoning=${short(lq.reasoning ?? null, 40)}`);
    record(lead, source, 'extras', sameTool ? (sq.extras ?? []).every(e => (lq.extras ?? []).includes(e)) : (lq.extras ?? []).every(e => e === 'hints'), `lead extras=${short(lq.extras ?? null)} source extras=${short(sq.extras ?? null)} ${sameTool ? 'same tool' : 'cross tool'}`);
  }

  // include* keys set the flag they name.
  const flag = FLAG_KEYS[key];
  if (flag && single && propsOf(lead.tool).has(flag)) {
    record(lead, source, 'lifts-flag', lq[flag] === true, `${flag}=${lq[flag] ?? 'unset'} includeHidden=${lq.includeHidden ?? 'unset'} defaultExcludes=${lq.defaultExcludes ?? 'unset'}`);
  }

  // A same-tool lead keeps everything it does not mutate.
  if (single && sameTool && (flag || PAGE_KEYS.test(key) || /^(restart|retry)$/.test(key))) {
    const mutable = MUTABLE.find(([re]) => re.test(key))?.[1];
    const changed = scopeChanges(sq, lq, { mutable, additions: ADDS_OPTIONS.test(key) || /^continue/.test(key) });
    record(lead, source, 'keeps-scope', changed.length === 0, changed.join('; '));
  }
  // narrowScope keeps the question (what is searched) and changes where it looks.
  if (single && sameTool && key === 'narrowScope') {
    // structureSearch narrows by listing subdirectories: its operation picks the listing shape, not the question.
    const scope = lead.tool === 'structureSearch' ? new Set([...SCOPE_FIELDS, 'operation']) : SCOPE_FIELDS;
    const changed = scopeChanges(sq, lq, { mutable: scope, additions: true });
    const narrowed = [...scope].some(k => !sameJson(norm(k, sq[k]), norm(k, lq[k])));
    record(lead, source, 'keeps-scope', changed.length === 0 && narrowed, changed.length ? changed.join('; ') : narrowed ? '' : 'narrowScope changes no scope field');
  }

  // A lead ref is the source ref or a pinned SHA (or a value the source result carries).
  if (single && typeof lq.ref === 'string') {
    const pinned = lq.ref === sq.ref || /^[0-9a-f]{40}$/.test(lq.ref) || JSON.stringify(source.entry.sc ?? '').includes(lq.ref);
    record(lead, source, 'ref-pinned', pinned, `ref=${lq.ref} source ref=${sq.ref ?? 'unset'}`);
  }

  if (!out.error && NOT_EMPTY_KEYS.test(key)) record(lead, source, 'non-empty', !out.empty, out.text);

  // Paging: rows not already shown, or an explicit terminal limit.
  if (PAGE_KEYS.test(key) && key !== 'responsePagination.next' && !out.error) {
    const now = atoms(entry.sc);
    const fresh = [...now].filter(a => !shown.has(a)).length;
    record(lead, source, 'fresh', fresh > 0 || terminal(entry), `${fresh} new of ${now.size} evidence atoms; terminalLimit=${terminal(entry)}`);
  }

  if (key === 'findText' && !out.error) {
    const hits = lead.tool === 'localSearch' ? hitValues(entry.sc) : [];
    const matchers = matchersOf(lq);
    if (hits.length && matchers.length) record(lead, source, 'hits-match', hits.every(v => matchers.some(m => m.test(v))), `${hits.length} hits; first unmatched: ${short(hits.find(v => !matchers.some(m => m.test(v))) ?? '', 100)}; matchString=${short(lq.matchString ?? '', 80)} regex=${lq.regex ?? 'literal'}`);
    const anchor = typeof sq.symbolName === 'string' ? sq.symbolName : typeof sq.matchString === 'string' && sq.regex !== 'rust' && sq.regex !== 'pcre2' ? sq.matchString : null;
    const held = anchor && lq.path ? fileHolds(lq.path, anchor) : null;
    if (held) record(lead, source, 'finds-anchor', !out.empty, `${lq.path} holds ${short(anchor, 60)} but the lead found nothing: matchString=${short(lq.matchString ?? '', 80)} regex=${lq.regex ?? 'literal'}`);
  }

  // A read lead shows an anchor line of its source row, or its matchString.
  if (/^read[A-Za-z]*$/.test(key) && !PAGE_KEYS.test(key) && ['localFetch', 'ghGetFileContent'].includes(lead.tool) && !out.error && single) {
    const anchors = anchorsOf(source.entry.sc, lead.rowIndex).lines.get(lq.path);
    if (anchors?.size) {
      const shownNow = shownLines(entry);
      const text2 = JSON.stringify(entry.sc?.results ?? '');
      const ok = [...anchors].some(l => shownNow.has(l)) || matchersOf(lq).some(m => m.test(text2));
      record(lead, source, 'covers-anchor', ok, `anchors ${[...anchors].slice(0, 6)} not shown; lead ranges=${short(lq.ranges ?? null)} matchString=${short(lq.matchString ?? null)}`);
    }
  }

  // lspSearch anchors: the line holds the symbol.
  if (lead.tool === 'lspSearch' && single && lq.path && Number.isInteger(lq.line) && typeof lq.symbolName === 'string') {
    try {
      const file = fs.readFileSync(path.isAbsolute(lq.path) ? lq.path : path.join(ROOT, lq.path), 'utf8').split('\n');
      const name = lq.symbolName.split(/[.:]+/).pop();
      record(lead, source, 'anchor-line', (file[lq.line - 1] ?? '').includes(name), `${lq.path}:${lq.line} is ${short(file[lq.line - 1] ?? '<past end>', 100)}; symbolName=${lq.symbolName}`);
    } catch { /* remote or unreadable path: nothing to compare */ }
  }

  if (key === 'viewReleaseSource' && single) {
    const where = [lq.path, ...(lq.include ?? [])].filter(p => typeof p === 'string');
    record(lead, source, 'not-build', !where.some(p => BUILD_OUTPUT.test(p)), `path=${lq.path ?? '-'} include=${short(lq.include ?? null)} ref=${lq.ref ?? '-'}`);
  }
  flush(lead, source);
  return out;
}

// Replay: breadth-first over every distinct lead, bounded per key and by the time budget.
const seen = new Set();
const perKey = new Map();
const queue = [];
const enqueue = (source) => {
  for (const lead of leadsOf(source.entry.sc)) {
    stats.leadsSeen += 1;
    queue.push({ lead, source });
  }
};
for (const s of sources.filter(x => !x.noReplay)) enqueue(s);
const keyStats = new Map();
const bump = (key, field) => { const k = keyStats.get(key) ?? { emitted: 0, replayed: 0 }; k[field] += 1; keyStats.set(key, k); };
queue.forEach(({ lead }) => bump(`${lead.container}.${lead.key}`, 'emitted'));
// Rare keys first, so the time budget cuts the repeated ones (hints.read repeats per hit), not a lone lead.
queue.sort((a, b) => keyStats.get(`${a.lead.container}.${a.lead.key}`).emitted - keyStats.get(`${b.lead.container}.${b.lead.key}`).emitted);

async function replay({ lead, source }) {
  const id = `${lead.tool}:${canon(lead.query)}`;
  const kind = `${lead.tool}:${lead.key}`;
  const why = SKIP_EXEC_KEYS[lead.key];
  if (why) { stats.skipped[lead.key] = (stats.skipped[lead.key] ?? 0) + 1; return; }
  if (seen.has(id)) { stats.duplicates += 1; return; }
  if (Date.now() - STARTED > BUDGET_MS) { stats.overBudget += 1; return; }
  if ((perKey.get(kind) ?? 0) >= PER_KEY) { stats.capped += 1; return; }
  seen.add(id);
  perKey.set(kind, (perKey.get(kind) ?? 0) + 1);
  stats.replayed += 1;
  bump(`${lead.container}.${lead.key}`, 'replayed');
  const entry = await exec(lead.tool, lead.query, `${source.label} > ${lead.key}`);
  const shown = atoms(source.entry.sc);
  const out = judge(lead, source, entry, shown);
  replayed.push({ source: source.label, key: lead.key, container: lead.container, tool: lead.tool, query: lead.query, outcome: out.text, ms: entry.ms });
  const child = { label: `${source.label} > ${lead.key}`, tool: lead.tool, args: lead.query, entry, depth: source.depth + 1 };

  // Walk a paging lead on: every further page shows rows not yet shown and keeps the scope.
  if (PAGE_KEYS.test(lead.key) && lead.key !== 'responsePagination.next' && !out.error) {
    const everShown = new Set([...shown, ...atoms(entry.sc)]);
    let current = child;
    for (let n = 2; n <= WALK_PAGES + 1; n++) {
      const next = leadsOf(current.entry.sc).find(l => l.key === lead.key);
      if (!next || seen.has(`${next.tool}:${canon(next.query)}`)) break;
      seen.add(`${next.tool}:${canon(next.query)}`);
      const walked = await exec(next.tool, next.query, `${child.label} page ${n}`);
      const step = { ...next, path: `${lead.path}#page${n}` };
      judge(step, current, walked, everShown, { walked: true });
      stats.replayed += 1;
      atoms(walked.sc).forEach(a => everShown.add(a));
      current = { label: `${child.label} page ${n}`, tool: next.tool, args: next.query, entry: walked, depth: child.depth };
      if (outcomeOf(walked).error) break;
    }
  }
  if (child.depth < MAX_DEPTH) { const before = queue.length; enqueue(child); queue.slice(before).forEach(({ lead: l }) => bump(`${l.container}.${l.key}`, 'emitted')); }
}

// astRewrite's `apply` writes the fixture workspace, which stales every snapshot taken from it: run those last, one at a time.
for (let cursor = 0; cursor < queue.length;) {
  const batch = queue.slice(cursor, cursor + CONCURRENCY).filter(item => item.lead.key !== 'apply');
  cursor += CONCURRENCY;
  await Promise.all(batch.map(replay));
}
for (const item of queue.filter(item => item.lead.key === 'apply')) await replay(item);

// Report.
const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/octocode-config/contract/tool-contract.json'), 'utf8'));
const contractKeys = new Set(Object.values(contract.continuationChannels?.kinds ?? {}).flat());
const emitted = new Set([...keyStats.keys()].map(k => k.split('.').slice(1).join('.')));
const unexercised = [...contractKeys].filter(k => !emitted.has(k)).sort();
if (stats.overBudget) skip('replay budget', `${stats.overBudget} leads not replayed: the ${BUDGET_MS} ms budget ended (raise OCTOCODE_LEAD_REPLAY_BUDGET_MS)`);
for (const [key, n] of Object.entries(stats.skipped)) skip(`lead ${key}`, `${n} not executed: ${SKIP_EXEC_KEYS[key]}`);
console.log(`\n[${SUITE}] ${stats.sourceCalls} source calls, ${stats.leadsSeen} leads seen, ${stats.replayed} replayed, ${stats.duplicates} duplicates, ${stats.capped} over the per-key cap (${PER_KEY}), ${stats.overBudget} over budget, ${(Date.now() - STARTED) / 1000}s`);
console.log(`[${SUITE}] expected failures: ${xfails.length}; contract lead keys no fixture emitted: ${unexercised.join(', ') || 'none'}`);
const keyTable = [...keyStats].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k} ${v.replayed}/${v.emitted}`).join(', ');
console.log(`[${SUITE}] replayed/emitted per key: ${keyTable}`);

const result = summary();
writeResults(SUITE, { stats, keyStats: Object.fromEntries(keyStats), unexercised, failures, xfails, replayed, sources: sources.map(s => ({ label: s.label, tool: s.tool, args: s.args, ms: s.entry.ms, outcome: outcomeOf(s.entry).text })), results: result.results });
client.close();
if (!process.env.OCTOCODE_LEAD_REPLAY_KEEP) { fs.rmSync(WABS, { recursive: true, force: true }); fs.rmSync(SABS, { recursive: true, force: true }); }
process.exitCode = result.failed.length ? 1 : 0;
