import { describe, expect, it } from 'vitest';
import { ALLOW_ONCE, DENY, DENY_NOTE, NEEDS_APPROVAL, Permission } from '../src/permission/ask.js';
import { AUDIT_NOTIFY_PREFIX, childAuditEntry } from '../src/permission/audit.js';
import { HEADER_PREFIX, permissionHeader, splitHeader, type PermissionHeader } from '../src/permission/header.js';
import type { PermissionRequest } from '../src/permission/request.js';
import { PERMISSION_ENV, PERMISSION_RELAY_ENV } from '../src/shared/env.js';
import { fakeCtx, fakePi } from './fake-pi.js';
import { tmp } from './helpers.js';

const shell: PermissionRequest = { action: 'shell', title: 'Run this command?', what: ['npm test'], grant: { key: 'npm test', label: '`npm test`' } };

/** A subagent session, as Pi's RPC mode reports it (hasUI true), with the dialog titles it was asked. */
function child(env: NodeJS.ProcessEnv) {
  const fake = fakePi();
  const permission = new Permission({ pi: fake.pi, env: { [PERMISSION_ENV]: 'manual', ...env }, isSubagent: true, stderr: () => undefined });
  const ctx = { ...fakeCtx({ cwd: tmp(), hasUI: true, mode: 'rpc', ui: { selects: [ALLOW_ONCE] } }), isProjectTrusted: () => true };
  const titles: string[] = [];
  const select = ctx.ui.select;
  ctx.ui.select = (async (title: string, ...rest: [string[], never]) => (titles.push(title), select(title, ...rest))) as never;
  permission.start(ctx);
  return { permission, ctx, titles, fake };
}

describe('a subagent session that relays its dialogs', () => {
  it('asks through its own select, led by the header its parent reads', async () => {
    const { permission, ctx, titles } = child({ [PERMISSION_RELAY_ENV]: '1' });
    expect(await permission.check(ctx, { ...shell, also: ['net.private'], reasons: ['hook.ask'] })).toEqual({ allowed: true, via: 'user' });
    const { header, title } = splitHeader(titles[0]!);
    expect(titles[0]!.split('\n')[0]!.startsWith(HEADER_PREFIX)).toBe(true);
    expect(header).toMatchObject({ action: 'shell', also: ['net.private'], reasons: ['hook.ask'], what: ['npm test'] });
    expect(header!.options).toEqual(expect.arrayContaining([ALLOW_ONCE, DENY, DENY_NOTE]));
    expect(title.startsWith('Run this command?')).toBe(true);
  });

  it('keeps the old headless refusal without the relay variable', async () => {
    const { permission, ctx, titles } = child({});
    const verdict = await permission.check(ctx, shell);
    expect(verdict).toMatchObject({ allowed: false, via: 'headless' });
    expect(verdict.allowed ? '' : verdict.message).toContain(NEEDS_APPROVAL);
    expect(titles).toEqual([]);
  });

  it('sends every audit entry to its parent as a notify, whatever the relay setting', async () => {
    for (const env of [{ [PERMISSION_RELAY_ENV]: '1' }, {}]) {
      const { permission, ctx } = child(env);
      permission.typed('ls', '/tmp');
      const sent = ctx.ui.notes.map((note) => note.message).filter((message) => message.startsWith(AUDIT_NOTIFY_PREFIX));
      expect(sent).toHaveLength(1);
      expect(childAuditEntry(sent[0]!, 'child')).toMatchObject({ action: 'shell', agent: 'child', via: 'typed', allowed: true });
    }
  });
});

describe('splitHeader', () => {
  const header: PermissionHeader = { action: 'shell', also: [], reasons: [], options: [ALLOW_ONCE], what: ['x'] };
  it('returns the title as is without a header line, and parses only the first line', () => {
    expect(splitHeader('Run it?')).toEqual({ title: 'Run it?' });
    const later = `Run it?\n${permissionHeader(header)}`;
    expect(splitHeader(later)).toEqual({ title: later });
    expect(splitHeader(`${permissionHeader(header)}\nRun it?`)).toEqual({ title: 'Run it?', header });
  });

  it('drops a header-looking line it cannot use, and yields no header', () => {
    for (const line of [`${HEADER_PREFIX}{`, `${HEADER_PREFIX}[]`, permissionHeader({ ...header, action: 'x' as never }), permissionHeader({ ...header, reasons: ['x'] as never }), `${HEADER_PREFIX}${JSON.stringify({ ...header, what: [1] })}`]) {
      expect(splitHeader(`${line}\nRun it?`)).toEqual({ title: 'Run it?' });
    }
    expect(splitHeader(HEADER_PREFIX)).toEqual({ title: '' });
  });
});

describe('childAuditEntry', () => {
  const entry = { at: 5, mode: 'full', action: 'web', what: ['https://a.example', 'b', 'c', 'd', 'e', '+3 more'], allowed: true, via: 'mode', note: 'n', snapshot: 'refs/x', reasons: ['provenance', 'bogus'], suppressed: { web: 2, bad: 'x' } };
  const message = (value: unknown) => `${AUDIT_NOTIFY_PREFIX}${JSON.stringify(value)}`;

  it('keeps the validated fields, names the child from the process and keeps the rollup shape', () => {
    expect(childAuditEntry(message({ ...entry, agent: 'main' }), 'worker')).toEqual({ ...entry, reasons: ['provenance'], suppressed: { web: 2 }, agent: 'worker' });
    expect(childAuditEntry(message({ ...entry, at: 'x' }), 'worker')!.at).toBeTypeOf('number');
  });

  it('refuses what is not an entry', () => {
    expect(childAuditEntry('hello', 'w')).toBeUndefined();
    expect(childAuditEntry(`${AUDIT_NOTIFY_PREFIX}{`, 'w')).toBeUndefined();
    for (const bad of [[], 3, { ...entry, action: 'nope' }, { ...entry, mode: 'x' }, { ...entry, allowed: 'yes' }, { ...entry, via: 1 }, { ...entry, what: 'x' }, { ...entry, action: undefined }]) {
      expect(childAuditEntry(message(bad), 'w'), JSON.stringify(bad)).toBeUndefined();
    }
  });
});
