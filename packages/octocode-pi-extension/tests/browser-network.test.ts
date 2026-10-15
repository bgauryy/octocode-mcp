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
import { PagePolicy, VERDICTS_MAX } from '../src/browser/network.js';
import type { HostLookup } from '../src/web/guard.js';

const launch = vi.hoisted(() => vi.fn());
vi.mock('chrome-launcher', () => ({ launch }));

const { AUDIT_KEYS_MAX, BrowserTool, registerBrowserTool } = await import('../src/browser/tool.js');
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

  it('approves only the host and port the agent opened, decides nothing itself, and forgets them on revoke', async () => {
    const resolver = lookup({ 'cdn.example': ['93.184.216.34'], 'app.local': ['127.0.0.1'] });
    const page = new PagePolicy({ report: () => undefined, lookup: resolver });
    page.approve(new URL('http://127.0.0.1:3000/app'), 'session');
    page.approve(new URL('http://app.local:8080/'), 'session');
    // Approval never resolves a name: the caller classified once and asked net.private.
    expect(resolver).not.toHaveBeenCalled();
    await expect(page.check('https://cdn.example/x', 'Script')).resolves.toBeUndefined();
    await expect(page.check('http://127.0.0.1:3000/app.js', 'Script')).resolves.toBeUndefined();
    await expect(page.check('http://app.local:8080/x', 'XHR')).resolves.toBeUndefined();
    // Another port, another host of the same machine: still the page's own choice.
    await expect(page.check('http://127.0.0.1:3001/', 'XHR')).rejects.toThrow(/Blocked private/);
    await expect(page.check('http://app.local/', 'Document')).rejects.toThrow(/Blocked private/);
    await expect(page.check('http://10.0.0.1:3000/', 'Image')).rejects.toThrow(/Blocked private/);
    page.revoke();
    await expect(page.check('http://127.0.0.1:3000/app.js', 'Script')).rejects.toThrow(/Blocked private/);
    await expect(page.check('http://app.local:8080/x', 'XHR')).rejects.toThrow(/Blocked private/);
  });

  it('approves a once-approved host for its tab only, until that tab leaves the host or closes', async () => {
    const page = policy();
    page.approve(new URL('http://127.0.0.1:3000/'), { tab: 'a' });
    await expect(page.check('http://127.0.0.1:3000/x.js', 'Script', { tab: 'a' })).resolves.toBeUndefined();
    // Another tab, or a request with no tab behind it, never reaches it; nor does another port.
    await expect(page.check('http://127.0.0.1:3000/x.js', 'XHR', { tab: 'b' })).rejects.toThrow(/Blocked private/);
    await expect(page.check('http://127.0.0.1:3000/x.js', 'XHR')).rejects.toThrow(/Blocked private/);
    await expect(page.check('http://127.0.0.1:3001/x.js', 'XHR', { tab: 'a' })).rejects.toThrow(/Blocked private/);
    // The same host, a path or fragment away, is still its own.
    page.navigated('a', 'http://127.0.0.1:3000/other#frag');
    await expect(page.check('http://127.0.0.1:3000/x.js', 'Script', { tab: 'a' })).resolves.toBeUndefined();
    page.navigated('b', 'https://example.com/');
    // Navigating to another host ends it, though the tab comes back.
    page.navigated('a', 'https://93.184.216.34/');
    await expect(page.check('http://127.0.0.1:3000/x.js', 'Script', { tab: 'a' })).rejects.toThrow(/Blocked private/);
    page.navigated('a', 'http://127.0.0.1:3000/');
    await expect(page.check('http://127.0.0.1:3000/x.js', 'Script', { tab: 'a' })).rejects.toThrow(/Blocked private/);
    // A tab that closes takes its approval along.
    page.approve(new URL('http://127.0.0.1:3000/'), { tab: 'a' });
    expect(page.approves('127.0.0.1', 3000)).toBe(true);
    page.closed('a');
    expect(page.approves('127.0.0.1', 3000)).toBe(false);
    await expect(page.check('http://127.0.0.1:3000/x.js', 'Script', { tab: 'a' })).rejects.toThrow(/Blocked private/);
    // A tab approved for one host moves to the next one the agent opens.
    page.approve(new URL('http://127.0.0.1:3000/'), { tab: 'a' });
    page.approve(new URL('http://127.0.0.1:4000/'), { tab: 'a' });
    expect(page.approves('127.0.0.1', 3000)).toBe(false);
    expect(page.approves('127.0.0.1', 4000)).toBe(true);
  });

  it('gives a popup the approval of the tab that opened it, until the popup leaves the host', async () => {
    const page = policy();
    page.approve(new URL('http://127.0.0.1:3000/'), { tab: 'a' });
    page.opened('a', 'popup');
    await expect(page.check('http://127.0.0.1:3000/x.js', 'Script', { tab: 'popup' })).resolves.toBeUndefined();
    page.navigated('popup', 'https://93.184.216.34/');
    await expect(page.check('http://127.0.0.1:3000/x.js', 'Script', { tab: 'popup' })).rejects.toThrow(/Blocked private/);
    // The opener keeps its own; a popup of a tab with none gets none.
    await expect(page.check('http://127.0.0.1:3000/x.js', 'Script', { tab: 'a' })).resolves.toBeUndefined();
    page.opened('other', 'popup2');
    await expect(page.check('http://127.0.0.1:3000/x.js', 'Script', { tab: 'popup2' })).rejects.toThrow(/Blocked private/);
  });

  it('keeps a session approval for every tab, whatever they navigate to, until revoke', async () => {
    const page = policy();
    page.approve(new URL('http://127.0.0.1:3000/'), 'session');
    for (const tab of ['a', 'b', undefined]) await expect(page.check('http://127.0.0.1:3000/x.js', 'XHR', tab ? { tab } : {})).resolves.toBeUndefined();
    page.navigated('a', 'https://93.184.216.34/');
    await expect(page.check('http://127.0.0.1:3000/x.js', 'XHR', { tab: 'a' })).resolves.toBeUndefined();
    expect(page.approves('127.0.0.1', 3000)).toBe(true);
    page.revoke();
    await expect(page.check('http://127.0.0.1:3000/x.js', 'XHR', { tab: 'a' })).rejects.toThrow(/Blocked private/);
  });

  it('lets a worker of an approved origin reach that host while a tab holds it, and no worker of another origin', async () => {
    const page = policy();
    page.approve(new URL('http://127.0.0.1:3000/'), { tab: 'a' });
    await expect(page.check('http://127.0.0.1:3000/data', 'Fetch', { origin: 'http://127.0.0.1:3000' })).resolves.toBeUndefined();
    await expect(page.check('http://127.0.0.1:3000/data', 'Fetch', { origin: 'https://evil.example' })).rejects.toThrow(/Blocked private/);
    page.closed('a');
    await expect(page.check('http://127.0.0.1:3000/data', 'Fetch', { origin: 'http://127.0.0.1:3000' })).rejects.toThrow(/Blocked private/);
  });

  it('refuses a name that answered public once and private since, and sees it answer from a private address', async () => {
    let clock = 0;
    let answers = 0;
    const flipping: HostLookup = async () => [{ address: answers++ === 0 ? '93.184.216.34' : '10.0.0.5' }];
    const page = new PagePolicy({ report: () => undefined, lookup: flipping, now: () => clock });
    await expect(page.check('https://rebind.example/', 'Document')).resolves.toBeUndefined();
    clock = 31_000;
    await expect(page.check('https://rebind.example/x', 'XHR')).rejects.toThrow(/Blocked private or local address: rebind\.example/);
    expect(page.rebinds('https://rebind.example/x', '10.0.0.5', 443)).toBe(true);
  });

  it('sees a public name answered from a private address, but not an approved or proxied one', async () => {
    const page = policy({ 'app.local': ['127.0.0.1'] });
    page.approve(new URL('http://app.local:8080/'), { tab: 'tab-1' });
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

async function setup(options: { mode?: PermissionMode; lookup?: HostLookup; flushMs?: number; handle?: CdpHandler; targets?: Parameters<typeof startCdpStub>[0] extends infer O ? (O extends { targets?: infer T } ? T : never) : never } = {}): Promise<Setup> {
  const cdp = await startCdpStub({ handle: pageHandler(options.handle), ...(options.targets ? { targets: options.targets } : {}) });
  stubs.push(cdp);
  vi.stubEnv('OCTOCODE_CHROME_PORT', String(cdp.port));
  const fake = fakePi();
  const browser = new BrowserTool(fakePermission(options.mode ?? 'full', { pi: fake.pi }), { ...(options.lookup ? { lookup: options.lookup } : {}), ...(options.flushMs ? { flushMs: options.flushMs } : {}) });
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

/** Opens `url` as the agent does and records its approval for the tab the session drives now. */
const openFor = async (browser: InstanceType<typeof BrowserTool>, url: string): Promise<void> => (await browser.open(url))((await browser.session()).targetId);

/** A tab's frame navigated, as Chrome reports it; the main frame unless `frame` names a parent. */
const navigates = (page: { emit: (method: string, params?: Record<string, unknown>) => void }, url: string, frame: Record<string, unknown> = {}) => page.emit('Page.frameNavigated', { frame: { id: 'main', url, ...frame } });

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
    // The same refusal again is counted, not written again; a different resource type to the same host is another refusal and is audited.
    page.emit('Fetch.requestPaused', paused('again', PRIVATE_HOSTS[0]!, 'XHR'));
    await vi.waitFor(() => expect(answered(cdp, 'Fetch.failRequest')).toContain('again'));
    expect(audit().filter((entry) => entry.action === 'invariant')).toHaveLength(6);
    page.emit('Fetch.requestPaused', paused('other-type', PRIVATE_HOSTS[0]!, 'Image'));
    await vi.waitFor(() => expect(answered(cdp, 'Fetch.failRequest')).toContain('other-type'));
    expect(audit().filter((entry) => entry.action === 'invariant')).toHaveLength(7);
    expect(audit().filter((entry) => entry.action === 'invariant').at(-1)!.note).toMatch(/blocked a page request \(Image\)/);
    // When the browser session ends, the repeat is audited with its count.
    await browser.close();
    const summary = audit().filter((entry) => entry.action === 'invariant').at(-1)!;
    expect(summary.note).toMatch(/^browser: \(2 times this browser session\) blocked a page request \(XHR\)/);
  });

  it('audits a repeat count soon after it grows, not only when the browser session ends', async () => {
    const { cdp, browser, audit } = await setup({ flushMs: 40 });
    await browser.session();
    const page = [...cdp.pages.values()].at(-1)!;
    for (const id of ['r1', 'r2', 'r3']) page.emit('Fetch.requestPaused', paused(id, 'http://127.0.0.1:9/x', 'XHR'));
    const notes = () => audit().filter((entry) => entry.action === 'invariant').map((entry) => entry.note);
    // Written before any close: a crash now still leaves the count.
    await vi.waitFor(() => expect(notes().at(-1)).toMatch(/^browser: \(3 times this browser session\) blocked a page request/));
    expect(notes()).toHaveLength(2);
    // Nothing new, nothing more written; a further repeat is written again, cumulatively.
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(notes()).toHaveLength(2);
    page.emit('Fetch.requestPaused', paused('r4', 'http://127.0.0.1:9/x', 'XHR'));
    await vi.waitFor(() => expect(notes().at(-1)).toMatch(/^browser: \(4 times this browser session\)/));
    await browser.close();
    expect(notes()).toHaveLength(3);
  });

  it('counts the refusals past the distinct-entry bound under one entry instead of listing or dropping them', async () => {
    const { cdp, browser, audit } = await setup();
    await browser.session();
    const page = [...cdp.pages.values()].at(-1)!;
    const total = AUDIT_KEYS_MAX + 7;
    for (let n = 0; n < total; n++) page.emit('Fetch.requestPaused', paused(`r${n}`, `http://10.0.${n >> 8}.${n & 255}/`, 'XHR'));
    await vi.waitFor(() => expect(answered(cdp, 'Fetch.failRequest')).toHaveLength(total), { timeout: 5_000 });
    const entries = () => audit().filter((entry) => entry.action === 'invariant');
    await vi.waitFor(() => expect(entries()).toHaveLength(AUDIT_KEYS_MAX + 1));
    expect(entries().at(-1)!.note).toMatch(/^browser: 1 more distinct refusals or reports after the first 100/);
    await browser.close();
    expect(entries()).toHaveLength(AUDIT_KEYS_MAX + 2);
    expect(entries().at(-1)!.note).toMatch(/^browser: 7 more distinct refusals or reports after the first 100, counted here and not listed one by one/);
  });

  it('bounds the host verdicts it keeps: the oldest is dropped at the bound and classified again, never answered wrongly', async () => {
    const names = Array.from({ length: VERDICTS_MAX + 1 }, (_, n) => `h${n}.example`);
    const counting = vi.fn(async () => [{ address: '93.184.216.34' }]);
    const bounded = new PagePolicy({ report: () => undefined, lookup: counting, now: () => 0 });
    for (const name of names) await bounded.check(`https://${name}/`, 'Image');
    expect(counting).toHaveBeenCalledTimes(names.length);
    // The newest is still remembered; the oldest was dropped at the bound and is looked up again.
    await bounded.check(`https://${names.at(-1)}/`, 'Image');
    expect(counting).toHaveBeenCalledTimes(names.length);
    await bounded.check(`https://${names[0]}/`, 'Image');
    expect(counting).toHaveBeenCalledTimes(names.length + 1);
  });

  it('does not approve a name that answered public to the agent check and private afterwards, and never grants net.private for it', async () => {
    for (const mode of ['full', 'workspace'] as const) {
      let answers = 0;
      const flipping: HostLookup = async () => [{ address: answers++ === 0 ? '93.184.216.34' : '10.0.0.5' }];
      const { cdp, browser, audit } = await setup({ mode, lookup: flipping });
      const ctx = fakeCtx({ cwd: '/private/tmp' });
      const select = vi.fn(async (_title: string, choices: string[]) => choices[0]!);
      ctx.ui.select = select;
      browser.useContext(ctx, 'call-1');
      await browser.session();
      const page = [...cdp.pages.values()].at(-1)!;
      await browser.open('http://rebind.example/');
      // The page's own requests to that name now see a private answer: refused, though the agent opened the name.
      page.emit('Fetch.requestPaused', paused('own', 'http://rebind.example/app.js', 'Script'));
      await vi.waitFor(() => expect(answered(cdp, 'Fetch.failRequest')).toEqual(['own']));
      expect(answered(cdp, 'Fetch.continueRequest')).toEqual([]);
      expect(audit().filter((entry) => entry.action === 'net.private')).toEqual([]);
      expect(select).not.toHaveBeenCalled();
      await browser.close();
    }
  });

  it('still asks net.private for a private name and approves it once granted', async () => {
    const privateLookup: HostLookup = async () => [{ address: '10.0.0.5' }];
    const { cdp, browser, audit } = await setup({ mode: 'full', lookup: privateLookup });
    await browser.session();
    const page = [...cdp.pages.values()].at(-1)!;
    await openFor(browser, 'http://app.local:8080/');
    expect(audit().filter((entry) => entry.action === 'net.private')).toHaveLength(1);
    page.emit('Fetch.requestPaused', paused('own', 'http://app.local:8080/app.js', 'Script'));
    await vi.waitFor(() => expect(answered(cdp, 'Fetch.continueRequest')).toEqual(['own']));
    // Another port of the same name stays the page's own choice.
    page.emit('Fetch.requestPaused', paused('other', 'http://app.local:9090/', 'XHR'));
    await vi.waitFor(() => expect(answered(cdp, 'Fetch.failRequest')).toEqual(['other']));
  });

  it('forgets what the agent opened when the browser session ends', async () => {
    const privateLookup: HostLookup = async () => [{ address: '10.0.0.5' }];
    const { cdp, browser } = await setup({ mode: 'full', lookup: privateLookup });
    await browser.session();
    await openFor(browser, 'http://app.local:8080/');
    await browser.close();
    await browser.session();
    const page = [...cdp.pages.values()].at(-1)!;
    page.emit('Fetch.requestPaused', paused('again', 'http://app.local:8080/app.js', 'Script'));
    await vi.waitFor(() => expect(answered(cdp, 'Fetch.failRequest')).toEqual(['again']));
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
    await openFor(browser, 'http://127.0.0.1:3000/');
    page.emit('Fetch.requestPaused', paused('own', 'http://127.0.0.1:3000/app.js', 'Script'));
    page.emit('Fetch.requestPaused', paused('other', 'http://127.0.0.1:3001/api', 'XHR'));
    await vi.waitFor(() => expect(answered(cdp, 'Fetch.continueRequest')).toEqual(['own']));
    await vi.waitFor(() => expect(answered(cdp, 'Fetch.failRequest')).toEqual(['before', 'other']));
  });

  it('scopes "Allow once" to the tab that opened the private host, and ends it when the tab navigates elsewhere', async () => {
    const { cdp, browser } = await setup({ mode: 'manual' });
    const ctx = fakeCtx({ cwd: '/private/tmp' });
    ctx.ui.select = async (_title, choices) => choices[0]!;
    browser.useContext(ctx, 'call-1');
    await browser.session();
    const page = [...cdp.pages.values()].at(-1)!;
    await openFor(browser, 'http://127.0.0.1:3000/');
    navigates(page, 'http://127.0.0.1:3000/app');
    // A frame of the page is not the tab navigating.
    navigates(page, 'https://example.com/ad', { id: 'ad', parentId: 'main' });
    page.emit('Fetch.requestPaused', paused('own', 'http://127.0.0.1:3000/app.js', 'Script'));
    await vi.waitFor(() => expect(answered(cdp, 'Fetch.continueRequest')).toEqual(['own']));
    // The tab goes to a public page: that page's script cannot reach the host the agent opened earlier.
    navigates(page, 'https://example.com/');
    page.emit('Fetch.requestPaused', paused('hostile', 'http://127.0.0.1:3000/secret', 'Fetch'));
    await vi.waitFor(() => expect(answered(cdp, 'Fetch.failRequest')).toEqual(['hostile']));
  });

  it('lets a popup of a once-approved tab load the host the tab was opened on, and a popup of any other tab nothing private', async () => {
    const { cdp, browser } = await setup({ mode: 'full' });
    const session = await browser.session();
    await openFor(browser, 'http://127.0.0.1:3000/');
    const popup = cdp.autoAttach({ id: 'popup-1', type: 'page', openerId: session.targetId });
    await vi.waitFor(() => expect(cdp.commands.some((command) => command.method === 'Fetch.enable')).toBe(true));
    popup.emit('Fetch.requestPaused', paused('own', 'http://127.0.0.1:3000/popup.js', 'Script'));
    popup.emit('Fetch.requestPaused', paused('other', 'http://127.0.0.1:3001/popup.js', 'Script'));
    await vi.waitFor(() => expect(answered(cdp, 'Fetch.continueRequest')).toContain('own'));
    await vi.waitFor(() => expect(answered(cdp, 'Fetch.failRequest')).toContain('other'));
  });

  it('keeps a session grant for the whole browser session, across navigations of the tab', async () => {
    const { cdp, browser } = await setup({ mode: 'manual' });
    const ctx = fakeCtx({ cwd: '/private/tmp' });
    const select = vi.fn(async (_title: string, choices: string[]) => choices.find((choice) => choice.endsWith('for this session') && choice.includes('127.0.0.1:3000')) ?? choices[0]!);
    ctx.ui.select = select;
    browser.useContext(ctx, 'call-1');
    await browser.session();
    const page = [...cdp.pages.values()].at(-1)!;
    await openFor(browser, 'http://127.0.0.1:3000/');
    navigates(page, 'https://example.com/');
    page.emit('Fetch.requestPaused', paused('later', 'http://127.0.0.1:3000/app.js', 'Script'));
    await vi.waitFor(() => expect(answered(cdp, 'Fetch.continueRequest')).toEqual(['later']));
    // The grant also answers the next open, with no new dialog.
    await openFor(browser, 'http://127.0.0.1:3000/again');
    expect(select).toHaveBeenCalledTimes(1);
    await browser.close();
    await browser.session();
    [...cdp.pages.values()].at(-1)!.emit('Fetch.requestPaused', paused('after', 'http://127.0.0.1:3000/app.js', 'Script'));
    await vi.waitFor(() => expect(answered(cdp, 'Fetch.failRequest')).toEqual(['after']));
  });

  it('keys grants by host and effective port: a grant for http://localhost does not cover https://localhost', async () => {
    const { browser } = await setup({ mode: 'manual', lookup: async () => [{ address: '10.0.0.5' }] });
    const ctx = fakeCtx({ cwd: '/private/tmp' });
    const dialogs: string[][] = [];
    ctx.ui.select = async (_title: string, choices: string[]) => {
      dialogs.push(choices);
      return choices.find((choice) => choice.endsWith('for this session')) ?? choices[0]!;
    };
    browser.useContext(ctx, 'call-1');
    await browser.open('http://app.local/');
    await browser.open('http://app.local:80/other');
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]).toContain('Allow app.local:80 for this session');
    await browser.open('https://app.local/');
    expect(dialogs).toHaveLength(2);
    expect(dialogs[1]).toContain('Allow app.local:443 for this session');
    expect(browser.permission.grants()).toEqual(['net.private: app.local:80', 'net.private: app.local:443']);
  });

  it('drops a tab\'s approval when the tab closes', async () => {
    const { cdp, browser } = await setup({ mode: 'full' });
    const session = await browser.session();
    await openFor(browser, 'http://127.0.0.1:3000/');
    const page = cdp.pages.get(session.targetId)!;
    page.emit('Fetch.requestPaused', paused('own', 'http://127.0.0.1:3000/app.js', 'Script'));
    await vi.waitFor(() => expect(answered(cdp, 'Fetch.continueRequest')).toEqual(['own']));
    navigates(page, 'http://127.0.0.1:3000/app');
    await vi.waitFor(() => expect([...session.tabOrigins.values()]).toEqual(['http://127.0.0.1:3000']));
    expect(session.policy!.approves('127.0.0.1', 3000)).toBe(true);
    // Chrome reports the tab gone: its approval ends with it, and so does the origin it pinned.
    page.drop();
    await vi.waitFor(() => expect(session.tabOrigins.size).toBe(0));
    expect(session.policy!.approves('127.0.0.1', 3000)).toBe(false);
  });

  it('fails a paused request the policy does not answer within 5 seconds', async () => {
    const cdp = await startCdpStub({ handle: pageHandler() });
    stubs.push(cdp);
    const report = vi.fn();
    const session = await openBrowser({}, { port: cdp.port, reuseTab: true, policy: { check: () => new Promise<never>(() => undefined), rebinds: () => false, report, navigated: () => undefined, opened: () => undefined, closed: () => undefined, approves: () => false } });
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
    await openFor(browser, 'http://127.0.0.1:4000/');
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

  async function launched(mode: PermissionMode, lookup?: HostLookup) {
    const cdp = await startCdpStub({ handle: pageHandler() });
    stubs.push(cdp);
    launch.mockResolvedValue({ port: cdp.port, kill: vi.fn(async () => undefined), process: { unref: vi.fn() } });
    vi.stubEnv('OCTOCODE_HOME', fakeHome());
    vi.stubEnv('OCTOCODE_CHROME_PORT', '');
    const fake = fakePi();
    const browser = new BrowserTool(fakePermission(mode, { pi: fake.pi }), lookup ? { lookup } : {});
    tools.push(browser);
    return { cdp, browser, audit: () => fake.entries.map((entry) => entry.data as AuditEntry) };
  }

  it('lets the proxy through to targets the agent opened only, and audits what it refuses', async () => {
    const approvedPort = await listen('approved');
    const otherPort = await listen('other');
    const { cdp, browser } = await launched('manual');
    const session = await browser.session();
    const proxy = session.chrome!.proxy!;
    expect(launch.mock.calls[0]![0].chromeFlags).toContain(`--proxy-server=${proxy.url}`);

    // Refused (manual, no one to ask), and a public target: neither is allowed through the proxy.
    await expect(browser.open(`http://127.0.0.1:${approvedPort}/`)).rejects.toThrow(/no one can be asked here/);
    // A page request never allows anything.
    [...cdp.pages.values()].at(-1)!.emit('Fetch.requestPaused', paused('r', `http://127.0.0.1:${approvedPort}/x`, 'XHR'));
    await vi.waitFor(() => expect(answered(cdp, 'Fetch.failRequest')).toEqual(['r']));
    expect((await viaProxy(proxy.url, `http://127.0.0.1:${approvedPort}/`)).status).toBe(403);

    // The agent opens one target (full mode: allowed without a prompt).
    const full = await launched('full');
    const fullSession = await full.browser.session();
    await openFor(full.browser, 'https://93.184.216.34/');
    await openFor(full.browser, `http://127.0.0.1:${approvedPort}/`);
    const fullProxy = fullSession.chrome!.proxy!.url;
    expect(await viaProxy(fullProxy, `http://127.0.0.1:${approvedPort}/`)).toMatchObject({ status: 200, body: 'approved' });
    expect(await viaProxy(fullProxy, `http://127.0.0.1:${otherPort}/`)).toMatchObject({ status: 403, blocked: 'private' });

    // A Chrome that starts later is a new browser session: nothing the agent opened before is allowed until it opens it again.
    await full.browser.close();
    const again = await full.browser.session();
    expect(await viaProxy(again.chrome!.proxy!.url, `http://127.0.0.1:${approvedPort}/`)).toMatchObject({ status: 403, blocked: 'private' });
    await openFor(full.browser, `http://127.0.0.1:${approvedPort}/`);
    expect(await viaProxy(again.chrome!.proxy!.url, `http://127.0.0.1:${approvedPort}/`)).toMatchObject({ status: 200, body: 'approved' });

    // The refusal is in the audit, once per host and browser session.
    expect(await viaProxy(again.chrome!.proxy!.url, `http://127.0.0.1:${otherPort}/`)).toMatchObject({ status: 403 });
    const proxied = full.audit().filter((entry) => entry.note?.includes('filtering proxy'));
    expect(proxied.map((entry) => entry.what)).toEqual([[`127.0.0.1:${otherPort}`], [`127.0.0.1:${approvedPort}`], [`127.0.0.1:${otherPort}`]]);
    expect(proxied[0]).toMatchObject({ action: 'invariant', allowed: false });
    expect(proxied[0]!.note).toBe('browser: the filtering proxy refused a page connection to a local or private address');
  }, 30_000);

  it('scopes the filtering proxy like the page policy: a once-approved host is open while its tab holds it', async () => {
    const approvedPort = await listen('approved');
    const { cdp, browser } = await launched('full');
    const session = await browser.session();
    await openFor(browser, `http://127.0.0.1:${approvedPort}/`);
    const proxyUrl = session.chrome!.proxy!.url;
    expect(await viaProxy(proxyUrl, `http://127.0.0.1:${approvedPort}/`)).toMatchObject({ status: 200, body: 'approved' });
    // The tab left the host: nothing keeps it open.
    navigates(cdp.pages.get(session.targetId)!, 'https://93.184.216.34/');
    expect(await viaProxy(proxyUrl, `http://127.0.0.1:${approvedPort}/`)).toMatchObject({ status: 403, blocked: 'private' });
  }, 30_000);

  it('never lets the proxy through to a name that answered public to the agent check and private afterwards', async () => {
    let answers = 0;
    const flipping: HostLookup = async () => [{ address: answers++ === 0 ? '93.184.216.34' : '127.0.0.1' }];
    const { browser } = await launched('full', flipping);
    const session = await browser.session();
    await openFor(browser, 'http://rebind.example/');
    expect((await viaProxy(session.chrome!.proxy!.url, 'http://rebind.example/')).status).toBe(403);
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
