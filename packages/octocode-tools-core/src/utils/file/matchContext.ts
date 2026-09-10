import type { FetchContentQuery } from '@octocodeai/octocode-core/schema';

export function matchContext(
  query: Pick<FetchContentQuery, 'chunkType' | 'contextLines' | 'contextBytes'>
) {
  if (query.contextBytes !== undefined)
    return { contextBytes: query.contextBytes };
  if (query.contextLines !== undefined)
    return { contextLines: query.contextLines };
  return query.chunkType === 'bytes'
    ? { contextBytes: 256 }
    : { contextLines: 5 };
}
