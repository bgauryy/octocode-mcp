import http from 'node:http';
import net from 'node:net';
import { CLIENT_MARGIN_MS, MAX_FRAME_BYTES, WAIT_MS, type ApiEvent } from './protocol.js';
import type { InstanceRecord } from './registry.js';
import { isLoopbackHostname } from '../shared/net.js';
import { isRecord } from '../shared/util.js';

/** A failed call, carrying the JSON-RPC code. */
export class ApiCallError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly data?: unknown,
  ) {
    super(message);
  }
}

/** A `tool.start`/`tool.end` for a call another tool made (it carries `parentId`). */
export const isNestedToolEvent = (event: ApiEvent): boolean => (event.type === 'tool.start' || event.type === 'tool.end') && typeof event.data['parentId'] === 'string';

export interface ApiCallOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** One discovered instance; a configured socket is authoritative and never falls back to HTTP. */
export class ApiClient {
  private next = 0;

  constructor(private readonly instance: Pick<InstanceRecord, 'socket' | 'http'>) {}

  async call<T = unknown>(method: string, params: Record<string, unknown> = {}, options: ApiCallOptions = {}): Promise<T> {
    const timeoutMs = options.timeoutMs ?? WAIT_MS.default + CLIENT_MARGIN_MS.default;
    const maxMs = WAIT_MS.max + CLIENT_MARGIN_MS.max;
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > maxMs) throw new Error(`API timeoutMs must be from 1 to ${maxMs}`);
    if (options.signal?.aborted) throw new Error('API call aborted');
    const request = { jsonrpc: '2.0', id: ++this.next, method, params };
    const payload = JSON.stringify(request);
    if (Buffer.byteLength(payload, 'utf8') > MAX_FRAME_BYTES) throw new Error('API request exceeds the frame byte limit');
    const response = this.instance.socket
      ? await this.overSocket(payload, { ...options, timeoutMs })
      : await this.overHttp(payload, { ...options, timeoutMs });
    if (!isRecord(response) || response['jsonrpc'] !== '2.0' || response['id'] !== request.id) throw new Error('Invalid API response identity');
    const result = Object.hasOwn(response, 'result');
    const failed = Object.hasOwn(response, 'error');
    if (result === failed) throw new Error('Invalid API response envelope');
    if (failed) {
      const error = response['error'];
      if (!isRecord(error) || !Number.isInteger(error['code']) || typeof error['message'] !== 'string') throw new Error('Invalid API error response');
      const token = this.instance.http?.token;
      const safe = token ? JSON.parse(JSON.stringify(error).replaceAll(token, '[redacted]')) as Record<string, unknown> : error;
      throw new ApiCallError(safe['message'] as string, safe['code'] as number, safe['data']);
    }
    return response['result'] as T;
  }

  private overSocket(payload: string, options: ApiCallOptions & { timeoutMs: number }): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const socket = net.connect(this.instance.socket!);
      let buffer = '';
      let finished = false;
      const finish = (error?: Error, response?: unknown): void => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', abort);
        socket.destroy();
        if (error) reject(error);
        else resolve(response);
      };
      const abort = (): void => finish(new Error('API call aborted'));
      const timer = setTimeout(() => finish(new Error('API call timed out; delivery may have been accepted')), options.timeoutMs);
      socket.setEncoding('utf8');
      socket.once('error', () => finish(new Error('API socket transport failed')));
      socket.once('close', () => finish(new Error('API socket closed before its response')));
      options.signal?.addEventListener('abort', abort, { once: true });
      if (options.signal?.aborted) return abort();
      socket.on('connect', () => socket.write(`${payload}\n`));
      socket.on('data', (chunk: string) => {
        buffer += chunk;
        if (Buffer.byteLength(buffer, 'utf8') > MAX_FRAME_BYTES) return finish(new Error('API response exceeds the frame byte limit'));
        const newline = buffer.indexOf('\n');
        if (newline < 0) return;
        try { finish(undefined, JSON.parse(buffer.slice(0, newline))); }
        catch { finish(new Error('Invalid API response JSON')); }
      });
    });
  }

  private overHttp(payload: string, options: ApiCallOptions & { timeoutMs: number }): Promise<unknown> {
    const target = this.instance.http;
    if (!target) return Promise.reject(new Error('The instance has neither a socket nor an HTTP endpoint'));
    let url: URL;
    try { url = new URL(target.url); } catch { return Promise.reject(new Error('Invalid API HTTP endpoint')); }
    if (url.protocol !== 'http:' || !isLoopbackHostname(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      return Promise.reject(new Error('API HTTP endpoint must be an authenticated loopback origin'));
    }
    url.pathname = '/rpc';
    return new Promise((resolve, reject) => {
      let finished = false;
      let response: http.IncomingMessage | undefined;
      const finish = (error?: Error, value?: unknown): void => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', abort);
        response?.destroy();
        req.destroy();
        if (error) reject(error);
        else resolve(value);
      };
      const abort = (): void => finish(new Error('API call aborted'));
      const req = http.request(url, { method: 'POST', headers: { authorization: `Bearer ${target.token}`, 'content-type': 'application/json' } }, (res) => {
        response = res;
        if (res.statusCode !== 200) return finish(new Error(`API HTTP request failed (${res.statusCode ?? 'unknown status'})`));
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          body += chunk;
          if (Buffer.byteLength(body, 'utf8') > MAX_FRAME_BYTES) finish(new Error('API response exceeds the frame byte limit'));
        });
        res.once('error', () => finish(new Error('API HTTP response failed')));
        res.once('aborted', () => finish(new Error('API HTTP response ended prematurely')));
        res.on('end', () => {
          try { finish(undefined, JSON.parse(body)); }
          catch { finish(new Error('Invalid API response JSON')); }
        });
      });
      const timer = setTimeout(() => finish(new Error('API call timed out; delivery may have been accepted')), options.timeoutMs);
      req.once('error', () => finish(new Error('API HTTP transport failed')));
      options.signal?.addEventListener('abort', abort, { once: true });
      if (options.signal?.aborted) return abort();
      req.end(payload);
    });
  }

  /**
   * Follow events until `signal` aborts. Uses one socket connection: subscribe, then read notifications.
   * `onSubscribed` runs once the subscription is live, with the current sequence and whether replay lost events.
   * `topLevel` drops tool events of nested calls (those with `parentId`), keeping the agent's own calls.
   */
  async watch(
    onEvent: (event: ApiEvent) => void,
    options: { since?: number; types?: string[]; topLevel?: boolean; signal?: AbortSignal; onSubscribed?: (info: { seq: number; gap: boolean }) => void } = {},
  ): Promise<void> {
    if (options.signal?.aborted) return;
    const { socket: file } = this.instance;
    if (!file) throw new Error('watch needs the socket transport (over HTTP, read GET /events)');
    await new Promise<void>((resolve, reject) => {
      const socket = net.connect(file);
      let buffer = '';
      socket.setEncoding('utf8');
      socket.once('error', reject);
      const abort = () => socket.destroy();
      socket.on('close', () => {
        options.signal?.removeEventListener('abort', abort);
        resolve();
      });
      options.signal?.addEventListener('abort', abort, { once: true });
      socket.on('connect', () => {
        const { since, types } = options;
        socket.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'events.subscribe', params: { ...(since !== undefined ? { since } : {}), ...(types ? { types } : {}) } })}\n`);
      });
      socket.on('data', (chunk: string) => {
        buffer += chunk;
        if (buffer.length > MAX_FRAME_BYTES * 4) return void socket.destroy();
        let newline: number;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          try {
            const message = JSON.parse(line) as { id?: unknown; method?: string; params?: ApiEvent; result?: { seq: number; gap: boolean } };
            if (message.method === 'event' && message.params) {
              if (!(options.topLevel && isNestedToolEvent(message.params))) onEvent(message.params);
            }
            else if (message.id === 1 && message.result) options.onSubscribed?.(message.result);
          } catch (error) {
            socket.destroy();
            reject(error);
            return;
          }
        }
      });
    });
  }
}
