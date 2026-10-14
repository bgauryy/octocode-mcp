import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startCdpStub, type CdpHandler, type CdpStub } from './fixtures/cdp-stub.js';
import { fakeCtx, fakePermission, fakePi } from './fake-pi.js';
import type { AuditEntry } from '../src/permission/audit.js';
import type { PermissionMode } from '../src/permission/mode.js';
import { PagePolicy } from '../src/browser/network.js';

const launch = vi.hoisted(() => vi.fn());
vi.mock('chrome-launcher', () => ({ launch }));

const { BrowserTool, registerBrowserTool } = await import('../src/browser/tool.js');
const { openBrowser } = await import('../src/browser/cdp.js');

const PRIVATE_HOSTS = ['http://169.254.169.254/latest/meta-data', 'http://10.0.0.1/admin', 'http://[::1]:8080/', 'http://127.0.0.1:9/secret', 'http://192.168.1.1/'];

describe('PagePolicy', () => {
  const lookup = (table: Record<string, string[]>) =>
    vi.fn(async (name: string) => {
      const addresses = table[name];
      if (!addresses) throw new Error(`ENOTFOUND ${name}`);
      return addresses.map((address) => ({ address }));
    });
  const policy = (table: Record<string, string[]> = {}, now = () => 0) => new PagePolicy({ report: () => undefined, lookup: lookup(table), now });

  it('lets a page reach public hosts and refuses private and unresolved ones without asking', async () => {
    const page = policy({ 'cdn.example': ['93.184.216.34'], 'rebind.example': ['93.184.216.34', '10.0.0.5'] });
    await expect(page.check('https://cdn.example/app.js', 'Script')).resolves.toBeUndefined();
    await expect(page.check('https://93.184.216.34/x', 'Image')).resolves.toBeUndefined();
    for (const url of PRIVATE_HOSTS) await expect(page.check(url, 'XHR')).rejects.toThrow(/^Blocked private or local address: /);
    // One private answer among public ones is private.
    await expect(page.check('https://rebind.example/', 'Document')).rejects.toThrow(/Blocked private or local address: rebind\.example/);
    await expect(page.check('https://nowhere.example/', 'Image')).rejects.toThrow(/Blocked unresolved host: nowhere\.example/);
    // Numeric spellings are normalized by the URL parser before the check.
    await expect(page.check('http://0x7f.1/', 'Image')).rejects.toThrow(/Blocked private/);
    await expect(page.check('http://2130706433/', 'Image')).rejects.toThrow(/Blocked private/);
    await expect(page.check('not a url', 'Image')).rejects.toThrow(/Not a URL/);
  });

  it('lets data: and blob: subresources through, and refuses a document that is not http(s)', async () => {
    const page = policy();
    await expect(page.check('data:text/plain,hi', 'Image')).resolves.toBeUndefined();
    await expect(page.check('blob:https://example.com/id', 'Script')).resolves.toBeUndefined();
    await expect(page.check('file:///etc/passwd', 'Document')).rejects.toThrow(/http\(s\) URLs only, not file:/);
    await expect(page.check('javascript:alert(1)', 'Document')).rejects.toThrow(/http\(s\) URLs only/);
  });

  it('reuses a host verdict for a short time, then asks the resolver again', async () => {
    let clock = 0;
    const resolver = lookup({ 'cdn.example': ['93.184.216.34'] });
    const page = new PagePolicy({ report: () => undefined, lookup: resolver, now: () => clock });
    await Promise.all([page.check('https://cdn.example/a', 'Script'), page.check('https://cdn.example/b', 'Image'), page.check('https://cdn.example/c', 'XHR')]);
    await page.check('https://cdn.example/d', 'Image');
    expect(resolver).toHaveBeenCalledTimes(1);
    clock = 31_000;
    await page.check('https://cdn.example/e', 'Image');
    expect(resolver).toHaveBeenCalledTimes(2);
  });

  it('approves only the host and port the agent opened, and only when it is not public', async () => {
    const page = policy({ 'cdn.example': ['93.184.216.34'], 'app.local': ['127.0.0.1'] });
    expect(await page.approve(new URL('https://cdn.example/'))).toBe(false);
    expect(await page.approve(new URL('http://127.0.0.1:3000/app'))).toBe(true);
    expect(await page.approve(new URL('http://app.local:8080/'))).toBe(true);
    expect(page.approved.map((url) => url.host)).toEqual(['127.0.0.1:3000', 'app.local:8080']);
    await expect(page.check('http://127.0.0.1:3000/app.js', 'Script')).resolves.toBeUndefined();
    await expect(page.check('http://app.local:8080/x', 'XHR')).resolves.toBeUndefined();
    // Another port, another host of the same machine: still the page's own choice.
    await expect(page.check('http://127.0.0.1:3001/', 'XHR')).rejects.toThrow(/Blocked private/);
    await expect(page.check('http://app.local/', 'Document')).rejects.toThrow(/Blocked private/);
    await expect(page.check('http://10.0.0.1:3000/', 'Image')).rejects.toThrow(/Blocked private/);
  });

  it('sees a public name answered from a private address, but not an approved or proxied one', async () => {
    const page = policy({ 'app.local': ['127.0.0.1'] });
    await page.approve(new URL('http://app.local:8080/'));
    expect(page.rebinds('https://cdn.example/x', '10.0.0.5', 443)).toBe(true);
    expect(page.rebinds('https://cdn.example/x', '[::1]', 443)).toBe(true);
    expect(page.rebinds('https://cdn.example/x', '93.184.216.34', 443)).toBe(false);
    // Chrome connected to another port than the URL's: a proxy, whose address says nothing.
    expect(page.rebinds('https://cdn.example/x', '127.0.0.1', 3128)).toBe(false);
    expect(page.rebinds('http://app.local:8080/x', '127.0.0.1', 8080)).toBe(false);
    // A literal address was already judged by `check`.
    expect(page.rebinds('http://127.0.0.1:3000/', '127.0.0.1', 3000)).toBe(false);
    expect(page.rebinds('data:text/plain,x', '127.0.0.1')).toBe(false);
  });
});

const stubs: CdpStub[] = [];
const tools: InstanceType<typeof BrowserTool>[] = [];
const closers: Array<() => Promise<unknown> | unknown> = [];

beforeEach(() => launch.mockReset());

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tools.splice(0).map((tool) => tool.close()));
  await Promise.all(stubs.splice(0).map((stub) => stub.close()));
  while (closers.length > 0) await closers.pop()!();
});

/** A page whose snapshot and load state answer like a loaded page, plus whatever `extra` does. */
function pageHandler(extra: CdpHandler = () => undefined): CdpHandler {
  return (method, params, page) => {
    const custom = extra(method, params, page);
    if (custom !== undefined) return custom;
    if (method === 'Runtime.evaluate') {
      const expression = String(params['expression']);
      if (expression.includes('items.push')) return { result: { value: { title: 'Stub', url: 'https://example.com/', text: 'page', items: [] } } };
      if (expression.includes('document.readyState')) return { result: { value: 'complete' } };
      if (expression.includes('location.href')) return { result: { value: 'https://example.com/ | Stub' } };
      return { result: { value: 1 } };
    }
    if (method === 'Page.navigate') return { frameId: 'f' };
    return {};
  };
}

interface Setup {
  cdp: CdpStub;
  browser: InstanceType<typeof BrowserTool>;
  entries: Array<{ customType: string; data: unknown }>;
  audit: () => AuditEntry[];
  text: (params: Record<string, unknown>) => Promise<string>;
  run: (params: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text?: string }> }>;
  /** The page the session drives now (the stub's end of its WebSocket). */
  page: () => NonNullable<ReturnType<CdpStub['pages']['get']>>;
}

async function setup(options: { mode?: PermissionMode; handle?: CdpHandler; targets?: Parameters<typeof startCdpStub>[0] extends infer O ? (O extends { targets?: infer T } ? T : never) : never } = {}): Promise<Setup> {
  const cdp = await startCdpStub({ handle: pageHandler(options.handle), ...(options.targets ? { targets: options.targets } : {}) });
  stubs.push(cdp);
  vi.stubEnv('OCTOCODE_CHROME_PORT', String(cdp.port));
  const fake = fakePi();
  const browser = new BrowserTool(fakePermission(options.mode ?? 'full', { pi: fake.pi }));
  tools.push(browser);
  let tool: { execute: (...args: unknown[]) => Promise<{ content: Array<{ type: string; text?: string }> }> } | undefined;
  registerBrowserTool({ registerTool: (definition: typeof tool) => (tool = definition), on: () => undefined } as unknown as ExtensionAPI, browser);
  const ctx = fakeCtx({ cwd: '/private/tmp' });
  const run: Setup['run'] = (params) => tool!.execute('call-1', params, undefined, undefined, ctx);
  return {
    cdp,
    browser,
    entries: fake.entries,
    audit: () => fake.entries.map((entry) => entry.data as AuditEntry),
    run,
    text: async (params) => (await run(params)).content.map((part) => part.text ?? '').join('\n'),
    page: () => [...cdp.pages.values()].at(-1)!,
  };
}

const paused = (requestId: string, url: string, resourceType: string, extra: Record<string, unknown> = {}) => ({ requestId, request: { url }, resourceType, frameId: 'f', ...extra });
const answered = (cdp: CdpStub, method: 'Fetch.failRequest' | 'Fetch.continueRequest'): string[] => cdp.commands.filter((command) => command.method === method).map((command) => String(command.params['requestId']));

describe('browser page requests', () => {
  it('pauses every resource type with the cache and service workers off', async () => {
    const { cdp, browser } = await setup();
    await browser.session();
    const methods = cdp.commands.map((command) => command.method);
    expect(cdp.commands.find((command) => command.method === 'Fetch.enable')?.params).toEqual({ patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
    expect(cdp.commands.find((command) => command.method === 'Network.setCacheDisabled')?.params).toEqual({ cacheDisabled: true });
    expect(cdp.commands.find((command) => command.method === 'Network.setBypassServiceWorker')?.params).toEqual({ bypass: true });
    // A service worker would answer a page's fetch unpaused, so the bypass is in place before the first pause.
    expect(methods.indexOf('Network.setBypassServiceWorker')).toBeLessThan(methods.indexOf('Fetch.enable'));
    expect(methods.indexOf('Network.enable')).toBeLessThan(methods.indexOf('Fetch.enable'));
  });

  it('fails fetch, image, subframe, redirect-hop and worker requests to private hosts, and passes public ones', async () => {
    const { cdp, browser, audit } = await setup();
    const session = await browser.session();
    const page = [...cdp.pages.values()].at(-1)!;
    const types: Array<[string, string, Record<string, unknown>?]> = [
      ['XHR', PRIVATE_HOSTS[0]!],
      ['Image', PRIVATE_HOSTS[1]!],
      ['Document', PRIVATE_HOSTS[2]!],
      ['XHR', PRIVATE_HOSTS[3]!, { redirectedRequestId: 'hop' }],
      ['Other', PRIVATE_HOSTS[4]!],
      ['Script', 'http://localhost:1/x.js'],
    ];
    types.forEach(([type, url, extra], index) => page.emit('Fetch.requestPaused', paused(`bad-${index}`, url, type, extra)));
    page.emit('Fetch.requestPaused', paused('good-1', 'https://93.184.216.34/app.js', 'Script'));
    page.emit('Fetch.requestPaused', paused('good-2', 'data:image/png;base64,AAAA', 'Image'));
    await vi.waitFor(() => expect(answered(cdp, 'Fetch.failRequest')).toHaveLength(6));
    await vi.waitFor(() => expect(answered(cdp, 'Fetch.continueRequest').sort()).toEqual(['good-1', 'good-2']));
    expect(answered(cdp, 'Fetch.failRequest').sort()).toEqual(['bad-0', 'bad-1', 'bad-2', 'bad-3', 'bad-4', 'bad-5']);
    expect(cdp.commands.filter((command) => command.method === 'Fetch.failRequest').every((command) => command.params['errorReason'] === 'BlockedByClient')).toBe(true);
    // The agent is told, and the console keeps the evidence.
    expect(session.blocked).toMatch(/Blocked (private or local address|unresolved host)/);
    expect(session.console.some((line) => line.startsWith('[blocked] http://10.0.0.1/admin: Blocked private or local address: 10.0.0.1'))).toBe(true);
    // No dialog and no ask: only the audit, one entry per host.
    const refused = audit().filter((entry) => entry.action === 'invariant');
    expect(refused.map((entry) => entry.allowed)).toEqual(refused.map(() => false));
    expect(refused).toHaveLength(6);
    expect(refused[0]!.note).toMatch(/^browser: blocked a page request \(XHR\)/);
    page.emit('Fetch.requestPaused', paused('again', PRIVATE_HOSTS[0]!, 'Image'));
    await vi.waitFor(() => expect(answered(cdp, 'Fetch.failRequest')).toContain('again'));
    expect(audit().filter((entry) => entry.action === 'invariant')).toHaveLength(6);
  });

  it('fails private page requests in every mode, with nothing to confirm', async () => {
    for (const mode of ['manual', 'workspace', 'full'] as const) {
      const { cdp, browser, audit } = await setup({ mode });
      await browser.session();
      [...cdp.pages.values()].at(-1)!.emit('Fetch.requestPaused', paused('r', 'http://127.0.0.1:9/', 'Image'));
      await vi.waitFor(() => expect(answered(cdp, 'Fetch.failRequest')).toEqual(['r']), { timeout: 5_000 });
      expect(audit().filter((entry) => entry.action === 'invariant')).toHaveLength(1);
    }
  });

  it('lets the page load from the target the agent opened, and nothing else private', async () => {
    const { cdp, browser } = await setup({ mode: 'workspace' });
    const ctx = fakeCtx({ cwd: '/private/tmp' });
    ctx.ui.select = async (_title, choices) => choices.find((choice) => choice.startsWith('Allow')) ?? choices[0]!;
    browser.useContext(ctx, 'call-1');
    await browser.session();
    const page = [...cdp.pages.values()].at(-1)!;
    page.emit('Fetch.requestPaused', paused('before', 'http://127.0.0.1:3000/app.js', 'Script'));
    await vi.waitFor(() => expect(answered(cdp, 'Fetch.failRequest')).toEqual(['before']));
    await browser.open('http://127.0.0.1:3000/');
    page.emit('Fetch.requestPaused', paused('own', 'http://127.0.0.1:3000/app.js', 'Script'));
    page.emit('Fetch.requestPaused', paused('other', 'http://127.0.0.1:3001/api', 'XHR'));
    await vi.waitFor(() => expect(answered(cdp, 'Fetch.continueRequest')).toEqual(['own']));
    await vi.waitFor(() => expect(answered(cdp, 'Fetch.failRequest')).toEqual(['before', 'other']));
  });

  it('fails a paused request the policy does not answer within 5 seconds', async () => {
    const cdp = await startCdpStub({ handle: pageHandler() });
    stubs.push(cdp);
    const report = vi.fn();
    const session = await openBrowser({}, { port: cdp.port, reuseTab: true, policy: { check: () => new Promise<never>(() => undefined), rebinds: () => false, report } });
    const started = Date.now();
    [...cdp.pages.values()].at(-1)!.emit('Fetch.requestPaused', paused('slow', 'https://slow.example/x', 'XHR'));
    await vi.waitFor(() => expect(answered(cdp, 'Fetch.failRequest')).toEqual(['slow']), { timeout: 9_000 });
    expect(Date.now() - started).toBeGreaterThanOrEqual(4_900);
    expect(report).toHaveBeenCalledWith({ kind: 'blocked', url: 'https://slow.example/x', resourceType: 'XHR', reason: 'The request check timed out after 5s' });
    session.page.close();
  }, 20_000);

  it('closes the tab and audits a public name that answers from a private address', async () => {
    const { cdp, browser, audit } = await setup();
    const session = await browser.session();
    const page = [...cdp.pages.values()].at(-1)!;
    // Another port than the URL's is a proxy: not a rebinding. A public address is fine.
    page.emit('Network.responseReceived', { response: { url: 'https://cdn.example/a', remoteIPAddress: '127.0.0.1', remotePort: 3128 } });
    page.emit('Network.responseReceived', { response: { url: 'https://cdn.example/b', remoteIPAddress: '93.184.216.34', remotePort: 443 } });
    page.emit('Network.responseReceived', { response: { url: 'http://127.0.0.1:5000/', remoteIPAddress: '127.0.0.1', remotePort: 5000 } });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(cdp.requests.some((request) => request.startsWith('GET /json/close/'))).toBe(false);

    page.emit('Network.responseReceived', { response: { url: 'https://cdn.example/c', remoteIPAddress: '10.0.0.5', remotePort: 443 } });
    await vi.waitFor(() => expect(cdp.requests).toContain(`GET /json/close/${session.targetId}`));
    expect(session.console.some((line) => line.includes('answered from the private address 10.0.0.5; the tab was closed'))).toBe(true);
    expect(audit().at(-1)).toMatchObject({ action: 'invariant', allowed: false });
    expect(audit().at(-1)!.note).toMatch(/closed the tab: a public name answered from a private address \(DNS rebinding\)/);
  });

  it('reports a WebSocket to a private host, as audit entry and warning, without blocking it', async () => {
    const { cdp, browser, audit, text } = await setup();
    const session = await browser.session();
    const page = [...cdp.pages.values()].at(-1)!;
    page.emit('Network.webSocketCreated', { requestId: 'w1', url: 'wss://93.184.216.34/live' });
    page.emit('Network.webSocketCreated', { requestId: 'w2', url: 'ws://127.0.0.1:4000/socket' });
    await vi.waitFor(() => expect(session.warning).toMatch(/^The page opened a WebSocket it may not \(ws:\/\/127\.0\.0\.1:4000\/socket\): Blocked private or local address: 127\.0\.0\.1:4000\./));
    expect(session.console.some((line) => line.startsWith('[warning] The page opened a WebSocket'))).toBe(true);
    const reported = audit().filter((entry) => entry.via === 'reported');
    expect(reported).toHaveLength(1);
    expect(reported[0]).toMatchObject({ action: 'invariant', allowed: true, what: ['ws://127.0.0.1:4000/socket'] });
    expect(reported[0]!.note).toMatch(/^browser: a page WebSocket was not blocked, reported only/);
    // Nothing was failed or closed: Fetch cannot stop a handshake, and the report says so.
    expect(answered(cdp, 'Fetch.failRequest')).toEqual([]);
    // The next result that carries page notes leads with it, once.
    expect(await text({ action: 'tabs' })).not.toContain('Warning:');
    expect(await text({ action: 'tab', url: 'https://93.184.216.34/' })).toMatch(/^Warning: The page opened a WebSocket it may not/);
    expect(await text({ action: 'tab', url: 'https://93.184.216.34/' })).not.toContain('Warning:');
  }, 20_000);

  it('does not report a WebSocket to the host the agent opened', async () => {
    const { cdp, browser, audit } = await setup();
    const session = await browser.session();
    await browser.open('http://127.0.0.1:4000/');
    [...cdp.pages.values()].at(-1)!.emit('Network.webSocketCreated', { requestId: 'w', url: 'ws://127.0.0.1:4000/hmr' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(session.warning).toBeUndefined();
    expect(audit().filter((entry) => entry.via === 'reported')).toEqual([]);
  });

  it('applies net.private to a tab the agent switches to, before connecting to it', async () => {
    const targets = [
      { id: 'tab-0', type: 'page', url: 'https://93.184.216.34/' },
      { id: 'internal', type: 'page', url: 'http://127.0.0.1:3000/admin' },
      { id: 'blank', type: 'page', url: 'about:blank' },
    ];
    // Manual mode with no one to ask: refused, and the stub never sees a connection to that tab.
    const refused = await setup({ mode: 'manual', targets });
    await refused.browser.session();
    const order = await refused.text({ action: 'tabs' });
    const index = Number(/\[(\d+)\][^\n]*127\.0\.0\.1:3000/.exec(order)![1]);
    await expect(refused.run({ action: 'tab', index })).rejects.toThrow(/Blocked private or local address: 127\.0\.0\.1:3000\. Not run/);
    expect(refused.cdp.pages.has('internal')).toBe(false);
    // A tab with no web address needs no check.
    const blank = Number(/\[(\d+)\][^\n]*about:blank/.exec(order)![1]);
    await expect(refused.run({ action: 'tab', index: blank })).resolves.toBeDefined();
    expect(refused.cdp.pages.has('blank')).toBe(true);

    // Full mode allows it; the tab then loads from its own host, and still nothing else private.
    const allowed = await setup({ mode: 'full', targets });
    await allowed.browser.session();
    const listed = await allowed.text({ action: 'tabs' });
    await allowed.run({ action: 'tab', index: Number(/\[(\d+)\][^\n]*127\.0\.0\.1:3000/.exec(listed)![1]) });
    expect(allowed.cdp.pages.has('internal')).toBe(true);
    const page = allowed.cdp.pages.get('internal')!;
    page.emit('Fetch.requestPaused', paused('own', 'http://127.0.0.1:3000/x.js', 'Script'));
    page.emit('Fetch.requestPaused', paused('other', 'http://127.0.0.1:3001/x.js', 'Script'));
    await vi.waitFor(() => expect(answered(allowed.cdp, 'Fetch.continueRequest')).toContain('own'));
    await vi.waitFor(() => expect(answered(allowed.cdp, 'Fetch.failRequest')).toEqual(['other']));
  }, 20_000);

  it('never opens a dialog for a private page request, even in manual mode', async () => {
    const { cdp, browser } = await setup({ mode: 'manual' });
    const ctx = fakeCtx({ cwd: '/private/tmp' });
    const select = vi.fn();
    ctx.ui.select = select;
    browser.useContext(ctx, 'call-1');
    await browser.session();
    [...cdp.pages.values()].at(-1)!.emit('Fetch.requestPaused', paused('r', 'http://10.1.1.1/', 'Document'));
    await vi.waitFor(() => expect(answered(cdp, 'Fetch.failRequest')).toEqual(['r']));
    expect(select).not.toHaveBeenCalled();
  });
});

describe('browser launched Chrome behind the filtering proxy', () => {
  const servers: http.Server[] = [];
  const listen = (body: string): Promise<number> =>
    new Promise((resolve) => {
      const server = http.createServer((_request, response) => response.end(body));
      servers.push(server);
      server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
    });
  afterEach(() => {
    for (const server of servers.splice(0)) {
      server.closeAllConnections();
      server.close();
    }
  });

  /** GET `url` through the proxy at `proxyUrl`, as Chrome sends it. */
  const viaProxy = (proxyUrl: string, url: string): Promise<{ status: number; body: string; blocked: string | undefined }> =>
    new Promise((resolve, reject) => {
      const proxy = new URL(proxyUrl);
      http
        .get({ host: proxy.hostname, port: Number(proxy.port), path: url, headers: { host: new URL(url).host } }, (response) => {
          let body = '';
          response.on('data', (chunk: Buffer) => (body += chunk.toString()));
          response.on('end', () => resolve({ status: response.statusCode ?? 0, body, blocked: response.headers['x-octocode-blocked'] as string | undefined }));
        })
        .on('error', reject);
    });

  async function launched(mode: PermissionMode) {
    const cdp = await startCdpStub({ handle: pageHandler() });
    stubs.push(cdp);
    launch.mockResolvedValue({ port: cdp.port, kill: vi.fn(async () => undefined), process: { unref: vi.fn() } });
    vi.stubEnv('OCTOCODE_HOME', fakeHome());
    vi.stubEnv('OCTOCODE_CHROME_PORT', '');
    const fake = fakePi();
    const browser = new BrowserTool(fakePermission(mode, { pi: fake.pi }));
    tools.push(browser);
    return { cdp, browser, audit: () => fake.entries.map((entry) => entry.data as AuditEntry) };
  }

  it('lets the proxy through to targets the agent opened only, and audits what it refuses', async () => {
    const approvedPort = await listen('approved');
    const otherPort = await listen('other');
    const { cdp, browser } = await launched('manual');
    const session = await browser.session();
    const proxy = session.chrome!.proxy!;
    const allow = vi.spyOn(proxy, 'allow');
    expect(launch.mock.calls[0]![0].chromeFlags).toContain(`--proxy-server=${proxy.url}`);

    // Refused (manual, no one to ask), and a public target: neither is allowed through the proxy.
    await expect(browser.open(`http://127.0.0.1:${approvedPort}/`)).rejects.toThrow(/no one can be asked here/);
    expect(allow).not.toHaveBeenCalled();
    // A page request never allows anything.
    [...cdp.pages.values()].at(-1)!.emit('Fetch.requestPaused', paused('r', `http://127.0.0.1:${approvedPort}/x`, 'XHR'));
    await vi.waitFor(() => expect(answered(cdp, 'Fetch.failRequest')).toEqual(['r']));
    expect(allow).not.toHaveBeenCalled();
    expect((await viaProxy(proxy.url, `http://127.0.0.1:${approvedPort}/`)).status).toBe(403);

    // The agent opens one target (full mode: allowed without a prompt).
    const full = await launched('full');
    const fullSession = await full.browser.session();
    const fullAllow = vi.spyOn(fullSession.chrome!.proxy!, 'allow');
    await full.browser.open('https://93.184.216.34/');
    expect(fullAllow).not.toHaveBeenCalled();
    await full.browser.open(`http://127.0.0.1:${approvedPort}/`);
    expect(fullAllow).toHaveBeenCalledTimes(1);
    expect(fullAllow.mock.calls[0]![0].href).toBe(`http://127.0.0.1:${approvedPort}/`);
    const fullProxy = fullSession.chrome!.proxy!.url;
    expect(await viaProxy(fullProxy, `http://127.0.0.1:${approvedPort}/`)).toMatchObject({ status: 200, body: 'approved' });
    expect(await viaProxy(fullProxy, `http://127.0.0.1:${otherPort}/`)).toMatchObject({ status: 403, blocked: 'private' });

    // A Chrome that starts later is told about the targets the agent already opened.
    await full.browser.close();
    const again = await full.browser.session();
    expect(await viaProxy(again.chrome!.proxy!.url, `http://127.0.0.1:${approvedPort}/`)).toMatchObject({ status: 200, body: 'approved' });

    // The refusal is in the audit, once per host.
    expect(await viaProxy(again.chrome!.proxy!.url, `http://127.0.0.1:${otherPort}/`)).toMatchObject({ status: 403 });
    const proxied = full.audit().filter((entry) => entry.note?.includes('filtering proxy'));
    expect(proxied).toHaveLength(1);
    expect(proxied[0]).toMatchObject({ action: 'invariant', allowed: false, what: [`127.0.0.1:${otherPort}`] });
    expect(proxied[0]!.note).toBe('browser: the filtering proxy refused a page connection to a local or private address');
  }, 30_000);

  it('trusts the proxy for rebinding and WebSockets: neither is reported from the page session', async () => {
    const { cdp, browser, audit } = await launched('full');
    const session = await browser.session();
    const page = [...cdp.pages.values()].at(-1)!;
    // Chrome sees only the proxy's address behind it.
    page.emit('Network.responseReceived', { response: { url: 'https://cdn.example/x', remoteIPAddress: '127.0.0.1', remotePort: 443 } });
    page.emit('Network.webSocketCreated', { requestId: 'w', url: 'ws://127.0.0.1:4000/' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(cdp.requests.some((request) => request.startsWith('GET /json/close/'))).toBe(false);
    expect(session.warning).toBeUndefined();
    expect(audit()).toEqual([]);
  });
});

function fakeHome(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-net-'));
  closers.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
