import fs from 'node:fs';
import path from 'node:path';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OctocodeApi } from '../src/api/bridge.js';
import { ApiClient } from '../src/api/client.js';
import { ExternalAgents } from '../src/external/manager.js';
import { registerHooks } from '../src/hooks/register.js';
import type { MessageEnvelope } from '../src/shared/messages.js';
import { fingerprint, projectConfigFiles, saveDecision } from '../src/shared/trust.js';
import { Team } from '../src/team/session.js';
import { EXTERNAL_SENDER } from '../src/shared/messages.js';
import { TeamStore } from '../src/team/store.js';
import { fakeCtx, fakePi } from './fake-pi.js';
import { tmp } from './helpers.js';

const cleanup: Array<() => unknown> = [];
beforeEach(() => vi.stubEnv('OCTOCODE_HOME', tmp('octocode-message-integration-home-')));
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

async function hookRuntime(hooks: unknown) {
  const cwd = tmp('octocode-message-integration-');
  fs.mkdirSync(path.join(cwd, '.git'));
  fs.mkdirSync(path.join(cwd, '.codex'));
  fs.writeFileSync(path.join(cwd, '.codex', 'hooks.json'), JSON.stringify({ hooks }));
  saveDecision(cwd, fingerprint(projectConfigFiles(cwd)), true);
  const fake = fakePi();
  const ctx = fakeCtx({ cwd, hasUI: false });
  const view = registerHooks(fake.pi, { OCTOCODE_HOOKS: '1' }, tmp());
  await fake.fire('session_start', { reason: 'startup' }, ctx);
  const beforeSend = async (message: MessageEnvelope, context: ExtensionContext, signal?: AbortSignal) => {
    const verdict = await view.messageSend(message, signal ? { ...context, signal } : context);
    if (verdict?.block) throw new Error(verdict.block);
    if (verdict?.ask) throw new Error('The test permission authority denies hook asks.');
  };
  return { ...fake, cwd, ctx, view, beforeSend };
}

const commands = (command: string) => [{ hooks: [{ type: 'command', command }] }];

describe('message hook integration', () => {
  it('denies a main API message before producing a deliverable or starting Pi', async () => {
    const runtime = await hookRuntime({ PreMessageSend: commands('echo denied >&2; exit 2') });
    const deliverable = vi.fn((text: string) => { fs.writeFileSync(path.join(runtime.cwd, 'stored-body'), text); return text; });
    const api = new OctocodeApi(runtime.pi, { list: () => [], tell: () => ({ error: 'unused' }), deliverable }, () => 'test', { OCTOCODE_HOME: tmp() }, { messageSend: runtime.beforeSend });
    cleanup.push(() => api.stop());
    api.observe();
    await api.start(runtime.ctx, { socket: true });
    await expect(new ApiClient(api.instance!).call('message.send', { text: 'body '.repeat(20_000), from: 'test-client' })).rejects.toThrow('denied');
    expect(runtime.sent).toEqual([]);
    expect(deliverable).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(runtime.cwd, 'stored-body'))).toBe(false);
  });

  it('routes API agents.tell through the Team gate before persistence', async () => {
    const runtime = await hookRuntime({ PreMessageSend: commands('echo denied internal >&2; exit 2') });
    const dbFile = path.join(tmp(), 'team.sqlite');
    const team = new Team(runtime.pi, { OCTOCODE_AGENT_DB: dbFile });
    const peer = new Team(fakePi().pi, { OCTOCODE_AGENT_DB: dbFile });
    cleanup.push(() => team.stop(), () => peer.stop());
    team.start(runtime.ctx);
    peer.start(runtime.ctx);
    team.join();
    const receiver = peer.join().id;
    team.setMessageHook(runtime.beforeSend);
    const api = new OctocodeApi(runtime.pi, {
      list: () => team.members(), tell: (to, text) => team.send(to, text, { from: EXTERNAL_SENDER }), deliverable: (text) => text,
    }, () => 'test', { OCTOCODE_HOME: tmp() }, { messageSend: runtime.beforeSend });
    cleanup.push(() => api.stop());
    api.observe();
    await api.start(runtime.ctx, { socket: true });
    await expect(new ApiClient(api.instance!).call('agents.tell', { to: receiver, text: 'internal body' })).rejects.toThrow('denied internal');
    const store = TeamStore.open(runtime.cwd, dbFile, {});
    try { expect(store.recent()).toEqual([]); } finally { store.close(); }
  });

  it('gates the actual external prompt and correlates the observed reply without generating another prompt', async () => {
    const runtime = await hookRuntime({
      PreMessageSend: commands('node guard.cjs'),
      PostMessageReceive: commands(`cat >> replies.jsonl; printf '\\n' >> replies.jsonl; echo '{"decision":"block","reason":"reply again"}'`),
    });
    fs.writeFileSync(path.join(runtime.cwd, 'guard.cjs'), `let input='';process.stdin.on('data',chunk=>input+=chunk).on('end',()=>{if(JSON.parse(input).message.text==='deny'){console.error('blocked destination');process.exitCode=2}});`);
    const backend = { cwd: runtime.cwd, sessionId: 'backend-session', prompt: vi.fn(async (_text: string, _options: { key?: string }) => ({ text: 'completed reply', stopReason: 'end_turn' })), cancel: vi.fn(async () => undefined), close: vi.fn(async () => undefined) };
    const observed: MessageEnvelope[] = [];
    const external = new ExternalAgents({
      beforeSend: runtime.beforeSend, authorize: async () => undefined, sender: () => 'main-agent', permission: () => async () => ({ outcome: { outcome: 'cancelled' } }),
      afterReceive: async (message, ctx) => { observed.push(message); await runtime.view.messageReceive(message, ctx); },
    }, { acp: (async () => backend) as never, pi: (async () => backend) as never });
    cleanup.push(() => external.reset());
    await external.call({ action: 'connect', id: 'peer', transport: 'acp', vendor: 'test', command: 'unused' }, runtime.ctx);
    await expect(external.call({ action: 'prompt', id: 'peer', text: 'deny' }, runtime.ctx)).rejects.toThrow('blocked destination');
    expect(backend.prompt).not.toHaveBeenCalled();
    expect(observed).toEqual([]);
    await expect(external.call({ action: 'prompt', id: 'peer', text: 'allow' }, runtime.ctx)).resolves.toMatchObject({ reply: { text: 'completed reply' } });
    expect(backend.prompt).toHaveBeenCalledTimes(1);
    expect(observed).toEqual([expect.objectContaining({ channel: 'external', direction: 'inbound', from: 'peer', to: 'main-agent', text: 'completed reply', replyTo: backend.prompt.mock.calls[0]![1].key })]);
    expect(runtime.sent).toEqual([]);
  });
});
