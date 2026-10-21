import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { boundTool, fakePi, tempWorkspace, type BoundTool } from './helpers.ts';
import piExtension, { registerBoundTools } from '../dist/hosts/pi-extension.js';
import type { BoundToolsOptions } from '../dist/hosts/pi-extension.js';

const tools = [{ name: 'echo', description: 'Echo the CLI arguments', inputSchema: { type: 'object', properties: {} } }];

/** A runtime stand-in that answers every call with the arguments it received. */
function echoRuntime(t: TestContext) {
  const file = join(tempWorkspace(t, 'communication-pi-echo-'), 'echo.mjs');
  writeFileSync(file, "import { readFileSync } from 'node:fs';\nreadFileSync(0);\nprocess.stdout.write(JSON.stringify({ argv: process.argv.slice(2) }));\n");
  return file;
}

function register(options: Partial<BoundToolsOptions>): BoundTool {
  const { host, tools: registered } = fakePi();
  registerBoundTools(host, { tools, ...options });
  const [tool] = registered;
  assert.ok(tool, 'the tool is registered');
  return boundTool(tool);
}

test('Pi bound tools pass workspace, database and session in one order', async t => {
  const tool = register({ binary: echoRuntime(t), workspace: '/repo', database: '/db.sqlite', session: 's1' });
  const { details } = await tool.execute('call-1', {});
  assert.deepEqual(details.argv, ['echo', '-', '--workspace', '/repo', '--database', '/db.sqlite', '--session', 's1']);
});

test('Pi bound tools leave an unbound database to the runtime default instead of passing undefined', async t => {
  const tool = register({ binary: echoRuntime(t), workspace: '/repo', session: 's1' });
  const { details } = await tool.execute('call-1', {});
  assert.deepEqual(details.argv, ['echo', '-', '--workspace', '/repo', '--session', 's1']);
});

test('Pi bound tools name the missing binary or workspace', async t => {
  await assert.rejects(register({ binary: echoRuntime(t), session: 's1' }).execute('call-1', {}), /requires a binary and a workspace/);
  await assert.rejects(register({ workspace: '/repo', session: 's1' }).execute('call-1', {}), /requires a binary and a workspace/);
  await assert.rejects(register({ binary: echoRuntime(t), workspace: '/repo' }).execute('call-1', {}), /no session is bound/);
});

test('The Pi extension entry names the binding it needs', t => {
  const previous = process.env.OCTOCODE_COMMUNICATION_BINDING;
  t.after(() => { if (previous === undefined) delete process.env.OCTOCODE_COMMUNICATION_BINDING; else process.env.OCTOCODE_COMMUNICATION_BINDING = previous; });
  const pi = fakePi().host;
  delete process.env.OCTOCODE_COMMUNICATION_BINDING;
  assert.throws(() => piExtension(pi), /OCTOCODE_COMMUNICATION_BINDING must provide the catalog tools/);
  process.env.OCTOCODE_COMMUNICATION_BINDING = '{not json';
  assert.throws(() => piExtension(pi), /OCTOCODE_COMMUNICATION_BINDING is not valid JSON/);
  process.env.OCTOCODE_COMMUNICATION_BINDING = '[]';
  assert.throws(() => piExtension(pi), /OCTOCODE_COMMUNICATION_BINDING must be a JSON object/);
});
