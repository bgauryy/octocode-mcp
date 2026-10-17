// BENCHMARK, not a correctness test: run-all runs it only when named.
// Cache effectiveness on real repos. lspSearch continuation pages reuse the
// server answers for an unchanged anchor (checked). Symbols/topology pages
// re-read every file so edits are detected; their timings are reported (the
// bench runs debug builds, where they are several times slower than release).
import fs from 'node:fs';
import path from 'node:path';
import { REPOS, checks, cliClient, cliEntry, rowData, startServer, writeResults } from './mcp-client.mjs';

const { check, summary } = checks('perf');
const client = await startServer({ env: { OCTOCODE_BETA: '1' } });
const { call } = client;
// `lead` is a next.* lead ({tool, query}), replayed verbatim.
const timed = async (tool, query, lead) => {
  const started = performance.now();
  const out = lead ? await client.follow(lead) : await call(tool, query);
  return { out, ms: Math.round(performance.now() - started) };
};
const rows = [];

// lspSearch references of a widely used symbol (vscode URI).
{
  const file = path.join(REPOS, 'huge-ts/src/vs/base/common/uri.ts');
  const line = fs.readFileSync(file, 'utf8').split('\n').findIndex(l => /^export class URI\b/.test(l)) + 1;
  // pageSize stays below the reference count so page 2 exists.
  const first = await timed('lspSearch', { path: file, symbolName: 'URI', line: line, operation: 'references', pageSize: 20 });
  const next = rowData(first.out)?.next?.nextPage;
  const second = next ? await timed('lspSearch', null, next) : null;
  const refs = rowData(first.out)?.pagination?.totalItems;
  rows.push({ case: `lspSearch references URI (${refs} refs)`, page1: first.ms, page2: second?.ms ?? '-' });
  check('lspSearch: page 2 reuses page 1 (under 30%)', !!second && second.ms < first.ms * 0.3, `page1=${first.ms} page2=${second?.ms} refs=${refs}`);
}

// astSearch symbols over a large directory.
{
  const dir = path.join(REPOS, 'huge-ts/src/vs/editor/common');
  const first = await timed('astSearch', { operation: 'symbols', path: dir, pageSize: 100 });
  const next = rowData(first.out)?.next?.nextPage;
  const second = next ? await timed('astSearch', null, next) : null;
  rows.push({ case: `astSearch symbols (${rowData(first.out)?.pagination?.totalItems} decls)`, page1: first.ms, page2: second?.ms ?? '-' });
}

// astTopology (CLI-only): page 2 and a different operation. Each CLI call is
// a fresh process, so these timings include the scan; no memo is shared.
{
  const root = path.join(REPOS, 'rust');
  const base = { path: root, rustWorkspace: 'cargo', exclude: ['target'] };
  const topology = async (query, lead) => {
    const started = performance.now();
    const out = lead ? await cliClient.follow(lead) : cliEntry('astTopology', { queries: [query] });
    return { out, ms: Math.round(performance.now() - started) };
  };
  const first = await topology({ ...base, operation: 'dependents', source: 'tokio/src/sync/mpsc/bounded.rs', graphDepth: 6, pageSize: 5 });
  const next = rowData(first.out)?.next?.nextPage;
  const second = next ? await topology(null, next) : null;
  const other = await topology({ ...base, operation: 'cycles', pageSize: 5 });
  const coverage = rowData(first.out)?.coverage?.diagnosticCounts ?? {};
  rows.push({ case: 'astTopology tokio dependents', page1: first.ms, page2: second?.ms ?? '-', repeat: other.ms, unsupportedLinking: coverage['unsupported-linking'] ?? 0 });
  check('astTopology: tokio unsupported-linking gaps under 200 (was 1,023)', !first.out.isError && !first.out.rowErrors && !!rowData(first.out)?.coverage && (coverage['unsupported-linking'] ?? 0) < 200, JSON.stringify(coverage));
}

// astSearch match and symbols over the native crates (this repository): walk
// cost of a whole-tree pattern scan, three runs each.
{
  const crates = path.resolve(import.meta.dirname, '../../../../../packages/octocode-native/crates');
  for (const query of [
    { operation: 'match', path: crates, language: 'rust', pattern: 'fn $NAME() {}', maxFiles: 5000 },
    { operation: 'symbols', path: path.join(crates, 'engine/src'), symbolName: 'walk_builder' },
  ]) {
    const runs = [];
    for (let i = 0; i < 3; i++) runs.push(await timed('astSearch', query));
    rows.push({ case: `astSearch ${query.operation} native crates`, page1: runs[0].ms, page2: '-', repeat: Math.min(...runs.slice(1).map(r => r.ms)) });
    check(`astSearch ${query.operation} native crates succeeds`, runs.every(r => !r.out.isError && !r.out.rowErrors), JSON.stringify(rowData(runs[0].out)?.errorCode ?? ''));
  }
}

// Real-repo import-resolution tallies (manual): OCTOCODE_GRAPH_SANITY_ROOTS=a:b
// prints each root's astTopology cycles coverage (diagnostic counts by code)
// and a sample of unresolved internal imports.
for (const root of (process.env.OCTOCODE_GRAPH_SANITY_ROOTS ?? '').split(':').filter(Boolean)) {
  const started = performance.now();
  const out = cliEntry('astTopology', { queries: [{ operation: 'cycles', path: root, maxFiles: 20000, extras: ['diagnostics'] }] });
  const data = rowData(out);
  const unresolved = (data?.diagnostics ?? []).filter(d => d.code === 'unresolved-internal').slice(0, 8);
  console.log(`SANITY ${root} ms=${Math.round(performance.now() - started)} coverage=${JSON.stringify(data?.coverage ?? data?.errorCode)}\n  sample unresolved: ${JSON.stringify(unresolved, null, 2)}`);
}

console.table(rows);
const result = summary();
writeResults('perf', { ...result, rows });
client.close();
process.exitCode = result.failed.length ? 1 : 0;
