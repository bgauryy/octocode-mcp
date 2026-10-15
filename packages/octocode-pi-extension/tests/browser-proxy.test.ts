import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FilteringProxy } from '../src/browser/proxy.js';

const launch = vi.hoisted(() => vi.fn());
vi.mock('chrome-launcher', () => ({ launch }));

const { startFilteringProxy } = await import('../src/browser/proxy.js');
const { keyOf } = await import('../src/browser/network.js');
const { launchChrome, proxyFlags, restrictWebRtc } = await import('../src/browser/launch.js');

const PUBLIC_IP = '93.184.216.34';
const PRIVATE_IP = '10.1.2.3';

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  launch.mockReset();
  while (cleanups.length > 0) await cleanups.pop()!();
});

const listen = (server: net.Server | http.Server): Promise<number> =>
  new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      cleanups.push(() => {
        if (server instanceof http.Server) server.closeAllConnections();
        server.close();
      });
      resolve((server.address() as net.AddressInfo).port);
    });
  });

/** A server on 127.0.0.1 that records every connection and the requests it answers. */
async function origin() {
  const requests: Array<{ url: string; host: string | undefined; method: string | undefined }> = [];
  const upgrades: string[] = [];
  let connections = 0;
  const server = http.createServer((request, response) => {
    requests.push({ url: request.url ?? '', host: request.headers.host, method: request.method });
    response.writeHead(200, { 'content-type': 'text/plain', 'x-origin': 'yes', connection: 'close' });
    response.end('hello from origin');
  });
  server.on('connection', () => (connections += 1));
  server.on('upgrade', (request, socket) => {
    upgrades.push(request.url ?? '');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\nws-open');
  });
  const port = await listen(server);
  return { port, requests, upgrades, connections: () => connections };
}

/** Everything the socket sends until `done` accepts it or it closes. */
function readUntil(socket: net.Socket, done: (text: string) => boolean): Promise<string> {
  return new Promise((resolve) => {
    let text = '';
    const finish = () => resolve(text);
    socket.on('data', (chunk) => {
      text += chunk.toString('latin1');
      if (done(text)) finish();
    });
    socket.once('close', finish);
    socket.once('error', finish);
  });
}

const rawSocket = (port: number): Promise<net.Socket> =>
  new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port }, () => resolve(socket));
    socket.once('error', reject);
    cleanups.push(() => void socket.destroy());
  });

/** Whether something still accepts connections on `port`. */
const accepts = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });

/** Sends `CONNECT authority` to the proxy and returns its status line and the open socket. */
async function connectVia(proxy: FilteringProxy, authority: string) {
  const socket = await rawSocket(proxy.port);
  socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`);
  const head = await readUntil(socket, (text) => text.includes('\r\n\r\n'));
  return { socket, status: head.split('\r\n')[0]!, head };
}

/** One plain-HTTP request through the proxy, with the whole response. */
async function getVia(proxy: FilteringProxy, url: string): Promise<string> {
  const socket = await rawSocket(proxy.port);
  socket.write(`GET ${url} HTTP/1.1\r\nHost: ${new URL(url).host}\r\nConnection: close\r\n\r\n`);
  return readUntil(socket, () => false);
}

async function start(options: Parameters<typeof startFilteringProxy>[0] = {}) {
  // Stands in for the browser's `PagePolicy.approves`: `allow` is the agent opening a private host.
  const opened = new Set<string>();
  const proxy = await startFilteringProxy({ env: {}, approved: (hostname, port) => opened.has(`${hostname}:${port}`), ...options });
  cleanups.push(() => proxy.close());
  return Object.assign(proxy, { allow: (url: URL): void => void opened.add(keyOf(url)) });
}

/** Names for the stub resolver. */
const resolver = (names: Record<string, string[]>) => vi.fn(async (name: string) => (names[name] ?? []).map((address) => ({ address })));
/** A connect that lands every connection to PUBLIC_IP on `port` (nothing public is reachable here) and records each dial. */
const redirectTo = (port: number) => {
  const dialed: string[] = [];
  const connect = (address: string, to: number) => {
    dialed.push(`${address}:${to}`);
    return net.connect({ host: '127.0.0.1', port: address === PUBLIC_IP ? port : to });
  };
  return { connect, dialed };
};

const FORBIDDEN = 'HTTP/1.1 403 Forbidden';
const ESTABLISHED = 'HTTP/1.1 200 Connection Established';

describe('filtering proxy: CONNECT', () => {
  it('refuses a CONNECT to a loopback address and reports it', async () => {
    const server = await origin();
    const onBlocked = vi.fn();
    const proxy = await start({ onBlocked });
    const { status, head, socket } = await connectVia(proxy, `127.0.0.1:${server.port}`);
    expect(status).toBe(FORBIDDEN);
    expect(head).toContain('X-Octocode-Blocked: private');
    expect(onBlocked).toHaveBeenCalledExactlyOnceWith({ host: `127.0.0.1:${server.port}`, reason: 'private' });
    await readUntil(socket, () => false);
    expect(server.connections()).toBe(0);
  });

  it('refuses numeric spellings of a private address, and IPv6 loopback', async () => {
    const onBlocked = vi.fn();
    const proxy = await start({ onBlocked });
    const authorities = ['2130706433:80', '0x7f.1:80', '127.1:80', '[::1]:80', '[::ffff:7f00:1]:80', '169.254.169.254:80', '0.0.0.0:80'];
    for (const authority of authorities) expect((await connectVia(proxy, authority)).status, authority).toBe(FORBIDDEN);
    expect(onBlocked).toHaveBeenCalledTimes(authorities.length);
  });

  it('refuses a name that resolves to a private address, even when it also resolves to a public one', async () => {
    const onBlocked = vi.fn();
    const lookup = resolver({ 'internal.test': [PRIVATE_IP], 'mixed.test': [PUBLIC_IP, PRIVATE_IP] });
    const proxy = await start({ lookup, onBlocked });
    expect((await connectVia(proxy, 'internal.test:443')).status).toBe(FORBIDDEN);
    expect((await connectVia(proxy, 'mixed.test:443')).status).toBe(FORBIDDEN);
    expect(onBlocked.mock.calls.map(([blocked]) => blocked)).toEqual([
      { host: 'internal.test:443', reason: 'private' },
      { host: 'mixed.test:443', reason: 'private' },
    ]);
  });

  it('connects to the address it vetted, so a DNS answer that changes afterwards cannot reach a private one', async () => {
    const server = await origin();
    let answers = 0;
    const lookup = vi.fn(async () => [{ address: answers++ === 0 ? PUBLIC_IP : PRIVATE_IP }]);
    const { connect, dialed } = redirectTo(server.port);
    const proxy = await start({ lookup, connect });
    const { status, socket } = await connectVia(proxy, 'rebind.test:80');
    expect(status).toBe(ESTABLISHED);
    socket.write('GET / HTTP/1.1\r\nHost: rebind.test\r\nConnection: close\r\n\r\n');
    expect(await readUntil(socket, (text) => text.includes('hello from origin'))).toContain('hello from origin');
    // One resolution per request, and the connection used its result; the private second answer was never dialed.
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(dialed).toEqual([`${PUBLIC_IP}:80`]);
    // The next request resolves again, and is now refused.
    expect((await connectVia(proxy, 'rebind.test:80')).status).toBe(FORBIDDEN);
    expect(dialed).toHaveLength(1);
  });

  it('tunnels to a public host', async () => {
    const server = await origin();
    const { connect, dialed } = redirectTo(server.port);
    const proxy = await start({ lookup: resolver({ 'example.test': [PUBLIC_IP] }), connect });
    const { status, socket } = await connectVia(proxy, 'example.test:443');
    expect(status).toBe(ESTABLISHED);
    socket.write('GET /x HTTP/1.1\r\nHost: example.test\r\nConnection: close\r\n\r\n');
    expect(await readUntil(socket, () => false)).toContain('hello from origin');
    expect(server.requests).toEqual([{ url: '/x', host: 'example.test', method: 'GET' }]);
    expect(dialed).toEqual([`${PUBLIC_IP}:443`]);
  });

  it('tunnels to a private host once the agent opened it, and only on that port', async () => {
    const server = await origin();
    const other = await origin();
    const onBlocked = vi.fn();
    const proxy = await start({ onBlocked });
    proxy.allow(new URL(`http://127.0.0.1:${server.port}/page`));
    const { status, socket } = await connectVia(proxy, `127.0.0.1:${server.port}`);
    expect(status).toBe(ESTABLISHED);
    socket.write('GET /api HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n');
    expect(await readUntil(socket, () => false)).toContain('hello from origin');
    expect(onBlocked).not.toHaveBeenCalled();
    expect((await connectVia(proxy, `127.0.0.1:${other.port}`)).status).toBe(FORBIDDEN);
    expect(other.connections()).toBe(0);
  });

  it('connects an allowed private name to the address it resolved to, matching the host case-insensitively', async () => {
    const server = await origin();
    const dialed: string[] = [];
    const connect = (address: string) => {
      dialed.push(address);
      return net.connect({ host: '127.0.0.1', port: server.port });
    };
    const proxy = await start({ lookup: resolver({ 'dev.test': ['127.0.0.1'] }), connect });
    expect((await connectVia(proxy, 'dev.test:3000')).status).toBe(FORBIDDEN);
    proxy.allow(new URL('http://dev.test:3000/'));
    expect((await connectVia(proxy, 'DEV.test:3000')).status).toBe(ESTABLISHED);
    expect(dialed).toEqual(['127.0.0.1']);
  });

  it('refuses a WebSocket upgrade to a blocked host, and carries one to an allowed host', async () => {
    const server = await origin();
    const proxy = await start();
    // Chrome tunnels ws:// and wss:// with CONNECT too: refused, nothing reaches the origin.
    expect((await connectVia(proxy, `127.0.0.1:${server.port}`)).status).toBe(FORBIDDEN);
    expect(server.upgrades).toEqual([]);
    expect(server.connections()).toBe(0);
    proxy.allow(new URL(`ws://127.0.0.1:${server.port}/`));
    const allowed = await connectVia(proxy, `127.0.0.1:${server.port}`);
    expect(allowed.status).toBe(ESTABLISHED);
    allowed.socket.write('GET /ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n');
    expect(await readUntil(allowed.socket, (text) => text.includes('ws-open'))).toContain('101 Switching Protocols');
    expect(server.upgrades).toEqual(['/ws']);
  });

  it('refuses a name nothing here resolves, and reports it only when an upstream proxy might have taken it', async () => {
    const onBlocked = vi.fn();
    const proxy = await start({ lookup: resolver({}), onBlocked });
    expect((await connectVia(proxy, 'nowhere.test:443')).status).toBe(FORBIDDEN);
    expect(onBlocked).not.toHaveBeenCalled();
    const chained = await start({ lookup: resolver({}), onBlocked, env: { HTTPS_PROXY: 'http://127.0.0.1:9' } });
    expect((await connectVia(chained, 'nowhere.test:443')).status).toBe(FORBIDDEN);
    expect(onBlocked).toHaveBeenCalledExactlyOnceWith({ host: 'nowhere.test:443', reason: 'unresolved' });
  });

  it('rejects a CONNECT without a host and port', async () => {
    const proxy = await start();
    for (const authority of ['example.test', 'a@b:80', 'x:0', 'x:99999']) expect((await connectVia(proxy, authority)).status, authority).toBe('HTTP/1.1 400 Bad Request');
  });

  it('answers 502 when the vetted address does not accept the connection', async () => {
    const closed = await new Promise<number>((resolve) => {
      const server = net.createServer().listen(0, '127.0.0.1', () => {
        const { port } = server.address() as net.AddressInfo;
        server.close(() => resolve(port));
      });
    });
    const { connect } = redirectTo(closed);
    const proxy = await start({ lookup: resolver({ 'down.test': [PUBLIC_IP] }), connect });
    expect((await connectVia(proxy, 'down.test:80')).status).toBe('HTTP/1.1 502 Bad Gateway');
  });

  it('stops accepting connections and cuts open tunnels on close', async () => {
    const server = await origin();
    const proxy = await start();
    proxy.allow(new URL(`http://127.0.0.1:${server.port}`));
    const { socket } = await connectVia(proxy, `127.0.0.1:${server.port}`);
    const closed = new Promise<void>((resolve) => socket.once('close', () => resolve()));
    await proxy.close();
    await closed;
    expect(await accepts(proxy.port)).toBe(false);
  });
});

describe('filtering proxy: plain HTTP', () => {
  it('refuses a private target with a 403 page naming it', async () => {
    const server = await origin();
    const onBlocked = vi.fn();
    const proxy = await start({ onBlocked });
    const response = await getVia(proxy, `http://127.0.0.1:${server.port}/secret`);
    expect(response).toMatch(/^HTTP\/1\.1 403 Forbidden/);
    expect(response).toContain(`Blocked by Octocode: 127.0.0.1:${server.port}`);
    expect(onBlocked).toHaveBeenCalledExactlyOnceWith({ host: `127.0.0.1:${server.port}`, reason: 'private' });
    expect(server.connections()).toBe(0);
  });

  it('forwards to a public host and an allowed private one, keeping the path, Host and response headers', async () => {
    const server = await origin();
    const { connect, dialed } = redirectTo(server.port);
    const proxy = await start({ lookup: resolver({ 'example.test': [PUBLIC_IP] }), connect });
    const publicResponse = await getVia(proxy, 'http://example.test/a/b?q=1');
    expect(publicResponse).toMatch(/^HTTP\/1\.1 200 OK/);
    expect(publicResponse.toLowerCase()).toContain('x-origin: yes');
    expect(publicResponse).toContain('hello from origin');
    expect(dialed).toEqual([`${PUBLIC_IP}:80`]);
    proxy.allow(new URL(`http://127.0.0.1:${server.port}/`));
    expect(await getVia(proxy, `http://127.0.0.1:${server.port}/local`)).toContain('hello from origin');
    expect(server.requests).toEqual([
      { url: '/a/b?q=1', host: 'example.test', method: 'GET' },
      { url: '/local', host: `127.0.0.1:${server.port}`, method: 'GET' },
    ]);
  });

  it('forwards a request body', async () => {
    let body = '';
    const echo = http.createServer((request, response) => {
      request.on('data', (chunk: Buffer) => (body += chunk.toString()));
      request.on('end', () => response.end('ok'));
    });
    const port = await listen(echo);
    const proxy = await start();
    proxy.allow(new URL(`http://127.0.0.1:${port}`));
    const socket = await rawSocket(proxy.port);
    socket.write(`POST http://127.0.0.1:${port}/submit HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Length: 7\r\nConnection: close\r\n\r\nname=ab`);
    expect(await readUntil(socket, () => false)).toMatch(/\r\n\r\nok$/);
    expect(body).toBe('name=ab');
  });

  it('rejects a request that is not an absolute http URL', async () => {
    const proxy = await start();
    const socket = await rawSocket(proxy.port);
    socket.write('GET /status HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n');
    expect(await readUntil(socket, () => false)).toMatch(/^HTTP\/1\.1 400/);
  });

  it('answers 502 when the host cannot be reached', async () => {
    const proxy = await start({ lookup: resolver({ 'down.test': [PUBLIC_IP] }), connect: () => net.connect({ host: '127.0.0.1', port: 1 }) });
    expect(await getVia(proxy, 'http://down.test/')).toMatch(/^HTTP\/1\.1 502/);
  });
});

describe('filtering proxy: upstream proxy', () => {
  /** An upstream HTTP proxy that tunnels every CONNECT to `to`, and records what it was asked for. */
  async function upstream(to: number, options: { refuse?: boolean } = {}) {
    const connects: Array<{ target: string | undefined; auth: string | undefined }> = [];
    const forwarded: Array<{ url: string | undefined; auth: string | undefined }> = [];
    const server = http.createServer((request, response) => {
      forwarded.push({ url: request.url, auth: request.headers['proxy-authorization'] });
      response.end('via upstream');
    });
    server.on('connect', (request, client: net.Socket) => {
      connects.push({ target: request.url, auth: request.headers['proxy-authorization'] });
      if (options.refuse) return void client.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n');
      const remote = net.connect({ host: '127.0.0.1', port: to }, () => {
        client.write('HTTP/1.1 200 OK\r\n\r\n');
        client.pipe(remote);
        remote.pipe(client);
      });
      remote.on('error', () => client.destroy());
      client.on('error', () => remote.destroy());
    });
    return { port: await listen(server), connects, forwarded };
  }

  it('tunnels a vetted host through HTTPS_PROXY by name, with the proxy URL credentials', async () => {
    const server = await origin();
    const chain = await upstream(server.port);
    const { connect, dialed } = redirectTo(server.port);
    const proxy = await start({ lookup: resolver({ 'example.test': [PUBLIC_IP] }), connect, env: { HTTPS_PROXY: `http://user:pw@127.0.0.1:${chain.port}` } });
    const { status, socket } = await connectVia(proxy, 'example.test:443');
    expect(status).toBe(ESTABLISHED);
    socket.write('GET / HTTP/1.1\r\nHost: example.test\r\nConnection: close\r\n\r\n');
    expect(await readUntil(socket, () => false)).toContain('hello from origin');
    expect(chain.connects).toEqual([{ target: 'example.test:443', auth: `Basic ${Buffer.from('user:pw').toString('base64')}` }]);
    // The only direct dial was to the upstream proxy itself.
    expect(dialed).toEqual([`127.0.0.1:${chain.port}`]);
  });

  it('still vets the target before chaining: a private host never reaches the upstream proxy', async () => {
    const server = await origin();
    const chain = await upstream(server.port);
    const proxy = await start({ lookup: resolver({ 'internal.test': [PRIVATE_IP] }), env: { HTTPS_PROXY: `http://127.0.0.1:${chain.port}` } });
    expect((await connectVia(proxy, 'internal.test:443')).status).toBe(FORBIDDEN);
    expect((await connectVia(proxy, `127.0.0.1:${server.port}`)).status).toBe(FORBIDDEN);
    expect(chain.connects).toEqual([]);
  });

  it('connects directly to a host on NO_PROXY and to a private host the agent opened', async () => {
    const server = await origin();
    const chain = await upstream(server.port);
    const { connect, dialed } = redirectTo(server.port);
    const env = { HTTPS_PROXY: `http://127.0.0.1:${chain.port}`, NO_PROXY: 'skip.test, .corp.test:443' };
    const proxy = await start({ lookup: resolver({ 'skip.test': [PUBLIC_IP], 'a.corp.test': [PUBLIC_IP], 'b.corp.test': [PUBLIC_IP] }), connect, env });
    expect((await connectVia(proxy, 'skip.test:443')).status).toBe(ESTABLISHED);
    expect((await connectVia(proxy, 'a.corp.test:443')).status).toBe(ESTABLISHED);
    expect(chain.connects).toEqual([]);
    expect((await connectVia(proxy, 'b.corp.test:8443')).status).toBe(ESTABLISHED);
    expect(chain.connects).toHaveLength(1);
    proxy.allow(new URL(`http://127.0.0.1:${server.port}`));
    expect((await connectVia(proxy, `127.0.0.1:${server.port}`)).status).toBe(ESTABLISHED);
    expect(chain.connects).toHaveLength(1);
    expect(dialed).toEqual([`${PUBLIC_IP}:443`, `${PUBLIC_IP}:443`, `127.0.0.1:${chain.port}`, `127.0.0.1:${server.port}`]);
  });

  it('forwards plain HTTP to HTTP_PROXY as an absolute URL', async () => {
    const chain = await upstream(1);
    const proxy = await start({ lookup: resolver({ 'example.test': [PUBLIC_IP] }), env: { HTTP_PROXY: `127.0.0.1:${chain.port}` } });
    expect(await getVia(proxy, 'http://example.test/page?x=1')).toContain('via upstream');
    expect(chain.forwarded).toEqual([{ url: 'http://example.test/page?x=1', auth: undefined }]);
  });

  it('answers 502 when the upstream proxy refuses the tunnel', async () => {
    const chain = await upstream(1, { refuse: true });
    const proxy = await start({ lookup: resolver({ 'example.test': [PUBLIC_IP] }), env: { HTTPS_PROXY: `http://127.0.0.1:${chain.port}` } });
    const { status, head } = await connectVia(proxy, 'example.test:443');
    expect(status).toBe('HTTP/1.1 502 Bad Gateway');
    expect(head).toContain('HTTP 407');
  });

  it('refuses to start behind a proxy it cannot chain to, instead of going direct', async () => {
    await expect(startFilteringProxy({ env: { HTTPS_PROXY: 'socks5://127.0.0.1:1080' } })).rejects.toThrow(/HTTPS_PROXY must be an http:\/\/ proxy/);
    await expect(startFilteringProxy({ env: { HTTP_PROXY: 'http://' } })).rejects.toThrow(/HTTP_PROXY is not a proxy URL/);
  });
});

describe('launching Chrome behind the proxy', () => {
  const fakeChrome = () => {
    const kill = vi.fn(async () => undefined);
    launch.mockResolvedValue({ port: 9222, kill });
    return kill;
  };
  const isolatedHome = () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'octocode-proxy-home-'));
    vi.stubEnv('OCTOCODE_HOME', home);
    cleanups.push(() => fs.rmSync(home, { recursive: true, force: true }));
  };

  it('names the proxy and removes the loopback bypass, so loopback is filtered too', async () => {
    const proxy = await start();
    expect(proxyFlags(proxy)).toEqual([`--proxy-server=http://127.0.0.1:${proxy.port}`, '--proxy-bypass-list=<-loopback>']);
  });

  it('starts the proxy with a fresh Chrome and stops it when Chrome is killed', async () => {
    isolatedHome();
    const kill = fakeChrome();
    const onBlocked = vi.fn();
    const chrome = await launchChrome(true, undefined, { env: {}, onBlocked });
    const flags = launch.mock.calls[0]![0].chromeFlags as string[];
    expect(flags).toEqual(expect.arrayContaining(['--headless=new', `--proxy-server=${chrome.proxy!.url}`, '--proxy-bypass-list=<-loopback>']));
    expect((await connectVia(chrome.proxy!, '127.0.0.1:80')).status).toBe(FORBIDDEN);
    expect(onBlocked).toHaveBeenCalledExactlyOnceWith({ host: '127.0.0.1:80', reason: 'private' });
    const { port } = chrome.proxy!;
    await chrome.kill();
    expect(kill).toHaveBeenCalledTimes(1);
    expect(await accepts(port)).toBe(false);
  });

  it('stops the proxy when Chrome fails to start', async () => {
    isolatedHome();
    let url = '';
    launch.mockImplementation(async (options: { chromeFlags: string[] }) => {
      url = options.chromeFlags.find((flag) => flag.startsWith('--proxy-server='))!.slice('--proxy-server='.length);
      throw new Error('no chrome');
    });
    await expect(launchChrome(true, undefined, { env: {} })).rejects.toThrow('no chrome');
    expect(await accepts(Number(new URL(url).port))).toBe(false);
  });

  it('does not proxy a Chrome on the persistent profile, which outlives the session, but still restricts its WebRTC', async () => {
    fakeChrome();
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'octocode-profile-'));
    cleanups.push(() => fs.rmSync(profile, { recursive: true, force: true }));
    const chrome = await launchChrome(false, profile);
    expect(launch.mock.calls[0]![0].chromeFlags.join(' ')).not.toContain('--proxy');
    expect(chrome.proxy).toBeUndefined();
    expect(JSON.parse(fs.readFileSync(path.join(profile, 'Default', 'Preferences'), 'utf8'))).toEqual({ webrtc: { ip_handling_policy: 'disable_non_proxied_udp' } });
  });

  it('writes the WebRTC policy into a fresh profile before Chrome starts, not as a switch Chrome ignores', async () => {
    isolatedHome();
    let seen: unknown;
    launch.mockImplementation(async (options: { userDataDir: string; chromeFlags: string[] }) => {
      seen = JSON.parse(fs.readFileSync(path.join(options.userDataDir, 'Default', 'Preferences'), 'utf8'));
      expect(options.chromeFlags.join(' ')).not.toContain('webrtc');
      return { port: 9222, kill: async () => undefined };
    });
    await (await launchChrome(true, undefined, { env: {} })).kill();
    expect(seen).toEqual({ webrtc: { ip_handling_policy: 'disable_non_proxied_udp' } });
  });

  it('keeps the other preferences of an existing profile, replaces a weaker policy, and rebuilds an unreadable file', () => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'octocode-profile-'));
    cleanups.push(() => fs.rmSync(profile, { recursive: true, force: true }));
    const file = path.join(profile, 'Default', 'Preferences');
    fs.mkdirSync(path.dirname(file));
    fs.writeFileSync(file, JSON.stringify({ homepage: 'https://example.test', webrtc: { ip_handling_policy: 'default', multiple_routes_enabled: false } }));
    restrictWebRtc(profile);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ homepage: 'https://example.test', webrtc: { ip_handling_policy: 'disable_non_proxied_udp', multiple_routes_enabled: false } });
    fs.writeFileSync(file, '{not json');
    restrictWebRtc(profile);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ webrtc: { ip_handling_policy: 'disable_non_proxied_udp' } });
  });

  it('does not start Chrome when the policy cannot be written', async () => {
    fakeChrome();
    const blocker = fs.mkdtempSync(path.join(os.tmpdir(), 'octocode-profile-'));
    cleanups.push(() => fs.rmSync(blocker, { recursive: true, force: true }));
    const profile = path.join(blocker, 'file');
    fs.writeFileSync(profile, 'not a folder');
    await expect(launchChrome(false, profile)).rejects.toThrow();
    expect(launch).not.toHaveBeenCalled();
  });
});
