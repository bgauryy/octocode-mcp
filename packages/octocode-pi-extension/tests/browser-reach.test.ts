import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { checkBrowserUrl, checkUploadPaths } from '../src/browser/tool.js';

describe('browser reach', () => {
  const ui = (answer: boolean) => {
    const confirm = vi.fn(async () => answer);
    return { hasUI: true, cwd: '/work', ui: { confirm } as never, confirm };
  };

  it('opens http(s) only, and private or local hosts only once the user confirms them', async () => {
    vi.stubEnv('OCTOCODE_WEB_ALLOW_PRIVATE', '');
    const allowed = new Set<string>();
    await expect(checkBrowserUrl('file:///etc/passwd', ui(true), allowed)).rejects.toThrow(/http\(s\) URLs only/);
    await expect(checkBrowserUrl('javascript:alert(1)', ui(true), allowed)).rejects.toThrow(/http\(s\) URLs only/);
    await expect(checkBrowserUrl('not a url', ui(true), allowed)).rejects.toThrow(/Not a URL/);
    await expect(checkBrowserUrl('https://93.184.216.34/', { hasUI: false, ui: {} as never }, allowed)).resolves.toBeUndefined();
    await expect(checkBrowserUrl('http://169.254.169.254/latest/meta-data', { hasUI: false, ui: {} as never }, allowed)).rejects.toThrow(/Blocked private or local address/);
    const declined = ui(false);
    await expect(checkBrowserUrl('http://127.0.0.1:3000/', declined, allowed)).rejects.toThrow(/Ask the user to allow private addresses \(OCTOCODE_WEB_ALLOW_PRIVATE=1\); do not retry/);
    const confirmed = ui(true);
    await checkBrowserUrl('http://127.0.0.1:3000/', confirmed, allowed);
    await checkBrowserUrl('http://127.0.0.1:3000/next', confirmed, allowed);
    expect(confirmed.confirm).toHaveBeenCalledTimes(1);
    // A name that does not resolve here may resolve to a private address in Chrome: it needs confirmation too.
    await expect(checkBrowserUrl('https://octocode.invalid/', { hasUI: false, ui: {} as never }, allowed)).rejects.toThrow(/Blocked unresolved host: octocode\.invalid/);
    const unresolved = ui(true);
    await checkBrowserUrl('https://octocode.invalid/', unresolved, allowed);
    expect(unresolved.confirm.mock.calls[0]).toEqual(['Open a private address?', 'The browser wants to open octocode.invalid, a name that does not resolve here and may reach a local or private address.']);
    vi.stubEnv('OCTOCODE_WEB_ALLOW_PRIVATE', '1');
    await expect(checkBrowserUrl('http://10.0.0.1/', { hasUI: false, ui: {} as never }, new Set())).resolves.toBeUndefined();
  });

  it('uploads files outside the workspace only with the user\'s confirmation', async () => {
    await expect(checkUploadPaths(['a.txt', '/work/sub/b.txt'], ui(false))).resolves.toEqual(['/work/a.txt', '/work/sub/b.txt']);
    await expect(checkUploadPaths(['../secret', '/etc/passwd'], ui(false))).rejects.toThrow(`outside the workspace without the user's confirmation: /secret, ${fs.realpathSync('/etc/passwd')}`);
    await expect(checkUploadPaths(['/etc/passwd'], { cwd: '/work', hasUI: false, ui: {} as never })).rejects.toThrow(/outside the workspace/);
    await expect(checkUploadPaths(['~/.ssh/id_rsa'.replace('~', os.homedir())], ui(true))).resolves.toHaveLength(1);
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
      await expect(checkUploadPaths(['link'], ctx)).rejects.toThrow(`outside the workspace without the user's confirmation: ${path.join(root, 'secret')}`);
      await expect(checkUploadPaths(['up/secret'], ctx)).rejects.toThrow(/outside the workspace/);
      expect(await checkUploadPaths(['link'], { ...ui(true), cwd: workspace })).toEqual([path.join(root, 'secret')]);
      // A workspace reached through a symlink still holds its own files.
      fs.symlinkSync(workspace, path.join(root, 'alias'));
      expect(await checkUploadPaths(['a.txt', 'new.txt'], { ...ui(false), cwd: path.join(root, 'alias') })).toEqual([path.join(workspace, 'a.txt'), path.join(workspace, 'new.txt')]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
