import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EventLog } from '../src/api/events.js';
import { removeSocket, socketPath } from '../src/api/registry.js';
import { ApiServer } from '../src/api/server.js';
import { tmp } from './helpers.js';

const posix = process.platform !== 'win32';
const servers: ApiServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});
const serve = () => {
  const server = new ApiServer((() => Promise.resolve(undefined)) as never, new EventLog(), 'token');
  servers.push(server);
  return server;
};

describe.runIf(posix)('api socket permissions', () => {
  it('makes the socket owner-only from the bind, whatever the umask, and restores the umask', async () => {
    const before = process.umask(0o000);
    try {
      const file = path.join(tmp('octo-sock-'), 's.sock');
      const listening = serve().listenUnix(file);
      // Synchronously after `listen`, before its callback: no window in which group or other could connect.
      expect(fs.statSync(file).mode & 0o777).toBe(0o600);
      await listening;
      expect(process.umask()).toBe(0o000);
    } finally {
      process.umask(before);
    }
  });

  it('puts a long path\'s socket in a private mkdtemp folder, and removes the folder with the socket', async () => {
    const file = socketPath(`/${'x'.repeat(120)}`, 'pi-3');
    const folder = path.dirname(file);
    expect(path.dirname(folder)).toBe(fs.realpathSync(os.tmpdir()));
    expect(path.basename(folder)).toMatch(/^octocode-\d+-[A-Za-z0-9]{6}$/);
    expect(fs.statSync(folder).mode & 0o777).toBe(0o700);
    // Another call gets another folder: the name is not guessable or shared.
    const second = socketPath(`/${'x'.repeat(120)}`, 'pi-3');
    expect(path.dirname(second)).not.toBe(folder);
    removeSocket(second);
    const server = serve();
    await server.listenUnix(file);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    await server.close();
    expect(fs.existsSync(folder)).toBe(false);
    expect(fs.existsSync(path.dirname(second))).toBe(false);
  });

  it('removes only the socket file when it sits next to its record', () => {
    const dir = tmp('octo-sock-');
    const file = path.join(dir, 'pi-1.sock');
    fs.writeFileSync(file, '');
    removeSocket(file);
    expect(fs.existsSync(file)).toBe(false);
    expect(fs.existsSync(dir)).toBe(true);
  });
});
