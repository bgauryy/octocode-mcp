import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'vitest';
import { discoverCodexHookSources, discoverPiHookSources } from '../src/adapters/pi-hook-discovery.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'octocode-hook-discovery-'));
  roots.push(root);
  return root;
}

test('discovers and normalizes merged user/workspace JSON and TOML hook sources', () => {
  const root = tempRoot();
  const userCodexDir = path.join(root, 'user-codex');
  const workspace = path.join(root, 'workspace');
  fs.mkdirSync(userCodexDir, { recursive: true });
  fs.mkdirSync(path.join(workspace, '.codex'), { recursive: true });
  fs.writeFileSync(path.join(userCodexDir, 'hooks.json'), JSON.stringify({ hooks: {
    PreToolUse: [{ matcher: '^write$', hooks: [{ type: 'command', command: './check.sh', command_windows: 'check.cmd' }] }],
  } }));
  fs.writeFileSync(path.join(workspace, '.codex', 'config.toml'), [
    '[hooks]',
    'PostToolUse = [{ matcher = "^write$", hooks = [{ type = "mcp_tool", server = "audit", tool = "record" }] }]',
  ].join('\n'));

  const discovered = discoverCodexHookSources({ workspace, userCodexDir });
  assert.deepEqual(discovered.errors, []);
  assert.equal(discovered.catalog.snapshot().entries.length, 2);
  assert.deepEqual(discovered.catalog.effective(true, false), []);

  for (const entry of discovered.catalog.snapshot().entries) {
    discovered.catalog.review(entry.source.id, entry.source.normalizedHash);
  }
  const effective = discovered.catalog.effective(true, false);
  assert.deepEqual(effective.map((entry) => entry.event), ['PreToolUse', 'PostToolUse']);
  assert.equal(effective[0]?.group.handlers[0]?.type, 'command');
  assert.equal(effective[1]?.group.handlers[0]?.type, 'mcp_tool');
});

test('workspace hook definitions remain ineligible without workspace trust', () => {
  const root = tempRoot();
  const workspace = path.join(root, 'workspace');
  fs.mkdirSync(path.join(workspace, '.codex'), { recursive: true });
  fs.writeFileSync(path.join(workspace, '.codex', 'hooks.json'), JSON.stringify({ hooks: {
    SessionStart: [{ hooks: [{ type: 'command', command: './start.sh' }] }],
  } }));
  const discovered = discoverCodexHookSources({ workspace, userCodexDir: path.join(root, 'missing') });
  const source = discovered.catalog.snapshot().entries[0]!.source;
  discovered.catalog.review(source.id, source.normalizedHash);
  assert.deepEqual(discovered.catalog.effective(false, false), []);
  assert.equal(discovered.catalog.effective(true, false).length, 1);
});

test('rejects symlinked and oversized workspace sources before parsing', () => {
  const root = tempRoot();
  const workspace = path.join(root, 'workspace');
  const codexDir = path.join(workspace, '.codex');
  fs.mkdirSync(codexDir, { recursive: true });
  const outside = path.join(root, 'outside.json');
  fs.writeFileSync(outside, '{}');
  fs.symlinkSync(outside, path.join(codexDir, 'hooks.json'));
  fs.writeFileSync(path.join(codexDir, 'config.toml'), `# ${'x'.repeat(1_048_577)}`);

  const discovered = discoverCodexHookSources({ workspace, userCodexDir: path.join(root, 'missing') });
  assert.equal(discovered.catalog.snapshot().entries.length, 0);
  assert.ok(discovered.errors.some((error) => /symlink/i.test(error.message)));
  assert.ok(discovered.errors.some((error) => /size limit/i.test(error.message)));
});

test('native declarative hooks are discovered without execution and workspace filenames shadow global sources', () => {
  const root = tempRoot();
  const workspace = path.join(root, 'workspace');
  const octocodeHome = path.join(root, 'octocode');
  fs.mkdirSync(path.join(octocodeHome, 'hooks'), { recursive: true });
  fs.mkdirSync(path.join(workspace, '.agents', 'hooks'), { recursive: true });
  const config = { hooks: { tool_call: [{ command: 'touch SHOULD_NOT_EXIST', type: 'command' }] } };
  fs.writeFileSync(path.join(octocodeHome, 'hooks', 'guard.json'), JSON.stringify(config));
  fs.writeFileSync(path.join(workspace, '.agents', 'hooks', 'guard.json'), JSON.stringify(config));
  const result = discoverPiHookSources({ workspace, octocodeHome, userCodexDir: path.join(root, 'none') });
  assert.equal(result.definitions.length, 2);
  assert.equal(result.definitions.find(source => source.source.scope === 'user')?.status, 'shadowed');
  assert.equal(result.definitions.find(source => source.source.scope === 'workspace')?.configuration.hooks.PreToolUse?.length, 1);
  assert.equal(fs.existsSync(path.join(workspace, 'SHOULD_NOT_EXIST')), false);
  assert.deepEqual(result.catalog.effective(true, false), []);
  assert.deepEqual(result.errors, []);
});
