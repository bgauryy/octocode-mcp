import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteFile } from '../shared/atomic.js';
import { globalPaths, privateDir } from '../shared/home.js';
import { envFlag } from '../shared/env.js';
import { DAY_MS, finiteNumber, HOUR_MS, isRecord } from '../shared/util.js';

/**
 * Model metadata from models.dev (https://models.dev, MIT), an open catalog of model capabilities, limits and
 * prices: what Pi's own model entries do not say (tool calling, input modalities, a description) or a custom provider
 * left out (price, window). Fetched in the background at most once a day, kept as a small index in the agent state
 * folder, and used stale or not at all when offline: every decision also works from Pi's metadata alone.
 */

const CATALOG_URL = 'https://models.dev/api.json';
/** How long a fetched index is fresh. */
export const CATALOG_TTL_MS = DAY_MS;
const FETCH_TIMEOUT_MS = 10_000;

/** What Octocode reads from one models.dev model entry (prices per million tokens). */
interface CatalogModel {
  description?: string;
  /** Model family (`claude-haiku`, `gpt-mini`): its newest release is the current one. */
  family?: string;
  /** Release date, `YYYY-MM-DD`. */
  released?: string;
  /** `deprecated` models are never chosen. */
  status?: string;
  /** The lab that made it (`anthropic`), from its canonical id. */
  lab?: string;
  toolCall?: boolean;
  reasoning?: boolean;
  input?: string[];
  context?: number;
  cost?: { input: number; output: number };
}

/**
 * The index: bare `id` to the model as its lab lists it (else the first provider listing it), plus `provider/id` only
 * where that provider's listing differs (a reseller's price), so the file stays small.
 */
export interface Catalog {
  fetchedAt: number;
  models: Record<string, CatalogModel>;
  /** The providers models.dev lists: only their models' missing prices are filled from it. */
  providers: string[];
}

const str = (value: unknown) => (typeof value === 'string' && value.trim() !== '' ? value : undefined);

/** `{ [key]: value }`, or nothing when the value is missing, so an absent field is not written. */
function field<K extends keyof CatalogModel>(key: K, value: CatalogModel[K] | undefined): Partial<CatalogModel> {
  return value === undefined ? {} : { [key]: value };
}

function entry(raw: Record<string, unknown>): CatalogModel {
  const limit = isRecord(raw['limit']) ? raw['limit'] : {};
  const cost = isRecord(raw['cost']) ? raw['cost'] : undefined;
  const input = isRecord(raw['modalities']) && Array.isArray(raw['modalities']['input']) ? raw['modalities']['input'].filter((item): item is string => typeof item === 'string') : undefined;
  const price = cost && finiteNumber(cost['input']) !== undefined && finiteNumber(cost['output']) !== undefined ? { input: finiteNumber(cost['input'])!, output: finiteNumber(cost['output'])! } : undefined;
  const canonical = str(raw['canonical_model_id']);
  return {
    ...field('description', str(raw['description'])),
    ...field('family', str(raw['family'])),
    ...field('released', str(raw['release_date'])),
    ...field('status', str(raw['status'])),
    ...field('lab', canonical?.includes('/') ? canonical.split('/')[0] : undefined),
    ...(typeof raw['tool_call'] === 'boolean' ? { toolCall: raw['tool_call'] } : {}),
    ...(typeof raw['reasoning'] === 'boolean' ? { reasoning: raw['reasoning'] } : {}),
    ...field('input', input),
    ...field('context', finiteNumber(limit['context']) || undefined),
    ...field('cost', price),
  };
}

/** The index of models.dev's `api.json` (providers, each with its models). */
export function indexCatalog(api: unknown, fetchedAt: number): Catalog {
  const listed: Array<[string, string, CatalogModel]> = [];
  const bare = new Map<string, { model: CatalogModel; lab: boolean }>();
  for (const [provider, raw] of Object.entries(isRecord(api) ? api : {})) {
    if (!isRecord(raw) || !isRecord(raw['models'])) continue;
    for (const [id, value] of Object.entries(raw['models'])) {
      if (!isRecord(value)) continue;
      const model = entry(value);
      listed.push([provider, id, model]);
      // A bare id resolves to the model's own lab first (`anthropic/claude-…` listed by `anthropic`), else the first.
      const canonical = str(value['canonical_model_id']);
      const lab = canonical !== undefined && canonical.startsWith(`${provider}/`);
      const seen = bare.get(id);
      if (!seen || (lab && !seen.lab)) bare.set(id, { model, lab });
    }
  }
  const models: Record<string, CatalogModel> = Object.fromEntries([...bare].map(([id, { model }]) => [id, model]));
  for (const [provider, id, model] of listed) {
    if (JSON.stringify(model) !== JSON.stringify(bare.get(id)!.model)) models[`${provider}/${id}`] = model;
  }
  return { fetchedAt, models, providers: Object.keys(isRecord(api) ? api : {}) };
}

/**
 * The price models.dev lists for a model of `provider`, only when it lists that provider: a local or private provider's
 * model (an Ollama `gpt-oss:20b`, priced 0 by Pi) must not borrow a cloud price through its bare id.
 */
export function listedCost(catalog: Catalog | undefined, provider: string, id: string): CatalogModel['cost'] {
  return catalog?.providers?.includes(provider) ? lookup(catalog, provider, id)?.cost : undefined;
}

/** The models.dev entry for Pi's `provider`/`id`: that provider's listing, else the bare id, else the id's last part. */
export function lookup(catalog: Catalog | undefined, provider: string, id: string): CatalogModel | undefined {
  if (!catalog) return undefined;
  const last = id.slice(id.lastIndexOf('/') + 1);
  return catalog.models[`${provider}/${id}`] ?? catalog.models[id] ?? catalog.models[last];
}

/** Where the index is kept. */
export function catalogFile(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(globalPaths(env).agentState, 'models-dev.json');
}

/** The last parsed index by file, kept while the file's mtime is unchanged (an `agent` call reads it every time). */
const parsedCache = new Map<string, { mtimeMs: number; catalog: Catalog | undefined }>();

/** The saved index, fresh or stale, or undefined when there is none or it cannot be read. */

export function readCatalog(file = catalogFile()): Catalog | undefined {
  try {
    const { mtimeMs } = fs.statSync(file);
    const cached = parsedCache.get(file);
    if (cached?.mtimeMs === mtimeMs) return cached.catalog;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    const catalog = isRecord(parsed) && typeof parsed['fetchedAt'] === 'number' && isRecord(parsed['models']) && Array.isArray(parsed['providers']) ? (parsed as unknown as Catalog) : undefined;
    parsedCache.set(file, { mtimeMs, catalog });
    return catalog;
  } catch {
    return undefined;
  }
}

let refreshing: Promise<Catalog | undefined> | undefined;
/** After a failed fetch (offline, blocked), no new attempt for this long. */
const RETRY_AFTER_MS = HOUR_MS;
let failedAt: number | undefined;

/**
 * The index, refreshed from models.dev when missing or older than `CATALOG_TTL_MS` (one request at a time per
 * process). Never throws: offline or on a bad response it returns the saved index, stale or not, or undefined.
 */
export async function loadCatalog(options: { file?: string; now?: number; fetchImpl?: typeof fetch } = {}): Promise<Catalog | undefined> {
  const file = options.file ?? catalogFile();
  const now = options.now ?? Date.now();
  const saved = readCatalog(file);
  if (saved && now - saved.fetchedAt < CATALOG_TTL_MS) return saved;
  if (failedAt !== undefined && now - failedAt < RETRY_AFTER_MS) return saved;
  refreshing ??= (async () => {
    try {
      const response = await (options.fetchImpl ?? fetch)(CATALOG_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const catalog = indexCatalog(await response.json(), now);
      if (Object.keys(catalog.models).length === 0) throw new Error('empty catalog');
      failedAt = undefined;
      try {
        privateDir(path.dirname(file));
        await atomicWriteFile(file, JSON.stringify(catalog), undefined, { mode: 0o600 });
      } catch {
        // Not saved (a read-only home): this call still routes with the fresh index.
      }
      return catalog;
    } catch {
      failedAt = now;
      return saved;
    } finally {
      refreshing = undefined;
    }
  })();
  return refreshing;
}

/** `OCTOCODE_MODELS_DEV=0` keeps models.dev off: no request, and only Pi's metadata routes subagent models. */
export const MODELS_DEV_ENV = 'OCTOCODE_MODELS_DEV';

/**
 * The index to route with now (the saved one, or undefined), refreshing it in the background for later calls. Off
 * with `OCTOCODE_MODELS_DEV=0`.
 */
export const modelsDevEnabled = (env: NodeJS.ProcessEnv = process.env): boolean => envFlag(env, MODELS_DEV_ENV, true);

export function currentCatalog(env: NodeJS.ProcessEnv = process.env): Catalog | undefined {
  if (!modelsDevEnabled(env)) return undefined;
  const file = catalogFile(env);
  void loadCatalog({ file });
  return readCatalog(file);
}
