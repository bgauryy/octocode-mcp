import fs from 'node:fs';
import path from 'node:path';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { StringEnum } from '@earendil-works/pi-ai';
import { Type, type Static } from 'typebox';
import { answerDialog, dialogNotice, download, uploadFiles } from './actions.js';
import { browserCallHeader, browserResult } from './render.js';
import { CONSOLE_KEEP, type BrowserSession } from './cdp.js';
import { click, drag, elementExpr, fillFields, hover, pressKey, refForText, settle, settleAfterLoad, typeInto, waitForText } from './input.js';
import { blockedHost, httpOnlyRefusal, keyOf, PagePolicy, parseUrl, portOf } from './network.js';
import type { NetworkEvent } from './policy.js';
import type { BlockedConnection } from './proxy.js';
import { openBrowser } from './session.js';
import { screenshot } from './screenshot.js';
import { imageLimits } from '../shared/vision.js';
import { snapshot } from './snapshot.js';
import { describeTabs, followNewTab, NAVIGATE_LOAD_MS, newTab, selectTab, tabIds, type Approval } from './tabs.js';
import type { Permission } from '../permission/ask.js';
import { actionWhy, decide } from '../permission/mode.js';
import { isWithin, workspaceRoot } from '../shared/home.js';
import { timedTool } from '../shared/render.js';
import { formatDuration } from '../shared/format.js';
import { visibleControls } from '../shared/sanitize.js';
import { visibleError } from '../shared/visible-error.js';
import { capOutputToFile } from '../shared/spill.js';
import { contentText, textResult, withTimeout } from '../shared/util.js';
import { classifyHost, isHttpUrl, type HostClass, type HostLookup } from '../web/guard.js';

const ACTIONS = ['info', 'attach', 'navigate', 'snapshot', 'click', 'hover', 'drag', 'type', 'fill', 'press', 'wait', 'tabs', 'tab', 'evaluate', 'screenshot', 'console', 'dialog', 'upload', 'download', 'close'] as const;
/** Actions that talk to the page, so an open JavaScript dialog must be answered first. */
const PAGE_ACTIONS = new Set(['click', 'hover', 'drag', 'type', 'fill', 'press', 'wait', 'evaluate', 'upload', 'download']);
/** Default and longest `wait`, in seconds. */
const WAIT_DEFAULT_S = 10;
const WAIT_MAX_S = 60;

/** The refusals and reports kept apart in the audit (`BrowserTool.#audited`), most distinct ones, and how soon a repeat count is written. */
export const AUDIT_KEYS_MAX = 100;
const AUDIT_FLUSH_MS = 10_000;
const OVERFLOW_KEY = 'more distinct refusals';

interface Audited {
  repeats: number;
  /** The repeat count the audit already holds. */
  written: number;
  write: (repeats: number) => void;
}

type Confirmer = Pick<ExtensionContext, 'hasUI' | 'ui'> & { signal?: AbortSignal | undefined };
/** Before any tool call supplies a context: nothing to ask, so what needs confirmation is refused. */
const NO_UI = { hasUI: false } as Confirmer;

export class BrowserTool {
  #session: BrowserSession | undefined;
  /** The latest tool call's context: where the navigation guard asks for confirmation. */
  #confirmer: Confirmer = NO_UI;
  /** The latest tool call's id: what the asks the call raises are tied to. */
  #callId: string | undefined;
  /** What the session's pages may request: every request, not only URLs the agent passes. Private hosts only when the agent opened them. */
  readonly #policy: PagePolicy;
  /**
   * Refusals and reports already in the audit, by what tells one from another (kind, host and port, resource type,
   * reason). A page that repeats one writes it once; the repeats are counted and audited as a summary shortly after
   * (`AUDIT_FLUSH_MS`) and again when the browser session ends, so a crash loses at most the last interval's counts.
   * At `AUDIT_KEYS_MAX` distinct entries the others are counted under one entry that says how many more distinct
   * refusals there were (`OVERFLOW_KEY`), so a page cannot flood the audit and nothing is dropped silently.
   */
  readonly #audited = new Map<string, Audited>();
  #flushTimer: NodeJS.Timeout | undefined;
  /** Resolves host names for the check on the pages the agent opens, and for what pages request; the `web` tool's resolver by default. */
  readonly #lookup: HostLookup | undefined;
  /** What the last session lost before it ended (a tab closed for DNS rebinding), told with the next session's first result. */
  #notice: string | undefined;

  readonly #flushMs: number;

  /** `permission` asks about the pages the agent opens, private hosts and uploads; its session grants remember the hosts the user allowed. `flushMs`: how soon a repeat count is audited (a seam for tests). */
  constructor(readonly permission: Permission, options: { lookup?: HostLookup; flushMs?: number } = {}) {
    this.#lookup = options.lookup;
    this.#flushMs = options.flushMs ?? AUDIT_FLUSH_MS;
    this.#policy = new PagePolicy({ report: (event) => this.#audit(event), ...(options.lookup ? { lookup: options.lookup } : {}) });
  }

  /**
   * Whether the agent may open `url` (navigate, a new tab, switching to a tab): the page's own ask, one prompt for a
   * private host. The host is classified once, there; a private target the permission allowed is the one the page may
   * load from, and the launched Chrome's proxy lets it through. The approval it returns is recorded for the tab that loads
   * the page (`approve(tab)`): it lasts for the whole browser session when the user granted `net.private` for the
   * session, otherwise (Allow once, or a mode that allows it) while that tab stays on the host. A public one is never
   * approved: if its name answers privately later, the page request, the proxy and the rebinding check refuse it.
   */
  async open(url: string): Promise<Approval> {
    const { privateGrant } = await checkBrowserUrl(url, this.#confirmer, this.permission, this.#callId ?? '', this.#lookup);
    if (!privateGrant) return () => undefined;
    const target = new URL(url);
    return (tab) => this.#policy.approve(target, privateGrant === 'session' ? 'session' : { tab });
  }

  /** One audit entry per distinct refusal or report: a page with many identical blocked requests is one entry and a count, not many entries. */
  #audit(event: NetworkEvent): void {
    if (event.kind === 'rebinding') {
      // Reported before the close is attempted; the console log says whether it succeeded (`page-network.ts`, closeRebound).
      this.#notice = `Closing the tab: ${event.url} answered from the private address ${event.address} (DNS rebinding).`;
      this.permission.refused([`${event.url} -> ${event.address}`], 'closing the tab: a public name answered from a private address (DNS rebinding)', 'browser');
    } else if (event.kind === 'blocked') {
      this.#auditOnce(`blocked ${hostOf(event.url)} ${event.resourceType} ${event.reason}`, (repeats) =>
        this.permission.refused([event.url], `${repeatNote(repeats)}blocked a page request (${event.resourceType}): ${event.reason}`, 'browser'),
      );
    } else {
      this.#auditOnce(`websocket ${hostOf(event.url)} ${event.reason}`, (repeats) =>
        this.permission.noted([event.url], `${repeatNote(repeats)}a page WebSocket was not blocked, reported only: ${event.reason}`, { allowed: true, via: 'reported', action: 'invariant', tool: 'browser' }),
      );
    }
  }

  /** A connection the launched Chrome's filtering proxy refused (a page chose a private or unvetted host). */
  #auditProxy(blocked: BlockedConnection): void {
    this.#auditOnce(`proxy ${blocked.host} ${blocked.reason}`, (repeats) =>
      this.permission.refused([blocked.host], `${repeatNote(repeats)}the filtering proxy refused a page connection to ${blocked.reason === 'private' ? 'a local or private address' : 'a host it could not vet'}`, 'browser'),
    );
  }

  /** Writes `write(0)` the first time `key` is seen; later ones are only counted, for `#flushRepeats`. Past `AUDIT_KEYS_MAX` distinct keys a new one is counted under `OVERFLOW_KEY`. */
  #auditOnce(key: string, write: (repeats: number) => void): void {
    const overflow = !this.#audited.has(key) && this.#audited.size >= AUDIT_KEYS_MAX;
    const name = overflow ? OVERFLOW_KEY : key;
    const known = this.#audited.get(name);
    if (known) {
      known.repeats += 1;
      this.#scheduleFlush();
      return;
    }
    const writer = overflow
      ? (repeats: number) => this.permission.refused([`more than ${AUDIT_KEYS_MAX} distinct blocked targets`], `${repeats + 1} more distinct refusals or reports after the first ${AUDIT_KEYS_MAX}, counted here and not listed one by one`, 'browser')
      : write;
    this.#audited.set(name, { repeats: 0, written: 0, write: writer });
    writer(0);
  }

  /** Audits the counts that grew soon, so a crash or a kill loses little: repeats are cumulative, a later summary replaces an earlier one. */
  #scheduleFlush(): void {
    if (this.#flushTimer) return;
    this.#flushTimer = setTimeout(() => {
      this.#flushTimer = undefined;
      this.#flushRepeats();
    }, this.#flushMs);
    this.#flushTimer.unref();
  }

  /** Audits the count of each entry that repeated since it was last written. */
  #flushRepeats(): void {
    for (const entry of this.#audited.values()) {
      if (entry.repeats <= entry.written) continue;
      entry.written = entry.repeats;
      entry.write(entry.repeats);
    }
  }

  /** Audits what is left and starts afresh: the browser session the entries belong to ended. */
  #endAudit(): void {
    clearTimeout(this.#flushTimer);
    this.#flushTimer = undefined;
    this.#flushRepeats();
    this.#audited.clear();
  }

  /** Remembers the calling tool's context for confirmations the session's pages trigger while it runs. */
  useContext(ctx: Confirmer | undefined, toolCallId?: string): void {
    this.#confirmer = ctx ?? NO_UI;
    this.#callId = toolCallId;
  }

  /** Whether a browser is open now, without opening one. */
  get isOpen(): boolean {
    return this.#session?.page.open === true;
  }

  async session(signal?: AbortSignal): Promise<BrowserSession> {
    if (this.#session?.page.open) return this.#session;
    // The page connection dropped: release what the old session owns before opening a new one.
    await this.close();
    return this.#start({ signal });
  }

  /** Drive a browser that is already open on a DevTools port, in its current page, instead of opening our own. */
  async attach(port: number | undefined, signal?: AbortSignal): Promise<BrowserSession> {
    if (!port) throw new Error('attach needs port (the DevTools port of an open browser).');
    await this.close();
    return this.#start({ port, reuseTab: true, signal });
  }

  async #start(options: { port?: number; reuseTab?: boolean; signal: AbortSignal | undefined }): Promise<BrowserSession> {
    const session = await openBrowser(process.env, { ...options, policy: this.#policy, onBlocked: (blocked) => this.#auditProxy(blocked) });
    if (this.#notice) session.warning = this.#notice;
    this.#notice = undefined;
    this.#session = session;
    return session;
  }

  /**
   * Ends the session. With `keepVisible` (session shutdown) a visible Chrome on the persistent profile stays open with
   * its tab, so the user can finish a login there and the next session reuses it.
   */
  async close(options: { keepVisible?: boolean } = {}): Promise<void> {
    const session = this.#session;
    this.#session = undefined;
    // What the browser session allowed and refused ends with it: a new Chrome starts with no approved host.
    this.#policy.revoke();
    this.#endAudit();
    if (!session) return;
    const keep = options.keepVisible === true && session.profile !== undefined;
    // A persistent-profile Chrome left open by an earlier run is quit by an explicit close, like one we launched.
    if (!keep && session.profile !== undefined && !session.chrome) await session.connection.send('Browser.close').catch(() => undefined);
    else if (!keep) await session.closeTab?.().catch(() => undefined);
    session.connection.close();
    session.consoleLog?.close();
    // Detached: Chrome runs in its own process group, so it outlives this process once nothing waits on it.
    if (keep) session.chrome?.process?.unref();
    else await session.chrome?.kill();
  }
}

const PARAMETERS = Type.Object({
  action: StringEnum(ACTIONS),
  url: Type.Optional(Type.String({ description: 'navigate: URL; waits until the page is quiet (up to 6s); tab: URL to open' })),
  port: Type.Optional(Type.Integer({ description: 'attach: DevTools port of an open browser' })),
  ref: Type.Optional(Type.Integer({ description: 'Element number from snapshot (open shadow DOM and same-origin frames included)' })),
  to: Type.Optional(Type.Integer({ description: 'drag: element number to drop on (or give text instead)' })),
  fields: Type.Optional(Type.Array(Type.Object({ ref: Type.Integer(), value: Type.String() }), { description: 'fill: fields to set' })),
  index: Type.Optional(Type.Integer({ description: 'tab: tab number from tabs' })),
  gone: Type.Optional(Type.Boolean({ description: 'wait: until text disappears' })),
  timeout: Type.Optional(Type.Number({ description: `wait (and navigate/snapshot with text): seconds (default ${WAIT_DEFAULT_S}, max ${WAIT_MAX_S})` })),
  text: Type.Optional(Type.String({ description: 'type: value to enter, replacing the current one. wait: text to wait for (gone: to disappear). navigate/snapshot: text to wait for before returning. drag: visible text of the drop zone. dialog: reply to a prompt().' })),
  format: Type.Optional(StringEnum(['jpeg', 'png'], { description: 'screenshot: image format (default jpeg; png only when the user asks for it)' })),
  accept: Type.Optional(Type.Boolean({ description: 'dialog: accept (default) or false to dismiss' })),
  files: Type.Optional(Type.Array(Type.String(), { description: 'upload: file paths' })),
  submit: Type.Optional(Type.Boolean({ description: 'Press Enter after typing' })),
  key: Type.Optional(Type.String({ description: 'press: key or combo, e.g. Enter, Escape, Control+A, Shift+Tab' })),
  expression: Type.Optional(Type.String({ description: 'JavaScript expression for evaluate' })),
});
type BrowserParams = Static<typeof PARAMETERS>;

export function registerBrowserTool(pi: ExtensionAPI, browser: BrowserTool): void {
  pi.registerTool(timedTool({
    name: 'browser',
    label: 'Browser',
    description:
      'Drive one Chrome session (JavaScript pages, forms, logins); headless unless visible mode is on. One action per call:\n' +
      'navigate(url), tab(url | index): snapshot = page text + numbered elements\n' +
      'snapshot(text?): wait for text first\n' +
      'click, hover(ref)\n' +
      'drag(ref, to | text)\n' +
      'type(ref, text, submit?), fill(fields), press(key)\n' +
      'wait(text, gone?), evaluate(expression)\n' +
      'screenshot(format?): jpeg (default) or png, shrunk to fit; result names the full-size file\n' +
      'dialog(accept?, text?), upload(ref, files), download(ref?)\n' +
      'tabs, console, info, close, attach(port: an open browser)\n' +
      'An element keeps its number while it stays on the page; a new document renumbers. Actions report what changed, so a fresh snapshot is rarely needed. A wait that times out fails with the current snapshot. Private/local addresses the agent opens (navigate, tab) and uploads outside the workspace need approval in manual and workspace permission modes. ' +
      'Requests the page itself starts (images, frames, scripts, fetch, redirects) to a private or local address are blocked without asking, except the address you opened. WebSockets: a launched Chrome blocks them through a filtering proxy (as it does DNS rebinding); in an attached or persistent-profile Chrome only the page and its requests are checked, so a page WebSocket to a private address is not stopped and is only reported.',
    promptSnippet: 'Inspect rendered pages and act on current element refs',
    promptGuidelines: ['Inspect the outcome before repeating a browser click or submission, and use existing user authorization for actions with side effects.'],
    // One shared page: parallel actions would race (a click against a navigation, stale element refs), so browser calls
    // run one at a time (`exclusive` below) while other tools in the same message still run beside them.
    parameters: PARAMETERS,
    renderCall: (args, theme, context) => browserCallHeader(args, theme, context),
    renderResult: (result, _options, theme, context) => browserResult(result, theme, context),
    async execute(id, params, signal, _onUpdate, ctx) {
      const { action } = params;
      const callCtx = { ...ctx, signal: signal ?? ctx.signal };
      browser.useContext(callCtx, id);
      try {
        if (isSessionAction(action)) return await SESSION_HANDLERS[action](browser, params, signal);
        const session = await browser.session(signal);
        if (session.dialog && PAGE_ACTIONS.has(action)) return pageResult(dialogNotice(session.dialog));
        return await PAGE_HANDLERS[action]({ session, page: session.page, params, signal, ctx: callCtx, browser, toolCallId: id });
      } catch (error) {
        throw visibleError(error);
      }
    },
  }, { exclusive: true }));
  pi.on('session_shutdown', async () => browser.close({ keepVisible: true }));
}

type ActionResult = { content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>; details: undefined };
type BrowserAction = (typeof ACTIONS)[number];
/** Actions that manage the session itself rather than act on its page. */
type SessionAction = 'close' | 'info' | 'attach';
type PageActionName = Exclude<BrowserAction, SessionAction>;

interface PageAction {
  session: BrowserSession;
  page: BrowserSession['page'];
  params: BrowserParams;
  signal: AbortSignal | undefined;
  /** Read only by the actions that need it (upload checks); URL checks go through `browser`. */
  ctx: ExtensionContext;
  browser: BrowserTool;
  toolCallId: string;
}

const SESSION_HANDLERS: Record<SessionAction, (browser: BrowserTool, params: BrowserParams, signal: AbortSignal | undefined) => Promise<ActionResult>> = {
  close: async (browser) => {
    await browser.close();
    return pageResult('Browser closed.');
  },
  info: async (browser, _params, signal) => {
    // A status query must not launch Chrome (a visible window under webLive).
    if (!browser.isOpen) return pageResult('No browser is open. navigate or attach starts one.');
    const { kind, port, headless, page, profile, dialog } = await browser.session(signal);
    const where = kind === 'own' ? `own Chrome (${headless ? 'headless' : 'visible'})` : kind === 'attached' ? 'attached window' : 'shared Chrome, own tab';
    const current = dialog ? dialogNotice(dialog) : String(await page.evaluate('location.href + " | " + document.title', signal));
    return pageResult(`${where}${profile ? ` · profile ${profile}` : ''} · DevTools port ${port} · ${current}`);
  },
  attach: async (browser, params, signal) => {
    const session = await browser.attach(params.port, signal);
    return pageResult(`Attached to the browser on DevTools port ${session.port}. Other CDP tools (for example the octocode-chrome-devtools skill's scripts) can use --port ${session.port}.\n\n${await snapshot(session, signal)}`);
  },
};

const isSessionAction = (action: BrowserAction): action is SessionAction => Object.hasOwn(SESSION_HANDLERS, action);

/**
 * Runs page input that may open a dialog (the snapshot after it then reports the dialog instead of hanging), waits
 * for the page to settle, and follows a tab the input opened.
 */
async function input({ session, page, signal }: PageAction, start: () => Promise<unknown>): Promise<ActionResult> {
  const before = await tabIds(session);
  // Started only now, so a failure cannot go unhandled while the tab list is read.
  const note = await page.untilDialog(start());
  if (!session.dialog) await page.untilDialog(settle(page, signal));
  const opened = session.dialog ? undefined : await followNewTab(session, before, signal);
  const after = opened ? `This action opened a new tab; now driving it (tabs lists all).\n\n${await snapshot(session, signal)}` : await snapshot(session, signal, { changesOnly: true });
  return pageResult(withBlockedNote(session, typeof note === 'string' && note ? `${note}\n\n${after}` : after));
}

/** `text` led by a line naming the page request the policy refused, and one for what it could only report, since the last report; both are then forgotten. */
function withBlockedNote(session: BrowserSession, text: string): string {
  const { blocked, warning } = session;
  delete session.blocked;
  delete session.warning;
  return `${blocked ? `Blocked a page load: ${blocked}\n\n` : ''}${warning ? `Warning: ${warning}\n\n` : ''}${text}`;
}

/**
 * What `checkBrowserUrl` decided: the one classification of the host it made, and, for a non-public host (the only one
 * that asks `net.private`), how long the permission lasts: `call` (Allow once, or a mode that allows it) or `session`
 * (a session grant or kind). Absent for a public host.
 */
interface CheckedUrl {
  host: HostClass;
  privateGrant?: 'call' | 'session';
}

/**
 * The session grant for opening `url`: keyed by host and effective port (80 and 443 when the URL omits it), so a grant
 * given for `http://localhost` does not cover `https://localhost`. The label names the same host and port.
 */
function grantFor(url: URL, prefix = ''): { key: string; label: string } {
  return { key: `${prefix}${keyOf(url)}`, label: `${url.hostname}:${portOf(url)}` };
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** Leads the audit reason of a summary (a long reason may be cut for display, so the count goes first). */
const repeatNote = (repeats: number): string => (repeats > 0 ? `(${repeats + 1} times this browser session) ` : '');

/**
 * The check on a page the *agent* opens (navigate, a new tab, switching to a tab); what the page itself requests is
 * refused by `PagePolicy` without asking. Refuses non-http(s) URLs. A private or local host (loopback, LAN, cloud
 * metadata) is a `net.private` permission ask (allowed per host for the session): page content steers the agent, so it
 * must not reach internal services the `web` tool keeps out. A public page is the `browser` ask, and a private one is
 * one prompt carrying both reasons.
 */
export async function checkBrowserUrl(raw: string, ctx: Confirmer, permission: Permission, toolCallId: string, lookup?: HostLookup): Promise<CheckedUrl> {
  const url = parseUrl(raw);
  if (!isHttpUrl(url)) throw new Error(httpOnlyRefusal(url));
  const host = await classifyHost(url, lookup);
  const call = { toolCallId, ...(ctx.signal ? { signal: ctx.signal } : {}) };
  if (host.kind === 'public') {
    const verdict = await permission.check(ctx, { action: 'browser', title: 'Open this page?', what: [url.href], grant: grantFor(url, 'host '), ...call });
    if (!verdict.allowed) throw new Error(verdict.message);
    return { host };
  }
  // A name that does not resolve here may still resolve in Chrome (its own DNS, hosts file, proxy) to a private address.
  const what = host.kind === 'private' ? 'a local or private network address' : 'a name that does not resolve here and may reach a local or private address';
  const alsoAsks = decide(permission.mode, 'browser') === 'ask';
  const verdict = await permission.check(ctx, {
    action: 'net.private',
    title: 'Open a private address?',
    what: [`The browser wants to open ${url.host}, ${what}.`],
    ...(alsoAsks ? { reason: actionWhy('browser') } : {}),
    grant: grantFor(url),
    ...call,
  });
  if (verdict.allowed) return { host, privateGrant: verdict.lasts };
  throw new Error(`${blockedHost(host)}: ${url.host}. ${verdict.message}`);
}

/**
 * Upload paths resolved against `cwd` and through symlinks: the files Chrome will read, returned for the upload. An
 * upload is browser control and asks every call; a path outside the workspace (a symlink inside it pointing out
 * included) makes it an outside upload too, and one prompt names both reasons.
 */
export async function checkUploadPaths(files: readonly string[], ctx: Pick<ExtensionContext, 'cwd'> & Confirmer, permission: Permission, toolCallId?: string): Promise<string[]> {
  // The workspace is the repository root, and none at all when that is the home folder or above it: then every path is outside.
  const workspace = workspaceRoot(ctx.cwd);
  const root = workspace === undefined ? undefined : resolvedTarget(workspace);
  const paths = files.map((file) => resolvedTarget(path.resolve(ctx.cwd, file)));
  const outside = paths.filter((file) => root === undefined || !isWithin(file, root));
  const verdict = await permission.check(ctx, {
    action: 'browser.control',
    ...(outside.length > 0 ? { also: ['upload.outside' as const] } : {}),
    title: outside.length > 0 ? 'Upload files from outside the workspace?' : 'Upload files to the page?',
    what: outside.length > 0 ? outside : paths,
    ...(toolCallId ? { toolCallId } : {}),
    cwd: ctx.cwd,
    ...(ctx.signal ? { signal: ctx.signal } : {}),
  });
  if (verdict.allowed) return paths;
  throw new Error(outside.length > 0 ? `Refused to upload files outside the workspace: ${outside.join(', ')}. ${verdict.message}` : `Refused to upload files: ${verdict.message}`);
}

/** `file` with symlinks resolved; a missing tail (a file that does not exist yet) is kept under its real parent. */
function resolvedTarget(file: string): string {
  try {
    return fs.realpathSync(file);
  } catch {
    const parent = path.dirname(file);
    return parent === file ? file : path.join(resolvedTarget(parent), path.basename(file));
  }
}

async function navigate({ session, page, params, signal, browser }: PageAction): Promise<ActionResult> {
  if (!params.url) throw new Error('navigate needs url');
  (await browser.open(params.url))(session.targetId);
  delete session.blocked;
  // The wait starts before the command so a fast load is not missed; `done` ends it when the command fails, and a
  // dialog (an alert() while loading holds the load event) ends it at once: the snapshot then reports the dialog.
  const done = new AbortController();
  const loaded = page.untilDialog(page.waitFor('Page.loadEventFired', NAVIGATE_LOAD_MS, signal ? AbortSignal.any([signal, done.signal]) : done.signal));
  // Handled here so a navigate that throws before awaiting it leaves no unhandled rejection; the await below still sees it.
  loaded.catch(() => undefined);
  try {
    const result = await page.send<{ errorText?: string; loaderId?: string }>('Page.navigate', { url: params.url }, signal);
    if (result.errorText) throw new Error(`Navigation failed: ${result.errorText}${session.blocked ? ` (blocked ${session.blocked})` : ''}`);
    // A same-document navigation (a #fragment) has no loader and fires no load event.
    if (result.loaderId) await loaded;
  } finally {
    done.abort();
  }
  // The load event fires before most apps fetch and render their data (prices, localized currency).
  // An open dialog (before or during the wait) leaves nothing to settle: the snapshot reports it.
  const load = session.dialog ? undefined : await page.untilDialog(settleAfterLoad(page, signal));
  const waited = params.text ? await waitUntil(session, params.text, params.timeout, signal) : '';
  const note =
    !load || load.settled || params.text ? ''
    : load.failed ? '\n\nNote: the page may still be loading (waiting for it to settle failed). Use wait (text) or snapshot again for content that loads late.'
    : '\n\nNote: the page was still changing 6s after loading; values may still update. Use wait (text) or snapshot again for content that loads late.';
  return pageResult(withBlockedNote(session, `${waited}${await snapshot(session, signal)}${note}`));
}

async function dragAction(action: PageAction): Promise<ActionResult> {
  const { page, params, signal } = action;
  const from = requireRef(params.ref);
  if (params.to === undefined && !params.text) throw new Error('drag needs to (the element number to drop on), or text (visible text of the drop zone).');
  const to = params.to ?? (await refForText(page, params.text!, signal));
  return input(action, () => drag(page, from, to, signal));
}

async function fill(action: PageAction): Promise<ActionResult> {
  const { page, params, signal } = action;
  if (!params.fields?.length) throw new Error('fill needs fields: [{ ref, value }].');
  const fields = params.fields;
  const failures: string[] = [];
  const result = await input(action, () => fillFields(page, fields, signal).then((failed) => void failures.push(...failed)));
  if (failures.length === fields.length) throw new Error(`No field was filled:\n${failures.join('\n')}`);
  const head = `Filled ${fields.length - failures.length} of ${fields.length} field(s).${failures.length ? `\nFailed:\n${failures.join('\n')}` : ''}`;
  // The body is already escaped; it is not run through a second, stripping pass (a CRLF in it stays a CRLF).
  return pageResult(`${head}\n\n${contentText(result.content)}`);
}

async function wait({ session, page, params, signal }: PageAction): Promise<ActionResult> {
  if (!params.text) throw new Error('wait needs text (the text to wait for).');
  const seconds = Math.min(Math.max(params.timeout ?? WAIT_DEFAULT_S, 1), WAIT_MAX_S);
  const took = await withSnapshotOnTimeout(session, signal, () => waitForText(page, params.text!, params.gone === true, seconds * 1000, signal));
  if (took === undefined) return pageResult(await snapshot(session, signal));
  return pageResult(`${JSON.stringify(params.text)} ${params.gone ? 'is gone' : 'appeared'} after ${formatDuration(took, true)}.\n\n${await snapshot(session, signal, { changesOnly: true })}`);
}

async function evaluate({ page, params, signal }: PageAction): Promise<ActionResult> {
  if (!params.expression) throw new Error('evaluate needs expression');
  const value = await page.evaluate(params.expression, signal);
  return pageResult(capOutputToFile(visibleControls(typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? 'undefined'), { label: 'browser_evaluate' }));
}

/** One handler per page action; each validates its own parameters. */
const PAGE_HANDLERS: Record<PageActionName, (action: PageAction) => Promise<ActionResult>> = {
  navigate,
  snapshot: async ({ session, params, signal }) => {
    const waited = params.text ? await waitUntil(session, params.text, params.timeout, signal) : '';
    return pageResult(`${waited}${await snapshot(session, signal)}`);
  },
  click: (action) => input(action, () => click(action.page, requireRef(action.params.ref), action.signal)),
  hover: (action) => input(action, () => hover(action.page, requireRef(action.params.ref), action.signal)),
  drag: dragAction,
  // Refusals (no such element or option, not a text field) throw before any input, so nothing lands elsewhere.
  type: (action) => {
    if (action.params.text === undefined) throw new Error('type needs text (the value to enter, or the <select> option label).');
    return input(action, () => typeInto(action.page, requireRef(action.params.ref), action.params.text!, action.params.submit === true, action.signal));
  },
  fill,
  press: (action) => {
    // No default key: a forgotten key must not press Enter and submit a form.
    if (!action.params.key) throw new Error('press needs key (e.g. Enter, Escape, Control+A).');
    return input(action, () => pressKey(action.page, action.params.key!, action.signal));
  },
  wait,
  tabs: async ({ session }) => pageResult(await describeTabs(session)),
  tab: async ({ session, params, signal, browser }) => {
    if (params.url) await newTab(session, params.url, await browser.open(params.url), signal);
    else await selectTab(session, params.index, (target) => browser.open(target), signal);
    return pageResult(withBlockedNote(session, await snapshot(session, signal)));
  },
  dialog: async ({ session, params, signal }) => pageResult(await answerDialog(session, params.accept ?? true, params.text, signal)),
  upload: async ({ page, params, signal, ctx, browser, toolCallId }) => {
    const files = await checkUploadPaths(params.files ?? [], ctx, browser.permission, toolCallId);
    return pageResult(await uploadFiles(page, requireRef(params.ref), elementExpr(requireRef(params.ref)), files, signal));
  },
  download: async ({ session, page, params, signal }) => {
    const ref = params.ref;
    return pageResult(await download(session, ref === undefined ? undefined : async () => void (await page.untilDialog(click(page, ref, signal))), signal));
  },
  evaluate,
  screenshot: ({ page, params, signal, ctx }) => screenshot(page, params.format === 'png' ? 'png' : 'jpeg', signal, imageLimits(ctx.model)),
  console: async ({ session }) => {
    const { dropped, cleared } = session.consoleLost;
    // The buffer is a limited window; what it no longer holds is gone, so say how much instead of looking complete.
    const lost = [
      ...(dropped > 0 ? [`[${dropped} earlier console line${dropped === 1 ? '' : 's'} dropped from this view: only the last ${CONSOLE_KEEP} are kept]`] : []),
      ...(cleared > 0 ? [`[${cleared} line${cleared === 1 ? '' : 's'} from earlier tabs left this view when the tab changed]`] : []),
      // Dropped lines stay reachable in the log; say where, and what the log itself no longer holds.
      ...(dropped + cleared > 0 && session.consoleLog ? [`[${session.consoleLog.describe()}; search it or read it by line range]`] : []),
    ];
    const lines = session.console.length > 0 ? capOutputToFile(visibleControls(session.console.join('\n')), { label: 'browser_console' }) : '(no console messages)';
    return pageResult([...lost, lines].join('\n'));
  },
};

/** Page text (titles, snapshots, dialog messages, evaluate results) is untrusted: control and invisible characters show as visible escapes (`visibleControls`), never dropped. */
function pageResult(text: string) {
  return textResult(visibleControls(text));
}

/** Waits for `text` before a snapshot (navigate, snapshot); a line saying how long it took. An open dialog (which blocks the page) skips it: the snapshot reports the dialog. */
async function waitUntil(session: BrowserSession, text: string, timeout: number | undefined, signal?: AbortSignal): Promise<string> {
  const seconds = Math.min(Math.max(timeout ?? WAIT_DEFAULT_S, 0), WAIT_MAX_S);
  const ms = session.dialog ? undefined : await withSnapshotOnTimeout(session, signal, () => waitForText(session.page, text, false, seconds * 1000, signal));
  return ms === undefined ? '' : `${JSON.stringify(text)} appeared after ${formatDuration(ms, true)}.\n\n`;
}

/** A timed-out wait still fails, but carries the current page so the model sees where it landed instead of retrying blind. */
async function withSnapshotOnTimeout<T>(session: BrowserSession, signal: AbortSignal | undefined, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (signal?.aborted || !(error instanceof Error) || !error.message.startsWith('Timed out after')) throw error;
    // Bounded: a page that stopped answering must not stretch the failed wait.
    const current = await withTimeout(snapshot(session, signal), 3_000, 'snapshot').catch(() => '');
    throw new Error(visibleControls(current ? `${error.message}\n\nCurrent page:\n${current}` : error.message));
  }
}

function requireRef(ref: number | undefined): number {
  if (ref === undefined) throw new Error('This action needs ref (element number from snapshot).');
  return ref;
}
