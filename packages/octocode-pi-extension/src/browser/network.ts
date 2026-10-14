import net from 'node:net';
import { classifyHost, isBlockedIp, type HostClass, type HostLookup } from '../web/guard.js';
import type { NetworkEvent, PageNetworkPolicy } from './cdp.js';

/**
 * What a page may reach. The agent chooses targets (`navigate`, `open`, `tab`) through the permission matrix; anything
 * the *page* chooses (subresources, subframes, redirects, links, scripts) is refused when its host is private or cannot
 * be vetted here, in every mode and without a prompt, unless the agent opened that host and port itself
 * (`approve`): a page it was approved to load must be able to load its own files.
 */

/** How long a host's classification is reused: DNS answers change, and a name that failed to resolve may resolve a moment later. */
const VERDICT_TTL_MS = 30_000;

const DEFAULT_PORTS: Readonly<Record<string, number>> = { 'http:': 80, 'ws:': 80, 'https:': 443, 'wss:': 443 };
const bare = (hostname: string): string => hostname.replace(/^\[|\]$/g, '');
const portOf = (url: URL): number => (url.port ? Number(url.port) : (DEFAULT_PORTS[url.protocol] ?? 0));
const keyOf = (url: URL): string => `${bare(url.hostname)}:${portOf(url)}`;

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
  /** Hosts the agent opened that are not public, by `hostname:port`. */
  readonly #approved = new Map<string, URL>();
  readonly #verdicts = new Map<string, { at: number; host: Promise<HostClass> }>();

  constructor(options: PagePolicyOptions) {
    this.#report = options.report;
    this.#lookup = options.lookup;
    this.#now = options.now ?? Date.now;
  }

  report(event: NetworkEvent): void {
    this.#report(event);
  }

  /** The targets the agent opened that are not public, for a Chrome that starts later. */
  get approved(): readonly URL[] {
    return [...this.#approved.values()];
  }

  /** Records a target the agent opened. Returns whether it is not public, so the page may load from it and a proxy must let it through. */
  async approve(url: URL): Promise<boolean> {
    if ((await this.#classify(url)).kind === 'public') return false;
    this.#approved.set(keyOf(url), url);
    return true;
  }

  /** Resolves when a page may request `url`; rejects, saying why, when it may not. A host's verdict is reused for a short time. */
  async check(raw: string, resourceType: string): Promise<void> {
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
    if (this.#approved.has(keyOf(url))) return;
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
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || net.isIP(bare(url.hostname)) || this.#approved.has(keyOf(url))) return false;
    if (port !== undefined && port !== portOf(url)) return false;
    return isBlockedIp(bare(address));
  }

  #classify(url: URL): Promise<HostClass> {
    const name = bare(url.hostname).toLowerCase();
    const known = this.#verdicts.get(name);
    if (known && this.#now() - known.at < VERDICT_TTL_MS) return known.host;
    const host = classifyHost(url, this.#lookup);
    this.#verdicts.set(name, { at: this.#now(), host });
    return host;
  }
}
