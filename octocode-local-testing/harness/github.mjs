// GitHub tools, data fidelity: every returned byte, range, file list, diff
// stat, and filter is proven against the local clone pinned to the same SHA
// (`git` is the ground truth, never the tool), plus cross-tool agreement
// (search → read, commit ↔ PR ↔ compare), ranked `classifiers` reads and
// searches, and clasify over GitHub sources.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { REPOS, checks, clasifyUnavailable, collect, inventoryRows, nextHints, patchNumbersIssue, rawPatch, rowData, sourceView, startServer, writeResults } from './mcp-client.mjs';

const { check, skip, summary } = checks('github');
// Ranking is a home-only switch; the process environment enables it for section E.
const client = await startServer({ env: { OCTOCODE_RANKING_ENABLED: 'true' } });
const noClasify = clasifyUnavailable(client);
const noClassifiers = client.tools.find(tool => tool.name === 'ghGetFileContent')?.inputSchema?.properties?.queries?.items?.properties?.classifiers
  ? null : 'classifiers are not advertised (ranking disabled or no provider key)';
const { call, raw } = client;

const git = (dir, ...args) => execFileSync('git', ['-C', path.join(REPOS, dir), ...args], { encoding: 'utf8', maxBuffer: 256 << 20 });
const REPO_DIRS = ['rust', 'c', 'python', 'go', 'typescript'];
const pinned = Object.fromEntries(REPO_DIRS.map(dir => {
  const [, owner, repo] = git(dir, 'remote', 'get-url', 'origin').trim().match(/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/);
  return [dir, { dir, owner, repo, sha: git(dir, 'rev-parse', 'HEAD').trim() }];
}));
const local = (dir, file) => fs.readFileSync(path.join(REPOS, dir, file), 'utf8');
const localLines = (dir, file) => local(dir, file).replace(/\n$/, '').split('\n');
const fileRow = entry => rowData(entry);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let rateLimitWaits = 0;
/** GitHub search that waits out GitHub's code-search quota (10/min) instead of reading an error row as "no results". */
const SEARCH_TOOL = { code: 'ghSearchCode', tree: 'ghStructure', repositories: 'ghSearchRepo' };
async function search(query, tool) {
  // Legacy `operation` selects the split tool (ghSearch → ghSearchCode/ghStructure/ghSearchRepo);
  // a `next.*` query is replayed verbatim with its own tool.
  const { operation, ...rest } = query;
  for (let attempt = 0; attempt < 6; attempt++) {
    const out = tool ? await client.follow({ tool, query }) : await call(SEARCH_TOOL[operation], rest);
    const data = rowData(out);
    if (data?.errorCode !== 'rateLimited') return out;
    rateLimitWaits += 1;
    await sleep(((data.retryAfterSeconds ?? data.rateLimit?.retryAfterSeconds ?? 10) + 1) * 1000);
  }
  throw new Error(`still rate limited: ${JSON.stringify(query)}`);
}
const stats = { bytesCompared: 0, rangesCompared: 0, snippetsChecked: 0 };

// Sources per repo: one mid-size file (whole read) and the largest tracked
// source file (walked in windows to the end).
const SOURCES = {
  rust: { small: 'tokio/src/sync/oneshot.rs', large: 'tokio/src/sync/mpsc/bounded.rs', keywords: ['try_recv', 'Semaphore', 'spawn_blocking'] },
  c: { small: 'src/adlist.c', large: 'src/server.c', keywords: ['serverCron', 'listCreate', 'dictScan'] },
  python: { small: 'django/db/models/aggregates.py', large: 'django/db/models/query.py', keywords: ['_fetch_all', 'select_related', 'bulk_create'] },
  go: { small: 'tsdb/chunks/chunks.go', large: 'tsdb/db.go', keywords: ['NewHead', 'Appender', 'Compact'] },
  typescript: { small: 'packages/typescript/src/ast/astnav.ts', large: 'packages/typescript/src/api/sync/api.ts', keywords: ['registerModuleResolutionCallback', 'isUnionType', 'createSnapshot'] },
};

// ── A. ghGetFileContent fidelity ───────────────────────────────────────────
for (const r of Object.values(pinned)) {
  const src = SOURCES[r.dir];
  for (const file of [src.small, src.large]) {
    if (!fs.existsSync(path.join(REPOS, r.dir, file))) { check(`${r.dir}: ${file} exists locally`, false); continue; }
    const text = local(r.dir, file);
    const lines = localLines(r.dir, file);
    const base = { owner: r.owner, repo: r.repo, ref: r.sha, path: file };
    // Whole file when it fits; otherwise the tool must say why and offer a way on.
    // Byte identity needs the verbatim view: the default `minify:"standard"` drops comments and indentation.
    const whole = await call('ghGetFileContent', { ...base, fullContent: true, minify: 'none', extras: ['stats'] });
    const w = fileRow(whole);
    check(`${r.dir}/${file}: totalLines and sourceBytes match git`, w?.totalLines === lines.length && w?.sourceBytes === Buffer.byteLength(text), `tool ${w?.totalLines}L/${w?.sourceBytes}B vs git ${lines.length}L/${Buffer.byteLength(text)}B`);
    if (!w?.isPartial) {
      const whole = sourceView(w).text;
      check(`${r.dir}/${file}: fullContent is byte-identical`, whole === text || whole === text.replace(/\n$/, ''), firstDiff(whole, text));
      stats.bytesCompared += Buffer.byteLength(text);
    } else {
      // Oversize fullContent returns page 1 inline (exact source) plus a continuation.
      const firstLines = sourceView(w).text.replace(/\n$/, '');
      const inline = firstLines.length > 0 && text.startsWith(firstLines) && (w.partialReasons ?? []).length > 0 && !!w.next;
      check(`${r.dir}/${file}: oversize fullContent returns an exact first page and a continuation`, inline, JSON.stringify({ partialReasons: w.partialReasons, bytes: firstLines.length, next: Object.keys(w.next ?? {}) }));
    }
    // Walk the file in 1500-line windows to the end; every returned range must equal git.
    // A `ranges` read's first page holds 6 KiB; `next.continueWindow` pages the rest of the window
    // (16 KiB pages), and the next window starts after the last line returned.
    let next = 1;
    let covered = 0;
    let mismatch = null;
    for (let guard = 0; next <= lines.length && guard < 200 && !mismatch; guard++) {
      const end = Math.min(lines.length, next + 1499);
      let out = await call('ghGetFileContent', { ...base, ranges: [`${next}-${end}`], minify: 'none' });
      const start = next;
      for (; guard < 200; guard++) {
        const row = fileRow(out);
        const view = sourceView(row);
        const ranges = view.ranges;
        const got = view.text.replace(/\n$/, '');
        const want = ranges.map(g => lines.slice(g.start - 1, g.end).join('\n')).join('\n');
        if (!ranges.length || got !== want || ranges[0].start !== next) { mismatch = `window ${start}-${end} at ${next}: ${firstDiff(got, want)} ranges=${JSON.stringify(ranges.slice(0, 2))}`; break; }
        covered += ranges.reduce((n, g) => n + g.end - g.start + 1, 0);
        stats.bytesCompared += Buffer.byteLength(got);
        next = ranges.at(-1).end + 1;
        if (!row?.next?.continueWindow) break;
        out = await client.follow(row.next.continueWindow);
      }
      if (next <= end && !mismatch) { mismatch = `window ${start}-${end} stopped at ${next - 1} without next.continueWindow`; break; }
    }
    check(`${r.dir}/${file}: line windows walked to the end are identical to git`, !mismatch && covered === lines.length, mismatch ?? `${covered}/${lines.length} lines`);
  }
  // Random exact ranges, including the last line and single-line reads.
  const file = src.large;
  const lines = localLines(r.dir, file);
  let bad = [];
  const picks = [[1, 1], [lines.length, lines.length], [lines.length - 5, lines.length]];
  for (let i = 0; i < 12; i++) { const s = 1 + Math.floor(((i * 7919) % 997) / 997 * (lines.length - 40)); picks.push([s, s + (i % 5) * 9]); }
  for (const [s, e] of picks) {
    const row = fileRow(await call('ghGetFileContent', { owner: r.owner, repo: r.repo, ref: r.sha, path: file, ranges: [`${s}-${e}`], minify: 'none' }));
    const got = sourceView(row).text.replace(/\n$/, '');
    if (got !== lines.slice(s - 1, e).join('\n')) bad.push(`${s}-${e}`);
    stats.rangesCompared += 1;
  }
  check(`${r.dir}: ${picks.length} exact ranges (first/last/single line) equal git`, bad.length === 0, bad.join(','));
  // The default view (`minify:"standard"`) cites every kept line by its source number: each view
  // line, whitespace removed, lies inside that git line (comments and indentation dropped, nothing joined).
  {
    const squash = t => t.replace(/\s+/g, '');
    const view = sourceView(fileRow(await call('ghGetFileContent', { owner: r.owner, repo: r.repo, ref: r.sha, path: file, ranges: ['1-400'] })));
    const viewLines = view.text.replace(/\n$/, '').split('\n').filter(l => l !== '--');
    const numbers = view.ranges.flatMap(g => Array.from({ length: g.end - g.start + 1 }, (_, i) => g.start + i));
    const wrong = numbers.map((n, i) => ({ n, v: viewLines[i] })).filter(({ n, v }) => v === undefined || !squash(lines[n - 1] ?? '').includes(squash(v)));
    check(`${r.dir}: default standard view cites each kept line by its source line number`, view.numbered && numbers.length === viewLines.length && numbers.length > 0 && wrong.length === 0, `numbered=${view.numbered} lines=${numbers.length}/${viewLines.length} wrong=${JSON.stringify(wrong.slice(0, 2))}`);
  }
  // matchString windows: each returned range is exact and every literal hit is covered.
  const needle = { rust: 'pub fn try_', c: 'serverCron', python: 'def _', go: 'func (db *DB)', typescript: 'export function is' }[r.dir];
  const m = fileRow(await call('ghGetFileContent', { owner: r.owner, repo: r.repo, ref: r.sha, path: file, matchString: needle, caseMode: 'sensitive', contextLines: 0 }));
  const hitLines = lines.map((l, i) => l.includes(needle) ? i + 1 : 0).filter(Boolean);
  const mView = sourceView(m);
  const ranges = mView.ranges;
  const inRanges = hitLines.filter(n => ranges.some(g => g.start <= n && n <= g.end));
  // One block per numbered range: a run of single lines shares one gap marker.
  const textLines = mView.text.replace(/\n$/, '').split('\n').filter(l => l !== '--' && !/^\.\.\. \[.* (?:omitted|not requested)\] \.\.\.$/.test(l));
  const blocks = [];
  for (const g of ranges) blocks.push(textLines.splice(0, g.end - g.start + 1).join('\n'));
  const exact = textLines.length === 0 && ranges.every((g, i) => blocks[i] === lines.slice(g.start - 1, g.end).join('\n'));
  check(`${r.dir}: matchString "${needle}" covers every literal hit (${hitLines.length}) with exact windows`, inRanges.length === hitLines.length && exact || (m?.isPartial && exact && inRanges.length > 0), `hits=${hitLines.length} covered=${inRanges.length} ranges=${ranges.length} blocks=${blocks.length} partial=${!!m?.isPartial}`);
}

// Byte chunks of the verbatim view reassemble to the exact bytes (a byte end may
// extend up to three bytes to finish a code point, so offsets advance by what came back).
{
  const r = pinned.rust;
  const file = SOURCES.rust.small;
  const text = local(r.dir, file);
  const size = Buffer.byteLength(text);
  let offset = 0;
  let joined = '';
  for (let guard = 0; guard < 60 && offset < size; guard++) {
    const row = fileRow(await call('ghGetFileContent', { owner: r.owner, repo: r.repo, ref: r.sha, path: file, unit: 'bytes', offset, length: 4000, minify: 'none' }));
    const piece = row?.content ?? '';
    if (!piece) break;
    joined += piece;
    offset += Buffer.byteLength(piece);
  }
  check('byte chunks reassemble the file exactly', joined === text, firstDiff(joined, text));
  // TOOL_DATA_CONTRACT "Numbered source content": byte windows address the selected view. In the
  // default `standard` view the page is numbered view text and `totalBytes` counts that view (the
  // numbered walk above pages the same way); `minify:"none"` byte pages are verbatim source.
  const page = fileRow(await call('ghGetFileContent', { owner: r.owner, repo: r.repo, ref: r.sha, path: file, unit: 'bytes', offset: 0, length: 300 }));
  const pageLines = (page?.content ?? '').split('\n').filter(Boolean);
  const guttered = pageLines.filter(l => /^\d+\t/.test(l)).length;
  const viewAddressed = !!page?.content && guttered >= pageLines.length - 1 && page?.pagination?.totalBytes !== size;
  check('default-view byte page addresses the numbered standard view (gutter, view totalBytes)', viewAddressed, JSON.stringify({ guttered: `${guttered}/${pageLines.length}`, head: (page?.content ?? '').slice(0, 60), contentView: page?.contentView, totalBytes: page?.pagination?.totalBytes, sourceBytes: size }));
}

// ── B. ghSearch fidelity ───────────────────────────────────────────────────
for (const r of Object.values(pinned)) {
  let files = 0, contains = 0, snippets = 0, snippetsFound = 0, missing = [], drift = [], wrongRef = [];
  for (const keyword of SOURCES[r.dir].keywords) {
    // Pinned to the clone's SHA: candidates come from the default-branch index, but every row is
    // read at `ref` (`data.commitSha`), so the clone is the exact truth for line numbers and text.
    const out = await search({ operation: 'code', owner: r.owner, repo: r.repo, ref: r.sha, keywords: [keyword], pageSize: 10 });
    const data = rowData(out);
    if (data?.files?.length && data.commitSha !== r.sha) wrongRef.push(`${keyword}@${String(data.commitSha).slice(0, 8)}`);
    for (const f of data?.files ?? []) {
      if (f.atRef === false) continue;
      files += 1;
      const full = path.join(REPOS, r.dir, f.path);
      if (!fs.existsSync(full)) { missing.push(f.path); continue; }
      const body = fs.readFileSync(full, 'utf8');
      if (body.toLowerCase().includes(keyword.toLowerCase())) contains += 1;
      for (const s of f.matches ?? []) {
        snippets += 1;
        const core = s.value.split('\n').map(l => l.trimEnd()).filter(l => l.trim()).join('\n');
        const hay = body.split('\n').map(l => l.trimEnd()).filter(l => l.trim()).join('\n');
        if (hay.includes(core)) snippetsFound += 1;
      }
      // Numbered hit lines ("<line>\t<text>", a long line cut to a window
      // marked with an ellipsis) are that line of the file at the pinned SHA.
      const bodyLines = body.split('\n');
      for (const l of f.lines ?? []) {
        const m = /^(\d+)\t(.*)$/s.exec(l);
        if (!m) continue;
        snippets += 1;
        const text = m[2].replace(/^…|…$/g, '').trim();
        if ((bodyLines[+m[1] - 1] ?? '').includes(text)) snippetsFound += 1;
        else drift.push(`${f.path}:${m[1]}`);
      }
    }
  }
  stats.snippetsChecked += snippets;
  check(`${r.dir}: code search precision — returned files contain the keyword`, files > 0 && contains >= files - missing.length && contains / files >= 0.9, `${contains}/${files} (missing locally: ${missing.slice(0, 3).join(',')})`);
  check(`${r.dir}: code search lines at the pinned ref are the clone's lines (text and number)`, snippets > 0 && snippetsFound === snippets && wrongRef.length === 0, `${snippetsFound}/${snippets} ${drift.slice(0, 3).join(',')} ${wrongRef.join(',')}`);
}
// Pagination: every page is distinct, totals are consistent, next.page walks.
{
  const r = pinned.rust;
  let query = { operation: 'code', owner: r.owner, repo: r.repo, keywords: ['Semaphore'], pageSize: 10 };
  let tool;
  const seen = new Set();
  let dupes = 0, pages = 0, total = null;
  while (query && pages < 6) {
    const out = await search(query, tool);
    const data = rowData(out);
    pages += 1;
    total ??= data?.pagination?.totalItems;
    for (const f of data?.files ?? []) { const key = f.path; if (seen.has(key)) dupes += 1; seen.add(key); }
    query = data?.next?.nextPage?.query;
    tool = data?.next?.nextPage?.tool;
  }
  check('code search pagination: no file repeats across pages', dupes === 0 && pages > 1, `pages=${pages} files=${seen.size} dupes=${dupes} total=${total}`);
}
// Filters are honored on every row.
{
  const r = pinned.rust;
  const ext = rowData(await search({ operation: 'code', owner: r.owner, repo: r.repo, keywords: ['Semaphore'], extensions: ['rs'], pageSize: 20 }))?.files ?? [];
  check('extensions filter: every path ends in .rs', ext.length > 0 && ext.every(f => f.path.endsWith('.rs')), ext.filter(f => !f.path.endsWith('.rs')).map(f => f.path).join(','));
  const pre = rowData(await search({ operation: 'code', owner: r.owner, repo: r.repo, keywords: ['Semaphore'], path: 'tokio/src/sync', pageSize: 20 }))?.files ?? [];
  check('path filter: every path is under tokio/src/sync', pre.length > 0 && pre.every(f => f.path.startsWith('tokio/src/sync')), pre.filter(f => !f.path.startsWith('tokio/src/sync')).map(f => f.path).join(','));
  const fname = rowData(await search({ operation: 'code', owner: r.owner, repo: r.repo, keywords: ['impl'], filename: 'bounded.rs', pageSize: 20 }))?.files ?? [];
  check('filename qualifier: every basename contains bounded.rs and the exact file is listed', fname.length > 0 && fname.every(f => path.basename(f.path).includes('bounded.rs')) && fname.some(f => f.path === 'tokio/src/sync/mpsc/bounded.rs'), fname.map(f => f.path).join(','));
  const byPath = rowData(await search({ operation: 'code', owner: r.owner, repo: r.repo, keywords: ['semaphore'], matchIn: 'path', pageSize: 20 }))?.files ?? [];
  check('match:path: every returned path names the keyword', byPath.length > 0 && byPath.every(f => /semaphore/i.test(f.path)), byPath.filter(f => !/semaphore/i.test(f.path)).map(f => f.path).join(','));
}
// Tree listing equals git ls-tree at the pinned SHA (files and folders).
for (const r of Object.values(pinned)) {
  const dir = path.dirname(SOURCES[r.dir].large);
  const listed = new Set();
  let data;
  let treeQuery = { operation: 'tree', owner: r.owner, repo: r.repo, ref: r.sha, path: dir, maxDepth: 1, pageSize: 200 };
  let treeTool;
  for (let page = 0; treeQuery && page < 10; page++) {
    data = rowData(await search(treeQuery, treeTool));
    // `files[].dir` is repo-relative (the root row is the requested path), so names join to repo paths.
    for (const node of data?.files ?? []) {
      const at = node.dir === '.' ? '' : `${node.dir}/`;
      // GS3: a file entry is "<name> (<bytes>[, <YYYY-MM-DD>])", a folder "<name>[ (<YYYY-MM-DD>)]"; the last " (" opens the fields.
      for (const f of node.files ?? []) listed.add(`${at}${String(f).replace(/ \(\d+(?:, \d{4}-\d{2}-\d{2})?\)$/, '')}`);
      for (const d of node.folders ?? node.dirs ?? []) listed.add(`${at}${String(d).replace(/ \(\d{4}-\d{2}-\d{2}\)$/, '')}/`);
    }
    // The page continuation is `next.nextPage` (a `page` query); `pagination` is an extras:["stats"] field.
    const pageHint = Object.values(data?.next ?? {}).find(n => n?.query?.queries?.[0]?.page);
    treeQuery = pageHint?.query;
    treeTool = pageHint?.tool;
  }
  const truth = new Set(git(r.dir, 'ls-tree', '--name-only', `HEAD:${dir}`).trim().split('\n').filter(Boolean)
    .map(n => git(r.dir, 'cat-file', '-t', `HEAD:${dir}/${n}`).trim() === 'tree' ? `${dir}/${n}/` : `${dir}/${n}`));
  const truthFiles = [...truth].filter(n => !n.endsWith('/'));
  const listedFiles = [...listed].filter(n => !n.endsWith('/'));
  const missingFiles = truthFiles.filter(n => !listed.has(n));
  const extra = listedFiles.filter(n => !truth.has(n));
  check(`${r.dir}: tree ${dir} lists exactly git's files`, missingFiles.length === 0 && extra.length === 0 && (data?.commitSha ?? data?.resolvedRef ?? r.sha) === r.sha, `missing=${missingFiles.slice(0, 5)} extra=${extra.slice(0, 5)} resolved=${(data?.commitSha ?? data?.resolvedRef)?.slice(0, 8)}`);
}
// Repository search filters (hoisted `shared` fields apply to every row).
{
  const out = await search({ operation: 'repositories', owner: 'tokio-rs', stars: '>3000', pageSize: 10 });
  const shared = out.sc?.shared ?? {};
  const rows = (rowData(out)?.repositories ?? []).map(row => ({ ...shared, ...row }));
  // Rows name the repository by `owner` and `repo` (the name).
  check('repositories: owner and stars filters hold on every row', rows.length > 0 && rows.every(x => x.owner === 'tokio-rs' && x.stars > 3000), rows.map(x => `${x.owner}/${x.repo}:${x.stars}`).join(','));
  const lang = await search({ operation: 'repositories', keywords: ['async runtime'], language: 'rust', stars: '>1000', pageSize: 10 });
  const langRows = (rowData(lang)?.repositories ?? []).map(row => ({ ...(lang.sc?.shared ?? {}), ...row }));
  check('repositories: language filter holds on every row', langRows.length > 0 && langRows.every(x => /rust/i.test(x.language ?? '')), langRows.map(x => `${x.repo}:${x.language}`).join(','));
}

// ── C/D. History: commit ↔ git, PR ↔ commit, compare ↔ commit ─────────────
{
  const r = pinned.rust;
  const parent = git(r.dir, 'rev-parse', 'HEAD^').trim();
  const numstat = git(r.dir, 'diff', '--numstat', parent, 'HEAD').trim().split('\n').map(l => { const [a, d, f] = l.split('\t'); return { f, a: +a, d: +d }; });
  // The exact SHA equality needs `parents` (extras details); the PR lead is an extras:["hints"] field.
  const commit = rowData(await call('ghGetHistoryItem', { operation: 'commit', owner: r.owner, repo: r.repo, ref: r.sha, extras: ['details', 'echo', 'hints'] }));
  check('commit: message equals git', (commit?.message ?? '').trim() === git(r.dir, 'log', '-1', '--format=%B').trim(), commit?.message?.slice(0, 80));
  check('commit: author name/email and parents equal git', commit?.author?.name === git(r.dir, 'log', '-1', '--format=%an').trim() && commit?.author?.email === git(r.dir, 'log', '-1', '--format=%ae').trim() && JSON.stringify(commit?.parents) === JSON.stringify([parent]), JSON.stringify({ a: commit?.author, p: commit?.parents }));
  // Changed files: compact inventory rows ("M +3 -1 path", grouped {"dir/": [rows]}) without
  // patches, `{path, stat: "M +3 -1", patch}` rows with them; both expand to {path, additions, deletions}.
  const fileRow = f => { const [, a, d] = (f?.stat ?? '').match(/\+(\d+) -(\d+)/) ?? []; return { path: f?.path, additions: a === undefined ? f?.additions : +a, deletions: d === undefined ? f?.deletions : +d }; };
  const changed = items => inventoryRows(items).map(fileRow);
  const files = changed(commit?.files);
  check('commit: changed files and +/- counts equal git numstat', files.length === numstat.length && numstat.every(n => files.some(f => f.path === n.f && f.additions === n.a && f.deletions === n.d)), JSON.stringify(files) + ' vs ' + JSON.stringify(numstat));
  const withDiff = rowData(await call('ghGetHistoryItem', { operation: 'commit', owner: r.owner, repo: r.repo, ref: r.sha, sections: ['patches'] }));
  const patchOk = numstat.every(n => {
    const f = (withDiff?.files ?? []).find(x => x?.path === n.f);
    const gitPatch = git(r.dir, 'diff', parent, 'HEAD', '--', n.f).split('\n').filter(l => /^[+-](?![+-])/.test(l));
    const toolPatch = rawPatch(f?.patch).split('\n').filter(l => /^[+-](?![+-])/.test(l));
    return f && JSON.stringify(toolPatch) === JSON.stringify(gitPatch);
  });
  check('commit patches: +/- lines equal git diff', patchOk);
  const compare = rowData(await call('ghGetHistoryItem', { operation: 'compare', owner: r.owner, repo: r.repo, base: parent, head: r.sha }));
  const cmpRows = changed(compare?.files);
  // Compare resolves both ends to SHAs (`baseSha`/`headSha`) and lists the commit's files with its counts.
  check('compare parent...HEAD: same files and counts as the commit, ends resolved to SHAs', compare?.baseSha === parent && compare?.headSha === r.sha && cmpRows.length === numstat.length && numstat.every(n => cmpRows.some(f => f.path === n.f && f.additions === n.a && f.deletions === n.d)), JSON.stringify({ base: compare?.baseSha?.slice(0, 8), head: compare?.headSha?.slice(0, 8), files: cmpRows }));
  const prNumber = +(git(r.dir, 'log', '-1', '--format=%s').match(/#(\d+)\)/)?.[1] ?? 0);
  if (prNumber) {
    // A section read returns a slim header; extras details keeps the PR totals (additions/deletions).
    const pr = rowData(await call('ghGetHistoryItem', { operation: 'pullRequest', owner: r.owner, repo: r.repo, number: prNumber, sections: ['files'], extras: ['details'] }))?.pullRequests?.[0];
    check(`PR #${prNumber}: mergeCommitSha is the pinned squash commit`, pr?.mergeCommitSha === r.sha && !pr?.hints?.readMergeCommit, `mergeCommitSha=${pr?.mergeCommitSha}`);
    // A squash headline `… (#N)` routes straight to hints.readPullRequest; otherwise hints.findPullRequest searches by SHA.
    const prHint = commit?.hints?.readPullRequest ?? commit?.hints?.findPullRequest;
    check(`commit ${r.sha.slice(0, 8)}: PR continuation exists`, !!prHint);
    const found = prHint ? rowData(await client.follow(prHint)) : null;
    check(`commit ${r.sha.slice(0, 8)}: hints.readPullRequest/findPullRequest reaches PR #${prNumber}`, collect(found, o => o.number === prNumber && typeof o.title === 'string').length > 0, JSON.stringify(prHint?.query));
    check(`PR #${prNumber}: merged, and its changed files/+/- equal the squash commit`, pr?.state === 'merged' && pr?.additions === numstat.reduce((s, n) => s + n.a, 0) && pr?.deletions === numstat.reduce((s, n) => s + n.d, 0) && numstat.every(n => inventoryRows(pr.files).some(f => f.path === n.f && f.additions === n.a && f.deletions === n.d)), JSON.stringify({ state: pr?.state, add: pr?.additions, del: pr?.deletions }));
    const patches = rowData(await call('ghGetHistoryItem', { operation: 'pullRequest', owner: r.owner, repo: r.repo, number: prNumber, sections: ['patches'] }))?.pullRequests?.[0];
    const prPatchOk = numstat.every(n => {
      const f = collect(patches, o => o.path === n.f && typeof o.patch === 'string')[0];
      const gitPatch = git(r.dir, 'diff', parent, 'HEAD', '--', n.f).split('\n').filter(l => /^[+-](?![+-])/.test(l));
      return f && JSON.stringify(rawPatch(f.patch).split('\n').filter(l => /^[+-](?![+-])/.test(l))) === JSON.stringify(gitPatch);
    });
    check(`PR #${prNumber}: patches equal git diff of the squash commit`, prPatchOk);
    const prRows = collect(patches, o => typeof o.path === 'string' && typeof o.patch === 'string' && o.patch.startsWith('@@'));
    // Both-side gutters (native number_patch): ` `/`+` lines cite the new file, `-` lines the old file, and each
    // cited line equals that file's line in the clone (squash commit = new side, its parent = old side).
    const sideLines = (rev, file) => { try { return git(r.dir, 'show', `${rev}:${file}`).replace(/\n$/, '').split('\n'); } catch { return []; } };
    const numberIssues = prRows.map(o => ({ path: o.path, issue: patchNumbersIssue(o.patch, { oldLines: sideLines(parent, o.path), newLines: sideLines('HEAD', o.path) }) })).filter(x => x.issue);
    check(`PR #${prNumber}: every patch line cites its own side's line number, equal to the file at that side`, prRows.length > 0 && numberIssues.length === 0, JSON.stringify(numberIssues.slice(0, 2)));
  }
  // Commit search: bounded at the pinned HEAD's commit time, HEAD is listed
  // however far upstream has moved since; rows resolve.
  const pinnedAt = git(r.dir, 'log', '-1', '--format=%cI', 'HEAD').trim();
  const list = rowData(await call('ghSearchHistory', { operation: 'commit', owner: r.owner, repo: r.repo, until: pinnedAt, pageSize: 20 }));
  const shas = collect(list, o => typeof o.commitSha === 'string').map(o => o.commitSha);
  check('commit search: the pinned HEAD appears in history up to its commit time', shas.includes(r.sha), `${shas.length} shas until ${pinnedAt}; head ${r.sha.slice(0, 8)}`);
  const touched = rowData(await call('ghSearchHistory', { operation: 'commit', owner: r.owner, repo: r.repo, path: 'tokio/src/signal/registry.rs', pageSize: 3 }));
  let pathOk = 0, pathRows = collect(touched, o => typeof o.commitSha === 'string').slice(0, 3);
  for (const row of pathRows) {
    const c = rowData(await call('ghGetHistoryItem', { operation: 'commit', owner: r.owner, repo: r.repo, ref: row.commitSha }));
    if (changed(c?.files).some(f => f.path === 'tokio/src/signal/registry.rs')) pathOk += 1;
  }
  check('commit search path filter: every commit touches the path', pathRows.length > 0 && pathOk === pathRows.length, `${pathOk}/${pathRows.length}`);
  const ranged = rowData(await call('ghSearchHistory', { operation: 'commit', owner: r.owner, repo: r.repo, since: '2026-09-01', until: '2026-09-20', pageSize: 10 }));
  const dates = collect(ranged, o => typeof o.commitSha === 'string').map(o => o.date ?? o.author?.date ?? o.committer?.date ?? o.committedDate);
  check('commit search since/until: every date inside the range', dates.length > 0 && dates.every(d => d && d >= '2026-09-01' && d <= '2026-09-20T23:59:59Z'), dates.join(','));
  // History rows omit `state` when it equals the query's filter; a merged PR row still states `mergedAt`.
  const merged = rowData(await call('ghSearchHistory', { operation: 'pullRequest', owner: r.owner, repo: r.repo, state: 'merged', qualifiers: 'author:Darksonn', pageSize: 10 }));
  const prRows = collect(merged, o => typeof o.number === 'number' && typeof o.title === 'string');
  const mergedBy = p => (p.state ?? 'merged') === 'merged' && typeof p.mergedAt === 'string' && (p.author === 'Darksonn' || p.author?.login === 'Darksonn');
  check('PR search state+author: every row merged and by the author', prRows.length > 0 && prRows.every(mergedBy), JSON.stringify(prRows.filter(p => !mergedBy(p)).slice(0, 2)));
  const labeled = rowData(await call('ghSearchHistory', { operation: 'pullRequest', owner: r.owner, repo: r.repo, qualifiers: 'label:M-signal', pageSize: 10 }));
  const lrows = collect(labeled, o => typeof o.number === 'number' && typeof o.title === 'string');
  check('PR search label: every row carries the label', lrows.length > 0 && lrows.every(p => (p.labels ?? []).map(l => l.name ?? l).includes('M-signal')), JSON.stringify(lrows.filter(p => !(p.labels ?? []).map(l => l.name ?? l).includes('M-signal')).slice(0, 2)));
  const closed = rowData(await call('ghSearchHistory', { operation: 'issue', owner: r.owner, repo: r.repo, state: 'closed', qualifiers: 'created:2026-01-01..2026-06-30', pageSize: 10 }));
  const irows = collect(closed, o => typeof o.number === 'number' && typeof o.title === 'string');
  const closedIn = i => (i.state ?? 'closed') === 'closed' && (i.createdAt ?? '') >= '2026-01-01' && (i.createdAt ?? '') <= '2026-06-30T23:59:59Z';
  // The omitted state is the filter's claim; the first row's own read states it.
  const firstIssue = irows[0] ? rowData(await call('ghGetHistoryItem', { operation: 'issue', owner: r.owner, repo: r.repo, number: irows[0].number }))?.issues?.[0] : null;
  check('issue search state+created: every row closed and created in range', irows.length > 0 && irows.every(closedIn) && firstIssue?.state === 'closed', JSON.stringify({ firstRead: firstIssue?.state, bad: irows.filter(i => !closedIn(i)).slice(0, 2) }));
}

// ── D2. PR review reads (was review.mjs): selection, pagination, compare patches ──
// review.mjs checks already above: PR files/counts, all-patches = git, commit
// diff = git, commit → PR lookup, path history, file reads at the pinned SHA.
{
  const r = pinned.rust;
  const parent = git(r.dir, 'rev-parse', 'HEAD^').trim();
  const number = +(git(r.dir, 'log', '-1', '--format=%s').match(/#(\d+)\)/)?.[1] ?? 0);
  const files = git(r.dir, 'diff', '--name-only', parent, 'HEAD').trim().split('\n');
  const delta = s => rawPatch(s).split('\n').filter(l => /^[+-](?![+-])/.test(l));
  const gitDelta = file => delta(git(r.dir, 'diff', parent, 'HEAD', '--', file));
  const patchRows = e => collect(rowData(e), v => typeof v.patch === 'string' && typeof v.path === 'string');
  const sameDelta = f => JSON.stringify(delta(f.patch)) === JSON.stringify(gitDelta(f.path));
  const pr = { owner: r.owner, repo: r.repo, operation: 'pullRequest', number };
  if (number) {
    const meta = rowData(await call('ghGetHistoryItem', pr))?.pullRequests?.[0];
    check(`PR #${number}: metadata pins a 40-hex head SHA`, /^[a-f0-9]{40}$/.test(meta?.headSha ?? ''), meta?.headSha);
    const selected = patchRows(await call('ghGetHistoryItem', { ...pr, sections: ['patches'], include: [files[0]] }));
    check(`PR #${number}: include selects only the requested file, its patch equal to git`, selected.length === 1 && selected[0].path === files[0] && sameDelta(selected[0]), JSON.stringify(selected.map(f => f.path)));
    const seen = [];
    let page = await call('ghGetHistoryItem', { ...pr, pageSize: 1, sections: ['patches'] });
    for (let n = 0; page && n < 10; n++) {
      seen.push(...patchRows(page).map(f => f.path));
      const next = nextHints(page.sc).find(h => /\.next\.(?:continuePatch|nextFilePage|nextPage)$/.test(h.path));
      page = next ? await client.follow(next) : null;
    }
    check(`PR #${number}: pageSize 1 patch pagination visits every changed file once and terminates`, !page && seen.length === files.length && new Set(seen).size === files.length, JSON.stringify(seen));
    const detail = rowData(await call('ghGetHistoryItem', { ...pr, sections: ['reviews', 'comments', 'reviewComments', 'commits'] }));
    const hasField = name => collect(detail, o => Object.hasOwn(o, name)).length > 0;
    check(`PR #${number}: review sections return reviews and commits fields`, hasField('reviews') && hasField('commits'), JSON.stringify(detail).slice(0, 160));
  }
  const commit = rowData(await call('ghGetHistoryItem', { operation: 'commit', owner: r.owner, repo: r.repo, ref: r.sha, extras: ['details'] }));
  check('commit: sha is the pinned SHA', commit?.sha === r.sha, commit?.sha);
  const compared = patchRows(await call('ghGetHistoryItem', { operation: 'compare', owner: r.owner, repo: r.repo, base: parent, head: r.sha, sections: ['patches'] }));
  check('compare parent...HEAD with patches: every file delta equals git', compared.length === files.length && compared.every(sameDelta), `${compared.length}/${files.length}`);
  const open = collect(rowData(await call('ghSearchHistory', { owner: 'microsoft', repo: 'TypeScript', operation: 'pullRequest', state: 'open', pageSize: 3 })), v => typeof v.number === 'number' && typeof v.title === 'string');
  check('open PR search returns candidates', open.length > 0);
  if (open.length) {
    const live = rowData(await call('ghGetHistoryItem', { owner: 'microsoft', repo: 'TypeScript', operation: 'pullRequest', number: open[0].number, sections: ['files'] }))?.pullRequests?.[0];
    check(`open PR #${open[0].number}: exposes a 40-hex head SHA`, /^[a-f0-9]{40}$/.test(live?.headSha ?? ''), live?.headSha);
  }
}

// Large PRs (>100 files, REST oracle): review-large.mjs.

// ── E. classifiers and clasify over GitHub sources (ground truth from the pinned clone) ──
/** ghGetFileContent content as `[lineNumber, text]` pairs (`N<TAB>text` per line). */
const numberedLines = content => String(content ?? '').split('\n').flatMap(line => {
  const match = /^(\d+)\t(.*)$/.exec(line);
  return match ? [[Number(match[1]), match[2]]] : [];
});
if (noClassifiers) skip('classifiers GitHub: ranked reads and search', noClassifiers);
else {
  const LOCATE = [
    { dir: 'rust', file: 'tokio/src/sync/mpsc/bounded.rs', re: /^pub fn channel</, target: 'The public function that creates a bounded multi-producer channel with a given buffer capacity.' },
    { dir: 'c', file: 'src/server.c', re: /^int serverCron\(/, target: 'The periodic timer function that runs background housekeeping tasks many times per second.' },
    { dir: 'python', file: 'django/db/models/query.py', re: /def _fetch_all\(/, target: 'The method that evaluates the query and fills the result cache.' },
    { dir: 'go', file: 'tsdb/db.go', re: /^func Open\(/, target: 'The exported function that opens an existing database directory or creates a new one.' },
  ];
  const rows = [];
  for (const t of LOCATE) {
    const r = pinned[t.dir];
    const lines = localLines(r.dir, t.file);
    const truth = lines.findIndex(l => t.re.test(l)) + 1;
    const bytes = Buffer.byteLength(local(r.dir, t.file));
    // A raw line window at the pinned commit: the ranked route (minified views skip ranking).
    const out = await call('ghGetFileContent', { owner: r.owner, repo: r.repo, path: t.file, ref: r.sha, unit: 'lines', length: 120, minify: 'none', classifiers: [t.target] });
    const data = fileRow(out) ?? {};
    const delivered = numberedLines(data.content);
    // Every delivered line is the pinned clone's line (the read is at r.sha).
    const faithful = delivered.length > 0 && delivered.every(([n, text]) => lines[n - 1] === text);
    const strict = delivered.some(([n]) => n === truth);
    const next = data.next?.continueWindow?.query?.queries?.[0];
    rows.push({ file: `${r.repo}/${path.basename(t.file)}`, KB: Math.round(bytes / 1024), truth, ranking: data.ranking?.status ?? '-', strict, faithful, hostKB: (out.bytes / 1024).toFixed(1), saving: `${Math.round(100 - 100 * out.bytes / bytes)}%` });
    check(`classifiers GitHub ${r.repo}/${path.basename(t.file)}: the first ranked page delivers the declaration, byte-equal to the clone`, data.ranking?.status === 'ranked' && strict && faithful, `ranking=${JSON.stringify(data.ranking)} first=${delivered[0]?.[0]} truth=${truth}`);
    check(`classifiers GitHub ${r.repo}/${path.basename(t.file)}: the read and its continuation stay on the pinned commit`, (data.commitSha ?? r.sha) === r.sha && (!next || next.ref === r.sha), JSON.stringify({ commitSha: data.commitSha, nextRef: next?.ref }));
  }
  console.table(rows);
  // Code search: an mpsc receiver file ranks first among the provider page's hits.
  const r = pinned.rust;
  const found = await search({ operation: 'code', owner: r.owner, repo: r.repo, keywords: ['try_recv'], pageSize: 5, classifiers: ['The public try_recv method of an mpsc receiver (not a test).'] });
  const files = (fileRow(found)?.files ?? []).map(f => f.path ?? '');
  check('classifiers GitHub search: an mpsc receiver file ranks first', fileRow(found)?.ranking?.status === 'ranked' && /mpsc\/(bounded|unbounded|chan)\.rs$/.test(files[0] ?? ''), JSON.stringify({ ranking: fileRow(found)?.ranking, files }).slice(0, 220));
}
if (noClasify) skip('clasify GitHub: typed questions over a pinned source', noClasify);
else {
  // A pinned GitHub range: a present target answers yes, an absent one no, and
  // the read lead re-reads exactly that range at the same commit.
  const r = pinned.rust;
  const file = 'tokio/src/sync/mpsc/bounded.rs';
  const truth = localLines(r.dir, file).findIndex(l => /^pub fn channel</.test(l)) + 1;
  const range = `${truth}-${truth + 40}`;
  const out = await raw('clasify', { queries: [{ id: 'gh', source: { tool: 'ghGetFileContent', query: { owner: r.owner, repo: r.repo, path: file, ref: r.sha, ranges: [range] } }, questions: {
    channel: { type: 'noul', instructions: 'Does the selection define the public function that creates a bounded mpsc channel?' },
    yaml: { type: 'noul', instructions: 'Does the selection parse a YAML configuration file into nested dictionaries?' },
  } }] });
  const row = out.sc?.queries?.[0] ?? {};
  check('clasify GitHub source: a present target answers yes and an absent one no', row.answers?.channel?.noul >= 0.5 && row.answers?.yaml?.noul < 0.5, JSON.stringify(row.answers ?? row.error));
  const lead = row.hints?.read;
  const read = lead && await client.follow(lead);
  const lines = numberedLines(read && fileRow(read)?.content);
  check('clasify GitHub source: hints.read re-reads the captured range at the pinned commit', lead?.tool === 'ghGetFileContent' && lead.query?.queries?.[0]?.ref === r.sha
    && lines[0]?.[0] === truth && lines.at(-1)?.[0] === truth + 40, JSON.stringify(lead).slice(0, 220));
}

console.log('data compared:', stats, 'rate-limit waits:', rateLimitWaits);
const result = summary();
writeResults('github', { ...result, stats });
client.close();
process.exitCode = result.failed.length ? 1 : 0;

function firstDiff(a, b) {
  if (a === b) return 'identical';
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const line = a.slice(0, i).split('\n').length;
  return `first diff at char ${i} (line ${line}): tool=${JSON.stringify(a.slice(i, i + 40))} git=${JSON.stringify(b.slice(i, i + 40))} (len ${a.length} vs ${b.length})`;
}
