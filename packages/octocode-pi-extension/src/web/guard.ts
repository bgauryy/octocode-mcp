import { lookup as dnsLookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { pipeline, Readable, type Transform } from 'node:stream';
import zlib from 'node:zlib';
import { errorMessage } from '../shared/util.js';

/** Redirect hops `web` follows; each target is checked before it is fetched. */
const MAX_REDIRECTS = 10;

export type HostLookup = (hostname: string) => Promise<Array<{ address: string }>>;

export const defaultLookup: HostLookup = (hostname) => dnsLookup(hostname, { all: true, verbatim: true });

/** Non-public IPv4 ranges: this network, private, CGNAT, loopback, link-local (cloud metadata), protocol/test/benchmark, multicast, reserved. */
const V4_BLOCKS: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
  const values = parts.map(Number);
  if (values.some((value) => value > 255)) return null;
  return ((values[0]! << 24) >>> 0) + (values[1]! << 16) + (values[2]! << 8) + values[3]!;
}

function inV4(ip: number, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return ((ip & mask) >>> 0) === ((ipv4ToInt(base)! & mask) >>> 0);
}

function expandIpv6(ip: string): number[] | null {
  let value = ip.toLowerCase().replace(/%.*$/, '');
  const dotted = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(value);
  if (dotted) {
    const v4 = ipv4ToInt(dotted[2]!);
    if (v4 === null) return null;
    value = `${dotted[1]}${((v4 >>> 16) & 0xffff).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }
  const halves = value.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const groups = halves.length === 1 ? head : [...head, ...Array<string>(Math.max(0, 8 - head.length - tail.length)).fill('0'), ...tail];
  if (groups.length !== 8) return null;
  const parsed = groups.map((group) => (/^[0-9a-f]{1,4}$/.test(group) ? Number.parseInt(group, 16) : Number.NaN));
  return parsed.some(Number.isNaN) ? null : parsed;
}

/**
 * The IPv4 addresses inside an IPv6 address that carries one: mapped (::ffff:a.b.c.d, always, so ::ffff:0.0.0.0 is
 * 0.0.0.0), translated (::ffff:0:a.b.c.d), deprecated compatible (::a.b.c.d, except :: and ::1), NAT64
 * (64:ff9b::/96), 6to4 (2002::/16) and Teredo (2001::/32: server, and the bit-inverted client address).
 */
function embeddedIpv4(groups: number[]): string[] {
  const dotted = (left: number, right: number) => `${left >>> 8}.${left & 255}.${right >>> 8}.${right & 255}`;
  const zero = (from: number, to: number) => groups.slice(from, to).every((group) => group === 0);
  const low = dotted(groups[6]!, groups[7]!);
  if (zero(0, 5) && groups[5] === 0xffff) return [low];
  if (zero(0, 4) && groups[4] === 0xffff && groups[5] === 0) return [low];
  if (zero(0, 6) && (groups[6] !== 0 || groups[7]! > 1)) return [low];
  if (groups[0] === 0x64 && groups[1] === 0xff9b && zero(2, 6)) return [low];
  if (groups[0] === 0x2002) return [dotted(groups[1]!, groups[2]!)];
  if (groups[0] === 0x2001 && groups[1] === 0) return [dotted(groups[2]!, groups[3]!), dotted(~groups[6]! & 0xffff, ~groups[7]! & 0xffff)];
  return [];
}

/** True for any address that is not a public unicast address (anything unparsable counts as blocked). */
export function isBlockedIp(ip: string): boolean {
  const version = net.isIP(ip.replace(/%.*$/, ''));
  if (version === 4) {
    const value = ipv4ToInt(ip)!;
    return V4_BLOCKS.some(([base, bits]) => inV4(value, base, bits));
  }
  if (version !== 6) return true;
  const groups = expandIpv6(ip);
  if (groups === null) return true;
  const embedded = embeddedIpv4(groups);
  if (embedded.length > 0) return embedded.some(isBlockedIp);
  const first = groups[0]!;
  return (
    groups.slice(0, 7).every((group) => group === 0) || // :: and ::1
    (first === 0x64 && groups[1] === 0xff9b) || // NAT64 local-use 64:ff9b:1::/48 and the rest of 64:ff9b::/32
    (first & 0xfe00) === 0xfc00 || // unique local fc00::/7
    (first & 0xffc0) === 0xfe80 || // link-local fe80::/10
    (first & 0xffc0) === 0xfec0 || // site-local fec0::/10
    (first & 0xff00) === 0xff00 || // multicast
    (first === 0x0100 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0) || // discard-only 100::/64
    (first === 0x2001 && groups[1] === 0x0db8) // documentation
  );
}

/** What a URL's host reaches: only public addresses (listed), any non-public one, or nothing that resolves here. */
export type HostClass = { kind: 'public'; addresses: string[] } | { kind: 'private' } | { kind: 'unresolved'; error: unknown };

/** Releases the connection of a response whose body is not read. */
export const discardBody = (response: Response): Promise<void> => (response.body?.cancel() ?? Promise.resolve()).catch(() => undefined);

/** Whether `url` is an http(s) URL: the only schemes the web and browser tools reach. */
export const isHttpUrl = (url: URL): boolean => url.protocol === 'http:' || url.protocol === 'https:';

/** A URL's hostname as a name or address: the brackets `URL` keeps around an IPv6 literal are dropped. */
export const bareHostname = (hostname: string): string => hostname.replace(/^\[|\]$/g, '');

/**
 * Classifies `url`'s host by its literal address or every address it resolves to (loopback, private, link-local cloud
 * metadata, … count as private). A name that does not resolve here is `unresolved`: another resolver (a browser's
 * own DNS, a hosts entry, a proxy) may still take it somewhere private.
 */
export async function classifyHost(url: URL, lookup: HostLookup = defaultLookup): Promise<HostClass> {
  const hostname = bareHostname(url.hostname);
  if (net.isIP(hostname)) return isBlockedIp(hostname) ? { kind: 'private' } : { kind: 'public', addresses: [hostname] };
  let records: Array<{ address: string }>;
  try {
    records = await lookup(hostname);
  } catch (error) {
    return { kind: 'unresolved', error };
  }
  if (records.length === 0) return { kind: 'unresolved', error: new Error(`${hostname} has no addresses`) };
  if (records.some(({ address }) => isBlockedIp(address))) return { kind: 'private' };
  return { kind: 'public', addresses: records.map(({ address }) => address) };
}

/** A connection, TLS or DNS failure: worth another try, unlike a refusal, a redirect or a timeout. */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super(errorMessage(cause), { cause });
    this.name = 'NetworkError';
  }
}

export interface PublicFetchInit {
  /** `GET` (default) or `POST`. */
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  /** The request body (a `POST`); sent only with `redirect: 'error'`, because a redirect must not carry it elsewhere. */
  body?: string;
  /** `follow` (default) checks and follows redirects; `error` fails on the first one. */
  redirect?: 'follow' | 'error';
  signal?: AbortSignal;
}

/**
 * Requests `url` (a GET, or a POST with a body), checking it and every redirect target before requesting it: http(s)
 * only, and a host that resolves only to public addresses. The connection goes to the checked addresses, so a DNS
 * answer that changes after the check (rebinding) cannot point it somewhere private. `firstHopPrivate` lets the first
 * request (the URL the user approved as a `net.private` ask) reach a private address; every redirect target is still
 * checked, so a redirect never leads there.
 */
export async function publicFetch(url: string, init: PublicFetchInit, options: { lookup?: HostLookup; sameHost?: boolean; firstHopPrivate?: boolean } = {}): Promise<Response> {
  if (init.body !== undefined && init.redirect !== 'error') throw new Error("a request with a body must use redirect: 'error'");
  let target = new URL(url);
  for (let hop = 0; ; hop += 1) {
    if (!isHttpUrl(target)) throw new Error(`web fetches http(s) URLs only, not ${target.protocol}`);
    const response = await send(target, init, hop === 0 && options.firstHopPrivate ? undefined : await publicAddresses(target, options.lookup));
    const location = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || location === null) return response;
    await discardBody(response);
    if (init.redirect === 'error') throw new Error(`${target.host} answered with a redirect (HTTP ${response.status}); it is not followed`);
    if (hop >= MAX_REDIRECTS) throw new Error(`Too many redirects fetching ${url}`);
    const next = new URL(location, target);
    if (options.sameHost && !sameSite(target, next)) throw new CrossHostRedirect(target, next, response.status);
    target = next;
  }
}

/** The public addresses `url`'s host resolves to; throws when it is private or does not resolve. */
async function publicAddresses(url: URL, lookup?: HostLookup): Promise<string[]> {
  const host = await classifyHost(url, lookup);
  if (host.kind === 'unresolved') throw new Error(`Could not resolve ${url.hostname}: ${errorMessage(host.error)}`);
  if (host.kind === 'private') throw new Error(`Blocked private or non-public address: ${url.host}. Do not retry it. A redirect is never followed to a private address; a local page the user wants read is a \`web\` URL of its own (the user is asked first), or use \`browser\`.`);
  return host.addresses;
}

/** Statuses whose response has no body. */
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

/** One request without following redirects; `addresses` (when given) are the only ones the connection may use. */
function send(target: URL, init: PublicFetchInit, addresses: string[] | undefined): Promise<Response> {
  const { signal } = init;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    let incoming: http.IncomingMessage | undefined;
    const onAbort = () => {
      request.destroy(signal!.reason);
      incoming?.destroy(signal!.reason);
    };
    const client = target.protocol === 'https:' ? https : http;
    // No pooled agent: a reused socket could lead to an address this request did not check.
    const request = client.request(target, { method: init.method ?? 'GET', agent: false, headers: { 'accept-encoding': 'gzip, deflate, br', ...(init.body !== undefined && { 'content-length': String(Buffer.byteLength(init.body)) }), ...init.headers }, ...(addresses && { lookup: pinnedLookup(addresses) }) }, (response) => {
      incoming = response;
      response.once('close', () => signal?.removeEventListener('abort', onAbort));
      try {
        resolve(toResponse(target, response));
      } catch (error) {
        response.destroy();
        reject(new NetworkError(error));
      }
    });
    request.once('error', (error) => {
      signal?.removeEventListener('abort', onAbort);
      reject(signal?.aborted ? signal.reason : new NetworkError(error));
    });
    signal?.addEventListener('abort', onAbort, { once: true });
    request.end(init.body);
  });
}

/** The Fetch API view of a Node response: headers as sent, the body decompressed, `url` the address requested. */
function toResponse(target: URL, response: http.IncomingMessage): Response {
  const status = response.statusCode ?? 0;
  if (status < 200 || status > 599) throw new Error(`invalid HTTP status ${status}`);
  const headers = new Headers();
  for (let index = 0; index + 1 < response.rawHeaders.length; index += 2) headers.append(response.rawHeaders[index]!, response.rawHeaders[index + 1]!);
  let body: Readable | null = response;
  if (NULL_BODY_STATUSES.has(status)) {
    response.resume();
    body = null;
  } else {
    const decoder = decompressor(response.headers['content-encoding']);
    if (decoder) body = pipeline(response, decoder, () => undefined);
  }
  const result = new Response(body && (Readable.toWeb(body) as ReadableStream<Uint8Array>), {
    status,
    statusText: (response.statusMessage ?? '').replace(/[^\t\x20-\x7e\x80-\xff]/g, ''),
    headers,
  });
  Object.defineProperty(result, 'url', { value: target.href });
  return result;
}

/** A stream that undoes the Content-Encoding the request accepted; a cut stream yields what arrived. */
function decompressor(encoding: string | undefined): Transform | undefined {
  const flush = { flush: zlib.constants.Z_SYNC_FLUSH, finishFlush: zlib.constants.Z_SYNC_FLUSH };
  switch (encoding?.trim().toLowerCase()) {
    case 'gzip':
    case 'x-gzip':
      return zlib.createGunzip(flush);
    case 'deflate':
      return zlib.createInflate(flush);
    case 'br':
      return zlib.createBrotliDecompress({ flush: zlib.constants.BROTLI_OPERATION_FLUSH, finishFlush: zlib.constants.BROTLI_OPERATION_FLUSH });
    default:
      return undefined;
  }
}

/** A DNS lookup that answers only with the checked addresses. */
function pinnedLookup(addresses: string[]): net.LookupFunction {
  const entries = addresses.map((address) => ({ address, family: net.isIP(address) }));
  return (_hostname, options, callback) => {
    if (options.all) return callback(null, entries);
    const wanted = options.family === 'IPv4' ? 4 : options.family === 'IPv6' ? 6 : options.family;
    const entry = entries.find(({ family }) => !wanted || family === wanted) ?? entries[0]!;
    callback(null, entry.address, entry.family);
  };
}

/** A redirect `publicFetch` did not follow because it leaves the host (with `sameHost`); the caller decides. */
export class CrossHostRedirect extends Error {
  constructor(
    readonly from: URL,
    readonly to: URL,
    readonly status: number,
  ) {
    super(`${from.href} redirects (HTTP ${status}) to another host: ${to.href}`);
  }
}

/** Same host (a leading `www.` ignored), and no downgrade from https to http. */
function sameSite(from: URL, to: URL): boolean {
  const host = (url: URL) => url.hostname.replace(/^www\./i, '').toLowerCase();
  return host(from) === host(to) && !(from.protocol === 'https:' && to.protocol === 'http:');
}
