import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import octocode from '../src/index.js';
import { fingerprint, projectConfigFiles, saveDecision } from '../src/shared/trust.js';
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
    // The refusal is recorded in the conversation: a control in the command shows as an escape.
    ctx.ui.selects.push('Deny');
    const hostile = (await fake.fire('user_bash', bash('rm -rf / # \u001b[2J'), ctx)) as Refusal;
    expect(hostile.result.output).toContain('rm -rf / # \\u{1b}[2J');
    expect(hostile.result.output).not.toContain('\u001b');
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

describe('user ! commands and a PreToolUse hook', () => {
  const bash = (command: string) => ({ type: 'user_bash', command, excludeFromContext: false, cwd: '/' });
  type Refusal = { result: { output: string; cancelled: boolean } };

  /** The composed extension in a trusted repository whose Codex hooks.json runs `command` before every Bash call (none when undefined). */
  async function withHook(mode: 'manual' | 'full', command?: string) {
    process.env['OCTOCODE_PERMISSION'] = mode;
    process.env['OCTOCODE_MCP'] = '0';
    process.env['OCTOCODE_HOOKS'] = '1';
    const cwd = tmp();
    fs.mkdirSync(path.join(cwd, '.git'));
    if (command) {
      fs.mkdirSync(path.join(cwd, '.codex'));
      fs.writeFileSync(path.join(cwd, '.codex', 'hooks.json'), JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command }] }] } }));
      saveDecision(cwd, fingerprint(projectConfigFiles(cwd)), true);
    }
    const fake = fakePi();
    Object.assign(fake.pi, { getSessionName: () => undefined });
    octocode(fake.pi);
    const ctx = Object.assign(fakeCtx({ cwd, hasUI: true, mode: 'rpc' }), { isProjectTrusted: () => true });
    await fake.fire('session_start', { type: 'session_start', reason: 'startup' }, ctx);
    const audit = () => fake.entries.map((entry) => entry.data as { action: string; allowed: boolean; via: string; note?: string });
    return { fake, ctx, audit };
  }
  const ask = `printf '%s' '{"hookSpecificOutput":{"permissionDecision":"ask","permissionDecisionReason":"check this one"}}'`;

  it('refuses a command a hook blocks, even in full, audited with the hook named', async () => {
    const { fake, ctx, audit } = await withHook('full', "echo 'no deploys from here' >&2; exit 2");
    const refused = (await fake.fire('user_bash', bash('echo hi'), ctx)) as Refusal;
    expect(refused.result.cancelled).toBe(true);
    expect(refused.result.output).toBe('Refused: Blocked by a PreToolUse hook: no deploys from here');
    expect(ctx.ui.selects).toEqual([]);
    expect(audit()).toContainEqual(expect.objectContaining({ allowed: false, via: 'invariant', note: expect.stringContaining('Blocked by a PreToolUse hook: no deploys from here') }));
    await fake.emit('session_shutdown', { type: 'session_shutdown' }, ctx);
  });

  it('shows no terminal control from a hook\'s reason in the refusal a person reads', async () => {
    const { fake, ctx } = await withHook('full', `printf 'no \\033]0;pwned\\007deploys \\342\\200\\256here' >&2; exit 2`);
    const refused = (await fake.fire('user_bash', bash('echo hi'), ctx)) as Refusal;
    expect(refused.result.cancelled).toBe(true);
    expect(refused.result.output).toMatch(/^Refused: Blocked by a PreToolUse hook: /);
    expect(refused.result.output).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e]/u);
    await fake.emit('session_shutdown', { type: 'session_shutdown' }, ctx);
  });

  it('asks about a command a hook flags in manual (Allow runs it, Deny refuses it)', async () => {
    const { fake, ctx } = await withHook('manual', ask);
    ctx.ui.selects.push('Deny');
    const refused = (await fake.fire('user_bash', bash('echo hi'), ctx)) as Refusal;
    expect(refused.result.output).toMatch(/^Refused: /);
    expect(ctx.ui.selects).toEqual([]);
    ctx.ui.selects.push('Allow once');
    expect(await fake.fire('user_bash', bash('echo hi'), ctx)).toBeUndefined();
    await fake.emit('session_shutdown', { type: 'session_shutdown' }, ctx);
  });

  it('runs the command unasked when no hook objects', async () => {
    const { fake, ctx, audit } = await withHook('manual');
    expect(await fake.fire('user_bash', bash('echo hi'), ctx)).toBeUndefined();
    expect(ctx.ui.selects).toEqual([]);
    expect(audit()).toEqual([expect.objectContaining({ action: 'shell', allowed: true, via: 'typed' })]);
    await fake.emit('session_shutdown', { type: 'session_shutdown' }, ctx);
  });
});
