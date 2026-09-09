import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emitAgentEnd, makeMockAgentProcess } from './helpers/mock-process.js';

const fixture = vi.hoisted(() => ({
  pending: [] as Array<{ runId: string }>,
  audit: vi.fn(),
}));
vi.mock('../src/tools/storage-policy.js', () => ({
  openPersistentAwareness: () => ({
    joinAgent() {},
    leaveAgent() {},
    close() {},
    auditChecks(params: unknown) {
      fixture.audit(params);
      return {
        pendingCount: fixture.pending.length,
        pending: fixture.pending,
        staleActiveCount: 0,
        staleActive: [],
      };
    },
  }),
}));
import { spawnRpcAgent } from '../src/tools/agents/process.js';
import { setAgentProcessFactoryForTests } from '../src/tools/agents/registry.js';

let workspace: string | undefined;
afterEach(() => {
  setAgentProcessFactoryForTests(null);
  fixture.pending = [];
  fixture.audit.mockClear();
  if (workspace) rmSync(workspace, { recursive: true, force: true });
  workspace = undefined;
});

describe('worker terminal artifact debt fencing', () => {
  it('reinspects after final writes and exit, invalidates on a new turn, and skips retry endings', () => {
    workspace = mkdtempSync(join(tmpdir(), 'pi-worker-audit-'));
    mkdirSync(join(workspace, '.octocode'));
    writeFileSync(
      join(workspace, '.octocode', 'awareness.json'),
      JSON.stringify({
        version: 1,
        storage: { repository: 'global', memory: 'global' },
        hooks: { profile: 'full' },
      })
    );
    const proc = makeMockAgentProcess();
    setAgentProcessFactoryForTests(() => proc as never);
    const record = spawnRpcAgent({
      task: 'audit final artifact',
      resourceMode: 'lean',
      cwd: workspace,
    });
    emitAgentEnd(proc);
    expect(record.awarenessInspection).toMatchObject({
      agentId: record.awarenessAgentId,
      status: 'clear',
    });
    const event = (value: unknown) =>
      proc._emit('stdout:data', Buffer.from(`${JSON.stringify(value)}\n`));
    event({ type: 'agent_start' });
    expect(record.awarenessInspection).toBeUndefined();
    event({ type: 'agent_end', willRetry: true, messages: [] });
    expect(record.awarenessInspection).toBeUndefined();
    fixture.pending = [{ runId: 'final-artifact' }];
    emitAgentEnd(proc);
    expect(record.awarenessInspection).toMatchObject({
      status: 'pending',
      runIds: ['final-artifact'],
    });
    fixture.pending.push({ runId: 'shutdown-artifact' });
    proc._emit('close', 0, null);
    expect(record.awarenessInspection).toMatchObject({
      status: 'pending',
      runIds: ['final-artifact', 'shutdown-artifact'],
    });
    expect(fixture.audit).toHaveBeenLastCalledWith({
      agentId: record.awarenessAgentId,
      minAgeMs: 0,
    });
  });
});
