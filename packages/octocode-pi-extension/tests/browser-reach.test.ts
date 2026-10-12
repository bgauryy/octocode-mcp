import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { BrowserTool, checkBrowserUrl, checkUploadPaths, registerBrowserTool } from '../src/browser/tool.js';
import { fakeCtx, fakePermission, fakePi } from './fake-pi.js';

describe('browser reach', () => {
  /** A UI whose permission dialog answers `answer` (the select's choice); true allows once, false denies. */
  const ui = (answer: boolean | string) => {
    const select = vi.fn(async (_title: string, _choices: string[]) => (answer === true ? 'Allow once' : answer === false ? 'Deny' : answer));
    return { hasUI: true, cwd: '/work', ui: { select } as never, select };
  };

  it('opens http(s) only, and private or local hosts only once the user allows them', async () => {
    vi.stubEnv('OCTOCODE_WEB_ALLOW_PRIVATE', '');
    const allowed = fakePermission('workspace');
    await expect(checkBrowserUrl('file:///etc/passwd', ui(true), allowed)).rejects.toThrow(/http\(s\) URLs only/);
    await expect(checkBrowserUrl('javascript:alert(1)', ui(true), allowed)).rejects.toThrow(/http\(s\) URLs only/);
    await expect(checkBrowserUrl('not a url', ui(true), allowed)).rejects.toThrow(/Not a URL/);
    await expect(checkBrowserUrl('https://93.184.216.34/', { hasUI: false, ui: {} as never }, allowed)).resolves.toBeUndefined();
    await expect(checkBrowserUrl('http://169.254.169.254/latest/meta-data', { hasUI: false, ui: {} as never }, allowed)).rejects.toThrow(/Blocked private or local address/);
    const declined = ui(false);
    await expect(checkBrowserUrl('http://127.0.0.1:3000/', declined, allowed)).rejects.toThrow(/Blocked private or local address: 127\.0\.0\.1:3000\. The user denied opening a private or local address.*Do not retry it[\s\S]*OCTOCODE_WEB_ALLOW_PRIVATE=1/);
    // The session grant is per host: the second load of that host opens no dialog.
    const confirmed = ui('Allow 127.0.0.1:3000 for this session');
    await checkBrowserUrl('http://127.0.0.1:3000/', confirmed, allowed);
    await checkBrowserUrl('http://127.0.0.1:3000/next', confirmed, allowed);
    expect(confirmed.select).toHaveBeenCalledTimes(1);
    expect(allowed.grants()).toEqual(['net.private: 127.0.0.1:3000']);
    // full opens private hosts without asking; manual asks like workspace.
    await expect(checkBrowserUrl('http://10.0.0.2/', { hasUI: false, ui: {} as never }, fakePermission('full'))).resolves.toBeUndefined();
    await expect(checkBrowserUrl('http://10.0.0.2/', { hasUI: false, ui: {} as never }, fakePermission('manual'))).rejects.toThrow(/no one can be asked here/);
    // A name that does not resolve here may resolve to a private address in Chrome: it needs confirmation too.
    await expect(checkBrowserUrl('https://octocode.invalid/', { hasUI: false, ui: {} as never }, allowed)).rejects.toThrow(/Blocked unresolved host: octocode\.invalid/);
    const unresolved = ui(true);
    await checkBrowserUrl('https://octocode.invalid/', unresolved, allowed);
    expect(unresolved.select.mock.calls[0]?.[0]).toMatch(/^Open a private address\?\n {2}The browser wants to open octocode\.invalid, a name that does not resolve here and may reach a local or private address\./);
    vi.stubEnv('OCTOCODE_WEB_ALLOW_PRIVATE', '1');
    await expect(checkBrowserUrl('http://10.0.0.1/', { hasUI: false, ui: {} as never }, fakePermission('manual'))).resolves.toBeUndefined();
  });

  it('uploads files outside the workspace only with the user\'s yes', async () => {
    const permission = fakePermission('workspace');
    await expect(checkUploadPaths(['a.txt', '/work/sub/b.txt'], ui(false), permission)).resolves.toEqual(['/work/a.txt', '/work/sub/b.txt']);
    await expect(checkUploadPaths(['../secret', '/etc/passwd'], ui(false), permission)).rejects.toThrow(`Refused to upload files outside the workspace: /secret, ${fs.realpathSync('/etc/passwd')}. The user denied`);
    await expect(checkUploadPaths(['/etc/passwd'], { cwd: '/work', hasUI: false, ui: {} as never }, permission)).rejects.toThrow(/outside the workspace.*no one can be asked here/);
    await expect(checkUploadPaths(['~/.ssh/id_rsa'.replace('~', os.homedir())], ui(true), permission)).resolves.toHaveLength(1);
    await expect(checkUploadPaths(['/etc/passwd'], { cwd: '/work', hasUI: false, ui: {} as never }, fakePermission('full'))).resolves.toHaveLength(1);
  });

  it.each([
    { action: 'navigate', url: 'http://127.0.0.1:3000/' },
    { action: 'upload', ref: 1, files: ['/private/tmp/outside-upload'] },
  ])('cancels an active $action approval with the tool request before page operations', async (params) => {
    vi.stubEnv('OCTOCODE_WEB_ALLOW_PRIVATE', '');
    const permission = fakePermission('workspace');
    const browser = new BrowserTool(permission);
    const page = { send: vi.fn() };
    vi.spyOn(browser, 'session').mockResolvedValue({ page } as never);
    const fake = fakePi();
    registerBrowserTool(fake.pi, browser);
    const ctx = fakeCtx({ cwd: '/private/tmp/browser-workspace' });
    const turn = new AbortController();
    let approvalSignal: AbortSignal | undefined;
    let dismiss: (answer: string | undefined) => void = () => undefined;
    let opened: () => void = () => undefined;
    const visible = new Promise<void>((resolve) => { opened = resolve; });
    ctx.ui.select = async (_title, _choices, options) => new Promise<string | undefined>((resolve) => {
      approvalSignal = options?.signal;
      dismiss = resolve;
      approvalSignal?.addEventListener('abort', () => resolve(undefined), { once: true });
      opened();
    });
    const pending = fake.tools.get('browser').execute('cancel-browser', params, turn.signal, undefined, ctx);
    const rejected = expect(pending).rejects.toThrow(/dismissed/);
    await visible;
    turn.abort();
    try {
      expect(approvalSignal?.aborted).toBe(true);
    } finally {
      dismiss(undefined);
      await rejected;
    }
    expect(page.send).not.toHaveBeenCalled();
    expect(permission.grants()).toEqual([]);
    await expect(checkBrowserUrl('http://127.0.0.1:3000/', ui(true), permission)).resolves.toBeUndefined();
  });

  it('follows symlinks before deciding a file is inside the workspace, and uploads the real file', async () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'octocode-upload-')));
    try {
      const workspace = path.join(root, 'work');
      fs.mkdirSync(workspace);
      fs.writeFileSync(path.join(root, 'secret'), 's');
      fs.writeFileSync(path.join(workspace, 'a.txt'), 'a');
      fs.symlinkSync(path.join(root, 'secret'), path.join(workspace, 'link'));
      fs.symlinkSync(root, path.join(workspace, 'up'));
      const ctx = { ...ui(false), cwd: workspace };
      const permission = fakePermission('workspace');
      await expect(checkUploadPaths(['link'], ctx, permission)).rejects.toThrow(`Refused to upload files outside the workspace: ${path.join(root, 'secret')}.`);
      await expect(checkUploadPaths(['up/secret'], ctx, permission)).rejects.toThrow(/outside the workspace/);
      expect(await checkUploadPaths(['link'], { ...ui(true), cwd: workspace }, permission)).toEqual([path.join(root, 'secret')]);
      // A workspace reached through a symlink still holds its own files.
      fs.symlinkSync(workspace, path.join(root, 'alias'));
      expect(await checkUploadPaths(['a.txt', 'new.txt'], { ...ui(false), cwd: path.join(root, 'alias') }, permission)).toEqual([path.join(workspace, 'a.txt'), path.join(workspace, 'new.txt')]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
