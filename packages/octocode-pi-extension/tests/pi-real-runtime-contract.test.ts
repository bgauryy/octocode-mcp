import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Type } from 'typebox';
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  type ExtensionFactory,
} from '@earendil-works/pi-coding-agent';
import { allowLocalFixtureProcesses } from '../../../test-utils/external-effects-guard.js';
import builtOctocodeExtension, { readPiPhysiology } from '@octocodeai/pi-extension';
import { COMPACTION_CHECKPOINT_TYPE } from '../src/tools/custom-messages.js';
import type { PiContext } from '../src/types.js';
import { execHistoryCli, type AwarenessEventStore, type OutboxEventV1 } from '@octocodeai/octocode-awareness';
import { registerAwarenessEventConsumer } from '../src/tools/awareness-event-consumer.js';
import type { PiInstance } from '../src/types.js';

const PROVIDER = 'octocode-real-runtime-test';
const API = 'octocode-real-runtime-test-api';
const MODEL = 'deterministic-local';

type Block =
  | { type: 'text'; text: string }
  | { type: 'toolCall'; id: string; name: string; arguments: Record<string, unknown> };

interface ScriptedResponse {
  content: Block[];
  stopReason: 'stop' | 'toolUse';
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

class LocalEventStream {
  private readonly queued: unknown[] = [];
  private readonly waiting: Array<(value: IteratorResult<unknown>) => void> = [];
  private readonly completed: Promise<unknown>;
  private resolveCompleted!: (value: unknown) => void;
  private done = false;

  constructor() {
    this.completed = new Promise((resolve) => { this.resolveCompleted = resolve; });
  }

  push(value: unknown): void {
    const event = value as { type?: string; message?: unknown };
    if (event.type === 'done') {
      this.done = true;
      this.resolveCompleted(event.message);
    }
    const waiter = this.waiting.shift();
    if (waiter) waiter({ value, done: false });
    else this.queued.push(value);
  }

  async *[Symbol.asyncIterator](): AsyncIterator<unknown> {
    while (true) {
      if (this.queued.length > 0) {
        yield this.queued.shift();
        continue;
      }
      if (this.done) return;
      const next = await new Promise<IteratorResult<unknown>>((resolve) => this.waiting.push(resolve));
      if (next.done) return;
      yield next.value;
    }
  }

  result(): Promise<unknown> { return this.completed; }
}

function assistantMessage(response: ScriptedResponse): Record<string, unknown> {
  const totalTokens = Object.values(response.usage).reduce((sum, value) => sum + value, 0);
  return {
    role: 'assistant',
    content: response.content,
    api: API,
    provider: PROVIDER,
    model: MODEL,
    usage: {
      ...response.usage,
      totalTokens,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: response.stopReason,
    timestamp: Date.now(),
  };
}

function scriptedStream(response: ScriptedResponse): LocalEventStream {
  const stream = new LocalEventStream();
  queueMicrotask(() => {
    const final = assistantMessage(response);
    const partial = { ...final, content: [], stopReason: 'pending' };
    stream.push({ type: 'start', partial });
    response.content.forEach((block, contentIndex) => {
      const prefix = block.type === 'toolCall' ? 'toolcall' : 'text';
      stream.push({ type: `${prefix}_start`, contentIndex, partial });
      if (block.type === 'text') {
        stream.push({ type: 'text_delta', contentIndex, delta: block.text, partial });
        stream.push({ type: 'text_end', contentIndex, content: block.text, partial });
      } else {
        stream.push({ type: 'toolcall_delta', contentIndex, delta: JSON.stringify(block.arguments), partial });
        stream.push({ type: 'toolcall_end', contentIndex, toolCall: block, partial });
      }
    });
    stream.push({ type: 'done', reason: response.stopReason, message: final });
  });
  return stream;
}

function response(content: Block[], stopReason: ScriptedResponse['stopReason'], input = 32): ScriptedResponse {
  return { content, stopReason, usage: { input, output: 8, cacheRead: 0, cacheWrite: 0 } };
}

function retainPhysiologySensors(value: unknown): PiContext | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = value as { sessionManager?: unknown; getContextUsage?: unknown };
  if (typeof candidate.sessionManager !== 'object' || candidate.sessionManager === null) return undefined;
  const getContextUsage = typeof candidate.getContextUsage === 'function'
    ? candidate.getContextUsage.bind(value) as PiContext['getContextUsage']
    : undefined;
  return {
    sessionManager: candidate.sessionManager as PiContext['sessionManager'],
    ...(getContextUsage ? { getContextUsage } : {}),
  };
}

const temporaryRoots: string[] = [];
let restoreProcesses: (() => void) | undefined;

afterEach(() => {
  restoreProcesses?.();
  restoreProcesses = undefined;
  vi.unstubAllEnvs();
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe.sequential('real Pi runtime contract', () => {
  it('starts one real host turn for two durable actionable peer messages without copying their bodies', async () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'octocode-real-pi-wake-')));
    temporaryRoots.push(root);
    const workspace = path.join(root, 'workspace');
    const agentDir = path.join(root, 'agent');
    fs.mkdirSync(workspace); fs.mkdirSync(agentDir);
    let cursor = 0;
    const events: OutboxEventV1[] = [1, 2].map(sequence => ({
      version: 1, sequence, eventId: `wake-${sequence}`, type: 'peer.message', workspace,
      actor: { kind: 'agent', id: 'peer' }, provenance: { source: 'peer', trust: 'attributed-data' },
      createdAt: new Date().toISOString(),
      payload: { messageId: `message-${sequence}`, fromAgentId: 'peer', toAgentId: 'native-recipient', signalKind: 'blocker', text: `exact-challenge-${sequence}` },
    }));
    const store: AwarenessEventStore = {
      listEvents: ({ limit }) => events.filter(event => event.sequence > cursor).slice(0, limit),
      getConsumerCursor: () => cursor, markMessageRead() {}, close() {},
      acknowledgeEvent: ({ eventId, decision }) => { cursor = events.find(event => event.eventId === eventId)!.sequence; return { sequence: cursor, decision, duplicate: false }; },
    };
    const contexts: string[] = [];
    const extension: ExtensionFactory = pi => {
      registerAwarenessEventConsumer(pi as unknown as PiInstance, { openStore: () => store, resolveExpectedAgentId: () => 'native-recipient', canWake: () => true });
      pi.registerProvider(PROVIDER, {
        name: 'Local wake audit', api: API, baseUrl: 'http://127.0.0.1:0', apiKey: 'local-fixture',
        models: [{ id: MODEL, name: 'Local wake audit', api: API, reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 8192, maxTokens: 1024 }],
        streamSimple: (_model, context) => { contexts.push(JSON.stringify(context)); return scriptedStream(response([{ type: 'text', text: 'completed' }], 'stop')) as never; },
      });
    };
    const settings = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
    const loader = new DefaultResourceLoader({ cwd: workspace, agentDir, settingsManager: settings, extensionFactories: [{ name: 'wake-audit', factory: extension }], noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true });
    await loader.reload();
    const { session } = await createAgentSession({ cwd: workspace, agentDir, tools: [], resourceLoader: loader, sessionManager: SessionManager.create(workspace, path.join(root, 'sessions')), settingsManager: settings });
    try {
      await session.bindExtensions({ mode: 'json', shutdownHandler() {} });
      await session.setModel(session.modelRuntime.getModel(PROVIDER, MODEL)!);
      await session.prompt('Initial authorized task.', { expandPromptTemplates: false });
      for (let attempt = 0; attempt < 20 && contexts.length < 2; attempt++) await new Promise<void>(resolve => setImmediate(resolve));
      await session.waitForIdle();
      expect(contexts).toHaveLength(2);
      expect(contexts[1]).toContain('exact-challenge-1');
      expect(contexts[1]).toContain('exact-challenge-2');
      expect(cursor).toBe(2);
      const entries = session.sessionManager.getEntries();
      const wake = entries.filter(entry => JSON.stringify(entry).includes('octocode-peer-wake'));
      expect(wake).toHaveLength(1);
      expect(JSON.stringify(wake)).not.toContain('exact-challenge');
    } finally { session.dispose(); await settings.flush(); }
  }, 30_000);
  it('delivers Octocode skills, Awareness CLI bindings, context measurements and compaction receipts', async () => {
    restoreProcesses = allowLocalFixtureProcesses();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'octocode-real-pi-'));
    temporaryRoots.push(root);
    const workspace = path.join(root, 'workspace');
    const octocodeHome = path.join(root, 'octocode-home');
    const agentDir = path.join(root, 'agent');
    const sessionsDir = path.join(root, 'sessions');
    fs.mkdirSync(workspace);
    fs.mkdirSync(agentDir);
    // Local file history captures only under the full hooks profile; the default
    // workspace profile is 'coordination'.
    fs.mkdirSync(path.join(workspace, '.octocode'));
    fs.writeFileSync(
      path.join(workspace, '.octocode', 'awareness.json'),
      `${JSON.stringify({ version: 1, storage: { repository: 'global', memory: 'global' }, hooks: { profile: 'full' } }, null, 2)}\n`,
    );

    vi.stubEnv('OCTOCODE_HOME', octocodeHome);
    vi.stubEnv('OCTOCODE_STORAGE_MODE', 'persistent');
    vi.stubEnv('OCTOCODE_AGENT_ID', 'pi:real-runtime-test');

    const lifecycle: string[] = [];
    const usages: Array<{ phase: string; tokens: number | null; contextWindow: number }> = [];
    const providerPrompts: string[] = [];
    const providerContexts: string[] = [];
    let activeContext: PiContext | undefined;
    const scripted = [
      response([{
        type: 'toolCall', id: 'skill-load', name: 'skill', arguments: {
          queries: [{ reasoning: 'Load the bundled Awareness operating contract.', type: 'load', action: 'load', name: 'octocode-awareness', reason: 'Verify the real Pi agent can load its bundled coordination skill.' }],
        },
      }], 'toolUse'),
      response([{
        type: 'toolCall', id: 'awareness-schema', name: 'bash', arguments: {
          queries: [{
            reasoning: 'Inspect the installed Awareness CLI through Pi-provided bindings.',
            command: '"$OCTOCODE_NODE" "$OCTOCODE_AWARENESS_CLI" --db "$OCTOCODE_AWARENESS_DB" schema command verify audit --compact',
            timeout: 10,
          }],
        },
      }], 'toolUse'),
      response([{
        type: 'toolCall', id: 'business-failure', name: 'businessProbe', arguments: { value: 'fail' },
      }], 'toolUse'),
      response([{
        type: 'toolCall', id: 'native-file-write', name: 'file', arguments: {
          queries: [{ reasoning: 'Exercise canonical local history.', type: 'write', path: 'history-fixture.txt', content: 'captured by real Pi SDK\n' }],
        },
      }], 'toolUse'),
      response([{ type: 'text', text: 'runtime bindings verified' }], 'stop', 3_000),
      response([{ type: 'text', text: 'advisory observed' }], 'stop', 64),
    ];

    const observer: ExtensionFactory = async (pi) => {
      pi.registerProvider(PROVIDER, {
        name: 'Deterministic local runtime test', api: API, baseUrl: 'http://127.0.0.1:0', apiKey: 'local-fixture',
        models: [{ id: MODEL, name: 'Deterministic local runtime test', api: API, reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 8_192, maxTokens: 1_024 }],
        streamSimple: (_model, context) => {
          const systemPrompt = (context as { systemPrompt?: unknown }).systemPrompt;
          providerPrompts.push(typeof systemPrompt === 'string' ? systemPrompt : '');
          providerContexts.push(JSON.stringify(context));
          return scriptedStream(scripted.shift() ?? response([{ type: 'text', text: 'done' }], 'stop')) as never;
        },
      });
      pi.registerTool({
        name: 'businessProbe',
        label: 'Business probe',
        description: 'Fails deterministically to exercise real Pi terminal telemetry.',
        parameters: Type.Object({ value: Type.String() }),
        execute: async () => { throw new Error('deterministic business failure'); },
      });
      pi.on('before_agent_start', (_event, ctx) => {
        lifecycle.push('before_agent_start');
        const usage = ctx.getContextUsage?.();
        if (usage) usages.push({ phase: 'before', tokens: usage.tokens, contextWindow: usage.contextWindow });
      });
      pi.on('turn_start', (_event, ctx) => {
        lifecycle.push('turn_start');
        const usage = ctx.getContextUsage?.();
        if (usage) usages.push({ phase: 'turn_start', tokens: usage.tokens, contextWindow: usage.contextWindow });
      });
      pi.on('turn_end', (_event, ctx) => {
        lifecycle.push('turn_end');
        activeContext = retainPhysiologySensors(ctx);
        const usage = ctx.getContextUsage?.();
        if (usage) usages.push({ phase: 'turn_end', tokens: usage.tokens, contextWindow: usage.contextWindow });
      });
      pi.on('session_before_compact', (event) => {
        lifecycle.push('session_before_compact');
        return { compaction: {
          summary: 'deterministic local compaction summary',
          firstKeptEntryId: event.preparation.firstKeptEntryId,
          tokensBefore: event.preparation.tokensBefore,
          details: { source: 'real-runtime-test' },
        } };
      });
      pi.on('session_compact', (_event, ctx) => {
        lifecycle.push('session_compact');
        activeContext = retainPhysiologySensors(ctx);
        const usage = ctx.getContextUsage?.();
        if (usage) usages.push({ phase: 'compacted', tokens: usage.tokens, contextWindow: usage.contextWindow });
      });
    };

    const settings = SettingsManager.inMemory({ compaction: { enabled: true, reserveTokens: 1_639, keepRecentTokens: 1 }, retry: { enabled: false } });
    const loader = new DefaultResourceLoader({
      cwd: workspace,
      agentDir,
      settingsManager: settings,
      extensionFactories: [
        { name: 'octocode-product', factory: builtOctocodeExtension as never },
        { name: 'runtime-observer', factory: observer },
      ],
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
    });
    await loader.reload();
    const created = await createAgentSession({
      cwd: workspace,
      agentDir,
      tools: ['skill', 'bash', 'businessProbe', 'file'],
      resourceLoader: loader,
      sessionManager: SessionManager.create(workspace, sessionsDir),
      settingsManager: settings,
    });

    try {
      await created.session.bindExtensions({ mode: 'json', shutdownHandler: () => undefined });
      const model = created.session.modelRuntime.getModel(PROVIDER, MODEL);
      expect(model).toBeDefined();
      await created.session.setModel(model!);
      await created.session.prompt('Verify the installed Awareness skill and CLI bindings.', { expandPromptTemplates: false });
      await created.session.waitForIdle();

      expect(providerPrompts[0]).toContain('<awareness_runtime>');
      expect(providerPrompts[0]).toContain('octocode-awareness');
      expect(providerPrompts[0]).toContain(path.resolve(workspace));
      expect(providerPrompts[0]).toContain(octocodeHome);
      const toolResultsBeforeCompact = JSON.stringify(created.session.sessionManager.getEntries());
      expect(toolResultsBeforeCompact).toContain('# Awareness');
      expect(toolResultsBeforeCompact).toContain('verify audit');
      expect(lifecycle).toEqual(expect.arrayContaining(['before_agent_start', 'turn_start', 'turn_end']));
      expect(usages).toContainEqual(expect.objectContaining({ phase: 'turn_end', contextWindow: 8_192 }));
      expect(usages.some((usage) => usage.phase === 'turn_end' && (usage.tokens ?? 0) >= 3_000)).toBe(true);

      expect(activeContext).toBeDefined();
      const measuredUsage = [...usages].reverse().find((usage) => usage.phase === 'turn_end')!;
      const physiologyBeforeCompact = readPiPhysiology(activeContext!);
      expect(physiologyBeforeCompact?.session).toEqual(expect.objectContaining({ owner: 'pi', session_id: expect.any(String), generation: 1 }));
      expect(physiologyBeforeCompact?.context).toEqual(expect.objectContaining({
        measurement: 'host_reported',
        current_tokens: measuredUsage.tokens,
        input_limit_tokens: measuredUsage.contextWindow,
      }));
      expect(physiologyBeforeCompact?.tools).toEqual({ window: 32, observed: 3, failed: 1, cancelled: 0, blocked: 0 });
      expect(fs.readFileSync(path.join(workspace, 'history-fixture.txt'), 'utf8')).toBe('captured by real Pi SDK\n');
      const history = await execHistoryCli(['history', 'timeline', '--workspace', workspace, '--limit', '10', '--compact']);
      expect(history.code).toBe(0);
      const timeline = JSON.parse(history.stdout) as { operations: Array<Record<string, unknown>> };
      const operation = timeline.operations.find(candidate => candidate.host === 'pi');
      expect(operation).toEqual(expect.objectContaining({
        status: 'complete', outcome: 'success', file_count: 1,
        before_commit_oid: expect.any(String), after_commit_oid: expect.any(String),
      }));
      const operationId = String(operation?.operation_id);
      const before = await execHistoryCli(['history', 'read', '--workspace', workspace, '--operation-id', operationId, '--file', 'history-fixture.txt', '--side', 'before', '--compact']);
      const after = await execHistoryCli(['history', 'read', '--workspace', workspace, '--operation-id', operationId, '--file', 'history-fixture.txt', '--side', 'after', '--compact']);
      expect(JSON.parse(before.stdout)).toEqual(expect.objectContaining({ ok: true, status: 'missing' }));
      const afterPayload = JSON.parse(after.stdout) as { status: string; encoding: string; content: string };
      expect(afterPayload).toEqual(expect.objectContaining({ status: 'captured', encoding: 'base64' }));
      expect(Buffer.from(afterPayload.content, 'base64').toString('utf8')).toBe('captured by real Pi SDK\n');

      await created.session.prompt('Continue after the observed business-tool failure.', { expandPromptTemplates: false });
      await created.session.waitForIdle();
      expect(providerContexts.at(-1)).toContain('inspect_recent_tool_failures');

      await created.session.compact('real runtime contract');
      expect(lifecycle).toEqual(expect.arrayContaining(['session_before_compact', 'session_compact']));
      expect(usages).toContainEqual({ phase: 'compacted', tokens: null, contextWindow: 8_192 });
      const physiologyAfterCompact = readPiPhysiology(activeContext!);
      expect(physiologyAfterCompact?.context).toBeUndefined();
      expect(physiologyAfterCompact).toEqual(expect.objectContaining({
        tools: { window: 32, observed: 3, failed: 1, cancelled: 0, blocked: 0 },
        compaction: { owner: 'pi', committed: 1, failed: 0 },
      }));

      const entries = created.session.sessionManager.getEntries();
      const checkpointEntries = entries.filter((entry) => JSON.stringify(entry).includes(COMPACTION_CHECKPOINT_TYPE));
      expect(checkpointEntries).toHaveLength(1);
      expect(JSON.stringify(checkpointEntries[0])).toContain('tokensBefore');

      const homeSnapshot = JSON.stringify(fs.readdirSync(octocodeHome, { recursive: true }));
      expect(homeSnapshot).toContain('compaction');
      expect(homeSnapshot).toContain('.md');
    } finally {
      created.session.dispose();
      await settings.flush();
    }

    expect(fs.existsSync(path.join(root, 'sessions'))).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
    temporaryRoots.splice(temporaryRoots.indexOf(root), 1);
    expect(fs.existsSync(root)).toBe(false);
  }, 30_000);
});
