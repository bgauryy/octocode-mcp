import net from 'node:net';
import { bareHostname, classifyHost, isBlockedIp, isHttpUrl, type HostClass, type HostLookup } from '../web/guard.js';
import type { NetworkEvent, PageNetworkPolicy, RequestSource } from './policy.js';

/**
 * What a page may reach. The agent chooses targets (`navigate`, `open`, `tab`) through the permission matrix; anything
 * the *page* chooses (subresources, subframes, redirects, links, scripts) is refused when its host is private or cannot
 * be vetted here, in every mode and without a prompt, unless the agent opened that host and port itself
 * (`approve`): a page it was approved to load must be able to load its own files.
 *
 * How long an approval lasts follows what the user allowed. "Allow once" (and a mode that allows it) approves the host
 * for the tab the agent opened it in, while that tab stays on that host (its own documents, frames and subresources, and
 * the workers of its origin); it ends when the tab navigates to another host or closes. An "Allow ... for the session"
 * grant approves the host for every tab until the browser session ends. A public page in another tab never reaches an
 * approved private host on a once-approval.
 *
 * `approve` follows the `net.private` permission and never decides anything itself: the caller classified the host once
 * (`checkBrowserUrl`) and passes only a target whose private class the permission allowed. Classifying again here would
 * let a name that answers public to the first lookup and private to the second skip that permission.
 */

/** How long a host's classification is reused: DNS answers change, and a name that failed to resolve may resolve a moment later. */
const VERDICT_TTL_MS = 30_000;
/**
 * Most host verdicts kept. Expired ones are dropped on the way in; past this bound the oldest goes. A dropped verdict
 * loses no evidence: the host is resolved and classified again the next time a request names it.
 */
export const VERDICTS_MAX = 500;

const DEFAULT_PORTS: Readonly<Record<string, number>> = { 'http:': 80, 'ws:': 80, 'https:': 443, 'wss:': 443 };
export const portOf = (url: URL): number => (url.port ? Number(url.port) : (DEFAULT_PORTS[url.protocol] ?? 0));
/** `hostname:port` with brackets off an IPv6 literal: what an approval, a grant and the proxy's allowance are keyed by (see `keyOf`). */
export const hostKey = (hostname: string, port: number): string => `${bareHostname(hostname)}:${port}`;
/** `hostKey` of a URL, the port being the effective one (80 and 443 when the URL omits it). */
export const keyOf = (url: URL): string => hostKey(url.hostname, portOf(url));
/** `keyOf` of a URL given as text; undefined when it is not one (an empty target, say). */
const keyOfText = (raw: string): string | undefined => {
  try {
    return keyOf(new URL(raw));
  } catch {
    return undefined;
  }
};

/** `raw` as a URL, or the refusal that says it is not one. */
export function parseUrl(raw: string): URL {
  try {
    return new URL(raw);
  } catch {
    throw new Error(`Not a URL: ${raw}`);
  }
}
/** The refusal for a URL the browser would open that is not http(s). */
export const httpOnlyRefusal = (url: URL): string => `The browser opens http(s) URLs only, not ${url.protocol}`;
/** What a host that is not public is refused as (`private`: a non-public address; `unresolved`: a name nothing here could vet). */
export const blockedHost = (host: Exclude<HostClass, { kind: 'public' }>): string => (host.kind === 'private' ? 'Blocked private or local address' : 'Blocked unresolved host');

interface PagePolicyOptions {
  /** Where refusals and reports go (the permission audit). */
  report: (event: NetworkEvent) => void;
  /** Resolves host names; the `web` tool's resolver by default. */
  lookup?: HostLookup;
  now?: () => number;
}

export class PagePolicy implements PageNetworkPolicy {
  readonly #report: (event: NetworkEvent) => void;
  readonly #lookup: HostLookup | undefined;
  readonly #now: () => number;
  /**
   * Hosts the agent opened with a session grant of `net.private`, by `hostname:port`: every tab may load from them until
   * the browser session ends (`revoke`). The permission's own grant lasts for the Pi session, so opening the host again in
   * a later browser session asks nothing new and records the approval afresh.
   */
  readonly #approved = new Set<string>();
  /** The one private host each tab was opened on without a session grant (tab target id to `hostname:port`), until the tab leaves it or closes. */
  readonly #tabs = new Map<string, string>();
  readonly #verdicts = new Map<string, { at: number; host: Promise<HostClass> }>();

  constructor(options: PagePolicyOptions) {
    this.#report = options.report;
    this.#lookup = options.lookup;
    this.#now = options.now ?? Date.now;
  }

  report(event: NetworkEvent): void {
    this.#report(event);
  }

  /**
   * Records a private or unresolved target the agent opened and the `net.private` permission allowed, so the page may load
   * from it: for the whole browser session (`'session'`, a session grant) or for `tab` while it stays on that host. Never
   * for a public host, and never decided here.
   */
  approve(url: URL, scope: 'session' | { tab: string }): void {
    if (scope === 'session') this.#approved.add(keyOf(url));
    else this.#tabs.set(scope.tab, keyOf(url));
  }

  /** Forgets every approval: the browser session they belong to ended. */
  revoke(): void {
    this.#approved.clear();
    this.#tabs.clear();
  }

  /** The main frame of `tab` committed `url`: a tab's approval ends when it is on any other host. */
  navigated(tab: string, url: string): void {
    const key = this.#tabs.get(tab);
    if (key === undefined) return;
    // Not a URL (about:blank is one; an empty target is not): not the approved host.
    if (keyOfText(url) === key) return;
    this.#tabs.delete(tab);
  }

  /** `popup` was opened by `opener`: it holds what `opener` holds, until it navigates to another host or closes (a page of an approved host may open another page of it). */
  opened(opener: string, popup: string): void {
    const key = this.#tabs.get(opener);
    if (key !== undefined) this.#tabs.set(popup, key);
  }

  /** `tab` closed: what it was approved for ends with it. */
  closed(tab: string): void {
    this.#tabs.delete(tab);
  }

  /** Whether some approval covers `hostname:port` for any tab: what the launched Chrome's proxy, which cannot tell tabs apart, lets through. */
  approves(hostname: string, port: number): boolean {
    return this.#holds(hostKey(hostname, port));
  }

  #holds(key: string): boolean {
    return this.#approved.has(key) || [...this.#tabs.values()].includes(key);
  }

  /** Whether a request from `source` may reach `key`: a session approval, the source tab's own, or the own host of a worker of an origin some tab holds. */
  #permits(key: string, source: RequestSource): boolean {
    if (this.#approved.has(key)) return true;
    if (source.tab !== undefined && this.#tabs.get(source.tab) === key) return true;
    return source.origin !== undefined && keyOfText(source.origin) === key && this.#holds(key);
  }

  /** Resolves when a page may request `url`; rejects, saying why, when it may not. A host's verdict is reused for a short time. */
  async check(raw: string, resourceType: string, source: RequestSource = {}): Promise<void> {
    const url = parseUrl(raw);
    const web = Object.hasOwn(DEFAULT_PORTS, url.protocol);
    if (!web) {
      // data:, blob: and the like reach nothing; a document that is not http(s) (file:, javascript:) is still refused.
      if (resourceType === 'Document') throw new Error(httpOnlyRefusal(url));
      return;
    }
    if (this.#permits(keyOf(url), source)) return;
    const host = await this.#classify(url);
    if (host.kind === 'public') return;
    throw new Error(`${blockedHost(host)}: ${url.host}. A page cannot open it; only an address the agent opens itself can be reached.`);
  }

  /**
   * Whether a response from `address` (and `port`, when Chrome says which) for `url` shows Chrome connected somewhere the
   * check did not allow: a public name that now answers with a private address (DNS rebinding). A connection to another
   * port than the URL's goes through a proxy, so its address says nothing.
   */
  rebinds(raw: string, address: string, port?: number): boolean {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return false;
    }
    if (!isHttpUrl(url) || net.isIP(bareHostname(url.hostname)) || this.#holds(keyOf(url))) return false;
    if (port !== undefined && port !== portOf(url)) return false;
    return isBlockedIp(bareHostname(address));
  }

  #classify(url: URL): Promise<HostClass> {
    const name = bareHostname(url.hostname).toLowerCase();
    const known = this.#verdicts.get(name);
    if (known && this.#now() - known.at < VERDICT_TTL_MS) return known.host;
    const now = this.#now();
    for (const [stale, verdict] of this.#verdicts) if (now - verdict.at >= VERDICT_TTL_MS) this.#verdicts.delete(stale);
    if (this.#verdicts.size >= VERDICTS_MAX) this.#verdicts.delete(this.#verdicts.keys().next().value!);
    const host = classifyHost(url, this.#lookup);
    this.#verdicts.set(name, { at: now, host });
    return host;
  }
}
