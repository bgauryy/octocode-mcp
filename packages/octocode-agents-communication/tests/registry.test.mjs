import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { binary, execFileSync, jsonCall, tempWorkspace } from './helpers.mjs';

const registryDirectory = () => join(process.env.OCTOCODE_HOME, 'agents-communication', 'active-databases');
const entries = () => existsSync(registryDirectory()) ? readdirSync(registryDirectory()).filter(name => name.endsWith('.json')).map(name => JSON.parse(readFileSync(join(registryDirectory(), name), 'utf8'))) : [];
const reset = () => rmSync(registryDirectory(), { recursive: true, force: true });

test('a session on --database <file> is registered with pid and start time, and one on the default database is not', t => {
  reset();
  const workspace = tempWorkspace(t, 'communication-registry-', { real: true }), database = join(workspace, 'custom.sqlite');
  const call = jsonCall(binary, workspace, database, { stdio: 'pipe' });
  const { id } = call('join', { name: 'registered', vendor: 'generic' });
  assert.deepEqual(entries().map(entry => entry.database), [database]);
  const [entry] = entries();
  assert.equal(entry.version, 1);
  assert.ok(Number.isInteger(entry.pid) && entry.pid > 0);
  assert.ok(entry.started === null || /^\d+$/.test(entry.started));
  assert.ok(Math.abs(entry.updatedAt - Date.now()) < 60_000);
  // Reads announce nothing.
  reset();
  call('peers', {}, id);
  call('fetch', {}, id);
  assert.deepEqual(entries(), []);
  // The default database is found without a registry.
  const home = join(process.env.OCTOCODE_HOME, 'agents-communication');
  mkdirSync(home, { recursive: true });
  const fallback = JSON.parse(execFileSync(binary, ['join', JSON.stringify({ name: 'default-db', vendor: 'generic' }), '--workspace', workspace], { encoding: 'utf8', stdio: 'pipe' }));
  assert.ok(fallback.id);
  assert.ok(existsSync(join(home, 'communication.sqlite')));
  assert.deepEqual(entries(), []);
});

test('a later write prunes entries of processes that are gone', t => {
  reset();
  mkdirSync(registryDirectory(), { recursive: true });
  const old = Date.now() - 3_600_000;
  writeFileSync(join(registryDirectory(), '2147483646.json'), JSON.stringify({ version: 1, database: '/gone.sqlite', pid: 2147483646, started: null, updatedAt: old }));
  writeFileSync(join(registryDirectory(), 'broken.json'), 'not json');
  const workspace = tempWorkspace(t, 'communication-registry-prune-', { real: true }), database = join(workspace, 'custom.sqlite');
  jsonCall(binary, workspace, database, { stdio: 'pipe' })('join', { name: 'pruner', vendor: 'generic' });
  assert.deepEqual(entries().map(entry => entry.database), [database]);
});
