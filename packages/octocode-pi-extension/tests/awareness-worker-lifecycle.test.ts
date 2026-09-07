import { afterEach, describe, expect, it, vi } from 'vitest';
import { emitAgentEnd, makeMockAgentProcess } from './helpers/mock-process.js';

const fixture = vi.hoisted(() => ({ pending: [] as Array<{ runId: string }>, audit: vi.fn() }));
vi.mock('../src/tools/storage-policy.js', () => ({
  openPersistentAwareness: () => ({
    joinAgent() {}, leaveAgent() {}, close() {},
    auditChecks(params: unknown) { fixture.audit(params); return { pendingCount: fixture.pending.length, pending: fixture.pending, staleActiveCount: 0, staleActive: [] }; },
  }),
}));
import { spawnRpcAgent, setAgentProcessFactoryForTests } from '../src/tools/agent-tools.js';

afterEach(() => { setAgentProcessFactoryForTests(null); fixture.pending = []; fixture.audit.mockClear(); });

describe('worker terminal artifact debt fencing', () => {
  it('reinspects after final writes and exit, invalidates on a new turn, and skips retry endings', () => {
    const proc = makeMockAgentProcess();
    setAgentProcessFactoryForTests(() => proc as never);
    const record = spawnRpcAgent({ task: 'audit final artifact', resourceMode: 'lean' });
    emitAgentEnd(proc);
    expect(record.awarenessInspection).toMatchObject({ agentId: record.awarenessAgentId, status: 'clear' });
    const event = (value: unknown) => proc._emit('stdout:data', Buffer.from(`${JSON.stringify(value)}\n`));
    event({ type: 'agent_start' });
    expect(record.awarenessInspection).toBeUndefined();
    event({ type: 'agent_end', willRetry: true, messages: [] });
    expect(record.awarenessInspection).toBeUndefined();
    fixture.pending = [{ runId: 'final-artifact' }];
    emitAgentEnd(proc);
    expect(record.awarenessInspection).toMatchObject({ status: 'pending', runIds: ['final-artifact'] });
    fixture.pending.push({ runId: 'shutdown-artifact' });
    proc._emit('close', 0, null);
    expect(record.awarenessInspection).toMatchObject({ status: 'pending', runIds: ['final-artifact', 'shutdown-artifact'] });
    expect(fixture.audit).toHaveBeenLastCalledWith({ agentId: record.awarenessAgentId, minAgeMs: 0 });
  });
});
