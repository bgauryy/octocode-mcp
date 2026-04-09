import { completeMetadata } from '@octocodeai/octocode-core';
import { getMetadataOrNull } from './state.js';

export const DESCRIPTIONS = new Proxy({} as Record<string, string>, {
  get(_target, prop: string) {
    const metadata = getMetadataOrNull();
    return (metadata ?? completeMetadata).tools[prop]?.description ?? '';
  },
});
