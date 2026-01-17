/**
 * Metadata state management - initialization, fetching, and caching.
 * Handles the singleton lifecycle of tool metadata.
 */
import { fetchWithRetries } from '../../utils/http/fetch.js';
import { TOOL_METADATA_ERRORS } from '../../errorCodes.js';
import { logSessionError } from '../../session.js';
import { CompleteMetadata, ToolNames } from '../../types/metadata.js';
import { RawCompleteMetadataSchema } from './schemas.js';

// ============================================================================
// Constants
// ============================================================================

const METADATA_URL = 'https://octocodeai.com/api/mcpContent';

// ============================================================================
// State
// ============================================================================

let METADATA_JSON: CompleteMetadata | null = null;
let initializationPromise: Promise<void> | null = null;
let metadataCache: CompleteMetadata | null = null;
let metadataPromise: Promise<CompleteMetadata> | null = null;

// ============================================================================
// Helpers
// ============================================================================

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
 * Fetches and validates metadata from the API.
 */
export async function getMetadata(): Promise<CompleteMetadata> {
  if (metadataCache) {
    return metadataCache;
  }

  if (metadataPromise) {
    return metadataPromise;
  }

  metadataPromise = (async (): Promise<CompleteMetadata> => {
    const responseData = await fetchWithRetries(METADATA_URL, {
      maxRetries: 3,
      includeVersion: true,
    });

    const parseResult = RawCompleteMetadataSchema.safeParse(responseData);

    if (!parseResult.success) {
      await logSessionError(
        'toolMetadata',
        TOOL_METADATA_ERRORS.INVALID_API_RESPONSE.code
      );
      throw new Error(TOOL_METADATA_ERRORS.INVALID_FORMAT.message);
    }

    const raw = parseResult.data;
    const toolNames = raw.toolNames as unknown as ToolNames;
    const baseSchema = raw.baseSchema;

    const result: CompleteMetadata = {
      instructions: raw.instructions,
      prompts: raw.prompts,
      toolNames,
      baseSchema: {
        mainResearchGoal: baseSchema.mainResearchGoal,
        researchGoal: baseSchema.researchGoal,
        reasoning: baseSchema.reasoning,
        bulkQuery: (toolName: string) =>
          baseSchema.bulkQueryTemplate.replace('{toolName}', toolName),
      },
      tools: raw.tools,
      baseHints: raw.baseHints,
      genericErrorHints: raw.genericErrorHints,
      bulkOperations: raw.bulkOperations,
    };

    metadataCache = result;
    return result;
  })();

  try {
    return await metadataPromise;
  } catch (error) {
    metadataPromise = null;
    throw error;
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Gets the current metadata, throwing if not initialized.
 * @internal Used by proxies and helper functions.
 */
export function getMetadataOrThrow(): CompleteMetadata {
  if (!METADATA_JSON) {
    logSessionError(
      'toolMetadata',
      TOOL_METADATA_ERRORS.INVALID_FORMAT.code
    ).catch(() => {});
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
 * Initializes tool metadata from the remote API.
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

// ============================================================================
// Testing Utilities
// ============================================================================

/**
 * Resets metadata state. FOR TESTING ONLY.
 * @internal
 */
export function _resetMetadataState(): void {
  METADATA_JSON = null;
  initializationPromise = null;
  metadataCache = null;
  metadataPromise = null;
}
