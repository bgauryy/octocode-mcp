/**
 * Accuracy Scorer - Evaluates correctness of tool results
 */

import type {
  EvalScorer,
  EvalContext,
  ExpectedResult,
  ToolResponse,
  AccuracyScorerOptions,
} from './types.js';

const DEFAULT_OPTIONS: AccuracyScorerOptions = {
  requireAllExpectedFiles: false,
  partialMatchScore: 0.5,
};

export class AccuracyScorer implements EvalScorer {
  name = 'accuracy';
  weight = 0.25;
  private options: AccuracyScorerOptions;

  constructor(options: Partial<AccuracyScorerOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async score(
    output: ToolResponse | ToolResponse[],
    expected: ExpectedResult,
    _ctx: EvalContext
  ): Promise<number> {
    const responses = Array.isArray(output) ? output : [output];

    let score = 0;
    let checks = 0;

    // Check status matches expected
    if (expected.status) {
      checks++;
      const hasExpectedStatus = responses.some(
        r => r.status === expected.status
      );
      if (hasExpectedStatus) {
        score += 1;
      } else if (responses.some(r => r.status === 'hasResults')) {
        // Partial credit if we got results but not the exact expected status
        score += this.options.partialMatchScore;
      }
    }

    // Check minimum results
    if (expected.minResults !== undefined) {
      checks++;
      const totalResults = responses.reduce((sum, r) => {
        const resultsCount =
          (r.files as unknown[])?.length ??
          (r.repositories as unknown[])?.length ??
          (r.packages as unknown[])?.length ??
          (r.locations as unknown[])?.length ??
          0;
        return sum + resultsCount;
      }, 0);

      if (totalResults >= expected.minResults) {
        score += 1;
      } else if (totalResults > 0) {
        score +=
          (totalResults / expected.minResults) * this.options.partialMatchScore;
      }
    }

    // Check expected files are found
    if (expected.expectedFiles && expected.expectedFiles.length > 0) {
      checks++;
      const foundFiles = new Set<string>();

      for (const response of responses) {
        const files = response.files as Array<{ path?: string }> | undefined;
        if (files) {
          for (const file of files) {
            if (file.path) {
              foundFiles.add(file.path);
            }
          }
        }
        // Also check content field for file content responses
        if (response.path && typeof response.path === 'string') {
          foundFiles.add(response.path);
        }
      }

      const matchedFiles = expected.expectedFiles.filter(expectedFile =>
        Array.from(foundFiles).some(
          found => found.includes(expectedFile) || expectedFile.includes(found)
        )
      );

      const matchRatio = matchedFiles.length / expected.expectedFiles.length;

      if (this.options.requireAllExpectedFiles) {
        score +=
          matchRatio === 1 ? 1 : matchRatio * this.options.partialMatchScore;
      } else {
        score += matchRatio;
      }
    }

    // Check must contain patterns
    if (expected.mustContain && expected.mustContain.length > 0) {
      checks++;
      const allContent = this.extractAllContent(responses);

      const matchedPatterns = expected.mustContain.filter(pattern =>
        allContent.toLowerCase().includes(pattern.toLowerCase())
      );

      score += matchedPatterns.length / expected.mustContain.length;
    }

    // Check must NOT contain patterns
    if (expected.mustNotContain && expected.mustNotContain.length > 0) {
      checks++;
      const allContent = this.extractAllContent(responses);

      const violatedPatterns = expected.mustNotContain.filter(pattern =>
        allContent.toLowerCase().includes(pattern.toLowerCase())
      );

      score += violatedPatterns.length === 0 ? 1 : 0;
    }

    // Check regex patterns
    if (expected.expectedPatterns && expected.expectedPatterns.length > 0) {
      checks++;
      const allContent = this.extractAllContent(responses);

      const matchedPatterns = expected.expectedPatterns.filter(pattern =>
        pattern.test(allContent)
      );

      score += matchedPatterns.length / expected.expectedPatterns.length;
    }

    // If no specific checks were defined, base score on having successful results
    if (checks === 0) {
      const hasResults = responses.some(r => r.status === 'hasResults');
      const hasError = responses.some(r => r.status === 'error');

      if (hasResults && !hasError) {
        return 0.8;
      } else if (hasResults) {
        return 0.5;
      } else if (hasError) {
        return 0.2;
      }
      return 0.4; // empty results, no error
    }

    return Math.min(1, Math.max(0, score / checks));
  }

  async explain(
    output: ToolResponse | ToolResponse[],
    expected: ExpectedResult,
    _ctx: EvalContext
  ): Promise<string> {
    const responses = Array.isArray(output) ? output : [output];
    const explanations: string[] = [];

    // Status check
    const statuses = responses.map(r => r.status);
    explanations.push(`Statuses: [${statuses.join(', ')}]`);

    if (expected.status) {
      const hasExpected = statuses.includes(expected.status);
      explanations.push(
        `Expected status "${expected.status}": ${hasExpected ? 'found' : 'not found'}`
      );
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

    explanations.push(`Total results: ${totalResults}`);

    if (expected.minResults !== undefined) {
      explanations.push(
        `Min results ${expected.minResults}: ${totalResults >= expected.minResults ? 'met' : 'not met'}`
      );
    }

    // Files check
    if (expected.expectedFiles && expected.expectedFiles.length > 0) {
      const foundFiles = new Set<string>();
      for (const response of responses) {
        const files = response.files as Array<{ path?: string }> | undefined;
        if (files) {
          for (const file of files) {
            if (file.path) {
              foundFiles.add(file.path);
            }
          }
        }
      }
      explanations.push(
        `Expected files: ${expected.expectedFiles.length}, Found matching: ${
          expected.expectedFiles.filter(ef =>
            Array.from(foundFiles).some(f => f.includes(ef))
          ).length
        }`
      );
    }

    // Content checks
    if (expected.mustContain && expected.mustContain.length > 0) {
      const allContent = this.extractAllContent(responses);
      const matched = expected.mustContain.filter(p =>
        allContent.toLowerCase().includes(p.toLowerCase())
      );
      explanations.push(
        `Must contain: ${matched.length}/${expected.mustContain.length} patterns found`
      );
    }

    return explanations.join('. ');
  }

  private extractAllContent(responses: ToolResponse[]): string {
    const parts: string[] = [];

    for (const response of responses) {
      // Direct content
      if (response.content && typeof response.content === 'string') {
        parts.push(response.content);
      }

      // File content and paths
      const files = response.files as
        | Array<{
            path?: string;
            content?: string;
            text_matches?: Array<{ fragment?: string }>;
          }>
        | undefined;

      if (files) {
        for (const file of files) {
          if (file.path) parts.push(file.path);
          if (file.content) parts.push(file.content);
          if (file.text_matches) {
            for (const match of file.text_matches) {
              if (match.fragment) parts.push(match.fragment);
            }
          }
        }
      }

      // Hints often contain useful info
      if (response.hints) {
        parts.push(...response.hints);
      }
    }

    return parts.join(' ');
  }
}

export function createAccuracyScorer(
  options?: Partial<AccuracyScorerOptions>
): AccuracyScorer {
  return new AccuracyScorer(options);
}
