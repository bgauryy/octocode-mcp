// Harness scripts must run when called through a symlink (macOS /tmp and /var are symlinks too).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const harness = path.dirname(fileURLToPath(import.meta.url));

function linked(t, script) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-link-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const link = path.join(dir, path.basename(script));
  fs.symlinkSync(path.join(harness, script), link);
  return { dir, link };
}

test('sensors.mjs --self-test runs through a symlink', t => {
  const { link } = linked(t, 'sensors.mjs');
  const run = spawnSync(process.execPath, [link, '--self-test'], { encoding: 'utf8' });
  assert.match(run.stdout, /\[sensors self-test\]/, `nothing ran (exit ${run.status})`);
});

test('soak.mjs runs through a symlink (zero CLI calls into a temp --out)', t => {
  const { dir, link } = linked(t, 'soak.mjs');
  const out = path.join(dir, 'out');
  spawnSync(process.execPath, [link, '--cli', '--count=0', `--out=${out}`], { encoding: 'utf8', timeout: 60_000 });
  assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8')).calls, 0);
});

test('tool-health/mock-server.mjs serves through a symlink', async t => {
  const { dir, link } = linked(t, 'tool-health/mock-server.mjs');
  const child = spawn(process.execPath, [link, dir], { stdio: ['ignore', 'pipe', 'ignore'] });
  t.after(() => child.kill());
  const first = await new Promise(resolve => {
    let stdout = '';
    child.stdout.on('data', d => { stdout += d; if (stdout.includes('\n')) resolve(stdout); });
    child.on('close', () => resolve(stdout));
  });
  assert.match(first, /^http:\/\/127\.0\.0\.1:\d+/);
});
