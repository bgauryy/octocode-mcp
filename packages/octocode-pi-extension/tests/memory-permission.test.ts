import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeSharedAgentDb } from '../src/agentdb/db.js';
import { registerMemory } from '../src/memory/register.js';
import type { PermissionMode } from '../src/permission/mode.js';
import { Subcommands } from '../src/shared/commands.js';
import { fakeCtx, fakePermission, fakePi } from './fake-pi.js';

let root: string;
let cwd: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'octo-memory-permission-'));
  cwd = path.join(root, 'repo');
  fs.mkdirSync(cwd);
  vi.stubEnv('OCTOCODE_HOME', path.join(root, 'home'));
  vi.stubEnv('OCTOCODE_AGENT_DB', '');
});

afterEach(() => {
  closeSharedAgentDb();
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

function memoryTool(mode: PermissionMode) {
  const fake = fakePi();
  registerMemory(fake.pi, { commands: new Subcommands(), isSubagent: false, permission: fakePermission(mode) });
  const tool = fake.tools.get('memory');
  return (params: Record<string, unknown>, options: { hasUI?: boolean; selects?: string[]; inputs?: Array<string | undefined> } = {}) => {
    const ctx = Object.assign(fakeCtx({ cwd, hasUI: options.hasUI ?? true, ui: { selects: options.selects ?? [], inputs: options.inputs ?? [] } }), { isProjectTrusted: () => true });
    return tool.execute('call', params, undefined, undefined, ctx).then((result: { content: Array<{ text: string }> }) => result.content[0]!.text);
  };
}

describe('shared memory', () => {
  it('saves, changes and deletes a global or pinned memory at once in every mode, with no dialog and no UI', async () => {
    for (const mode of ['manual', 'workspace', 'full'] as const) {
      const run = memoryTool(mode);
      expect(await run({ op: 'set', title: `Global ${mode}`, scope: 'global' }, { hasUI: false })).toMatch(/^Saved M\d+ \(global/);
      expect(await run({ op: 'set', title: `Pinned ${mode}`, pinned: true }, { hasUI: false })).toMatch(/^Saved M\d+ \(project/);
    }
    const run = memoryTool('manual');
    expect(await run({ op: 'set', id: 'M1', title: 'Changed note' }, { hasUI: false })).toMatch(/^Updated M1/);
    expect(await run({ op: 'delete', id: 'M1' }, { hasUI: false })).toMatch(/^Deleted M1/);
  });

  it('refuses a global or pinned memory in an untrusted project in every mode, and audits the refusal', async () => {
    fs.mkdirSync(path.join(cwd, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(cwd, '.claude', 'settings.json'), '{"hooks":{}}');
    for (const mode of ['manual', 'workspace', 'full'] as const) {
      const fake = fakePi();
      registerMemory(fake.pi, { commands: new Subcommands(), isSubagent: false, permission: fakePermission(mode, { pi: fake.pi }) });
      const ctx = Object.assign(fakeCtx({ cwd, hasUI: true }), { isProjectTrusted: () => false });
      await expect(fake.tools.get('memory').execute('call', { op: 'set', title: 'Sneaky', scope: 'global' }, undefined, undefined, ctx)).rejects.toThrow(/untrusted project/);
      expect(fake.entries.map((entry) => entry.data), mode).toEqual([expect.objectContaining({ action: 'invariant', allowed: false, via: 'invariant', what: ['memory a global or pinned memory'] })]);
    }
  });
});
