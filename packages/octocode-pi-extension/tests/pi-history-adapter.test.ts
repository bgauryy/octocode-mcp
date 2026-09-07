import { describe, expect, it, vi } from 'vitest';
import { createPiHistoryAdapter } from '../src/adapters/pi-history-adapter.js';

describe('Pi history adapter', () => {
  it('captures native file mutations before and after under one operation id', async () => {
    const calls: string[][] = [];
    const adapter = createPiHistoryAdapter({
      agentId: () => 'pi:test',
      run: async (args) => { calls.push(args); return { code: 0, stdout: '{"ok":true,"operation":{}}', stderr: '' }; },
    });
    const ctx = { cwd: '/tmp/workspace' } as never;
    await adapter.before({ toolCallId: 'call-1', toolName: 'file', input: { queries: [
      { type: 'edit', path: 'src/a.ts' }, { type: 'write', path: 'src/b.ts' },
    ] } }, ctx);
    await adapter.after({ toolCallId: 'call-1', toolName: 'file', result: {}, isError: false }, ctx);

    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(expect.arrayContaining(['--phase', 'before', '--file', 'src/a.ts', '--file', 'src/b.ts']));
    expect(calls[1]).toEqual(expect.arrayContaining(['--phase', 'after', '--outcome', 'success']));
    expect(calls[1]).toEqual(expect.arrayContaining(['--session-id', 'unknown-session']));
    expect(calls[1]?.[calls[1].indexOf('--operation-id') + 1]).toBe(calls[0]?.[calls[0].indexOf('--operation-id') + 1]);
    expect(adapter.pending()).toBe(0);
  });

  it('ignores paths from read, shell, MCP, and unknown tools', async () => {
    const run = vi.fn(async () => ({ code: 0, stdout: '{"ok":true}', stderr: '' }));
    const adapter = createPiHistoryAdapter({ run, agentId: () => 'pi:test' });
    for (const toolName of ['bash', 'MCPTool', 'localGetFileContent', 'mystery']) {
      await adapter.before({ toolCallId: toolName, toolName, input: { queries: [{ type: 'write', path: 'src/a.ts' }] } });
    }
    expect(run).not.toHaveBeenCalled();
  });

  it('treats missing host correlation as an observational no-op', async () => {
    const run = vi.fn(async () => ({ code: 0, stdout: '{"ok":true}', stderr: '' }));
    const errors: Error[] = [];
    const adapter = createPiHistoryAdapter({ run, enabled: () => true, agentId: () => 'pi:test', onError: error => errors.push(error) });
    await adapter.before({ toolName: 'file', input: { queries: [{ type: 'write', path: 'a.ts' }] } } as never);
    expect(run).not.toHaveBeenCalled();
    expect(errors).toEqual([]);
    expect(adapter.pending()).toBe(0);
  });

  it('records failures and does not invent an after capture when before failed', async () => {
    const calls: string[][] = [];
    const errors: Error[] = [];
    const adapter = createPiHistoryAdapter({
      agentId: () => 'pi:test', onError: (error) => errors.push(error),
      run: async (args) => {
        calls.push(args);
        return calls.length === 1
          ? { code: 1, stdout: '{"ok":false,"error":{"code":"failed","message":"nope"}}', stderr: '' }
          : { code: 0, stdout: '{"ok":true}', stderr: '' };
      },
    });
    await adapter.before({ toolCallId: 'failed-before', toolName: 'file', input: { queries: [{ type: 'write', path: 'a.ts' }] } });
    await adapter.after({ toolCallId: 'failed-before', toolName: 'file', result: {}, isError: true });
    expect(calls).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });

  it('closes a successful before capture with a failure outcome', async () => {
    const calls: string[][] = [];
    const adapter = createPiHistoryAdapter({
      agentId: () => 'pi:test',
      run: async (args) => { calls.push(args); return { code: 0, stdout: '{"ok":true,"operation":{}}', stderr: '' }; },
    });
    await adapter.before({ toolCallId: 'failed-tool', toolName: 'file', input: { queries: [{ type: 'delete', path: 'a.ts' }] } });
    await adapter.after({ toolCallId: 'failed-tool', toolName: 'file', result: {}, isError: true });
    expect(calls[1]).toEqual(expect.arrayContaining(['--phase', 'after', '--outcome', 'failure']));
  });

  it('is inert when persistent storage is disabled and deduplicates starts', async () => {
    const run = vi.fn(async () => ({ code: 0, stdout: '{"ok":true,"operation":{}}', stderr: '' }));
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
          ? { code: 1, stdout: '{"ok":false}', stderr: 'temporary failure' }
          : { code: 0, stdout: '{"ok":true,"operation":{}}', stderr: '' };
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
