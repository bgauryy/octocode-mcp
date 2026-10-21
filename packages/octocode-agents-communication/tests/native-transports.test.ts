import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'node:net';
import type { AddressInfo, Server, Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { runtime } from './store-support.ts';
import type { JsonRecord } from './json-record.ts';

const { transport, validation } = runtime;
const posix = process.platform !== 'win32';
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const SESSION = '0f8fad5b-d9cb-469f-a165-70867728950e';

function workspace(t: TestContext) {
  const path = realpathSync(mkdtempSync(join(tmpdir(), 'native-transports-')));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}

/** Where a test server listens: a loopback port, or a Unix socket path. */
type Target = readonly [port: number, host: string] | readonly [path: string];
type Script = (frame: JsonRecord, reply: (value: JsonRecord) => void, socket: Socket) => void;

const listening = <Listener extends Server>(server: Listener, ...target: Target) => new Promise<Listener>(resolve => {
  const ready = () => resolve(server);
  if (target.length === 2) server.listen(target[0], target[1], ready); else server.listen(target[0], ready);
});
const portOf = (server: { address(): AddressInfo | string | null }): number => {
  const address = server.address();
  assert.ok(address !== null && typeof address === 'object', 'the server listens on a port');
  return address.port;
};
function serve(t: TestContext, handler: (socket: Socket) => void, ...target: Target) {
  const sockets = new Set<Socket>();
  const server = createServer(socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => undefined);
    handler(socket);
  });
  t.after(() => { for (const socket of sockets) socket.destroy(); server.close(); });
  return listening(server, ...target);
}

function rejects(promise: Promise<unknown>, pattern: RegExp, name?: string) {
  return assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof Error);
    if (name) assert.equal(error.name, name);
    assert.match(error.message, pattern);
    return true;
  });
}

test('capabilities: receipts, passive injection and wake prerequisites per mode', () => {
  assert.deepEqual(transport.capabilities('raw'), { nativeInput: false, acceptanceReceipt: 'host-confirmation', readReceipt: false });
  assert.deepEqual(transport.capabilities('claude'), { nativeInput: true, passiveInjection: false, actionWake: true, acceptanceReceipt: 'socket-write-only', readReceipt: false });
  assert.deepEqual(transport.capabilities('codex'), { nativeInput: true, passiveInjection: true, actionWake: true, acceptanceReceipt: 'jsonrpc', readReceipt: false, wakePrerequisite: 'loaded-thread', activeInjection: true });
  assert.deepEqual(transport.capabilities('opencode'), { nativeInput: true, passiveInjection: true, actionWake: true, acceptanceReceipt: 'http', readReceipt: false, wakePrerequisite: 'existing-idle-session-in-workspace' });
  assert.deepEqual(transport.capabilities('grok'), { nativeInput: true, passiveInjection: false, actionWake: true, acceptanceReceipt: 'acp-turn-completion', readReceipt: false });
  assert.deepEqual(['claude', 'grok', 'codex', 'opencode', 'raw'].map(transport.requiresAction), [true, true, false, false, false]);
});

test('uuid acceptance takes hyphenless, braced and urn forms', () => {
  for (const value of [SESSION, SESSION.replaceAll('-', ''), `{${SESSION}}`, 'urn:uuid:' + SESSION, SESSION.toUpperCase()]) assert.equal(validation.isUuid(value), true, value);
  for (const value of ['', 'abc', SESSION + '0', 'g'.repeat(32), 'ses_123']) assert.equal(validation.isUuid(value), false, value);
});

test('endpoint validation accepts loopback only and refuses credentials, paths and queries', () => {
  const bad = /endpoint must be/;
  assert.doesNotThrow(() => transport.validate('opencode', 'http://127.0.0.1:4096'));
  assert.doesNotThrow(() => transport.validate('opencode', 'http://[::1]:4096/'));
  assert.doesNotThrow(() => transport.validate('codex', 'ws://localhost:9000/'));
  for (const endpoint of ['http://localhost:4096', 'http://example.com:4096', 'http://user@127.0.0.1:4096', 'http://127.0.0.1:4096/x', 'http://127.0.0.1:4096/?a=1', 'http://127.0.0.1', 'http://127.0.0.1:0', 'https://127.0.0.1:4096', 'http://10.0.0.1:80']) assert.throws(() => transport.validate('opencode', endpoint), bad, endpoint);
  assert.throws(() => transport.validate('codex', 'ws://user:pw@127.0.0.1:9'), bad);
  assert.throws(() => transport.validate('codex', 'wss://127.0.0.1:9'), bad);
  assert.throws(() => transport.validate('raw', 'ws://127.0.0.1:9'), /Raw hooks do not have an endpoint/);
  assert.throws(() => transport.validate('claude'), /requires endpoint/);
  assert.throws(() => transport.validate('claude', 'relative.sock'), /absolute path/);
  assert.throws(() => transport.validate('claude', '/' + 'x'.repeat(110)), /at most 103 bytes/);
  assert.throws(() => transport.validate('nope', 'ws://127.0.0.1:9'), /Unknown native transport/);
  assert.doesNotThrow(() => transport.validate('claude', '/tmp/any.sock'));
  assert.doesNotThrow(() => transport.validate('codex', 'unix:///tmp/codex.sock'));
  assert.throws(() => transport.validateSession('abc'), /ses_/);
  assert.doesNotThrow(() => transport.validateSession('ses_abc_123'));
});

test('claude inbound prediction table', () => {
  const predict = (state: Parameters<typeof transport.claudeInbound>[0], own = false) => transport.claudeInbound(state, own)[0];
  assert.equal(predict(null), 'unknown');
  assert.equal(predict({ permissionMode: 'default', crossSessionInbound: 'refuse' }), 'refused');
  assert.equal(predict({ permissionMode: 'default', crossSessionInbound: 'hold' }), 'held');
  assert.equal(predict({ permissionMode: 'bypassPermissions', crossSessionInbound: 'accept' }), 'delivered');
  assert.equal(predict({ permissionMode: 'default', crossSessionInbound: 'unrecognized' }), 'unknown');
  assert.equal(predict({ permissionMode: 'bypassPermissions' }, true), 'delivered');
  assert.equal(predict({ permissionMode: 'bypassPermissions' }), 'held');
  for (const mode of ['default', 'acceptEdits', 'auto', 'dontAsk'] as const) assert.equal(predict({ permissionMode: mode }), 'delivered', mode);
  assert.equal(predict({ permissionMode: 'plan' }), 'unknown');
});

/** A minimal RFC 6455 server endpoint speaking Codex app-server JSON-RPC; `script` decides the replies. */
function codexServer(t: TestContext, script: Script, ...target: Target) {
  const seen: JsonRecord[] = [];
  return serve(t, socket => {
    let buffer = Buffer.alloc(0);
    let upgraded = false;
    const reply = (value: JsonRecord) => {
      const data = Buffer.from(JSON.stringify(value));
      let header = Buffer.from([0x81, data.length]);
      if (data.length > 65535) (header = Buffer.alloc(10, 0)).set([0x81, 127]), header.writeBigUInt64BE(BigInt(data.length), 2);
      else if (data.length > 125) header = Buffer.from([0x81, 126, data.length >> 8, data.length & 255]);
      socket.write(Buffer.concat([header, data]));
    };
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!upgraded) {
        const end = buffer.indexOf('\r\n\r\n');
        if (end < 0) return;
        const handshake = /Sec-WebSocket-Key: (.*)\r\n/.exec(buffer.subarray(0, end).toString());
        assert.ok(handshake, 'the client sends a WebSocket key');
        const key = handshake[1];
        socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${createHash('sha1').update(key + GUID).digest('base64')}\r\n\r\n`);
        buffer = buffer.subarray(end + 4);
        upgraded = true;
      }
      for (;;) {
        if (buffer.length < 2) return;
        let size = buffer[1] & 127;
        let offset = 2;
        if (size === 126) { if (buffer.length < 4) return; size = buffer.readUInt16BE(2); offset = 4; }
        if (buffer.length < offset + 4 + size) return;
        const mask = buffer.subarray(offset, offset + 4);
        const payload = Buffer.from(buffer.subarray(offset + 4, offset + 4 + size).map((byte, index) => byte ^ mask[index % 4]));
        buffer = buffer.subarray(offset + 4 + size);
        const frame = JSON.parse(payload.toString());
        seen.push(frame);
        script(frame, reply, socket);
      }
    });
  }, ...target).then(server => ({ server, seen }));
}

const codexScript = (ws: string, options: { status?: string; noTurn?: boolean; injectError?: JsonRecord } = {}): Script => (frame, reply, socket) => {
  if (frame.method === 'initialize') {
    // A server-initiated request before the response must be refused, not approved.
    reply({ id: 'srv-1', method: 'item/commandExecution/requestApproval', params: {} });
    reply({ id: frame.id, result: {} });
  } else if (frame.method === 'thread/read') reply({ id: frame.id, result: { thread: { id: 'thr_1', cwd: ws, status: { type: options.status ?? 'idle' } } } });
  else if (frame.method === 'turn/start') reply(options.noTurn ? { id: frame.id, result: {} } : { id: frame.id, result: { turn: { id: 'turn_1', status: 'inProgress' } } });
  else if (frame.method === 'thread/inject_items') reply({ id: frame.id, error: options.injectError });
  else if (frame.method === 'close') socket.destroy();
};

test('codex over loopback websocket: handshake, refusal of server requests, wake receipt and preflight status', async t => {
  const ws = workspace(t);
  const { server, seen } = await codexServer(t, codexScript(ws), 0, '127.0.0.1');
  const endpoint = `ws://127.0.0.1:${portOf(server)}/`;
  const delivery = await transport.NativeDelivery.open('codex', endpoint, 'thr_1', ws);
  t.after(() => delivery.close());
  assert.equal(await delivery.prepare(), true);
  const receipt = await delivery.offer('hello peers', 'token-1', true);
  assert.deepEqual(receipt, { kind: 'jsonrpc', turnRequested: true });
  const initialize = seen.find(frame => frame.method === 'initialize');
  assert.ok(initialize);
  assert.equal(initialize.params.clientInfo.name, 'octocode-communication-dispatch');
  assert.ok(seen.some(frame => frame.method === 'initialized'));
  const refusal = seen.find(frame => frame.id === 'srv-1');
  assert.deepEqual(refusal, { id: 'srv-1', error: { code: -32601, message: 'Communication delivery cannot approve actions or execute tools' } });
  const turn = seen.find(frame => frame.method === 'turn/start');
  assert.ok(turn);
  assert.deepEqual(turn.params, { threadId: 'thr_1', input: [], toolOutput: { name: 'octocode_peer_messages', output: 'hello peers' } });
  assert.equal(delivery.matches('codex', endpoint, 'thr_1', ws), true);
  assert.equal(delivery.matches('codex', endpoint, 'thr_2', ws), false);
});

test('codex passive injection uses thread/inject_items and surfaces server errors', async t => {
  const ws = workspace(t);
  const { server, seen } = await codexServer(t, codexScript(ws, { injectError: { code: -1, message: 'nope' } }), 0, '127.0.0.1');
  const delivery = await transport.NativeDelivery.open('codex', `ws://127.0.0.1:${portOf(server)}/`, 'thr_1', ws);
  t.after(() => delivery.close());
  await rejects(delivery.offer('fyi', 'token-2', false), /Codex thread\/inject_items: \{"code": -1, "message": "nope"\}/);
  const injected = seen.find(frame => frame.method === 'thread/inject_items');
  assert.ok(injected);
  assert.deepEqual(injected.params, { threadId: 'thr_1', items: [{ type: 'function_call_output', name: 'octocode_peer_messages', output: 'fyi' }] });
});

test('codex refuses a turn without an acceptance receipt, a wrong workspace and an unknown status', async t => {
  const ws = workspace(t);
  const other = workspace(t);
  const missing = await codexServer(t, codexScript(ws, { noTurn: true }), 0, '127.0.0.1');
  const first = await transport.NativeDelivery.open('codex', `ws://127.0.0.1:${portOf(missing.server)}/`, 'thr_1', ws);
  t.after(() => first.close());
  await rejects(first.offer('x', 't', true), /no valid acceptance receipt; inspect before retrying/, 'ValidationError');
  const elsewhere = await transport.NativeDelivery.open('codex', `ws://127.0.0.1:${portOf(missing.server)}/`, 'thr_1', other);
  t.after(() => elsewhere.close());
  await rejects(elsewhere.prepare(), /different workspace/, 'ValidationError');
  const odd = await codexServer(t, codexScript(ws, { status: 'weird' }), 0, '127.0.0.1');
  const third = await transport.NativeDelivery.open('codex', `ws://127.0.0.1:${portOf(odd.server)}/`, 'thr_1', ws);
  t.after(() => third.close());
  await rejects(third.prepare(), /unknown runtime status/);
  const loaded = await codexServer(t, codexScript(ws, { status: 'notLoaded' }), 0, '127.0.0.1');
  const fourth = await transport.NativeDelivery.open('codex', `ws://127.0.0.1:${portOf(loaded.server)}/`, 'thr_1', ws);
  t.after(() => fourth.close());
  assert.equal(await fourth.prepare(), false, 'a thread that is not loaded defers');
});

test('codex over a Unix socket and a closing peer', { skip: !posix }, async t => {
  const ws = workspace(t);
  const path = join(ws, 'codex.sock');
  await codexServer(t, codexScript(ws), path);
  const delivery = await transport.NativeDelivery.open('codex', 'unix://' + path, 'thr_1', ws);
  t.after(() => delivery.close());
  assert.deepEqual(await delivery.offer('over unix', 'token-3', true), { kind: 'jsonrpc', turnRequested: true });
  const closer = join(ws, 'closer.sock');
  await serve(t, socket => socket.destroy(), closer);
  await rejects(transport.NativeDelivery.open('codex', 'unix://' + closer, 'thr_1', ws), /./);
});

test('codex rejects a bad upgrade and an oversized frame', async t => {
  const ws = workspace(t);
  const bad = await serve(t, socket => socket.once('data', () => socket.write('HTTP/1.1 200 OK\r\n\r\n')), 0, '127.0.0.1');
  await rejects(transport.NativeDelivery.open('codex', `ws://127.0.0.1:${portOf(bad)}/`, 'thr_1', ws), /Invalid WebSocket upgrade response/, 'ValidationError');
  const { server } = await codexServer(t, (frame, _reply, socket) => {
    if (frame.method === 'initialize') {
      const header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(2 * 1024 * 1024), 2);
      socket.write(header);
    }
  }, 0, '127.0.0.1');
  await rejects(transport.NativeDelivery.open('codex', `ws://127.0.0.1:${portOf(server)}/`, 'thr_1', ws), /Codex frame exceeds 1 MiB/, 'ValidationError');
});

test('codex reads a reply past the old 256 KiB buffer mark and one of exactly the 1 MiB frame limit', async t => {
  const ws = workspace(t);
  const frameBytes = (pad: string) => Buffer.byteLength(JSON.stringify({ id: 1, result: { pad } }));
  for (const total of [600_000, 1024 * 1024]) {
    const pad = 'x'.repeat(total - frameBytes(''));
    assert.equal(frameBytes(pad), total);
    const { server } = await codexServer(t, (frame, reply) => {
      if (frame.method === 'initialize') reply({ id: frame.id, result: { pad } });
    }, 0, '127.0.0.1');
    const started = Date.now();
    const delivery = await transport.NativeDelivery.open('codex', `ws://127.0.0.1:${portOf(server)}/`, 'thr_1', ws);
    delivery.close();
    assert.ok(Date.now() - started < 4000, `a ${total}-byte frame must not wait for the I/O deadline`);
  }
});

test('grok reads a leader reply past the old 256 KiB buffer mark and one of exactly the 8 MiB frame limit', { skip: !posix }, async t => {
  const ws = workspace(t);
  const MAX = 8 * 1024 * 1024;
  const outer = (pad: string) => frameOf({ type: 'acp', payload: JSON.stringify({ jsonrpc: '2.0', id: 1, result: { protocolVersion: 1, pad } }) });
  for (const total of [600_000, MAX]) {
    const pad = 'x'.repeat(total - (outer('').length - 4));
    const reply = outer(pad);
    assert.equal(reply.length - 4, total);
    const path = join(ws, `grok-${total}.sock`);
    await serve(t, socket => {
      let buffer = Buffer.alloc(0);
      socket.on('data', chunk => {
        buffer = Buffer.concat([buffer, chunk]);
        while (buffer.length >= 4 && buffer.length >= 4 + buffer.readUInt32BE()) {
          const size = buffer.readUInt32BE();
          const frame = JSON.parse(buffer.subarray(4, 4 + size).toString());
          buffer = buffer.subarray(4 + size);
          if (frame.type === 'register') socket.write(Buffer.concat([frameOf({ type: 'registered', leader_protocol_version: 1, ready: true })]));
          if (frame.type !== 'acp') continue;
          const rpc = JSON.parse(frame.payload);
          if (rpc.method === 'initialize') socket.write(reply);
          if (rpc.method === '_x.ai/session/info') socket.write(frameOf({ type: 'acp', payload: JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: { result: { sessionId: SESSION, cwd: ws } } }) }));
        }
      });
    }, path);
    const started = Date.now();
    const delivery = await transport.NativeDelivery.open('grok', path, SESSION, ws);
    delivery.close();
    assert.ok(Date.now() - started < 4000, `a ${total}-byte frame must not wait for the I/O deadline`);
  }
});

/** A fake OpenCode HTTP API over loopback; `calls` records every request. */
async function opencodeServer(t: TestContext, ws: string, { status = 'idle', directory = ws, message }: { status?: string; directory?: string; message?: JsonRecord } = {}) {
  const calls: JsonRecord[] = [];
  const server = createHttpServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
      calls.push({ method: request.method, url: request.url, authorization: request.headers.authorization, body });
      const url = request.url ?? '';
      const json = (code: number, value: unknown) => { response.writeHead(code, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)); };
      if (url.startsWith('/session/status')) return json(200, status ? { ses_a: { type: status } } : {});
      if (url.startsWith('/session/ses_a/prompt_async')) { response.writeHead(204); return response.end(); }
      if (url.startsWith('/session/ses_a/message')) return json(200, message ?? { info: { sessionID: 'ses_a', role: 'user', id: 'msg_1' }, parts: [{ type: 'text', text: body.parts[0].text }] });
      if (url.startsWith('/session/ses_a')) return json(200, { id: 'ses_a', directory });
      response.writeHead(404); response.end();
    });
  });
  t.after(() => { server.closeAllConnections(); server.close(); });
  await listening(server, 0, '127.0.0.1');
  return { endpoint: `http://127.0.0.1:${portOf(server)}`, calls };
}

test('opencode: preflight, passive message receipt, action prompt and the directory query', async t => {
  const ws = workspace(t);
  const { endpoint, calls } = await opencodeServer(t, ws);
  const delivery = await transport.NativeDelivery.open('opencode', endpoint, 'ses_a', ws);
  t.after(() => delivery.close());
  assert.equal(await delivery.prepare(), true);
  assert.deepEqual(await delivery.offer('fyi text', 'tok', false), { kind: 'http', turnRequested: false });
  assert.deepEqual(await delivery.offer('act text', 'tok', true), { kind: 'http', turnRequested: true });
  const message = calls.find(call => call.url.startsWith('/session/ses_a/message'));
  assert.ok(message);
  assert.deepEqual(message.body, { noReply: true, parts: [{ type: 'text', text: 'fyi text' }] });
  assert.equal(new URL(endpoint + message.url).searchParams.get('directory'), ws);
  const prompted = calls.find(call => call.url.startsWith('/session/ses_a/prompt_async'));
  assert.ok(prompted);
  assert.deepEqual(prompted.body, { noReply: false, parts: [{ type: 'text', text: 'act text' }] });
});

test('opencode: busy defers, a mismatched receipt or workspace is refused, credentials need their endpoint', async t => {
  const ws = workspace(t);
  const busy = await opencodeServer(t, ws, { status: 'busy' });
  const first = await transport.NativeDelivery.open('opencode', busy.endpoint, 'ses_a', ws);
  assert.equal(await first.prepare(), false);
  const wrongReceipt = await opencodeServer(t, ws, { message: { info: { sessionID: 'ses_other', role: 'user', id: 'msg_1' }, parts: [] } });
  const second = await transport.NativeDelivery.open('opencode', wrongReceipt.endpoint, 'ses_a', ws);
  await rejects(second.offer('x', 't', false), /receipt did not match submitted message\/session; inspect before retrying/, 'ValidationError');
  const elsewhere = await opencodeServer(t, ws, { directory: workspace(t) });
  const third = await transport.NativeDelivery.open('opencode', elsewhere.endpoint, 'ses_a', ws);
  await rejects(third.prepare(), /session\/workspace mismatch; no message submitted/, 'ValidationError');
  const saved = { ...process.env };
  t.after(() => { for (const key of ['OPENCODE_SERVER_PASSWORD', 'OPENCODE_SERVER_USERNAME', 'OCTOCODE_OPENCODE_AUTH_ENDPOINT']) if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; });
  process.env.OPENCODE_SERVER_PASSWORD = 'secret';
  await assert.rejects(transport.NativeDelivery.open('opencode', busy.endpoint, 'ses_a', ws), /OCTOCODE_OPENCODE_AUTH_ENDPOINT/);
  process.env.OCTOCODE_OPENCODE_AUTH_ENDPOINT = busy.endpoint;
  const authed = await transport.NativeDelivery.open('opencode', busy.endpoint, 'ses_a', ws);
  await authed.prepare();
  const lastCall = busy.calls.at(-1);
  assert.ok(lastCall);
  assert.equal(lastCall.authorization, 'Basic ' + Buffer.from('opencode:secret').toString('base64'));
  for (const delivery of [first, second, third, authed]) delivery.close();
});

test('opencode: a non-200 preflight is refused and a non-ses_ identifier is rejected', async t => {
  const ws = workspace(t);
  const server = createHttpServer((_request, response) => { response.writeHead(500); response.end('no'); });
  t.after(() => { server.closeAllConnections(); server.close(); });
  await listening(server, 0, '127.0.0.1');
  const delivery = await transport.NativeDelivery.open('opencode', `http://127.0.0.1:${portOf(server)}`, 'ses_a', ws);
  t.after(() => delivery.close());
  await rejects(delivery.prepare(), /OpenCode preflight returned HTTP 500; no message submitted/);
  await assert.rejects(transport.NativeDelivery.open('opencode', 'http://127.0.0.1:1', 'not-a-session', ws), /ses_/);
});

test('claude: one user line on the messaging socket, closed after the write', { skip: !posix }, async t => {
  const ws = workspace(t);
  const path = join(ws, 'claude.sock');
  const received = new Promise<string>(resolve => serve(t, socket => { let text = ''; socket.on('data', chunk => (text += chunk)); socket.on('end', () => resolve(text)); }, path));
  const delivery = await transport.NativeDelivery.open('claude', path, 'claude-session', ws);
  assert.equal(await delivery.prepare(), true);
  assert.deepEqual(await delivery.offer('peer text', 'uuid-1', true), { kind: 'socket-write-only', turnRequested: true });
  const lines = (await received).trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(lines.at(-1), { type: 'user', session_id: 'claude-session', from: 'octocode-communication', priority: 'next', uuid: 'uuid-1', msg_id: 'uuid-1', message: { role: 'user', content: 'peer text' } });
  await rejects(delivery.offer('x', 't', false), /cannot inject passive-only context/, 'ValidationError');
});

function frameOf(value: unknown) {
  const data = Buffer.from(JSON.stringify(value));
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  return Buffer.concat([header, data]);
}

/** A fake Grok leader: length-prefixed frames carrying ACP JSON-RPC payloads. */
function grokServer(t: TestContext, path: string, ws: string, { stop = 'end_turn', cwd = ws }: { stop?: string; cwd?: string } = {}) {
  const seen: JsonRecord[] = [];
  return serve(t, socket => {
    let buffer = Buffer.alloc(0);
    const acp = (value: JsonRecord) => socket.write(frameOf({ type: 'acp', payload: JSON.stringify({ jsonrpc: '2.0', ...value }) }));
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4 && buffer.length >= 4 + buffer.readUInt32BE()) {
        const size = buffer.readUInt32BE();
        const frame = JSON.parse(buffer.subarray(4, 4 + size).toString());
        buffer = buffer.subarray(4 + size);
        seen.push(frame);
        if (frame.type === 'register') socket.write(frameOf({ type: 'registered', leader_protocol_version: 1, ready: false })), socket.write(frameOf({ type: 'leader_ready' }));
        if (frame.type !== 'acp') continue;
        const rpc = JSON.parse(frame.payload);
        if (rpc.method === 'initialize') acp({ id: rpc.id, result: { protocolVersion: 1 } });
        if (rpc.method === '_x.ai/session/info') { acp({ id: 99, method: 'fs/read_text_file', params: {} }); acp({ id: rpc.id, result: { result: { sessionId: SESSION, cwd } } }); }
        if (rpc.method === 'session/prompt') setTimeout(() => acp({ id: rpc.id, result: { stopReason: stop, _meta: { modelId: 'grok-x', usage: { inputTokens: 7, outputTokens: 3, cachedReadTokens: 2 } } } }), 20);
      }
    });
  }, path).then(() => seen);
}

test('grok: registration, ACP session check, prompt and turn-completion receipt with usage', { skip: !posix }, async t => {
  const ws = workspace(t);
  const path = join(ws, 'grok.sock');
  const seen = await grokServer(t, path, ws);
  const delivery = await transport.NativeDelivery.open('grok', path, SESSION, ws);
  t.after(() => delivery.close());
  assert.equal(await delivery.prepare(), true);
  assert.equal(await delivery.offer('act', 'tok-9', true), null, 'the receipt waits for turn completion');
  let receipt = null;
  for (let count = 0; count < 200 && receipt === null; count += 1) receipt = await delivery.poll('tok-9');
  assert.deepEqual(receipt, { kind: 'acp-turn-completion', turnRequested: true, stopReason: 'end_turn', usage: { key: 'grok-tok-9', scope: 'turn', inputTokens: 7, outputTokens: 3, cachedInputTokens: 2, model: 'grok-x' } });
  const prompt = seen.filter(frame => frame.type === 'acp').map(frame => JSON.parse(frame.payload)).find(rpc => rpc.method === 'session/prompt');
  assert.deepEqual(prompt.params, { sessionId: SESSION, prompt: [{ type: 'text', text: 'act' }], _meta: { verbatim: true, promptId: 'tok-9' } });
  const refusal = seen.filter(frame => frame.type === 'acp').map(frame => JSON.parse(frame.payload)).find(rpc => rpc.id === 99);
  assert.deepEqual(refusal, { id: 99, error: { code: -32601, message: 'Communication delivery cannot approve actions or execute tools' }, jsonrpc: '2.0' });
});

test('grok: a non-UUID session, a foreign workspace and a symlinked socket are refused', { skip: !posix }, async t => {
  const ws = workspace(t);
  const path = join(ws, 'grok.sock');
  await grokServer(t, path, ws, { cwd: workspace(t) });
  await rejects(transport.NativeDelivery.open('grok', path, 'not-a-uuid', ws), /badly formed hexadecimal UUID string/);
  await rejects(transport.NativeDelivery.open('grok', path, SESSION, ws), /does not match identity\/workspace; no message staged/, 'ValidationError');
  const symlinkTarget = join(ws, 'link.sock');
  const { symlinkSync } = await import('node:fs');
  symlinkSync(path, symlinkTarget);
  assert.throws(() => transport.validate('grok', symlinkTarget), /socket owned by this OS user, not a symlink/);
});
