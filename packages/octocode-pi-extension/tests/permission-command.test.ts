import { describe, expect, it, vi } from 'vitest';
import { Permission } from '../src/permission/ask.js';
import { registerPermissionCommand } from '../src/permission/command.js';
import { Subcommands } from '../src/shared/commands.js';
import { PERMISSION_ENV } from '../src/shared/env.js';
import { fakeCtx, fakePi } from './fake-pi.js';
import { tmp } from './helpers.js';

function setup(options: { trusted?: boolean; env?: NodeJS.ProcessEnv; confirms?: boolean[] } = {}) {
  const fake = fakePi();
  // Sessions start in full; these fixtures export workspace, or manual for the strict (`trusted: false`) case.
  const permission = new Permission({ pi: fake.pi, env: options.env ?? { OCTOCODE_PERMISSION: options.trusted === false ? 'manual' : 'workspace' }, isSubagent: false });
  const commands = new Subcommands();
  registerPermissionCommand(fake.pi, commands, permission, () => 42);
  const ctx = Object.assign(fakeCtx({ cwd: tmp(), ui: { confirms: options.confirms ?? [] } }), { isProjectTrusted: () => options.trusted ?? true });
  // Audit entries come back from the session, as Pi keeps them.
  ctx.sessionManager.getEntries = (() => fake.entries.map((entry) => ({ type: 'custom', ...entry }))) as never;
  // Raw terminal input and the editor's text, as Pi's TUI gives them to an extension.
  let input: ((data: string) => { consume?: boolean } | undefined) | undefined;
  let text = '';
  Object.assign(ctx.ui, { onTerminalInput: (handler: typeof input) => ((input = handler), () => (input = undefined)), getEditorText: () => text });
  ctx.ui.setEditorComponent(() => ({ render: () => [], invalidate: () => undefined, getText: () => text, setText: (value: string) => { text = value; }, handleInput: () => undefined }));
  permission.start(ctx);
  void fake.emit('session_start', { type: 'session_start' }, ctx);
  const run = (args: string) => commands.get('permission')!.handler(args, ctx);
  /** Tab with `typed` in the input line; returns whether Octocode took the key (else the editor completes as usual). */
  const tab = async (typed = ''): Promise<boolean> => {
    text = typed;
    const taken = input?.('\t')?.consume === true;
    await new Promise((resolve) => setImmediate(resolve));
    return taken;
  };
  const cycle = () => ctx.ui.editor!({} as never, {} as never, {} as never).handleInput?.('\u001b[Z');
  return { fake, permission, ctx, run, tab, cycle };
}

describe('/octocode permission and editor shortcut', () => {
  it('starts in full; the editor shortcut cycles full → workspace → manual → full', async () => {
    const { permission, cycle, ctx } = setup({ env: {} });
    expect(permission.mode).toBe('full');
    expect(ctx.ui.statuses.get('octocode-permission')).toBe('⏵⏵ permission: full · Shift+Tab');
    await cycle();
    expect(permission.mode).toBe('workspace');
    await cycle();
    expect(permission.mode).toBe('manual');
    await cycle();
    expect(permission.mode).toBe('full');
  });

  it('leaves Tab to the editor while something is typed (path completion)', async () => {
    const { permission, tab } = setup({ env: {} });
    expect(await tab('src/perm')).toBe(false);
    expect(permission.mode).toBe('full');
  });

  it('leaves selector Tab untouched when the main editor is empty', async () => {
    const { permission, tab, fake } = setup({ env: { OCTOCODE_PERMISSION: 'manual' } });
    expect(await tab()).toBe(false);
    expect(permission.mode).toBe('manual');
    expect(fake.shortcuts.has('tab')).toBe(false);
  });

  it('switches to any mode by command, full included, without a trust check or confirmation', async () => {
    const { permission, run, ctx } = setup({ trusted: false, env: { [PERMISSION_ENV]: 'manual' } });
    await run('full');
    expect(permission.mode).toBe('full');
    expect(ctx.ui.confirms).toEqual([]);
  });

  it('shows the mode, what it asks for, the grants and the provenance index', async () => {
    const { run, ctx } = setup();
    await run('');
    const shown = ctx.ui.notes.at(-1)!.message;
    expect(shown).toMatch(/^Permission mode: workspace/);
    expect(shown).toContain('file.outside: ask');
    expect(shown).toContain('shell: allow');
    expect(shown).toContain('shell.destructive: ask');
    expect(shown).toContain('browser.control: ask');
    expect(shown).toContain('hook.ask: ask');
    expect(shown).toContain('provenance: ask');
    expect(shown).toContain('Session grants: none');
    expect(shown).toContain('Provenance index: 42');
    expect(shown).toMatch(/not a sandbox/);
  });

  it('lists and clears grants, and shows the audit log', async () => {
    const { run, ctx, permission } = setup({ trusted: false });
    ctx.ui.selects.push('Allow `ls` for this session');
    await permission.check(ctx, { action: 'shell', title: 'Run?', what: ['ls'], grant: { key: 'ls', label: '`ls`' } });
    await run('grants');
    expect(ctx.ui.notes.at(-1)!.message).toContain('shell: `ls`');
    await run('grants clear');
    expect(permission.grants()).toEqual([]);
    await run('workspace');
    await run('log');
    const log = ctx.ui.notes.at(-1)!.message;
    expect(log).toMatch(/manual main shell allowed \(user\) ls/);
    expect(log).toMatch(/mode manual → workspace/);
    await run('bogus');
    expect(ctx.ui.notes.at(-1)).toMatchObject({ type: 'warning', message: expect.stringContaining('Usage: /octocode permission') });
  });

  it('says how many earlier decisions a long audit log leaves out', async () => {
    const { run, ctx, permission } = setup({ env: {} });
    for (let i = 0; i < 53; i++) permission.setMode(i % 2 === 0 ? 'manual' : 'full', ctx);
    await run('log');
    const lines = ctx.ui.notes.at(-1)!.message.split('\n');
    expect(lines[0]).toBe('(3 earlier decision(s) not shown; the session file keeps them all)');
    expect(lines).toHaveLength(51);
  });

  it('keeps headless status and mode-change feedback visible without writing to stdout', async () => {
    const { run, ctx } = setup();
    Object.assign(ctx, { hasUI: false, mode: 'print' });
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    try {
      await run('');
      expect(stderr).toHaveBeenLastCalledWith(expect.stringContaining('Permission mode: workspace'));
      await run('manual');
      expect(stderr).toHaveBeenLastCalledWith(expect.stringContaining('Permission mode: manual'));
      expect(stdout).not.toHaveBeenCalled();
    } finally {
      stderr.mockRestore();
      stdout.mockRestore();
    }
  });
});
