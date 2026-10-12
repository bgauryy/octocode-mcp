/** A model the parent can use, as Pi's model registry lists it. */
export interface ModelRef {
  provider: string;
  id: string;
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

/**
 * Picks the model for a run. An explicit request is strict: when it cannot be resolved the call is refused with the
 * closest available ids. A profile's preferred model is soft: when it is unavailable the run falls back to the parent's.
 */
export function routeModel(input: { explicit?: string | undefined; preferred?: string | undefined; available: readonly ModelRef[]; parent?: ModelRef | undefined }): ModelRoute {
  const { explicit, preferred, available, parent } = input;
  const parentProvider = parent?.provider;
  // Pinned explicitly: without --model the child would start on Pi's default, not the model the parent runs on now.
  const parentModel = parent ? { model: `${parent.provider}/${parent.id}` } : {};
  if (explicit) {
    const model = resolveModel(explicit, available, parentProvider);
    if (model) return { model };
    const close = closeModels(explicit, available);
    const names = [...new Set(available.map((candidate) => `${candidate.provider}/${candidate.id}`))];
    const hint = close.length > 0 ? `Close matches: ${close.join(', ')}` : names.length > 0 ? `Available: ${names.slice(0, 8).join(', ')}${names.length > 8 ? ', …' : ''}` : 'No models are configured';
    return { error: `Model "${explicit}" is not available. ${hint}` };
  }
  if (!preferred) return parentModel;
  const model = resolveModel(preferred, available, parentProvider);
  return model ? { model } : { ...parentModel, fallback: preferred };
}
