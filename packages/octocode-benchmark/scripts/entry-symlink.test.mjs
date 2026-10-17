import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('.', import.meta.url));

// Each script's cheapest side-effect-free mode: --help, or the usage error without arguments.
const cases = [
  ['classification_proxy.mjs', [], /Usage: classification_proxy\.mjs --log/],
  ['jev_chunk_instruction_poc.mjs', ['--help'], /--out <new-dir>/],
  ['jev_four_tools_poc.mjs', ['--help'], /jev_four_tools_poc\.mjs --out/],
  ['jev_proposal_poc.mjs', ['--help'], /jev_proposal_poc\.mjs --mode/],
  ['jev_question_poc.mjs', ['--help'], /jev_question_poc\.mjs --out/],
  ['jev_proposal_poc_summary.mjs', [], /Usage: node jev_proposal_poc_summary\.mjs/],
];

for (const [script, args, expected] of cases) {
  test(`${script} runs its entry point when called through a symlink`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bench-link-'));
    try {
      const link = join(dir, script);
      symlinkSync(join(bin, script), link);
      const run = spawnSync(process.execPath, [link, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH } });
      assert.match(`${run.stdout}${run.stderr}`, expected, `${script} did nothing through a symlink (exit ${run.status})`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}
