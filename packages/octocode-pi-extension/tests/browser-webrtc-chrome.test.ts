import dgram from 'node:dgram';
import fs from 'node:fs';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { launch } from 'chrome-launcher';
import { afterEach, describe, expect, it } from 'vitest';
import { launchChrome } from '../src/browser/launch.js';

/**
 * Real Chrome, WebRTC. A page can open UDP to any address through ICE, and the CDP guard sees no request for it, so the
 * launch flags are the only barrier. Run with PI_TEST_CHROME=1 (needs a local Chrome); skipped otherwise.
 */
describe.skipIf(process.env['PI_TEST_CHROME'] !== '1')('Chrome WebRTC reaching a private address', () => {
  const cleanups: Array<() => Promise<unknown> | unknown> = [];
  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()!();
  });

  /** A UDP and a TCP listener on loopback, each counting what reaches it: ICE servers a page names. */
  async function listeners(): Promise<{ udpPort: number; tcpPort: number; udp: string[]; tcp: number[] }> {
    const udp: string[] = [];
    const tcp: number[] = [];
    const datagrams = dgram.createSocket('udp4');
    datagrams.on('message', (message, remote) => udp.push(`${remote.address}:${remote.port} ${message.length} bytes`));
    await new Promise<void>((resolve) => datagrams.bind(0, '127.0.0.1', resolve));
    const streams = net.createServer((socket) => {
      tcp.push(socket.remotePort ?? 0);
      socket.on('error', () => undefined).destroy();
    });
    await new Promise<void>((resolve) => streams.listen(0, '127.0.0.1', resolve));
    cleanups.push(() => {
      datagrams.close();
      streams.close();
    });
    return { udpPort: (datagrams.address() as AddressInfo).port, tcpPort: (streams.address() as AddressInfo).port, udp, tcp };
  }

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

  /** Gathers ICE candidates for an offer whose ICE servers are the loopback listeners; resolves with the candidates (and the SDP) the page learned. */
  const gather = (udpPort: number, tcpPort: number): string => `new Promise(async (resolve) => {
    const pc = new RTCPeerConnection({ iceServers: [
      { urls: 'stun:127.0.0.1:${udpPort}' },
      { urls: 'turn:127.0.0.1:${udpPort}', username: 'u', credential: 'c' },
      { urls: 'turn:127.0.0.1:${tcpPort}?transport=tcp', username: 'u', credential: 'c' },
    ] });
    const candidates = [];
    pc.createDataChannel('probe');
    pc.onicecandidate = (event) => event.candidate && candidates.push(event.candidate.candidate);
    const finish = () => resolve({ candidates, sdp: pc.localDescription ? pc.localDescription.sdp : '' });
    pc.onicegatheringstatechange = () => pc.iceGatheringState === 'complete' && finish();
    await pc.setLocalDescription(await pc.createOffer());
    setTimeout(finish, 6000);
  })`;

  type Gathered = { candidates: string[]; sdp: string };

  it('control: without the flag a page does reach a loopback ICE server (the probe can see a leak)', async () => {
    const { udpPort, tcpPort, udp, tcp } = await listeners();
    const chrome = await launch({ startingUrl: 'about:blank', userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'webrtc-control-')), chromeFlags: ['--headless=new', '--no-first-run', '--no-default-browser-check'] });
    cleanups.push(() => chrome.kill());
    const gathered = (await evaluate(chrome.port, gather(udpPort, tcpPort))) as Gathered;
    expect(gathered.candidates.some((candidate) => / typ host /.test(candidate))).toBe(true);
    expect(udp.length + tcp.length).toBeGreaterThan(0);
  }, 30_000);

  /**
   * `tcpToo`: also expect no TCP connection (TURN over TCP). A fresh Chrome has the proxy, which refuses it. A Chrome on a
   * kept profile has none, and the WebRTC policy only covers UDP, so a page can still open a TCP connection to a TURN server
   * it names on a private address: a known residual of that mode, which the CDP request guard cannot see (docs/FEATURES.md, browser).
   */
  const expectNoLeak = async (chrome: { port: number }, tcpToo: boolean): Promise<void> => {
    const { udpPort, tcpPort, udp, tcp } = await listeners();
    const gathered = (await evaluate(chrome.port, gather(udpPort, tcpPort))) as Gathered;
    // No host, server-reflexive or relay candidate: the page learns no local address, not even a masked one.
    expect(gathered.candidates).toEqual([]);
    expect(gathered.sdp).not.toMatch(/a=candidate/);
    // And nothing was sent to the STUN and TURN servers it named on loopback.
    expect(udp).toEqual([]);
    if (tcpToo) expect(tcp).toEqual([]);
  };

  it('launched Chrome (fresh profile, behind the proxy): a page learns no address and sends nothing to a loopback ICE server', async () => {
    const chrome = await launchChrome(true);
    cleanups.push(() => chrome.kill());
    await expectNoLeak(chrome, true);
  }, 30_000);

  it('launched Chrome on a kept profile (no proxy): a page learns no address and sends no UDP', async () => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'webrtc-profile-'));
    cleanups.push(() => fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 }));
    const chrome = await launchChrome(true, profile);
    cleanups.push(() => chrome.kill());
    await expectNoLeak(chrome, false);
  }, 30_000);
});
