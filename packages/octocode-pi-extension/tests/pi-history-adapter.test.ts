import type { AwarenessCommandCall } from '@octocodeai/octocode-awareness';
import { describe, expect, it, vi } from 'vitest';
import { createPiHistoryAdapter } from '../src/adapters/pi-history-adapter.js';

describe('Pi history adapter', () => {
  it('does not capture mutations under the default coordination profile', async () => {
    const run = vi.fn();
    const adapter = createPiHistoryAdapter({ run, agentId: () => 'pi:test' });
    await adapter.before({ toolCallId: 'ordinary-edit', toolName: 'file', input: { queries: [{ type: 'write', path: 'a.ts' }] } }, { cwd: '/tmp/awareness-default-profile' } as never);
    expect(run).not.toHaveBeenCalled();
    expect(adapter.pending()).toBe(0);
  });

  it('captures native file mutations before and after under one operation id', async () => {
    const calls: AwarenessCommandCall[] = [];
    const adapter = createPiHistoryAdapter({
      enabled: () => true, agentId: () => 'pi:test',
      run: async (args) => { calls.push(args); return { exitCode: 0, payload: {"ok":true,"operation":{}} }; },
    });
    const ctx = { cwd: '/tmp/workspace' } as never;
    await adapter.before({ toolCallId: 'call-1', toolName: 'file', input: { queries: [
      { type: 'edit', path: 'src/a.ts' }, { type: 'write', path: 'src/b.ts' },
    ] } }, ctx);
    await adapter.after({ toolCallId: 'call-1', toolName: 'file', result: {}, isError: false }, ctx);

    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(expect.objectContaining({ command: 'history capture', params: expect.objectContaining({ phase: 'before', file: ['src/a.ts', 'src/b.ts'] }) }));
    expect(calls[1]).toEqual(expect.objectContaining({ params: expect.objectContaining({ phase: 'after', outcome: 'success' }) }));
    expect(calls[1]).toEqual(expect.objectContaining({ params: expect.objectContaining({ session_id: 'unknown-session' }) }));
    expect(calls[1]?.params?.operation_id).toBe(calls[0]?.params?.operation_id);
    expect(adapter.pending()).toBe(0);
  });

  it('ignores paths from read, shell, MCP, and unknown tools', async () => {
    const run = vi.fn(async () => ({ exitCode: 0, payload: {"ok":true} }));
    const adapter = createPiHistoryAdapter({ run, agentId: () => 'pi:test' });
    for (const toolName of ['bash', 'MCPTool', 'localFetch', 'mystery']) {
      await adapter.before({ toolCallId: toolName, toolName, input: { queries: [{ type: 'write', path: 'src/a.ts' }] } });
    }
    expect(run).not.toHaveBeenCalled();
  });

  it('treats missing host correlation as an observational no-op', async () => {
    const run = vi.fn(async () => ({ exitCode: 0, payload: {"ok":true} }));
    const errors: Error[] = [];
    const adapter = createPiHistoryAdapter({ run, enabled: () => true, agentId: () => 'pi:test', onError: error => errors.push(error) });
    await adapter.before({ toolName: 'file', input: { queries: [{ type: 'write', path: 'a.ts' }] } } as never);
    expect(run).not.toHaveBeenCalled();
    expect(errors).toEqual([]);
    expect(adapter.pending()).toBe(0);
  });

  it('records failures and does not invent an after capture when before failed', async () => {
    const calls: AwarenessCommandCall[] = [];
    const errors: Error[] = [];
    const adapter = createPiHistoryAdapter({
      enabled: () => true, agentId: () => 'pi:test', onError: (error) => errors.push(error),
      run: async (args) => {
        calls.push(args);
        return calls.length === 1
          ? { exitCode: 1, payload: {"ok":false,"error":{"code":"failed","message":"nope"}} }
          : { exitCode: 0, payload: {"ok":true} };
      },
    });
    await adapter.before({ toolCallId: 'failed-before', toolName: 'file', input: { queries: [{ type: 'write', path: 'a.ts' }] } });
    await adapter.after({ toolCallId: 'failed-before', toolName: 'file', result: {}, isError: true });
    expect(calls).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });

  it('closes a successful before capture with a failure outcome', async () => {
    const calls: AwarenessCommandCall[] = [];
    const adapter = createPiHistoryAdapter({
      enabled: () => true, agentId: () => 'pi:test',
      run: async (args) => { calls.push(args); return { exitCode: 0, payload: {"ok":true,"operation":{}} }; },
    });
    await adapter.before({ toolCallId: 'failed-tool', toolName: 'file', input: { queries: [{ type: 'delete', path: 'a.ts' }] } });
    await adapter.after({ toolCallId: 'failed-tool', toolName: 'file', result: {}, isError: true });
    expect(calls[1]).toEqual(expect.objectContaining({ params: expect.objectContaining({ phase: 'after', outcome: 'failure' }) }));
  });

  it('is inert when persistent storage is disabled and deduplicates starts', async () => {
    const run = vi.fn(async () => ({ exitCode: 0, payload: {"ok":true,"operation":{}} }));
    const disabled = createPiHistoryAdapter({ run, enabled: () => false, agentId: () => 'pi:test' });
    const event = { toolCallId: 'same', toolName: 'file', input: { queries: [{ type: 'write', path: 'a.ts' }] } };
    await disabled.before(event);
    expect(run).not.toHaveBeenCalled();

    const enabled = createPiHistoryAdapter({ run, enabled: () => true, agentId: () => 'pi:test' });
    await enabled.before(event);
    await enabled.before(event);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('keeps a pending completion when the after capture fails so it can retry', async () => {
    let attempts = 0;
    const adapter = createPiHistoryAdapter({
      enabled: () => true, agentId: () => 'pi:test', onError: () => undefined,
      run: async () => {
        attempts += 1;
        return attempts === 2
          ? { exitCode: 1, payload: {"ok":false} }
          : { exitCode: 0, payload: {"ok":true,"operation":{}} };
      },
    });
    const before = { toolCallId: 'retry', toolName: 'file', input: { queries: [{ type: 'edit', path: 'a.ts' }] } };
    const after = { toolCallId: 'retry', toolName: 'file', result: {}, isError: false };
    await adapter.before(before);
    await adapter.after(after);
    expect(adapter.pending()).toBe(1);
    await adapter.after(after);
    expect(adapter.pending()).toBe(0);
  });
});
