import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeAwarenessCommand } from '../src/command-api.js';
import { executeAwarenessCli } from '../src/command-cli.js';
import { listAwarenessCommandDescriptors } from '../src/schema/cli.js';
import { HISTORY_ROUTE_DESCRIPTORS } from '../src/schema/definitions-history.js';
import { z } from 'zod';
import { writeWorkspacePolicy } from '../src/workspace-policy.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function context(agentId = 'owner') {
  const workspace = mkdtempSync(join(tmpdir(), 'awareness-api-'));
  roots.push(workspace);
  return { workspace, agentId, database: join(workspace, 'awareness.sqlite3'), compact: true };
}

describe('structured Awareness API', () => {
  it('binds both history capture variants and rejects a missing outcome or conflicting host identity', async () => {
    const ctx = context();
    writeWorkspacePolicy(ctx.workspace, { version: 1, storage: { repository: 'repo', memory: 'global' }, hooks: { profile: 'full' } });
    writeFileSync(join(ctx.workspace, 'a.ts'), 'before');
    const before = await executeAwarenessCommand({ command: 'history capture', params: { phase: 'before', operation_id: 'api-edit', file: ['a.ts'] } }, ctx);
    expect(before).toMatchObject({ exitCode: 0, payload: { operation: { operation_id: 'api-edit', status: 'open' } } });
    expect(await executeAwarenessCommand({ command: 'history capture', params: { phase: 'after', operation_id: 'api-edit' } }, ctx)).toMatchObject({ exitCode: 1 });
    expect(await executeAwarenessCommand({ command: 'history capture', params: { phase: 'after', operation_id: 'api-edit', outcome: 'success', agent_id: 'other' } }, ctx)).toMatchObject({ exitCode: 1, payload: { error: expect.stringContaining('host binding') } });
    writeFileSync(join(ctx.workspace, 'a.ts'), 'after');
    const after = await executeAwarenessCli(['history', 'capture', '--db', ctx.database, '--workspace', ctx.workspace, '--agent-id', ctx.agentId, '--phase', 'after', '--operation-id', 'api-edit', '--outcome', 'success']);
    expect(after).toMatchObject({ exitCode: 0, payload: { operation: { operation_id: 'api-edit', status: 'complete', outcome: 'success' } } });
  });

  it('validates the complete exported command catalog', () => {
    const descriptors = listAwarenessCommandDescriptors();
    expect(new Set(descriptors.map((descriptor) => descriptor.command)).size).toBe(descriptors.length);
    expect(descriptors.map((descriptor) => descriptor.command)).toEqual(expect.arrayContaining(HISTORY_ROUTE_DESCRIPTORS.map((entry) => entry.command)));
    for (const descriptor of descriptors) expect(() => z.fromJSONSchema(descriptor.inputSchema)).not.toThrow();
  });

  it('keeps shell-only input handling outside native schema validation', async () => {
    const native = await executeAwarenessCommand({ command: 'schema validate', params: { schema_name: 'memory_recall', input: { query: 'parser' } } });
    const cli = await executeAwarenessCli(['schema', 'validate', 'memory_recall', '-', '--compact'], { readStdin: async () => '{"query":"parser"}' });
    expect(native.exitCode, JSON.stringify(native)).toBe(0);
    expect(cli.payload).toEqual(native.payload);
    const ctx = context();
    const leading = await executeAwarenessCli(['--compact', '--db', ctx.database, 'attend', '--workspace', ctx.workspace]);
    expect(leading).toMatchObject({ exitCode: 0, payload: { mode: 'presence' } });
    expect(await executeAwarenessCli(['hook', 'run', 'notify-deliver', '--db', ctx.database], { readStdin: async () => '{}' })).toMatchObject({ exitCode: 1 });
  });

  it('preserves configured memory storage scope for canonical command names', async () => {
    const ctx = context();
    writeWorkspacePolicy(ctx.workspace, { version: 1, storage: { repository: 'repo', memory: 'global' }, hooks: { profile: 'coordination' } });
    const previous = process.env.OCTOCODE_HOME;
    process.env.OCTOCODE_HOME = join(ctx.workspace, 'home');
    try {
      const result = await executeAwarenessCommand({ command: 'reflect mine-weakness' }, { workspace: ctx.workspace, agentId: ctx.agentId, compact: true });
      expect(result.exitCode, JSON.stringify(result)).toBe(0);
      expect(existsSync(join(ctx.workspace, 'home', 'awareness', 'awareness.sqlite3'))).toBe(true);
      expect(existsSync(join(ctx.workspace, '.octocode', 'awareness.sqlite3'))).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.OCTOCODE_HOME; else process.env.OCTOCODE_HOME = previous;
    }
  });

  it('shares CLI behavior and executes every native attendance continuation', async () => {
    const ctx = context();
    for (let i = 0; i < 7; i++) await executeAwarenessCommand({ command: 'agent register', params: { agent_name: `Peer ${i}` } }, { ...ctx, agentId: `peer-${i}` });
    const cli = await executeAwarenessCli(['attend', '--db', ctx.database, '--workspace', ctx.workspace, '--agent-id', ctx.agentId, '--limit', '50', '--compact']);
    expect(cli.payload).toEqual((await executeAwarenessCommand({ command: 'attend', params: { limit: 50 } }, ctx)).payload);
    const ids: string[] = [];
    let call: import('../src/command-api.js').AwarenessCommandCall | undefined = { command: 'attend', params: { limit: 2 } };
    while (call) {
      const page = await executeAwarenessCommand(call, ctx);
      expect(page.exitCode, JSON.stringify({call, page})).toBe(0);
      const payload = page.payload as { peers: { agent_id: string }[]; next?: { list: { command: typeof call } } };
      ids.push(...payload.peers.map(peer => peer.agent_id));
      call = payload.next?.list.command;
    }
    expect(ids).toEqual(Array.from({ length: 7 }, (_, i) => `peer-${i}`));
  });
  it('registers and attends without stdout, argv parsing, or a CLI process', async () => {
    const ctx = context();
    const stdout = vi.spyOn(process.stdout, 'write');
    const registered = await executeAwarenessCommand({ command: 'agent register', params: { agent_name: 'Owner' } }, ctx);
    const attended = await executeAwarenessCommand({ command: 'attend' }, ctx);
    const writes = stdout.mock.calls.length;
    stdout.mockRestore();
    expect(registered.exitCode).toBe(0);
    expect(attended.payload).toMatchObject({ mode: 'presence', peers: [{ agent_id: 'owner' }] });
    expect(writes).toBe(0);
  });

  it('returns validation errors without terminating the host or accepting unknown fields', async () => {
    const ctx = context();
    expect(await executeAwarenessCommand({ command: 'work start', params: { typo: true } }, ctx)).toMatchObject({ exitCode: 1, payload: { ok: false } });
    expect(await executeAwarenessCommand({ command: 'task show' }, ctx)).toMatchObject({ exitCode: 1, payload: { ok: false } });
    expect((await executeAwarenessCommand({ command: 'attend' }, ctx)).exitCode).toBe(0);
  });

  it('retains false values and native arrays; returns blocked locks distinctly', async () => {
    const ctx = context();
    const peer = { ...ctx, agentId: 'peer' };
    const claim = { command: 'lock acquire', params: { target_file: ['a.ts'], rationale: 'test', test_plan: 'test' } };
    expect((await executeAwarenessCommand(claim, ctx)).exitCode).toBe(0);
    expect((await executeAwarenessCommand(claim, peer)).exitCode).toBe(2);
    expect(await executeAwarenessCommand({ command: 'lock wait', params: { target_file: ['a.ts'], wait_seconds: 0 } }, peer)).toMatchObject({ exitCode: 2, payload: { lock_free: false } });
  });

  it('cancels lock waiting while the event loop remains responsive', async () => {
    const ctx = context();
    expect((await executeAwarenessCommand({ command: 'lock acquire', params: { target_file: ['a.ts'], rationale: 'wait fixture', test_plan: 'test' } }, ctx)).exitCode).toBe(0);
    const controller = new AbortController();
    const pending = executeAwarenessCommand({ command: 'lock wait', params: { target_file: ['a.ts'], wait_seconds: 10 } }, { ...ctx, agentId: 'peer', signal: controller.signal });
    setTimeout(() => controller.abort(), 10);
    const result = await pending;
    expect(result).toMatchObject({ exitCode: 1, cancelled: true });
  });

  it('exports the exact shared standing prompt through a structured command', async () => {
    const { AWARENESS_PI_HOST_PROMPT } = await import('../src/coordination/external-policy.js');
    const result = await executeAwarenessCommand({ command: 'instructions export', params: { format: 'json' } });
    expect(result.payload).toMatchObject({ instructions: AWARENESS_PI_HOST_PROMPT });
  });

  it('executes communication and tracked work through the same domain handlers', async () => {
    const ctx = context();
    const invoke = (command: string, params: Record<string, unknown> = {}, agentId = ctx.agentId) => executeAwarenessCommand({ command, params }, { ...ctx, agentId });
    const published = await invoke('signal publish', { kind: 'question', subject: 'Own a.ts?', body: 'Can I edit it?', to_agent: ['peer'] });
    expect(published.exitCode, JSON.stringify(published)).toBe(0);
    const approval = await invoke('signal publish', { kind: 'approval', subject: 'Workspace write', body: 'Approval required', to_agent: ['peer'] });
    expect(approval.exitCode, JSON.stringify(approval)).toBe(0);
    const inbox = await invoke('signal list', { include_bodies: true }, 'peer');
    expect(inbox.exitCode, JSON.stringify(inbox)).toBe(0);
    expect(JSON.stringify(inbox.payload)).toContain('Can I edit it?');
    expect(JSON.stringify((await invoke('signal list', {}, 'stranger')).payload)).not.toContain('Can I edit it?');

    const started = await invoke('work start', { file: ['a.ts'], rationale: 'fixture', test_plan: 'fixture assertion' });
    expect(started.exitCode, JSON.stringify(started)).toBe(0);
    const runId = (started.payload as { run_id: string }).run_id;
    expect((await invoke('work end', { run_id: runId })).exitCode).toBe(0);
    expect(await invoke('verify audit')).toMatchObject({ exitCode: 1, payload: { ok: true } });
    expect((await invoke('verify mark', { run_id: [runId], status: 'SUCCESS', message: 'fixture assertion observed' })).exitCode).toBe(0);
    expect((await invoke('verify audit')).exitCode).toBe(0);
  });

  it('isolates parallel outputs and does not write after a cancelled start', async () => {
    const ctx = context();
    const controller = new AbortController(); controller.abort();
    const [cancelled, schema, attended] = await Promise.all([
      executeAwarenessCommand({ command: 'agent register' }, { ...ctx, signal: controller.signal }),
      executeAwarenessCommand({ command: 'schema command', params: { noun: 'signal', subcommand: 'publish' } }),
      executeAwarenessCommand({ command: 'attend' }, ctx),
    ]);
    expect(cancelled.cancelled).toBe(true);
    expect(schema.payload).toMatchObject({ 'x-cli-command': 'signal publish' });
    expect(attended.payload).toMatchObject({ mode: 'presence', count: 0 });
  });
});
