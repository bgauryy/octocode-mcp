import type { ContextSegmentV1 } from '@octocodeai/octocode-awareness';

export interface CurrentRehydrationSource {
  segment: ContextSegmentV1;
  content: string;
}
