import { shortPath } from '../shared/format.js';
import { isLoopbackHostname } from '../shared/net.js';
import { cutText, errorMessage, withTimeout } from '../shared/util.js';
import { abortError } from './abort.js';
import { ConsoleLog } from './console-log.js';
import { browserWebSocketUrl, devtoolsFetch, type OwnChrome } from './launch.js';
import type { PageNetworkPolicy } from './policy.js';
import { isHttpUrl } from '../web/guard.js';

/**
 * Minimal Chrome DevTools Protocol client: one browser-level WebSocket (`CdpConnection`) with a session per page
 * (`CdpPage`), the `BrowserSession` state those pages share (console, origins, downloads) and the browser's targets. Opening a
 * session is `session.ts`; checking its requests is `page-network.ts`.
 */
/**
 * Refuses a DevTools WebSocket URL that is not the local browser's own, in every mode: a browser on `port` (even an
 * attached one the user started) answers `/json/list` with a `webSocketDebuggerUrl`, and a hostile or confused answer
 * must not point the session at another host, port or service. The scheme is `ws:`, the host this machine, the port
 * the one asked for and the path under `/devtools/`.
 */
export function checkDevtoolsUrl(raw: string, port: number): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Refused a DevTools URL that is not a URL: ${raw}`);
  }
  const problem =
    url.protocol !== 'ws:' ? `scheme ${url.protocol} is not ws:`
    : !isLoopbackHostname(url.hostname) ? `host ${url.hostname} is not this machine`
    : Number(url.port) !== port ? `port ${url.port || '(default)'} is not ${port}`
    : !url.pathname.startsWith('/devtools/') ? `path ${url.pathname} is not under /devtools/`
    : undefined;
  if (problem) throw new Error(`Refused the DevTools URL ${url.protocol}//${url.host}${url.pathname}: ${problem}.`);
}

interface Reply {
  id?: number;
  result?: unknown;
  error?: { message: string };
  method?: string;
  params?: Record<string, unknown>;
  sessionId?: string;
}

interface Pending {
  /** The session the command was sent on (none: the browser itself). Only a reply carrying the same one settles it. */
  sessionId: string | undefined;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

type CdpListener = (method: string, params: Record<string, unknown>) => void;

/** What the browser says about a target it attached the session to. */
interface TargetInfo {
  targetId: string;
  /** `page`, `iframe`, `worker`, `service_worker`, `shared_worker`, `other`, … */
  type: string;
  url?: string;
  /** The page that opened this one (`window.open`, a link to a new window). */
  openerId?: string;
}

/** A target the browser attached the session to by itself (see `Target.setAutoAttach`): a popup, a frame in another process, a worker. */
export interface AttachedTarget {
  page: CdpPage;
  info: TargetInfo;
  /** The target is held before it runs anything until `Runtime.runIfWaitingForDebugger`. */
  waiting: boolean;
  /** The session the browser announced the attach on: the one of the page that owns a worker or frame. None: the browser itself (a popup, a service worker). */
  parentSessionId?: string;
}

/** What `Target.setAutoAttach` asks for: every related target is attached, held before its first instruction, and gets its own flat session. */
const AUTO_ATTACH = { autoAttach: true, waitForDebuggerOnStart: true, flatten: true };

/**
 * One browser-level DevTools WebSocket, shared by every page the session drives. Commands carry a `sessionId` (flat
 * mode: `Target.attachToTarget { flatten: true }`) and so do the events and replies that come back, which is how each
 * target's traffic reaches only its own `CdpPage`. The socket closes when the session ends, not when a page does.
 */
export class CdpConnection {
  readonly #socket: WebSocket;
  readonly #port: number;
  readonly #pending = new Map<number, Pending>();
  /** The attached sessions and their event listeners. */
  readonly #sessions = new Map<string, Set<CdpListener>>();
  /** Targets this client is attaching to itself, so the browser's `Target.attachedToTarget` for them is not taken for an auto-attach. */
  readonly #attaching = new Set<string>();
  readonly #attachedListeners = new Set<(attached: AttachedTarget) => void>();
  readonly #endedListeners = new Set<(sessionId: string) => void>();
  #nextId = 1;

  private constructor(socket: WebSocket, port: number) {
    this.#socket = socket;
    this.#port = port;
    socket.addEventListener('message', (event) => this.#receive(String(event.data)));
    socket.addEventListener('close', () => {
      const ended = [...this.#sessions.keys()];
      this.#sessions.clear();
      this.#attachedListeners.clear();
      this.#rejectPending(() => true);
      for (const sessionId of ended) this.#ended(sessionId);
      this.#endedListeners.clear();
    });
  }

  /** Connects to the browser-level DevTools socket of the browser on `port`; a URL that is not that browser's own is refused first (see `checkDevtoolsUrl`). */
  static async connect(port: number): Promise<CdpConnection> {
    const url = await browserWebSocketUrl(port, 2_000);
    checkDevtoolsUrl(url, port);
    const socket = new WebSocket(url);
    try {
      await withTimeout(
        new Promise<void>((resolve, reject) => {
          socket.addEventListener('open', () => resolve(), { once: true });
          socket.addEventListener('error', () => reject(new Error(`Cannot connect to ${url}`)), { once: true });
        }),
        10_000,
        'Browser connect',
      );
    } catch (error) {
      // A timed-out socket would otherwise keep connecting in the background.
      socket.close();
      throw error;
    }
    return new CdpConnection(socket, port);
  }

  get open(): boolean {
    return this.#socket.readyState === WebSocket.OPEN;
  }

  #receive(data: string): void {
    // A throwing EventTarget listener surfaces as an uncaught exception in Pi's process.
    let message: Reply;
    try {
      message = JSON.parse(data) as Reply;
    } catch {
      return;
    }
    if (message.id !== undefined) {
      const pending = this.#pending.get(message.id);
      if (!pending || pending.sessionId !== message.sessionId) return;
      this.#pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    } else if (message.method === 'Target.attachedToTarget') {
      this.#autoAttached(message.params ?? {}, message.sessionId);
    } else if (message.method === 'Target.detachedFromTarget') {
      // A worker or frame that goes away is announced on its parent's session: only the session it names ends.
      if (typeof message.params?.['sessionId'] === 'string') this.#forget(message.params['sessionId']);
    } else if (message.method && message.sessionId !== undefined) {
      for (const listener of this.#sessions.get(message.sessionId) ?? []) {
        try {
          listener(message.method, message.params ?? {});
        } catch {
          // One bad event must not break the session.
        }
      }
    }
  }

  /**
   * The browser attached a session by itself (any parent session, or the browser's own). The session is routable at once, so
   * the reply to the first command on it is never lost. The attach this client asked for (`attach`) is announced the same
   * way and is not an auto-attach, unless the browser holds that target for the debugger.
   */
  #autoAttached(params: Record<string, unknown>, parentSessionId: string | undefined): void {
    const sessionId = params['sessionId'];
    const info = params['targetInfo'] as Partial<TargetInfo> | undefined;
    if (typeof sessionId !== 'string' || typeof info?.targetId !== 'string' || typeof info.type !== 'string') return;
    const waiting = params['waitingForDebugger'] === true;
    const known = this.#sessions.has(sessionId);
    if (!known) this.#sessions.set(sessionId, new Set());
    if (!waiting && (known || this.#attaching.has(info.targetId))) return;
    const attached: AttachedTarget = { page: new CdpPage(this, sessionId), info: info as TargetInfo, waiting, ...(parentSessionId === undefined ? {} : { parentSessionId }) };
    for (const listener of this.#attachedListeners) {
      try {
        listener(attached);
      } catch {
        // One bad listener must not break the connection.
      }
    }
  }

  #rejectPending(match: (pending: Pending) => boolean): void {
    for (const [id, pending] of this.#pending) {
      if (!match(pending)) continue;
      this.#pending.delete(id);
      pending.reject(new Error('Browser connection closed'));
    }
  }

  /** Drops a session whose target went away (or that was detached): what it still waits on is rejected. */
  #forget(sessionId: string): boolean {
    if (!this.#sessions.delete(sessionId)) return false;
    this.#rejectPending((pending) => pending.sessionId === sessionId);
    this.#ended(sessionId);
    return true;
  }

  #ended(sessionId: string): void {
    for (const listener of this.#endedListeners) {
      try {
        listener(sessionId);
      } catch {
        // One bad listener must not break the connection.
      }
    }
  }

  /** Calls `listener` with the id of each session that ends (its target closed, it was detached, or the socket closed). */
  onEnded(listener: (sessionId: string) => void): () => void {
    this.#endedListeners.add(listener);
    return () => this.#endedListeners.delete(listener);
  }

  /** Send a CDP command to the browser, or, with `sessionId`, to that attached target; `signal` rejects the wait (the command may still run). */
  send<T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}, signal?: AbortSignal, sessionId?: string): Promise<T> {
    const id = this.#nextId++;
    if (!this.open || (sessionId !== undefined && !this.#sessions.has(sessionId))) return Promise.reject(new Error('Browser connection closed'));
    if (signal?.aborted) return Promise.reject(abortError(signal));
    let onAbort: (() => void) | undefined;
    const result = new Promise<T>((resolve, reject) => {
      this.#pending.set(id, { sessionId, resolve: resolve as (value: unknown) => void, reject });
      if (signal) signal.addEventListener('abort', (onAbort = () => reject(abortError(signal))), { once: true });
    });
    try {
      this.#socket.send(JSON.stringify({ id, method, params, ...(sessionId === undefined ? {} : { sessionId }) }));
    } catch (error) {
      // The socket cannot take it (it closed between the check and now): nothing will answer, so fail now, not after 30 s.
      this.#pending.get(id)?.reject(new Error(`Could not send ${method}: ${errorMessage(error)}`));
    }
    return withTimeout(result, 30_000, method).finally(() => {
      this.#pending.delete(id);
      if (onAbort) signal?.removeEventListener('abort', onAbort);
    });
  }

  /**
   * A session on the page `target` (a target of this browser, listed by `/json/list`): the URL the browser gave for it is
   * checked first (see `checkDevtoolsUrl`), though the session itself goes through this connection.
   */
  async attach(target: PageTarget): Promise<CdpPage> {
    checkDevtoolsUrl(target.webSocketDebuggerUrl, this.#port);
    this.#attaching.add(target.id);
    try {
      const { sessionId } = await this.send<{ sessionId: string }>('Target.attachToTarget', { targetId: target.id, flatten: true });
      if (!this.#sessions.has(sessionId)) this.#sessions.set(sessionId, new Set());
      return new CdpPage(this, sessionId);
    } finally {
      this.#attaching.delete(target.id);
    }
  }

  /** Calls `listener` for each target the browser attaches to by itself once `autoAttach` is on (a popup, a worker, a frame in another process). */
  onAttached(listener: (attached: AttachedTarget) => void): () => void {
    this.#attachedListeners.add(listener);
    return () => this.#attachedListeners.delete(listener);
  }

  /**
   * Has the browser (no `sessionId`) or the session `sessionId` attach to the targets related to it: every new one is held
   * before it runs until `Runtime.runIfWaitingForDebugger`, so a listener from `onAttached` sets it up first.
   */
  autoAttach(sessionId?: string): Promise<unknown> {
    return this.send('Target.setAutoAttach', AUTO_ATTACH, undefined, sessionId);
  }

  isAttached(sessionId: string): boolean {
    return this.open && this.#sessions.has(sessionId);
  }

  listen(sessionId: string, listener: CdpListener): () => void {
    this.#sessions.get(sessionId)?.add(listener);
    return () => this.#sessions.get(sessionId)?.delete(listener);
  }

  /** Ends a session; the browser socket and the other sessions stay. */
  detach(sessionId: string): void {
    // Best effort: the target may be gone already, and the session is forgotten here either way.
    if (this.#forget(sessionId) && this.open) void this.send('Target.detachFromTarget', { sessionId }).catch(() => undefined);
  }

  /** Closes the browser socket: every session ends and every pending command is rejected. */
  close(): void {
    this.#socket.close();
  }
}

/** One page target of the browser connection: the session CDP commands, events and dialogs of a tab go through. */
export class CdpPage {
  readonly #connection: CdpConnection;
  readonly #sessionId: string;

  constructor(connection: CdpConnection, sessionId: string) {
    this.#connection = connection;
    this.#sessionId = sessionId;
  }

  get open(): boolean {
    return this.#connection.isAttached(this.#sessionId);
  }

  /** The flat session id of this target: what an attach announced on it names as `parentSessionId`. */
  get sessionId(): string {
    return this.#sessionId;
  }

  /** Send a CDP command; `signal` rejects the wait (the command may still run in the page). */
  send<T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
    return this.#connection.send<T>(method, params, signal, this.#sessionId);
  }

  /** Has the browser attach to the targets related to this page (frames in another process, its workers); see `CdpConnection.autoAttach`. */
  autoAttach(): Promise<unknown> {
    return this.#connection.autoAttach(this.#sessionId);
  }

  on(listener: CdpListener): () => void {
    return this.#connection.listen(this.#sessionId, listener);
  }

  /** Resolves on the first `method` event or after `timeoutMs`; rejects when `signal` aborts. */
  waitFor(method: string, timeoutMs: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(abortError(signal));
      const timer = setTimeout(done, timeoutMs);
      const off = this.on((name) => name === method && done());
      const onAbort = () => {
        cleanup();
        reject(abortError(signal!));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      function cleanup() {
        clearTimeout(timer);
        off();
        signal?.removeEventListener('abort', onAbort);
      }
      function done() {
        cleanup();
        resolve();
      }
    });
  }

  /** Resolves `work`, or `undefined` as soon as a JavaScript dialog opens (the page then blocks until it is answered). */
  async untilDialog<T>(work: Promise<T>): Promise<T | undefined> {
    let off: (() => void) | undefined;
    const opened = new Promise<undefined>((resolve) => {
      off = this.on((method) => method === 'Page.javascriptDialogOpening' && resolve(undefined));
    });
    try {
      return await Promise.race([work, opened]);
    } finally {
      off?.();
    }
  }

  /**
   * Evaluate an expression in the page and return its JSON value. A result JSON cannot carry (NaN, ±Infinity, -0, a
   * BigInt, a function, a symbol) comes back as the text Chrome describes it with (`NaN`, `10n`, `Symbol(a)`), never as
   * `undefined`, which would read as "the expression returned nothing".
   */
  async evaluate<T = unknown>(expression: string, signal?: AbortSignal): Promise<T> {
    const response = await this.send<{ result?: { type?: string; value?: T; unserializableValue?: string; description?: string }; exceptionDetails?: { text?: string; exception?: { description?: string } } }>('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    }, signal);
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text ?? 'Evaluation failed');
    const { value, type, unserializableValue, description } = response.result ?? {};
    return (value === undefined && type !== 'undefined' ? (unserializableValue ?? description) : value) as T;
  }

  /** Detaches this page's session; the tab stays open and the browser connection stays up. */
  close(): void {
    this.#connection.detach(this.#sessionId);
  }
}

export interface BrowserSession {
  /** The browser-level DevTools socket every page of the session goes through; closed when the session ends. */
  connection: CdpConnection;
  /** The session on the page (tab) driven now. */
  page: CdpPage;
  /**
   * The tabs under the session's network policy by target id: every tab the session drove (it stays attached, with the
   * policy and auto-attach on, when the session moves to another tab, until the tab closes) and each popup the browser
   * attached to before it ran.
   */
  governed: Map<string, CdpPage>;
  /** The workers and frames in other processes under the policy by target id (a dedicated, shared or service worker, an out-of-process frame). */
  workers: Map<string, CdpPage>;
  /** Origins of the documents the governed tabs loaded, which is where a service or shared worker of theirs lives (see `relatedToDriven` in `page-network.ts`). */
  origins: Set<string>;
  /** The origin of the page each governed tab shows now, by target id: never forgotten while the tab stays on it (see `noteOrigin`). */
  tabOrigins: Map<string, string>;
  /** DevTools target id of the page (tab) this session drives now. */
  targetId: string;
  /** DevTools port of the browser this session drives. */
  port: number;
  /** `own`: Chrome this session launched (headless, or visible on the persistent profile in visible mode); `shared`: a Chrome already running, driven in a tab of our own; `attached`: someone else's window, driven in place. */
  kind: 'own' | 'shared' | 'attached';
  headless?: boolean;
  chrome?: OwnChrome;
  /** Profile folder that outlives the session (visible mode): the user's logins stay, and Chrome stays open at shutdown. */
  profile?: string;
  /** The JavaScript dialog (alert, confirm, prompt, beforeunload) waiting for an answer. */
  dialog?: { type: string; message: string };
  /** Downloads by guid, once `download` turned them on. */
  downloads: Map<string, Download>;
  downloadDir?: string;
  /** Closes the tab this session opened in a Chrome it attached to. */
  closeTab?: () => Promise<void>;
  console: string[];
  /** Console lines the session no longer holds: pushed out of the buffer, or discarded when the bound tab changed. */
  consoleLost: { dropped: number; cleared: number };
  /** Every console line, whole, in a rotating file: what `console` and `consoleLost` no longer hold stays readable there. Made with the first line. */
  consoleLog?: ConsoleLog;
  /** Checks every request the driven page makes (documents, frames, subresources, redirect hops); a rejection fails the request. */
  policy?: PageNetworkPolicy;
  /** Why the policy last failed a request, until an action reports it. */
  blocked?: string;
  /** What the policy could only report (a WebSocket it cannot stop), until an action reports it. */
  warning?: string;
}


export interface Download {
  name: string;
  state: 'inProgress' | 'completed' | 'canceled';
  bytes: number;
  /** Where Chrome saved the file, once it reports the path. */
  path?: string;
}

export interface PageTarget {
  id: string;
  webSocketDebuggerUrl: string;
  title?: string;
  url?: string;
}

/**
 * Most origins a session remembers, beyond those of the tabs it drives. At the bound the unpinned origin noted longest ago
 * is forgotten (an origin loaded again counts as noted now, and the one just noted is never the one forgotten). An origin a governed tab shows now is pinned and never
 * forgotten: a page cannot push its own origin out by loading frames on many others, which would leave its service or
 * shared worker ungoverned in a shared Chrome. When every origin is pinned the set is kept whole and may exceed the bound;
 * it then holds the tabs' origins and the one just noted. What forgetting an unpinned origin costs: in a Chrome
 * the session shares (`attach`, `OCTOCODE_CHROME_PORT`) a service or shared worker of it is no longer taken for a tab's
 * own and is left alone, like any worker not related to the tabs the session drives; the session's own Chrome governs
 * every worker whatever the origins.
 */
export const ORIGINS_MAX = 1_000;

/** Remembers the origin of an http(s) document a governed tab loads (or is about to). */
export function noteOrigin(session: BrowserSession, url: string | undefined): void {
  const origin = httpOrigin(url);
  if (origin === undefined) return;
  session.origins.delete(origin);
  session.origins.add(origin);
  if (session.origins.size <= ORIGINS_MAX) return;
  const pinned = new Set(session.tabOrigins.values());
  for (const oldest of session.origins) {
    if (session.origins.size <= ORIGINS_MAX) break;
    if (oldest !== origin && !pinned.has(oldest)) session.origins.delete(oldest);
  }
}

/** Records that tab `tab` shows `url` now: its origin is noted and pinned, and the origin it showed before is no longer. A page that is not http(s) pins nothing. */
export function noteTabOrigin(session: BrowserSession, tab: string, url: string | undefined): void {
  const origin = httpOrigin(url);
  if (origin === undefined) session.tabOrigins.delete(tab);
  else session.tabOrigins.set(tab, origin);
  noteOrigin(session, url);
}

/** The origin of an http(s) URL; undefined for anything else (an empty or blank target, a URL that does not parse). */
export function httpOrigin(url: string | undefined): string | undefined {
  try {
    const parsed = new URL(url ?? '');
    return isHttpUrl(parsed) ? parsed.origin : undefined;
  } catch {
    return undefined;
  }
}

/** Forgets the tabs that closed: their pinned origins and the approvals the policy holds for them. */
export function pruneClosed(session: BrowserSession): void {
  for (const [id, tab] of session.governed) {
    if (tab.open) continue;
    session.governed.delete(id);
    session.tabOrigins.delete(id);
    session.policy?.closed(id);
  }
  for (const [id, worker] of session.workers) if (!worker.open) session.workers.delete(id);
}

/** What a session remembers: the console lines kept, and the longest one. */
export const CONSOLE_KEEP = 200;
const CONSOLE_ENTRY_CHARS = 2_000, DOWNLOADS_KEEP = 100;

/**
 * Appends one console line. Every line goes whole to the session's console log file; only the last `CONSOLE_KEEP` stay in
 * `session.console` (the count pushed out is in `session.consoleLost`). A line over `CONSOLE_ENTRY_CHARS` is cut there and
 * says how many characters it lost and where the whole line is.
 */
export function logConsole(session: BrowserSession, line: string): void {
  const log = (session.consoleLog ??= new ConsoleLog());
  log.append(line);
  const kept = line.length > CONSOLE_ENTRY_CHARS ? cutText(line, CONSOLE_ENTRY_CHARS, { chars: true }) : line;
  session.consoleLost.dropped += Math.max(session.console.length - (CONSOLE_KEEP - 1), 0);
  const shown = kept === line ? line : `${kept}… [${line.length - kept.length} more characters cut; ${log.file ? `the whole line is in ${shortPath(log.file)}` : 'the whole line could not be saved'}]`;
  session.console = [...session.console.slice(1 - CONSOLE_KEEP), shown];
}

/** Records a download's state; past `DOWNLOADS_KEEP` the oldest finished one is dropped (a running one only when none is finished). */
export function trackDownload(session: BrowserSession, guid: string, download: Download): void {
  session.downloads.set(guid, download);
  if (session.downloads.size <= DOWNLOADS_KEEP) return;
  session.downloads.delete(([...session.downloads].find(([key, item]) => key !== guid && item.state !== 'inProgress') ?? [...session.downloads][0]!)[0]);
}

/** The browser's page targets (tabs), in the order Chrome lists them (most recently used first). */
export async function pageTargets(port: number): Promise<PageTarget[]> {
  const targets = (await (await devtoolsFetch(port, '/json/list', 2_000)).json()) as Array<Partial<PageTarget> & { type: string }>;
  return targets.filter((target): target is PageTarget & { type: string } => target.type === 'page' && typeof target.id === 'string' && typeof target.webSocketDebuggerUrl === 'string');
}

/** Opens a tab on `url` in the session's browser. */
export async function openTab(port: number, url: string): Promise<PageTarget> {
  const response = await devtoolsFetch(port, `/json/new?${encodeURI(url)}`, 5_000, { method: 'PUT' });
  if (!response.ok) throw new Error(`Chrome on port ${port} refused a new tab (HTTP ${response.status})`);
  return (await response.json()) as PageTarget;
}
