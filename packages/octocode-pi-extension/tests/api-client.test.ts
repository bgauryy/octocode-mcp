import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../src/api/client.js';
import { tmp } from './helpers.js';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { await Promise.all(cleanup.splice(0).map((close) => close())); });

async function socketServer(handle: (socket: net.Socket, request: Record<string, unknown>) => void) {
  const file = path.join(fs.realpathSync(tmp('api-client-')), 'api.sock');
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => undefined);
    let body = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      body += chunk;
      if (body.includes('\n')) handle(socket, JSON.parse(body.split('\n')[0]!) as Record<string, unknown>);
    });
  });
  await new Promise<void>((resolve) => server.listen(file, resolve));
  cleanup.push(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return { file, sockets, client: new ApiClient({ socket: file }) };
}

async function httpServer(handle: (req: http.IncomingMessage, res: http.ServerResponse, request: Record<string, unknown>) => void) {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += String(chunk); });
    req.on('end', () => handle(req, res, JSON.parse(body) as Record<string, unknown>));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const target = { url: `http://127.0.0.1:${(server.address() as net.AddressInfo).port}`, token: 'private-example-token' };
  cleanup.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return { target, client: new ApiClient({ http: target }) };
}

describe('bounded API client calls', () => {
  it.each([
    { jsonrpc: '2.0', id: 2, result: {} },
    { jsonrpc: '1.0', id: 1, result: {} },
    { jsonrpc: '2.0', id: 1, result: {}, error: { code: -1, message: 'bad' } },
    { jsonrpc: '2.0', id: 1 },
    { jsonrpc: '2.0', id: 1, error: { code: 'bad', message: 'bad' } },
  ])('rejects malformed/mismatched RPC replies %j', async (reply) => {
    const { client } = await socketServer((socket) => socket.end(`${JSON.stringify(reply)}\n`));
    await expect(client.call('ping')).rejects.toThrow('Invalid API');
  });

  it('bounds socket calls and releases the connection and signal listener on timeout', async () => {
    const { client, sockets } = await socketServer(() => undefined);
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    await expect(client.call('ping', {}, { timeoutMs: 30, signal: controller.signal })).rejects.toThrow('timed out');
    await vi.waitFor(() => expect(sockets.size).toBe(0));
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('bounds socket response bytes and handles premature close', async () => {
    const huge = await socketServer((socket) => socket.write('é'.repeat(600_000)));
    await expect(huge.client.call('ping')).rejects.toThrow('byte limit');
    const closed = await socketServer((socket) => socket.end());
    await expect(closed.client.call('ping')).rejects.toThrow('closed');
  });

  it('does not fall back to HTTP when a configured socket fails', async () => {
    const requests = vi.fn();
    const { target } = await httpServer(requests);
    const client = new ApiClient({ socket: '/absent/octocode.sock', http: target });
    await expect(client.call('ping')).rejects.toThrow('socket transport failed');
    expect(requests).not.toHaveBeenCalled();
  });

  it('uses exact HTTP response ids and strips bearer values from remote RPC errors', async () => {
    const { client } = await httpServer((_req, res, request) => {
      res.end(JSON.stringify({ jsonrpc: '2.0', id: request['id'], error: { code: -32602, message: 'private-example-token', data: { token: 'private-example-token' } } }));
    });
    await expect(client.call('ping')).rejects.toMatchObject({ message: '[redacted]', data: { token: '[redacted]' } });
    const wrong = await httpServer((_req, res) => res.end(JSON.stringify({ jsonrpc: '2.0', id: 90, result: {} })));
    await expect(wrong.client.call('ping')).rejects.toThrow('identity');
  });

  it('bounds HTTP calls and rejects status failures without exposing response bodies or tokens', async () => {
    const stalled = await httpServer(() => undefined);
    await expect(stalled.client.call('ping', {}, { timeoutMs: 30 })).rejects.toThrow('timed out');
    const failed = await httpServer((_req, res) => res.writeHead(500).end('private-example-token'));
    await expect(failed.client.call('ping')).rejects.toThrow('API HTTP request failed (500)');
  });

  it('aborts HTTP calls and cleans up signal listeners', async () => {
    let accepted!: () => void;
    const ready = new Promise<void>((resolve) => { accepted = resolve; });
    const { client } = await httpServer(() => accepted());
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const pending = client.call('ping', {}, { timeoutMs: 1000, signal: controller.signal });
    const failed = expect(pending).rejects.toThrow('aborted');
    await ready;
    controller.abort();
    await failed;
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('rejects remote HTTP URLs and pre-aborted requests before sending', async () => {
    const remote = new ApiClient({ http: { url: 'https://example.com', token: 'private-example-token' } });
    await expect(remote.call('ping')).rejects.toThrow('loopback');
    const controller = new AbortController();
    controller.abort();
    await expect(remote.call('ping', {}, { signal: controller.signal })).rejects.toThrow('aborted');
  });
});
