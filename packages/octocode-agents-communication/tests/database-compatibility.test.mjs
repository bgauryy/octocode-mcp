import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { binary, commandArgs, execFileSync, jsonCall, tempWorkspace } from './helpers.mjs';

test('a database with an older schema version is refused with a clear error and left unchanged', t => {
  const workspace = tempWorkspace(t, 'communication-skew-', { real: true }), database = join(workspace, 'old.sqlite');
  const call = jsonCall(binary, workspace, database, { stdio: 'pipe' });
  const { id } = call('join', { name: 'before-skew', vendor: 'generic' });
  const db = new DatabaseSync(database);
  db.exec('PRAGMA user_version=6');
  db.close();
  const digest = () => createHash('sha256').update(readFileSync(database)).digest('hex');
  const before = digest();
  const args = commandArgs(workspace, database);
  for (const [command, input, session] of [['join', { name: 'after-skew', vendor: 'generic' }], ['peers', {}, id], ['fetch', {}, id]]) {
    assert.throws(
      () => execFileSync(binary, args(command, input, session), { stdio: 'pipe' }),
      error => /Incompatible agents-communication database/.test(error.stderr.toString()) && /existing data is not modified/.test(error.stderr.toString()),
      command,
    );
  }
  const info = JSON.parse(execFileSync(binary, ['db', 'info', '--workspace', workspace, '--database', database], { encoding: 'utf8' }));
  assert.equal(info.compatible, false);
  assert.equal(info.schemaVersion, 6);
  assert.equal(info.expectedSchemaVersion, 7);
  assert.equal(digest(), before);
  const check = new DatabaseSync(database, { readOnly: true });
  assert.equal(check.prepare('PRAGMA user_version').get().user_version, 6);
  check.close();
});
