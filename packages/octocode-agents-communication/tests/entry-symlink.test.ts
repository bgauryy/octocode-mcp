import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('../src/', import.meta.url));

// Each script's cheapest side-effect-free failure: the error proves its entry point ran.
const cases: [script: string, args: string[], env: NodeJS.ProcessEnv, expected: RegExp][] = [
  ['live.ts', ['--bogus', 'x'], {}, /Unknown or incomplete option --bogus/],
];

for (const [script, args, env, expected] of cases) {
  test(`${script} runs its entry point when called through a symlink`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'comm-link-'));
    try {
      const link = join(dir, script);
      symlinkSync(join(src, script), link);
      const run = spawnSync(process.execPath, [link, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, ...env } });
      assert.match(run.stderr, expected, `${script} did nothing through a symlink (exit ${run.status})`);
      assert.notEqual(run.status, 0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}
