/** Built CLI and fresh MCP context selection against a hermetic loopback scorer. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { hermeticEnv } from '../../../../test-utils/hermetic-env.ts';

const root = process.cwd();
const cliPath = path.join(root, 'packages/octocode/out/octocode.js');
const mcpPath = path.join(root, 'packages/octocode-mcp/dist/index.js');
const fixture = await fs.mkdtemp(
  path.join(os.tmpdir(), 'octocode-selection-execution-')
);
const selectedMarker = 'SELECTED_SELECTION_EVIDENCE';
const unknownMarker = 'UNKNOWN_SELECTION_EVIDENCE';
const excludedMarker = 'EXCLUDED_SELECTION_EVIDENCE';
const classifiers = [
  'Does this directly state that a queued request is cancelled before work starts?',
];
const searchPath = path.join(fixture, 'search');
const fetchPath = path.join(fixture, 'document.txt');
await fs.mkdir(searchPath);
await fs.writeFile(
  path.join(searchPath, '0-excluded.txt'),
  `topic: ${excludedMarker} bookkeeping only\n`
);
await fs.writeFile(
  path.join(searchPath, '1-unknown.txt'),
  `topic: ${unknownMarker} relationship unclear\n`
);
await fs.writeFile(
  path.join(searchPath, '2-selected.txt'),
  `topic: ${selectedMarker} A queued request is cancelled before work starts.\n`
);
const lines = Array.from(
  { length: 1200 },
  (_, index) => `line ${index + 1}: ordinary context`
);
lines[99] = `${selectedMarker} A queued request is cancelled before work starts.`;
lines[599] = `${unknownMarker} The relationship to cancellation is unclear.`;
lines[999] = `${excludedMarker} Routine bookkeeping does not cancel work.`;
await fs.writeFile(fetchPath, `${lines.join('\n')}\n`);

let failure = false;
const requests = [];
const provider = http.createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString());
  requests.push(body);
  if (failure) {
    response.writeHead(401, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'synthetic refusal' }));
    return;
  }
  const state = JSON.stringify(body.state);
  const direct = state.includes(selectedMarker);
  const unknown = state.includes(unknownMarker);
  const answers = Object.fromEntries(
    Object.entries(body.questions).map(([id, question]) => {
      assert.equal(question.type, 'score');
      assert.equal(question.criteria.length, 3);
      const probabilities = direct
        ? { 0: 0, 1: 0, 2: 1 }
        : unknown
          ? { 0: 0.2, 1: 0.8, 2: 0 }
          : { 0: 1, 1: 0, 2: 0 };
      const score = Object.entries(probabilities).reduce(
        (sum, [level, probability]) =>
          sum + Number(level) * Number(probability),
        0
      );
      return [
        id,
        {
          type: 'score',
          score,
          confidence: 1,
          probabilities,
          legend: Object.fromEntries(
            question.criteria.map((level, index) => [String(index), level])
          ),
        },
      ];
    })
  );
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(
    JSON.stringify({
      model: body.model,
      answers,
      usage: { input_tokens: 10, output_tokens: 2 },
    })
  );
});
try {
  await new Promise((resolve, reject) => {
    provider.once('error', reject);
    provider.listen(0, '127.0.0.1', () => {
      provider.off('error', reject);
      resolve();
    });
  });
} catch (error) {
  await fs.rm(fixture, { recursive: true, force: true });
  throw error;
}

const isolated = hermeticEnv(process.env, 'selection-execution');
const baseEnv = {
  ...isolated,
  HOME: isolated.OCTOCODE_HOME,
  OCTOCODE_CLASSIFICATION_API: 'fixture-key',
  OCTOCODE_CLASSIFICATION_API_HOST: `http://127.0.0.1:${provider.address().port}`,
  OCTOCODE_CLASSIFICATION_MAX_CANDIDATES: '64',
  OCTOCODE_CLASSIFICATION_MAX_CHARS: '1048576',
  OCTOCODE_CLASSIFICATION_TIMEOUT_MS: '10000',
  OCTOCODE_OUTPUT_DEFAULT_CHAR_LENGTH: '20000',
  OCTOCODE_STORAGE_MODE: 'memory',
  OCTOCODE_LSP_PREWARM: 'off',
  MAX_RETRIES: '0',
  DISABLE_TOOLS: '',
  TOOLS_TO_RUN: '',
  WORKSPACE_ROOT: fixture,
  ALLOWED_PATHS: fixture,
};

async function cli(tool, query, env = baseEnv) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cliPath, tool, JSON.stringify({ queries: [query] }), '--json'],
      {
        cwd: fixture,
        env,
      }
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), 25000);
    child.on('error', reject);
    child.on('close', code => {
      clearTimeout(timer);
      try {
        assert.equal(code, 0, `${tool}: ${stderr.slice(0, 400)}`);
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`${error.message}; stdout: ${stdout.slice(0, 400)}`));
      }
    });
  });
}

async function mcp(env = baseEnv) {
  const client = new Client({ name: 'selection-execution', version: '1' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [mcpPath],
    cwd: fixture,
    env,
    stderr: 'pipe',
  });
  try {
    await client.connect(transport);
    return client;
  } catch (error) {
    await client.close().catch(() => {});
    await transport.close().catch(() => {});
    throw error;
  }
}

const callCli = (tool, query) => cli(tool, query);
const callMcp = client => async (tool, query) => {
  const response = await client.callTool({
    name: tool,
    arguments: { queries: [query] },
  });
  assert.equal(response.isError, false, JSON.stringify(response));
  return response.structuredContent;
};
function data(result) {
  assert.ok(result?.results?.[0], JSON.stringify(result));
  assert.notEqual(result.results[0].status, 'error', JSON.stringify(result));
  return result.results[0].data;
}
function evidence(tool, row) {
  return tool === 'localFetch'
    ? String(row.content ?? '')
        .split('\n')
        .filter(line => /^\d+\t/.test(line))
    : (row.files ?? []).flatMap(file =>
        (file.matches ?? []).map(
          match => `${file.path}:${match.line}:${match.value ?? ''}`
        )
      );
}
function receipt(tool, row) {
  const value = row.selection;
  assert.ok(value, `${tool}: selection receipt`);
  assert.ok(['complete', 'partial', 'unavailable'].includes(value.status));
  assert.equal(value.scope, 'selectedView');
  assert.equal(value.unit, tool === 'localFetch' ? 'chunks' : 'files');
  assert.equal(
    value.selectedItems + value.excludedItems + value.unknownItems,
    value.totalItems
  );
  return value;
}

const pageNames = ['continueWindow', 'nextPage', 'nextMatchPage'];
async function walk(call, tool, query, { selected = false } = {}) {
  const pending = [query];
  const seen = new Set();
  const rows = [];
  const responses = [];
  let providerCallsAfterFirst;
  while (pending.length) {
    assert.ok(seen.size < 40, `${tool}: bounded continuation`);
    const current = pending.shift();
    const key = JSON.stringify(current);
    assert.ok(!seen.has(key), `${tool}: continuation repeats`);
    seen.add(key);
    const row = data(await call(tool, current));
    responses.push(row);
    rows.push(...evidence(tool, row));
    if (selected) {
      receipt(tool, row);
      providerCallsAfterFirst ??= requests.length;
      assert.equal(
        requests.length,
        providerCallsAfterFirst,
        `${tool}: selected paging never re-scores`
      );
    }
    for (const name of pageNames) {
      const lead = row.next?.[name];
      if (!lead) continue;
      assert.equal(lead.tool, tool);
      assert.ok(Array.isArray(lead.query?.queries));
      if (selected) {
        for (const nextQuery of lead.query.queries) {
          assert.ok(
            nextQuery.mainGoal?.trim(),
            `${tool} ${name}: copied mainGoal`
          );
          assert.ok(
            nextQuery.reasoning?.trim(),
            `${tool} ${name}: copied reasoning`
          );
          assert.ok(
            nextQuery.clasifyContext?.classifiers?.length,
            `${tool} ${name}: copied clasifyContext`
          );
        }
      }
      pending.push(...lead.query.queries);
    }
  }
  return { first: responses[0], responses, rows, pages: seen.size };
}

async function recover(call, tool, selectedRun) {
  const lead = selectedRun.first.next?.unfiltered;
  assert.ok(lead, `${tool}: next.unfiltered`);
  assert.equal(lead.tool, tool);
  assert.ok(Array.isArray(lead.query?.queries));
  const before = requests.length;
  const runs = [];
  for (const query of lead.query.queries)
    runs.push(await walk(call, tool, query));
  assert.equal(
    requests.length,
    before,
    `${tool}: recovery performs no JEV work`
  );
  return {
    rows: runs.flatMap(run => run.rows),
    pages: runs.reduce((total, run) => total + run.pages, 0),
  };
}

const context = suffix => ({
  clasifyContext: {
    classifiers: [`${classifiers[0]}${suffix ? ` ${suffix}` : ''}`],
  },
  mainGoal: 'Explain cancellation behavior from current source evidence.',
  reasoning:
    'Select direct evidence and keep ambiguous evidence out of the default body.',
});
const cases = [
  [
    'localSearch',
    { path: searchPath, matchString: 'topic', pageSize: 1, matchPageSize: 100 },
    3,
  ],
  ['localFetch', { path: fetchPath, unit: 'lines', length: 40 }, lines.length],
];
const reports = [];
try {
  const client = await mcp();
  try {
    for (const [surface, call] of [
      ['CLI', callCli],
      ['MCP', callMcp(client)],
    ]) {
      for (const [tool, ordinaryQuery, ordinaryItems] of cases) {
        const beforeOrdinary = requests.length;
        const ordinary = await walk(call, tool, ordinaryQuery);
        assert.equal(
          ordinary.rows.length,
          ordinaryItems,
          `${surface} ${tool}: complete ordinary view`
        );
        assert.equal(
          requests.length,
          beforeOrdinary,
          `${surface} ${tool}: no context means no JEV work`
        );
        assert.equal(ordinary.first.selection, undefined);

        const beforeSelected = requests.length;
        const selectedRun = await walk(
          call,
          tool,
          { ...ordinaryQuery, ...context('') },
          { selected: true }
        );
        const selectedBody = selectedRun.rows.join('\n');
        assert.ok(
          selectedBody.includes(selectedMarker),
          `${surface} ${tool}: selected evidence returned`
        );
        assert.ok(
          !selectedBody.includes(unknownMarker),
          `${surface} ${tool}: unknown body hidden`
        );
        assert.ok(
          !selectedBody.includes(excludedMarker),
          `${surface} ${tool}: excluded body hidden`
        );
        const firstReceipt = receipt(tool, selectedRun.first);
        assert.ok(firstReceipt.selectedItems > 0);
        assert.ok(firstReceipt.excludedItems > 0);
        assert.ok(firstReceipt.unknownItems > 0);
        assert.ok(
          requests.length > beforeSelected,
          `${surface} ${tool}: scorer called`
        );

        const recovered = await recover(call, tool, selectedRun);
        assert.deepEqual(
          [...recovered.rows].sort(),
          [...ordinary.rows].sort(),
          `${surface} ${tool}: lossless unfiltered recovery`
        );
        reports.push({
          surface,
          tool,
          selectedPages: selectedRun.pages,
          recoveryPages: recovered.pages,
        });
      }
    }

    failure = true;
    for (const [surface, call] of [
      ['CLI', callCli],
      ['MCP', callMcp(client)],
    ]) {
      for (const [tool, ordinaryQuery] of cases) {
        const before = requests.length;
        const failed = await walk(
          call,
          tool,
          { ...ordinaryQuery, ...context('UNJUDGED_FAILURE_PROBE') },
          { selected: true }
        );
        const failedReceipt = receipt(tool, failed.first);
        assert.ok(['partial', 'unavailable'].includes(failedReceipt.status));
        assert.ok(failedReceipt.unknownItems > 0);
        assert.equal(
          failed.rows.length,
          0,
          `${surface} ${tool}: provider failure cannot fail open`
        );
        assert.ok(
          requests.length > before,
          `${surface} ${tool}: failed attempt is accounted`
        );
        failure = false;
        const ordinary = await walk(call, tool, ordinaryQuery);
        const recovered = await recover(call, tool, failed);
        assert.deepEqual(
          [...recovered.rows].sort(),
          [...ordinary.rows].sort(),
          `${surface} ${tool}: failure recovery is complete`
        );
        failure = true;
      }
    }
    failure = false;
  } finally {
    await client.close();
  }
} finally {
  await new Promise(resolve => provider.close(resolve));
  await fs.rm(fixture, { recursive: true, force: true });
  await fs.rm(isolated.OCTOCODE_HOME, { recursive: true, force: true });
}

console.log(`PASS selection execution: ${JSON.stringify(reports)}`);
