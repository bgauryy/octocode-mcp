import { CompleteMetadata } from '../../types/metadata.js';
import { getMetadataOrNull } from './state.js';

/**
 * Proxy for accessing base schema fields.
 * Returns fallback values when metadata is not loaded.
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
