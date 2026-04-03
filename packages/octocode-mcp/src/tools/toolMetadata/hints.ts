import { getMetadataOrNull } from './state.js';

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

/**
 * Gets combined base + tool-specific hints for a tool.
 */
export function getToolHintsSync(
  toolName: string,
  resultType: 'hasResults' | 'empty'
): readonly string[] {
  const metadata = getMetadataOrNull();
  if (!metadata || !metadata.tools[toolName]) {
    return [];
  }
  const baseHints = metadata.baseHints?.[resultType] ?? [];
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
