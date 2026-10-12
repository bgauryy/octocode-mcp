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

describe('shared memory permission', () => {
  it('refuses a global or pinned memory without a UI instead of saving it unasked', async () => {
    const run = memoryTool('workspace');
    await expect(run({ op: 'set', title: 'Global note', scope: 'global' }, { hasUI: false })).rejects.toThrow(/global or pinned memory.*no one can be asked here/);
    await expect(run({ op: 'set', title: 'Pinned note', pinned: true }, { hasUI: false })).rejects.toThrow(/no one can be asked here/);
    expect(await run({ op: 'list' })).toBe('No memories yet.');
    // full needs no ask, so a headless run may save it.
    expect(await memoryTool('full')({ op: 'set', title: 'Global note', scope: 'global' }, { hasUI: false })).toMatch(/^Saved M1 \(global/);
  });

  it('asks before deleting a shared memory', async () => {
    const run = memoryTool('workspace');
    expect(await run({ op: 'set', title: 'Global note', scope: 'global' }, { selects: ['Allow once'] })).toMatch(/^Saved M1/);
    await expect(run({ op: 'delete', id: 'M1' }, { selects: ['Deny'] })).rejects.toThrow(/denied/);
    expect(await run({ op: 'delete', id: 'M1' }, { selects: ['Allow once'] })).toMatch(/^Deleted M1/);
  });

  it('returns denial notes for shared memory changes without changing the memory', async () => {
    const run = memoryTool('workspace');
    const refusal = { selects: ['Deny and tell the agent why…'], inputs: ['Keep this out of shared memory.'] };
    await expect(run({ op: 'set', title: 'Global note', scope: 'global' }, refusal)).rejects.toThrow("User's note: Keep this out of shared memory.");
    expect(await run({ op: 'list' })).toBe('No memories yet.');
    await run({ op: 'set', title: 'Original note', scope: 'global' }, { selects: ['Allow once'] });
    for (const change of [{ op: 'set', id: 'M1', title: 'Changed note' }, { op: 'delete', id: 'M1' }]) {
      await expect(run(change, { selects: ['Deny and tell the agent why…'], inputs: ['Keep the original.'] })).rejects.toThrow("User's note: Keep the original.");
      expect(await run({ op: 'get', id: 'M1' })).toContain('Original note');
    }
    await expect(run({ op: 'delete', id: 'M1' }, { selects: ['Deny and tell the agent why…'], inputs: [undefined] })).rejects.toThrow(/dismissed/);
    expect(await run({ op: 'get', id: 'M1' })).toContain('Original note');
  });
});
