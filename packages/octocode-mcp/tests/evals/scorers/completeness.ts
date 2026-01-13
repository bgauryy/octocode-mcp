/**
 * Completeness Scorer - Evaluates if all expected information was retrieved
 */

import type {
  EvalScorer,
  EvalContext,
  ExpectedResult,
  ToolResponse,
  CompletenessScorerOptions,
} from './types.js';

const DEFAULT_OPTIONS: CompletenessScorerOptions = {
  penalizeTruncated: true,
  truncationPenalty: 0.2,
  minResultsWeight: 0.3,
};

export class CompletenessScorer implements EvalScorer {
  name = 'completeness';
  weight = 0.2;
  private options: CompletenessScorerOptions;

  constructor(options: Partial<CompletenessScorerOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async score(
    output: ToolResponse | ToolResponse[],
    expected: ExpectedResult,
    _ctx: EvalContext
  ): Promise<number> {
    const responses = Array.isArray(output) ? output : [output];

    let score = 0;
    let weights = 0;

    // Check for truncated/partial results
    const hasTruncation = responses.some(
      r =>
        r.pagination?.hasMore === true ||
        (r as { isPartial?: boolean }).isPartial === true
    );

    // Base score on having results
    const hasResults = responses.some(r => r.status === 'hasResults');
    const hasError = responses.some(r => r.status === 'error');

    if (hasResults && !hasError) {
      score += 0.4;
      weights += 0.4;
    } else if (hasResults) {
      score += 0.2;
      weights += 0.4;
    } else {
      weights += 0.4;
    }

    // Check pagination completeness
    const paginationWeight = 0.3;
    weights += paginationWeight;

    for (const response of responses) {
      if (response.pagination) {
        const { currentPage, totalPages, hasMore } = response.pagination;

        // Full score if we're on the last page or no more results
        if (!hasMore || currentPage === totalPages) {
          score += paginationWeight;
        } else {
          // Partial score based on how much we've retrieved
          const progress = currentPage / totalPages;
          score += paginationWeight * progress;
        }
        break; // Only count first pagination
      } else {
        // No pagination means complete (single page of results)
        score += paginationWeight;
        break;
      }
    }

    // Check minimum results requirement
    if (expected.minResults !== undefined) {
      weights += this.options.minResultsWeight;

      const totalResults = responses.reduce((sum, r) => {
        return (
          sum +
          ((r.files as unknown[])?.length ?? 0) +
          ((r.repositories as unknown[])?.length ?? 0) +
          ((r.packages as unknown[])?.length ?? 0) +
          ((r.locations as unknown[])?.length ?? 0)
        );
      }, 0);

      if (totalResults >= expected.minResults) {
        score += this.options.minResultsWeight;
      } else if (totalResults > 0) {
        const ratio = totalResults / expected.minResults;
        score += this.options.minResultsWeight * ratio;
      }
    }

    // Penalize truncation if enabled
    if (this.options.penalizeTruncated && hasTruncation) {
      score -= this.options.truncationPenalty;
    }

    // Check if all expected files were found
    if (expected.expectedFiles && expected.expectedFiles.length > 0) {
      const foundFiles = this.extractFoundFiles(responses);
      const matchedCount = expected.expectedFiles.filter(ef =>
        foundFiles.some(f => f.includes(ef) || ef.includes(f))
      ).length;

      const fileWeight = 0.3;
      weights += fileWeight;
      score += fileWeight * (matchedCount / expected.expectedFiles.length);
    }

    // Normalize score
    const normalizedScore = weights > 0 ? score / weights : 0.5;
    return Math.min(1, Math.max(0, normalizedScore));
  }

  async explain(
    output: ToolResponse | ToolResponse[],
    expected: ExpectedResult,
    _ctx: EvalContext
  ): Promise<string> {
    const responses = Array.isArray(output) ? output : [output];
    const explanations: string[] = [];

    // Check truncation
    const hasTruncation = responses.some(
      r =>
        r.pagination?.hasMore === true ||
        (r as { isPartial?: boolean }).isPartial === true
    );

    if (hasTruncation) {
      explanations.push('Results are truncated/partial');
    } else {
      explanations.push('Results are complete');
    }

    // Pagination info
    for (const response of responses) {
      if (response.pagination) {
        const { currentPage, totalPages, totalMatches, totalFiles } =
          response.pagination;
        explanations.push(
          `Pagination: page ${currentPage}/${totalPages}` +
            (totalMatches ? `, ${totalMatches} total matches` : '') +
            (totalFiles ? `, ${totalFiles} total files` : '')
        );
        break;
      }
    }

    // Results count
    const totalResults = responses.reduce((sum, r) => {
      return (
        sum +
        ((r.files as unknown[])?.length ?? 0) +
        ((r.repositories as unknown[])?.length ?? 0) +
        ((r.packages as unknown[])?.length ?? 0) +
        ((r.locations as unknown[])?.length ?? 0)
      );
    }, 0);

    explanations.push(`Retrieved ${totalResults} results`);

    if (expected.minResults !== undefined) {
      explanations.push(
        `Expected minimum: ${expected.minResults} (${
          totalResults >= expected.minResults ? 'met' : 'not met'
        })`
      );
    }

    // Expected files coverage
    if (expected.expectedFiles && expected.expectedFiles.length > 0) {
      const foundFiles = this.extractFoundFiles(responses);
      const matchedCount = expected.expectedFiles.filter(ef =>
        foundFiles.some(f => f.includes(ef) || ef.includes(f))
      ).length;
      explanations.push(
        `Expected files: ${matchedCount}/${expected.expectedFiles.length} found`
      );
    }

    return explanations.join('. ');
  }

  private extractFoundFiles(responses: ToolResponse[]): string[] {
    const files: string[] = [];

    for (const response of responses) {
      // Direct path
      if (response.path && typeof response.path === 'string') {
        files.push(response.path);
      }

      // Files array
      const fileList = response.files as Array<{ path?: string }> | undefined;
      if (fileList) {
        for (const file of fileList) {
          if (file.path) {
            files.push(file.path);
          }
        }
      }
    }

    return files;
  }
}

export function createCompletenessScorer(
  options?: Partial<CompletenessScorerOptions>
): CompletenessScorer {
  return new CompletenessScorer(options);
}
