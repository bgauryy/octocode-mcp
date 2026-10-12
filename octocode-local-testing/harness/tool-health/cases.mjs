// Per-tool cases for harness/tool-health.mjs. Every contract tool needs one
// entry; the suite fails on a contract tool without a case or a case without a
// contract tool. Each case names, per check, a single query (wrapped as
// {queries:[query]}) or `{ na: reason }` when the check cannot apply to the
// tool; `rows(data, json)` turns a response row's data into stable row ids
// (used for continuation dedupe and paged-vs-unpaged completeness).
//
// Local tools read fixtures/tool-health (the process cwd). GitHub tools read
// the loopback mock's `octo/demo` (built from the same fixture files);
// artifactSearch reads the mock npm registry; clasify the mock jev provider.
import fs from 'node:fs';
import path from 'node:path';
import { declarations, lspLocations, structureFiles, sourceView, inventoryRows } from '../mcp-client.mjs';

const files = data => (data?.files ?? []).flatMap(file => (file.matches ?? []).map(m => `${file.path}:${m.line}`));
const lines = text => Array.from({ length: text.split('\n').length - (text.endsWith('\n') ? 1 : 0) }, (_, i) => i + 1);
const numbered = text => sourceView({ content: text ?? '' }).ranges.flatMap(r => Array.from({ length: r.end - r.start + 1 }, (_, i) => r.start + i));

/** Local budgets cover a cold CLI process; lsp covers a cold language server. */
const LOCAL = 6000, REMOTE = 6000, LSP = 25000;
/**
 * The runtime spaces GitHub search requests 2 s apart per credential, across
 * processes (github budget `search_spacing`). Tools that search run in one lane
 * (`serialGroup`) so a call's latency is its own spacing, not other tools' queue.
 */
const GITHUB_SEARCH = 'githubSearch';

export const CASES = {
  localSearch: {
    budgetMs: LOCAL,
    happy: { query: { matchString: 'healthMarker', path: 'src' }, fields: ['files', 'matchCount'], rows: files, min: 4 },
    page: { query: { matchString: 'healthMarker', path: 'src', pageSize: 1 }, lead: 'nextPage' },
    empty: { query: { matchString: 'zzzNoSuchToken', path: 'src' } },
    invalid: { query: { path: 'src' } },
  },
  structureSearch: {
    budgetMs: LOCAL,
    happy: { query: { path: '.', operation: 'files' }, fields: ['files', 'summary'], rows: data => structureFiles(data.files).map(f => f.path), min: 5 },
    page: { query: { path: '.', operation: 'files', pageSize: 2 }, lead: 'nextPage' },
    empty: { query: { path: '.', operation: 'files', include: ['zzzNoSuchName*'] } },
    invalid: { query: { operation: 'files' } },
  },
  astSearch: {
    budgetMs: LOCAL,
    happy: { query: { path: 'src', operation: 'symbols' }, fields: ['files'], rows: data => declarations({ sc: { results: [{ data }] } }).map(d => `${d.path}:${d.name}:${d.line}`), min: 6 },
    page: { query: { path: 'src', operation: 'symbols', pageSize: 1 }, lead: 'nextPage' },
    empty: { query: { path: 'src', operation: 'match', pattern: 'zzzNoSuchCall($A)' } },
    invalid: { query: { path: 'src', operation: 'match' } },
  },
  localFetch: {
    budgetMs: LOCAL,
    happy: { query: { path: 'src/greeter.ts', fullContent: true }, fields: ['path', 'content', 'totalLines'], rows: data => numbered(data.content), min: 18 },
    page: { query: { path: 'src/greeter.ts', unit: 'lines', offset: 0, length: 5 }, lead: 'continueWindow' },
    empty: { query: { path: 'src/greeter.ts', matchString: 'zzzNoSuchText' } },
    invalid: { query: { path: 'src/greeter.ts', ranges: 'not-an-array' } },
  },
  lspSearch: {
    budgetMs: LSP,
    needs: 'lsp',
    happy: { query: { path: 'src/greeter.ts', symbolName: 'greet', line: 6, operation: 'references' }, fields: ['files', 'matchCount', 'coverage'], rows: data => lspLocations({ sc: { results: [{ data }] } }).map(l => `${l.path}:${l.displayRange.startLine}:${l.displayRange.startCharacter}`), min: 6 },
    page: { query: { path: 'src/greeter.ts', symbolName: 'greet', line: 6, operation: 'references', pageSize: 1 }, lead: 'nextPage' },
    empty: { query: { operation: 'workspaceSymbol', workspaceRoot: '.', symbolName: 'zzzNoSuchSymbol' } },
    invalid: { query: { path: 'src/greeter.ts', symbolName: 'greet' } },
  },
  astTopology: {
    budgetMs: LOCAL,
    happy: { query: { path: 'src', operation: 'dependencies', source: 'src/app.ts' }, fields: ['nodes', 'coverage'], rows: data => (data.nodes ?? []).map(n => `${n.file}:${n.importLine}`), min: 2 },
    page: { query: { path: 'src', operation: 'dependencies', source: 'src/app.ts', pageSize: 1 }, lead: 'nextPage' },
    empty: { query: { path: 'src', operation: 'cycles' } },
    invalid: { query: { path: 'src', operation: 'summary' } },
  },
  astRewrite: {
    budgetMs: LOCAL,
    // Preview only (no `apply`): the fixture is never written.
    happy: { query: { path: 'src', language: 'typescript', pattern: 'shout($A)', rewrite: 'yell($A)' }, fields: ['mode', 'matches', 'files'], rows: data => (data.matches ?? []).map(m => `${m.path}:${m.line}`), min: 2, check: data => data.mode === 'preview' ? null : `mode ${data.mode} (expected preview)` },
    page: { query: { path: 'src', language: 'typescript', pattern: 'shout($A)', rewrite: 'yell($A)', pageSize: 1 }, lead: 'nextPage' },
    empty: { query: { path: 'src', language: 'typescript', pattern: 'zzzNoSuchCall($A)', rewrite: 'yell($A)' } },
    invalid: { query: { path: 'src', language: 'typescript', pattern: 'shout($A)' } },
  },
  ghSearchCode: {
    budgetMs: REMOTE,
    serialGroup: GITHUB_SEARCH,
    happy: { query: { owner: 'octo', repo: 'demo', keywords: ['greet'] }, fields: ['files', 'commitSha'], rows: data => (data.files ?? []).map(f => f.path), min: 3 },
    page: { query: { owner: 'octo', repo: 'demo', keywords: ['greet'], pageSize: 1 }, lead: 'nextPage' },
    empty: { query: { owner: 'octo', repo: 'demo', keywords: ['zzznosuchtoken'] } },
    invalid: { query: { repo: 'demo', keywords: ['greet'] } },
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
  },
  ghStructure: {
    budgetMs: REMOTE,
    happy: { query: { owner: 'octo', repo: 'demo', maxDepth: 3 }, fields: ['files', 'summary', 'commitSha'], rows: data => structureFiles(data.files).map(f => f.path), min: 5 },
    page: { na: 'the fixture tree fits one page and ghStructure takes no page size' },
    empty: { query: { owner: 'octo', repo: 'demo', include: ['**/zzzNoSuchName*'] } },
    invalid: { query: { owner: 'octo' } },
  },
  ghSearchRepo: {
    budgetMs: REMOTE,
    serialGroup: GITHUB_SEARCH,
    happy: { query: { keywords: ['demo'] }, fields: ['repositories'], rows: data => (data.repositories ?? []).map(r => `${r.owner}/${r.repo}`), min: 3 },
    page: { query: { keywords: ['demo'], pageSize: 1 }, lead: 'nextPage' },
    empty: { query: { keywords: ['zzznosuchrepo'] } },
    invalid: { query: { keywords: ['demo'], pageSize: 1000 } },
  },
  ghSearchHistory: {
    budgetMs: REMOTE,
    serialGroup: GITHUB_SEARCH,
    happy: { query: { operation: 'commit', owner: 'octo', repo: 'demo' }, fields: ['commits'], rows: data => (data.commits ?? []).map(c => c.commitSha), min: 3 },
    page: { query: { operation: 'commit', owner: 'octo', repo: 'demo', pageSize: 1 }, lead: 'nextPage' },
    empty: { query: { operation: 'pullRequest', owner: 'octo', repo: 'demo', keywords: ['zzznosuch'] } },
    invalid: { query: { operation: 'commit', owner: 'octo' } },
  },
  ghGetHistoryItem: {
    budgetMs: REMOTE,
    happy: { query: { operation: 'pullRequest', owner: 'octo', repo: 'demo', number: 1, sections: ['files'] }, fields: ['pullRequests'], rows: data => (data.pullRequests ?? []).flatMap(pr => inventoryRows(pr.files).map(f => `#${pr.number}:${f.path}:${f.status}`)), min: 2 },
    page: { na: 'a two-file pull request fits one page' },
    empty: { query: { operation: 'pullRequest', owner: 'octo', repo: 'demo', number: 1, sections: ['patches'], matchString: 'zzzNoSuchText' } },
    invalid: { query: { operation: 'pullRequest', owner: 'octo', repo: 'demo' } },
  },
  artifactSearch: {
    budgetMs: REMOTE,
    happy: { query: ctx => ({ ecosystem: 'npm', packageName: 'tiny-health', registryUrl: `${ctx.mock.url}/` }), fields: ['artifacts'], rows: data => (data.artifacts ?? []).map(a => `${a.name}@${a.version}`), min: 1, check: data => data.artifacts?.[0]?.dependencies?.includes('tiny-greet@^2.0.0') ? null : `dependencies ${JSON.stringify(data.artifacts?.[0]?.dependencies)} lack tiny-greet@^2.0.0` },
    page: { query: ctx => ({ ecosystem: 'npm', keywords: ['health'], pageSize: 1, registryUrl: `${ctx.mock.url}/` }), lead: 'nextPage', unpaged: ctx => ({ ecosystem: 'npm', keywords: ['health'], registryUrl: `${ctx.mock.url}/` }), min: 3 },
    empty: { query: ctx => ({ ecosystem: 'npm', keywords: ['zzznosuchpkg'], registryUrl: `${ctx.mock.url}/` }) },
    invalid: { query: { ecosystem: 'npm' } },
  },
  ghCloneRepo: {
    budgetMs: 20000,
    needs: 'clone',
    happy: { query: { owner: 'octo', repo: 'demo' }, fields: ['location'], rows: data => [data.location?.commitSha].filter(Boolean), min: 1 },
    // Until the runtime accepts a plain-http loopback endpoint for clones (as
    // it already does for the API base), the happy path cannot be hermetic.
    // Only that exact pre-change refusal skips; any other error fails.
    skipOnError: json => /requires an HTTPS GitHub API endpoint: /.test(JSON.stringify(json)) ? 'runtime refuses a plain-http loopback clone endpoint (approved runtime change pending: gh_clone_repo repository_url loopback http)' : null,
    extra: async ({ happy, mock, skips }) => {
      if (skips.length) return [];
      const location = happy.cli.json?.results?.[0]?.data?.location;
      const checkout = location?.localPath && fs.existsSync(path.join(location.localPath, 'src/greeter.ts'));
      return [
        ['clone.checkout', checkout, `localPath ${location?.localPath}`],
        ['clone.head', location?.commitSha === mock.model.head.oid, `commitSha ${location?.commitSha}, mock head ${mock.model.head.oid}`],
        // The token reaches git only through the GIT_ASKPASS helper for this origin.
        ['clone.askpass', mock.gitAuth.some(a => a.user === 'x-access-token' && a.tokenMatches), `git auth attempts ${JSON.stringify(mock.gitAuth)}`],
      ];
    },
    page: { na: 'a checkout has no pages' },
    empty: { na: 'a checkout either exists or fails; there is no empty outcome' },
    invalid: { query: { owner: 'octo' } },
  },
  clasify: {
    budgetMs: REMOTE,
    happy: {
      query: { resources: [{ value: 'alpha' }, { value: 'beta' }], questions: [{ type: 'yesno', ask: 'Is it the first Greek letter?' }, { type: 'choice', ask: 'Which letter?', labels: { a: 'alpha', b: 'beta' } }] },
      fields: ['resources'], rows: data => (data.resources ?? []).flatMap(r => Object.keys(r.answers ?? {}).map(q => `${r.id}:${q}`)), min: 4,
    },
    page: { na: 'a two-resource matrix fits one call' },
    empty: { na: 'a judged matrix always answers every cell (no empty outcome)' },
    invalid: { query: { resources: [{ value: 'alpha' }], questions: [] } },
    // Disabled path: without a provider key the CLI refuses with a typed error.
    extra: async ({ cliCall, q }) => {
      const res = await cliCall('clasify', q({ resources: [{ value: 'alpha' }], questions: [{ type: 'yesno', ask: 'Is it alpha?' }] }), { ['OCTOCODE_CLASSIFICATION_' + 'API']: '' });
      const code = res.json?.errorCode ?? res.json?.queries?.[0]?.resources?.[0]?.error?.errorCode;
      return [['disabled.typed', res.status !== 0 && typeof code === 'string', `exit ${res.status}, errorCode ${code} ${res.stdout.slice(0, 120)}`]];
    },
  },
};
