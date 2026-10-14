import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import octocode from '../src/index.js';
import { fakeCtx, fakePi } from './fake-pi.js';
import { tmp } from './helpers.js';

let saved: NodeJS.ProcessEnv;
beforeEach(() => {
  saved = { ...process.env };
  process.env['OCTOCODE_HOME'] = tmp();
});
afterEach(() => {
  process.env = saved;
});

/** The composed extension on a fake Pi, with a TUI session in a trusted-looking temp project. */
function setup(options: { hasUI?: boolean } = {}) {
  const fake = fakePi();
  octocode(fake.pi);
  const cwd = tmp();
  const ctx = fakeCtx({ cwd, hasUI: options.hasUI ?? true });
  Object.assign(ctx, { isProjectTrusted: () => false });
  return { fake, ctx, cwd };
}

/** A session_before_* outcome as Pi's runner decides it: the first cancel wins, else the last defined result. */
async function decide(fake: ReturnType<typeof fakePi>, event: string, payload: unknown, ctx: unknown): Promise<unknown> {
  let result: unknown;
  for (const handler of fake.handlers.get(event) ?? []) {
    const each = (await handler(payload, ctx)) as { cancel?: boolean } | undefined;
    if (each?.cancel) return each;
    result = each ?? result;
  }
  return result;
}

describe('leaving a session with running work', () => {
  it('asks before a switch, new session or fork stops running jobs; No cancels, headless never asks', async () => {
    const { fake, ctx, cwd } = setup();
    // Nothing running: no question.
    expect(await decide(fake, 'session_before_switch', { type: 'session_before_switch', reason: 'resume' }, ctx)).toBeUndefined();
    expect(ctx.ui.confirms).toEqual([]);

    await fake.tools.get('bash').execute('t1', { command: 'sleep 30', background: true }, undefined, undefined, ctx);
    try {
      let asked = '';
      Object.assign(ctx.ui, { confirm: async (_title: string, message: string) => ((asked = message), ctx.ui.confirms.shift() ?? false) });
      ctx.ui.confirms.push(false);
      expect(await decide(fake, 'session_before_switch', { type: 'session_before_switch', reason: 'new' }, ctx)).toEqual({ cancel: true });
      expect(asked).toBe('Stop 1 bash job and start a new session?');
      ctx.ui.confirms.push(false);
      // A No cancels the fork (with no checkpoints here, this does not exercise the restore offer).
      expect(await decide(fake, 'session_before_fork', { type: 'session_before_fork', entryId: 'e1' }, ctx)).toEqual({ cancel: true });
      expect(asked).toBe('Stop 1 bash job and fork?');
      ctx.ui.confirms.push(true);
      expect(await decide(fake, 'session_before_switch', { type: 'session_before_switch', reason: 'resume' }, ctx)).toBeUndefined();
      expect(asked).toBe('Stop 1 bash job and switch sessions?');

      const headless = fakeCtx({ cwd, hasUI: false });
      expect(await decide(fake, 'session_before_switch', { type: 'session_before_switch', reason: 'new' }, headless)).toBeUndefined();
    } finally {
      await fake.emit('session_shutdown', { type: 'session_shutdown' }, ctx);
    }
  });
});

describe('user ! commands', () => {
  const bash = (command: string) => ({ type: 'user_bash', command, excludeFromContext: false, cwd: '/' });
  type Refusal = { result: { output: string; cancelled: boolean } };
  const audit = (fake: ReturnType<typeof fakePi>) => fake.entries.map((entry) => entry.data as { action: string; allowed: boolean; via: string; mode: string });

  async function started(mode: 'manual' | 'workspace' | 'full', options: { hasUI?: boolean } = {}) {
    process.env['OCTOCODE_PERMISSION'] = mode;
    process.env['OCTOCODE_MCP'] = '0';
    const session = setup(options);
    Object.assign(session.ctx, { mode: 'rpc' });
    await session.fake.fire('session_start', { type: 'session_start', reason: 'startup' }, session.ctx);
    return session;
  }

  it('is consent in full: every command runs, a destructive one included, and the audit says so', async () => {
    const { fake, ctx } = await started('full');
    expect(await fake.fire('user_bash', bash('echo fine'), ctx)).toBeUndefined();
    expect(await fake.fire('user_bash', bash('rm -rf /'), ctx)).toBeUndefined();
    expect(ctx.ui.selects).toEqual([]);
    expect(audit(fake)).toEqual([
      expect.objectContaining({ action: 'shell', allowed: true, via: 'typed' }),
      expect.objectContaining({ action: 'shell.destructive', allowed: true, via: 'mode', mode: 'full' }),
    ]);
    await fake.emit('session_shutdown', { type: 'session_shutdown' }, ctx);
  });

  it.each(['manual', 'workspace'] as const)('keeps the confirm for a destructive command in %s: refused on Deny, run on Allow', async (mode) => {
    const { fake, ctx } = await started(mode);
    expect(await fake.fire('user_bash', bash('echo fine'), ctx)).toBeUndefined();
    ctx.ui.selects.push('Deny');
    const refused = (await fake.fire('user_bash', bash('rm -rf /'), ctx)) as Refusal;
    expect(refused.result.cancelled).toBe(true);
    expect(refused.result.output).toMatch(/^Refused: /);
    ctx.ui.selects.push('Allow once');
    expect(await fake.fire('user_bash', bash('rm -rf /'), ctx)).toBeUndefined();
    await fake.emit('session_shutdown', { type: 'session_shutdown' }, ctx);
  });

  it('follows the matrix with no UI: a destructive command is refused unless the mode is full', async () => {
    const workspace = await started('workspace', { hasUI: false });
    expect(await workspace.fake.fire('user_bash', bash('echo fine'), workspace.ctx)).toBeUndefined();
    expect(((await workspace.fake.fire('user_bash', bash('rm -rf /'), workspace.ctx)) as Refusal).result.output).toMatch(/^Refused: /);
    await workspace.fake.emit('session_shutdown', { type: 'session_shutdown' }, workspace.ctx);
  });
});
