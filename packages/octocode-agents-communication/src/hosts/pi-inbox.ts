import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { openSync, readSync, closeSync, fstatSync, realpathSync } from 'node:fs';
import { relative, isAbsolute, sep } from 'node:path';
import { registerBoundTools } from './pi-extension.js';
import { checkHostWrite, plainHostPath } from './lease-check.js';
import { bindingArgs, readBinding, runtimeCommand, type PiContext, type PiHost, type PiMessage } from './shared/command.js';
import type { CommandName } from '../runtime/catalog.js';
import type { CommandInputs, CommandResults } from '../runtime/catalog-types.generated.js';
import { heartbeatMs } from '../runtime/timing.js';
import { isObject, type JsonObject } from '../runtime/validation.js';

const exec = promisify(execFile);

/** The session this bridge is bound to; `session` and `database` are filled in as the lifecycle resolves them. */
export interface PiBinding {
  binary: string;
  workspace: string;
  database?: string;
  session?: string;
  vendorSession: string;
}

/** Receipts read so far from one Pi session ledger: the byte offset scanned, the unfinished last line, and the lines skipped as malformed. */
interface LedgerScan {
  identity: string;
  offset: number;
  rest: Buffer;
  receipts: Set<string>;
  header: boolean;
  skipped: number;
}

/** What a host may pass when it embeds the bridge; Pi's environment supplies the same fields for the extension entry. */
export interface PiInboxOptions {
  binary?: string;
  workspace?: string;
  database?: string;
  session?: string;
  tools?: string;
  requireLeases?: boolean;
  completionCheck?: boolean;
  disableCacheWarming?: boolean;
  enabled?: (context: PiContext) => boolean;
  onBinding?: (binding: PiBinding | null) => void;
}

const hosts = new WeakMap<object, { controller: PiInboxController; tools: string | undefined; requireLeases: boolean }>();
const peerType = 'octocode-peer';
const SCAN_CHUNK = 1024 * 1024;
const identityType = 'octocode-identity';
const recoveryType = 'octocode-completion';
/** A whole token count, as a provider reports it. */
const isCount = (value: unknown): value is number => Number.isInteger(value);
const pause = () => new Promise(resolve => setImmediate(resolve));
const parseLedgerLine = (line: string): JsonObject | undefined => {
  try {
    const row: unknown = JSON.parse(line);
    return isObject(row) ? row : undefined;
  } catch { return undefined; }
};
/** A delivered message and the token of its offer: what a ledger receipt and a confirmation name. */
type Receipt = { id: number; dispatchToken: string };
/** The value at `keys` below `value`, or undefined when the path breaks. */
const dig = (value: unknown, ...keys: string[]): unknown => keys.reduce((current, key) => (isObject(current) ? current[key] : undefined), value);
// Idle polls back off from 1 s to 10 s; presence (60 s) stays renewed by each hook call.
const idleMin = 1000, idleMax = 10000;
export interface PiInboxController {
  call<N extends CommandName>(command: N, input?: CommandInputs[N]): Promise<CommandResults[N]>;
  getBinding(): PiBinding | null;
  isBoundContext(ctx: PiContext): boolean;
  drain(allowWake?: boolean): Promise<void> | Promise<Promise<void> | undefined>;
  getGuardCapabilities(): JsonObject;
}

export default function (pi: PiHost): PiInboxController {
  return registerPiInbox(pi, readBinding<PiInboxOptions>());
}

// A host may embed this bridge without changing the process environment.
export function registerPiInbox(pi: PiHost, options: PiInboxOptions = {}): PiInboxController {
  if (options.requireLeases !== undefined && typeof options.requireLeases !== 'boolean') throw new Error('requireLeases must be boolean');
  if (options.tools === 'editing' && options.requireLeases === false) throw new Error('The editing profile requires lease admission; use a messaging profile for non-editing work');
  const requireLeases = options.requireLeases ?? options.tools === 'editing';
  const heartbeatPeriod = heartbeatMs();
  const previous = hosts.get(pi);
  if (previous) {
    if ((options.tools !== undefined && options.tools !== previous.tools)
      || (options.requireLeases !== undefined && options.requireLeases !== previous.requireLeases)) {
      throw new Error('Pi communication is already registered with a different tool profile or lease guard; reload the extension to change configuration');
    }
    return previous.controller;
  }
  const binary = options.binary || fileURLToPath(new URL('../communication.js', import.meta.url));
  let lastHeartbeat = 0, diskCache: LedgerScan | undefined, maintenance: Promise<unknown> | undefined;
  const pending = new Map<string, Receipt>();
  let binding: PiBinding | undefined, context: PiContext | undefined, timer: NodeJS.Timeout | undefined, polling: Promise<void> | undefined, active = false, starting = false, stopped = true, generation = 0, idle = idleMin, deliveries = 0;
  let lifecycle = Promise.resolve(), lifecycleRevision = 0;
  let workCycle = 0, recoveredCycle = -1, completion: Promise<void> | undefined;
  const cancelled = new Error('Pi communication lifecycle superseded');
  const serial = <T>(run: () => Promise<T>): Promise<T> => { const next = lifecycle.then(run); lifecycle = next.then(() => undefined, () => undefined); return next; };
  const invalidate = () => { stopped = true; generation += 1; clearTimeout(timer); };
  // The CLI prints the command's result, which the runtime validated against the catalog's result schema.
  const invoke = async <N extends CommandName>(command: N, args: string[] = [], target: PiBinding | undefined = binding): Promise<CommandResults[N]> => {
    if (!target) throw new Error('Communication is disabled or no session is bound');
    const invocation = runtimeCommand(binary, [...command.split(' '), ...args, ...bindingArgs(target)]);
    const { stdout } = await exec(invocation.command, invocation.args, { timeout: 10000, maxBuffer: 1024 * 1024 });
    const result: unknown = JSON.parse(stdout);
    return result as CommandResults[N];
  };
  const call = <N extends CommandName>(command: N, input: unknown = {}): Promise<CommandResults[N]> => invoke(command, [JSON.stringify(input)]);
  const enabled = () => !options.enabled || (context !== undefined && options.enabled(context));
  const isBoundContext = (ctx: PiContext | undefined): boolean => {
    try {
      if (!binding?.session || ctx?.sessionManager?.getSessionId?.() !== binding.vendorSession) return false;
      const child = relative(binding!.workspace, realpathSync(ctx.cwd));
      return child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child);
    } catch { return false; }
  };
  const currentBinding = (): PiBinding | null => !stopped && enabled() && isBoundContext(context) ? binding ?? null : null;

  const entries = () => {
    if (!context?.sessionManager?.getEntries) throw new Error('Complete Pi session entries are required for durable communication receipts');
    return context.sessionManager.getEntries();
  };
  const detailsOf = (entry: JsonObject): JsonObject => (isObject(entry.details) ? entry.details : {});
  const matches = (entry: JsonObject, type: string, predicate: (details: JsonObject) => boolean) => entry.type === 'custom_message' && entry.customType === type && predicate(detailsOf(entry));
  const receiptSet = (rows: JsonObject[]) => new Set<string>(rows.filter(e => matches(e, peerType, d => d.session === binding!.session && d.database === binding!.database))
    .flatMap(e => detailsOf(e).receipts).flatMap(r => (isObject(r) ? [`${r.id}:${r.dispatchToken}`] : [])));
  // The ledger is append-only JSONL: parse only bytes added since the last scan.
  // A replaced or shrunken file is rescanned from its header.
  const diskReceipts = (): Set<string> | null => {
    const file = context?.sessionManager.getSessionFile?.();
    if (!file) return null;
    let fd: number;
    try { fd = openSync(file, 'r'); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    try {
      const metadata = fstatSync(fd);
      const identity = `${file}:${metadata.dev}:${metadata.ino}`;
      if (diskCache?.identity !== identity || metadata.size < diskCache.offset) diskCache = { identity, offset: 0, rest: Buffer.alloc(0), receipts: new Set(), header: false, skipped: 0 };
      if (metadata.size === diskCache.offset) return diskCache.header ? diskCache.receipts : null;
      // Scan the unread tail in bounded chunks: memory stays at one chunk plus the unfinished last line, however large the ledger.
      while (diskCache.offset < metadata.size) {
        const bytes = Buffer.alloc(Math.min(SCAN_CHUNK, metadata.size - diskCache.offset));
        let read = 0;
        while (read < bytes.length) {
          const count = readSync(fd, bytes, read, bytes.length - read, diskCache.offset + read);
          if (!count) break;
          read += count;
        }
        const chunk = Buffer.concat([diskCache.rest, bytes.subarray(0, read)]);
        const end = chunk.lastIndexOf(0x0a) + 1;
        const lines = chunk.subarray(0, end).toString('utf8').split('\n').filter(Boolean);
        const parsed = lines.map(parseLedgerLine);
        const header = parsed[0];
        if (!diskCache.header && lines.length && (header?.type !== 'session' || header.id !== binding!.vendorSession)) throw new Error('Pi ledger header does not match the bound session');
        // A malformed entry carries no readable receipt: skip it, so one bad line cannot block every later scan. Its message stays unconfirmed and is retried.
        const rows = parsed.filter((row): row is JsonObject => row !== undefined);
        if (rows.length < parsed.length && !diskCache.skipped) console.error(`Communication inbox: skipping malformed Pi ledger lines in ${file}`);
        diskCache.skipped += parsed.length - rows.length;
        for (const receipt of receiptSet(rows)) diskCache.receipts.add(receipt);
        diskCache.header ||= lines.length > 0;
        diskCache.offset += read;
        diskCache.rest = Buffer.from(chunk.subarray(end));
        if (read < bytes.length) break;
      }
      // No complete header yet: receipts are unknown, not absent.
      return diskCache.header ? diskCache.receipts : null;
    } finally { closeSync(fd); }
  };
  const persist = async (message: PiMessage, found: () => boolean, expectedGeneration: number, triggerTurn = false): Promise<boolean> => {
    if (expectedGeneration !== generation || !currentBinding()) return false;
    if (!found()) {
      pi.sendMessage(message, { triggerTurn, deliverAs: 'steer' });
      await Promise.resolve();
      await pause();
    }
    if (expectedGeneration !== generation || !currentBinding()) return false;
    return found();
  };
  const confirmPending = async () => {
    if (!pending.size) return;
    const seen = diskReceipts();
    if (!seen) return; // Fresh Pi sessions may buffer entries until the first assistant message.
    const items = [...pending.values()].filter(r => seen.has(`${r.id}:${r.dispatchToken}`));
    for (let offset = 0; offset < items.length; offset += confirmationLimit) {
      const batch = items.slice(offset, offset + confirmationLimit);
      await call('confirm_delivery', { items: batch });
      for (const item of batch) pending.delete(`${item.id}:${item.dispatchToken}`);
    }
  };
  const recover = async () => {
    const seen = diskReceipts();
    const memory = receiptSet(entries());
    let input: Record<string, unknown> | undefined = { type: 'dispatch.staged', from: binding!.session, current: true,
      where: { transport: `raw:pi:${binding!.vendorSession}` } };
    do {
      const page: CommandResults['fetch'] = await call('fetch', input);
      for (const record of page.items) {
        const { messageId, token } = record.data;
        if (typeof messageId !== 'number' || typeof token !== 'string') throw new Error('Staged dispatch record lacks its message ID or token');
        const item = { message: messageId, token };
        if (seen?.has(`${item.message}:${item.token}`)) {
          await call('confirm_delivery', { items: [{ id: item.message, dispatchToken: item.token }] });
        } else if (memory.has(`${item.message}:${item.token}`)) {
          pending.set(`${item.message}:${item.token}`, { id: item.message, dispatchToken: item.token });
        } else {
          // Complete ledger inspection is safe only after the previous lifecycle owner stopped.
          await call('retry_delivery', { message: item.message, reason: 'Pi lifecycle recovery: complete session ledger has no receipt for this staged attempt' });
        }
      }
      input = page.next?.input;
    } while (input);
  };
  const drain = (allowWake = true): Promise<void> | undefined => {
    if (!currentBinding() || active || polling || (allowWake && context?.isIdle?.() === false)) return polling;
    const expectedGeneration = generation;
    polling = (async () => {
      // Heartbeat and recovery are deterministic host work, never model calls.
      await confirmPending();
      if (expectedGeneration !== generation || !currentBinding()) return;
      const { items = [], context: content, action } = await call('hook', { format: 'json', deferConfirm: true, consumer: `pi:${binding!.vendorSession}`, managed: true });
      if (expectedGeneration !== generation || !currentBinding()) return;
      if (!items.length) {
        if (content) pi.sendMessage({customType:'octocode-directory',content,display:true,
          details:{session:binding!.session,database:binding!.database}}, {triggerTurn:false,deliverAs:'steer'});
        return;
      }
      deliveries += 1;
      if (action === true) workCycle += 1;
      if (typeof content !== 'string' || !content) throw new Error('Communication CLI must provide canonical hook context; rebuild the skill bundle');
      const wanted: Receipt[] = items.map(({ id, dispatchToken }) => {
        if (dispatchToken === undefined) throw new Error('Communication CLI must provide dispatch tokens for a deferred hook; rebuild the skill bundle');
        return { id, dispatchToken };
      });
      const found = () => {
        const seen = receiptSet(entries());
        return wanted.every(r => seen.has(`${r.id}:${r.dispatchToken}`));
      };
      // A false result only means the entry is not visible in the ledger yet (Pi may buffer it); `pending` confirms a receipt only once the ledger holds it.
      await persist({ customType: peerType,
        content,
        display: true, details: { session: binding!.session, database: binding!.database, receipts: wanted } }, found, expectedGeneration,
        allowWake && !starting && !active && context?.isIdle?.() !== false && action === true);
      for (const item of wanted) pending.set(`${item.id}:${item.dispatchToken}`, item);
      await confirmPending();
    })().catch(error => { console.error(`Communication inbox: ${error.message}`); })
      .finally(() => { polling = undefined; });
    return polling;
  };
  if (options.tools !== undefined && typeof options.tools !== 'string') throw new Error('Communication tools must be comma-separated catalog names');
  // Tools must be registered before `registerPiInbox` returns, so the catalog is read synchronously.
  const schema = (args: string[]): unknown => {
    const invocation = runtimeCommand(binary, ['schema', ...args]);
    return JSON.parse(execFileSync(invocation.command, invocation.args, { encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 }));
  };
  const tools = schema(['tools', ...(options.tools === undefined ? [] : ['--tools', options.tools])]) as CommandResults['schema tools'];
  const maxItems = dig(schema(['confirm_delivery']), 'inputSchema', 'properties', 'items', 'maxItems');
  if (typeof maxItems !== 'number' || !Number.isSafeInteger(maxItems) || maxItems < 1) throw new Error('Invalid confirmation batch limit in communication catalog');
  const confirmationLimit: number = maxItems;
  registerBoundTools(pi, { tools, getBinding: currentBinding });
  if (options.completionCheck !== undefined && typeof options.completionCheck !== 'boolean') throw new Error('completionCheck must be boolean');
  if (options.completionCheck) pi.on('input', event => {
    if (currentBinding() && event.source !== 'extension') workCycle += 1;
  });
  if (requireLeases) pi.on('tool_call', async (event, ctx) => {
    // Covers Pi's structured edit/write tools only. Shell/custom tools and later
    // extension rewrites remain outside this admission check, not silently fenced.
    if (!['write', 'edit'].includes(event.toolName)) return;
    const target = currentBinding();
    if (!target || !isBoundContext(ctx)) return {block: true, reason: 'File edit requires an active communication binding and owned lease.'};
    const path = event.input?.path;
    if (!plainHostPath(path) || !plainHostPath(ctx.cwd)) return {block: true, reason: 'File edit requires a plain path without host aliases or parent traversal.'};
    try {
      // The same admission call as the Claude and OpenCode guards.
      const covered = await checkHostWrite(target, {vendorSession: ctx.sessionManager.getSessionId(), cwd: ctx.cwd, path});
      if (currentBinding() !== target || !isBoundContext(ctx) || event.input?.path !== path) return {block: true, reason: 'Session or file path changed during lease validation; retry in the current session.'};
      if (!covered) return {block: true, reason: 'File edit blocked: acquire or renew your own covering lease before retrying.'};
    } catch {
      return {block: true, reason: 'File edit blocked because live lease ownership could not be verified.'};
    }
  });
  if (options.disableCacheWarming) pi.on('cache_warming_decision', () => ({ action: 'stop' }));
  const stop = async () => {
    invalidate();
    await polling;
    await maintenance?.catch(() => {});
    await completion;
    pending.clear();
    diskCache = undefined;
    try { if (binding?.session) await call('leave'); }
    finally { binding = undefined; options.onBinding?.(null); }
  };
  const shutdown = () => { lifecycleRevision += 1; invalidate(); return serial(stop); };
  pi.on('session_start', (_event, ctx) => {
    const revision = ++lifecycleRevision;
    invalidate();
    return serial(async () => {
      await stop();
      if (revision !== lifecycleRevision) return;
      const assertCurrent = () => { if (revision !== lifecycleRevision) throw cancelled; };
      context = ctx;
      active = false;
      starting = false;
      idle = idleMin;
      workCycle = 0;
      recoveredCycle = -1;
      if (options.enabled && !options.enabled(ctx)) return;
      try {
        const vendorSession = ctx.sessionManager.getSessionId();
        if (!vendorSession) throw new Error('Pi session identity is unavailable');
        binding = { binary, workspace: options.workspace || ctx.cwd, database: options.database, vendorSession };
        const info = await invoke('db info');
        assertCurrent();
        binding.database = info.path;
        binding.workspace = info.workspace;
        // Inspect the complete ledger, including compacted branches, before reusing an identity.
        const prior = entries().findLast(e => matches(e, identityType, d => d.vendorSession === vendorSession
          && d.workspace === binding!.workspace && d.database === binding!.database));
        const priorSession = prior === undefined ? undefined : detailsOf(prior).session;
        binding.session = options.session || (typeof priorSession === 'string' ? priorSession : undefined);
        if (binding.session) {
          const identity = await invoke('binding');
          assertCurrent();
          if (!identity || identity.vendor !== 'pi' || (identity.vendorSession && identity.vendorSession !== vendorSession)) throw new Error('Pi binding requires this vendor session identity');
          if (!identity.active) await call('resume', { vendor: 'pi' });
        } else {
          binding.session = (await call('join', { name: `pi-${vendorSession.slice(0, 8)}`, vendor: 'pi', vendorSession })).id;
        }
        assertCurrent();
        await call('attach', { transport: 'raw', vendorSession });
        assertCurrent();
        lastHeartbeat = Date.now();
        stopped = false;
        const identity = { ...binding!, leases: 'managed' };
        await persist({ customType: identityType,
          content: `Communication session: ${binding.session}. Use bound tools for DB-audited coordination. The host maintains presence, renews live owned leases and delivers peer context; acquire before editing, unlock when done, and reacquire expired leases. Action messages wake an idle agent and passive messages wait. Skip manual setup, renewal and inbox polling. Lease guard: ${requireLeases ? 'write/edit checked before execution' : 'not configured'}; shell/custom tools and OS writes are not fenced.`,
          display: false, details: identity }, () => entries().some(e => matches(e, identityType, d => d.session === identity.session && d.database === identity.database && d.leases === 'managed')), generation);
        assertCurrent();
        await recover();
        assertCurrent();
        options.onBinding?.({ ...binding });
        const timerGeneration = generation;
        const tick = async () => {
          if (timerGeneration !== generation) return;
          if (!currentBinding()) { void shutdown().catch(error => console.error(`Communication cleanup: ${error.message}`)); return; }
          try {
            if (Date.now() - lastHeartbeat >= heartbeatPeriod) {
              lastHeartbeat = Date.now();
              maintenance = call('heartbeat', {renewLeases: true});
              try { await maintenance; } finally { maintenance = undefined; }
            }
            if (active) {
              idle = idleMin;
            } else {
              // Each empty poll doubles the wait; a delivery or turn boundary resets it.
              const before = deliveries;
              await drain();
              idle = deliveries === before ? Math.min(idle * 2, idleMax) : idleMin;
            }
          } catch (error) {
            console.error(`Communication lifecycle: ${(error as Error).message}`);
            void shutdown().catch(cleanup => console.error(`Communication cleanup: ${cleanup.message}`));
            return;
          }
          if (timerGeneration !== generation) return;
          timer = setTimeout(tick, idle);
          timer.unref();
        };
        timer = setTimeout(tick, idle);
        timer.unref();
        await drain();
        assertCurrent();
      } catch (error) {
        await stop().catch(cleanup => console.error(`Communication cleanup: ${cleanup.message}`));
        if (error !== cancelled) throw error;
      }
    });
  });
  pi.on('before_agent_start', async (_event, ctx) => {
    if (!enabled() || !isBoundContext(ctx)) { await shutdown(); return; }
    context = ctx;
    starting = true;
    try { await polling; await drain(false); } finally { starting = false; }
  });
  pi.on('agent_start', (_event, ctx) => { if (currentBinding() && isBoundContext(ctx)) active = true; });
  pi.on('agent_end', (_event, ctx) => {
    const target = currentBinding();
    if (!target || !isBoundContext(ctx)) return;
    context = ctx;
    active = false;
    idle = idleMin;
    // Only a completed agent run may authorize recovery. Polling passive mail
    // never calls this check, and recovery itself does not reset the cycle budget.
    const expectedGeneration = generation, cycle = workCycle;
    setImmediate(() => {
      const current = () => expectedGeneration === generation && currentBinding() === target
        && isBoundContext(ctx) && cycle === workCycle && !active && !starting;
      if (!current()) return;
      if (!options.completionCheck || recoveredCycle === cycle || completion) { void drain(); return; }
      completion = (async () => {
        await confirmPending();
        if (!current()) return;
        const result = await call('completion-check', { hook_event_name: 'Stop', stop_hook_active: false,
          session_id: target.vendorSession, cwd: target.workspace });
        if (!current() || result.decision !== 'block' || result.reason === undefined || !result.pending?.length) return;
        recoveredCycle = cycle;
        pi.sendMessage({ customType: recoveryType, content: result.reason, display: true,
          details: { session: target.session, database: target.database, pending: result.pending } },
        { triggerTurn: true, deliverAs: 'followUp' });
      })().catch(error => console.error(`Communication completion: ${error.message}`))
        .finally(() => { completion = undefined; if (current()) void drain(); });
    });
  });
  pi.on('message_end', async (event, ctx) => {
    const message = event.message;
    if (!currentBinding() || !isBoundContext(ctx) || message?.role !== 'assistant' || !message.usage) return;
    const { input, output, cacheRead, cacheWrite } = message.usage;
    // Usage is telemetry: a failed record must not fail the host's event.
    await call('record_usage', { key: `pi-${message.timestamp ?? randomUUID()}`, scope: 'request',
      ...(Number.isInteger(input) ? { inputTokens: input } : {}),
      ...(Number.isInteger(output) ? { outputTokens: output } : {}),
      ...(Number.isInteger(cacheRead) ? { cachedInputTokens: cacheRead } : {}),
      ...(Number.isInteger(cacheWrite) ? { cacheWriteTokens: cacheWrite } : {}),
      ...(isCount(input) && isCount(cacheRead) && isCount(cacheWrite)
        ? { contextTokens: input + cacheRead + cacheWrite } : {}) })
      .catch(error => { console.error(`Communication usage: ${error.message}`); });
  });
  pi.on('session_shutdown', shutdown);
  const controller: PiInboxController = {
    call: <N extends CommandName>(command: N, input?: unknown) => {
      if (!currentBinding()) return Promise.reject(new Error('Communication is disabled or no current session is bound'));
      return call(command, input);
    },
    getBinding: () => { const target = currentBinding(); return target ? { ...target } : null; }, isBoundContext,
    drain: async (allowWake?: boolean) => { await polling; return drain(allowWake); },
    getGuardCapabilities: () => ({vendor: 'pi', configured: requireLeases, bound: Boolean(currentBinding()),
      supportedOperations: ['write', 'edit'], advisory: true,
      uncoveredOperations: ['bash', 'powershell', 'custom tools', 'OS writes', 'later extension rewrites']}),
  };
  hosts.set(pi, {controller, tools: options.tools, requireLeases});
  return controller;
}
