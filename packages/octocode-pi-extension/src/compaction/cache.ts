import type { Api, Model } from '@earendil-works/pi-ai';
import type { CacheWarmingDecisionEvent, CacheWarmingDecisionEventResult, ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { CACHE_RETENTION_ENV, envFlag, SUBAGENT_ENV } from '../shared/env.js';
import { interactive } from '../shared/interactive.js';
import { isRecord } from '../shared/util.js';

/**
 * Prompt-cache lifetimes, in seconds, for a model that declares no `promptCache` (a custom-provider model in models.json)
 * but whose replies show caching: Anthropic's cache TTLs, 5 minutes for short retention and 1 hour for long.
 */
export const INFERRED_CACHE_TTL_SECONDS = { short: 300, long: 3600 } as const;
/** Idle gaps needed before this session's own history is trusted over Pi's constant continuation estimate (fewer gaps are noise). */
const MIN_IDLE_SAMPLES = 5;

type PromptCache = NonNullable<Model<Api>['promptCache']>;
type CacheModel = Pick<Model<Api>, 'provider' | 'id' | 'api' | 'promptCache' | 'compat'>;

/**
 * The lifetimes of a model that declares none. A long request gets a 5-minute entry when the model cannot hold a long one
 * (`supportsLongCacheRetention: false`: pi-ai then sends no `ttl`) or when its replies showed the provider granting only
 * 5 minutes (`grantedLong` false), so its long tier is then the short one.
 */
export function inferredPromptCache(model: Pick<Model<Api>, 'compat'>, grantedLong = true): PromptCache {
  // Not every API compat object declares this flag (Bedrock and Mistral do not).
  const compat = model.compat;
  const deniesLong = compat !== undefined && 'supportsLongCacheRetention' in compat && compat.supportsLongCacheRetention === false;
  const long = grantedLong && !deniesLong;
  return { short: INFERRED_CACHE_TTL_SECONDS.short, long: long ? INFERRED_CACHE_TTL_SECONDS.long : INFERRED_CACHE_TTL_SECONDS.short };
}

/**
 * The lifetime, in ms, of the cache entry a session request writes: the `promptCache` tier for the retention in use
 * (`PI_CACHE_RETENTION=long`, else short), the rule Pi's cache warmer applies (cache-warmer.js `getPromptCacheTtlMs`;
 * Pi sets no per-request retention for session requests), so idle-warming decisions and the warmer agree. Undefined without that tier.
 */
export function promptCacheTtlMs(promptCache: PromptCache | undefined, env: NodeJS.ProcessEnv = process.env): number | undefined {
  const seconds = promptCache?.[env[CACHE_RETENTION_ENV] === 'long' ? 'long' : 'short'];
  return seconds === undefined ? undefined : seconds * 1000;
}

/** An assistant reply's usage, when it has one. */
function usageOf(message: unknown): Record<string, unknown> | undefined {
  return isRecord(message) && message['role'] === 'assistant' && isRecord(message['usage']) ? message['usage'] : undefined;
}

const keyOf = (model: Pick<Model<Api>, 'provider' | 'id'>) => `${model.provider}/${model.id}`;

/**
 * Prompt-cache lifetimes for models that declare none. Once a model's reply shows caching, it is known to cache for the
 * rest of the process (a later reply without usage, such as an aborted one, does not undo that), and:
 *
 * - idle-warming decisions use its inferred lifetime (`of`);
 * - an `anthropic-messages` model also gets those lifetimes in Pi's model registry through `pi.registerProvider`, so Pi's
 *   cache warmer, which skips a model without `promptCache`, keeps its cache warm. The registration lists every model of
 *   the provider as the registry has it (models.json definitions, auth and headers config stay Pi's, and a models.json
 *   `modelOverrides.promptCache` still wins, since Pi applies overrides last); only models seen caching gain lifetimes.
 *   A provider whose models carry resolved headers (a built-in one) is left alone, and a refused registration is not retried.
 *
 * The 1-hour tier is learned, not assumed: a long-retention reply that wrote cache with `cacheWrite1h: 0` shows the
 * provider granted 5 minutes, and the supplied long tier drops to 300 s.
 */
export class PromptCacheLifetimes {
  private readonly caching = new Set<string>();
  private readonly shortOnly = new Set<string>();
  private readonly supplied = new Set<string>();
  private readonly refused = new Set<string>();

  /** The model's lifetimes: its declared `promptCache`, else the inferred ones once it was seen caching. */
  of(model: CacheModel | undefined): PromptCache | undefined {
    if (!model) return undefined;
    const key = keyOf(model);
    if (model.promptCache && !this.supplied.has(key)) return model.promptCache;
    return this.caching.has(key) ? inferredPromptCache(model, !this.shortOnly.has(key)) : model.promptCache;
  }

  /** Notes a turn's assistant reply; supplies lifetimes to Pi's registry when it shows an undeclared model caching. */
  observe(pi: Pick<ExtensionAPI, 'registerProvider'>, ctx: Pick<ExtensionContext, 'modelRegistry'>, message: unknown, env: NodeJS.ProcessEnv = process.env): void {
    const usage = usageOf(message);
    if (!usage || !(Number(usage['cacheRead']) > 0 || Number(usage['cacheWrite']) > 0) || !isRecord(message)) return;
    const model = ctx.modelRegistry.find(String(message['provider']), String(message['model']));
    if (!model) return;
    const key = keyOf(model);
    if (model.promptCache && !this.supplied.has(key)) return;
    const learnedShort = env[CACHE_RETENTION_ENV] === 'long' && Number(usage['cacheWrite']) > 0 && usage['cacheWrite1h'] === 0 && !this.shortOnly.has(key);
    if (learnedShort) this.shortOnly.add(key);
    if (this.caching.has(key) && !learnedShort) return;
    this.caching.add(key);
    if (model.api !== 'anthropic-messages' || this.refused.has(model.provider)) return;
    const models = ctx.modelRegistry.getAll().filter((entry) => entry.provider === model.provider);
    if (models.some((entry) => entry.headers !== undefined)) return;
    const inferred = (entry: Model<Api>) => entry.api === 'anthropic-messages' && this.caching.has(keyOf(entry)) && (!entry.promptCache || this.supplied.has(keyOf(entry)));
    try {
      pi.registerProvider(model.provider, {
        models: models.map((entry) => (inferred(entry) ? { ...entry, promptCache: inferredPromptCache(entry, !this.shortOnly.has(keyOf(entry))) } : entry)),
      });
      for (const entry of models) if (inferred(entry)) this.supplied.add(keyOf(entry));
    } catch {
      // Idle-warming decisions still use the inferred lifetime; only Pi's warmer stays off for this provider.
      this.refused.add(model.provider);
    }
  }
}

/**
 * Octocode's say in a cache refresh Pi is about to send. A headless run or a subagent is never warmed: it sends its
 * requests back to back and ends. An idle refresh (Pi assumes a constant 15% chance the user returns) is decided from
 * this session's own idle gaps at the current idle age instead: warm when q(t) × the miss cost beats the refresh cost.
 * Undefined keeps Pi's decision (a streaming refresh, whose run is still going, or too little history).
 */
export function warmingDecision(
  event: Pick<CacheWarmingDecisionEvent, 'action' | 'warmCost' | 'missCost' | 'continuationProbability'>,
  ctx: Pick<ExtensionContext, 'hasUI' | 'sessionManager'>,
  ttlMs: number | undefined,
  now = Date.now(),
  isSubagent = envFlag(process.env, SUBAGENT_ENV),
): CacheWarmingDecisionEventResult | undefined {
  if (!interactive(ctx, isSubagent)) return event.action === 'stop' ? undefined : { action: 'stop' };
  if (event.continuationProbability >= 1 || ttlMs === undefined) return undefined;
  const branch = ctx.sessionManager.getBranch();
  const since = lastReplyAt(branch);
  const q = since === undefined ? undefined : idleContinuation(idleGaps(branch), now - since, ttlMs);
  if (q === undefined) return undefined;
  const action = q * event.missCost > event.warmCost ? 'warm' : 'stop';
  return action === event.action ? undefined : { action };
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

/**
 * When the session's prompt cache entry was last used: its last reply, or a later refresh by Pi's warmer (a `usage`
 * entry of kind `cache_warm`, which reads the same prefix and so restarts its lifetime). Undefined without a reply.
 */
export function lastCacheUseAt(branch: readonly unknown[]): number | undefined {
  const reply = lastReplyAt(branch);
  if (reply === undefined) return undefined;
  let latest = reply;
  for (const entry of branch) {
    const { type, kind, timestamp } = entry as { type?: string; kind?: string; timestamp?: string };
    const at = type === 'usage' && kind === 'cache_warm' && typeof timestamp === 'string' ? Date.parse(timestamp) : Number.NaN;
    if (at > latest) latest = at;
  }
  return latest;
}

/** When the session's last reply was requested (its idle start), or undefined without one. */
function lastReplyAt(branch: readonly unknown[]): number | undefined {
  for (let index = branch.length - 1; index >= 0; index--) {
    const message = (branch[index] as { type?: string; message?: { role?: string; timestamp?: number } }).message;
    if ((branch[index] as { type?: string }).type === 'message' && message?.role === 'assistant' && typeof message.timestamp === 'number') return message.timestamp;
  }
  return undefined;
}

/** Idle gaps in a session branch: from a finished run's last reply to the next user prompt, in ms. */
function idleGaps(branch: readonly unknown[]): number[] {
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
