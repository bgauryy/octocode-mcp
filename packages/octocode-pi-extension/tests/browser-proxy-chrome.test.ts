import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { launchChrome } from '../src/browser/launch.js';

/** Real Chrome behind the filtering proxy. Run with PI_TEST_CHROME=1 (needs a local Chrome); skipped otherwise. */
describe.skipIf(process.env['PI_TEST_CHROME'] !== '1')('Chrome behind the filtering proxy', () => {
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

  /** Evaluates `expression` in the first page of the Chrome on `port` over its DevTools WebSocket. */
  async function evaluate(port: number, expression: string): Promise<unknown> {
    const pages = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as Array<{ type: string; webSocketDebuggerUrl: string }>;
    const socket = new WebSocket(pages.find((page) => page.type === 'page')!.webSocketDebuggerUrl);
    await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
    const result = new Promise<unknown>((resolve) => {
      socket.addEventListener('message', (event) => {
        const message = JSON.parse(String(event.data)) as { id?: number; result?: { result?: { value?: unknown } } };
        if (message.id === 1) resolve(message.result?.result?.value);
      });
    });
    socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
    try {
      return await result;
    } finally {
      socket.close();
    }
  }

  it('blocks a page-chosen WebSocket and fetch to loopback, and allows what the agent opened', async () => {
    let upgrades = 0;
    const secret = http.createServer((_request, response) => response.end('secret')).on('upgrade', (_request, socket) => {
      upgrades += 1;
      socket.destroy();
    });
    const secretPort = await listen(secret);
    const page = http.createServer((_request, response) => response.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>t</title>'));
    const pagePort = await listen(page);
    const onBlocked = vi.fn();
    const chrome = await launchChrome(true, undefined, { onBlocked });
    cleanups.push(() => chrome.kill());
    chrome.proxy!.allow(new URL(`http://127.0.0.1:${pagePort}/`));

    await evaluate(chrome.port, `location.href = 'http://127.0.0.1:${pagePort}/'; 0`);
    await vi.waitFor(async () => expect(await evaluate(chrome.port, 'location.href')).toBe(`http://127.0.0.1:${pagePort}/`), { timeout: 10_000 });
    const probe = `new Promise((resolve) => {
      const ws = new WebSocket('ws://127.0.0.1:${secretPort}/');
      ws.onopen = () => resolve('open');
      ws.onerror = () => resolve('error');
    })`;
    expect(await evaluate(chrome.port, probe)).toBe('error');
    expect(await evaluate(chrome.port, `fetch('http://127.0.0.1:${secretPort}/').then(() => 'reached', () => 'failed')`)).toBe('failed');
    expect(upgrades).toBe(0);
    expect(onBlocked).toHaveBeenCalledWith({ host: `127.0.0.1:${secretPort}`, reason: 'private' });

    chrome.proxy!.allow(new URL(`ws://127.0.0.1:${secretPort}/`));
    expect(await evaluate(chrome.port, probe)).toBe('error'); // the server drops the upgrade, but...
    expect(upgrades).toBe(1); // ...it reached the server this time
  }, 60_000);
});
