import type { ArtifactType } from '@octocodeai/octocode-core/schema';
export type { ArtifactType } from '@octocodeai/octocode-core/schema';
export type { ArtifactItem as Artifact } from '@octocodeai/octocode-core/types';
import type { ArtifactItem as Artifact } from '@octocodeai/octocode-core/types';

export interface ArtifactQuery {
  type: ArtifactType;
  packageName?: string;
  keywords?: string[];
  pageSize?: number;
}

/** Internal provider position; public callers receive a query-bound opaque cursor. */
export interface ArtifactProviderState {
  offset?: number;
  page?: number;
  token?: string;
}

export interface ArtifactProviderResult {
  /** Complete native page. RubyGems always returns up to 30, irrespective of pageSize. */
  artifacts: Artifact[];
  nextState?: ArtifactProviderState;
  /** Provider-reported total only; absent means unknown. */
  total?: number;
  terminalLimit?: { reason: string };
}

export type ArtifactProviderErrorCode =
  | 'unsupported_capability'
  | 'invalid_query'
  | 'authentication'
  | 'rate_limit'
  | 'provider_error';

export class ArtifactProviderError extends Error {
  constructor(
    public readonly code: ArtifactProviderErrorCode,
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'ArtifactProviderError';
  }
}
