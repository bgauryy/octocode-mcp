import { describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { checkDevtoolsUrl, openBrowser } from '../src/browser/cdp.js';

describe('the DevTools attach check', () => {
  it.each(['ws://127.0.0.1:9222/devtools/page/ABC', 'ws://localhost:9222/devtools/browser/x', 'ws://[::1]:9222/devtools/page/1'])('accepts %s', (url) => {
    expect(() => checkDevtoolsUrl(url, 9222)).not.toThrow();
  });

  it.each([
    ['a non-ws scheme', 'wss://127.0.0.1:9222/devtools/page/A', /scheme wss: is not ws:/],
    ['an http scheme', 'http://127.0.0.1:9222/devtools/page/A', /scheme http: is not ws:/],
    ['a foreign host', 'ws://evil.example:9222/devtools/page/A', /host evil\.example is not this machine/],
    ['a private network host', 'ws://10.0.0.5:9222/devtools/page/A', /host 10\.0\.0\.5 is not this machine/],
    ['a wrong port', 'ws://127.0.0.1:9333/devtools/page/A', /port 9333 is not 9222/],
    ['no port', 'ws://127.0.0.1/devtools/page/A', /port \(default\) is not 9222/],
    ['a wrong path', 'ws://127.0.0.1:9222/other', /path \/other is not under \/devtools\//],
    ['a path that only starts alike', 'ws://127.0.0.1:9222/devtoolsx/page', /is not under \/devtools\//],
  ])('refuses %s, in every mode', (_name, url, message) => {
    expect(() => checkDevtoolsUrl(url, 9222)).toThrow(message);
  });

  it('refuses a string that is not a URL', () => {
    expect(() => checkDevtoolsUrl('not a url', 9222)).toThrow(/not a URL/);
  });

  it('refuses a browser whose target list points the session at another host, before any socket opens', async () => {
    let upgraded = false;
    const server = http.createServer((_request, response) => {
      const port = (server.address() as AddressInfo).port;
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify([{ id: 'a', type: 'page', webSocketDebuggerUrl: `ws://evil.example:${port}/devtools/page/a` }]));
    }).on('upgrade', () => void (upgraded = true));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      await expect(openBrowser({}, { port: (server.address() as AddressInfo).port, reuseTab: true })).rejects.toThrow(/Refused the DevTools URL ws:\/\/evil\.example:\d+\/devtools\/page\/a: host evil\.example is not this machine/);
      expect(upgraded).toBe(false);
    } finally {
      server.close();
    }
  });
});
