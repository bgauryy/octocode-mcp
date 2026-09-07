import { describe, expect, it } from 'vitest';
import { initCheckpointStore } from '../src/tools/checkpoints.js';

const ok = (payload: unknown) => Promise.resolve({ code: 0, stdout: JSON.stringify({ ok: true, ...payload as object }), stderr: '' });

describe('Awareness-backed checkpoints', () => {
  it('maps the bounded timeline and selects before for edits and after for checkpoints', async () => {
    const calls: string[][] = [];
    const engine = await initCheckpointStore('/tmp/work', { agentId: 'pi:test', run: async args => {
      calls.push(args);
      if (args[1] === 'timeline') return ok({ operations: [{ operation_id: 'edit-1', kind: 'edit', created_at: '2026-01-01T00:00:00Z', file_count: 1 }] });
      if (args[1] === 'restore-preview') return ok({ preview_id: 'preview-1', changes: [{ action: 'update', path: 'a.ts' }] });
      return ok({ status: 'applied', verification_run_id: 'verify-1' });
    } });
    expect(await engine.listCheckpoints(5)).toEqual({ checkpoints: [expect.objectContaining({ id: 'edit-1', side: 'before', filesChanged: 1 })] });
    expect(await engine.diffStat('edit-1')).toEqual([{ status: 'M', path: 'a.ts' }]);
    await expect(engine.restoreFiles('edit-1')).resolves.toEqual({ verificationRunId: 'verify-1' });
    expect(calls.find(args => args[1] === 'restore-preview')).toEqual(expect.arrayContaining(['--side', 'before']));
    expect(calls.find(args => args[1] === 'restore-apply')).toEqual(expect.arrayContaining(['--preview-id', 'preview-1']));
  });

  it('does not apply when preview fails', async () => {
    const calls: string[][] = [];
    const engine = await initCheckpointStore('/tmp/work', { agentId: 'pi:test', run: async args => {
      calls.push(args);
      if (args[1] === 'timeline') return ok({ operations: [] });
      return { code: 1, stdout: '{"ok":false}', stderr: 'conflict' };
    } });
    await expect(engine.restoreFiles('missing')).rejects.toThrow('Preview this restore');
    expect(calls.some(args => args[1] === 'restore-apply')).toBe(false);
  });

  it('executes the canonical continuation without dropping reachable history', async () => {
    const engine = await initCheckpointStore('/tmp/work', { agentId: 'pi:test', run: async args => {
      if (args[0] === 'continue-history') return ok({ operations: [{ operation_id: 'op-2', kind: 'edit', created_at: '2026-01-02T00:00:00Z', file_count: 1 }] });
      return ok({ operations: [{ operation_id: 'op-1', kind: 'edit', created_at: '2026-01-01T00:00:00Z', file_count: 1 }], next: { argv: ['continue-history'] } });
    } });
    const first = await engine.listCheckpoints(1);
    const second = await engine.listCheckpoints(1, first.nextArgs);
    expect([...first.checkpoints, ...second.checkpoints].map(item => item.id)).toEqual(['op-1', 'op-2']);
    expect(second.nextArgs).toBeUndefined();
  });
});
