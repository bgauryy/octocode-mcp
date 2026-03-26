import { getMetadataOrNull } from './state.js';

/**
 * Proxy for accessing generic error hints.
 * Returns empty array when metadata is not loaded.
 */
export const GENERIC_ERROR_HINTS: readonly string[] = new Proxy(
  [] as unknown as readonly string[],
  {
    get(_target, prop: string | symbol) {
      const metadata = getMetadataOrNull();
      if (metadata) {
        const source = metadata.genericErrorHints as unknown as Record<
          string | symbol,
          unknown
        >;
        return source[prop];
      }
      const fallback: unknown[] = [];
      return (fallback as unknown as Record<string | symbol, unknown>)[prop];
    },
  }
) as readonly string[];
