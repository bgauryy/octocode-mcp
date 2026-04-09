import { completeMetadata } from '@octocodeai/octocode-core';
import type { CompleteMetadata } from '@octocodeai/octocode-core';
import { getMetadataOrNull } from './state.js';

export const BASE_SCHEMA = new Proxy({} as CompleteMetadata['baseSchema'], {
  get(_target, prop: string) {
    const metadata = getMetadataOrNull();
    return (
      (metadata ?? completeMetadata).baseSchema as Record<string, unknown>
    )[prop];
  },
}) as CompleteMetadata['baseSchema'];
