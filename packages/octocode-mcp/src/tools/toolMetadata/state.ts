import { octocodeConfig } from '@octocodeai/octocode-core';
import { CompleteMetadata, ToolNames } from '../../types/metadata.js';

let METADATA_JSON: CompleteMetadata | null = null;
let initializationPromise: Promise<void> | null = null;
let metadataCache: CompleteMetadata | null = null;

/**
 * Deep freezes an object to prevent mutations.
 */
function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    Object.freeze(obj);
    Object.getOwnPropertyNames(obj as object).forEach(prop => {
      const value = (obj as unknown as Record<string, unknown>)[prop];
      if (
        value !== null &&
        (typeof value === 'object' || typeof value === 'function') &&
        !Object.isFrozen(value)
      ) {
        deepFreeze(value);
      }
    });
  }
  return obj;
}

/**
 * Loads metadata from @octocodeai/octocode-core (synchronous data, async signature preserved).
 */
export async function getMetadata(): Promise<CompleteMetadata> {
  if (metadataCache) {
    return metadataCache;
  }

  const raw = octocodeConfig;
  const toolNames = raw.toolNames as unknown as ToolNames;

  const result: CompleteMetadata = {
    instructions: raw.instructions,
    prompts: raw.prompts as CompleteMetadata['prompts'],
    toolNames,
    baseSchema: {
      mainResearchGoal: raw.baseSchema.mainResearchGoal,
      researchGoal: raw.baseSchema.researchGoal,
      reasoning: raw.baseSchema.reasoning,
      bulkQuery: (toolName: string) =>
        raw.baseSchema.bulkQueryTemplate.replace('{toolName}', toolName),
    },
    tools: raw.tools as CompleteMetadata['tools'],
    baseHints: raw.baseHints as CompleteMetadata['baseHints'],
    genericErrorHints: raw.genericErrorHints,
    bulkOperations: raw.bulkOperations,
  };

  metadataCache = result;
  return result;
}

/**
 * Gets the current metadata, throwing if not initialized.
 * @internal Used by proxies and helper functions.
 */
export function getMetadataOrThrow(): CompleteMetadata {
  if (!METADATA_JSON) {
    throw new Error(
      'Tool metadata not initialized. Call and await initializeToolMetadata() before using tool metadata.'
    );
  }
  return METADATA_JSON;
}

/**
 * Returns the current metadata or null if not initialized.
 * @internal Used by proxies for safe access.
 */
export function getMetadataOrNull(): CompleteMetadata | null {
  return METADATA_JSON;
}

/**
 * Initializes tool metadata from @octocodeai/octocode-core.
 * Safe to call multiple times - subsequent calls are no-ops.
 */
export async function initializeToolMetadata(): Promise<void> {
  if (METADATA_JSON) {
    return;
  }
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    const complete = await getMetadata();
    METADATA_JSON = deepFreeze(complete);
  })();
  await initializationPromise;
}

/**
 * Loads and returns tool metadata.
 * Initializes if not already done.
 */
export async function loadToolContent(): Promise<CompleteMetadata> {
  if (!METADATA_JSON) {
    await initializeToolMetadata();
  }
  return getMetadataOrThrow();
}

/**
 * Resets metadata state. FOR TESTING ONLY.
 * @internal
 */
export function _resetMetadataState(): void {
  METADATA_JSON = null;
  initializationPromise = null;
  metadataCache = null;
}
