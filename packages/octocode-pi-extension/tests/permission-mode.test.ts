import { describe, expect, it } from 'vitest';
import { modeSummary } from '../src/permission/ask.js';
import { ACTION_CLASSES, ASK_REASONS, decide, parseGrants, reasonAsks, startMode, type ActionClass, type AskReason, type PermissionMode } from '../src/permission/mode.js';
import { PERMISSION_ENV, PERMISSION_GRANTS_ENV } from '../src/shared/env.js';

/** Plan §2.4, one row per action class: manual, workspace, full. */
const MATRIX: Record<ActionClass, [string, string, string]> = {
  'read.outside': ['ask', 'allow', 'allow'],
  'file.workspace': ['ask', 'allow', 'allow'],
  'file.outside': ['ask', 'ask', 'allow'],
  shell: ['ask', 'allow', 'allow'],
  web: ['ask', 'allow', 'allow'],
  browser: ['ask', 'allow', 'allow'],
  'net.private': ['ask', 'ask', 'allow'],
  'upload.outside': ['ask', 'ask', 'allow'],
  'mcp.write': ['ask', 'allow', 'allow'],
  'mcp.destructive': ['ask', 'ask', 'allow'],
  'memory.shared': ['ask', 'ask', 'allow'],
  'agent.spawn': ['ask', 'allow', 'allow'],
};

/** Reasons tighten an action. They are not action classes: manual, workspace, full. */
const REASONS: Record<AskReason, [string, string, string]> = {
  'hook.ask': ['ask', 'ask', 'ask'],
  provenance: ['ask', 'ask', 'allow'],
};

describe('permission modes', () => {
  it('decides every action class in every mode as the plan table says', () => {
    expect([...ACTION_CLASSES].sort()).toEqual(Object.keys(MATRIX).sort());
    expect(ACTION_CLASSES).not.toContain('provenance');
    expect(ACTION_CLASSES).not.toContain('hook.ask');
    for (const [action, row] of Object.entries(MATRIX) as Array<[ActionClass, string[]]>) {
      (['manual', 'workspace', 'full'] as PermissionMode[]).forEach((mode, at) => expect(decide(mode, action), `${action} in ${mode}`).toBe(row[at]));
    }
    expect([...ASK_REASONS].sort()).toEqual(Object.keys(REASONS).sort());
    for (const [reason, row] of Object.entries(REASONS) as Array<[AskReason, string[]]>) {
      (['manual', 'workspace', 'full'] as PermissionMode[]).forEach((mode, at) => expect(reasonAsks(mode, reason) ? 'ask' : 'allow', `${reason} in ${mode}`).toBe(row[at]));
    }
  });

  it('starts every session in full unless the user chose a mode', () => {
    expect(startMode({})).toEqual({ mode: 'full' });
    expect(startMode({ [PERMISSION_ENV]: '' })).toEqual({ mode: 'full' });
  });

  it('honours an exported OCTOCODE_PERMISSION, full included (the user\'s own choice), failing toward manual', () => {
    expect(startMode({ [PERMISSION_ENV]: 'manual' })).toEqual({ mode: 'manual' });
    expect(startMode({ [PERMISSION_ENV]: ' Workspace ' })).toEqual({ mode: 'workspace' });
    expect(startMode({ [PERMISSION_ENV]: 'full' })).toEqual({ mode: 'full' });
    // An invalid value starts stricter, never looser, with one warning naming the value.
    expect(startMode({ [PERMISSION_ENV]: 'yolo' })).toMatchObject({ mode: 'manual', warning: expect.stringContaining('yolo') });
  });

  it('says full keeps hook asks and runs provenance hits', () => {
    expect(modeSummary('full')).toBe('no routine asks; hard refusals and hook asks remain.');
    expect(modeSummary('workspace')).toContain('hook asks and provenance asks always ask');
    expect(modeSummary('manual')).toContain('hook asks and provenance asks always ask');
  });

  it('carries every grantable kind in a child grant, never a tripwire', () => {
    expect([...parseGrants({ [PERMISSION_GRANTS_ENV]: 'file.workspace, shell' })].sort()).toEqual(['file.workspace', 'shell']);
    expect([...parseGrants({ [PERMISSION_GRANTS_ENV]: 'file.outside,net.private,provenance,hook.ask,shell' })].sort()).toEqual(['file.outside', 'net.private', 'shell']);
    expect(parseGrants({}).size).toBe(0);
  });
});
