import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { buildMcpInstructions } from '@octocodeai/config/mcp';
import { getDirectToolDefinitionsWithAddons } from '@octocodeai/config/schema';

// A candidate addon to check; without one, the packaged runtime the servers load.
const [
  referenceServer,
  nativeServer,
  addon = createRequire(import.meta.url).resolve('@octocodeai/octocode-native/runtime'),
] = process.argv.slice(2);
assert.ok(referenceServer && nativeServer,
  'usage: node response-pagination.mjs <reference> <native> [<addon>]');

const fixture = await mkdtemp(path.join(tmpdir(), 'octocode-native-mcp-'));
const source = path.join(fixture, 'unicode.txt');
const sourceText = `${'alpha 😀 beta\n'.repeat(40)}omega\n`;
await writeFile(source, sourceText);
const frozenTime = new Date('2020-09-13T12:26:40.443Z');
await utimes(source, frozenTime, frozenTime);
const env = {
  ...process.env,
  OCTOCODE_ENABLE_LOCAL: 'true',
  WORKSPACE_ROOT: fixture,
  ALLOWED_PATHS: fixture,
  NODE_ENV: 'development',
  OCTOCODE_NATIVE_BINDING: addon,
};
const require = createRequire(import.meta.url);
const { NativeRuntime } = require(path.resolve(addon));
const { resolveNativeBinaryPath } = require('@octocodeai/octocode-native/bin/resolve-binary.cjs');
const nativeBinary = resolveNativeBinaryPath();
const npmCli = path.resolve(import.meta.dirname, '../../../octocode/out/octocode.js');
const exec = promisify(execFile);

async function cliCall(command, prefix, args) {
  try {
    const { stdout } = await exec(command, [...prefix, 'localFetch', JSON.stringify(args), '--json'], {
      cwd: fixture,
      env,
      maxBuffer: 8 * 1024 * 1024,
      timeout: 30_000,
    });
    return { structuredContent: JSON.parse(stdout) };
  } catch (error) {
    if (error.stdout) return { isError: true, structuredContent: JSON.parse(error.stdout) };
    throw error;
  }
}

function surfaces(client, runtime) {
  return [
    ['native CLI', args => cliCall(nativeBinary, [], args)],
    ['npm CLI', args => cliCall(process.execPath, [npmCli], args)],
    ['direct N-API', args => runtime.executeMcp(`page-${randomUUID()}`, 'localFetch', args)],
    ['MCP', args => client.callTool({ name: 'localFetch', arguments: args })],
  ];
}

async function connect(server) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve(server)],
    cwd: fixture,
    env,
    stderr: 'pipe',
  });
  transport.stderr?.on('data', chunk => process.stderr.write(chunk));
  const client = new Client({ name: 'native-response-pagination', version: '1' });
  await client.connect(transport);
  return client;
}

function withoutOpaqueCursors(value) {
  if (Array.isArray(value)) return value.map(withoutOpaqueCursors);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'cursor' && key !== 'expiresAt')
      .map(([key, nested]) => [key, withoutOpaqueCursors(nested)]),
  );
}

async function collect(client) {
  let args = {
    queries: [{ path: source, fullContent: true, mainGoal: 'page', reasoning: 'Exercise response pagination parity.' }],
    // Whole rows are the default page unit; windows of the rendered text split
    // the multi-byte characters this harness exists to check.
    responseLength: 96,
    responseScope: 'text',
  };
  const pages = [];
  for (let index = 0; index < 100; index += 1) {
    const result = await client.callTool({ name: 'localFetch', arguments: args });
    assert.notEqual(result.isError, true, JSON.stringify(result.structuredContent));
    pages.push(result);
    const pagination = result.structuredContent?.responsePagination;
    if (!pagination?.hasMore) break;
    const continuation = pagination.next;
    assert.equal(continuation?.tool, 'localFetch');
    assert.ok(continuation.query?.responseSnapshot);
    args = continuation.query;
  }
  assert.ok(pages.length > 1);
  // Saved reads retain replay/lifetime metadata after the final page.
  const last = pages.at(-1).structuredContent.responsePagination;
  assert.equal(last?.hasMore ?? false, false);
  assert.equal(last?.next, undefined);
  return pages;
}

function nativeInstructions() {
  const runtime = new NativeRuntime({
    surface: 'mcp',
    env: Object.fromEntries(
      Object.entries(env).filter(([, value]) => typeof value === 'string'),
    ),
  });
  try {
    const catalog = runtime.catalog();
    return buildMcpInstructions({
      availableTools: catalog.tools.filter(tool => tool.available).map(tool => tool.name),
      selection: catalog.presentation?.selection === true,
    });
  } finally {
    void runtime.close();
  }
}

async function walk(call, firstInput, nextAt, label) {
  let input = firstInput;
  const pages = [];
  const seen = new Set();
  for (let index = 0; index < 100; index += 1) {
    const result = await call(input);
    assert.notEqual(result.isError, true, `${label}: ${JSON.stringify(result.structuredContent)}`);
    const data = result.structuredContent;
    assert.ok(data, `${label}: missing structured content`);
    pages.push(data);
    const { hasMore, next } = nextAt(data);
    if (!hasMore) {
      assert.equal(next, undefined, `${label}: terminal page has a continuation`);
      return pages;
    }
    assert.equal(next?.tool, 'localFetch', `${label}: continuation tool`);
    assert.ok(next.query && typeof next.query === 'object', `${label}: missing continuation query`);
    const key = JSON.stringify(next.query);
    assert.ok(!seen.has(key), `${label}: repeated continuation`);
    seen.add(key);
    input = next.query;
  }
  assert.fail(`${label}: continuation did not terminate`);
}

async function checkToolPages(surfaceCalls) {
  const firstInput = { queries: [{ path: source, offset: 0, length: 5, unit: 'lines' }] };
  const expected = sourceText.split('\n').slice(0, -1)
    .map((line, index) => `${index + 1}\t${line}\n`).join('');
  const walks = [];
  for (const [name, call] of surfaceCalls) {
    const pages = await walk(call, firstInput, data => {
      const row = data.results?.[0];
      assert.equal(row?.index, 0, `${name}: row index`);
      assert.equal(row?.data?.path, path.basename(source), `${name}: source identity`);
      const pagination = row.data.pagination;
      return { hasMore: pagination?.hasMore, next: row.data.next?.continueWindow };
    }, `${name} tool page`);
    assert.ok(pages.length > 1, `${name}: expected multiple tool pages`);
    const content = pages.map(page => page.results[0].data.content).join('');
    assert.equal(content, expected, `${name}: skipped, reordered or duplicated source lines`);
    const continuation = pages[0].results[0].data.next.continueWindow;
    const stale = await call({
      ...continuation.query,
      queries: continuation.query.queries.map(query => ({
        ...query,
        snapshot: '0'.repeat(64),
      })),
    });
    const failed = stale.structuredContent?.results?.[0];
    assert.equal(failed?.data?.errorCode, 'staleSnapshot', `${name}: stale source snapshot`);
    assert.equal(failed?.status, 'error', `${name}: stale source status`);
    assert.equal(failed.data.next?.restart?.tool, 'localFetch', `${name}: restart lead`);
    walks.push({ name, content, count: pages.length });
  }
  assert.equal(new Set(walks.map(walk => walk.count)).size, 1, 'tool page counts differ');
  return walks[0].count;
}

async function checkResponsePages(surfaceCalls) {
  const queries = [1, 2, 1].map(line => ({ path: source, ranges: [`${line}-${line}`] }));
  const firstInput = { queries, responseLength: 300, responseScope: 'rows' };
  const expected = queries.map(({ ranges }) => {
    const line = Number(ranges[0].split('-')[0]);
    return `${line}\talpha 😀 beta\n`;
  });
  const walks = [];
  for (const [name, call] of surfaceCalls) {
    const pages = await walk(call, firstInput, data => {
      const pagination = data.responsePagination;
      assert.equal(pagination?.scope, 'rows', `${name}: response page scope`);
      return { hasMore: pagination.hasMore, next: pagination.next };
    }, `${name} response page`);
    assert.ok(pages.length > 1, `${name}: expected multiple response pages`);
    const rows = pages.flatMap(page => page.results ?? []);
    assert.deepEqual(rows.map(row => row.index), [0, 1, 2], `${name}: row order and duplicates`);
    assert.deepEqual(rows.map(row => row.data.content), expected, `${name}: source evidence`);
    const continuation = pages[0].responsePagination.next;
    const stale = await call({
      ...continuation.query,
      responseSnapshot: 'response-v1:stale',
    });
    assert.equal(stale.structuredContent?.errorCode, 'responseSnapshotExpired', `${name}: stale response snapshot`);
    walks.push({ name, rows, count: pages.length });
  }
  assert.equal(new Set(walks.map(walk => walk.count)).size, 1, 'response page counts differ');
  assert.deepEqual(walks.slice(1).map(walk => walk.rows), walks.slice(1).map(() => walks[0].rows));
  return walks[0].count;
}

const reference = await connect(referenceServer);
const native = await connect(nativeServer);
const directRuntime = new NativeRuntime({
  surface: 'mcp',
  env: Object.fromEntries(Object.entries(env).filter(([, value]) => typeof value === 'string')),
});
try {
  const nativeTools = await native.listTools();
  // The server composes instructions from the native catalog (available tools
  // and the selection switch); rebuild them from the same addon.
  assert.equal(native.getInstructions(), nativeInstructions());
  const localFetch = nativeTools.tools.find(tool => tool.name === 'localFetch');
  assert.ok(localFetch, 'native catalog must advertise localFetch');
  assert.ok(localFetch.title);
  assert.equal(Object.hasOwn(localFetch, 'outputSchema'), false);
  // tools/list carries core's annotations and omits output schemas (ARCHITECTURE.md).
  assert.deepEqual(
    localFetch.annotations,
    getDirectToolDefinitionsWithAddons({ availableTools: ['localFetch'] })
      .find(definition => definition.name === 'localFetch').annotations,
  );
  const [expected, actual] = await Promise.all([collect(reference), collect(native)]);
  assert.deepEqual(withoutOpaqueCursors(actual), withoutOpaqueCursors(expected));

  const first = actual[0].structuredContent.responsePagination;
  const stale = await native.callTool({
    name: 'localFetch',
    arguments: {
      responseLength: 96,
      responseOffset: first.nextOffset,
      responseSnapshot: 'response-v1:stale',
    },
  });
  assert.equal(stale.isError, true);
  assert.equal(stale.structuredContent.errorCode, 'responseSnapshotExpired');
  assert.equal(stale.structuredContent.responsePagination, undefined);
  const [expectedInvalid, actualInvalid] = await Promise.all([
    reference.callTool({ name: 'localFetch', arguments: { queries: [{}] } }),
    native.callTool({ name: 'localFetch', arguments: { queries: [{}] } }),
  ]);
  assert.deepEqual(actualInvalid, expectedInvalid);
  const calls = surfaces(native, directRuntime);
  const toolPages = await checkToolPages(calls);
  const responsePages = await checkResponsePages(calls);
  console.log(JSON.stringify({ pages: actual.length, toolPages, responsePages, surfaces: calls.map(([name]) => name), unicode: true, staleReadRejected: true }));
} finally {
  await Promise.allSettled([reference.close(), native.close(), directRuntime.close()]);
  await rm(fixture, { recursive: true, force: true });
}
