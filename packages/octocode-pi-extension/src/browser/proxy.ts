import http from 'node:http';
import net from 'node:net';
import type { Duplex } from 'node:stream';
import { errorMessage } from '../shared/util.js';
import { classifyHost, defaultLookup, type HostLookup } from '../web/guard.js';

/**
 * The filtering proxy a launched Chrome is pointed at (`--proxy-server`). Chrome sends every request, WebSocket upgrade
 * and name resolution through it, so it is the one place a request can be stopped before it leaves: the CDP `Fetch`
 * domain never pauses a WebSocket handshake, and the address Chrome resolves can differ from the one the guard checked
 * (DNS rebinding).
 *
 * Each target is resolved here, classified like the `web` tool's (`classifyHost`), and the connection goes to the first
 * address that passed, so a later DNS answer cannot swap it. A private or non-public target is refused with 403 unless
 * the session allowed that host and port (`allow`): the agent chose it through `navigate`, `open` or `tab` and the
 * permission matrix approved it. Anything the page chooses stays refused.
 */

/** A refused connection, for the audit trail: `host` is `hostname:port` as requested. */
export interface BlockedConnection {
  host: string;
  /** `private`: a loopback, private or otherwise non-public address; `unresolved`: a name nothing here could vet. */
  reason: 'private' | 'unresolved';
}

export interface FilteringProxyOptions {
  /** Called for every refused connection. */
  onBlocked?: (blocked: BlockedConnection) => void;
  /** Resolves host names; the `web` tool's resolver by default. */
  lookup?: HostLookup;
  /** Where `HTTP_PROXY`, `HTTPS_PROXY` and `NO_PROXY` are read (`process.env` by default): the proxy chains to them. */
  env?: NodeJS.ProcessEnv;
  /** Opens the connection to a vetted address; a seam for tests. */
  connect?: (address: string, port: number) => net.Socket;
}

export interface FilteringProxy {
  readonly port: number;
  /** The value for Chrome's `--proxy-server`. */
  readonly url: string;
  /** Lets `url`'s host and port reach private addresses, once the agent's navigation to it was approved. */
  allow(url: URL): void;
  close(): Promise<void>;
}

const CONNECT_TIMEOUT_MS = 30_000;
const DEFAULT_PORTS: Readonly<Record<string, number>> = { 'http:': 80, 'ws:': 80, 'https:': 443, 'wss:': 443 };
/** Headers that describe one hop, not the message. */
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'proxy-connection', 'te', 'trailer', 'transfer-encoding', 'upgrade']);

const bare = (hostname: string): string => hostname.replace(/^\[|\]$/g, '');
const hostKey = (hostname: string, port: number): string => `${bare(hostname)}:${port}`;

interface Target {
  url: URL;
  hostname: string;
  port: number;
}

/** `url` (any scheme with a default port) as a target; the URL parser normalizes numeric hosts like `0x7f.1` and `2130706433`. */
function targetOf(url: URL): Target {
  return { url, hostname: bare(url.hostname), port: url.port ? Number(url.port) : (DEFAULT_PORTS[url.protocol] ?? 0) };
}

/** The `host:port` of a CONNECT request line, or undefined when it is not one. */
function connectTarget(authority: string | undefined): Target | undefined {
  if (!authority || !/:\d+$/.test(authority) || /[/@?#\s]/.test(authority)) return undefined;
  try {
    const target = targetOf(new URL(`http://${authority}`));
    return target.port > 0 && target.hostname ? target : undefined;
  } catch {
    return undefined;
  }
}

interface Upstream {
  host: string;
  port: number;
  /** The `Proxy-Authorization` value from the proxy URL's credentials. */
  auth?: string;
}

/** The upstream proxy named by the first of `names` that is set. An unsupported one is an error: going direct would bypass it. */
function upstreamFromEnv(env: NodeJS.ProcessEnv, names: readonly string[]): Upstream | undefined {
  for (const name of names) {
    const raw = (env[name] ?? env[name.toLowerCase()])?.trim();
    if (!raw) continue;
    let url: URL;
    try {
      url = new URL(raw.includes('://') ? raw : `http://${raw}`);
    } catch {
      throw new Error(`${name} is not a proxy URL. Fix or unset it and restart Pi.`);
    }
    if (url.protocol !== 'http:') throw new Error(`${name} must be an http:// proxy, not ${url.protocol}//; the browser's filtering proxy chains to http proxies only. Fix or unset it and restart Pi.`);
    const credentials = url.username ? `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}` : undefined;
    return { host: bare(url.hostname), port: Number(url.port || 80), ...(credentials !== undefined && { auth: `Basic ${Buffer.from(credentials).toString('base64')}` }) };
  }
  return undefined;
}

/** `NO_PROXY`: `*`, or host names and domain suffixes (a leading dot is optional), each with an optional port. */
function noProxy(env: NodeJS.ProcessEnv, { hostname, port }: Target): boolean {
  const entries = (env['NO_PROXY'] ?? env['no_proxy'] ?? '').split(/[\s,]+/).filter(Boolean);
  return entries.some((entry) => {
    if (entry === '*') return true;
    const [, name = '', wantedPort] = /^(.*?)(?::(\d+))?$/.exec(entry) ?? [];
    const domain = name.replace(/^\*?\./, '').toLowerCase();
    if (wantedPort !== undefined && Number(wantedPort) !== port) return false;
    return domain !== '' && (hostname === domain || hostname.endsWith(`.${domain}`));
  });
}

/** Opens a connection to the first of `addresses` that accepts one. */
async function connectAny(addresses: readonly string[], port: number, connect: (address: string, port: number) => net.Socket): Promise<net.Socket> {
  let failure: unknown = new Error('no address to connect to');
  for (const address of addresses) {
    try {
      return await new Promise<net.Socket>((resolve, reject) => {
        const socket = connect(address, port);
        const fail = (error: Error) => {
          socket.destroy();
          reject(error);
        };
        socket.setTimeout(CONNECT_TIMEOUT_MS, () => fail(new Error(`connecting to ${address}:${port} timed out`)));
        socket.once('error', fail);
        socket.once('connect', () => {
          socket.setTimeout(0);
          socket.removeListener('error', fail);
          resolve(socket);
        });
      });
    } catch (error) {
      failure = error;
    }
  }
  throw failure;
}

/** A tunnel to `target` through the upstream proxy: its `CONNECT` answered 2xx. */
async function tunnelThrough(upstream: Upstream, { hostname, port }: Target, connect: (address: string, port: number) => net.Socket): Promise<net.Socket> {
  const socket = await connectAny([upstream.host], upstream.port, connect);
  const authority = `${net.isIPv6(hostname) ? `[${hostname}]` : hostname}:${port}`;
  socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n${upstream.auth ? `Proxy-Authorization: ${upstream.auth}\r\n` : ''}\r\n`);
  return new Promise<net.Socket>((resolve, reject) => {
    let received = Buffer.alloc(0);
    const fail = (error: Error) => {
      socket.destroy();
      reject(error);
    };
    const onData = (chunk: Buffer) => {
      received = Buffer.concat([received, chunk]);
      const end = received.indexOf('\r\n\r\n');
      if (end < 0) return;
      socket.removeListener('data', onData);
      socket.removeListener('error', fail);
      socket.removeListener('close', onClose);
      const status = /^HTTP\/1\.[01] (\d{3})/.exec(received.subarray(0, end).toString('latin1'))?.[1];
      if (!status?.startsWith('2')) return fail(new Error(`the upstream proxy refused the tunnel (HTTP ${status ?? 'invalid response'})`));
      const rest = received.subarray(end + 4);
      if (rest.length > 0) socket.unshift(rest);
      resolve(socket);
    };
    const onClose = () => fail(new Error('the upstream proxy closed the connection'));
    socket.on('data', onData);
    socket.once('error', fail);
    socket.once('close', onClose);
  });
}

function refuse(socket: Duplex, status: string, reason: string, body: string): void {
  socket.end(`HTTP/1.1 ${status}\r\nX-Octocode-Blocked: ${reason}\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
}

const blockedText = (host: string, reason: BlockedConnection['reason']): string =>
  reason === 'private'
    ? `Blocked by Octocode: ${host} is a local or private network address, and the agent did not open it.`
    : `Blocked by Octocode: ${host} does not resolve here, so it cannot be checked.`;

/** Starts the proxy on an ephemeral port of 127.0.0.1. `close()` stops it and cuts every open tunnel. */
export async function startFilteringProxy(options: FilteringProxyOptions = {}): Promise<FilteringProxy> {
  const env = options.env ?? process.env;
  const lookup = options.lookup ?? defaultLookup;
  const connect = options.connect ?? ((address, port) => net.connect({ host: address, port }));
  const httpUpstream = upstreamFromEnv(env, ['HTTP_PROXY']);
  const connectUpstream = upstreamFromEnv(env, ['HTTPS_PROXY', 'HTTP_PROXY']);
  const allowed = new Set<string>();
  const sockets = new Set<Duplex>();

  type Verdict = { ok: true; addresses: string[]; local: boolean } | { ok: false; reason: BlockedConnection['reason'] };

  /** The addresses a connection to `target` may use: resolved once, here, and vetted. */
  async function vet({ url, hostname, port }: Target): Promise<Verdict> {
    const resolved: string[] = [];
    const host = await classifyHost(url, async (name) => {
      const records = await lookup(name);
      resolved.push(...records.map(({ address }) => address));
      return records;
    });
    if (host.kind === 'public') return { ok: true, addresses: host.addresses, local: false };
    if (host.kind === 'private') return allowed.has(hostKey(hostname, port)) ? { ok: true, addresses: net.isIP(hostname) ? [hostname] : resolved, local: true } : { ok: false, reason: 'private' };
    // Not resolvable here. Only an upstream proxy may know it, and only for a host the agent opened.
    return allowed.has(hostKey(hostname, port)) && connectUpstream ? { ok: true, addresses: [], local: false } : { ok: false, reason: 'unresolved' };
  }

  function blocked(target: Target, reason: BlockedConnection['reason']): void {
    // A name nothing here resolves fails by itself; it is a refusal only when an upstream proxy might have taken it.
    if (reason === 'unresolved' && !connectUpstream) return;
    options.onBlocked?.({ host: hostKey(target.hostname, target.port), reason });
  }

  /** Whether this request goes to an upstream proxy: one is set, the target is not on NO_PROXY, and it is not a local address the agent opened. */
  const viaUpstream = (upstream: Upstream | undefined, target: Target, verdict: Extract<Verdict, { ok: true }>): upstream is Upstream =>
    upstream !== undefined && !verdict.local && !noProxy(env, target);

  const server = http.createServer((request, response) => {
    void (async () => {
      const fail = (status: number, text: string) => {
        if (!response.headersSent) response.writeHead(status, { 'content-type': 'text/plain', connection: 'close' });
        response.end(text);
      };
      let url: URL;
      try {
        url = new URL(request.url ?? '');
      } catch {
        return fail(400, 'This is a proxy: send absolute http:// URLs.');
      }
      if (url.protocol !== 'http:') return fail(400, `This proxy forwards http:// requests; ${url.protocol}// goes through CONNECT.`);
      const target = targetOf(url);
      const verdict = await vet(target);
      if (!verdict.ok) {
        blocked(target, verdict.reason);
        response.setHeader('x-octocode-blocked', verdict.reason);
        return fail(403, blockedText(hostKey(target.hostname, target.port), verdict.reason));
      }
      const upstream = viaUpstream(httpUpstream, target, verdict) ? httpUpstream : undefined;
      let socket: net.Socket;
      try {
        socket = upstream ? await connectAny([upstream.host], upstream.port, connect) : await connectAny(verdict.addresses, target.port, connect);
      } catch (error) {
        return fail(502, `Could not reach ${url.host}: ${errorMessage(error)}`);
      }
      const headers: http.OutgoingHttpHeaders = {};
      for (const [name, value] of Object.entries(request.headers)) if (!HOP_BY_HOP.has(name)) headers[name] = value;
      if (upstream?.auth) headers['proxy-authorization'] = upstream.auth;
      const forwarded = http.request({ createConnection: () => socket, method: request.method, path: upstream ? url.href : `${url.pathname}${url.search}`, headers: { ...headers, connection: 'close' } }, (answer) => {
        const raw: string[] = [];
        for (let index = 0; index + 1 < answer.rawHeaders.length; index += 2) {
          const name = answer.rawHeaders[index]!;
          if (!HOP_BY_HOP.has(name.toLowerCase())) raw.push(name, answer.rawHeaders[index + 1]!);
        }
        response.writeHead(answer.statusCode ?? 502, answer.statusMessage, raw);
        answer.pipe(response);
        answer.once('error', () => response.destroy());
      });
      forwarded.once('error', (error) => fail(502, `Could not reach ${url.host}: ${errorMessage(error)}`));
      response.once('close', () => forwarded.destroy());
      request.pipe(forwarded);
    })();
  });

  server.on('connect', (request, client: Duplex, head: Buffer) => {
    sockets.add(client);
    client.once('close', () => sockets.delete(client));
    client.on('error', () => client.destroy());
    void (async () => {
      const target = connectTarget(request.url);
      if (!target) return refuse(client, '400 Bad Request', 'invalid', 'CONNECT needs host:port.');
      const verdict = await vet(target);
      if (!verdict.ok) {
        blocked(target, verdict.reason);
        return refuse(client, '403 Forbidden', verdict.reason, blockedText(hostKey(target.hostname, target.port), verdict.reason));
      }
      let remote: net.Socket;
      try {
        remote = viaUpstream(connectUpstream, target, verdict) ? await tunnelThrough(connectUpstream, target, connect) : await connectAny(verdict.addresses, target.port, connect);
      } catch (error) {
        return refuse(client, '502 Bad Gateway', 'unreachable', `Could not reach ${hostKey(target.hostname, target.port)}: ${errorMessage(error)}`);
      }
      if (client.destroyed) return void remote.destroy();
      sockets.add(remote);
      remote.once('close', () => {
        sockets.delete(remote);
        client.destroy();
      });
      client.once('close', () => remote.destroy());
      remote.on('error', () => remote.destroy());
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length > 0) remote.write(head);
      client.pipe(remote);
      remote.pipe(client);
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  server.unref();
  const { port } = server.address() as net.AddressInfo;
  return {
    port,
    url: `http://127.0.0.1:${port}`,
    allow(url) {
      const { hostname, port: allowedPort } = targetOf(url);
      allowed.add(hostKey(hostname, allowedPort));
    },
    close() {
      return new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
        for (const socket of sockets) socket.destroy();
      });
    },
  };
}
