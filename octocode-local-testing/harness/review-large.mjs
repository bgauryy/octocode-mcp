// LIVE: a >100-file PR: inventory and selected patch windows, compared with
// GitHub's independent REST files response, including provider-omitted patches.
import { findHint, startServer, rowData, nextHints, checks, writeResults, inventoryRows, rawPatch, patchNumbersOk } from './mcp-client.mjs';

const c = await startServer();
const { check, skip, summary } = checks('review-large');
const calls = [];
const q = { operation: 'pullRequest', owner: 'microsoft', repo: 'TypeScript', number: 51387 };

async function run(label, args, hint) {
  const entry = hint ? await c.follow(hint) : await c.call('ghGetHistoryItem', args);
  calls.push({ ...entry, label, bytes: Buffer.byteLength(entry.text) });
  const success = !entry.isError && !entry.rowErrors;
  check(label + ' succeeds', success);
  if (!success) throw new Error(label + ' failed: ' + entry.text);
  return entry;
}

async function select(file, label) {
  const entry = await run(label, { ...q, sections: ['patches'], include: [file.filename] });
  const files = rowData(entry)?.pullRequests?.[0]?.files;
  check(label + ' returns only the requested file', files?.length === 1 && files[0].path === file.filename, file.filename);
  return entry;
}

try {
  const meta = rowData(await run('metadata', { ...q, extras: ['hints'] }));
  const m = meta.pullRequests[0];
  check('fixture exceeds 100 changed files', m.changedFilesCount > 100, m.changedFilesCount);
  check('metadata excludes changed-file bodies', !m.files);
  check('metadata offers requested file inventory hint', !!findHint(meta, 'readFiles'));

  let entry = await run('inventory page 1', { ...q, sections: ['files'], pageSize: 100 });
  const files = [];
  for (let page = 1; entry && page <= 40; page++) {
    const pr = rowData(entry)?.pullRequests?.[0];
    check('page ' + page + ' has file metadata', Array.isArray(pr?.files) && pr.files.length > 0);
    check('page ' + page + ' excludes patches', inventoryRows(pr?.files).every(file => file.path && !Object.hasOwn(file, 'patch')));
    check('page ' + page + ' preserves head SHA', pr?.headSha === m.headSha);
    files.push(...inventoryRows(pr?.files));
    const next = nextHints(entry.sc).find(hint => hint.path.endsWith('.next.nextFilePage'));
    entry = next ? await run('inventory page ' + (page + 1), null, next) : null;
  }
  check('inventory terminates', !entry);
  check('all changed files returned exactly once', files.length === m.changedFilesCount && new Set(files.map(file => file.path)).size === m.changedFilesCount, files.length);

  const apiFiles = [];
  for (let page = 1; page <= Math.ceil(m.changedFilesCount / 100); page++) {
    const response = await fetch(`https://api.github.com/repos/${q.owner}/${q.repo}/pulls/${q.number}/files?per_page=100&page=${page}`, {
      headers: { 'User-Agent': 'octocode-review-audit' },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error('independent GitHub files oracle HTTP ' + response.status);
    apiFiles.push(...await response.json());
  }
  const byPath = new Map(files.map(file => [file.path, file]));
  // Compact inventory groups paths by directory; provider order is not an invariant.
  const statsMatch = (row, file) => row && (row.patchUnavailable === 'omitted'
    ? row.additions === undefined && file.additions === 0 && file.deletions === 0 && !Object.hasOwn(file, 'patch')
    : row.additions === file.additions && row.deletions === file.deletions);
  check('inventory paths and stats equal independent API', apiFiles.length === files.length && apiFiles.every(file => statsMatch(byPath.get(file.filename), file)), files.filter(file => file.patchUnavailable === 'omitted').length + ' omitted');

  const lateFiles = apiFiles.slice(100);
  const unavailable = lateFiles.find(file => typeof file.patch !== 'string');
  if (unavailable) {
    const selected = rowData(await select(unavailable, 'provider-omitted patch beyond file 100'))?.pullRequests?.[0]?.files?.[0];
    check('provider-omitted patch is explicitly unavailable', typeof selected?.patch !== 'string' && !!selected?.patchUnavailable, unavailable.filename);
  } else {
    skip('provider-omitted late patch', 'GitHub supplied patches for every file beyond 100');
  }

  // The largest available late patch exercises window paging even when GitHub
  // omits a different large file. The oracle determines availability, not the tool.
  const chosen = lateFiles.filter(file => typeof file.patch === 'string')
    .reduce((largest, file) => !largest || file.patch.length > largest.patch.length ? file : largest, null);
  check('late file has an independent API patch', !!chosen, chosen?.filename);
  if (chosen) {
    let window = await select(chosen, 'available patch beyond file 100');
    let patch = '';
    let windows = 0;
    while (window && windows < 100) {
      windows++;
      const file = rowData(window)?.pullRequests?.[0]?.files?.[0];
      check('patch window ' + windows + ' starts at accumulated offset', (file?.patchPagination?.offset ?? 0) === Array.from(patch).length, file?.patchPagination?.offset);
      check('patch window ' + windows + ' contains selected patch', file?.path === chosen.filename && typeof file?.patch === 'string');
      patch += file?.patch ?? '';
      const next = rowData(window)?.next?.continuePatch;
      if (file?.patchPagination?.hasMore) check('unfinished window ' + windows + ' has executable continuation', !!next);
      window = next ? await run('patch window ' + (windows + 1), null, next) : null;
    }
    check('patch pagination terminates', !window, windows + ' windows');
    check('selected late patch exercises multiple windows', windows > 1, windows + ' windows');
    check('assembled raw patch exactly equals independent API', rawPatch(patch) === chosen.patch, 'chars ' + Array.from(patch).length);
    check('assembled patch numbers every line on its side (new for +/space, old for -)', patchNumbersOk(patch));
  }
} catch (error) {
  check('audit completes', false, error.stack);
} finally {
  const result = summary();
  writeResults('review-large', { at: new Date().toISOString(), ...result, calls });
  console.table(calls.map(({ label, ms, bytes }) => ({ label, ms, bytes })));
  c.close();
  process.exitCode = result.failed.length ? 1 : 0;
}
