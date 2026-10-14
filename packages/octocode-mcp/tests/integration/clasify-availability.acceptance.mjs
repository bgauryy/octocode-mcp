/** Real CLI/MCP API and beta gates with isolated homes and a loopback provider. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = process.cwd();
const base = path.join(root, '.octocode/octocode-dev/clasify-availability');
await fs.mkdir(base, { recursive: true });
const fixture = await fs.mkdtemp(path.join(base, 'fixture-'));
const rankingTools = new Set([
  'localFetch',
  'localSearch',
  'ghGetFileContent',
  'ghSearchCode',
]);
const { clasifyContextTools } = JSON.parse(
  await fs.readFile(
    path.join(root, 'packages/octocode-config/contract/cli-presentation.json'),
    'utf8'
  )
);

function cliSchema(project, env, args) {
  const started = Date.now();
  const result = spawnSync(
    process.execPath,
    [path.join(root, 'packages/octocode/out/octocode.js'), 'schema', ...args],
    { env, cwd: project, encoding: 'utf8', timeout: 15000 }
  );
  assert.equal(
    result.status,
    0,
    `${args.join(' ')}: ${JSON.stringify({
      error: result.error?.code,
      signal: result.signal,
      elapsedMs: Date.now() - started,
      stderr: result.stderr,
    })}`
  );
  return JSON.parse(result.stdout);
}

function assertRankingFields(
  properties,
  required,
  expected,
  label,
  compact = false
) {
  for (const field of ['goals', 'ranking']) {
    // MCP omits continuation-only fields even when enabled; copied next.*
    // requests are still accepted by the native contract.
    assert.equal(
      Object.hasOwn(properties ?? {}, field),
      expected && !(compact && field === 'ranking'),
      `${label}: ${field}`
    );
    assert.ok(!required?.includes(field), `${label}: ${field} is optional`);
  }
}

function resourceTools(value) {
  if (Array.isArray(value)) return value.flatMap(resourceTools);
  if (!value || typeof value !== 'object') return [];
  return [
    ...(value.properties?.tool?.enum ?? []),
    ...Object.values(value).flatMap(resourceTools),
  ];
}

function assertAvailableExamples(value, allowed, label) {
  if (!value || typeof value !== 'object') return;
  const examples = [
    ...(value.examples ?? []),
    ...(value.example ? [value.example] : []),
  ];
  for (const example of examples) {
    for (const resource of example.resources ?? []) {
      if (resource.tool)
        assert.ok(
          allowed.includes(resource.tool),
          `${label}: unavailable example delegate ${resource.tool}`
        );
    }
  }
  for (const child of Object.values(value))
    assertAvailableExamples(child, allowed, label);
}
const request = {
  queries: [
    {
      mainGoal: 'Confirm the clasify credential gate.',
      reasoning: 'Check disabled capability without provider access.',
      resources: [{ value: 'fixture' }],
      questions: [{ type: 'yesno', ask: 'Is this a fixture?' }],
    },
  ],
};
const credentialCases = [
  {
    name: 'workspace-blank-falls-back',
    homeEnv: 'OCTOCODE_CLASSIFICATION_API=fixture-home\n',
    projectEnv: 'OCTOCODE_CLASSIFICATION_API=   \n',
    enabled: true,
  },
  {
    name: 'workspace-disables-home-key',
    homeEnv: 'OCTOCODE_CLASSIFICATION_API=fixture-home\n',
    projectEnv: 'DISABLE_TOOLS=clasify\n',
    enabled: false,
  },
  {
    name: 'home-local-off',
    homeEnv: 'OCTOCODE_ENABLE_LOCAL=false\n',
    enabled: false,
    localEnabled: false,
  },
  {
    name: 'workspace-local-overrides-home',
    homeEnv: 'OCTOCODE_ENABLE_LOCAL=false\n',
    projectEnv: 'OCTOCODE_ENABLE_LOCAL=true\n',
    enabled: false,
    localEnabled: true,
  },
  {
    name: 'process-local-overrides-workspace',
    env: { OCTOCODE_ENABLE_LOCAL: 'false' },
    homeEnv: 'OCTOCODE_ENABLE_LOCAL=false\n',
    projectEnv: 'OCTOCODE_ENABLE_LOCAL=true\n',
    enabled: false,
    localEnabled: false,
  },

  { name: 'absent', enabled: false },
  {
    name: 'allowlist-without-key',
    config: { tools: { enabled: ['clasify', 'localFetch'] } },
    enabled: false,
  },
  {
    name: 'disabled-with-key',
    env: { OCTOCODE_CLASSIFICATION_API: 'fixture-key' },
    config: { tools: { disabled: ['clasify'] } },
    enabled: false,
  },
  { name: 'empty', env: { OCTOCODE_CLASSIFICATION_API: '' }, enabled: false },
  {
    name: 'whitespace',
    env: { OCTOCODE_CLASSIFICATION_API: '   ' },
    enabled: false,
  },
  {
    name: 'process-key',
    env: { OCTOCODE_CLASSIFICATION_API: 'fixture-key' },
    enabled: true,
  },
  {
    name: 'home-env-key',
    homeEnv: 'OCTOCODE_CLASSIFICATION_API=fixture-key\n',
    enabled: true,
  },
  {
    name: 'home-env-empty',
    homeEnv: 'OCTOCODE_CLASSIFICATION_API=\n',
    enabled: false,
  },
  {
    name: 'retired-jev-alias',
    homeEnv: 'OCTOCODE_JEV_KEY=fixture-key\n',
    enabled: false,
  },
  {
    name: 'project-key-only',
    projectEnv: 'OCTOCODE_CLASSIFICATION_API=fixture-key\n',
    enabled: true,
  },
  {
    name: 'config-key',
    config: { classification: { api: 'fixture-key' } },
    enabled: true,
  },
  {
    name: 'empty-overrides-fallbacks',
    env: { OCTOCODE_CLASSIFICATION_API: '' },
    homeEnv: 'OCTOCODE_CLASSIFICATION_API=fixture-home\n',
    config: { classification: { api: 'fixture-config' } },
    enabled: false,
  },
  {
    name: 'whitespace-overrides-fallbacks',
    env: { OCTOCODE_CLASSIFICATION_API: '  ' },
    homeEnv: 'OCTOCODE_CLASSIFICATION_API=fixture-home\n',
    config: { classification: { api: 'fixture-config' } },
    enabled: false,
  },
];
const cases = [
  // Hold beta on while testing credential precedence so it cannot mask a key failure.
  ...credentialCases.map(row => ({
    ...row,
    env: { OCTOCODE_BETA: 'true', ...row.env },
  })),
  ...[undefined, 'false', 'true'].flatMap(beta =>
    [undefined, '', '   ', 'fixture-key'].flatMap(api =>
      [false, true].map(ranking => ({
        name: `beta-${beta ?? 'absent'}-api-${api === undefined ? 'absent' : api.trim() ? 'present' : api ? 'whitespace' : 'empty'}-ranking-${ranking}`,
        env: {
          ...(beta === undefined ? {} : { OCTOCODE_BETA: beta }),
          ...(api === undefined ? {} : { OCTOCODE_CLASSIFICATION_API: api }),
          OCTOCODE_RANKING_ENABLED: String(ranking),
        },
        enabled: beta === 'true' && Boolean(api?.trim()),
        goals: ranking && Boolean(api?.trim()),
      }))
    )
  ),
  {
    name: 'home-config-beta-and-key',
    config: { local: { beta: true }, classification: { api: 'fixture-key' } },
    enabled: true,
  },
  {
    name: 'home-env-beta-and-key',
    homeEnv: 'OCTOCODE_BETA=true\nOCTOCODE_CLASSIFICATION_API=fixture-key\n',
    enabled: true,
  },
  {
    name: 'process-beta-off-overrides-home',
    env: { OCTOCODE_BETA: 'false' },
    config: { local: { beta: true }, classification: { api: 'fixture-key' } },
    enabled: false,
  },
  {
    name: 'workspace-cannot-enable-beta',
    projectEnv: 'OCTOCODE_BETA=true\nOCTOCODE_CLASSIFICATION_API=fixture-key\n',
    enabled: false,
  },
  {
    name: 'allowlist-cannot-enable-beta',
    env: { OCTOCODE_CLASSIFICATION_API: 'fixture-key' },
    config: { tools: { enabled: ['clasify', 'ghSearchCode'] } },
    enabled: false,
  },
  {
    name: 'home-config-ranking-without-beta',
    config: {
      ranking: { enabled: true },
      classification: { api: 'fixture-key' },
    },
    enabled: false,
    goals: true,
  },
  {
    name: 'hidden-clasify-retains-goals',
    env: {
      OCTOCODE_BETA: 'true',
      OCTOCODE_RANKING_ENABLED: 'true',
      OCTOCODE_CLASSIFICATION_API: 'fixture-key',
      DISABLE_TOOLS: 'clasify',
    },
    enabled: false,
    goals: true,
  },
  {
    name: 'workspace-cannot-enable-ranking',
    env: { OCTOCODE_CLASSIFICATION_API: 'fixture-key' },
    projectEnv: 'OCTOCODE_RANKING_ENABLED=true\n',
    enabled: false,
    goals: false,
  },
  {
    name: 'workspace-can-disable-ranking',
    config: {
      ranking: { enabled: true },
      classification: { api: 'fixture-key' },
    },
    projectEnv: 'OCTOCODE_RANKING_ENABLED=false\n',
    enabled: false,
    goals: false,
  },
  {
    name: 'process-empty-disables-home-ranking',
    config: {
      ranking: { enabled: true },
      classification: { api: 'fixture-key' },
    },
    env: { OCTOCODE_CLASSIFICATION_API: '' },
    enabled: false,
    goals: false,
  },
  {
    name: 'process-whitespace-disables-home-ranking',
    config: {
      ranking: { enabled: true },
      classification: { api: 'fixture-key' },
    },
    env: { OCTOCODE_CLASSIFICATION_API: '   ' },
    enabled: false,
    goals: false,
  },
  ...[
    ['clasify'],
    ['clasify', 'localFetch'],
    ['clasify', 'ghGetFileContent'],
  ].map(allowed => ({
    name: `clasify-delegates-${allowed.join('-')}`,
    config: { tools: { enabled: allowed } },
    env: { OCTOCODE_BETA: 'true', OCTOCODE_CLASSIFICATION_API: 'fixture-key' },
    enabled: true,
  })),
];
let providerCalls = 0;
let providerAvailable = true;
const provider = http.createServer(async (req, res) => {
  providerCalls++;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString());
  assert.ok(body.state, 'provider receives only real semantic requests');
  if (!providerAvailable) {
    res.statusCode = 401;
    res.end();
    return;
  }
  res.setHeader('content-type', 'application/json');
  res.end(
    JSON.stringify({
      model: body.model,
      answers: Object.fromEntries(
        Object.keys(body.questions).map(id => [id, { type: 'noul', noul: 1 }])
      ),
      usage: { input_tokens: 1, output_tokens: 1 },
    })
  );
});
await new Promise((resolve, reject) => {
  provider.once('error', reject);
  provider.listen(0, '127.0.0.1', resolve);
});
const results = [];
try {
  for (const row of cases) {
    const home = path.join(fixture, row.name, 'home');
    const project = path.join(fixture, row.name, 'project');
    await fs.mkdir(home, { recursive: true });
    await fs.mkdir(path.join(project, '.octocode'), { recursive: true });
    if (row.homeEnv) await fs.writeFile(path.join(home, '.env'), row.homeEnv);
    if (row.projectEnv)
      await fs.writeFile(path.join(project, '.octocode/.env'), row.projectEnv);
    if (row.config)
      await fs.writeFile(
        path.join(home, '.octocoderc'),
        JSON.stringify(row.config)
      );
    const env = {
      PATH: process.env.PATH ?? '',
      HOME: path.join(fixture, row.name),
      OCTOCODE_HOME: home,
      OCTOCODE_CLASSIFICATION_API_HOST: `http://127.0.0.1:${provider.address().port}`,
      ...row.env,
    };
    const client = new Client({ name: 'clasify-availability', version: '1' });
    let stderr = '';
    try {
      const beforeCalls = providerCalls;
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [path.join(root, 'packages/octocode-mcp/dist/index.js')],
        cwd: project,
        env,
        stderr: 'pipe',
      });
      transport.stderr?.on('data', chunk => {
        stderr += chunk;
      });
      await client.connect(transport);
      const catalog = await client.listTools();
      for (const tool of catalog.tools) {
        const queries = tool.inputSchema.properties?.queries;
        assert.equal(
          queries?.minItems,
          1,
          `${tool.name}: nonempty query batch`
        );
        assert.match(queries?.description ?? '', /even one query/, tool.name);
        assertRankingFields(
          queries?.items?.properties,
          queries?.items?.required,
          rankingTools.has(tool.name) && (row.goals ?? false),
          `${row.name}: MCP ${tool.name}`,
          true
        );
      }
      assert.equal(
        providerCalls - beforeCalls,
        0,
        `${row.name}: discovery does not contact the provider`
      );
      const cliCatalog = cliSchema(project, env, []);
      assert.equal(
        cliCatalog.tools.some(t => t.name === 'clasify'),
        row.enabled,
        row.name
      );
      if (!row.goals) {
        assert.ok(
          cliCatalog.tools.every(t => !/\b(goals|ranking)\??\b/.test(t.fields)),
          `${row.name}: disabled fields absent from CLI catalog`
        );
      }
      for (const tool of rankingTools) {
        for (const view of ['query', 'full']) {
          const schema = cliSchema(project, env, [tool, '--view', view]);
          assertRankingFields(
            { ...schema.querySchema?.properties, ...schema.continuationFields },
            schema.querySchema?.required,
            row.goals ?? false,
            `${row.name}: CLI ${tool} ${view}`
          );
          assert.ok(
            !schema.moreFields?.some(field =>
              ['goals', 'ranking'].includes(field)
            ),
            `${row.name}: ranking controls are exposed or omitted, never hidden in moreFields`
          );
        }
      }
      if (row.localEnabled !== undefined)
        assert.equal(
          catalog.tools.some(t => t.name === 'localFetch'),
          row.localEnabled,
          row.name
        );
      const schema = cliSchema(project, env, ['clasify']);
      assert.equal(
        schema.availability.enabled,
        row.enabled,
        `${row.name}: CLI discovery`
      );
      assert.equal(
        catalog.tools.some(t => t.name === 'clasify'),
        row.enabled,
        row.name
      );
      if (row.enabled) {
        const mcpClasify = catalog.tools.find(tool => tool.name === 'clasify');
        const resources =
          mcpClasify.inputSchema.properties.queries.items.properties.resources;
        const compact = cliSchema(project, env, ['clasify', '--view', 'query']);
        const expectedCli = clasifyContextTools.filter(name =>
          cliCatalog.tools.some(t => t.name === name)
        );
        const expectedMcp = clasifyContextTools.filter(name =>
          catalog.tools.some(t => t.name === name)
        );
        assert.deepEqual(
          resourceTools(resources),
          expectedMcp,
          `${row.name}: MCP advertises only available delegates`
        );
        assert.deepEqual(
          resourceTools(compact.querySchema),
          expectedCli,
          `${row.name}: CLI query view advertises only available delegates`
        );
        assert.deepEqual(
          resourceTools(schema.querySchema),
          expectedCli,
          `${row.name}: CLI full view advertises only available delegates`
        );
        if (JSON.stringify(expectedCli) === JSON.stringify(expectedMcp)) {
          assert.deepEqual(
            compact.querySchema.properties.resources,
            resources,
            `${row.name}: same enabled delegates produce the same CLI/MCP resource schema`
          );
        }
        const variants = cliSchema(project, env, [
          'clasify',
          '--view',
          'variants',
        ]);
        for (const view of [schema, compact, variants])
          assertAvailableExamples(view, expectedCli, row.name);
      }
      if (!row.enabled) {
        // Shared guidance refers callers to the exposed controls.
        assert.ok(
          (client.getInstructions() ?? '').includes(
            '<clasify>Use exposed controls. '
          ),
          `${row.name}: exposed-control requirement in instructions`
        );
        assert.ok(
          catalog.tools.every(t => !/\bclasify\b/i.test(t.description ?? '')),
          `${row.name}: disabled tool in descriptions`
        );
        await assert.rejects(
          client.callTool({ name: 'clasify', arguments: request }),
          /Tool clasify not found/,
          `${row.name}: direct MCP call must fail`
        );
        const cli = spawnSync(
          process.execPath,
          [
            path.join(root, 'packages/octocode/out/octocode.js'),
            'clasify',
            JSON.stringify(request),
          ],
          { env, cwd: project, encoding: 'utf8', timeout: 15000 }
        );
        assert.notEqual(
          cli.status,
          0,
          `${row.name}: direct CLI call must fail`
        );
        assert.match(
          cli.stdout + cli.stderr,
          /OCTOCODE_CLASSIFICATION_API|OCTOCODE_BETA|classification.*(disabled|unavailable)|not available|disabled/i,
          `${row.name}: actionable CLI error`
        );
      }
      assert.equal(
        providerCalls - beforeCalls,
        0,
        `${row.name}: discovery and rejected calls add no provider work`
      );
      results.push({
        name: row.name,
        enabled: row.enabled,
        goals: row.goals ?? false,
        passed: true,
      });
    } catch (error) {
      throw new Error(`${row.name}: ${error.message}\n${stderr}`, {
        cause: error,
      });
    } finally {
      await client.close();
    }
  }

  // A persistent MCP process must keep the public tool callable while the
  // provider rejects a request, then use it after the same account recovers.
  const home = path.join(fixture, 'provider-recovery', 'home');
  const project = path.join(fixture, 'provider-recovery', 'project');
  await fs.mkdir(home, { recursive: true });
  await fs.mkdir(project, { recursive: true });
  const env = {
    PATH: process.env.PATH ?? '',
    HOME: path.join(fixture, 'provider-recovery'),
    OCTOCODE_HOME: home,
    OCTOCODE_BETA: 'true',
    OCTOCODE_CLASSIFICATION_API: 'fixture-key',
    OCTOCODE_CLASSIFICATION_API_HOST: `http://127.0.0.1:${provider.address().port}`,
  };
  const client = new Client({ name: 'clasify-recovery', version: '1' });
  try {
    const beforeCalls = providerCalls;
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [path.join(root, 'packages/octocode-mcp/dist/index.js')],
        cwd: project,
        env,
        stderr: 'pipe',
      })
    );
    assert.ok((await client.listTools()).tools.some(t => t.name === 'clasify'));
    assert.equal(
      providerCalls,
      beforeCalls,
      'startup sends no provider request'
    );
    providerAvailable = false;
    const failed = await client.callTool({
      name: 'clasify',
      arguments: request,
    });
    assert.equal(failed.isError, true);
    assert.match(JSON.stringify(failed), /classificationProviderError/);
    providerAvailable = true;
    const recovered = await client.callTool({
      name: 'clasify',
      arguments: request,
    });
    assert.equal(recovered.isError, false, JSON.stringify(recovered));
    assert.equal(providerCalls - beforeCalls, 2, 'one request per real call');
    results.push({ name: 'provider-recovery', enabled: true, passed: true });
  } finally {
    await client.close();
  }
} finally {
  await new Promise(resolve => provider.close(resolve));
  await fs.writeFile(
    path.join(base, 'results.json'),
    JSON.stringify(results, null, 2) + '\n'
  );
  await fs.rm(fixture, { recursive: true, force: true });
}
console.log(
  `PASS ${results.length} isolated CLI/MCP API, beta and recovery scenarios`
);
