/** Built CLI and fresh MCP ranking execution against a hermetic loopback scorer. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { hermeticEnv } from '../../../../test-utils/hermetic-env.ts';

const root = process.cwd();
const cliPath = path.join(root, 'packages/octocode/out/octocode.js');
const mcpPath = path.join(root, 'packages/octocode-mcp/dist/index.js');
const fixture = await fs.mkdtemp(
  path.join(os.tmpdir(), 'octocode-ranking-execution-')
);
const marker = 'SEMANTIC_TARGET_EVIDENCE';
const goals = [
  'Find evidence that a queued request is cancelled before work starts',
];
const searchPath = path.join(fixture, 'search');
const fetchPath = path.join(fixture, 'document.txt');
await fs.mkdir(searchPath);
for (let index = 0; index < 3; index++) {
  await fs.writeFile(
    path.join(searchPath, `${index}.txt`),
    `topic: ${index === 2 ? `${marker} A queued request is cancelled before work starts.` : `background record ${index}`}\n`
  );
}
const lines = Array.from(
  { length: 1200 },
  (_, index) => `line ${index + 1}: ordinary context`
);
lines[900] = `${marker} A queued request is cancelled before work starts.`;
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
  const relevant = JSON.stringify(body.state).includes(marker);
  const answers = Object.fromEntries(
    Object.entries(body.questions).map(([id, question]) => {
      if (question.type === 'noul')
        return [id, { type: 'noul', noul: relevant ? 0.99 : 0.01 }];
      assert.equal(question.type, 'score');
      const score = relevant ? question.criteria.length - 1 : 0;
      return [
        id,
        {
          type: 'score',
          score,
          confidence: 1,
          probabilities: Object.fromEntries(
            question.criteria.map((_, index) => [
              String(index),
              Number(index === score),
            ])
          ),
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

const isolated = hermeticEnv(process.env, 'ranking-execution');
const baseEnv = {
  ...isolated,
  HOME: isolated.OCTOCODE_HOME,
  OCTOCODE_CLASSIFICATION_API: 'fixture-key',
  OCTOCODE_CLASSIFICATION_API_HOST: `http://127.0.0.1:${provider.address().port}`,
  OCTOCODE_RANKING_ENABLED: 'true',
  OCTOCODE_BETA: 'false',
  OCTOCODE_RANKING_MAX_CANDIDATES: '64',
  OCTOCODE_RANKING_MAX_CHARS: '1048576',
  OCTOCODE_RANKING_TIMEOUT_MS: '10000',
  OCTOCODE_OUTPUT_DEFAULT_CHAR_LENGTH: '20000',
  OCTOCODE_STORAGE_MODE: 'memory',
  OCTOCODE_LSP_PREWARM: 'false',
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

async function mcp(env) {
  const client = new Client({ name: 'ranking-execution', version: '1' });
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

const callCli = (tool, query, env) => cli(tool, query, env);
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
async function walk(call, tool, query, ranked) {
  const pending = [query];
  const seen = new Set();
  const rows = [];
  let first;
  let providerCallsAfterFirst;
  while (pending.length) {
    assert.ok(seen.size < 16, `${tool}: bounded continuation`);
    const current = pending.shift();
    const key = JSON.stringify(current);
    assert.ok(!seen.has(key), `${tool}: continuation repeats`);
    seen.add(key);
    const row = data(await call(tool, current));
    first ??= row;
    rows.push(...evidence(tool, row));
    if (ranked) {
      providerCallsAfterFirst ??= requests.length;
      assert.equal(
        requests.length,
        providerCallsAfterFirst,
        `${tool}: continuation never re-scores`
      );
    }
    for (const name of ['continueWindow', 'nextPage', 'nextMatchPage']) {
      const lead = row.next?.[name];
      if (lead) {
        assert.equal(lead.tool, tool);
        assert.ok(Array.isArray(lead.query?.queries));
        pending.push(...lead.query.queries);
      }
    }
  }
  return { first, rows, pages: seen.size };
}

const cases = [
  [
    'localSearch',
    {
      path: searchPath,
      matchString: 'topic',
      goals,
      pageSize: 1,
      matchPageSize: 100,
    },
  ],
  ['localFetch', { path: fetchPath, goals, unit: 'lines', length: 80 }],
];
const reports = [];
try {
  const enabled = await mcp(baseEnv);
  try {
    assert.ok(
      !(await enabled.listTools()).tools.some(tool => tool.name === 'clasify'),
      'beta off hides public clasify'
    );
    for (const [surface, call] of [
      ['CLI', callCli],
      ['MCP', callMcp(enabled)],
    ]) {
      for (const [tool, query] of cases) {
        const disabled = async (name, input) =>
          cli(name, input, { ...baseEnv, OCTOCODE_RANKING_ENABLED: 'false' });
        const baseline = await walk(disabled, tool, query, false);
        assert.equal(
          baseline.rows.length,
          tool === 'localFetch' ? lines.length : 3,
          `${surface} ${tool}: baseline covers the entire fixture`
        );
        assert.ok(
          !evidence(tool, baseline.first).some(item => item.includes(marker)),
          `${surface} ${tool}: target starts beyond the first unranked page`
        );
        const before = requests.length;
        const ranked = await walk(call, tool, query, true);
        assert.equal(
          ranked.first.ranking?.status,
          'ranked',
          `${surface} ${tool}: ${JSON.stringify(ranked.first.ranking)}`
        );
        assert.ok(
          evidence(tool, ranked.first).some(item => item.includes(marker)),
          `${surface} ${tool}: target promoted`
        );
        assert.ok(
          requests.length > before,
          `${surface} ${tool}: real scorer called`
        );
        assert.deepEqual(
          [...ranked.rows].sort(),
          [...baseline.rows].sort(),
          `${surface} ${tool}: all evidence retained`
        );
        assert.equal(
          new Set(ranked.rows).size,
          ranked.rows.length,
          `${surface} ${tool}: evidence not repeated`
        );
        reports.push({
          surface,
          tool,
          pages: ranked.pages,
          providerCalls: requests.length - before,
        });
      }
    }

    for (const [label, overrides] of [
      ['absent-api', { OCTOCODE_CLASSIFICATION_API: undefined }],
      ['blank-api', { OCTOCODE_CLASSIFICATION_API: '   ' }],
      ['ranking-off', { OCTOCODE_RANKING_ENABLED: 'false' }],
    ]) {
      const env = { ...baseEnv, ...overrides };
      const before = requests.length;
      for (const [tool, query] of cases) {
        const row = data(await cli(tool, query, env));
        assert.equal(row.ranking?.status, 'skipped', `${label} ${tool}`);
      }
      const client = await mcp(env);
      try {
        const catalog = await client.listTools();
        for (const [tool, query] of cases) {
          const schema = catalog.tools.find(item => item.name === tool)
            ?.inputSchema.properties?.queries?.items;
          assert.equal(
            schema?.properties?.goals,
            undefined,
            `${label} ${tool}: goals hidden`
          );
          const response = await client.callTool({
            name: tool,
            arguments: { queries: [query] },
          });
          assert.equal(
            response.isError,
            false,
            `${label} ${tool}: MCP remains healthy`
          );
          assert.equal(
            data(response.structuredContent).ranking?.status,
            'skipped',
            `${label} ${tool}: unadvertised goals cannot score`
          );
        }
      } finally {
        await client.close();
      }
      assert.equal(requests.length, before, `${label}: no scorer request`);
      reports.push({ gate: label, providerCalls: 0 });
    }

    for (const [tool, query] of [
      ['localSearch', { path: searchPath, matchString: marker }],
      ['localFetch', { path: fetchPath, fullContent: true }],
    ]) {
      const before = requests.length;
      assert.equal(
        data(await cli(tool, query)).ranking,
        undefined,
        `${tool}: exact/no-goal path`
      );
      assert.equal(
        data(await callMcp(enabled)(tool, query)).ranking,
        undefined,
        `${tool}: MCP no-goal path`
      );
      assert.equal(
        requests.length,
        before,
        `${tool}: no-goal path uses no scorer`
      );
    }
    for (const [tool, query] of [
      ['localSearch', { ...cases[0][1], sort: 'path' }],
      ['localFetch', { path: fetchPath, goals, fullContent: true }],
    ]) {
      const before = requests.length;
      for (const [surface, result] of [
        ['CLI', await cli(tool, query)],
        ['MCP', await callMcp(enabled)(tool, query)],
      ]) {
        assert.equal(
          data(result).ranking?.status,
          'skipped',
          `${surface} ${tool}: exhaustive/explicit route`
        );
      }
      assert.equal(
        requests.length,
        before,
        `${tool}: useful skip avoids scorer`
      );
    }

    failure = true;
    for (const [tool, query] of cases) {
      const baseline = data(
        await cli(tool, query, {
          ...baseEnv,
          OCTOCODE_RANKING_ENABLED: 'false',
        })
      );
      const before = requests.length;
      const row = data(await callMcp(enabled)(tool, query));
      assert.equal(
        row.ranking?.status,
        'fallback',
        `${tool}: scorer failure fails open`
      );
      assert.deepEqual(evidence(tool, row), evidence(tool, baseline));
      assert.ok(
        requests.length > before,
        `${tool}: failed scorer attempt retained`
      );
    }
    failure = false;
  } finally {
    await enabled.close();
  }
} finally {
  await new Promise(resolve => provider.close(resolve));
  await fs.rm(fixture, { recursive: true, force: true });
  await fs.rm(isolated.OCTOCODE_HOME, { recursive: true, force: true });
}
console.log(`PASS ranking execution: ${JSON.stringify(reports)}`);
