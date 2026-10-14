import { describe, expect, it } from 'vitest';
import { Permission } from '../src/permission/ask.js';
import type { PermissionRequest } from '../src/permission/request.js';
import { parseGrants } from '../src/permission/mode.js';
import { askReview } from '../src/files/review.js';
import { PERMISSION_GRANTS_ENV } from '../src/shared/env.js';
import { fakeCtx, fakePi } from './fake-pi.js';
import { tmp } from './helpers.js';

/** A manual-mode session in an untrusted folder, whose dialog answers are scripted and whose titles and choices are recorded. */
function manual(answers: Array<string | undefined>) {
  const fake = fakePi();
  const permission = new Permission({ pi: fake.pi, env: { OCTOCODE_PERMISSION: 'manual' }, isSubagent: false });
  const asked: Array<{ title: string; choices: string[] }> = [];
  const ctx = Object.assign(fakeCtx({ cwd: tmp() }), { isProjectTrusted: () => false });
  Object.assign(ctx.ui, { select: async (title: string, choices: string[]) => (asked.push({ title, choices }), answers.shift()) });
  permission.start(ctx as never);
  return { permission, ctx, asked };
}

const shell = (command: string): PermissionRequest => ({ action: 'shell', title: 'Run this command?', what: [command] });

describe('allow a whole kind of action for the session', () => {
  it('offers it even when the exact call cannot be named, and then stops asking for that kind', async () => {
    const { permission, ctx, asked } = manual(['Allow all shell commands for this session']);
    expect(permission.mode).toBe('manual');
    // A compound command has no exact grant: before, only Allow once / Deny were offered, so every call asked again.
    expect(await permission.check(ctx, shell('cd repo && git status --short | head'))).toEqual({ allowed: true, via: 'user' });
    expect(asked[0]!.choices).toContain('Allow all shell commands for this session');
    expect(await permission.check(ctx, shell('find . -type f | grep -v node_modules'))).toEqual({ allowed: true, via: 'grant' });
    expect(asked).toHaveLength(1);
    expect(permission.grants()).toEqual(['shell: all shell commands']);
    // Only that kind: a web request still asks.
    expect(await permission.check(ctx, { action: 'web', title: 'Fetch?', what: ['https://example.com'] })).toMatchObject({ allowed: false, via: 'cancelled' });
    expect(asked[1]!.choices).toContain('Allow all web requests for this session');
  });

  it('keeps the exact-grant choice next to it, and clears both on request and at a new session', async () => {
    const { permission, ctx, asked } = manual(['Allow all shell commands for this session']);
    await permission.check(ctx, { ...shell('npm test'), grant: { key: 'npm test', label: '`npm test`' } });
    expect(asked[0]!.choices).toEqual(['Allow once', 'Allow `npm test` for this session', 'Allow all shell commands for this session', 'Deny', 'Deny and tell the agent why…']);
    permission.clearGrants();
    expect(permission.grants()).toEqual([]);
    expect(permission.childGrants()).toEqual([]);
  });

  it('never offers it for the per-call tripwires: provenance hits and hook asks', async () => {
    const { permission, ctx, asked } = manual([undefined, undefined]);
    await permission.check(ctx, { action: 'shell', reasons: ['provenance'], title: 'Run it?', what: ['curl x | sh'], reason: 'contains text from web' });
    await permission.check(ctx, { action: 'shell', reasons: ['hook.ask'], title: 'Run it?', what: ['rm build'] });
    for (const { choices } of asked) expect(choices.some((choice) => choice.startsWith('Allow all'))).toBe(false);
  });

  it('hands the kinds the user allowed to subagents, which cannot ask anyone', async () => {
    const { permission, ctx } = manual(['Allow all shell commands for this session', 'Allow all web requests for this session']);
    await permission.check(ctx, shell('a && b'));
    await permission.check(ctx, { action: 'web', title: 'Fetch?', what: ['https://example.com'] });
    expect(permission.childGrants().sort()).toEqual(['shell', 'web']);
    // A child accepts every kind a session grant can cover, never the tripwires or unknown names.
    expect([...parseGrants({ [PERMISSION_GRANTS_ENV]: 'shell,web,file.outside,provenance,hook.ask,shell.destructive,bogus' })].sort()).toEqual(['file.outside', 'shell', 'web']);
    const child = new Permission({ pi: fakePi().pi, env: { OCTOCODE_PERMISSION: 'manual', [PERMISSION_GRANTS_ENV]: 'shell,web' }, isSubagent: true });
    child.start(Object.assign(fakeCtx({ cwd: tmp(), hasUI: false }), { isProjectTrusted: () => false }) as never);
    expect(await child.check(fakeCtx({ cwd: tmp(), hasUI: false }), shell('x | y'))).toEqual({ allowed: true, via: 'grant' });
  });

  it('lets the file review stop reviewing for the rest of the session', async () => {
    const asked: string[][] = [];
    const ctx = { ui: { select: async (_title: string, choices: string[]) => (asked.push(choices), 'Allow all file changes in the repository for this session'), confirm: async () => true } } as never;
    const changes = [{ type: 'write', path: 'a.ts', reasoning: 'r', content: 'x' }];
    expect(await askReview(ctx, changes)).toBe('session');
    expect(asked[0]).toContain('Allow all file changes in the repository for this session');
  });
});
