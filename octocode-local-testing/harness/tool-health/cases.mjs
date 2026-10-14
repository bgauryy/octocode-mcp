// Per-tool cases for harness/tool-health.mjs. Every contract tool needs one
// entry; the suite fails on a contract tool without a case or a case without a
// contract tool. Each case names, per check, a single query (wrapped as
// {queries:[query]}) or `{ na: reason }` when the check cannot apply to the
// tool; `rows(data, json)` turns a response row's data into stable row ids
// (used for continuation dedupe and paged-vs-unpaged completeness).
//
// Every seed (happy, page, empty, `explore`, `walks`) is explored by
// tool-health/driver.mjs: each lead it emits runs once and is judged.
//   page      the primary page channel `lead`, walked to its end; the union of
//             its rows equals the unpaged rows (`unpaged` query, else happy) or
//             `expect(ctx)`
//   walks     further page walks `{label, query, lead, rows?, unpaged?, expect?,
//             check?(rows), minPages?, chainKey?}`; `chainKey` marks a lead
//             outside the contract page kinds that still resumes a walk
//             (next.clasify)
//   channels  row ids per page channel key, for the driver's exactly-once check
//   explore   more seeds `{label, query, class?, check?(data, report)}`
//   workspace `(ctx) => dir`: the tool's cwd (CLI and its MCP server) instead of
//             fixtures/tool-health, for cases that write or need more files
//
// Local tools read fixtures/tool-health (the process cwd) or a temp copy of it.
// GitHub tools read the loopback mock's `octo/demo` (built from the same
// fixture files, plus the bulk pull request #4 of addBulkPullRequest);
// artifactSearch reads the mock npm registry; clasify the mock jev provider.
import fs from 'node:fs';
import path from 'node:path';
import { declarations, lspLocations, structureFiles, sourceView, inventoryRows } from '../mcp-client.mjs';
import { leadsIn } from './driver.mjs';

const files = data => (data?.files ?? []).flatMap(file => (file.matches ?? []).map(m => `${file.path}:${m.line}`));
const lines = text => Array.from({ length: text.split('\n').length - (text.endsWith('\n') ? 1 : 0) }, (_, i) => i + 1);
const numbered = text => sourceView({ content: text ?? '' }).ranges.flatMap(r => Array.from({ length: r.end - r.start + 1 }, (_, i) => r.start + i));

/** Local budgets cover a cold CLI process; lsp covers a cold language server. */
const LOCAL = 6000, REMOTE = 6000, LSP = 25000;

/** A temp copy of the fixture as the tool's workspace, plus `extra` files (relative path → text). */
function workspace(ctx, name, extra = {}) {
  const dir = path.join(ctx.tmp, `ws-${name}`);
  fs.cpSync(ctx.fixture, dir, { recursive: true });
  for (const [rel, text] of Object.entries(extra)) { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); }
  return dir;
}

/** Apply a unified diff (as astRewrite previews it) to `text`. */
export function applyPatch(text, patch) {
  const src = text.split('\n');
  const out = [];
  let at = 0;
  const lines = patch.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const h = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/.exec(lines[i]);
    if (!h) continue;
    const start = Number(h[1]) - (h[2] === '0' ? 0 : 1);
    while (at < start) out.push(src[at++]);
    for (i++; i < lines.length && !lines[i].startsWith('@@'); i++) {
      const line = lines[i];
      if (line.startsWith('\\')) continue;
      if (line.startsWith('+')) out.push(line.slice(1));
      else if (line.startsWith('-')) { if (src[at] !== line.slice(1)) throw new Error(`patch removes "${line.slice(1)}" but line ${at + 1} is "${src[at]}"`); at++; }
      else if (line.startsWith(' ')) { if (src[at] !== line.slice(1)) throw new Error(`patch context "${line.slice(1)}" but line ${at + 1} is "${src[at]}"`); out.push(src[at++]); }
    }
    i--;
  }
  while (at < src.length) out.push(src[at++]);
  return out.join('\n');
}

/** Patch rows of a ghGetHistoryItem response: `path:line` per numbered patch line (`N\t+text`). */
const patchRows = data => (data?.pullRequests ?? []).flatMap(pr => (pr.files ?? []).flatMap(f => (f.patch ?? '').split('\n').map(l => /^(\d+)\t/.exec(l)?.[1]).filter(Boolean).map(n => `${f.path}:${n}`)));
const fileRows = data => (data?.pullRequests ?? []).flatMap(pr => inventoryRows(pr.files).map(f => `#${pr.number}:${f.path}:${f.status}`));
/** ghStructure tree rows: every file and every listed folder (a page holds either). */
const treeRows = data => (data.files ?? []).flatMap(group => [
  ...structureFiles([{ ...group, files: group.files ?? [] }]).map(f => f.path),
  ...(group.folders ?? []).map(f => `${group.dir === '.' ? '' : `${group.dir}/`}${f}/`),
]);

/** ghCloneRepo: the explored leads into local tools rooted at the checkout, each answered with rows. */
function localFollowUps(report, localPath) {
  const local = (report?.calls ?? []).filter(c => c.label !== 'seed' && ['structureSearch', 'localSearch', 'localFetch', 'astSearch', 'lspSearch'].includes(c.tool));
  const outside = local.filter(c => !(c.query.queries ?? []).every(q => typeof q.path === 'string' && localPath && (q.path === localPath || q.path.startsWith(`${localPath}/`))));
  return [
    ['clone.followUps', local.length > 0, `local leads executed: ${local.map(c => `${c.label} (${c.cls})`).join(', ') || 'none'}`],
    ['clone.followUps.rooted', local.length > 0 && !outside.length, outside.length ? `lead outside the checkout: ${JSON.stringify(outside[0].query).slice(0, 160)}` : ''],
    ['clone.followUps.answered', local.length > 0 && local.every(c => c.cls === 'ok'), local.filter(c => c.cls !== 'ok').map(c => `${c.label}: ${c.cls}`).join('; ')],
  ];
}

/** Located windows of a clasify locate walk: `path:line-endLine` per judged page. */
const locateRows = data => (data?.resources ?? []).flatMap(r => (r.pages ?? []).map(p => `${r.path}:${p.line}-${p.endLine}`));
const LOCATE_LINES = 6000, LOCATE_EVERY = 400;

export const CASES = {
  localSearch: {
    budgetMs: LOCAL,
    happy: { query: { matchString: 'healthMarker', path: 'src' }, fields: ['files', 'matchCount'], rows: files, min: 4 },
    page: { query: { matchString: 'healthMarker', path: 'src', pageSize: 1 }, lead: 'nextPage' },
    empty: { query: { matchString: 'zzzNoSuchToken', path: 'src' } },
    invalid: { query: { path: 'src' } },
    explore: [
      { label: 'files', query: { matchString: 'healthMarker', path: '.', resultView: 'files' } },
      { label: 'ignoreCase', query: { matchString: 'HEALTHMARKER', path: 'src' }, class: 'empty' },
      { label: 'regex', query: { matchString: 'greet(Loudly)?\\(', regex: 'rust', path: 'src' }, deep: true },
      { label: 'countMatches', query: { matchString: 'greet', path: 'src', resultView: 'countMatches' }, deep: true },
    ],
  },
  structureSearch: {
    budgetMs: LOCAL,
    happy: { query: { path: '.', operation: 'files' }, fields: ['files', 'summary'], rows: data => structureFiles(data.files).map(f => f.path), min: 5 },
    page: { query: { path: '.', operation: 'files', pageSize: 2 }, lead: 'nextPage' },
    empty: { query: { path: '.', operation: 'files', include: ['zzzNoSuchName*'] } },
    invalid: { query: { operation: 'files' } },
    explore: [
      { label: 'tree', query: { path: '.', operation: 'tree' } },
      { label: 'ts', query: { path: 'src', operation: 'files', extensions: ['ts'], pageSize: 1 }, deep: true },
    ],
  },
  astSearch: {
    budgetMs: LOCAL,
    happy: { query: { path: 'src', operation: 'symbols' }, fields: ['files'], rows: data => declarations({ sc: { results: [{ data }] } }).map(d => `${d.path}:${d.name}:${d.line}`), min: 6 },
    page: { query: { path: 'src', operation: 'symbols', pageSize: 1 }, lead: 'nextPage' },
    empty: { query: { path: 'src', operation: 'match', pattern: 'zzzNoSuchCall($A)' } },
    invalid: { query: { path: 'src', operation: 'match' } },
    explore: [
      { label: 'match', query: { path: 'src', operation: 'match', pattern: 'greet($A)', language: 'typescript' } },
      { label: 'syntaxTree', query: { path: 'src/app.ts', operation: 'syntaxTree' }, deep: true },
      { label: 'byName', query: { path: 'src', operation: 'symbols', symbolName: 'greet' }, deep: true },
    ],
  },
  localFetch: {
    budgetMs: LOCAL,
    happy: { query: { path: 'src/greeter.ts', fullContent: true }, fields: ['path', 'content', 'totalLines'], rows: data => numbered(data.content), min: 18 },
    page: { query: { path: 'src/greeter.ts', unit: 'lines', offset: 0, length: 5 }, lead: 'continueWindow' },
    empty: { query: { path: 'src/greeter.ts', matchString: 'zzzNoSuchText' } },
    invalid: { query: { path: 'src/greeter.ts', ranges: 'not-an-array' } },
    explore: [
      { label: 'match', query: { path: 'src/greeter.ts', matchString: 'greet', contextLines: 1 } },
      { label: 'outline', query: { path: 'src/greeter.ts', minify: 'symbols' }, deep: true },
      { label: 'ranges', query: { path: 'src/app.ts', ranges: ['1-2', '6-8'] }, deep: true },
    ],
  },
  lspSearch: {
    budgetMs: LSP,
    needs: 'lsp',
    happy: { query: { path: 'src/greeter.ts', symbolName: 'greet', line: 6, operation: 'references' }, fields: ['files', 'matchCount', 'coverage'], rows: data => lspLocations({ sc: { results: [{ data }] } }).map(l => `${l.path}:${l.displayRange.startLine}:${l.displayRange.startCharacter}`), min: 6 },
    page: { query: { path: 'src/greeter.ts', symbolName: 'greet', line: 6, operation: 'references', pageSize: 1 }, lead: 'nextPage' },
    empty: { query: { operation: 'workspaceSymbol', workspaceRoot: '.', symbolName: 'zzzNoSuchSymbol' } },
    invalid: { query: { path: 'src/greeter.ts', symbolName: 'greet' } },
    explore: [
      { label: 'callers', query: { path: 'src/greeter.ts', symbolName: 'greet', line: 6, operation: 'callers' } },
      { label: 'definition', query: { path: 'src/app.ts', symbolName: 'greet', line: 6, operation: 'definition' }, deep: true },
      { label: 'documentSymbols', query: { path: 'src/greeter.ts', operation: 'documentSymbols' }, deep: true },
      { label: 'workspaceSymbol', query: { operation: 'workspaceSymbol', workspaceRoot: '.', symbolName: 'Greeter' }, deep: true },
    ],
  },
  astTopology: {
    budgetMs: LOCAL,
    // Four unreachable modules plus util.ts greetLoudly: five dead exports from src/app.ts.
    workspace: ctx => workspace(ctx, 'astTopology', Object.fromEntries([1, 2, 3, 4].map(i => [`src/dead/unused${i}.ts`, `export function unused${i}(): number {\n  return ${i};\n}\n`]))),
    walks: [
      { label: 'deadCode', query: { path: 'src', operation: 'deadCode', entrypoints: ['src/app.ts'], pageSize: 1 }, lead: 'nextPage', rows: data => (data.nodes ?? []).map(n => `${n.file}:${n.name}:${n.line}`), unpaged: { path: 'src', operation: 'deadCode', entrypoints: ['src/app.ts'] }, minPages: 3 },
    ],
    happy: { query: { path: 'src', operation: 'dependencies', source: 'src/app.ts' }, fields: ['nodes', 'coverage'], rows: data => (data.nodes ?? []).map(n => `${n.file}:${n.importLine}`), min: 2 },
    page: { query: { path: 'src', operation: 'dependencies', source: 'src/app.ts', pageSize: 1 }, lead: 'nextPage' },
    empty: { query: { path: 'src', operation: 'cycles' } },
    invalid: { query: { path: 'src', operation: 'summary' } },
    explore: [
      { label: 'dependents', query: { path: 'src', operation: 'dependents', source: 'src/greeter.ts' } },
      { label: 'reachability', query: { path: 'src', operation: 'reachability', entrypoints: ['src/app.ts'] }, deep: true },
      { label: 'path', query: { path: 'src', operation: 'path', source: 'src/app.ts', target: 'src/greeter.ts' }, deep: true },
    ],
  },
  astRewrite: {
    budgetMs: LOCAL,
    // A temp copy: previews never write, and the apply check below writes its own copy.
    workspace: ctx => workspace(ctx, 'astRewrite'),
    happy: { query: { path: 'src', language: 'typescript', pattern: 'shout($A)', rewrite: 'yell($A)' }, fields: ['mode', 'matches', 'files'], rows: data => (data.matches ?? []).map(m => `${m.path}:${m.line}`), min: 2, check: data => data.mode === 'preview' ? null : `mode ${data.mode} (expected preview)` },
    page: { query: { path: 'src', language: 'typescript', pattern: 'shout($A)', rewrite: 'yell($A)', pageSize: 1 }, lead: 'nextPage' },
    empty: { query: { path: 'src', language: 'typescript', pattern: 'zzzNoSuchCall($A)', rewrite: 'yell($A)' } },
    invalid: { query: { path: 'src', language: 'typescript', pattern: 'shout($A)' } },
    // Apply on a fresh copy writes exactly the previewed diff: each previewed file
    // equals its original with the preview patch applied, every other file is untouched.
    extra: async ({ tmp, fixture, cliCall, validateOutput }) => {
      const dir = path.join(tmp, 'ws-astRewrite-apply');
      fs.cpSync(fixture, dir, { recursive: true });
      const before = Object.fromEntries(['src/app.ts', 'src/greeter.ts', 'src/util.ts', 'docs/notes.md', 'tsconfig.json'].map(f => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));
      const preview = await cliCall('astRewrite', { queries: [{ path: 'src', language: 'typescript', pattern: 'shout($A)', rewrite: 'yell($A)', extras: ['hints'] }] }, { cwd: dir });
      const data = preview.json?.results?.[0]?.data;
      const apply = leadsIn(preview.json, new Set(['astRewrite'])).find(l => l.key === 'apply');
      if (!apply) return [['apply.lead', false, `preview has no hints.apply: ${preview.stdout.slice(0, 200)}`]];
      const applied = await cliCall(apply.tool, apply.query, { cwd: dir });
      const contractError = validateOutput('astRewrite', applied.raw);
      const out = [['apply.exit', applied.status === 0 && applied.json?.results?.[0]?.data?.mode === 'apply', `exit ${applied.status}, mode ${applied.json?.results?.[0]?.data?.mode} ${applied.stdout.slice(0, 160)}`], ['apply.contract', !contractError, contractError ?? '']];
      const patched = new Map((data?.files ?? []).map(f => [f.path, f.patch]));
      for (const [file, text] of Object.entries(before)) {
        const now = fs.readFileSync(path.join(dir, file), 'utf8');
        let want = text, why = '';
        try { if (patched.has(file)) want = applyPatch(text, patched.get(file)); } catch (error) { why = error.message; }
        out.push([`apply.diff.${file}`, !why && now === want, why || (now === want ? '' : `${patched.has(file) ? 'written content differs from the previewed patch' : 'file outside the preview changed'}: ${JSON.stringify(now).slice(0, 160)}`)]);
      }
      out.push(['apply.previewed', patched.size === 2, `previewed files ${[...patched.keys()].join(', ')}`]);
      return out;
    },
  },
  ghSearchCode: {
    budgetMs: REMOTE,
    happy: { query: { owner: 'octo', repo: 'demo', keywords: ['greet'] }, fields: ['files', 'commitSha'], rows: data => (data.files ?? []).map(f => f.path), min: 3 },
    page: { query: { owner: 'octo', repo: 'demo', keywords: ['greet'], pageSize: 1 }, lead: 'nextPage' },
    empty: { query: { owner: 'octo', repo: 'demo', keywords: ['zzznosuchtoken'] } },
    invalid: { query: { repo: 'demo', keywords: ['greet'] } },
    explore: [
      { label: 'path', query: { owner: 'octo', repo: 'demo', keywords: ['healthMarker'], path: 'src' } },
    ],
  },
  ghGetFileContent: {
    budgetMs: REMOTE,
    happy: { query: { owner: 'octo', repo: 'demo', path: 'src/greeter.ts', fullContent: true, minify: 'none' }, fields: ['path', 'content', 'commitSha', 'totalLines'], rows: data => numbered(data.content), min: 18 },
    // The mock's 1500-line octo/demo-docs guide.txt exceeds the full-content size limit.
    // Plain text on purpose: markdown minify is O(n^2) per paragraph today (backlog
    // item "Markdown minify is O(n²)"); a .md here costs ~25 s per page.
    page: { query: { owner: 'octo', repo: 'demo-docs', path: 'guide.txt', fullContent: true }, lead: 'continueWindow', expect: ctx => lines(ctx.mock.model.repos.find(r => r.name === 'demo-docs').files['guide.txt']) },
    empty: { query: { owner: 'octo', repo: 'demo', path: 'src/greeter.ts', matchString: 'zzzNoSuchText' } },
    invalid: { query: { owner: 'octo', repo: 'demo' } },
    explore: [
      { label: 'match', query: { owner: 'octo', repo: 'demo', path: 'src/greeter.ts', matchString: 'greet' } },
      { label: 'ranges', query: { owner: 'octo', repo: 'demo', path: 'src/app.ts', ranges: ['1-3'] }, deep: true },
    ],
  },
  ghStructure: {
    budgetMs: REMOTE,
    happy: { query: { owner: 'octo', repo: 'demo', maxDepth: 3 }, fields: ['files', 'summary', 'commitSha'], rows: treeRows, min: 7 },
    page: { query: { owner: 'octo', repo: 'demo', maxDepth: 3, pageSize: 2 }, lead: 'nextPage', unpaged: { owner: 'octo', repo: 'demo', maxDepth: 3 } },
    empty: { query: { owner: 'octo', repo: 'demo', include: ['**/zzzNoSuchName*'] } },
    invalid: { query: { owner: 'octo' } },
    explore: [
      { label: 'refs', query: { owner: 'octo', repo: 'demo', operation: 'refs' } },
      { label: 'subtree', query: { owner: 'octo', repo: 'demo', path: 'src' }, deep: true },
    ],
  },
  ghSearchRepo: {
    budgetMs: REMOTE,
    happy: { query: { keywords: ['demo'] }, fields: ['repositories'], rows: data => (data.repositories ?? []).map(r => `${r.owner}/${r.repo}`), min: 3 },
    page: { query: { keywords: ['demo'], pageSize: 1 }, lead: 'nextPage' },
    empty: { query: { keywords: ['zzznosuchrepo'] } },
    invalid: { query: { keywords: ['demo'], pageSize: 1000 } },
    explore: [
      { label: 'owner', query: { keywords: ['greeter'], owner: 'octo' }, deep: true },
    ],
  },
  ghSearchHistory: {
    budgetMs: REMOTE,
    happy: { query: { operation: 'commit', owner: 'octo', repo: 'demo' }, fields: ['commits'], rows: data => (data.commits ?? []).map(c => c.commitSha), min: 3 },
    explore: [
      { label: 'pullRequests', query: { operation: 'pullRequest', owner: 'octo', repo: 'demo' }, check: data => (data?.pullRequests ?? []).length >= 3 ? null : `pullRequests ${JSON.stringify(data?.pullRequests?.map(p => p.number))}` },
      { label: 'issues', query: { operation: 'issue', owner: 'octo', repo: 'demo' }, check: data => (data?.issues ?? []).some(i => i.number === 2) ? null : `issues ${JSON.stringify(data?.issues?.map(i => i.number))} lack #2` },
    ],
    page: { query: { operation: 'commit', owner: 'octo', repo: 'demo', pageSize: 1 }, lead: 'nextPage' },
    empty: { query: { operation: 'pullRequest', owner: 'octo', repo: 'demo', keywords: ['zzznosuch'] } },
    invalid: { query: { operation: 'commit', owner: 'octo' } },
  },
  ghGetHistoryItem: {
    budgetMs: REMOTE,
    happy: { query: { operation: 'pullRequest', owner: 'octo', repo: 'demo', number: 1, sections: ['files'] }, fields: ['pullRequests'], rows: data => (data.pullRequests ?? []).flatMap(pr => inventoryRows(pr.files).map(f => `#${pr.number}:${f.path}:${f.status}`)), min: 2 },
    // Pull request #4 (mock addBulkPullRequest): 36 changed files, one a 3000-line patch.
    page: { query: { operation: 'pullRequest', owner: 'octo', repo: 'demo', number: 4, sections: ['files'], pageSize: 10 }, lead: 'nextFilePage', rows: fileRows, unpaged: { operation: 'pullRequest', owner: 'octo', repo: 'demo', number: 4, sections: ['files'], pageSize: 100 }, minPages: 4 },
    walks: [
      { label: 'patch', query: { operation: 'pullRequest', owner: 'octo', repo: 'demo', number: 4, sections: ['patches'], include: ['pkg/huge.ts'] }, lead: 'continuePatch', rows: patchRows, expect: () => Array.from({ length: 3000 }, (_, i) => `pkg/huge.ts:${i + 1}`) },
    ],
    channels: { nextFilePage: fileRows, continuePatch: patchRows },
    empty: { query: { operation: 'pullRequest', owner: 'octo', repo: 'demo', number: 1, sections: ['patches'], matchString: 'zzzNoSuchText' } },
    invalid: { query: { operation: 'pullRequest', owner: 'octo', repo: 'demo' } },
    explore: [
      { label: 'issue', query: { operation: 'issue', owner: 'octo', repo: 'demo', number: 2, sections: ['body', 'comments'] } },
      { label: 'commit', query: { operation: 'commit', owner: 'octo', repo: 'demo', ref: 'main', sections: ['files'] }, deep: true },
      { label: 'compare', query: ctx => ({ operation: 'compare', owner: 'octo', repo: 'demo', base: ctx.mock.model.commits[0].oid, head: 'main', sections: ['files'] }), deep: true },
    ],
  },
  artifactSearch: {
    budgetMs: REMOTE,
    happy: { query: ctx => ({ ecosystem: 'npm', packageName: 'tiny-health', registryUrl: `${ctx.mock.url}/` }), fields: ['artifacts'], rows: data => (data.artifacts ?? []).map(a => `${a.name}@${a.version}`), min: 1, check: data => data.artifacts?.[0]?.dependencies?.includes('tiny-greet@^2.0.0') ? null : `dependencies ${JSON.stringify(data.artifacts?.[0]?.dependencies)} lack tiny-greet@^2.0.0` },
    page: { query: ctx => ({ ecosystem: 'npm', keywords: ['health'], pageSize: 1, registryUrl: `${ctx.mock.url}/` }), lead: 'nextPage', unpaged: ctx => ({ ecosystem: 'npm', keywords: ['health'], registryUrl: `${ctx.mock.url}/` }), min: 3 },
    empty: { query: ctx => ({ ecosystem: 'npm', keywords: ['zzznosuchpkg'], registryUrl: `${ctx.mock.url}/` }) },
    invalid: { query: { ecosystem: 'npm' } },
    explore: [
      { label: 'dependency', query: ctx => ({ ecosystem: 'npm', packageName: 'tiny-greet', registryUrl: `${ctx.mock.url}/` }), deep: true },
    ],
  },
  ghCloneRepo: {
    budgetMs: 20000,
    needs: 'clone',
    happy: { query: { owner: 'octo', repo: 'demo' }, fields: ['location'], rows: data => [data.location?.commitSha].filter(Boolean), min: 1 },
    // Until the runtime accepts a plain-http loopback endpoint for clones (as
    // it already does for the API base), the happy path cannot be hermetic.
    // Only that exact pre-change refusal skips; any other error fails.
    skipOnError: json => /requires an HTTPS GitHub API endpoint: /.test(JSON.stringify(json)) ? 'runtime refuses a plain-http loopback clone endpoint (approved runtime change pending: gh_clone_repo repository_url loopback http)' : null,
    extra: async ({ happy, happyRuns, mock, skips }) => {
      if (skips.length) return [];
      const location = happy.cli.json?.results?.[0]?.data?.location;
      const checkout = location?.localPath && fs.existsSync(path.join(location.localPath, 'src/greeter.ts'));
      return [
        ['clone.checkout', checkout, `localPath ${location?.localPath}`],
        ['clone.head', location?.commitSha === mock.model.head.oid, `commitSha ${location?.commitSha}, mock head ${mock.model.head.oid}`],
        // The token reaches git only through the GIT_ASKPASS helper for this origin.
        ['clone.askpass', mock.gitAuth.some(a => a.user === 'x-access-token' && a.tokenMatches), `git auth attempts ${JSON.stringify(mock.gitAuth)}`],
        // The clone's follow-up leads read the checkout locally: each ran in the
        // explore (accepted, contract-valid) and lists the checkout.
        ...localFollowUps(happyRuns.cli, location?.localPath),
      ];
    },
    page: { na: 'a checkout has no pages' },
    empty: { na: 'a checkout either exists or fails; there is no empty outcome' },
    invalid: { query: { owner: 'octo' } },
  },
  clasify: {
    budgetMs: REMOTE,
    workspace: ctx => workspace(ctx, 'clasify', { 'docs/big.txt': Array.from({ length: LOCATE_LINES }, (_, i) => `line ${i + 1} ${i % LOCATE_EVERY === 0 ? 'needleLocate marker' : 'filler text'}`).join('\n') + '\n' }),
    happy: {
      query: { resources: [{ value: 'alpha' }, { value: 'beta' }], questions: [{ type: 'yesno', ask: 'Is it the first Greek letter?' }, { type: 'choice', ask: 'Which letter?', labels: { a: 'alpha', b: 'beta' } }] },
      fields: ['resources'], rows: data => (data.resources ?? []).flatMap(r => Object.keys(r.answers ?? {}).map(q => `${r.id}:${q}`)), min: 4,
    },
    page: { na: 'a judged matrix has no page channel; its locate walk resumes through next.clasify (walks.locate)' },
    // A prefiltered locate judges at most three windows per call; next.clasify resumes the walk.
    walks: [
      {
        label: 'locate', lead: 'clasify', chainKey: true, rows: locateRows, minPages: 3,
        query: { resources: [{ tool: 'localFetch', query: { path: 'docs/big.txt' }, prefilter: ['needleLocate'] }], questions: [{ type: 'locate', ask: 'Where is the needleLocate marker?' }] },
        // Every marker line lies in exactly one judged window.
        check: rows => {
          const windows = rows.map(r => r.split(':').pop().split('-').map(Number));
          const missed = Array.from({ length: Math.ceil(LOCATE_LINES / LOCATE_EVERY) }, (_, k) => k * LOCATE_EVERY + 1).filter(l => windows.filter(([a, b]) => a <= l && l <= b).length !== 1);
          return missed.length ? `marker lines not in exactly one judged window: ${missed.slice(0, 5).join(', ')}` : null;
        },
      },
    ],
    empty: { na: 'a judged matrix always answers every cell (no empty outcome)' },
    invalid: { query: { resources: [{ value: 'alpha' }], questions: [] } },
    // Disabled path: without a provider key the CLI refuses with a typed error.
    extra: async ({ cliCall, q }) => {
      const res = await cliCall('clasify', q({ resources: [{ value: 'alpha' }], questions: [{ type: 'yesno', ask: 'Is it alpha?' }] }), { env: { ['OCTOCODE_CLASSIFICATION_' + 'API']: '' } });
      const code = res.json?.errorCode ?? res.json?.queries?.[0]?.resources?.[0]?.error?.errorCode;
      return [['disabled.typed', res.status !== 0 && typeof code === 'string', `exit ${res.status}, errorCode ${code} ${res.stdout.slice(0, 120)}`]];
    },
  },
};
