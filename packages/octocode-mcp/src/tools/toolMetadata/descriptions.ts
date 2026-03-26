import { getMetadataOrNull } from './state.js';

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
