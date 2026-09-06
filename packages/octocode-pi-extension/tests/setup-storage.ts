import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

// Each isolated test file gets a fresh home before its modules are imported.
// Reusing a machine-wide temp home leaks ledgers and schema versions across runs.
const previousHome = process.env.OCTOCODE_HOME;
const testRoot = mkdtempSync(path.join(tmpdir(), 'octocode-pi-storage-'));
const testHome = path.join(testRoot, '.octocode');
process.env.OCTOCODE_HOME = testHome;

afterAll(() => {
  if (previousHome === undefined) delete process.env.OCTOCODE_HOME;
  else process.env.OCTOCODE_HOME = previousHome;
  rmSync(testRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});
