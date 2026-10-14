import { listedCost, lookup, type Catalog } from './catalog.js';

/** A model the parent can use, as Pi's model registry lists it (prices per million tokens). */
export interface ModelRef {
  provider: string;
  id: string;
  cost?: { input: number; output: number };
  contextWindow?: number;
  input?: readonly string[];
}

/**
 * Purposes a profile can name instead of a model id: `small` is the cheapest capable model the parent can use (search,
 * reading, documentation checks, browsing), `medium` the next tier below the parent's (coding and review when the
 * parent runs a frontier model). Each resolves among the user's own models, so no profile hard-codes a vendor.
 */
export const MODEL_TIERS = ['small', 'medium'] as const;
type ModelTier = (typeof MODEL_TIERS)[number];
export const isModelTier = (value: string): value is ModelTier => (MODEL_TIERS as readonly string[]).includes(value);

/** A subagent starts fresh but reads files and tool output: a model with a smaller window is not a candidate. */
const MIN_SUBAGENT_CONTEXT = 100_000;

interface Facts {
  ref: ModelRef;
  price: number | undefined;
  context: number | undefined;
  input: readonly string[] | undefined;
  toolCall: boolean | undefined;
  family: string | undefined;
  released: string | undefined;
  deprecated: boolean;
  lab: string | undefined;
}

/**
 * `medium` is the next tier down: between these shares of the parent's price (Sonnet is half of Opus; Haiku, a
 * twentieth, is the small tier, not a coder for an Opus or Sonnet parent).
 */
const MEDIUM_MAX_SHARE = 0.8;
const MEDIUM_MIN_SHARE = 0.15;
/** Candidates released this long before the parent are an older generation, used only when nothing newer qualifies. */
const STALE_AFTER_MS = 548 * 24 * 60 * 60_000;

/** Pi's metadata, with what it lacks from models.dev. Price: three input tokens to one output, as agent turns spend. */
function facts(ref: ModelRef, catalog: Catalog | undefined): Facts {
  const known = lookup(catalog, ref.provider, ref.id);
  const cost = ref.cost && ref.cost.input + ref.cost.output > 0 ? ref.cost : listedCost(catalog, ref.provider, ref.id);
  // An id like `anthropic/claude-x` (a router's) names its lab when models.dev does not.
  const slash = ref.id.indexOf('/');
  return {
    ref,
    price: cost && cost.input + cost.output > 0 ? (3 * cost.input + cost.output) / 4 : undefined,
    context: ref.contextWindow || known?.context,
    input: ref.input ?? known?.input,
    toolCall: known?.toolCall,
    family: known?.family,
    released: known?.released,
    deprecated: known?.status === 'deprecated',
    lab: known?.lab ?? (slash > 0 ? ref.id.slice(0, slash) : undefined),
  };
}

const time = (date: string | undefined) => (date ? Date.parse(date) : NaN);

/**
 * Only each family's newest release among `all` (the parent included: an older sibling of the parent's own family is
 * an older generation); a router lists every generation and alias. Models without a family or date stay.
 */
function currentGeneration(models: Facts[], all: Facts[]): Facts[] {
  const newest = new Map<string, number>();
  for (const model of all) if (model.family && !Number.isNaN(time(model.released))) newest.set(model.family, Math.max(newest.get(model.family) ?? -Infinity, time(model.released)));
  return models.filter((model) => !model.family || !newest.has(model.family) || time(model.released) === newest.get(model.family));
}

/** The first non-empty group: candidates nearest the parent come first. */
const firstNonEmpty = (...groups: Facts[][]): Facts[] => groups.find((group) => group.length > 0) ?? [];

/**
 * The model a tier resolves to among `available`, or undefined to stay on the parent's. Works for any list: one model,
 * a few, or a router's hundreds. Candidates call tools, hold `MIN_SUBAGENT_CONTEXT`, take images when the parent does,
 * are not deprecated, cost less than the parent, and are their family's current generation; ones not much older than
 * the parent come first, then the parent's lab, then its provider (its auth and endpoint are proven). `small` is the
 * cheapest; `medium` the dearest between `MEDIUM_MIN_SHARE` and `MEDIUM_MAX_SHARE` of the parent's price.
 */
export function resolveTier(tier: ModelTier, available: readonly ModelRef[], parent: ModelRef | undefined, catalog?: Catalog): ModelRef | undefined {
  if (!parent) return undefined;
  const own = available.find((model) => model.provider === parent.provider && model.id === parent.id) ?? parent;
  const top = facts(own, catalog);
  if (top.price === undefined) return undefined;
  const needsImages = top.input?.includes('image') === true;
  // A family's newest release is judged among the models able to do the work (and the parent): an unusable newer
  // sibling (no tool calls, a small window) does not push the usable ones out.
  const capable = available
    .map((model) => facts(model, catalog))
    .filter((model) => !(model.ref.provider === own.provider && model.ref.id === own.id))
    .filter((model) => !model.deprecated && model.toolCall !== false && (model.context === undefined || model.context >= MIN_SUBAGENT_CONTEXT))
    .filter((model) => !needsImages || model.input === undefined || model.input.includes('image'));
  const eligible = currentGeneration(
    capable.filter((model) => model.price !== undefined && model.price < top.price!),
    [...capable, top],
  );
  const parentReleased = time(top.released);
  const recent = Number.isNaN(parentReleased) ? eligible : eligible.filter((model) => Number.isNaN(time(model.released)) || time(model.released) >= parentReleased - STALE_AFTER_MS);
  const fresh = recent.length > 0 ? recent : eligible;
  const sameLab = top.lab ? fresh.filter((model) => model.lab === top.lab) : [];
  const sameProvider = fresh.filter((model) => model.ref.provider === own.provider);
  const pool = firstNonEmpty(sameLab, sameProvider, fresh).sort((a, b) => a.price! - b.price!);
  if (tier === 'small') return pool[0]?.ref;
  const band = pool.filter((model) => model.price! <= top.price! * MEDIUM_MAX_SHARE && model.price! >= top.price! * MEDIUM_MIN_SHARE);
  return band.at(-1)?.ref;
}

/** The `:<level>` suffixes Pi's `--model <pattern>` accepts. */
const THINKING_LEVELS = new Set(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);

/**
 * Which model a subagent runs on. `model` goes to `--model`; `fallback` names the profile's preferred model when it is
 * unavailable (the child then runs on the parent's model); `error` refuses an explicit request.
 */
export type ModelRoute = { model?: string; fallback?: string } | { error: string };

/** `provider/id` (plus any `:thinking` suffix) for a requested `provider/id` or bare id, or undefined when no available model matches. */
export function resolveModel(requested: string, available: readonly ModelRef[], parentProvider?: string): string | undefined {
  const colon = requested.lastIndexOf(':');
  const suffix = colon > 0 && THINKING_LEVELS.has(requested.slice(colon + 1)) ? requested.slice(colon) : '';
  // The whole text first: a model id may itself contain a colon.
  for (const [base, thinking] of [[requested, ''], ...(suffix ? [[requested.slice(0, colon), suffix]] : [])] as Array<[string, string]>) {
    const qualified = available.find((model) => `${model.provider}/${model.id}` === base);
    const bare = available.filter((model) => model.id === base);
    const found = qualified ?? bare.find((model) => model.provider === parentProvider) ?? bare[0];
    if (found) return `${found.provider}/${found.id}${thinking}`;
  }
  return undefined;
}

/** Available `provider/id` values that share name parts with the request, best first. */
export function closeModels(requested: string, available: readonly ModelRef[], limit = 8): string[] {
  const parts = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const wanted = new Set(parts(requested));
  const ranked = available
    .map((model, index) => ({ name: `${model.provider}/${model.id}`, index, score: parts(`${model.provider}/${model.id}`).filter((part) => wanted.has(part)).length }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return [...new Set(ranked.map((entry) => entry.name))].slice(0, limit);
}


interface RouteInput {
  explicit?: string | undefined;
  preferred?: string | undefined;
  available: readonly ModelRef[];
  parent?: ModelRef | undefined;
  catalog?: Catalog | undefined;
}

/** A purpose with an optional `:<thinking>` suffix (`small:high`), or undefined for a model id. */
function tierOf(value: string): { tier: ModelTier; thinking: string } | undefined {
  const at = value.lastIndexOf(':');
  const name = at > 0 && THINKING_LEVELS.has(value.slice(at + 1)) ? value.slice(0, at) : value;
  return isModelTier(name) ? { tier: name, thinking: value.slice(name.length) } : undefined;
}

/** A purpose's route: its model with the suffix kept, else the parent's (with no cheaper candidate it is the right one). */
function tierRoute({ tier, thinking }: { tier: ModelTier; thinking: string }, input: RouteInput, parentModel: { model?: string }): ModelRoute {
  const chosen = resolveTier(tier, input.available, input.parent, input.catalog);
  if (chosen) return { model: `${chosen.provider}/${chosen.id}${thinking}` };
  return parentModel.model ? { model: `${parentModel.model}${thinking}` } : {};
}

export function routeModel(input: RouteInput): ModelRoute {
  const { explicit, preferred, available, parent } = input;
  const parentProvider = parent?.provider;
  // Pinned explicitly: without --model the child would start on Pi's default, not the model the parent runs on now.
  const parentModel = parent ? { model: `${parent.provider}/${parent.id}` } : {};
  if (explicit) {
    const tier = tierOf(explicit);
    if (tier) return tierRoute(tier, input, parentModel);
    const model = resolveModel(explicit, available, parentProvider);
    if (model) return { model };
    const close = closeModels(explicit, available);
    const names = [...new Set(available.map((candidate) => `${candidate.provider}/${candidate.id}`))];
    const hint = close.length > 0 ? `Close matches: ${close.join(', ')}` : names.length > 0 ? `Available: ${names.slice(0, 8).join(', ')}${names.length > 8 ? ', …' : ''}` : 'No models are configured';
    return { error: `Model "${explicit}" is not available. ${hint}` };
  }
  if (!preferred) return parentModel;
  // A purpose resolves among the user's models; with no cheaper candidate the parent's model is the right one.
  const tier = tierOf(preferred);
  if (tier) return tierRoute(tier, input, parentModel);
  const model = resolveModel(preferred, available, parentProvider);
  return model ? { model } : { ...parentModel, fallback: preferred };
}
