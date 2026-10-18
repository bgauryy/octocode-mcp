import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RequestPermissionRequest, RequestPermissionResponse } from '@agentclientprotocol/sdk';
import { AcpBackend, AcpError, type AcpPermission } from '../src/external/acp.js';
import { processAlive } from '../src/shared/process.js';

const fixture = fileURLToPath(new URL('./fixtures/external-acp-agent.mjs', import.meta.url));
// Failure bound for a child's start-up and replies: a node child (or a proxy and an agent) takes seconds to start when the machine is loaded far past its cores, and a passing call returns as soon as it is answered. Tests of the timeout itself pass their own short values.
const WORK_MS = 60_000;
const roots: string[] = [];
const backends: AcpBackend[] = [];
const deny: AcpPermission = async () => ({ outcome: { outcome: 'selected', optionId: 'deny' } });
interface Entry { event: string; pid?: number; text?: string; params?: Record<string, unknown>; response?: RequestPermissionResponse }

function setup(mode = 'stream'): { root: string; journal: string; input: { command: string; args: string[]; vendor: string; cwd: string; timeoutMs: number } } {
  const root = mkdtempSync(join(tmpdir(), 'external-acp-'));
  roots.push(root);
  const journal = join(root, 'events.jsonl');
  return { root, journal, input: { command: process.execPath, args: [fixture, mode, journal], vendor: 'fixture', cwd: root, timeoutMs: WORK_MS } };
}
function entries(journal: string): Entry[] {
  try { return readFileSync(journal, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Entry); }
  catch { return []; }
}
async function connect(mode = 'stream', permission = deny): Promise<{ backend: AcpBackend; journal: string }> {
  const { input, journal } = setup(mode);
  const backend = await AcpBackend.connect(input, permission);
  backends.push(backend);
  return { backend, journal };
}
async function waitForPrompt(journal: string): Promise<void> {
  await vi.waitFor(() => expect(entries(journal).filter((entry) => entry.event === 'prompt')).toHaveLength(1));
}

afterEach(async () => {
  await Promise.all(backends.splice(0).map((backend) => backend.close()));
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('external ACP backend over SDK stdio', () => {
  it('negotiates ACP, canonicalizes cwd, preserves every non-thought update and supports multiple prompts', async () => {
    const { input, root, journal } = setup();
    const alias = `${root}-alias`;
    roots.push(alias);
    symlinkSync(root, alias);
    const backend = await AcpBackend.connect({ ...input, cwd: alias }, deny);
    backends.push(backend);
    expect(backend.cwd).toBe(realpathSync(root));
    expect(backend.sessionId).toBe('fixture-session');
    const reply = await backend.prompt('hello; $(still literal)', { timeoutMs: WORK_MS });
    expect(reply.text).toBe('first\nhello; $(still literal)');
    expect(reply.stopReason).toBe('end_turn');
    // The reply's text chunks merge per run between other updates: text, tool call, image, text, response.
    const kinds = reply.updates!.map((entry) => (entry as { update?: { sessionUpdate: string; content?: { type: string } }; type?: string }).update ?? { sessionUpdate: (entry as { type: string }).type });
    expect(kinds.map((kind) => `${kind.sessionUpdate}${kind.content ? `:${kind.content.type}` : ''}`)).toEqual(['agent_message_chunk:text', 'tool_call', 'agent_message_chunk:image', 'agent_message_chunk:text', 'prompt_response']);
    expect((reply.updates![3] as { update: { content: { text: string } } }).update.content.text).toBe('hello; $(still literal)');
    const serialized = JSON.stringify(reply.updates);
    expect(serialized).not.toMatch(/wrong-session-output|private-thought/);
    expect(serialized).toContain('image/png');
    expect(serialized).toContain(JSON.stringify('evidence\n'.repeat(25_000)).slice(1, -1));
    expect((await backend.prompt('again', { timeoutMs: WORK_MS })).text).toBe('first\nagain');
    const initialization = entries(journal).find((entry) => entry.event === 'initialize');
    expect(initialization?.params?.clientCapabilities).toMatchObject({ fs: { readTextFile: false, writeTextFile: false }, terminal: false });
    expect(entries(journal).filter((entry) => entry.event === 'new')).toHaveLength(1);
  });

  it('loads an explicitly named saved session only when capability is advertised', async () => {
    const { input, journal } = setup();
    const backend = await AcpBackend.connect({ ...input, sessionId: 'saved-session' }, deny);
    backends.push(backend);
    expect(backend.sessionId).toBe('saved-session');
    expect(entries(journal).some((entry) => entry.event === 'new')).toBe(false);
    expect(entries(journal).find((entry) => entry.event === 'load')?.params?.sessionId).toBe('saved-session');
    expect((await backend.prompt('continued', { timeoutMs: WORK_MS })).text).toBe('first\ncontinued');
  });

  it.each(['no-load', 'missing-session'])('never replaces an unavailable saved session (%s)', async (mode) => {
    const { input, journal } = setup(mode);
    await expect(AcpBackend.connect({ ...input, sessionId: 'saved-session' }, deny)).rejects.toThrow(/session\/load|saved conversation/);
    expect(entries(journal).some((entry) => entry.event === 'new')).toBe(false);
    expect(processAlive(entries(journal)[0]?.pid)).toBe(false);
  });

  it.each(['wrong-version', 'empty-id', 'crash-initialize'])('fails startup and reaps its owned process (%s)', async (mode) => {
    const { input, journal } = setup(mode);
    await expect(AcpBackend.connect(input, deny)).rejects.toThrow(/ACP connection failed/);
    expect(processAlive(entries(journal)[0]?.pid)).toBe(false);
  });

  it.each(['hang-initialize', 'hang-new', 'hang-load'])('bounds startup and reaps its process (%s)', async (mode) => {
    const { input, journal } = setup(mode);
    const sessionId = mode === 'hang-load' ? 'saved-session' : undefined;
    await expect(AcpBackend.connect({ ...input, sessionId, timeoutMs: 300 }, deny)).rejects.toThrow(/ACP connection failed.*aborted due to timeout/);
    expect(processAlive(entries(journal)[0]?.pid)).toBe(false);
  });

  it('does not launch when already aborted, and rejects executable failures', async () => {
    const { input, journal } = setup();
    await expect(AcpBackend.connect(input, deny, AbortSignal.abort(new Error('cancelled before startup')))).rejects.toThrow('cancelled before startup');
    expect(entries(journal)).toEqual([]);
    await expect(AcpBackend.connect({ ...input, command: join(input.cwd, 'missing-agent') }, deny)).rejects.toThrow('ACP connection failed');
  });

  it('reaps startup when its caller aborts during initialize', async () => {
    const { input, journal } = setup('hang-initialize');
    const controller = new AbortController();
    const connected = AcpBackend.connect(input, deny, controller.signal).catch((error: unknown) => error);
    await vi.waitFor(() => expect(entries(journal).some((entry) => entry.event === 'initialize')).toBe(true));
    controller.abort(new Error('caller cancelled startup'));
    expect((await connected as Error).message).toContain('caller cancelled startup');
    expect(processAlive(entries(journal)[0]?.pid)).toBe(false);
  });

  it('rejects invalid connect inputs without launching a process', async () => {
    const { input, journal } = setup();
    await expect(AcpBackend.connect({ ...input, timeoutMs: 0 }, deny)).rejects.toThrow('positive timer duration');
    await expect(AcpBackend.connect({ ...input, vendor: ' ' }, deny)).rejects.toThrow('real host vendor');
    await expect(AcpBackend.connect({ ...input, command: ' ' }, deny)).rejects.toThrow('executable');
    await expect(AcpBackend.connect({ ...input, cwd: fixture }, deny)).rejects.toThrow('directory');
    expect(entries(journal)).toEqual([]);
  });

  it('forwards permission decisions without auto approval and ignores requests for another session', async () => {
    const permission = vi.fn(deny);
    const { backend } = await connect('permission', permission);
    const result = await backend.prompt('edit', { timeoutMs: WORK_MS });
    expect(permission).toHaveBeenCalledTimes(1);
    expect(permission.mock.calls[0]?.[0].toolCall.rawInput).toEqual({ path: '/tmp/example' });
    expect(result.text).toContain('"optionId":"deny"');
    const wrong = await connect('wrong-permission', permission);
    expect((await wrong.backend.prompt('edit', { timeoutMs: WORK_MS })).text).toContain('"outcome":"cancelled"');
    expect(permission).toHaveBeenCalledTimes(1);
  });

  it('rejects unsupported client fs requests rather than claiming capabilities', async () => {
    const { backend } = await connect('require-fs');
    await expect(backend.prompt('read', { timeoutMs: WORK_MS })).rejects.toBeInstanceOf(AcpError);
    await expect(backend.prompt('retry', { timeoutMs: WORK_MS })).rejects.toThrow('closed');
  });

  it('rejects overlapping prompts without submitting the second prompt', async () => {
    const { backend, journal } = await connect('wait');
    const first = backend.prompt('first', { timeoutMs: WORK_MS }).catch((error: unknown) => error);
    await waitForPrompt(journal);
    await expect(backend.prompt('second', { timeoutMs: WORK_MS })).rejects.toThrow('already has an active prompt');
    await backend.cancel();
    expect(await first).toBeInstanceOf(AcpError);
    expect(entries(journal).filter((entry) => entry.event === 'prompt')).toHaveLength(1);
    await expect(backend.prompt('retry', { timeoutMs: WORK_MS })).rejects.toThrow('closed');
  });

  it('timeouts preserve partial evidence, report uncertainty, and kill owned descendants without replay', async () => {
    const { backend, journal } = await connect('descendant');
    // The timer starts at the call and must outlast the agent's first streamed chunk (the partial evidence asserted below).
    const error = await backend.prompt('first', { timeoutMs: 2_000 }).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(AcpError);
    expect((error as AcpError).partial.text).toBe('first\n');
    expect((error as AcpError).execution).toBe('uncertain');
    expect((error as Error).message).toContain('not replayed');
    const pids = entries(journal).filter((entry) => entry.event === 'start' || entry.event === 'descendant').map((entry) => entry.pid);
    expect(pids).toHaveLength(2);
    expect(pids.every((pid) => !processAlive(pid))).toBe(true);
    expect(entries(journal).filter((entry) => entry.event === 'prompt')).toHaveLength(1);
  });

  it('cancels a stalled permission handler and never sends its later approval', async () => {
    let permissionSignal: AbortSignal | undefined;
    let approve: ((response: RequestPermissionResponse) => void) | undefined;
    const permission = vi.fn((_request: RequestPermissionRequest, signal: AbortSignal) => {
      permissionSignal = signal;
      return new Promise<RequestPermissionResponse>((resolve) => { approve = resolve; });
    });
    const { backend } = await connect('permission', permission);
    const result = backend.prompt('edit', { timeoutMs: WORK_MS }).catch((error: unknown) => error);
    await vi.waitFor(() => expect(permission).toHaveBeenCalledOnce());
    await backend.cancel();
    expect(await result).toBeInstanceOf(AcpError);
    expect(permissionSignal?.aborted).toBe(true);
    approve?.({ outcome: { outcome: 'selected', optionId: 'allow' } });
  });

  it('rejects permission selections not offered by the peer and permission callback failures', async () => {
    for (const permission of [
      async (): Promise<RequestPermissionResponse> => ({ outcome: { outcome: 'selected', optionId: 'unknown' } }),
      async (): Promise<RequestPermissionResponse> => { throw new Error('permission host failed'); },
    ]) {
      const { backend, journal } = await connect('permission', permission);
      await expect(backend.prompt('edit', { timeoutMs: WORK_MS })).rejects.toBeInstanceOf(AcpError);
      expect(processAlive(entries(journal)[0]?.pid)).toBe(false);
    }
  });

  it('honors the prompt caller abort signal and preserves completed chunks', async () => {
    const { backend, journal } = await connect('wait');
    const controller = new AbortController();
    const reply = backend.prompt('work', { timeoutMs: WORK_MS, signal: controller.signal }).catch((error: unknown) => error);
    await waitForPrompt(journal);
    controller.abort(new Error('caller stopped work'));
    const error = await reply as AcpError;
    expect(error.message).toContain('caller stopped work');
    expect(error.partial.text).toBe('first\n');
    expect(processAlive(entries(journal)[0]?.pid)).toBe(false);
  });

  it.each(['fail-prompt', 'crash-prompt'])('closes on failed or disconnected prompts and retains diagnostics (%s)', async (mode) => {
    const { backend, journal } = await connect(mode);
    const error = await backend.prompt('first', { timeoutMs: WORK_MS }).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(AcpError);
    expect((error as AcpError).partial.text).toBe('first\n');
    if (mode === 'crash-prompt') expect((error as AcpError).stderr).toContain('fixture diagnostic');
    expect(processAlive(entries(journal)[0]?.pid)).toBe(false);
  });

  it('close is idempotent and rejects active work; cancel on an idle connection leaves it usable', async () => {
    const idle = await connect();
    await idle.backend.cancel();
    expect((await idle.backend.prompt('usable', { timeoutMs: WORK_MS })).text).toBe('first\nusable');
    const { backend, journal } = await connect('wait');
    const active = backend.prompt('first', { timeoutMs: WORK_MS }).catch((error: unknown) => error);
    await waitForPrompt(journal);
    await Promise.all([backend.close(), backend.close()]);
    expect(await active).toBeInstanceOf(AcpError);
    expect(processAlive(entries(journal)[0]?.pid)).toBe(false);
  });
});
