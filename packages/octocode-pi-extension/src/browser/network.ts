import net from 'node:net';
import { classifyHost, isBlockedIp, type HostClass, type HostLookup } from '../web/guard.js';
import type { NetworkEvent, PageNetworkPolicy, RequestSource } from './cdp.js';

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
const bare = (hostname: string): string => hostname.replace(/^\[|\]$/g, '');
export const portOf = (url: URL): number => (url.port ? Number(url.port) : (DEFAULT_PORTS[url.protocol] ?? 0));
/** `hostname:port`, the port being the effective one (80 and 443 when the URL omits it): what an approval, a grant and the proxy's allowance are keyed by. */
export const keyOf = (url: URL): string => `${bare(url.hostname)}:${portOf(url)}`;

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
    try {
      if (keyOf(new URL(url)) === key) return;
    } catch {
      // Not a URL (about:blank is one; an empty target is not): not the approved host.
    }
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
    return this.#holds(`${bare(hostname)}:${port}`);
  }

  #holds(key: string): boolean {
    return this.#approved.has(key) || [...this.#tabs.values()].includes(key);
  }

  /** Whether a request from `source` may reach `key`: a session approval, the source tab's own, or the own host of a worker of an origin some tab holds. */
  #permits(key: string, source: RequestSource): boolean {
    if (this.#approved.has(key)) return true;
    if (source.tab !== undefined && this.#tabs.get(source.tab) === key) return true;
    if (source.origin === undefined) return false;
    try {
      return keyOf(new URL(source.origin)) === key && this.#holds(key);
    } catch {
      return false;
    }
  }

  /** Resolves when a page may request `url`; rejects, saying why, when it may not. A host's verdict is reused for a short time. */
  async check(raw: string, resourceType: string, source: RequestSource = {}): Promise<void> {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new Error(`Not a URL: ${raw}`);
    }
    const web = url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'ws:' || url.protocol === 'wss:';
    if (!web) {
      // data:, blob: and the like reach nothing; a document that is not http(s) (file:, javascript:) is still refused.
      if (resourceType === 'Document') throw new Error(`The browser opens http(s) URLs only, not ${url.protocol}`);
      return;
    }
    if (this.#permits(keyOf(url), source)) return;
    const host = await this.#classify(url);
    if (host.kind === 'public') return;
    const refusal = host.kind === 'private' ? 'Blocked private or local address' : 'Blocked unresolved host';
    throw new Error(`${refusal}: ${url.host}. A page cannot open it; only an address the agent opens itself can be reached.`);
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
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || net.isIP(bare(url.hostname)) || this.#holds(keyOf(url))) return false;
    if (port !== undefined && port !== portOf(url)) return false;
    return isBlockedIp(bare(address));
  }

  #classify(url: URL): Promise<HostClass> {
    const name = bare(url.hostname).toLowerCase();
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
