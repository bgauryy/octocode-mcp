import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OctocodeApi } from '../src/api/bridge.js';
import { ApiCallError, ApiClient } from '../src/api/client.js';
import { ExternalAgents } from '../src/external/manager.js';
import { registerExternal } from '../src/external/register.js';
import { Subcommands } from '../src/shared/commands.js';
import { fakeCtx, fakePi } from './fake-pi.js';
import { tmp } from './helpers.js';

const token = `sk-ant-${'a'.repeat(40)}`;
const cleanup: Array<() => Promise<void>> = [];
beforeEach(() => vi.stubEnv('OCTOCODE_HOME', tmp()));
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); vi.restoreAllMocks(); });
async function apiClient(externalCall: () => Promise<unknown>) {
  const fake = fakePi();
  const api = new OctocodeApi(fake.pi, { list: () => [], tell: () => undefined, deliverable: (text) => text }, () => 'test', { OCTOCODE_HOME: tmp() }, { externalCall });
  cleanup.push(() => api.stop());
  await api.start(fakeCtx({ cwd: tmp() }), { socket: true });
  return new ApiClient(api.instance!);
}

describe('external evidence boundaries', () => {
  it('redacts structured tool details as well as the rendered evidence', async () => {
    const fake = fakePi();
    vi.spyOn(ExternalAgents.prototype, 'call').mockResolvedValue({ reply: { text: token, updates: [{ text: 'complete evidence' }] } });
    registerExternal(fake.pi, new Subcommands(), {
      authorize: async () => undefined, beforeSend: async () => undefined, afterReceive: async () => undefined,
      permission: () => async () => ({ outcome: { outcome: 'cancelled' } }), sender: () => 'test',
    });
    const result = await fake.tools.get('externalAgent')!.execute('tool', { action: 'list' }, undefined, undefined, fakeCtx({ cwd: tmp() }));
    expect(JSON.stringify(result)).not.toContain(token);
    expect(result.details).toEqual({ reply: { text: '[redacted]', updates: [{ text: 'complete evidence' }] } });
  });

  it('keeps complete large API results readable beyond the transport frame', async () => {
    const evidence = { reply: { text: 'body\n'.repeat(300_000) + token, updates: [{ last: 'final evidence' }] } };
    const client = await apiClient(async () => evidence);
    const result = await client.call<{ fullOutput: { path: string; bytes: number; format: string } }>('external.call', { action: 'list' });
    const whole = fs.readFileSync(result.fullOutput.path, 'utf8');
    expect(Buffer.byteLength(whole)).toBe(result.fullOutput.bytes);
    expect(result.fullOutput.format).toBe('json');
    expect(whole).not.toContain(token);
    expect(JSON.parse(whole)).toEqual({ reply: { text: 'body\n'.repeat(300_000) + '[redacted]', updates: [{ last: 'final evidence' }] } });
    expect(fs.statSync(result.fullOutput.path).mode & 0o777).toBe(0o600);
  });

  it('retains execution state and full redacted partial evidence on oversized errors', async () => {
    const client = await apiClient(async () => { throw Object.assign(new Error(`failure ${token}`), { execution: 'uncertain', partial: { text: 'partial '.repeat(150_000) }, stderr: token }); });
    let failure: unknown;
    try { await client.call('external.call', { action: 'prompt', id: 'test', text: 'task' }); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(ApiCallError);
    const error = failure as ApiCallError;
    expect(error.message).not.toContain(token);
    const data = error.data as { execution: string; fullOutput: { path: string } };
    expect(data.execution).toBe('uncertain');
    const whole = JSON.parse(fs.readFileSync(data.fullOutput.path, 'utf8'));
    expect(whole.partial.text).toBe('partial '.repeat(150_000));
    expect(whole.stderr).toBe('[redacted]');
  });
});
