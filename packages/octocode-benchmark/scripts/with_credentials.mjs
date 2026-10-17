#!/usr/bin/env node
// Load only through the canonical policy; keep credentials in child memory.
import { propagateOctocodeEnv } from '@octocodeai/config';
import { execFileSync, spawn } from 'node:child_process';

const args = process.argv.slice(2);
if (args[0] === '--') args.shift();
if (!args.length) throw new Error('Usage: with_credentials.mjs -- <command> [args...]');
const benchmarkEnv = { ...process.env };
propagateOctocodeEnv({ trusted: false, env: benchmarkEnv });
if (!benchmarkEnv.GH_TOKEN?.trim() && !benchmarkEnv.GITHUB_TOKEN?.trim()) {
  try {
    benchmarkEnv.GH_TOKEN = execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000,
    }).trim();
  } catch {
    throw new Error('GitHub authentication unavailable for the benchmark.');
  }
}
const child = spawn(args[0], args.slice(1), { env: benchmarkEnv, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', () => { console.error('Benchmark command could not start.'); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 130 : 1); });
