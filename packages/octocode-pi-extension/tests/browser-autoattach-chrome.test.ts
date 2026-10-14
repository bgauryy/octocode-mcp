import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { launch } from 'chrome-launcher';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserTool, registerBrowserTool } from '../src/browser/tool.js';
import type { AuditEntry } from '../src/permission/audit.js';
import { fakeCtx, fakePermission, fakePi } from './fake-pi.js';

/**
 * Real Chrome attached over DevTools (no filtering proxy): a popup, a dedicated worker and a service worker are targets of
 * their own, and only the browser-level auto-attach puts a network check on them before they run. 127.0.0.1 counts as a
 * private address: the page's own port is the one the agent opened, the other port is the private server nothing may reach.
 * Run with PI_TEST_CHROME=1 (needs a local Chrome); skipped otherwise.
 */
describe.skipIf(process.env['PI_TEST_CHROME'] !== '1')('attached Chrome: popups, workers and service workers', () => {
  const cleanups: Array<() => Promise<unknown> | unknown> = [];
  afterEach(async () => {
    vi.unstubAllEnvs();
    while (cleanups.length > 0) await cleanups.pop()!();
  });

  const listen = (server: http.Server): Promise<number> =>
    new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        cleanups.push(() => {
          server.closeAllConnections();
          server.close();
        });
        resolve((server.address() as AddressInfo).port);
      });
    });

  it('makes no request to a private host from window.open, a dedicated, nested or shared worker or a service worker, and each still runs', async () => {
    // A request that reaches this server is a leak.
    const leaks: string[] = [];
    const secretPort = await listen(
      http.createServer((request, response) => {
        leaks.push(`${request.method} ${request.url}`);
        response.setHeader('access-control-allow-origin', '*').end('secret');
      }),
    );
    const secret = `http://127.0.0.1:${secretPort}`;
    // What the page server sees shows each context ran: a context that was held and never released would leave no mark.
    const seen = new Set<string>();
    const html = `<!doctype html><title>page</title><body><script>
      window.open('${secret}/popup');
      window.open('/popup-ok');
      new Worker('/worker.js');
      new SharedWorker('/shared.js');
      navigator.serviceWorker.register('/sw.js');
    </script>`;
    const pagePort = await listen(
      http.createServer((request, response) => {
        const send = (type: string, body: string): void => void response.writeHead(200, { 'content-type': type }).end(body);
        seen.add(request.url ?? '');
        if (request.url === '/worker.js') return send('text/javascript', `fetch('${secret}/worker', { mode: 'no-cors' }).catch(() => {}); fetch('/worker-ok').catch(() => {}); new Worker('/nested.js');`);
        if (request.url === '/nested.js') return send('text/javascript', `fetch('${secret}/nested', { mode: 'no-cors' }).catch(() => {}); fetch('/nested-ok').catch(() => {});`);
        if (request.url === '/shared.js') return send('text/javascript', `fetch('${secret}/shared', { mode: 'no-cors' }).catch(() => {}); fetch('/shared-ok').catch(() => {});`);
        if (request.url === '/sw.js') return send('text/javascript', `self.addEventListener('install', (event) => { self.skipWaiting(); event.waitUntil(Promise.all([fetch('${secret}/sw', { mode: 'no-cors' }).catch(() => {}), fetch('/sw-ok').catch(() => {})])); });`);
        if (request.url === '/') return send('text/html', html);
        send('text/plain', 'ok');
      }),
    );

    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-autoattach-chrome-'));
    const chrome = await launch({ startingUrl: 'about:blank', userDataDir: profile, chromeFlags: ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-popup-blocking'] });
    cleanups.push(() => fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 }));
    cleanups.push(() => chrome.kill());

    vi.stubEnv('OCTOCODE_CHROME_PORT', String(chrome.port));
    const fake = fakePi();
    const browser = new BrowserTool(fakePermission('full', { pi: fake.pi }));
    cleanups.push(() => browser.close());
    let tool: { execute: (...args: unknown[]) => Promise<{ content: Array<{ text?: string }> }> } | undefined;
    registerBrowserTool({ registerTool: (definition: typeof tool) => (tool = definition), on: () => undefined } as unknown as ExtensionAPI, browser);
    const run = async (params: Record<string, unknown>) => (await tool!.execute('call', params, undefined, undefined, fakeCtx({ cwd: os.tmpdir() }))).content.map((part) => part.text ?? '').join('\n');

    await run({ action: 'navigate', url: `http://127.0.0.1:${pagePort}/` });
    // The public popup, the worker and the service worker all ran and reached the server the agent opened.
    await vi.waitFor(() => expect([...seen]).toEqual(expect.arrayContaining(['/popup-ok', '/worker-ok', '/nested-ok', '/shared-ok', '/sw-ok'])), { timeout: 20_000 });
    await new Promise((resolve) => setTimeout(resolve, 1_000));

    expect(leaks).toEqual([]);
    // Each refusal is in the audit.
    const blocked = fake.entries.map((entry) => entry.data as AuditEntry).filter((entry) => entry.allowed === false && entry.action === 'invariant');
    expect(blocked.flatMap((entry) => entry.what ?? []).filter((what) => what.includes(`127.0.0.1:${secretPort}`)).length).toBeGreaterThan(0);
  }, 60_000);
});

/**
 * The same real Chrome, attached: the policy follows the tabs the agent drives (also after it moved to another tab) and
 * leaves the user's own tabs and their service workers alone.
 */
describe.skipIf(process.env['PI_TEST_CHROME'] !== '1')('attached Chrome: tabs the agent left, and the user\'s own', () => {
  const cleanups: Array<() => Promise<unknown> | unknown> = [];
  afterEach(async () => {
    vi.unstubAllEnvs();
    while (cleanups.length > 0) await cleanups.pop()!();
  });

  const listen = (server: http.Server): Promise<number> =>
    new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        cleanups.push(() => {
          server.closeAllConnections();
          server.close();
        });
        resolve((server.address() as AddressInfo).port);
      });
    });

  it('keeps checking a tab after the agent switched away, and does not touch the user\'s own tab or its service worker', async () => {
    const leaks: string[] = [];
    const secretPort = await listen(
      http.createServer((request, response) => {
        leaks.push(request.url ?? '');
        response.setHeader('access-control-allow-origin', '*').end('secret');
      }),
    );
    const secret = `http://127.0.0.1:${secretPort}`;
    const seen = new Set<string>();
    const send = (response: http.ServerResponse, type: string, body: string): void => void response.writeHead(200, { 'content-type': type }).end(body);
    // The agent's first tab acts only after the agent moved to another one.
    const agentPort = await listen(
      http.createServer((request, response) => {
        seen.add(request.url ?? '');
        if (request.url === '/') return send(response, 'text/html', `<!doctype html><title>a</title><script>setTimeout(() => { fetch('${secret}/agent-fetch', { mode: 'no-cors' }).catch(() => {}); window.open('${secret}/agent-popup'); window.open('/agent-popup-ok'); }, 2500);</script>`);
        send(response, 'text/html', '<!doctype html><title>b</title>');
      }),
    );
    // The user's page, on another origin: its service worker reaches the "private" server like any page of the user's would.
    const userPort = await listen(
      http.createServer((request, response) => {
        seen.add(`user${request.url ?? ''}`);
        if (request.url === '/sw.js') return send(response, 'text/javascript', `self.addEventListener('install', (event) => { self.skipWaiting(); event.waitUntil(fetch('${secret}/user-sw', { mode: 'no-cors' }).catch(() => {})); });`);
        if (request.url === '/') return send(response, 'text/html', "<!doctype html><title>user</title><script>navigator.serviceWorker.register('/sw.js');</script>");
        send(response, 'text/plain', 'ok');
      }),
    );

    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-tabs-chrome-'));
    const chrome = await launch({ startingUrl: 'about:blank', userDataDir: profile, chromeFlags: ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-popup-blocking'] });
    cleanups.push(() => fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 }));
    cleanups.push(() => chrome.kill());

    vi.stubEnv('OCTOCODE_CHROME_PORT', String(chrome.port));
    const fake = fakePi();
    const browser = new BrowserTool(fakePermission('full', { pi: fake.pi }));
    cleanups.push(() => browser.close());
    let tool: { execute: (...args: unknown[]) => Promise<{ content: Array<{ text?: string }> }> } | undefined;
    registerBrowserTool({ registerTool: (definition: typeof tool) => (tool = definition), on: () => undefined } as unknown as ExtensionAPI, browser);
    const run = async (params: Record<string, unknown>) => (await tool!.execute('call', params, undefined, undefined, fakeCtx({ cwd: os.tmpdir() }))).content.map((part) => part.text ?? '').join('\n');

    await run({ action: 'navigate', url: `http://127.0.0.1:${agentPort}/` });
    // The agent moves to a second tab; the first one then runs its script.
    await run({ action: 'tab', url: `http://127.0.0.1:${agentPort}/second` });
    // The user opens a page of their own in the same Chrome.
    await fetch(`http://127.0.0.1:${chrome.port}/json/new?${encodeURI(`http://127.0.0.1:${userPort}/`)}`, { method: 'PUT' });

    await vi.waitFor(() => expect([...seen]).toEqual(expect.arrayContaining(['/agent-popup-ok', 'user/sw.js'])), { timeout: 20_000 });
    // The user's service worker got no policy; it is released as the first thing it does.
    await vi.waitFor(() => expect(leaks).toContain('/user-sw'), { timeout: 20_000 });
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    // The agent's first tab, and the popup it opened, stayed under the policy while the agent drove the second tab.
    expect(leaks.filter((leak) => leak.startsWith('/agent'))).toEqual([]);
    const blocked = fake.entries.map((entry) => entry.data as AuditEntry).filter((entry) => entry.allowed === false && entry.action === 'invariant');
    expect(blocked.flatMap((entry) => entry.what ?? []).filter((what) => what.includes(`127.0.0.1:${secretPort}`)).length).toBeGreaterThan(0);
  }, 60_000);
});
