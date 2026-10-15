import { randomUUID } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { EXTERNAL_PROMPT_DEFAULT_MS } from '../api/protocol.js';
import { apiDir, listInstances } from '../api/registry.js';
import type { MessageEnvelope } from '../shared/messages.js';
import { errorMessage } from '../shared/util.js';
import { AcpBackend, type AcpPermission } from './acp.js';
import { PiBackend } from './pi.js';
import { parseExternalParams, type ExternalBackend, type ExternalInfo, type ExternalParams } from './protocol.js';

export interface ExternalPolicy {
  authorize(input: ExternalParams, ctx: ExtensionContext, signal: AbortSignal): Promise<void>;
  beforeSend(message: MessageEnvelope, ctx: ExtensionContext, signal?: AbortSignal): Promise<void>;
  afterReceive(message: MessageEnvelope, ctx: ExtensionContext): Promise<void>;
  permission(ctx: ExtensionContext): AcpPermission;
  sender(ctx: ExtensionContext): string;
}

interface Connection {
  info: ExternalInfo;
  controller: AbortController;
  backend?: ExternalBackend;
  pending?: AbortController;
}

export interface ExternalFactories {
  acp: typeof AcpBackend.connect;
  pi: typeof PiBackend.connect;
}

export class ExternalAgents {
  private readonly connections = new Map<string, Connection>();
  private lifetime = new AbortController();

  constructor(private readonly policy: ExternalPolicy, private readonly factories: ExternalFactories = { acp: AcpBackend.connect, pi: PiBackend.connect }) {}

  get running(): number { return [...this.connections.values()].filter((entry) => entry.info.busy).length; }

  async call(value: unknown, ctx: ExtensionContext, callerSignal?: AbortSignal): Promise<unknown> {
    const input = parseExternalParams(value);
    const signal = AbortSignal.any([this.lifetime.signal, ...(ctx.signal ? [ctx.signal] : []), ...(callerSignal ? [callerSignal] : [])]);
    signal.throwIfAborted();
    if (input.action === 'list') {
      return {
        connections: [...this.connections.values()].map((entry) => ({ ...entry.info })),
        instances: listInstances(apiDir()).map(({ id, pid, cwd, protocol, session }) => ({ id, pid, cwd, protocol, session })),
      };
    }
    if (input.action === 'connect') return this.connect(input, ctx, signal);
    const entry = this.connections.get(input.id!);
    if (!entry) throw new Error(`Unknown external connection ${input.id}. Use list, then connect explicitly.`);
    if (input.action === 'disconnect') {
      this.connections.delete(input.id!);
      entry.controller.abort(new Error('External connection disconnected'));
      await entry.backend?.close();
      return { disconnected: input.id };
    }
    if (input.action === 'cancel') {
      entry.pending?.abort(new Error('External prompt cancelled'));
      await entry.backend?.cancel();
      return { cancelled: input.id };
    }
    if (!entry.backend) throw new Error('External connection is still starting.');
    if (entry.info.busy) throw new Error('External connection already has a prompt in flight.');
    entry.info.busy = true;
    const pending = new AbortController();
    entry.pending = pending;
    try {
      const promptSignal = AbortSignal.any([signal, entry.controller.signal, pending.signal]);
      const id = randomUUID();
      const from = this.policy.sender(ctx);
      await this.policy.beforeSend({ channel: 'external', direction: 'outbound', from, to: entry.info.id, text: input.text!, id }, ctx, promptSignal);
      promptSignal.throwIfAborted();
      await this.policy.authorize({ ...input, cwd: entry.info.cwd, transport: entry.info.transport, vendor: entry.info.vendor, sessionId: entry.info.sessionId }, ctx, promptSignal);
      promptSignal.throwIfAborted();
      let reply;
      try { reply = await entry.backend.prompt(input.text!, { timeoutMs: input.timeoutMs ?? EXTERNAL_PROMPT_DEFAULT_MS, signal: promptSignal, key: id }); }
      catch (error) {
        if (entry.info.transport === 'acp' && this.connections.get(entry.info.id) === entry) {
          this.connections.delete(entry.info.id);
          await entry.backend.close();
        }
        throw error;
      }
      let receiveHookError: string | undefined;
      try { await this.policy.afterReceive({ channel: 'external', direction: 'inbound', from: entry.info.id, to: from, text: reply.text, id: randomUUID(), replyTo: id }, ctx); }
      catch (error) { receiveHookError = errorMessage(error); }
      return { ...entry.info, busy: false, messageId: id, reply, ...(receiveHookError ? { receiveHookError } : {}) };
    } finally {
      entry.info.busy = false;
      if (entry.pending === pending) entry.pending = undefined;
    }
  }

  private async connect(input: ExternalParams, ctx: ExtensionContext, signal: AbortSignal): Promise<ExternalInfo> {
    const id = input.id ?? randomUUID();
    if (this.connections.has(id)) throw new Error(`External connection ${id} already exists.`);
    const cwd = realpathSync(path.resolve(ctx.cwd, input.cwd ?? '.'));
    if (!statSync(cwd).isDirectory()) throw new Error('External cwd must be a directory.');
    const entry: Connection = {
      info: { id, transport: input.transport!, vendor: input.transport === 'pi' ? 'pi' : input.vendor!, cwd, sessionId: '', busy: true },
      controller: new AbortController(),
    };
    this.connections.set(id, entry);
    const startup = AbortSignal.any([signal, entry.controller.signal]);
    try {
      await this.policy.authorize({ ...input, cwd }, ctx, startup);
      startup.throwIfAborted();
      const backend = input.transport === 'pi'
        ? await this.factories.pi({ instanceId: input.instanceId!, cwd })
        : await this.factories.acp({
          command: input.command!, args: input.args, vendor: input.vendor!, cwd, sessionId: input.sessionId, timeoutMs: input.timeoutMs,
        }, this.policy.permission(ctx), startup);
      entry.backend = backend;
      startup.throwIfAborted();
      entry.info.sessionId = backend.sessionId;
      entry.info.busy = false;
      return { ...entry.info };
    } catch (error) {
      if (this.connections.get(id) === entry) this.connections.delete(id);
      await entry.backend?.close();
      throw error;
    }
  }

  async reset(): Promise<void> {
    this.lifetime.abort(new Error('Pi session or permission scope changed'));
    this.lifetime = new AbortController();
    const entries = [...this.connections.values()];
    this.connections.clear();
    for (const entry of entries) entry.controller.abort(new Error('External connection closed'));
    await Promise.allSettled(entries.map((entry) => entry.backend?.close()));
  }
}
