/** Real built-server acceptance. Run after building CLI + MCP; no mocks or installs. */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createLocalAcceptanceFixture } from './local-acceptance-fixture.mjs';

const { values } = parseArgs({
  options: {
    server: { type: 'string', default: 'packages/octocode-mcp/dist/index.js' },
    cli: { type: 'string', default: 'packages/octocode/out/octocode.js' },
    cwd: { type: 'string', default: process.cwd() },
    node: { type: 'string', default: process.execPath },
    fixture: { type: 'string' },
    receipt: {
      type: 'string',
      default: '.octocode/octocode-research/preproduction-mcp-receipt.json',
    },
    quick: { type: 'boolean', default: false },
    live: { type: 'boolean', default: false },
    'cli-mcp-parity': { type: 'boolean', default: false },
  },
});
const acceptanceCwd = path.resolve(values.cwd);
// Discovery honors .gitignore. The fixture must be a normal workspace subtree,
// not under .octocode/tmp (ignored by this repository).
const fixture = values.fixture
  ? path.resolve(values.fixture)
  : await createLocalAcceptanceFixture(acceptanceCwd);
const acceptanceEnv = {
  ...process.env,
  OCTOCODE_ENABLE_LOCAL: 'true',
  OCTOCODE_BETA: 'true',
  OCTOCODE_STORAGE_MODE: 'persistent',
};
const {
  DIRECT_TOOL_DEFINITIONS,
  TOOL_NAMES,
  continuationChannel,
  getDirectToolDefinitionsWithAddons,
  getPublicToolCatalogWithAddons,
  isCliOnlyTool,
} = await import('@octocodeai/config/schema');
const { publishedInputSchema } = await import('@octocodeai/config/mcp');
const canonicalTools = DIRECT_TOOL_DEFINITIONS.map(tool => tool.name);
// CLI-only tools run only from the CLI; MCP never lists or executes them.
let expectedTools = [];
const receipt = {
  server: path.resolve(values.server),
  node: values.node,
  fixture,
  checks: [],
  calls: [],
  transportErrors: [],
  stderrBytes: 0,
  stderrTail: '',
  guidance: {
    recoveryHints: 0,
    maxHintChars: 0,
    continuations: 0,
    validationErrors: 0,
  },
};
const cliMcpParitySamples = new Map();
const cliCalls = [];
const suiteStartedAt = performance.now();
const transport = new StdioClientTransport({
  command: values.node,
  args: [path.resolve(values.server)],
  cwd: acceptanceCwd,
  env: acceptanceEnv,
  stderr: 'pipe',
});
const client = new Client({
  name: 'octocode-stdio-acceptance',
  version: '1.0.0',
});
client.onerror = error => receipt.transportErrors.push(error.name);
const check = async (name, fn) => {
  try {
    await fn();
    receipt.checks.push({ name, status: 'passed' });
  } catch (error) {
    receipt.checks.push({ name, status: 'failed', error: error.message });
  }
};
// Briefs (`mainGoal`, `reasoning`) are optional, so fixtures send only what
// they exercise: a call without a brief is the common, single-lookup shape.
const invoke = async (name, args) => {
  const startedAt = performance.now();
  const response = await client.callTool({ name, arguments: args });
  const durationMs = Number((performance.now() - startedAt).toFixed(2));
  const responseBytes = Buffer.byteLength(JSON.stringify(response));
  receipt.calls.push({
    name,
    arguments: args,
    durationMs,
    responseBytes,
    response,
  });
  // Output channels: `next` holds pages only; `hints` holds prose `text`
  // (recovery rows only) and lead calls. Each entry is a runnable call.
  const runnable = (kind, call) => {
    assert.ok(
      ![
        'fetch',
        'getLines',
        'readSite',
        'viewTree',
        'viewStructure',
        'cloneRepo',
        'searchRepositoryCode',
        'lspDefinition',
        'lspReferences',
      ].includes(kind),
      `${name}: unsolicited ${kind}`
    );
    assert.ok(
      expectedTools.includes(call?.tool),
      `${name}: continuation ${kind} has no runnable tool`
    );
    assert.ok(
      call?.query && typeof call.query === 'object',
      `${name}: continuation ${kind} has no executable query`
    );
    receipt.guidance.continuations += 1;
  };
  for (const row of response.structuredContent?.results ?? []) {
    const recovery = row.status === 'empty' || row.status === 'error';
    let hintCount = 0;
    const inspect = value => {
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        if (
          [
            'query',
            'content',
            'body',
            'patch',
            'text',
            'value',
            'matches',
          ].includes(key)
        )
          continue;
        if (key === 'hints') {
          assert.ok(
            child && typeof child === 'object' && !Array.isArray(child),
            `${name}: hints is not an object`
          );
          const { text = [], ...leads } = child;
          assert.ok(Array.isArray(text), `${name}: hints.text is not a list`);
          if (text.length)
            assert.ok(recovery, `${name}: hints.text on a successful result`);
          hintCount += text.length;
          assert.ok(
            text.every(hint => hint.length <= 160),
            `${name}: long hint`
          );
          receipt.guidance.recoveryHints += text.length;
          receipt.guidance.maxHintChars = Math.max(
            receipt.guidance.maxHintChars,
            ...text.map(hint => hint.length)
          );
          for (const [kind, call] of Object.entries(leads)) {
            assert.equal(
              continuationChannel(name, kind),
              'lead',
              `${name}: hints.${kind} is a page`
            );
            runnable(kind, call);
            if (!recovery)
              assert.equal(
                call.why,
                undefined,
                `${name}: success continuation prose`
              );
          }
        }
        if (key === 'next') {
          for (const [kind, call] of Object.entries(child)) {
            assert.equal(
              continuationChannel(name, kind),
              'page',
              `${name}: next.${kind} is a lead`
            );
            runnable(kind, call);
            if (!recovery)
              assert.equal(
                call.why,
                undefined,
                `${name}: success continuation prose`
              );
          }
        }
        if (key !== 'hints' && key !== 'next') inspect(child);
      }
    };
    inspect(row);
    assert.ok(hintCount <= 2, `${name}: too many recovery hints`);
  }
  return response;
};
const call = async (name, query) => {
  const response = await invoke(name, { queries: [query] });
  assert.equal(response.isError, false, `${name} returned a tool error`);
  assert.ok(response.structuredContent, `${name} has no structured content`);
  assert.ok(
    response.content.some(block => block.type === 'text' && block.text.length),
    `${name} has no text representation`
  );
  const row = response.structuredContent.results?.[0];
  assert.ok(row?.data, `${name} has no result data`);
  assert.notEqual(row.status, 'error', `${name} result failed`);
  assert.equal(row.data.error, undefined, `${name} returned an error payload`);
  return row.data;
};
/**
 * structureSearch `files` rows as paths: bare entries are the row `path`'s
 * own, group `dir`s are relative to it (root/dir/name).
 */
const listedPaths = (files, root) => {
  const join = (...parts) => parts.filter(Boolean).join('/');
  const name = entry =>
    (/^(.*) \([^()]*\)$/.exec(entry)?.[1] ?? entry).replace(/\/$/, '');
  const at = (dir, entry) =>
    name(entry) === '.' ? join(root, dir) : join(root, dir, name(entry));
  return files.flatMap(group =>
    typeof group === 'string'
      ? [at('', group)]
      : group.files.map(entry => at(group.dir, entry))
  );
};

const nextCall = async continuation => {
  const row = await continuationRow(continuation);
  assert.notEqual(row.status, 'error', `${continuation.tool} result failed`);
  assert.equal(
    row.data.error,
    undefined,
    `${continuation.tool} returned an error payload`
  );
  return row.data;
};
const continuationRow = async continuation => {
  assert.ok(
    expectedTools.includes(continuation?.tool),
    'continuation has no runnable tool'
  );
  assert.ok(
    continuation.query && typeof continuation.query === 'object',
    'continuation has no query'
  );
  // A continuation is the complete input: run it verbatim.
  assert.ok(
    Array.isArray(continuation.query.queries),
    'continuation is not a complete input'
  );
  const response = await invoke(continuation.tool, continuation.query);
  const row = response.structuredContent?.results?.[0];
  assert.ok(row?.data, `${continuation.tool} has no result data`);
  if (response.isError) assert.equal(row.status, 'error');
  return row;
};
const executeCliTool = (name, queries, expectedStatus = 0) => {
  const startedAt = performance.now();
  const child = spawnSync(
    values.node,
    [path.resolve(values.cli), name, JSON.stringify({ queries })],
    {
      encoding: 'utf8',
      timeout: 120_000,
      maxBuffer: 8 * 1024 * 1024,
      cwd: acceptanceCwd,
      env: acceptanceEnv,
    }
  );
  const durationMs = Number((performance.now() - startedAt).toFixed(2));
  cliCalls.push({ name, durationMs, status: child.status });
  if (child.error) throw child.error;
  assert.strictEqual(
    child.status,
    expectedStatus,
    `${name}: CLI exited ${child.status}: ${child.stderr.trim()}`
  );
  assert.ok(child.stdout.trim(), `${name}: CLI returned no JSON`);
  return JSON.parse(child.stdout);
};
const pages = async (first, nextKey, collect) => {
  let rows = [...collect(first)];
  let current = first;
  let count = 1;
  let restarts = 0;
  while (current.next?.[nextKey]) {
    assert.ok(count++ < 100, 'continuation did not terminate');
    const row = await continuationRow(current.next[nextKey]);
    if (row.status === 'error') {
      assert.equal(row.data.errorCode, 'staleSnapshot');
      assert.ok(
        row.data.next?.restart,
        'changed snapshot has no restart continuation'
      );
      assert.ok(restarts++ < 5, 'snapshot did not stabilize');
      const restarted = await continuationRow(row.data.next.restart);
      assert.notEqual(restarted.status, 'error', 'snapshot restart failed');
      current = restarted.data;
      rows = [...collect(current)];
      count = 1;
      continue;
    }
    current = row.data;
    rows.push(...collect(current));
  }
  return { rows, count };
};
const differingFields = (left, right, prefix = '', fields = []) => {
  if (fields.length >= 40) return fields;
  if (Object.is(left, right)) return fields;
  if (
    !left ||
    !right ||
    typeof left !== 'object' ||
    typeof right !== 'object'
  ) {
    fields.push(prefix || '$');
    return fields;
  }
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of [...keys].sort())
    differingFields(left[key], right[key], `${prefix}/${key}`, fields);
  return fields;
};

let pid;
try {
  await client.connect(transport);
  pid = transport.pid;
  transport.stderr?.on('data', chunk => {
    receipt.stderrBytes += chunk.length;
    receipt.stderrTail = `${receipt.stderrTail}${chunk.toString('utf8')}`.slice(
      -65_536
    );
  });
  const list = await client.listTools();
  receipt.catalog = list.tools;
  expectedTools = list.tools.map(tool => tool.name);
  receipt.catalogBytes = Buffer.byteLength(JSON.stringify(receipt.catalog));
  await check('initialize and list every available canonical direct tool', () =>
    assert.deepEqual(
      expectedTools.filter(name => name !== TOOL_NAMES.CLASIFY).sort(),
      canonicalTools
        .filter(name => name !== TOOL_NAMES.CLASIFY && !isCliOnlyTool(name))
        .sort()
    )
  );
  await check(
    'MCP tool catalog stays below the production transport budget',
    () =>
      assert.ok(
        receipt.catalogBytes <= 200_000,
        `serialized MCP catalog is ${receipt.catalogBytes} bytes`
      )
  );
  await check('MCP tool catalog omits output schemas', () =>
    assert.ok(
      list.tools.every(tool => !Object.hasOwn(tool, 'outputSchema')),
      'tools/list exposed an outputSchema'
    )
  );
  if (expectedTools.includes(TOOL_NAMES.CLASIFY)) {
    await check(
      'clasify rejects the removed resources/presets shape before provider access',
      async () => {
        const response = await invoke(TOOL_NAMES.CLASIFY, {
          queries: [
            {
              id: 'legacy-shape-rejected',
              resources: [{ id: 'evidence', value: 'Supplied evidence.' }],
              questions: [
                { id: 'bounded', type: 'yesno', ask: 'Is evidence supplied?' },
              ],
            },
          ],
        });
        assert.equal(response.isError, true);
        assert.deepEqual(response.structuredContent, {
          error: 'queries.0.resources: Unknown field: resources',
          details: [
            'queries.0.state: Missing required field: state',
            'queries.0.questions: Expected object',
          ],
          errorCode: 'invalidInput',
        });
      }
    );
  }
  await check(
    'CLI canonical contracts and MCP published input schemas agree',
    () => {
      // The CLI lists every tool it can run; MCP clasify may delegate only to the
      // tools MCP exposes, so its published schema is built for that tool set.
      const cliCatalog = new Map(
        getPublicToolCatalogWithAddons({}).tools.map(tool => [tool.name, tool])
      );
      const cliDefinitions = new Map(
        getDirectToolDefinitionsWithAddons({}).map(definition => [
          definition.name,
          definition,
        ])
      );
      const mcpDefinitions = new Map(
        getDirectToolDefinitionsWithAddons({
          availableTools: expectedTools,
        }).map(definition => [definition.name, definition])
      );
      const cliSchema = (name, ...args) =>
        JSON.parse(
          execFileSync(
            values.node,
            [path.resolve(values.cli), 'schema', name, ...args],
            {
              encoding: 'utf8',
              timeout: 10_000,
              cwd: acceptanceCwd,
              env: acceptanceEnv,
            }
          )
        );
      for (const tool of list.tools) {
        const cli = cliSchema(tool.name);
        assert.equal(cli.name, tool.name);
        assert.equal(cli.availability.enabled, true);
        // The CLI contract is the query row; the request wrapper and output schema are not published.
        assert.equal(Object.hasOwn(cli, 'inputSchema'), false);
        assert.equal(Object.hasOwn(cli, 'outputSchema'), false);
        const cliDefinition = cliDefinitions.get(tool.name);
        const mcpDefinition = mcpDefinitions.get(tool.name);
        assert.ok(
          cliDefinition && mcpDefinition,
          `${tool.name} has no canonical contract`
        );
        const { $schema, ...canonicalRow } = cliCatalog.get(
          tool.name
        ).querySchema;
        assert.deepEqual(
          cli.querySchema,
          canonicalRow,
          `${tool.name} CLI query schema differs from the canonical contract`
        );
        assert.deepEqual(
          cliSchema(tool.name, '--view', 'query').querySchema,
          publishedInputSchema(cliDefinition.inputSchema, 'row'),
          `${tool.name} CLI query view differs from the published row schema`
        );
        assert.deepEqual(
          tool.inputSchema,
          publishedInputSchema(mcpDefinition.inputSchema),
          `${tool.name} MCP input schema differs from the published contract`
        );
      }
    }
  );
  await check(
    'local file read carries numbered source lines in text and structured content',
    async () => {
      const file = path.join(fixture, 'math.ts');
      const data = await call('localFetch', {
        path: file,
        minify: 'none',
      });
      // `<line>\t<text>` per source line (docs/TOOL_DATA_CONTRACT.md).
      const source = await readFile(file, 'utf8');
      const numbered = source
        .split('\n')
        .map((line, index, all) =>
          index === all.length - 1 && line === '' ? '' : `${index + 1}\t${line}`
        )
        .join('\n');
      assert.equal(data.content, numbered);
      assert.ok(
        receipt.calls
          .at(-1)
          .response.content.some(
            block =>
              block.type === 'text' &&
              block.text.includes('content (source lines):') &&
              block.text.includes('1\t// Arithmetic fixture.') &&
              block.text.includes(
                '2\texport function add(left: number, right: number) { return left + right; }'
              )
          )
      );
    }
  );
  await check('native MCP preserves ordered bulk query results', async () => {
    const response = await invoke('localFetch', {
      queries: [
        {
          reasoning: 'Read the first bulk fixture through native MCP.',
          path: path.join(fixture, 'math.ts'),
          ranges: ['1-1'],
        },
        {
          reasoning: 'Read the second bulk fixture through native MCP.',
          path: path.join(fixture, 'entry.ts'),
          ranges: ['1-1'],
        },
      ],
    });
    assert.equal(response.isError, false);
    const rows = response.structuredContent?.results;
    assert.equal(rows?.length, 2);
    assert.deepEqual(
      rows.map(row => row.index),
      [0, 1]
    );
    assert.ok(rows[0].data.content.includes('Arithmetic fixture'));
    assert.ok(rows[1].data.content.includes('import'));
  });
  await check(
    'localFetch line and byte chunks preserve selected views through real MCP',
    async () => {
      const directory = await mkdtemp(path.join(fixture, 'fetch-chunks-'));
      const file = path.join(directory, 'source.txt');
      const source = 'skip\r\nneedle 🌍\r\n\r\nneedle café\nlast\n';
      try {
        await writeFile(file, source);
        for (const unit of ['lines', 'bytes']) {
          for (const matched of [false, true]) {
            // Byte accounting (sourceBytes/returnedBytes) is opt-in `stats`;
            // continuations carry extras forward.
            let page = await call('localFetch', {
              path: file,
              unit,
              length: unit === 'lines' ? 1 : 3,
              extras: ['stats'],
              ...(matched
                ? { matchString: 'needle', contextLines: 0, minify: 'standard' }
                : {}),
            });
            let content = '';
            let count = 0;
            const numbers = [];
            for (;;) {
              assert.ok(++count < 100);
              assert.equal(page.totalLines, 5);
              assert.equal(page.sourceBytes, Buffer.byteLength(source));
              // Line views carry a `<line>\t` gutter (TOOL_DATA_CONTRACT numbered
              // content); returnedBytes counts only the source bytes under it.
              // Byte windows stay verbatim.
              const text =
                unit === 'lines'
                  ? page.content.replace(/^(\d+)\t/gm, (_, line) => {
                      numbers.push(Number(line));
                      return '';
                    })
                  : page.content;
              assert.equal(page.returnedBytes, Buffer.byteLength(text));
              // matchString reads are verbatim; no fallback notice says so per row.
              assert.equal(page.minifyFallback, undefined);
              content += text;
              if (!page.next?.continueWindow) break;
              assert.equal(page.next.continueWindow.tool, 'localFetch');
              page = await nextCall(page.next.continueWindow);
            }
            if (unit === 'lines')
              assert.deepEqual(numbers, matched ? [2, 4] : [1, 2, 3, 4, 5]);
            assert.equal(
              content,
              matched
                ? 'needle 🌍\r\n... [line 3 not requested] ...\nneedle café\n'
                : source
            );
          }
        }
        const invalid = await invoke('localFetch', {
          queries: [
            {
              reasoning:
                'Verify an unknown localFetch window field is rejected.',
              path: file,
              window: 3,
            },
          ],
        });
        assert.equal(invalid.isError, true);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  );
  for (const [regex, matchString] of [
    ['literal', 'add'],
    ['rust', '\\badd\\b'],
    ['pcre2', '(?<!\\w)add(?!\\w)'],
  ]) {
    await check(
      `local text search returns the observed anchor (${regex})`,
      async () => {
        const data = await call('localSearch', {
          path: path.join(fixture, 'math.ts'),
          matchString,
          regex,
          wholeWord: true,
          resultView: 'paginated',
        });
        // Minimal output drops single-page stats: the rows are the count.
        assert.equal(data.files.length, 1);
        assert.equal(data.files[0].matches.length, 1);
        assert.notEqual(data.isPartial, true);
        assert.equal(data.capped, undefined);
        assert.equal(data.files[0].matches[0].line, 2);
        assert.ok(data.files[0].matches[0].value.includes('function add'));
      }
    );
  }
  await check(
    'empty local search returns one concise recovery hint',
    async () => {
      const query = {
        path: fixture,
        matchString: 'octocode-definitely-absent-token',
        regex: 'literal',
        resultView: 'files',
      };
      const data = await call('localSearch', query);
      assert.equal(data.matchCount, 0);
      // An empty row states how many files it read; repair advice is the tool description's <empty> section.
      assert.equal(data.hints?.text?.length, 1);
      assert.ok(data.hints.text[0].length <= 120);
      assert.match(data.hints.text[0], /^No matches in \d+ files? searched\.$/);
      const searched = await call('localSearch', {
        ...query,
        extras: ['stats'],
      });
      assert.equal(searched.matchCount, 0);
      assert.equal(
        data.hints.text[0],
        `No matches in ${searched.filesScanned} ${searched.filesScanned === 1 ? 'file' : 'files'} searched.`
      );
      const description = list.tools.find(
        tool => tool.name === 'localSearch'
      ).description;
      assert.match(
        description,
        /<empty>[^<]*(shorter|regex|includeIgnored)[^<]*<\/empty>/i
      );
    }
  );
  await check('a page never carries the brief, sent or not', async () => {
    // The brief is request-level (docs/TOOL_DATA_CONTRACT.md): a page
    // carries the scope and cursor, never mainGoal or reasoning.
    const search = brief =>
      call('localSearch', {
        path: fixture,
        matchString: 'add',
        pageSize: 1,
        ...brief,
      });
    for (const brief of [
      {},
      { mainGoal: 'Trace the add helper.', reasoning: 'Find every caller.' },
    ]) {
      const data = await search(brief);
      assert.ok(data.next?.nextPage, 'no nextPage on a multi-file search');
      for (const field of ['mainGoal', 'reasoning'])
        assert.equal(
          data.next.nextPage.query.queries[0][field],
          undefined,
          field
        );
    }
  });
  await check('local file discovery positive', async () => {
    const data = await call('structureSearch', {
      operation: 'files',
      path: fixture,
      extensions: ['ts'],
      pageSize: 50,
    });
    assert.ok(
      listedPaths(data.files, data.path).some(file => file.endsWith('math.ts'))
    );
  });
  await check(
    'AST symbols identify the exported arithmetic declaration',
    async () => {
      const data = await call('astSearch', {
        operation: 'symbols',
        path: path.join(fixture, 'math.ts'),
        symbolName: 'add',
        kinds: ['function'],
      });
      // Minimal output drops the `operation` request echo.
      assert.equal(data.operation, undefined);
      // One declaration object; `docStartLine` marks the comment block above it.
      assert.deepEqual(data.symbols, [
        { symbolName: 'add', kind: 'function', line: 2, exported: true, docStartLine: 1 },
      ]);
      assert.equal(data.pagination?.totalItems ?? data.symbols.length, 1);
    }
  );
  await check(
    'astRewrite is parked: MCP does not list or run it, and the CLI refuses it without writing',
    async () => {
      assert.ok(
        !expectedTools.includes('astRewrite'),
        'MCP must not list astRewrite'
      );
      const directory = await mkdtemp(path.join(fixture, 'cli-rewrite-'));
      const file = path.join(directory, 'source.ts');
      const rule = {
        reasoning: 'Verify a parked rewrite never runs.',
        path: directory,
        language: 'typescript',
        pattern: 'oldCall($A)',
        rewrite: 'newCall($A)',
      };
      try {
        await writeFile(file, 'oldCall(1);\n');
        // An unlisted tool is a protocol error (-32602) or an error result, never a rewrite.
        const rejected = await client
          .callTool({ name: 'astRewrite', arguments: { queries: [rule] } })
          .then(
            result => result.isError === true,
            error => /not found|not available/i.test(String(error?.message))
          );
        assert.ok(rejected, 'MCP must reject astRewrite');
        assert.deepEqual(executeCliTool('astRewrite', [rule], 5), {
          error:
            'Tool astRewrite is not available in this native runtime: it is disabled in this build.',
          errorCode: 'toolUnavailable',
        });
        assert.equal(await readFile(file, 'utf8'), 'oldCall(1);\n');
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  );
  if (!values.quick) {
    await check(
      'outer text pagination isolates structured rows and reconstructs every character',
      async () => {
        const args = {
          queries: [
            {
              reasoning:
                'Exercise localFetch response pagination through built stdio acceptance.',
              path: path.join(fixture, 'math.ts'),
              minify: 'none',
            },
          ],
        };
        const full = await invoke('localFetch', args);
        let current = await invoke('localFetch', {
          ...args,
          responseLength: 150,
        });
        let text = '';
        let count = 0;
        assert.ok(full.structuredContent.results.length > 0);
        while (true) {
          assert.ok(count++ < 30);
          assert.deepEqual(current.structuredContent.results, []);
          // structuredContent-only hosts must still see the page window.
          assert.equal(
            current.structuredContent.responseWindow,
            current.content
              .filter(block => block.type === 'text')
              .map(block => block.text)
              .join('')
          );
          text += current.content
            .filter(block => block.type === 'text')
            .map(block => block.text.replace(/^# Response page[^\n]*\n/, ''))
            .join('');
          const next = current.structuredContent.responsePagination?.next;
          if (!next) break;
          current = await invoke(next.tool, next.query);
        }
        assert.ok(count > 1);
        assert.equal(
          text,
          full.content
            .filter(block => block.type === 'text')
            .map(block => block.text)
            .join('')
        );
      }
    );
    await check(
      'file pagination executes continuations and preserves full inventory',
      async () => {
        const query = { operation: 'files', path: fixture, extensions: ['ts'] };
        const full = await call('structureSearch', { ...query, pageSize: 50 });
        const first = await call('structureSearch', { ...query, pageSize: 1 });
        const paged = await pages(first, 'nextPage', data =>
          listedPaths(data.files, data.path)
        );
        assert.ok(paged.count > 1);
        assert.deepEqual(
          paged.rows.sort(),
          listedPaths(full.files, full.path).sort()
        );
      }
    );
    await check(
      'whole-response pages replay an unchanged source; an edit restarts like a fresh runtime',
      async () => {
        const parent = fixture;
        await mkdir(parent, { recursive: true });
        const directory = await mkdtemp(path.join(parent, 'mcp-snapshot-'));
        const file = path.join(directory, 'source.ts');
        try {
          await writeFile(file, 'export const value = 1;\n');
          // Settled sources: a page over them may replay.
          const then = new Date(Date.now() - 10_000);
          for (const entry of [file, directory])
            await utimes(entry, then, then);
          const page1 = () =>
            invoke('localFetch', {
              queries: [
                {
                  reasoning:
                    'Exercise localFetch response pagination through built stdio acceptance.',
                  path: file,
                  minify: 'none',
                },
              ],
              responseLength: 100,
            });
          const first = await page1();
          const before = first.structuredContent.responsePagination;
          assert.ok(before.next);
          let current = first;
          let rendered = '';
          let pages = 0;
          for (;;) {
            assert.ok(++pages < 100);
            // The last page has nothing left to page: it carries no responsePagination.
            const pagination = current.structuredContent.responsePagination;
            if (pagination) {
              assert.equal(pagination.snapshot, before.snapshot);
              assert.notEqual(pagination.restart, true);
            } else
              assert.ok(
                pages > 1,
                'the first page lost its responsePagination'
              );
            rendered += current.content
              .filter(block => block.type === 'text')
              .map(block => block.text.replace(/^# Response page[^\n]*\n/, ''))
              .join('');
            if (!pagination?.next) break;
            current = await invoke(pagination.next.tool, pagination.next.query);
          }
          assert.ok(pages > 1);
          assert.match(rendered, /export const value = 1;/);

          // After an edit the stored pages are stale: the next page restarts on
          // the current source, never serving the old evidence.
          const restartFrom = (await page1()).structuredContent
            .responsePagination.next;
          await writeFile(file, 'export const value = 200;\n');
          const restarted = await invoke(restartFrom.tool, restartFrom.query);
          const pagination = restarted.structuredContent.responsePagination;
          assert.equal(pagination.restart, true);
          assert.notEqual(pagination.snapshot, before.snapshot);
          const fresh = await call('localFetch', {
            path: file,
            minify: 'none',
          });
          assert.equal(fresh.content, '1\texport const value = 200;\n');
        } finally {
          await rm(directory, { recursive: true, force: true });
        }
      }
    );
    await check('structural captures positive', async () => {
      const data = await call('astSearch', {
        operation: 'match',
        path: fixture,
        pattern: 'add($$$ARGS)',
        language: 'typescript',
        captureText: true,
      });
      assert.ok(JSON.stringify(data).includes('add(value, value)'));
    });
    await check(
      'astTopology is CLI-only: MCP rejects it, the CLI runs the file graph',
      async () => {
        assert.ok(
          !expectedTools.includes('astTopology'),
          'MCP must not list astTopology'
        );
        const query = {
          operation: 'dependencies',
          path: fixture,
          source: 'entry.ts',
          graphDepth: 2,
          exclude: ['coverage', 'removed', 'rust'],
        };
        const rejected = await client
          .callTool({ name: 'astTopology', arguments: { queries: [query] } })
          .then(
            result => result.isError === true,
            error => /not found|not available/i.test(String(error?.message))
          );
        assert.ok(rejected, 'MCP must reject astTopology');
        const data = executeCliTool('astTopology', [query]).results[0].data;
        assert.ok(JSON.stringify(data).includes('math.ts'));
      }
    );
    await check(
      'graph diagnostic continuation union preserves the complete inventory (CLI)',
      async () => {
        const query = {
          operation: 'dependencies',
          path: `${fixture}-diagnostics`,
          source: 'entry.ts',
          graphDepth: 3,
          pageSize: 50,
          exclude: [],
        };
        // Withheld diagnostic rows are the opt-in hints.readDiagnostics lead;
        // its pages chain through next.nextDiagnosticPage. Each call is the
        // complete input, replayed verbatim through the CLI.
        const follow = ({ tool, query: input }) => {
          assert.equal(tool, 'astTopology');
          return executeCliTool(tool, input.queries).results[0].data;
        };
        const cliPages = lead => {
          let current = follow(lead);
          const rows = [...(current.coverage.diagnostics ?? [])];
          let count = 1;
          while (current.next?.nextDiagnosticPage) {
            assert.ok(count++ < 100, 'continuation did not terminate');
            current = follow(current.next.nextDiagnosticPage);
            rows.push(...(current.coverage.diagnostics ?? []));
          }
          return { rows, count };
        };
        // The entry's only imports are unresolved, so the answer has no
        // rows: an empty result (CLI exit 1) whose diagnostics stay
        // reachable through the lead.
        const run = diagnosticPageSize => {
          const [result] = executeCliTool(
            'astTopology',
            [{ ...query, diagnosticPageSize }],
            1
          ).results;
          assert.equal(result.status, 'empty');
          return result.data;
        };
        const first = run(2);
        assert.equal(first.coverage.diagnostics, undefined);
        assert.equal(first.coverage.imports.unresolvedInternal, 5);
        const full = cliPages(run(100).hints.readDiagnostics);
        const paged = cliPages(first.hints.readDiagnostics);
        assert.equal(
          full.rows.length,
          first.coverage.imports.unresolvedInternal
        );
        assert.ok(paged.count > full.count);
        assert.deepEqual(paged.rows, full.rows);
      }
    );
    await check('LSP definition identifies the declaration', async () => {
      const data = await call('lspSearch', {
        path: path.join(fixture, 'entry.ts'),
        workspaceRoot: fixture,
        operation: 'definition',
        symbolName: 'add',
        line: 4,
      });
      assert.equal(data.kind, 'definition');
      assert.ok(
        data.matches.some(
          location =>
            location.path.endsWith('math.ts') &&
            location.displayRange.startLine === 2
        )
      );
    });
    await check(
      'LSP references execute snapshot continuations without loss',
      async () => {
        const query = {
          path: path.join(fixture, 'math.ts'),
          workspaceRoot: fixture,
          operation: 'references',
          symbolName: 'add',
          line: 2,
        };
        // References group per file: {path, matches: [{line, column, value}]}.
        const collect = data =>
          data.files.flatMap(file =>
            file.matches.map(
              ref => `${file.path} ${ref.line}:${ref.column} ${ref.value}`
            )
          );
        const first = await call('lspSearch', { ...query, pageSize: 1 });
        const paged = await pages(first, 'nextPage', collect);
        const full = await call('lspSearch', { ...query, pageSize: 100 });
        assert.ok(paged.count > 1);
        assert.equal(
          paged.rows.length,
          full.pagination?.totalItems ?? collect(full).length
        );
        assert.deepEqual(paged.rows, collect(full));
      }
    );
    for (const name of expectedTools)
      await check(
        `${name} rejects malformed arguments without killing stdio`,
        async () => {
          const result = await invoke(name, { queries: 'invalid' });
          assert.equal(result.isError, true);
          receipt.guidance.validationErrors += 1;
          const message = result.content
            .filter(block => block.type === 'text')
            .map(block => block.text)
            .join('\n');
          assert.match(message, /queries|array|invalid/i);
          assert.ok(
            message.length > 0 && message.length <= 2_000,
            `${name}: unusable validation message`
          );
          assert.equal(
            (await client.listTools()).tools.length,
            expectedTools.length
          );
        }
      );
    for (const removedName of [
      'localAnalyzeGraph',
      'lspGetSemantics',
      'octocode_nonexistent_tool',
    ])
      await check(
        `${removedName} returns an error and server remains responsive`,
        async () => {
          let rejected = false;
          try {
            const result = await client.callTool({
              name: removedName,
              arguments: {},
            });
            rejected = result.isError === true;
          } catch {
            rejected = true;
          }
          assert.ok(rejected);
          assert.equal(
            (await client.listTools()).tools.length,
            expectedTools.length
          );
        }
      );
  }
  if (values.live && !values.quick) {
    if (expectedTools.includes(TOOL_NAMES.CLASIFY)) {
      await check(
        'clasify executes noul, choice, and score through the live provider',
        async () => {
          const response = await invoke(TOOL_NAMES.CLASIFY, {
            queries: [
              {
                id: 'live-primitives',
                state: 'The fixture explicitly states that alpha is enabled.',
                questions: {
                  stated: {
                    type: 'noul',
                    instructions: 'Does the fixture state that alpha is enabled?',
                  },
                  state: {
                    type: 'choice',
                    instructions: 'Which state does the fixture assign to alpha?',
                    criteria: {
                      enabled: 'The fixture says alpha is enabled.',
                      disabled: 'The fixture says alpha is disabled.',
                    },
                  },
                  explicit: {
                    type: 'score',
                    instructions:
                      'How explicit is the fixture about alpha being enabled?',
                    criteria: ['not stated', 'implied', 'explicitly stated'],
                  },
                },
              },
            ],
          });
          assert.equal(response.isError, false, JSON.stringify(response));
          const row = response.structuredContent?.queries?.[0];
          assert.equal(row?.id, 'live-primitives');
          assert.equal(typeof row.model, 'string');
          assert.equal(typeof row.usage?.input_tokens, 'number');
          assert.equal(row.answers.stated.type, 'noul');
          assert.equal(typeof row.answers.stated.noul, 'number');
          assert.equal(row.answers.state.type, 'choice');
          assert.ok(['enabled', 'disabled'].includes(row.answers.state.choice));
          assert.equal(row.answers.explicit.type, 'score');
          assert.equal(typeof row.answers.explicit.score, 'number');
          // A literal state needs no source-read lead.
          assert.equal(row.hints, undefined);
        }
      );
    }
    const repo = { owner: 'octocat', repo: 'Hello-World' };
    const sha = '7fd1a60b01f91b314f59955a4e4d4e80d8edf11d';
    await check(
      'GitHub tree preserves paths and the requested revision',
      async () => {
        const data = await call('ghStructure', {
          ...repo,
          ref: sha,
          pageSize: 1,
        });
        // The resolved ref restates the requested ref, so it is not repeated.
        assert.equal(data.resolvedRef ?? sha, sha);
        assert.ok(
          data.entries.some(directory => directory.files.includes('README'))
        );
      }
    );
    await check(
      'GitHub full file reads return content without a checkout',
      async () => {
        const data = await call('ghGetFileContent', {
          ...repo,
          ref: sha,
          path: 'README',
          fullContent: true,
        });
        assert.equal(data.content, '1\tHello World!\n');
        assert.equal(data.files, undefined);
        assert.equal(data.localPath, undefined);
        assert.equal(data.repoRoot, undefined);
        assert.equal(data.directories, undefined);
      }
    );
    await check(
      'GitHub file fetch rejects directory paths and removed directory mode',
      async () => {
        const directory = await invoke('ghGetFileContent', {
          queries: [{ ...repo, ref: sha, path: '' }],
        });
        assert.equal(directory.isError, true);
        assert.match(
          JSON.stringify(
            directory.structuredContent ?? directory.content ?? directory
          ),
          /non-blank path|directory/i
        );
        let rejected = false;
        try {
          const result = await invoke('ghGetFileContent', {
            queries: [{ ...repo, path: '', type: 'directory' }],
          });
          rejected = result.isError === true;
        } catch {
          rejected = true;
        }
        assert.ok(rejected);
      }
    );
    await check('GitHub repository search positive', async () => {
      const data = await call('ghSearchRepo', {
        owner: 'octocat',
        keywords: ['Hello-World'],
        pageSize: 1,
      });
      assert.ok(JSON.stringify(data).includes('Hello-World'));
    });
    await check('GitHub code search positive', async () => {
      const data = await call('ghSearchCode', {
        owner: 'jonschlinkert',
        repo: 'is-number',
        filename: 'index.js',
        keywords: ['module.exports'],
        pageSize: 1,
      });
      assert.ok(data.files.length > 0);
    });
    await check(
      'GitHub exact file byte continuations preserve all bytes',
      async () => {
        const query = { ...repo, ref: sha, path: 'README', minify: 'none' };
        const full = await call('ghGetFileContent', query);
        let current = await call('ghGetFileContent', {
          ...query,
          unit: 'bytes',
          length: 5,
        });
        let content = current.content;
        let count = 1;
        while (current.next?.continueWindow) {
          assert.ok(count++ < 20);
          current = await nextCall(current.next.continueWindow);
          content += current.content;
        }
        assert.ok(count > 1);
        assert.equal(content, full.content);
      }
    );
    await check(
      'GitHub/local search-to-match fetch parity in both chunk units',
      async () => {
        const repo = { owner: 'jonschlinkert', repo: 'is-number' };
        const found = await call('ghSearchCode', {
          ...repo,
          filename: 'index.js',
          keywords: ['module.exports'],
          pageSize: 1,
        });
        assert.ok(found.files?.length > 0);
        const remotePath = found.files[0].path;
        const full = await call('ghGetFileContent', {
          ...repo,
          path: remotePath,
          fullContent: true,
        });
        const source = full.content;
        assert.ok(source.includes('module.exports'));
        const parent = fixture;
        const directory = await mkdtemp(
          path.join(parent, 'remote-local-fetch-')
        );
        const file = path.join(directory, 'index.js');
        try {
          await writeFile(file, source);
          const localFound = await call('localSearch', {
            path: directory,
            matchString: 'module.exports',
            regex: 'literal',
          });
          assert.ok(localFound.files?.length > 0);
          for (const unit of ['lines', 'bytes']) {
            const selector = {
              matchString: 'module.exports',
              contextLines: 2,
              minify: 'standard',
              unit,
              length: unit === 'lines' ? 1 : 7,
              extras: ['stats', 'details'],
            };
            const contents = [];
            const anchors = [];
            for (const remote of [false, true]) {
              const tool = remote ? 'ghGetFileContent' : 'localFetch';
              const query = remote
                ? {
                    ...repo,
                    path: remotePath,
                    ...(full.commitSha ? { ref: full.commitSha } : {}),
                    ...selector,
                  }
                : { path: file, ...selector };
              let result = await call(tool, query);
              let joined = '';
              let count = 0;
              const matched = new Set();
              while (true) {
                assert.ok(count++ < 100);
                const page = result;
                assert.equal(page.sourceBytes, Buffer.byteLength(source));
                assert.equal(
                  page.returnedBytes,
                  Buffer.byteLength(page.content)
                );
                assert.equal(page.minifyFallback.reason, 'match-evidence');
                joined += page.content;
                for (const line of page.matchedLines ?? []) matched.add(line);
                if (!page.next?.continueWindow) {
                  assert.equal(page.pagination.hasMore, false);
                  break;
                }
                assert.equal(
                  page.next.continueWindow.query.queries[0].matchString,
                  selector.matchString
                );
                result = await nextCall(page.next.continueWindow);
              }
              assert.ok(count > 1);
              contents.push(joined);
              anchors.push([...matched]);
            }
            assert.equal(contents[0], contents[1]);
            assert.deepEqual(anchors[0], anchors[1]);
            assert.ok(anchors[0].length > 0);
          }
        } finally {
          await rm(directory, { recursive: true, force: true });
        }
      }
    );
    await check('GitHub commit history search positive', async () => {
      const data = await call('ghSearchHistory', {
        ...repo,
        operation: 'commit',
        pageSize: 1,
      });
      assert.ok(JSON.stringify(data).includes(sha));
      assert.ok(data.next?.nextPage);
      const next = await nextCall(data.next.nextPage);
      assert.equal(next.pagination.currentPage, 2);
    });
    await check('GitHub exact commit positive', async () => {
      const data = await call('ghGetHistoryItem', {
        ...repo,
        operation: 'commit',
        ref: sha,
        sections: ['patches'],
      });
      assert.ok(JSON.stringify(data).includes(sha));
    });
    await check('npm exact metadata positive', async () => {
      const data = await call('artifactSearch', {
        ecosystem: 'npm',
        packageName: 'is-number',
      });
      assert.ok(JSON.stringify(data).includes('7.0.0'));
    });
    await check('npm discovery continuation is executable', async () => {
      const data = await call('artifactSearch', {
        ecosystem: 'npm',
        keywords: ['is-number'],
        pageSize: 1,
      });
      assert.ok(data.next?.nextPage);
      await nextCall(data.next.nextPage);
    });
    await check('CLI clone pinned revision positive', async () => {
      const data = executeCliTool('ghCloneRepo', [
        { ...repo, ref: sha, reasoning: 'Verify CLI-only clone.' },
      ]).results[0].data;
      assert.ok(data.location.localPath);
      assert.equal(data.location.commitSha, sha);
      assert.equal(
        await readFile(path.join(data.location.localPath, 'README'), 'utf8'),
        'Hello World!\n'
      );
    });
    if (expectedTools.includes(TOOL_NAMES.CLASIFY)) {
      await check(
        'clasify judges each source reader without returning a body, and its read lead returns the captured source',
        async () => {
          const sourceSchema = list.tools.find(
            tool => tool.name === TOOL_NAMES.CLASIFY
          ).inputSchema.properties.queries.items.properties.source;
          const readers = sourceSchema.properties.tool.enum;
          const sources = {
            localFetch: {
              path: path.join(fixture, 'math.ts'),
              ranges: ['1-3'],
            },
            ghGetFileContent: {
              ...repo,
              path: 'README',
              ref: sha,
              fullContent: true,
            },
          };
          assert.deepEqual([...readers].sort(), Object.keys(sources).sort());
          for (const tool of readers) {
            const response = await invoke(TOOL_NAMES.CLASIFY, {
              queries: [
                {
                  id: tool,
                  source: { tool, query: sources[tool] },
                  questions: {
                    named: {
                      type: 'noul',
                      instructions:
                        'Does this source name a file, repository, package, or code symbol?',
                    },
                  },
                },
              ],
            });
            assert.equal(response.isError, false, JSON.stringify(response));
            const row = response.structuredContent.queries[0];
            assert.equal(row.error, undefined, JSON.stringify(row));
            const answer = row.answers.named.noul;
            assert.ok(answer >= 0 && answer <= 1, JSON.stringify(row));
            assert.equal(JSON.stringify(row).includes('Hello World'), false);
            const lead = row.hints?.read;
            assert.equal(lead?.tool, tool, JSON.stringify(row));
            const read = await nextCall(lead);
            assert.ok(String(read.content ?? '').length > 0, tool);
          }
        }
      );
    }
  }
  if (values['cli-mcp-parity']) {
    await check(
      'deterministic same-query CLI and real MCP structured result parity',
      async () => {
        const parity = [];
        receipt.cliMcpParity = parity;
        const cacheVolatileTools = new Set([
          'ghSearchRepo',
          'ghSearchCode',
          'ghStructure',
          'ghGetFileContent',
          'ghSearchHistory',
          'ghGetHistoryItem',
          'artifactSearch',
        ]);
        const liveOnlyTools = cacheVolatileTools;
        for (const name of expectedTools) {
          if (name === TOOL_NAMES.CLASIFY) {
            const executionVerified = receipt.calls.some(
              call =>
                call.name === name &&
                call.response.isError === false &&
                call.response.structuredContent?.results?.[0]?.status !==
                  'error'
            );
            parity.push({
              name,
              status: 'not-applicable',
              comparison: 'exact-structured-results',
              executionVerified,
              reason:
                'Independent probabilistic responses need not be identical; executionVerified records the separate live provider check.',
            });
            assert.ok(
              !values.live || executionVerified,
              'clasify: --live requires one successful provider-backed execution'
            );
            continue;
          }
          const sample = cliMcpParitySamples.get(name);
          const selected =
            sample?.selected ??
            receipt.calls.find(
              call =>
                call.name === name &&
                call.response.isError === false &&
                call.response.structuredContent?.results?.[0]?.status !==
                  'error' &&
                call.response.structuredContent?.results?.[0]?.status !==
                  'empty'
            );
          if (
            !selected &&
            liveOnlyTools.has(name) &&
            (!values.live || values.quick)
          ) {
            parity.push({
              name,
              status: 'not-run',
              reason:
                'Successful provider-backed parity requires --live without --quick.',
            });
            continue;
          }
          assert.ok(
            selected,
            `${name}: no successful non-mutating MCP call to compare`
          );
          const cliResponse =
            sample?.cliResponse ??
            executeCliTool(name, selected.arguments.queries);
          const cliResults = sample?.cliResults ?? cliResponse.results;
          const mcpResults = selected.response.structuredContent.results;
          const mcpBase = selected.response.structuredContent.root;
          const cliBase = cliResponse?.root;
          const differences = differingFields(mcpResults, cliResults);
          // Provider cache state depends on which cross-process arm reached the
          // provider first. For these provider tools it is receipt metadata,
          // not evidence or tool data; retain the raw pair and compare all other
          // fields explicitly. No local/AST/LSP result receives this exception.
          const cacheOnly =
            cacheVolatileTools.has(name) &&
            differences.every(field => field === '/0/cache');
          const mcpComparable = cacheOnly
            ? mcpResults.map(({ cache, ...row }) => row)
            : mcpResults;
          const cliComparable = cacheOnly
            ? cliResults.map(({ cache, ...row }) => row)
            : cliResults;
          const contractDifferences = differingFields(
            mcpComparable,
            cliComparable
          ).filter(field => !field.endsWith('/cursor'));
          const opaqueCursorDifferences = differences.filter(field =>
            field.endsWith('/cursor')
          );
          const baseEqual = mcpBase === cliBase;
          parity.push({
            name,
            arguments: selected.arguments,
            mcpResults,
            cliResults,
            mcpBase,
            cliBase,
            baseEqual,
            exact: differences.length === 0,
            rawDifferingFields: differences,
            comparison:
              cacheOnly || opaqueCursorDifferences.length
                ? 'evidence-data-and-executable-query'
                : 'exact-structured-results',
            cacheExclusionJustification: cacheOnly
              ? 'provider cache state is cross-process timing metadata; all evidence and data fields remain exact'
              : undefined,
            opaqueCursorExclusionJustification: opaqueCursorDifferences.length
              ? 'opaque cursors may differ across independent processes; the continuation tool and executable query remain exact'
              : undefined,
            differingFields: contractDifferences,
            passesContract: contractDifferences.length === 0 && baseEqual,
          });
        }
        receipt.cliMcpParitySummary = {
          compared: parity.filter(row => row.passesContract !== undefined)
            .length,
          notApplicable: parity
            .filter(row => row.status === 'not-applicable')
            .map(row => row.name),
          notRun: parity
            .filter(row => row.status === 'not-run')
            .map(row => row.name),
        };
        const failures = parity.filter(
          row =>
            !['not-run', 'not-applicable'].includes(row.status) &&
            !row.passesContract
        );
        assert.deepEqual(
          failures.map(row => ({
            name: row.name,
            baseEqual: row.baseEqual,
            differingFields: row.differingFields,
          })),
          []
        );
      }
    );
  }
  await check('stdio contains no parser or protocol errors', () =>
    assert.deepEqual(receipt.transportErrors, [])
  );
} finally {
  const start = Date.now();
  try {
    await client.close();
  } catch (error) {
    receipt.closeError = error.message;
  }
  receipt.shutdownMs = Date.now() - start;
  const summarizeLatencies = calls =>
    Object.fromEntries(
      [...new Set(calls.map(call => call.name))].sort().map(name => {
        const durations = calls
          .filter(call => call.name === name)
          .map(call => call.durationMs)
          .sort((left, right) => left - right);
        const percentile = fraction =>
          durations[
            Math.min(
              durations.length - 1,
              Math.ceil(durations.length * fraction) - 1
            )
          ];
        return [
          name,
          {
            count: durations.length,
            p50Ms: percentile(0.5),
            p95Ms: percentile(0.95),
            maxMs: durations.at(-1),
            totalMs: Number(
              durations.reduce((sum, duration) => sum + duration, 0).toFixed(2)
            ),
          },
        ];
      })
    );
  receipt.latencyByTool = summarizeLatencies(receipt.calls);
  receipt.cliLatencyByTool = summarizeLatencies(cliCalls);
  receipt.responseBytesByTool = Object.fromEntries(
    [...new Set(receipt.calls.map(call => call.name))].sort().map(name => {
      const sizes = receipt.calls
        .filter(call => call.name === name)
        .map(call => call.responseBytes)
        .sort((left, right) => left - right);
      const percentile = fraction =>
        sizes[
          Math.min(sizes.length - 1, Math.ceil(sizes.length * fraction) - 1)
        ];
      return [
        name,
        {
          count: sizes.length,
          p50Bytes: percentile(0.5),
          p95Bytes: percentile(0.95),
          maxBytes: sizes.at(-1),
        },
      ];
    })
  );
  receipt.totalMs = Number((performance.now() - suiteStartedAt).toFixed(2));
  await check('child shuts down and releases its PID', () => {
    assert.ok(pid);
    assert.throws(() => process.kill(pid, 0));
    assert.ok(receipt.shutdownMs < 7_000);
  });
  await mkdir(path.dirname(path.resolve(values.receipt)), { recursive: true });
  await writeFile(values.receipt, JSON.stringify(receipt, null, 2));
  if (!values.fixture) {
    await rm(fixture, { recursive: true, force: true });
    await rm(`${fixture}-diagnostics`, { recursive: true, force: true });
  }
}
const failures = receipt.checks.filter(check => check.status === 'failed');
console.log(
  JSON.stringify({
    passed: receipt.checks.length - failures.length,
    failures,
    calledTools: [...new Set(receipt.calls.map(call => call.name))],
    latencyByTool: receipt.latencyByTool,
    cliLatencyByTool: receipt.cliLatencyByTool,
    responseBytesByTool: receipt.responseBytesByTool,
    guidance: receipt.guidance,
    totalMs: receipt.totalMs,
    receipt: values.receipt,
    shutdownMs: receipt.shutdownMs,
  })
);
if (failures.length) process.exitCode = 1;
