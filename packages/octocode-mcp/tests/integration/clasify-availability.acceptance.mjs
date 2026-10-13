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
await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
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
      const catalog = await client.listTools();
      for (const tool of catalog.tools) {
        const queries = tool.inputSchema.properties?.queries;
        assert.equal(queries?.minItems, 1, `${tool.name}: nonempty query batch`);
        assert.match(queries?.description ?? '', /even one query/, tool.name);
        const supportsGoals = [
          'localFetch', 'localSearch', 'ghGetFileContent', 'ghSearchCode',
        ].includes(tool.name);
        assert.equal(
          Boolean(queries?.items?.properties?.goals),
          supportsGoals && (row.goals ?? false),
          `${row.name}: ${tool.name} goals scope`
        );
      }
      assert.equal(
        providerCalls - beforeCalls,
        0,
        `${row.name}: discovery does not contact the provider`
      );
      const codeSearch = catalog.tools.find(t => t.name === 'ghSearchCode');
      const mcpGoals =
        codeSearch?.inputSchema.properties?.queries?.items?.properties?.goals;
      assert.equal(
        Boolean(mcpGoals),
        row.goals ?? false,
        `${row.name}: MCP goals require API and ranking opt-in`
      );
      const readSchema = spawnSync(
        process.execPath,
        [
          path.join(root, 'packages/octocode/out/octocode.js'),
          'schema',
          'ghSearchCode',
          '--view',
          'full',
        ],
        { env, cwd: project, encoding: 'utf8', timeout: 15000 }
      );
      assert.equal(readSchema.status, 0, row.name);
      assert.equal(
        Boolean(JSON.parse(readSchema.stdout).querySchema?.properties?.goals),
        row.goals ?? false,
        `${row.name}: CLI goals require API and ranking opt-in`
      );
      if (row.localEnabled !== undefined)
        assert.equal(
          catalog.tools.some(t => t.name === 'localFetch'),
          row.localEnabled,
          row.name
        );
      const schema = spawnSync(
        process.execPath,
        [
          path.join(root, 'packages/octocode/out/octocode.js'),
          'schema',
          'clasify',
        ],
        { env, cwd: project, encoding: 'utf8', timeout: 15000 }
      );
      assert.equal(schema.status, 0, row.name);
      assert.equal(
        JSON.parse(schema.stdout).availability.enabled,
        row.enabled,
        `${row.name}: CLI discovery`
      );
      assert.equal(
        catalog.tools.some(t => t.name === 'clasify'),
        row.enabled,
        row.name
      );
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
  `PASS ${results.length}/${cases.length} isolated CLI/MCP API and beta scenarios`
);
