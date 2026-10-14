import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const engine = resolve(import.meta.dirname, '../../dist/engine');

/** A port nothing listens on: the runner then stops at its Chrome check, after the sandbox staged everything. */
async function closedPort() {
  const server = createServer();
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const { port } = server.address();
  await new Promise(done => server.close(done));
  return port;
}

test('a sandbox run writes only inside .octocode/octocode-chrome-devtools: helpers are staged under its tmp/helpers', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'chrome-sandbox-layout-'));
  try {
    writeFileSync(join(cwd, 'task.mjs'), 'export async function run() {}\n');
    spawnSync(
      process.execPath,
      [
        join(engine, 'cdp-sandbox.mjs'),
        'task.mjs',
        '--port',
        String(await closedPort()),
      ],
      { cwd, encoding: 'utf8', timeout: 30_000 }
    );
    const root = join(cwd, '.octocode');
    assert.deepEqual(
      readdirSync(root),
      ['octocode-chrome-devtools'],
      'only the skill folder sits at the .octocode root'
    );
    const helpers = join(root, 'octocode-chrome-devtools', 'tmp', 'helpers');
    for (const helper of [
      'dom-actionability.mjs',
      'human-input.mjs',
      'ax-snapshot.mjs',
      'undercover.mjs',
    ]) {
      assert(
        existsSync(join(helpers, helper)),
        `${helper} is staged in ${helpers}`
      );
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
