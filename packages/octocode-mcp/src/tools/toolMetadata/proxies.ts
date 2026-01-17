/**
 * Proxy-based exports for lazy metadata access.
 * These proxies defer to the metadata state, enabling access before/after init.
 */
import { CompleteMetadata, ToolNames } from '../../types/metadata.js';
import { LOCAL_BASE_HINTS } from '../local_ripgrep/hints.js';
import { STATIC_TOOL_NAMES, isLocalTool } from '../toolNames.js';
import { getMetadataOrNull } from './state.js';

// ============================================================================
// Types
// ============================================================================

type ToolNamesValue = ToolNames[keyof ToolNames];
type ToolNamesMap = Record<string, ToolNamesValue>;

// ============================================================================
// TOOL_NAMES Proxy
// ============================================================================

/**
 * Proxy for accessing tool names.
 * Falls back to STATIC_TOOL_NAMES when metadata not loaded.
 */
export const TOOL_NAMES = new Proxy({} as CompleteMetadata['toolNames'], {
  get(_target, prop: string) {
    const metadata = getMetadataOrNull();
    if (metadata) {
      const value = (metadata.toolNames as unknown as ToolNamesMap)[prop];
      if (value !== undefined) {
        return value;
      }
    }
    return STATIC_TOOL_NAMES[prop as keyof typeof STATIC_TOOL_NAMES];
  },
  ownKeys() {
    const metadata = getMetadataOrNull();
    return metadata
      ? Object.keys(metadata.toolNames)
      : Object.keys(STATIC_TOOL_NAMES);
  },
  getOwnPropertyDescriptor(_target, prop) {
    const metadata = getMetadataOrNull();
    if (metadata) {
      if (prop in metadata.toolNames) {
        return {
          enumerable: true,
          configurable: true,
          value: (metadata.toolNames as unknown as ToolNamesMap)[
            prop as string
          ],
        };
      }
      return undefined;
    }
    if (prop in STATIC_TOOL_NAMES) {
      return {
        enumerable: true,
        configurable: true,
        value: STATIC_TOOL_NAMES[prop as keyof typeof STATIC_TOOL_NAMES],
      };
    }
    return undefined;
  },
}) as CompleteMetadata['toolNames'];

// ============================================================================
// BASE_SCHEMA Proxy
// ============================================================================

/**
 * Proxy for accessing base schema fields.
 * Returns fallback values when metadata not loaded.
 */
export const BASE_SCHEMA = new Proxy({} as CompleteMetadata['baseSchema'], {
  get(_target, prop: string) {
    const metadata = getMetadataOrNull();
    if (metadata) {
      return (metadata.baseSchema as Record<string, unknown>)[
        prop
      ] as CompleteMetadata['baseSchema'][keyof CompleteMetadata['baseSchema']];
    }
    if (prop === 'bulkQuery') {
      return (toolName: string) =>
        `Research queries for ${toolName} (1-3 queries per call for optimal resource management). Review schema before use for optimal results`;
    }
    return '';
  },
}) as CompleteMetadata['baseSchema'];

// ============================================================================
// GENERIC_ERROR_HINTS Proxy
// ============================================================================

/**
 * Proxy for accessing generic error hints.
 * Returns empty array when metadata not loaded.
 */
export const GENERIC_ERROR_HINTS: readonly string[] = new Proxy(
  [] as unknown as readonly string[],
  {
    get(_t, prop: string | symbol) {
      const metadata = getMetadataOrNull();
      if (metadata) {
        const target = metadata.genericErrorHints as unknown as Record<
          string | symbol,
          unknown
        >;
        return target[prop];
      }
      const fallback: unknown[] = [];
      return (fallback as unknown as Record<string | symbol, unknown>)[prop];
    },
  }
) as readonly string[];

// ============================================================================
// DESCRIPTIONS Proxy
// ============================================================================

/**
 * Proxy for accessing tool descriptions.
 * Returns empty string for unknown tools.
 */
export const DESCRIPTIONS = new Proxy({} as Record<string, string>, {
  get(_target, prop: string) {
    const metadata = getMetadataOrNull();
    return metadata?.tools[prop]?.description ?? '';
  },
});

// ============================================================================
// TOOL_HINTS Proxy
// ============================================================================

type ToolHintsType = Record<
  string,
  { hasResults: readonly string[]; empty: readonly string[] }
> & { base: { hasResults: readonly string[]; empty: readonly string[] } };

/**
 * Proxy for accessing tool hints.
 * Returns empty hints for unknown tools.
 */
export const TOOL_HINTS = new Proxy({} as ToolHintsType, {
  get(
    _target,
    prop: string
  ): { hasResults: readonly string[]; empty: readonly string[] } {
    const metadata = getMetadataOrNull();
    if (!metadata) {
      return { hasResults: [], empty: [] };
    }
    if (prop === 'base') {
      return metadata.baseHints;
    }
    return metadata.tools[prop]?.hints ?? { hasResults: [], empty: [] };
  },
  ownKeys() {
    const metadata = getMetadataOrNull();
    return ['base', ...Object.keys(metadata?.tools ?? {})];
  },
  getOwnPropertyDescriptor(_target, prop) {
    const metadata = getMetadataOrNull();
    if (!metadata) {
      if (prop === 'base') {
        return {
          enumerable: true,
          configurable: true,
          value: { hasResults: [], empty: [] },
        };
      }
      return undefined;
    }
    if (prop === 'base' || metadata.tools[prop as string]) {
      const value =
        prop === 'base'
          ? metadata.baseHints
          : (metadata.tools[prop as string]?.hints ?? {
              hasResults: [],
              empty: [],
            });
      return {
        enumerable: true,
        configurable: true,
        value,
      };
    }
    return undefined;
  },
});

// ============================================================================
// Hint Helper Functions
// ============================================================================

/**
 * Checks if a tool exists in the loaded metadata.
 */
export function isToolInMetadata(toolName: string): boolean {
  const metadata = getMetadataOrNull();
  if (!metadata) {
    return false;
  }
  const tools = metadata.tools ?? {};
  return Object.prototype.hasOwnProperty.call(tools, toolName);
}

/**
 * Gets combined hints for a tool (base + tool-specific).
 * Uses local base hints for local tools to avoid GitHub-specific context.
 */
export function getToolHintsSync(
  toolName: string,
  resultType: 'hasResults' | 'empty'
): readonly string[] {
  const metadata = getMetadataOrNull();
  if (!metadata || !metadata.tools[toolName]) {
    return [];
  }

  // Use separated hints for local tools to avoid GitHub-specific context
  const baseHints = isLocalTool(toolName)
    ? (LOCAL_BASE_HINTS[resultType] ?? [])
    : (metadata.baseHints[resultType] ?? []);

  const toolHints = metadata.tools[toolName]?.hints[resultType] ?? [];
  return [...baseHints, ...toolHints];
}

/**
 * Gets generic error hints.
 */
export function getGenericErrorHintsSync(): readonly string[] {
  const metadata = getMetadataOrNull();
  if (!metadata) {
    return [];
  }
  return metadata.genericErrorHints;
}

/**
 * Gets dynamic hints for a tool by hint type.
 */
export function getDynamicHints(
  toolName: string,
  hintType: string
): readonly string[] {
  const metadata = getMetadataOrNull();
  if (!metadata) return [];

  const tool = (metadata.tools as Record<string, unknown>)[toolName] as
    | {
        hints?: {
          dynamic?: Record<string, string[] | undefined>;
        };
      }
    | undefined;
  return tool?.hints?.dynamic?.[hintType] ?? [];
}
