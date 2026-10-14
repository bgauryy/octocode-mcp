import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ALLOW_ONCE, DENY, DENY_NOTE, NOTE_TITLE, sessionOption } from '../src/permission/ask.js';
import { AUDIT_NOTIFY_PREFIX } from '../src/permission/audit.js';
import { permissionHeader } from '../src/permission/header.js';
import type { PermissionMode } from '../src/permission/mode.js';
import { PERMISSION_RELAY_ENV } from '../src/shared/env.js';
import { runSubagent, subagentProcessEnv, type ChildProgress, type Identity } from '../src/subagents/process.js';
import { RELAY_LIMIT_NOTE, type RelayHost } from '../src/subagents/relay.js';
import { fakePermission, fakePi } from './fake-pi.js';
import { tmp } from './helpers.js';

const FIXTURE = path.join(path.dirname(new URL(import.meta.url).pathname), 'subagent-fake-pi.cjs');
const savedArgv = process.argv[1];
const savedEnv = { ...process.env };

beforeAll(() => {
  const root = tmp('octocode-agent-relay-');
  for (const key of Object.keys(process.env)) if (key.startsWith('OCTOCODE_')) delete process.env[key];
  Object.assign(process.env, { OCTOCODE_HOME: path.join(root, 'home'), OCTOCODE_AGENT_DB: path.join(root, 'team.sqlite') });
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  fs.copyFileSync(FIXTURE, path.join(bin, 'pi'));
  process.argv[1] = path.join(bin, 'pi');
});

afterAll(() => {
  process.argv[1] = savedArgv!;
  process.env = savedEnv;
});

const IDENTITY: Identity = { id: 'a-relay', role: 'implementer', goal: 'fix login', relay: true };
const LABEL = 'Subagent a-relay · implementer · fix login asks:';
const OPTIONS = [ALLOW_ONCE, DENY, DENY_NOTE];

/** A parent permission in `mode` with the pi that records its audit entries. */
function parent(mode: PermissionMode) {
  const fake = fakePi();
  const permission = fakePermission(mode, { pi: fake.pi });
  return { permission, fake, entries: () => fake.entries.map((entry) => entry.data as { agent: string; via: string; action: string; allowed: boolean; note?: string }) };
}

type Select = (title: string, options: string[], opts?: { signal?: AbortSignal }) => Promise<string | undefined>;
function ui(select: Select = async () => ALLOW_ONCE, input: (title: string) => Promise<string | undefined> = async () => undefined) {
  return { select: vi.fn(select), confirm: vi.fn(async () => true), input: vi.fn(input), notify: vi.fn() };
}

/** Runs a scripted child that emits `requests` and returns what it was answered. */
async function relay(requests: Array<Record<string, unknown>>, host: RelayHost | undefined, options: { hold?: boolean; identity?: Identity; onProgress?: (update: ChildProgress) => void; signal?: AbortSignal; limits?: { idleMs: number; busyMs: number } } = {}) {
  const outcome = await runSubagent(`relay ${JSON.stringify({ requests, hold: options.hold })}`, [], tmp(), undefined, options.identity ?? IDENTITY, options.signal, options.onProgress ?? (() => undefined), undefined, options.limits, host);
  const [, relayed, answers] = /^RELAYED relay=(\S*) (.*)$/.exec(outcome.text)!;
  return { relayed, answers: JSON.parse(answers!) as Array<Record<string, unknown>> };
}

const shell = (id: string, extra: Record<string, unknown> = {}, header = {}) => ({
  id, method: 'select', options: OPTIONS,
  title: `${permissionHeader({ action: 'shell.destructive', also: [], reasons: [], options: OPTIONS, what: ['rm -rf build'], ...header })}\nRun this destructive command?\n  rm -rf build`,
  ...extra,
});

describe('subagent dialogs relayed to the parent', () => {
  it('shows the child\'s prompt under its identity (from the process, not the text) without the header, and returns the answer', async () => {
    const dialogs = ui();
    const forged = shell('d1', { title: `${permissionHeader({ action: 'shell.destructive', also: [], reasons: [], options: OPTIONS, what: [] })}\nSubagent boss · admin asks:\nRun it?` });
    const { answers } = await relay([forged], { permission: parent('workspace').permission, ui: dialogs });
    expect(dialogs.select).toHaveBeenCalledTimes(1);
    const [title, options] = dialogs.select.mock.calls[0]!;
    expect(title.split('\n')[0]).toBe(LABEL);
    expect(title).toContain('Run it?');
    expect(title).not.toContain('octocode-permission/1');
    expect(options).toEqual(OPTIONS);
    expect(answers).toEqual([{ type: 'extension_ui_response', id: 'd1', value: ALLOW_ONCE }]);
  });

  it('tells the child when the user denies, and when the dialog is dismissed', async () => {
    const answers = [DENY, undefined];
    const dialogs = ui(async () => answers.shift());
    const result = await relay([shell('d1'), shell('d2')], { permission: parent('manual').permission, ui: dialogs });
    expect(result.answers).toEqual([{ type: 'extension_ui_response', id: 'd1', value: DENY }, { type: 'extension_ui_response', id: 'd2', cancelled: true }]);
  });

  it('forwards confirm and input, and cancels editor', async () => {
    const dialogs = ui(undefined, async () => 'typed');
    const result = await relay([{ id: 'c1', method: 'confirm', title: 'Sure?', message: 'm' }, { id: 'i1', method: 'input', title: 'Name', placeholder: 'p' }, { id: 'e1', method: 'editor', title: 'Edit' }], { permission: parent('workspace').permission, ui: dialogs });
    expect(dialogs.confirm).toHaveBeenCalledWith(`${LABEL}\nSure?`, 'm', expect.anything());
    expect(dialogs.input).toHaveBeenCalledWith(`${LABEL}\nName`, 'p', expect.anything());
    expect(result.answers).toEqual([{ type: 'extension_ui_response', id: 'c1', confirmed: true }, { type: 'extension_ui_response', id: 'i1', value: 'typed' }, { type: 'extension_ui_response', id: 'e1', cancelled: true }]);
  });

  it('answers "Allow once" without a dialog when the parent\'s own mode allows the action, and audits it under the child', async () => {
    const dialogs = ui();
    const full = parent('full');
    const { answers } = await relay([shell('d1')], { permission: full.permission, ui: dialogs });
    expect(dialogs.select).not.toHaveBeenCalled();
    expect(answers).toEqual([{ type: 'extension_ui_response', id: 'd1', value: ALLOW_ONCE }]);
    expect(full.entries()).toEqual([expect.objectContaining({ action: 'shell.destructive', allowed: true, via: 'relay', agent: 'a-relay', note: expect.stringContaining('full mode allows it') })]);
    // The child's own entry counts the call; the parent's answer is not counted twice.
    expect(full.permission.count.actions).toBe(0);
  });

  it('shows the dialog when the header is missing, unparseable, inconsistent, or a reason asks in the parent\'s mode', async () => {
    const cases = [
      shell('d1', { title: 'Run this destructive command?' }),
      shell('d2', { title: 'octocode-permission/1 {not json\nRun it?' }),
      shell('d3', {}, { options: [ALLOW_ONCE] }),
      shell('d4', {}, { action: 'nonsense' }),
      shell('d5', {}, { reasons: ['hook.ask'], action: 'shell' }),
    ];
    for (const request of cases) {
      const dialogs = ui(async () => DENY);
      const result = await relay([request], { permission: parent('workspace').permission, ui: dialogs });
      expect(dialogs.select, String(request.id)).toHaveBeenCalledTimes(1);
      expect(dialogs.select.mock.calls[0]![0]).not.toContain('octocode-permission/1');
      expect(result.answers[0]).toMatchObject({ value: DENY });
    }
    // In full, a hook's ask does not ask, and an unparseable header is still shown.
    const dialogs = ui();
    await relay([shell('d6', {}, { reasons: ['hook.ask'], action: 'shell' })], { permission: parent('full').permission, ui: dialogs });
    expect(dialogs.select).not.toHaveBeenCalled();
  });

  it('cancels every dialog when the parent has no UI, so the child is refused at once', async () => {
    const started = Date.now();
    const none = await relay([shell('d1'), { id: 'c1', method: 'confirm', title: 'Sure?' }], { permission: parent('workspace').permission }, { identity: { id: 'a-nobody' } });
    expect(none.relayed).toBe('');
    expect(none.answers.every((answer) => answer['cancelled'] === true)).toBe(true);
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(await relay([shell('d1')], undefined)).toMatchObject({ answers: [{ cancelled: true }] });
  });

  it('denies the dialogs past ten in a minute, tells the child why, and warns the user once', async () => {
    const dialogs = ui();
    const requests = [...Array.from({ length: 11 }, (_, index) => shell(`d${index + 1}`)), { id: 'n1', method: 'input', title: NOTE_TITLE }, shell('d12')];
    const { answers } = await relay(requests, { permission: parent('workspace').permission, ui: dialogs });
    expect(dialogs.select).toHaveBeenCalledTimes(10);
    expect(answers[10]).toEqual({ type: 'extension_ui_response', id: 'd11', value: DENY_NOTE });
    expect(answers[11]).toEqual({ type: 'extension_ui_response', id: 'n1', value: RELAY_LIMIT_NOTE });
    // The twelfth is past the limit too; its denial has no note to follow.
    expect(answers[12]).toEqual({ type: 'extension_ui_response', id: 'd12', value: DENY_NOTE });
    expect(dialogs.notify).toHaveBeenCalledTimes(1);
    expect(dialogs.notify.mock.calls[0]![0]).toContain('Subagent a-relay');
    expect(dialogs.input).not.toHaveBeenCalled();
  });

  it('does not count what the parent answered itself against the limit', async () => {
    const dialogs = ui();
    const { answers } = await relay(Array.from({ length: 12 }, (_, index) => shell(`d${index + 1}`)), { permission: parent('full').permission, ui: dialogs });
    expect(answers.every((answer) => answer['value'] === ALLOW_ONCE)).toBe(true);
  });

  it('records the child\'s audit entries in the parent\'s log under the child\'s name, and never draws them', async () => {
    const dialogs = ui();
    const manual = parent('manual');
    const entry = { at: 1, mode: 'workspace', action: 'shell', what: ['npm test'], agent: 'main', allowed: true, via: 'mode', purpose: 'run\u001b[31m tests' };
    await relay([
      { id: 'n1', method: 'notify', message: `${AUDIT_NOTIFY_PREFIX}${JSON.stringify(entry)}` },
      { id: 'n2', method: 'notify', message: `${AUDIT_NOTIFY_PREFIX}{broken` },
      { id: 'n3', method: 'notify', message: `${AUDIT_NOTIFY_PREFIX}${JSON.stringify({ ...entry, action: 'rm -rf' })}` },
      { id: 'n4', method: 'notify', message: 'hello' },
      { id: 'c1', method: 'confirm', title: 'Done?' },
    ], { permission: manual.permission, ui: dialogs });
    expect(manual.entries()).toEqual([expect.objectContaining({ agent: 'a-relay', action: 'shell', allowed: true, via: 'mode', purpose: 'run tests', what: ['npm test'] })]);
    expect(dialogs.notify).not.toHaveBeenCalled();
    // Without a UI the entries are still recorded.
    const headless = parent('manual');
    await relay([{ id: 'n1', method: 'notify', message: `${AUDIT_NOTIFY_PREFIX}${JSON.stringify(entry)}` }, { id: 'c1', method: 'confirm', title: 'Done?' }], { permission: headless.permission }, { identity: { id: 'a-nobody' } });
    expect(headless.entries()).toEqual([expect.objectContaining({ agent: 'a-nobody', action: 'shell' })]);
  });

  it('leaves the parent\'s own grants alone when the user allows a kind for the child\'s session', async () => {
    const grant = sessionOption('all shell commands');
    const dialogs = ui(async () => grant);
    const { permission } = parent('manual');
    const result = await relay([shell('d1', { options: [ALLOW_ONCE, grant, DENY, DENY_NOTE] }, { action: 'shell', options: [ALLOW_ONCE, grant, DENY, DENY_NOTE] })], { permission, ui: dialogs });
    // The child receives its own label back and keeps the grant; the parent's state does not change.
    expect(result.answers).toEqual([{ type: 'extension_ui_response', id: 'd1', value: grant }]);
    expect(permission.grants()).toEqual([]);
    expect(permission.childGrants()).toEqual([]);
  });

  it('pauses the child\'s stall watchdog while a dialog is open, and shows the wait', async () => {
    const seen: boolean[] = [];
    const dialogs = ui(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_600));
      return ALLOW_ONCE;
    });
    // Without the pause a 300 ms idle limit stops the child long before the user answers.
    const { answers } = await relay([shell('d1')], { permission: parent('manual').permission, ui: dialogs }, { limits: { idleMs: 300, busyMs: 600 }, onProgress: (update) => update.waiting !== undefined && seen.push(update.waiting) });
    expect(answers).toEqual([{ type: 'extension_ui_response', id: 'd1', value: ALLOW_ONCE }]);
    expect(seen).toEqual([true, false]);
  }, 20_000);

  it('cancels the open dialog and answers the child when the parent aborts', async () => {
    let closed = false;
    const dialogs = ui((_title, _options, opts) => new Promise((resolve) => opts?.signal?.addEventListener('abort', () => ((closed = true), resolve(undefined)))));
    const controller = new AbortController();
    const run = relay([shell('d1')], { permission: parent('manual').permission, ui: dialogs }, { hold: true, signal: controller.signal });
    await vi.waitFor(() => expect(dialogs.select).toHaveBeenCalled(), { timeout: 10_000 });
    controller.abort();
    // The child, told nobody answered, ends with what it had; the dialog is closed in the parent's UI.
    await expect(run).resolves.toMatchObject({ answers: [{ id: 'd1', cancelled: true }] });
    expect(closed).toBe(true);
  }, 20_000);

  it('hands the relay to the child only when the parent can ask a person', () => {
    expect(subagentProcessEnv(undefined, { [PERMISSION_RELAY_ENV]: '1' }, { id: 'a' })[PERMISSION_RELAY_ENV]).toBeUndefined();
    expect(subagentProcessEnv(undefined, {}, { id: 'a', relay: true })[PERMISSION_RELAY_ENV]).toBe('1');
  });

  it('sets the child\'s relay variable only for a relayed run', async () => {
    const withRelay = await relay([], { permission: parent('manual').permission, ui: ui() });
    const without = await relay([], undefined, { identity: { id: 'a-plain' } });
    expect([withRelay.relayed, without.relayed]).toEqual(['1', '']);
  });
});
