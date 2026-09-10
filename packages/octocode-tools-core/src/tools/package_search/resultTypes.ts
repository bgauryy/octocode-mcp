import type {
  ArtifactItem,
  ArtifactType,
} from '@octocodeai/octocode-core/types';
import type { ToolContinuation } from '../../scheme/pagination.js';
import type { BulkToolOutput } from '../../types/toolOutput.js';

export interface ArtifactSearchData {
  type: ArtifactType;
  artifacts: ArtifactItem[];
  pagination?: {
    perPage: number;
    returned: number;
    hasMore: boolean;
    totalFound?: number;
    continuationUnavailable?: { reason: string };
  };
  next?: Record<string, ToolContinuation>;
  [key: string]: unknown;
}
export type ArtifactSearchOutputLocal = BulkToolOutput<ArtifactSearchData>;
