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
 * Real Chrome attached over DevTools (no filtering proxy), so only the page session's Fetch coverage stands between a
 * page and a private server. Run with PI_TEST_CHROME=1 (needs a local Chrome); skipped otherwise.
 */
describe.skipIf(process.env['PI_TEST_CHROME'] !== '1')('attached Chrome: page requests to a private server', () => {
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

  it('fails fetch, image, frame, redirect, worker and service-worker requests, and reports a WebSocket', async () => {
    // The private server no page was sent to: every request that reaches it is a leak.
    const hits: string[] = [];
    const secret = http
      .createServer((request, response) => {
        hits.push(`${request.method} ${request.url}`);
        response.end('secret');
      })
      .on('upgrade', (request, socket) => {
        hits.push(`UPGRADE ${request.url}`);
        socket.destroy();
      });
    const secretPort = await listen(secret);
    const origin = `http://127.0.0.1:${secretPort}`;
    const html = `<!doctype html><title>page</title><body><script>
      fetch('${origin}/fetch', { mode: 'no-cors' }).catch(() => {});
      new Image().src = '${origin}/img';
      new Image().src = '/redir';
      const frame = document.createElement('iframe'); frame.src = '${origin}/frame'; document.body.append(frame);
      new Worker('/worker.js');
      navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready).then(() => navigator.serviceWorker.controller || new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve))).then(() => fetch('/via-sw')).then((r) => r.text()).then((t) => { window.viaSw = t; }, (e) => { window.viaSw = 'error ' + e; });
      new WebSocket('ws://127.0.0.1:${secretPort}/ws');
    </script>`;
    const page = http.createServer((request, response) => {
      const send = (type: string, body: string): void => void response.writeHead(200, { 'content-type': type }).end(body);
      if (request.url === '/redir') return void response.writeHead(302, { location: `${origin}/redirected` }).end();
      if (request.url === '/worker.js') return send('text/javascript', `fetch('${origin}/worker', { mode: 'no-cors' }).catch(() => {});`);
      if (request.url === '/sw.js') return send('text/javascript', `self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim())); self.addEventListener('fetch', (event) => { if (new URL(event.request.url).pathname === '/via-sw') event.respondWith(fetch('${origin}/sw', { mode: 'no-cors' }).then(() => new Response('via service worker'))); });`);
      if (request.url === '/via-sw') return send('text/plain', 'direct');
      return send('text/html', html);
    });
    const pagePort = await listen(page);

    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-net-chrome-'));
    const chrome = await launch({ startingUrl: 'about:blank', userDataDir: profile, chromeFlags: ['--headless=new', '--no-first-run', '--no-default-browser-check'] });
    cleanups.push(() => fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 }));
    cleanups.push(() => chrome.kill());

    vi.stubEnv('OCTOCODE_CHROME_PORT', String(chrome.port));
    const fake = fakePi();
    const browser = new BrowserTool(fakePermission('full', { pi: fake.pi }));
    cleanups.push(() => browser.close());
    let tool: { execute: (...args: unknown[]) => Promise<{ content: Array<{ text?: string }> }> } | undefined;
    registerBrowserTool({ registerTool: (definition: typeof tool) => (tool = definition), on: () => undefined } as unknown as ExtensionAPI, browser);
    const run = async (params: Record<string, unknown>) => (await tool!.execute('call', params, undefined, undefined, fakeCtx({ cwd: os.tmpdir() }))).content.map((part) => part.text ?? '').join('\n');

    // The agent opens the page; the private server is the page's choice.
    await run({ action: 'navigate', url: `http://127.0.0.1:${pagePort}/` });
    await vi.waitFor(async () => expect(await run({ action: 'evaluate', expression: 'window.viaSw' })).toContain('direct'), { timeout: 15_000 });
    // The WebSocket is not paused by Fetch: reported, and the page cannot be told apart from a quiet one otherwise.
    await vi.waitFor(() => expect(fake.entries.map((entry) => entry.data as AuditEntry).some((entry) => entry.via === 'reported')).toBe(true), { timeout: 10_000 });
    const audit = fake.entries.map((entry) => entry.data as AuditEntry);
    expect(audit.find((entry) => entry.via === 'reported')).toMatchObject({ action: 'invariant', allowed: true, what: [`ws://127.0.0.1:${secretPort}/ws`] });
    expect((await browser.session()).console.some((line) => line.startsWith('[warning] The page opened a WebSocket'))).toBe(true);
    // Every request the page started to the private server failed before it left Chrome: only the WebSocket got through.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(hits.filter((hit) => !hit.startsWith('UPGRADE'))).toEqual([]);
    expect(hits).toEqual([`UPGRADE /ws`]);
    // The blocks are in the audit, one per host.
    expect(audit.filter((entry) => entry.allowed === false && entry.action === 'invariant').length).toBeGreaterThan(0);
  }, 60_000);
});
