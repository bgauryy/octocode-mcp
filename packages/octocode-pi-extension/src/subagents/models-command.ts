import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { say, type Subcommands } from '../shared/commands.js';
import { MODELS_DEV_ENV, catalogFile, listedCost, loadCatalog, lookup, modelsDevEnabled, readCatalog, type Catalog } from './catalog.js';
import { sanitizeTerminalText } from '../shared/sanitize.js';
import { clipText } from '../shared/util.js';
import { MODEL_TIERS, isModelTier, resolveTier, routeModel, type ModelRef } from './model.js';
import type { AgentProfile } from './profiles.js';

/**
 * `/octocode models`: the models this session can use, what each costs and can do, and which one each subagent
 * purpose (`small`, `medium`) and profile runs on. Refreshes the models.dev index first unless it is turned off.
 */

const perMillion = (value: number) => `$${value < 1 ? value.toFixed(2) : value.toFixed(value % 1 === 0 ? 0 : 2)}`;
const window = (tokens: number | undefined) => (tokens ? (tokens >= 1_000_000 ? `${Number((tokens / 1_000_000).toFixed(1))}M` : `${Math.round(tokens / 1000)}k`) : '?');
/** A remote description, made safe for the terminal and kept to one short line. */
const describe = (text: string) => {
  const clean = sanitizeTerminalText(text).replace(/\s+/g, ' ').trim();
  return clipText(clean, 120);
};
const name = (model: ModelRef) => `${model.provider}/${model.id}`;

/** One line per available model, the parent's marked, cheapest first. */
export function describeModels(available: readonly ModelRef[], parent: ModelRef | undefined, profiles: Map<string, AgentProfile>, catalog: Catalog | undefined): string {
  if (available.length === 0) return 'No models are configured.';
  const rows = available.map((model) => {
    const known = lookup(catalog, model.provider, model.id);
    const cost = model.cost && model.cost.input + model.cost.output > 0 ? model.cost : listedCost(catalog, model.provider, model.id);
    const caps = [known?.toolCall === false ? 'no tools' : 'tools', (model.input ?? known?.input)?.includes('image') ? 'images' : undefined, known?.reasoning ? 'reasoning' : undefined].filter(Boolean).join(', ');
    const price = cost ? `${perMillion(cost.input)}/${perMillion(cost.output)}` : 'price ?';
    const mark = parent && name(model) === name(parent) ? '● ' : '  ';
    const description = known?.description ? ` — ${describe(known.description)}` : '';
    return { parent: mark !== '  ', sort: cost ? 3 * cost.input + cost.output : Infinity, line: `${mark}${name(model)} · ${price} per M in/out · ${window(model.contextWindow || known?.context)} · ${caps}${description}` };
  });
  rows.sort((a, b) => a.sort - b.sort);
  const parentPriced = rows.some((row) => row.parent && row.sort !== Infinity) || (parent !== undefined && resolveTier('small', [...available, parent], parent, catalog) !== undefined);
  const why = (tier: string) => (!parent ? '' : !parentPriced ? ' (its price is unknown, so nothing ranks below it)' : tier === 'medium' ? ' (no capable model at 15–80% of its price)' : ' (no cheaper capable model)');
  const tiers = MODEL_TIERS.map((tier) => {
    const chosen = resolveTier(tier, available, parent, catalog);
    return `  ${tier}: ${chosen ? name(chosen) : parent ? `${name(parent)}, this session's${why(tier)}` : 'this session\'s model'}`;
  });
  // Each profile as it would route now: the model it runs on, and what it asked for.
  const routed = [...profiles.values()].map((profile) => {
    const route = routeModel({ preferred: profile.model, available, parent, catalog });
    const runs = 'error' in route ? route.error : (route.model ?? 'this session\'s model');
    const asked = !profile.model ? '' : 'fallback' in route && route.fallback ? ` (${profile.model} unavailable)` : ` (${profile.model}${isModelTier(profile.model.split(':')[0]!) ? ', a purpose' : ''})`;
    return `  ${profile.name}: ${runs}${asked}`;
  });
  return [
    'Models this session can use (● this session; price per million tokens in/out; context window):',
    ...rows.map((row) => row.line),
    '',
    'Subagent purposes:',
    ...tiers,
    ...(routed.length > 0 ? ['', 'Profiles:', ...routed] : []),
  ].join('\n');
}

export function registerModelsCommand(commands: Subcommands, getProfiles: () => Map<string, AgentProfile>): void {
  commands.add('models', {
    description: 'models — the models you can use, their price and abilities, and which one each subagent purpose runs on',
    handler: async (_args, ctx: ExtensionCommandContext) => {
      const enabled = modelsDevEnabled();
      if (enabled && !readCatalog(catalogFile())) say(ctx, 'Fetching model data from models.dev…');
      const catalog = enabled ? await loadCatalog({ file: catalogFile() }) : undefined;
      const source = !enabled ? `models.dev is off (${MODELS_DEV_ENV}=0); Pi's metadata only.` : catalog ? `Capabilities and missing prices from models.dev (fetched ${new Date(catalog.fetchedAt).toISOString().slice(0, 10)}).` : 'models.dev could not be reached now or within the last hour; Pi\'s metadata only.';
      say(ctx, `${describeModels(ctx.modelRegistry.getAvailable(), ctx.model, getProfiles(), catalog)}\n\n${source}`);
    },
  });
}
