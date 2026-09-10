import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { currentPlatform } from '../platforms.cjs';
import { runNpm } from '../scripts/npm.cjs';

const root = fileURLToPath(new URL('..', import.meta.url));

test('metadata check enforces the canonical platform matrix and exact optional versions', () => {
  execFileSync(process.execPath, [join(root, 'scripts/metadata.mjs')], { stdio: 'pipe' });
});

test('installed loader works without Cargo, sources, install scripts or a root addon', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'extension-installed-'));
  const platform = currentPlatform();
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts.install, undefined);
    const artifacts = join(temporary, 'tarballs');
    const installed = join(temporary, 'installed');
    mkdirSync(artifacts); mkdirSync(installed);
    const pack = directory => {
      const output = runNpm(['pack', '--json', '--ignore-scripts', '--pack-destination', artifacts], { cwd: directory });
      return join(artifacts, JSON.parse(output)[0].filename);
    };
    const rootTarball = pack(root);
    const platformTarball = pack(join(root, 'npm', platform.id));
    // Empty cache + offline forbids accidental registry packages; empty PATH excludes compilers.
    runNpm(['install', rootTarball, platformTarball, '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', join(temporary, 'cache')], { cwd: installed, env: { ...process.env, PATH: '' } });
    const packageRoot = join(installed, 'node_modules', '@octocodeai', 'octocode-extension-rust');
    for (const omitted of ['src', 'scripts', 'Cargo.toml', platform.binary]) assert.equal(existsSync(join(packageRoot, omitted)), false);
    const program = `
      const assert = require('node:assert/strict');
      const fs = require('node:fs');
      const path = require('node:path');
      const native = require(${JSON.stringify(join(packageRoot, 'index.cjs'))});
      (async () => {
        const esm = await import(${JSON.stringify(pathToFileURL(join(packageRoot, 'index.js')).href)});
        const target = path.join(fs.realpathSync(${JSON.stringify(temporary)}), 'installed-native-file');
        const missing = await esm.snapshotFile(target, 1024, false);
        const content = Buffer.from([0xef, 0xbb, 0xbf, 0x61, 13, 10]);
        assert.equal((await native.replaceFile(target, content, missing.version, 1024, 0o600)).committed, true);
        const before = await esm.snapshotFile(target, 1024, true);
        assert.deepEqual(before.content, content);
        const cancellation = new native.NativeCancellation();
        assert.equal((await esm.replaceFile(target, Buffer.from('edited'), before.version, 1024, undefined, cancellation)).committed, true);
        assert.equal(fs.readFileSync(target, 'utf8'), 'edited');
        assert.equal(native.computeLineDiff('a', 'b')[0].opType, 'remove');
        const after = await native.snapshotFile(target, 1024, false);
        assert.equal((await esm.deleteFile(target, after.version, 1024)).committed, true);
        assert.equal(fs.existsSync(target), false);
      })().catch(error => { console.error(error); process.exitCode = 1; });
    `;
    // An empty PATH proves runtime loading never launches a compiler or package installer.
    execFileSync(process.execPath, ['-e', program], { env: { ...process.env, PATH: '' }, stdio: 'pipe' });
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
