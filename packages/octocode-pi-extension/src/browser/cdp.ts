import { BROWSER_VISIBLE_ENV, envFlag } from '../shared/env.js';
import { shortPath } from '../shared/format.js';
import { cutText, errorMessage, withTimeout } from '../shared/util.js';
import { abortError, throwIfAborted, unlessAborted } from './abort.js';
import { ConsoleLog } from './console-log.js';
import { applyDownloads } from './emulation.js';
import { browserWebSocketUrl, launchChrome, persistentProfileDir, profileLocked, profilePort, recordProfilePort, type OwnChrome } from './launch.js';
import type { BlockedConnection } from './proxy.js';

/**
 * Minimal Chrome DevTools Protocol client: one browser-level WebSocket (`CdpConnection`) with a session per page
 * (`CdpPage`). Launches its own Chrome, or, when the user opts in with OCTOCODE_CHROME_PORT, works in a tab of the
 * Chrome listening there (to reuse its logged-in profile).
 */
/** Hosts a DevTools socket may be on: this machine. */
const DEVTOOLS_HOSTS = new Set(['127.0.0.1', '[::1]', 'localhost']);

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
    : !DEVTOOLS_HOSTS.has(url.hostname) ? `host ${url.hostname} is not this machine`
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
export interface TargetInfo {
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
    work.catch(() => undefined);
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
  /** Origins of the documents the governed tabs loaded, which is where a service or shared worker of theirs lives (see `relatedToDriven`). */
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

/** What the page's network traffic showed that the audit should record. */
export type NetworkEvent =
  | { kind: 'blocked'; url: string; resourceType: string; reason: string }
  | { kind: 'rebinding'; url: string; address: string }
  | { kind: 'websocket'; url: string; reason: string };

/** Who made a request: the tab it belongs to (a tab's own, its frames' and its dedicated workers'), and for a worker that lives per origin the origin it lives at. */
export interface RequestSource {
  tab?: string;
  origin?: string;
}

/** What a page may reach (see `PagePolicy` in `network.ts`). */
export interface PageNetworkPolicy {
  /** Resolves when the page may request `url`; rejects, with the reason, when it may not. */
  check(url: string, resourceType: string, source: RequestSource): Promise<void>;
  /** The main frame of tab `tab` committed `url`. */
  navigated(tab: string, url: string): void;
  /** Tab `popup` was opened by tab `opener`: it holds the approval the opener holds. */
  opened(opener: string, popup: string): void;
  /** Tab `tab` closed. */
  closed(tab: string): void;
  /** Whether a response from `address` (and `port`) for `url` shows Chrome connected to an address `check` did not allow. */
  rebinds(url: string, address: string, port?: number): boolean;
  /** Whether an approval of the private host `hostname:port` is in force for some tab: what the launched Chrome's filtering proxy lets through. */
  approves(hostname: string, port: number): boolean;
  report(event: NetworkEvent): void;
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

interface OpenOptions {
  /** DevTools port to attach to instead of OCTOCODE_CHROME_PORT. */
  port?: number;
  /** Drive the browser's existing page instead of opening a tab (a browser someone else is showing in a window). */
  reuseTab?: boolean;
  /** Checks each request of every page the session drives (links, redirects, script navigations, frames, subresources). */
  policy?: PageNetworkPolicy;
  /** Called for each connection the launched Chrome's filtering proxy refused. */
  onBlocked?: (blocked: BlockedConnection) => void;
  /** The tool call's signal: an abort stops the open at once and releases a Chrome that finishes starting later. */
  signal?: AbortSignal | undefined;
}


export async function openBrowser(env: NodeJS.ProcessEnv = process.env, options: OpenOptions = {}): Promise<BrowserSession> {
  const { signal } = options;
  throwIfAborted(signal);
  // Someone else's Chrome only on an explicit port: an `attach` call, or the user's OCTOCODE_CHROME_PORT opt-in.
  const shared = options.port ?? sharedChromePort(env);
  let chrome: OwnChrome | undefined;
  let headless: boolean | undefined;
  let closeTab: (() => Promise<void>) | undefined;
  let onProfile = false;
  const profile = !options.port && envFlag(env, BROWSER_VISIBLE_ENV) ? persistentProfileDir(env) : undefined;
  // Attaching to the user's Chrome: work in a tab of our own instead of taking over one they have open.
  let port = shared ?? 0;
  let target = shared === undefined ? undefined : await (options.reuseTab ? firstPage(shared) : newTab(shared)).catch(() => undefined);
  if (options.reuseTab && !target) throw new Error(`No browser is listening on DevTools port ${port}.`);
  if (!target && profile) {
    // Visible mode: the persistent profile's Chrome may still be open from an earlier session (a login hand-off).
    const running = await profilePort(profile);
    if (running) {
      target = await newTab(running);
      port = running;
      onProfile = true;
    } else if (profileLocked(profile)) {
      throw new Error(`The browser profile ${profile} is open in a Chrome without DevTools. Close that Chrome and retry.`);
    }
  }
  if (target && !options.reuseTab) {
    const id = target.id;
    const tabPort = port;
    closeTab = async () => {
      await fetch(`http://127.0.0.1:${tabPort}/json/close/${id}`, { signal: AbortSignal.timeout(2_000) });
    };
  } else if (!target) {
    // Visible only on the persistent profile (visible mode, a login hand-off); otherwise nobody watches the window.
    headless = !profile;
    const { policy, onBlocked } = options;
    const launching = launchChrome(headless, profile, { ...(onBlocked ? { onBlocked } : {}), ...(policy ? { approved: (host, port) => policy.approves(host, port) } : {}) });
    chrome = await unlessAborted(launching, signal, (late) => Promise.resolve(late.kill()).catch(() => undefined));
    onProfile = profile !== undefined;
    try {
      throwIfAborted(signal);
      // Chrome writes this file only for port 0; chrome-launcher picks a fixed port, so record it (in Chrome's format)
      // for the next run.
      if (profile) await recordProfilePort(profile, chrome.port);
      target = await firstPage(chrome.port);
    } catch (error) {
      await chrome.kill();
      throw error;
    }
  }
  let connection: CdpConnection | undefined;
  try {
    throwIfAborted(signal);
    // Refused before any socket opens, so a hostile target list never gets a connection.
    checkDevtoolsUrl(target.webSocketDebuggerUrl, chrome?.port ?? port);
    connection = await CdpConnection.connect(chrome?.port ?? port);
    const page = await connection.attach(target);
    const kind = chrome ? 'own' : options.reuseTab ? 'attached' : 'shared';
    const session = startSession(connection, page, target, { port: chrome?.port ?? port, kind, chrome, headless, closeTab, profile: onProfile ? profile : undefined, policy: options.policy });
    await preparePage(session, page);
    // Popups, workers and service workers are not part of the page's session: the browser attaches them and holds each until its network check is on.
    if (session.policy) await connection.autoAttach();
    return session;
  } catch (error) {
    // Nothing owns the tab or the Chrome yet: release them instead of leaking a process or a tab.
    connection?.close();
    await closeTab?.().catch(() => undefined);
    await chrome?.kill();
    throw error;
  }
}

/** `OCTOCODE_CHROME_PORT` when set: the user's opt-in to share an open Chrome. A value that is not a TCP port is refused, not guessed at. */
export function sharedChromePort(env: NodeJS.ProcessEnv): number | undefined {
  const raw = env['OCTOCODE_CHROME_PORT']?.trim();
  if (!raw) return undefined;
  const port = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (port >= 1 && port <= 65_535) return port;
  throw new Error(`OCTOCODE_CHROME_PORT=${raw} is not a TCP port (1-65535). Fix or unset it and restart Pi.`);
}

type SessionParts = Pick<BrowserSession, 'port' | 'kind'> & {
  chrome?: OwnChrome | undefined;
  headless?: boolean | undefined;
  closeTab?: (() => Promise<void>) | undefined;
  profile?: string | undefined;
  policy?: PageNetworkPolicy | undefined;
};

function startSession(connection: CdpConnection, page: CdpPage, target: PageTarget, parts: SessionParts): BrowserSession {
  const targetId = target.id;
  const session: BrowserSession = {
    connection,
    page,
    governed: new Map([[targetId, page]]),
    workers: new Map(),
    origins: new Set(),
    tabOrigins: new Map(),
    targetId,
    port: parts.port,
    kind: parts.kind,
    console: [],
    consoleLost: { dropped: 0, cleared: 0 },
    downloads: new Map(),
  };
  noteTabOrigin(session, targetId, target.url);
  if (parts.chrome) session.chrome = parts.chrome;
  if (parts.headless !== undefined) session.headless = parts.headless;
  if (parts.closeTab) session.closeTab = parts.closeTab;
  if (parts.profile) session.profile = parts.profile;
  if (parts.policy) session.policy = parts.policy;
  if (session.policy) {
    guardTargets(session, session.policy);
    // A tab that closes takes its pinned origin and its private-host approval with it, when it happens, not at the next attach.
    connection.onEnded(() => pruneClosed(session));
  }
  watchNetwork(session, page, targetId);
  listen(session, page);
  return session;
}

/**
 * Setup every page the session drives gets: page and runtime events, the download folder (once `download`
 * turned it on), and, with a network policy, a pause before every request (all resource types) so the policy sees each
 * document, frame, subresource and redirect hop. The cache and service workers are off for the page: a cached response
 * or a service worker's answer is never requested, so it would never be paused.
 */
async function preparePage(session: BrowserSession, page: CdpPage): Promise<void> {
  // A tab the session drove before is still attached with all of it on: only the download folder may have been chosen since.
  const again = prepared.has(page);
  if (!again) await Promise.all([page.send('Page.enable'), page.send('Runtime.enable')]);
  if (session.downloadDir) await applyDownloads(page, session.downloadDir);
  if (session.policy && !again) await applyPolicy(page, 'page');
  prepared.add(page);
}

/** The pages `preparePage` finished with: their session stays attached when the session drives another tab, so a return to one needs no second setup. */
const prepared = new WeakSet<CdpPage>();

/** Targets that load documents: their setup also turns the cache and service workers off (see `preparePage`). */
const PAGE_TYPES = new Set(['page', 'iframe']);

/**
 * What a target needs for the policy to see every request it makes, sent in order and all at once: Chrome runs a session's
 * commands in the order it got them, so a command sent before `Runtime.runIfWaitingForDebugger` is applied before the target
 * runs, and a held service worker answers none of them until it is released. A dedicated worker has no `Fetch` domain: the
 * session of the page that owns it pauses its requests. The target's own related targets (frames in another process,
 * workers) are attached to as well, each held until its own setup is done.
 */
function applyPolicy(page: CdpPage, type: string): Promise<unknown> {
  const sent: Array<Promise<unknown>> = [page.send('Network.enable')];
  if (PAGE_TYPES.has(type)) sent.push(page.send('Network.setCacheDisabled', { cacheDisabled: true }), page.send('Network.setBypassServiceWorker', { bypass: true }));
  if (type !== 'worker') sent.push(page.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }));
  sent.push(page.autoAttach());
  return Promise.all(sent);
}

/** Targets the policy governs; any other the browser attaches (an extension's page, a worklet) is let run and left alone. */
const GOVERNED_TYPES = new Set(['page', 'iframe', 'worker', 'shared_worker', 'service_worker']);

/** Workers that live per origin, not per page: the browser attaches them on its own session, so the page that started one is known by its origin. */
const ORIGIN_TYPES = new Set(['shared_worker', 'service_worker']);

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
function noteTabOrigin(session: BrowserSession, tab: string, url: string | undefined): void {
  const origin = httpOrigin(url);
  if (origin === undefined) session.tabOrigins.delete(tab);
  else session.tabOrigins.set(tab, origin);
  noteOrigin(session, url);
}

/** The origin of an http(s) URL; undefined for anything else (an empty or blank target, a URL that does not parse). */
function httpOrigin(url: string | undefined): string | undefined {
  try {
    const { protocol, origin } = new URL(url ?? '');
    return protocol === 'http:' || protocol === 'https:' ? origin : undefined;
  } catch {
    return undefined;
  }
}

/** Forgets the tabs that closed: their pinned origins and the approvals the policy holds for them. */
function pruneClosed(session: BrowserSession): void {
  for (const [id, tab] of session.governed) {
    if (tab.open) continue;
    session.governed.delete(id);
    session.tabOrigins.delete(id);
    session.policy?.closed(id);
  }
  for (const [id, worker] of session.workers) if (!worker.open) session.workers.delete(id);
}

/** Whether the session `sessionId` belongs to a tab, worker or frame the policy governs. */
function drivenSession(session: BrowserSession, sessionId: string | undefined): boolean {
  if (sessionId === undefined) return false;
  for (const pages of [session.governed, session.workers]) for (const page of pages.values()) if (page.sessionId === sessionId && page.open) return true;
  return false;
}

/**
 * Whether a target the browser attached belongs to the tabs the session drives: a popup whose opener is governed, a
 * worker or frame whose parent session is governed, a service or shared worker whose origin a governed tab loaded.
 */
function relatedToDriven(session: BrowserSession, { info, parentSessionId }: AttachedTarget): boolean {
  if (info.type === 'page') return info.openerId !== undefined && session.governed.has(info.openerId);
  if (drivenSession(session, parentSessionId)) return true;
  if (!ORIGIN_TYPES.has(info.type)) return false;
  try {
    return session.origins.has(new URL(info.url ?? '').origin);
  } catch {
    return false;
  }
}

/**
 * Whether the browser may hold targets that are not the session's: a Chrome it did not launch (`attach`,
 * `OCTOCODE_CHROME_PORT`) is the user's own, with tabs and workers of their own that the policy must never touch. The Chrome
 * on the persistent profile is the agent's browser, started by it or by an earlier session.
 */
const sharesBrowser = (session: BrowserSession): boolean => session.kind !== 'own' && session.profile === undefined;

/**
 * Sets up each target the browser attaches by itself before it runs a line: its network setup is sent while it waits for
 * the debugger, and only then is it let go. That is what puts a popup's first request, a worker's fetches and a service
 * worker's own fetches (which no page session ever pauses) under the policy. The session's own Chrome is covered whole.
 * In the user's Chrome only the targets related to a tab the session drives are (see `relatedToDriven`); every other one is
 * let run at once and detached untouched. A tab the browser opened that the session did not (the user's own tabs, one it is
 * about to attach to itself) is let run and detached. A target whose setup fails is closed.
 */
function guardTargets(session: BrowserSession, policy: PageNetworkPolicy): void {
  session.connection.onAttached((attached) => {
    void guardAttached(session, policy, attached);
  });
}

async function guardAttached(session: BrowserSession, policy: PageNetworkPolicy, attached: AttachedTarget): Promise<void> {
  const { page, info, waiting } = attached;
  const resume = (): Promise<void> => (waiting ? page.send('Runtime.runIfWaitingForDebugger').then(() => undefined, () => undefined) : Promise.resolve());
  pruneClosed(session);
  const governable = GOVERNED_TYPES.has(info.type) && !info.url?.startsWith('chrome-extension:');
  const mine = governable && (info.type === 'page' ? !session.governed.has(info.targetId) && relatedToDriven(session, attached) : !sharesBrowser(session) || relatedToDriven(session, attached));
  if (!mine) {
    await resume();
    page.close();
    return;
  }
  const tab = info.type === 'page' ? info.targetId : undefined;
  if (tab && info.openerId) policy.opened(info.openerId, tab);
  // Registered before the setup: what this target opens next is announced as soon as it runs, and finds its parent governed.
  (tab ? session.governed : session.workers).set(info.targetId, page);
  watchNetwork(session, page, tab, tab ? undefined : workerSource(session, attached));
  // The release goes out right behind the setup; a failed setup is found when its replies are in, and the target is closed.
  const setup = applyPolicy(page, info.type);
  const released = resume();
  try {
    await setup;
  } catch (error) {
    const reason = `could not set up the network check (${errorMessage(error)})`;
    (tab ? session.governed : session.workers).delete(info.targetId);
    session.blocked = `${info.url ?? info.type}: ${reason}`;
    logConsole(session, `[blocked] ${session.blocked}`);
    policy.report({ kind: 'blocked', url: info.url ?? '', resourceType: info.type, reason });
    await session.connection.send('Target.closeTarget', { targetId: info.targetId }).catch(() => undefined);
    return;
  }
  await released;
}

/** Who made the requests of each page the session watches (`watchNetwork`). */
const sources = new WeakMap<CdpPage, RequestSource>();

/** The page of the session `sessionId`, among the tabs, workers and frames the session governs. */
function pageOfSession(session: BrowserSession, sessionId: string | undefined): CdpPage | undefined {
  if (sessionId === undefined) return undefined;
  for (const pages of [session.governed, session.workers]) for (const page of pages.values()) if (page.sessionId === sessionId) return page;
  return undefined;
}

/**
 * Who a worker or frame in another process requests for: the one whose page owns it (a tab's frames and dedicated workers
 * are the tab's own), else, for a service or shared worker, the origin it lives at.
 */
function workerSource(session: BrowserSession, { info, parentSessionId }: AttachedTarget): RequestSource {
  const parent = pageOfSession(session, parentSessionId);
  const inherited = parent && sources.get(parent);
  if (inherited) return inherited;
  const origin = ORIGIN_TYPES.has(info.type) ? httpOrigin(info.url) : undefined;
  return origin === undefined ? {} : { origin };
}

/** How long a paused request waits for the policy's verdict before it fails: a request nobody answers must not hang the page. */
const REQUEST_VERDICT_MS = 5_000;

/** Lets a paused request through when the policy allows its URL; fails it otherwise (also when the verdict takes too long) and records why. */
async function screenRequest(session: BrowserSession, page: CdpPage, policy: PageNetworkPolicy, source: RequestSource, params: Record<string, unknown>): Promise<void> {
  const requestId = String(params['requestId']);
  const url = String((params['request'] as { url?: unknown } | undefined)?.url ?? '');
  const resourceType = String(params['resourceType'] ?? 'Other');
  try {
    await withTimeout(policy.check(url, resourceType, source), REQUEST_VERDICT_MS, 'The request check');
  } catch (error) {
    const reason = errorMessage(error);
    session.blocked = `${url}: ${reason}`;
    logConsole(session, `[blocked] ${session.blocked}`);
    policy.report({ kind: 'blocked', url, resourceType, reason });
    await page.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => undefined);
    return;
  }
  // The request may be gone (the tab navigated elsewhere or closed) by the time the policy answers.
  await page.send('Fetch.continueRequest', { requestId }).catch(() => undefined);
}

/**
 * A response that came from a private address for a name the policy had judged public (DNS rebinding): the request
 * already reached it, so its tab (`tab`, the target id) is closed rather than driven further. Not checked behind the filtering proxy: Chrome
 * sees the proxy's address there, and the proxy vets the address itself.
 */
async function closeRebound(session: BrowserSession, policy: PageNetworkPolicy, url: string, address: string, tab: string | undefined): Promise<void> {
  policy.report({ kind: 'rebinding', url, address });
  if (!tab) {
    // A worker has no tab to close.
    logConsole(session, `[blocked] ${url} answered from the private address ${address}`);
    return;
  }
  logConsole(session, `[blocked] ${url} answered from the private address ${address}; the tab was closed`);
  await fetch(`http://127.0.0.1:${session.port}/json/close/${tab}`, { signal: AbortSignal.timeout(2_000) }).catch(() => undefined);
}

/** A WebSocket the page opened to a host it may not reach. `Fetch` never pauses a handshake, so it is reported, not stopped (a launched Chrome's proxy stops it). */
async function reportWebSocket(session: BrowserSession, policy: PageNetworkPolicy, source: RequestSource, url: string): Promise<void> {
  try {
    await policy.check(url, 'WebSocket', source);
  } catch (error) {
    const reason = errorMessage(error);
    session.warning = `The page opened a WebSocket it may not (${url}): ${reason} It cannot be stopped on this browser; it may already have exchanged data.`;
    logConsole(session, `[warning] ${session.warning}`);
    policy.report({ kind: 'websocket', url, reason });
  }
}

/** What a session remembers: the console lines kept, and the longest one. */
export const CONSOLE_KEEP = 200;
const CONSOLE_ENTRY_CHARS = 2_000, DOWNLOADS_KEEP = 100;

/**
 * Appends one console line. Every line goes whole to the session's console log file; only the last `CONSOLE_KEEP` stay in
 * `session.console` (the count pushed out is in `session.consoleLost`). A line over `CONSOLE_ENTRY_CHARS` is cut there and
 * says how many characters it lost and where the whole line is.
 */
function logConsole(session: BrowserSession, line: string): void {
  const log = (session.consoleLog ??= new ConsoleLog());
  log.append(line);
  const kept = line.length > CONSOLE_ENTRY_CHARS ? cutText(line, CONSOLE_ENTRY_CHARS, { chars: true }) : line;
  session.consoleLost.dropped += Math.max(session.console.length - (CONSOLE_KEEP - 1), 0);
  const shown = kept === line ? line : `${kept}… [${line.length - kept.length} more characters cut; ${log.file ? `the whole line is in ${shortPath(log.file)}` : 'the whole line could not be saved'}]`;
  session.console = [...session.console.slice(1 - CONSOLE_KEEP), shown];
}

/** Records a download's state; past `DOWNLOADS_KEEP` the oldest finished one is dropped (a running one only when none is finished). */
function trackDownload(session: BrowserSession, guid: string, download: Download): void {
  session.downloads.set(guid, download);
  if (session.downloads.size <= DOWNLOADS_KEEP) return;
  session.downloads.delete(([...session.downloads].find(([key, item]) => key !== guid && item.state !== 'inProgress') ?? [...session.downloads][0]!)[0]);
}

/**
 * Applies the policy to what a target's session reports: each paused request, a response from an address the policy did not
 * allow, a WebSocket it cannot stop. `tab` is the target id when the target is a tab, which a rebinding closes; `source` says
 * who the requests are for (the tab itself by default).
 */
function watchNetwork(session: BrowserSession, page: CdpPage, tab: string | undefined, source: RequestSource = tab === undefined ? {} : { tab }): void {
  const { policy } = session;
  if (!policy) return;
  sources.set(page, source);
  page.on((method, params) => {
    if (method === 'Fetch.requestPaused') {
      if (params['resourceType'] === 'Document') noteOrigin(session, String((params['request'] as { url?: unknown } | undefined)?.url ?? ''));
      void screenRequest(session, page, policy, source, params);
    } else if (method === 'Page.frameNavigated' && tab !== undefined) {
      // The tab's main frame committed: its approval for a private host ends when it left that host, and its origin is pinned.
      const frame = params['frame'] as { url?: unknown; parentId?: unknown } | undefined;
      if (frame && frame.parentId === undefined && typeof frame.url === 'string') {
        policy.navigated(tab, frame.url);
        noteTabOrigin(session, tab, frame.url);
      }
    } else if (method === 'Network.responseReceived' && !session.chrome?.proxy) {
      const response = params['response'] as { url?: unknown; remoteIPAddress?: unknown; remotePort?: unknown } | undefined;
      const { url, remoteIPAddress: address } = response ?? {};
      if (typeof url === 'string' && typeof address === 'string' && policy.rebinds(url, address, typeof response?.remotePort === 'number' ? response.remotePort : undefined)) {
        void closeRebound(session, policy, url, address, tab);
      }
    } else if (method === 'Network.webSocketCreated' && !session.chrome?.proxy) {
      void reportWebSocket(session, policy, source, String(params['url'] ?? ''));
    }
  });
}

/** Tracks the page's dialogs, downloads and console output on the session. */
function listen(session: BrowserSession, page: CdpPage): void {
  page.on((method, params) => {
    // A tab the session moved away from stays attached; only the driven one speaks for the session.
    if (page !== session.page && (method === 'Page.javascriptDialogOpening' || method === 'Page.javascriptDialogClosed' || method === 'Runtime.consoleAPICalled' || method === 'Runtime.exceptionThrown')) return;
    if (method === 'Page.javascriptDialogOpening') {
      session.dialog = { type: String(params['type']), message: String(params['message'] ?? '') };
    } else if (method === 'Page.javascriptDialogClosed') {
      delete session.dialog;
    } else if (method === 'Browser.downloadWillBegin' || method === 'Page.downloadWillBegin') {
      trackDownload(session, String(params['guid']), { name: String(params['suggestedFilename'] ?? 'download'), state: 'inProgress', bytes: 0 });
    } else if (method === 'Browser.downloadProgress' || method === 'Page.downloadProgress') {
      const download = session.downloads.get(String(params['guid']));
      const file = typeof params['filePath'] === 'string' && params['filePath'] ? { path: params['filePath'] } : {};
      if (download) trackDownload(session, String(params['guid']), { ...download, ...file, state: params['state'] as Download['state'], bytes: Number(params['receivedBytes'] ?? download.bytes) });
    } else if (method === 'Runtime.consoleAPICalled') {
      const args = Array.isArray(params['args']) ? params['args'] : [];
      const text = args.map((arg) => String((arg as { value?: unknown; description?: string }).value ?? (arg as { description?: string }).description ?? '')).join(' ');
      logConsole(session, `[${String(params['type'])}] ${text}`);
    } else if (method === 'Runtime.exceptionThrown') {
      const details = params['exceptionDetails'] as { text?: string; exception?: { description?: string } } | undefined;
      logConsole(session, `[exception] ${details?.exception?.description ?? details?.text ?? ''}`);
    }
  });
}

/** The browser's page targets (tabs), in the order Chrome lists them (most recently used first). */
export async function pageTargets(port: number): Promise<PageTarget[]> {
  const targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2_000) })).json()) as Array<Partial<PageTarget> & { type: string }>;
  return targets.filter((target): target is PageTarget & { type: string } => target.type === 'page' && typeof target.id === 'string' && typeof target.webSocketDebuggerUrl === 'string');
}

/** Opens a tab on `url` in the session's browser. */
export async function openTab(port: number, url: string): Promise<PageTarget> {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURI(url)}`, { method: 'PUT', signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`Chrome on port ${port} refused a new tab (HTTP ${response.status})`);
  return (await response.json()) as PageTarget;
}

/**
 * Moves the session onto another tab: attaches to it (once), applies (once `download` turned them on) the download folder,
 * starts tracking its dialogs, downloads and console, and brings it to the front. The tab the session leaves stays
 * attached and governed, policy and auto-attach on, so what it or the popups and workers it opens later request is still
 * checked: only the pointer to the driven tab moves. A tab's session ends when the tab closes or the browser session ends.
 * The tab the session opened itself is still the one `close` removes.
 */
export async function switchTo(session: BrowserSession, target: PageTarget): Promise<void> {
  pruneClosed(session);
  // A tab the session drove before, or a popup the browser attached before it ran, is already under the policy and watched: it is driven through that session.
  const known = session.governed.get(target.id);
  const page = known ?? (await session.connection.attach(target));
  if (!known) watchNetwork(session, page, target.id);
  const first = !prepared.has(page);
  try {
    await preparePage(session, page);
  } catch (error) {
    if (!known) page.close();
    throw error;
  }
  noteTabOrigin(session, target.id, target.url);
  session.governed.set(target.id, page);
  if (first) listen(session, page);
  session.page = page;
  session.targetId = target.id;
  // The buffer is the bound tab's: what an earlier tab logged is discarded, and the count says so.
  session.consoleLost = { dropped: 0, cleared: session.consoleLost.cleared + session.console.length + session.consoleLost.dropped };
  session.console = [];
  // The log keeps the earlier tab's lines; a line marks where the next tab's begin.
  session.consoleLog?.append(`[tab] console of ${target.url}`);
  delete session.dialog;
  await page.send('Page.bringToFront').catch(() => undefined);
}

const newTab = (port: number): Promise<PageTarget> => openTab(port, 'about:blank');

/** The about:blank page of a Chrome this session launched (a new tab when it lists none). */
const firstPage = async (port: number): Promise<PageTarget> => (await pageTargets(port))[0] ?? newTab(port);
