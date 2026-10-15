import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ApiCallError, ApiClient } from '../api/client.js';
import { ERR, PROTOCOL_VERSION } from '../api/protocol.js';
import { apiDir, listInstances } from '../api/registry.js';
import { isRecord } from '../shared/util.js';
import type { ExternalBackend, ExternalReply } from './protocol.js';

function canonical(cwd: string): string {
  if (!path.isAbsolute(cwd)) throw new Error('Pi workspace must be an absolute directory');
  try {
    const real = fs.realpathSync(cwd);
    if (!fs.statSync(real).isDirectory()) throw new Error('Not a directory');
    return real;
  } catch { throw new Error('Pi workspace is not an accessible directory'); }
}

export class PiBackend implements ExternalBackend {
  private closed = false;
  private inFlight = false;
  private owned: { key: string; text: string } | undefined;
  private controller: AbortController | undefined;
  private cancelling: Promise<void> | undefined;

  private constructor(private readonly client: ApiClient, readonly sessionId: string, readonly cwd: string) {}

  static async connect(input: { instanceId: string; cwd: string }, env: NodeJS.ProcessEnv = process.env): Promise<PiBackend> {
    const cwd = canonical(input.cwd);
    const records = listInstances(apiDir(env)).filter((entry) => entry.id === input.instanceId);
    if (records.length !== 1) throw new Error('Pi instance is not uniquely discoverable');
    const instance = records[0]!;
    if (instance.protocol !== PROTOCOL_VERSION || canonical(instance.cwd) !== cwd) throw new Error('Pi instance protocol or workspace mismatch');
    if (instance.socket !== undefined) {
      let valid = false;
      try { valid = typeof instance.socket === 'string' && path.isAbsolute(instance.socket) && fs.lstatSync(instance.socket).isSocket(); } catch { /* Refuse a stale or invalid discovery record. */ }
      if (!valid) throw new Error('Pi instance socket is not an existing local socket');
    }
    if (instance.http !== undefined && (!isRecord(instance.http) || typeof instance.http.url !== 'string' || typeof instance.http.token !== 'string' || !instance.http.token)) {
      throw new Error('Pi instance HTTP transport is invalid');
    }
    const client = new ApiClient(instance);
    const initialized = await client.call('initialize', {}, { timeoutMs: 10_000 });
    if (!isRecord(initialized) || initialized['protocolVersion'] !== PROTOCOL_VERSION || !isRecord(initialized['instance'])) throw new Error('Pi initialization protocol mismatch');
    const peer = initialized['instance'];
    if (peer['id'] !== instance.id || peer['pid'] !== instance.pid || typeof peer['cwd'] !== 'string' || canonical(peer['cwd']) !== cwd) throw new Error('Pi initialization identity or workspace mismatch');
    if (!isRecord(initialized['capabilities']) || initialized['capabilities']['wait'] !== true) throw new Error('Pi instance does not support run settlement');
    const status = await client.call('status', {}, { timeoutMs: 10_000 });
    if (!isRecord(status) || typeof status['sessionId'] !== 'string' || !status['sessionId'] || typeof status['cwd'] !== 'string' || canonical(status['cwd']) !== cwd) {
      throw new Error('Pi live session or workspace mismatch');
    }
    return new PiBackend(client, status['sessionId'], cwd);
  }

  private async status(options: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<Record<string, unknown>> {
    if (this.closed) throw new Error('Pi connection is closed');
    const status = await this.client.call('status', {}, { timeoutMs: 10_000, ...options });
    if (!isRecord(status) || status['sessionId'] !== this.sessionId || typeof status['cwd'] !== 'string' || canonical(status['cwd']) !== this.cwd) {
      throw new Error('The connected Pi session or workspace was replaced');
    }
    return status;
  }

  async prompt(text: string, options: { timeoutMs: number; signal?: AbortSignal; key?: string }): Promise<ExternalReply> {
    if (this.closed) throw new Error('Pi connection is closed');
    if (this.cancelling) throw new Error('This Pi connection has a cancellation in progress');
    if (this.inFlight) throw new Error('This Pi connection already has a prompt in flight');
    if (!text.trim()) throw new Error('Pi prompt text must be non-empty');
    if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1000 || options.timeoutMs > 600_000) throw new Error('Pi prompt timeoutMs must be from 1000 to 600000');
    const key = options.key ?? randomUUID();
    if (!key.trim() || key.length > 128) throw new Error('Pi prompt key must have from 1 to 128 characters');
    if (this.owned && (this.owned.key !== key || this.owned.text !== text)) throw new Error('An earlier Pi request may still be running; retry its unchanged key or cancel it');
    if (options.signal?.aborted) throw new Error('Pi prompt aborted');
    this.inFlight = true;
    const controller = new AbortController();
    this.controller = controller;
    const abort = (): void => {
      controller.abort();
      void this.cancel().catch(() => undefined);
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    let attempted = false;
    try {
      const status = await this.status({ timeoutMs: Math.min(options.timeoutMs, 10_000), signal: controller.signal });
      if (!this.owned && (status['state'] !== 'idle' || status['pending'] !== false || status['activeMessageId'] !== undefined)) throw new Error('Pi session is busy; nothing was sent');
      this.owned = { key, text };
      attempted = true;
      const reply = await this.client.call('message.send', {
        text, from: 'Octocode external adapter', expectedSessionId: this.sessionId, requireIdle: true, key, wait: true, timeoutMs: options.timeoutMs,
      }, { timeoutMs: options.timeoutMs + 1000, signal: controller.signal });
      if (!isRecord(reply) || typeof reply['text'] !== 'string' || typeof reply['id'] !== 'string') throw new Error('Invalid Pi run settlement response');
      if (reply['stopReason'] !== undefined && typeof reply['stopReason'] !== 'string') throw new Error('Invalid Pi stop reason');
      this.owned = undefined;
      return { text: reply['text'], ...(typeof reply['stopReason'] === 'string' ? { stopReason: reply['stopReason'] } : {}) };
    } catch (error) {
      const data = error instanceof ApiCallError && isRecord(error.data) ? error.data : {};
      if (error instanceof ApiCallError && error.code !== ERR.timeout && !['accepted', 'uncertain', 'unknown'].includes(String(data['execution']))) this.owned = undefined;
      if (error instanceof Error) {
        const execution = data['execution'] ?? (error instanceof ApiCallError && error.code === ERR.timeout ? 'accepted' : attempted ? 'unknown' : 'not-sent');
        Object.assign(error, { execution });
      }
      throw error;
    } finally {
      options.signal?.removeEventListener('abort', abort);
      this.inFlight = false;
      this.controller = undefined;
    }
  }

  cancel(): Promise<void> {
    if (this.cancelling) return this.cancelling;
    const pending = this.cancelOwned().finally(() => {
      if (this.cancelling === pending) this.cancelling = undefined;
    });
    this.cancelling = pending;
    return pending;
  }

  private async cancelOwned(): Promise<void> {
    const owned = this.owned;
    if (!owned) { this.controller?.abort(); return; }
    const status = await this.status();
    if (status['activeMessageId'] === undefined) {
      this.owned = undefined;
      return;
    }
    await this.client.call('turn.abort', { expectedSessionId: this.sessionId, key: owned.key }, { timeoutMs: 10_000 });
    this.owned = undefined;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    try { await this.cancel(); }
    finally {
      this.closed = true;
      this.controller?.abort();
    }
  }
}
