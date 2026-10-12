import { setTimeout as sleep } from 'node:timers/promises';
import { CrossHostRedirect, NetworkError, publicFetch, type PublicFetchInit } from './guard.js';
import { describeHtml } from './html.js';

export const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const TIMEOUT_MS = 30_000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
/** Sent as Accept-Language unless OCTOCODE_WEB_LANGUAGE names another, so pages answer in a known language. */
const DEFAULT_LANGUAGE = 'en-US,en;q=0.9';
/** Transient statuses a fetch retries, how often, the first backoff, and the longest Retry-After worth waiting for. */
const RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRIES = 2;
const RETRY_BASE_MS = 400;
const RETRY_AFTER_MAX_MS = 5_000;
/** A fetched page is reused for this long (parallel agents often read the same pages), up to this many pages and bytes in all. */
const CACHE_TTL_MS = 15 * 60_000;
const CACHE_MAX = 64;
const CACHE_MAX_BYTES = 32 * 1024 * 1024;

/** Least recently used first (a Map keeps insertion order; a hit re-inserts). */
const fetchCache = new Map<string, { at: number; text: string; bytes: number }>();
let cachedBytes = 0;

function uncache(key: string): void {
  cachedBytes -= fetchCache.get(key)?.bytes ?? 0;
  fetchCache.delete(key);
}
/** Fetches under way, shared by callers asking for the same page; aborted once every caller has stopped waiting. */
const inFlight = new Map<string, { promise: Promise<string>; controller: AbortController; waiting: number }>();

/** Forgets cached pages; tests start each case from an empty cache. */
export function clearFetchCache(): void {
  fetchCache.clear();
  cachedBytes = 0;
}

export function language(env: NodeJS.ProcessEnv): string {
  return env['OCTOCODE_WEB_LANGUAGE']?.trim() || DEFAULT_LANGUAGE;
}

/**
 * A URL as text: HTML reduced to its readable content with a note when a browser may show something else, JSON
 * pretty-printed, other text as is. Transient failures are retried; a successful page is cached for 15 minutes; a
 * redirect to another host is reported instead of followed.
 */
const REDIRECT_NOTE = 'The target is server-supplied and not verified; fetch it with web if you trust it.';
const BINARY_NOTE = ', not text; web cannot read it. Download it with bash (curl -o) if you need the file.';

/** Why a fetch result is a notice rather than page text (a cross-host redirect, a binary type), or undefined for a page. */
export function unreadReason(text: string): 'redirect' | 'unsupported' | undefined {
  const lines = text.split('\n');
  if (lines.length === 2 && lines[1] === REDIRECT_NOTE) return 'redirect';
  if (lines.length === 1 && text.endsWith(BINARY_NOTE)) return 'unsupported';
  return undefined;
}

export async function fetchUrl(url: string, signal?: AbortSignal, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  signal?.throwIfAborted();
  const key = `${language(env)} ${url}`;
  const cached = fetchCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    fetchCache.delete(key);
    fetchCache.set(key, cached);
    return cached.text;
  }
  let entry = inFlight.get(key);
  if (!entry) {
    const controller = new AbortController();
    const promise = loadUrl(key, url, controller.signal, env).finally(() => {
      if (inFlight.get(key)?.promise === promise) inFlight.delete(key);
    });
    // Every caller may have stopped waiting; the abort rejection then has no other handler.
    promise.catch(() => undefined);
    entry = { promise, controller, waiting: 0 };
    inFlight.set(key, entry);
  }
  entry.waiting += 1;
  try {
    return await untilAborted(entry.promise, signal);
  } finally {
    entry.waiting -= 1;
    if (entry.waiting === 0 && signal?.aborted) entry.controller.abort(signal.reason);
  }
}

/** `promise`, or a rejection with the signal's reason as soon as `signal` aborts. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/** Fetches and caches one page. */
async function loadUrl(key: string, url: string, signal: AbortSignal, env: NodeJS.ProcessEnv): Promise<string> {
  let text: string;
  try {
    text = await fetchText(url, signal, env);
  } catch (error) {
    // The model decides whether a server-supplied target is worth fetching; it is not followed on the page's word.
    if (error instanceof CrossHostRedirect) return `${error.message}\n${REDIRECT_NOTE}`;
    throw error;
  }
  uncache(key);
  const bytes = Buffer.byteLength(text);
  fetchCache.set(key, { at: Date.now(), text, bytes });
  cachedBytes += bytes;
  while (fetchCache.size > 1 && (fetchCache.size > CACHE_MAX || cachedBytes > CACHE_MAX_BYTES)) uncache(fetchCache.keys().next().value!);
  return text;
}

/** Retry-After in milliseconds (seconds or an HTTP date); undefined when absent or unreadable. */
export function retryAfterMs(header: string | null, now = Date.now()): number | undefined {
  if (!header) return undefined;
  if (/^\d+$/.test(header.trim())) return Number(header.trim()) * 1000;
  const at = Date.parse(header);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

const backoff = (attempt: number) => RETRY_BASE_MS * 2 ** attempt + Math.floor(Math.random() * RETRY_BASE_MS);

/** The network cause of a failed fetch (ECONNRESET, ENOTFOUND, a TLS error), or a timeout. */
function describeFetchError(error: unknown, url: string, tries: number): Error {
  if (error instanceof Error && (error.name === 'TimeoutError' || (error.name === 'AbortError' && /timeout/i.test(error.message)))) {
    return new Error(`Timed out after ${TIMEOUT_MS / 1000}s fetching ${url}`);
  }
  if (!(error instanceof NetworkError)) return error instanceof Error ? error : new Error(String(error));
  const cause = (error as { cause?: { code?: unknown; message?: unknown } }).cause;
  const detail = [cause?.code, cause?.message].filter((part) => typeof part === 'string' && part).join(': ');
  return new Error(`Could not fetch ${url}: ${detail || error.message}${tries > 1 ? ` (tried ${tries} times)` : ''}. The site may block automated requests; try the browser tool.`);
}

/**
 * `publicFetch`, retrying network errors and transient statuses (408/425/429/5xx) with backoff and jitter, honouring a
 * short Retry-After; a longer one is returned for the caller to report.
 */
async function fetchWithRetry(url: string, init: PublicFetchInit, env: NodeJS.ProcessEnv, signal?: AbortSignal): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    let response: Response;
    try {
      response = await publicFetch(url, { ...init, signal: combineSignals(signal) }, { env, sameHost: true });
    } catch (error) {
      // Only network failures are worth another try: not a refusal, a redirect, a timeout or the user's abort.
      if (signal?.aborted || !(error instanceof NetworkError) || attempt >= RETRIES) throw describeFetchError(error, url, attempt + 1);
      await sleep(backoff(attempt), undefined, { signal });
      continue;
    }
    if (!RETRY_STATUSES.has(response.status) || attempt >= RETRIES) return response;
    const wait = retryAfterMs(response.headers.get('retry-after'));
    if (wait !== undefined && wait > RETRY_AFTER_MAX_MS) return response;
    await response.body?.cancel().catch(() => undefined);
    await sleep(wait ?? backoff(attempt), undefined, { signal });
  }
}

function httpError(response: Response, url: string): Error {
  const after = response.headers.get('retry-after');
  const status = [response.status, response.statusText].filter(Boolean).join(' ');
  const hint = response.status === 401 || response.status === 403 ? ' (login or bot block: try the browser tool, or a dedicated MCP tool for private content)' : '';
  return new Error(`HTTP ${status} for ${url}${after ? ` (retry after ${after})` : ''}${hint}`);
}

async function fetchText(url: string, signal: AbortSignal | undefined, env: NodeJS.ProcessEnv): Promise<string> {
  const response = await fetchWithRetry(url, { headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/json,text/plain,*/*', 'accept-language': language(env) } }, env, signal);
  const type = response.headers.get('content-type') ?? '';
  if (isBinaryType(type)) {
    await response.body?.cancel().catch(() => undefined);
    if (!response.ok) throw httpError(response, url);
    // Decoding binary as UTF-8 would flood the context with garbage.
    return `${response.url} is ${type.split(';')[0]}${BINARY_NOTE}`;
  }
  // The timeout covers the body too: a slow stream reports like a slow connect, not as a bare abort.
  const { text: body, truncated } = await readCapped(response, type).catch((error: unknown) => {
    throw describeFetchError(error, url, 1);
  });
  if (!response.ok) throw httpError(response, url);
  const json = type.includes('json');
  const megabytes = MAX_BODY_BYTES / 1024 / 1024;
  // First, so the note survives the web tool's character cap. Cut JSON does not parse, so it is shown raw.
  const cut = truncated ? `[Truncated: the response is over ${megabytes} MB; only the first ${megabytes} MB was read${json ? ' and is shown raw, not pretty-printed' : ''}. Download it with bash (curl -o) for the whole body.]\n\n` : '';
  if (type.includes('html')) return cut + describeHtml(body, response.url || url);
  if (json && !truncated) {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }
  return cut + body;
}

export function isBinaryType(contentType: string): boolean {
  const type = contentType.split(';')[0]!.trim().toLowerCase();
  if (!type) return false;
  if (type.startsWith('text/') || /[+/](json|xml|javascript|ecmascript|x-www-form-urlencoded|yaml|toml|x-sh)$/.test(type)) return false;
  return /^(image|audio|video|font)\//.test(type) || /^application\/(pdf|zip|gzip|x-tar|x-7z-compressed|octet-stream|wasm|x-bzip2|vnd\.)/.test(type);
}

/** The body decoded (see `decodeBody`), at most MAX_BODY_BYTES of it; `truncated` when there was more. */
async function readCapped(response: Response, contentType: string): Promise<{ text: string; truncated: boolean }> {
  const reader = response.body?.getReader();
  if (!reader) return { text: '', truncated: false };
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      truncated = true;
      break;
    }
  }
  await reader.cancel().catch(() => undefined);
  return { text: decodeBody(Buffer.concat(chunks).subarray(0, MAX_BODY_BYTES), contentType, truncated), truncated };
}

/**
 * Text in the body's charset: a byte-order mark, else Content-Type's charset, else (HTML) a `<meta>` charset in the
 * first bytes, else UTF-8; an unknown label falls back to UTF-8. A cut body ends at the last whole character.
 */
export function decodeBody(bytes: Uint8Array, contentType: string, cut = false): string {
  const label = bomCharset(bytes) ?? charsetParameter(contentType) ?? (contentType.includes('html') ? metaCharset(bytes) : undefined);
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(label ?? 'utf-8');
  } catch {
    decoder = new TextDecoder('utf-8');
  }
  // Streaming keeps an incomplete trailing sequence back instead of turning it into U+FFFD.
  return decoder.decode(bytes, { stream: cut });
}

function bomCharset(bytes: Uint8Array): string | undefined {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  return undefined;
}

function charsetParameter(value: string): string | undefined {
  return /;\s*charset\s*=\s*["']?([^"';\s]+)/i.exec(value)?.[1];
}

/** Bytes an HTML charset declaration must appear in (the HTML spec's prescan window). */
const META_PRESCAN_BYTES = 1024;

/** `<meta charset=…>` or `<meta http-equiv=content-type content="…; charset=…">` early in the document. */
function metaCharset(bytes: Uint8Array): string | undefined {
  const head = Buffer.from(bytes.subarray(0, META_PRESCAN_BYTES)).toString('latin1');
  for (const [tag] of head.matchAll(/<meta\b[^>]*>/gi)) {
    const direct = /\bcharset\s*=\s*["']?([^"'\s/>;]+)/i.exec(tag)?.[1];
    if (direct) return direct;
  }
  return undefined;
}

export function combineSignals(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
