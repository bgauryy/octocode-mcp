import { completeMetadata } from '@octocodeai/octocode-core';
import { getMetadataOrNull } from './state.js';

export const GENERIC_ERROR_HINTS: readonly string[] = new Proxy(
  [] as unknown as readonly string[],
  {
    get(_target, prop: string | symbol) {
      const metadata = getMetadataOrNull() ?? completeMetadata;
      const source = metadata.genericErrorHints as unknown as Record<
        string | symbol,
        unknown
      >;
      return source[prop];
    },
  }
) as readonly string[];
