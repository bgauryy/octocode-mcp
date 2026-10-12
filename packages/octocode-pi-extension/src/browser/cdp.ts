import type { LaunchedChrome } from 'chrome-launcher';
import { BROWSER_VISIBLE_ENV, envFlag, envInt } from '../shared/env.js';
import { errorMessage, withTimeout } from '../shared/util.js';
import { applyDownloads, applyLocale } from './emulation.js';
import { launchChrome, persistentProfileDir, profileLocked, profilePort, recordProfilePort } from './launch.js';

/** The error an aborted browser operation rejects with: the signal's own reason when it is an Error. */
export const abortError = (signal: AbortSignal): Error => (signal.reason instanceof Error ? signal.reason : new Error('Aborted'));

/**
 * Minimal Chrome DevTools Protocol session over the page websocket. Launches its own Chrome, or, when the user opts in
 * with OCTOCODE_CHROME_PORT, works in a tab of the Chrome listening there (to reuse its logged-in profile).
 */
class CdpPage {
  readonly #socket: WebSocket;
  readonly #pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  readonly #listeners = new Set<(method: string, params: Record<string, unknown>) => void>();
  #nextId = 1;

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.addEventListener('message', (event) => {
      // A throwing EventTarget listener surfaces as an uncaught exception in Pi's process.
      let message: { id?: number; result?: unknown; error?: { message: string }; method?: string; params?: Record<string, unknown> };
      try {
        message = JSON.parse(String(event.data)) as typeof message;
      } catch {
        return;
      }
      if (message.id !== undefined) {
        const pending = this.#pending.get(message.id);
        this.#pending.delete(message.id);
        if (message.error) pending?.reject(new Error(message.error.message));
        else pending?.resolve(message.result);
      } else if (message.method) {
        for (const listener of this.#listeners) {
          try {
            listener(message.method, message.params ?? {});
          } catch {
            // One bad event must not break the session.
          }
        }
      }
    });
    socket.addEventListener('close', () => {
      for (const pending of this.#pending.values()) pending.reject(new Error('Browser connection closed'));
      this.#pending.clear();
    });
  }

  static async connect(url: string): Promise<CdpPage> {
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
    return new CdpPage(socket);
  }

  get open(): boolean {
    return this.#socket.readyState === WebSocket.OPEN;
  }

  /** Send a CDP command; `signal` rejects the wait (the command may still run in the page). */
  send<T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
    const id = this.#nextId++;
    if (!this.open) return Promise.reject(new Error('Browser connection closed'));
    if (signal?.aborted) return Promise.reject(abortError(signal));
    let onAbort: (() => void) | undefined;
    const result = new Promise<T>((resolve, reject) => {
      this.#pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      if (signal) signal.addEventListener('abort', (onAbort = () => reject(abortError(signal))), { once: true });
    });
    this.#socket.send(JSON.stringify({ id, method, params }));
    return withTimeout(result, 30_000, method).finally(() => {
      this.#pending.delete(id);
      if (onAbort) signal?.removeEventListener('abort', onAbort);
    });
  }

  on(listener: (method: string, params: Record<string, unknown>) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
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

  /** Evaluate an expression in the page and return its JSON value. */
  async evaluate<T = unknown>(expression: string, signal?: AbortSignal): Promise<T> {
    const response = await this.send<{ result?: { value?: T }; exceptionDetails?: { text?: string; exception?: { description?: string } } }>('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    }, signal);
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text ?? 'Evaluation failed');
    return response.result?.value as T;
  }

  close(): void {
    this.#socket.close();
  }
}

export interface BrowserSession {
  page: CdpPage;
  /** DevTools target id of the page (tab) this session drives now. */
  targetId: string;
  /** DevTools port of the browser this session drives. */
  port: number;
  /** `own`: Chrome this session launched (headless unless OCTOCODE_BROWSER_HEADLESS=0); `shared`: a Chrome already running, driven in a tab of our own; `attached`: someone else's window, driven in place. */
  kind: 'own' | 'shared' | 'attached';
  headless?: boolean;
  chrome?: LaunchedChrome;
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
  /** Checks every document (page or frame) request the driven page makes; a rejection fails the request. */
  guard?: NavigationGuard;
  /** Why the guard last failed a request, until an action reports it. */
  blocked?: string;
}

/** Resolves when a page may load `url`; rejects (with the reason) when it may not. */
export type NavigationGuard = (url: string) => Promise<void>;

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
  /** Checks each document request of every page the session drives (links, redirects, script navigations, frames). */
  guard?: NavigationGuard;
}

export async function openBrowser(env: NodeJS.ProcessEnv = process.env, options: OpenOptions = {}): Promise<BrowserSession> {
  // Someone else's Chrome only on an explicit port: an `attach` call, or the user's OCTOCODE_CHROME_PORT opt-in.
  const shared = options.port ?? sharedChromePort(env);
  let chrome: LaunchedChrome | undefined;
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
    headless = !profile && envFlag(env, 'OCTOCODE_BROWSER_HEADLESS', true);
    chrome = await launchChrome(headless, profile);
    onProfile = profile !== undefined;
    try {
      // Chrome writes this file only for port 0; chrome-launcher picks a fixed port, so record it (in Chrome's format)
      // for the next run.
      if (profile) await recordProfilePort(profile, chrome.port);
      target = await firstPage(chrome.port);
    } catch (error) {
      await chrome.kill();
      throw error;
    }
  }
  let page: CdpPage | undefined;
  try {
    page = await CdpPage.connect(target.webSocketDebuggerUrl);
    const kind = chrome ? 'own' : options.reuseTab ? 'attached' : 'shared';
    const session = startSession(page, target.id, { port: chrome?.port ?? port, kind, chrome, headless, closeTab, profile: onProfile ? profile : undefined, guard: options.guard });
    await preparePage(session, page, env);
    return session;
  } catch (error) {
    // Nothing owns the tab or the Chrome yet: release them instead of leaking a process or a tab.
    page?.close();
    await closeTab?.().catch(() => undefined);
    await chrome?.kill();
    throw error;
  }
}

/** `OCTOCODE_CHROME_PORT` (a TCP port, clamped to 1–65535) when set: the user's opt-in to share an open Chrome. */
export function sharedChromePort(env: NodeJS.ProcessEnv): number | undefined {
  return env['OCTOCODE_CHROME_PORT']?.trim() ? envInt(env, 'OCTOCODE_CHROME_PORT', 9222, { min: 1, max: 65_535 }) : undefined;
}

type SessionParts = Pick<BrowserSession, 'port' | 'kind'> & {
  chrome?: LaunchedChrome | undefined;
  headless?: boolean | undefined;
  closeTab?: (() => Promise<void>) | undefined;
  profile?: string | undefined;
  guard?: NavigationGuard | undefined;
};

function startSession(page: CdpPage, targetId: string, parts: SessionParts): BrowserSession {
  const session: BrowserSession = { page, targetId, port: parts.port, kind: parts.kind, console: [], downloads: new Map() };
  if (parts.chrome) session.chrome = parts.chrome;
  if (parts.headless !== undefined) session.headless = parts.headless;
  if (parts.closeTab) session.closeTab = parts.closeTab;
  if (parts.profile) session.profile = parts.profile;
  if (parts.guard) session.guard = parts.guard;
  listen(session, page);
  return session;
}

/**
 * Setup every page the session drives gets: page and runtime events, the locale, the download folder (once `download`
 * turned it on), and, with a guard, a pause before each document request so the guard sees every navigation.
 */
async function preparePage(session: BrowserSession, page: CdpPage, env: NodeJS.ProcessEnv): Promise<void> {
  await Promise.all([page.send('Page.enable'), page.send('Runtime.enable')]);
  await applyLocale(page, env);
  if (session.downloadDir) await applyDownloads(page, session.downloadDir);
  if (session.guard) await page.send('Fetch.enable', { patterns: [{ urlPattern: '*', resourceType: 'Document', requestStage: 'Request' }] });
}

/** Lets a paused document request through when the guard allows its URL; fails it otherwise and records why. */
async function guardRequest(session: BrowserSession, page: CdpPage, params: Record<string, unknown>): Promise<void> {
  const requestId = String(params['requestId']);
  const url = String((params['request'] as { url?: unknown } | undefined)?.url ?? '');
  try {
    await session.guard!(url);
  } catch (error) {
    session.blocked = `${url}: ${errorMessage(error)}`;
    logConsole(session, `[blocked] ${session.blocked}`);
    await page.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => undefined);
    return;
  }
  // The request may be gone (the tab navigated elsewhere or closed) by the time the guard answers.
  await page.send('Fetch.continueRequest', { requestId }).catch(() => undefined);
}

const CONSOLE_KEEP = 200, CONSOLE_ENTRY_CHARS = 2_000, DOWNLOADS_KEEP = 100; // what a session remembers

/** Appends one console line, cut to `CONSOLE_ENTRY_CHARS`; only the last `CONSOLE_KEEP` lines are kept. */
function logConsole(session: BrowserSession, line: string): void {
  session.console = [...session.console.slice(1 - CONSOLE_KEEP), line.length > CONSOLE_ENTRY_CHARS ? `${line.slice(0, CONSOLE_ENTRY_CHARS)}…` : line];
}

/** Records a download's state; past `DOWNLOADS_KEEP` the oldest finished one is dropped (a running one only when none is finished). */
function trackDownload(session: BrowserSession, guid: string, download: Download): void {
  session.downloads.set(guid, download);
  if (session.downloads.size <= DOWNLOADS_KEEP) return;
  session.downloads.delete(([...session.downloads].find(([key, item]) => key !== guid && item.state !== 'inProgress') ?? [...session.downloads][0]!)[0]);
}

/** Tracks the page's dialogs, downloads and console output on the session. */
function listen(session: BrowserSession, page: CdpPage): void {
  page.on((method, params) => {
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
    } else if (method === 'Fetch.requestPaused' && session.guard) {
      void guardRequest(session, page, params);
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
 * Moves the session onto another tab: connects to it, applies the locale and (once `download` turned them on) the
 * download folder, starts tracking its dialogs, downloads and console, brings it to the front, and drops the old page
 * connection (the old tab stays open). The tab the session opened itself is still
 * the one `close` removes.
 */
export async function switchTo(session: BrowserSession, target: PageTarget): Promise<void> {
  const page = await CdpPage.connect(target.webSocketDebuggerUrl);
  try {
    await preparePage(session, page, process.env);
  } catch (error) {
    page.close();
    throw error;
  }
  listen(session, page);
  const previous = session.page;
  session.page = page;
  session.targetId = target.id;
  session.console = [];
  delete session.dialog;
  previous.close();
  await page.send('Page.bringToFront').catch(() => undefined);
}

async function newTab(port: number): Promise<PageTarget> {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT', signal: AbortSignal.timeout(2_000) });
  if (!response.ok) throw new Error(`Chrome on port ${port} refused a new tab (HTTP ${response.status})`);
  return (await response.json()) as PageTarget;
}

/** The about:blank page of a Chrome this session launched. */
async function firstPage(port: number): Promise<PageTarget> {
  const targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2_000) })).json()) as Array<Partial<PageTarget> & { type: string }>;
  const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl && target.id);
  return page ? (page as PageTarget) : newTab(port);
}
