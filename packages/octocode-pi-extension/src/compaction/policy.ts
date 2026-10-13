import type { Api, Model } from '@earendil-works/pi-ai';
import { CACHE_RETENTION_ENV } from '../shared/env.js';
import { isRecord } from '../shared/util.js';
import { REQUEST_PRESSURE_CHARS, type ContextEntry } from './images.js';

/**
 * When trims pay for themselves. A trim removes tokens from every later request but, on a warm cache, makes the next
 * request rewrite the prompt from the first edited entry on. The inputs are the model's own prices, Pi's compaction
 * settings and the session's real usage; the constants below are only fallbacks for what those do not say.
 */

/** About 4 characters per token: the conversion Pi's own context estimate uses. */
export const CHARS_PER_TOKEN = 4;
/** Pi's defaults (docs/compaction.md) when the settings leave them out. */
const PI_DEFAULT_KEEP_RECENT_TOKENS = 20_000;
const PI_DEFAULT_RESERVE_TOKENS = 16_384;
/** Anthropic's prices relative to base input, for a model with no cost rates: cache read 0.1×, 5-minute write 1.25×, 1-hour write 2×. */
const RELATIVE_RATES = { read: 0.1, short: 1.25, long: 2 } as const;
/** Idle gaps needed before this session's own history is trusted over Pi's constant continuation estimate. */
const MIN_IDLE_SAMPLES = 5;

export interface CacheRates {
  read: number;
  write: number;
}

/** Pi's compaction settings, as `pi.getSettings()` returns them. */
export interface CompactionSettingsView {
  compaction?: { reserveTokens?: number; keepRecentTokens?: number };
}

/**
 * Price per token of a cache read and of a cache write for the retention in use. A 1-hour write costs 2× input (how
 * pi-ai prices `cacheWrite1h`); a model without prices falls back to Anthropic's ratios, which only the ratio matters for.
 */
export function cacheRates(model: Pick<Model<Api>, 'cost'> | undefined, env: NodeJS.ProcessEnv = process.env): CacheRates {
  const long = env[CACHE_RETENTION_ENV] === 'long';
  const cost = model?.cost;
  if (cost && cost.input > 0 && cost.cacheRead > 0) return { read: cost.cacheRead, write: long ? 2 * cost.input : cost.cacheWrite > 0 ? cost.cacheWrite : RELATIVE_RATES.short * cost.input };
  return { read: RELATIVE_RATES.read, write: long ? RELATIVE_RATES.long : RELATIVE_RATES.short };
}

/** The recent tail kept verbatim, in characters: the tail Pi keeps unsummarized when it compacts (`compaction.keepRecentTokens`). */
export function recentWindowChars(settings: CompactionSettingsView): number {
  return (settings.compaction?.keepRecentTokens ?? PI_DEFAULT_KEEP_RECENT_TOKENS) * CHARS_PER_TOKEN;
}

/** Tokens Pi reserves below the window before it compacts (`compaction.reserveTokens`). */
export function reserveTokens(settings: CompactionSettingsView): number {
  return settings.compaction?.reserveTokens ?? PI_DEFAULT_RESERVE_TOKENS;
}

/** When the cached prompt was last written or refreshed, and how long such an entry lives. */
export interface CacheState {
  written: number | undefined;
  ttlMs: number | undefined;
}

/**
 * Context use (percent of the window) from which trims are due whatever the cache: the room matters more than one
 * rewrite, and trimming at half the window keeps Pi's summary compaction (at the window less `reserveTokens`) away.
 */
export const TRIM_PRESSURE_PERCENT = 50;

/**
 * Whether trims cost no cache rewrite now: the next request misses the cache anyway (a lifetime passed since the prompt
 * was last written or kept warm, or the model has no prompt cache), or the context is under real pressure (half the
 * window, or a request size gateways reject). Otherwise a batch must pay for its rewrite (`batchNet`).
 */
export function trimsDue(cache: CacheState, usagePercent: number | null | undefined, now = Date.now(), sizeChars = 0): boolean {
  if (usagePercent != null && usagePercent >= TRIM_PRESSURE_PERCENT) return true;
  if (sizeChars >= REQUEST_PRESSURE_CHARS) return true;
  if (cache.ttlMs === undefined) return true;
  return cache.written !== undefined && now - cache.written >= cache.ttlMs;
}

/**
 * How many more requests will reuse the current context: about as many as already did (a session tends to continue as
 * long as it has run), but no more than the growth that fits before Pi compacts the context (which rewrites it anyway).
 */
export function futureRequests(usage: { requests: number; tokens: number | null; contextWindow: number; reserveTokens: number }): number {
  if (usage.requests <= 0) return 1;
  if (usage.tokens === null || usage.tokens <= 0 || usage.contextWindow <= 0) return usage.requests;
  const growth = usage.tokens / usage.requests;
  const room = Math.floor((usage.contextWindow - usage.reserveTokens - usage.tokens) / growth);
  return Math.max(1, Math.min(usage.requests, room));
}

/** A planned batch in token-equivalent character units: text characters, and Pi's image token estimates × 4. */
export interface TrimBatch {
  savedChars: number;
  rewriteChars: number;
}

export interface TrimEconomy {
  due: boolean;
  rates: CacheRates;
  futureRequests: number;
  /** Share of requests that found the cache cold (they write the prompt instead of reading it); 0 when unknown. */
  coldShare?: number;
}

/**
 * What a batch is worth, in price × tokens; it runs only when positive. The removed tokens S are saved on the next
 * request (written: S × write) and on each later one (S × (read, or write when that request finds the cache cold)).
 * Unless `due`, the next request also writes the rewritten tail R instead of reading it: R × (write − read).
 */
export function batchNet(batch: TrimBatch, economy: TrimEconomy): number {
  const saved = batch.savedChars / CHARS_PER_TOKEN;
  const rewritten = batch.rewriteChars / CHARS_PER_TOKEN;
  const { read, write } = economy.rates;
  const cold = economy.coldShare ?? 0;
  const later = (1 - cold) * read + cold * write;
  const benefit = saved * (write + later * Math.max(0, economy.futureRequests - 1));
  return benefit - (economy.due ? 0 : rewritten * (write - read));
}

/** Share of the context's replies whose request found no cached prefix (no cache read, but a cache write). */
export function coldShare(messages: readonly unknown[]): number {
  const usages = messages.flatMap((message) => (isRecord(message) && message['role'] === 'assistant' && isRecord(message['usage']) ? [message['usage']] : []));
  if (usages.length === 0) return 0;
  return usages.filter((usage) => !(Number(usage['cacheRead']) > 0) && Number(usage['cacheWrite']) > 0).length / usages.length;
}

/** The value of a batch this turn, from the model's prices, Pi's settings and the context's own usage. */
export function trimValue(input: {
  due: boolean;
  model: Pick<Model<Api>, 'cost' | 'contextWindow'> | undefined;
  entries: readonly ContextEntry[];
  usage: { tokens: number | null; contextWindow: number } | undefined;
  settings: CompactionSettingsView;
  env?: NodeJS.ProcessEnv;
}): (batch: TrimBatch) => number {
  const messages = input.entries.map((entry) => entry.message);
  const requests = messages.filter((message) => isRecord(message) && message['role'] === 'assistant').length;
  const economy: TrimEconomy = {
    due: input.due,
    rates: cacheRates(input.model, input.env),
    coldShare: coldShare(messages),
    futureRequests: futureRequests({
      requests,
      tokens: input.usage?.tokens ?? null,
      contextWindow: input.usage?.contextWindow ?? input.model?.contextWindow ?? 0,
      reserveTokens: reserveTokens(input.settings),
    }),
  };
  return (batch) => batchNet(batch, economy);
}

/**
 * q(t): the chance a refresh now is used, from this session's idle gaps (prompt after a finished run). Of the gaps that
 * lasted longer than `idleMs`, the share that ended after a tenth of the lifetime (sooner, the entry is still warm
 * without the refresh) and within the lifetime (later, the refreshed entry has expired too). Undefined with too few.
 */
export function idleContinuation(gaps: readonly number[], idleMs: number, ttlMs: number): number | undefined {
  const survivors = gaps.filter((gap) => gap > idleMs);
  if (survivors.length < MIN_IDLE_SAMPLES) return undefined;
  return survivors.filter((gap) => gap > idleMs + ttlMs / 10 && gap <= idleMs + ttlMs).length / survivors.length;
}

/** When the session's last reply was requested (its idle start), or undefined without one. */
export function lastReplyAt(branch: readonly unknown[]): number | undefined {
  for (let index = branch.length - 1; index >= 0; index--) {
    const message = (branch[index] as { type?: string; message?: { role?: string; timestamp?: number } }).message;
    if ((branch[index] as { type?: string }).type === 'message' && message?.role === 'assistant' && typeof message.timestamp === 'number') return message.timestamp;
  }
  return undefined;
}

/** Idle gaps in a session branch: from a finished run's last reply to the next user prompt, in ms. */
export function idleGaps(branch: readonly unknown[]): number[] {
  const gaps: number[] = [];
  let finished: number | undefined;
  for (const entry of branch) {
    const message = (entry as { type?: string; message?: { role?: string; timestamp?: number; stopReason?: string } }).message;
    if ((entry as { type?: string }).type !== 'message' || typeof message?.timestamp !== 'number') continue;
    if (message.role === 'assistant') finished = message.stopReason === 'stop' ? message.timestamp : undefined;
    else if (message.role === 'user' && finished !== undefined) {
      gaps.push(message.timestamp - finished);
      finished = undefined;
    }
  }
  return gaps;
}
