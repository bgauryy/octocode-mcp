import { describe, expect, it } from 'vitest';

import { GitHubCodeSearchQueryLocalSchema } from '@octocodeai/octocode-core/schema';
import { GitHubReposSearchSingleQueryLocalSchema } from '@octocodeai/octocode-core/schema';
import { GitHubPullRequestSearchQueryLocalSchema } from '@octocodeai/octocode-core/schema';
import { LocalRipgrepQuerySchema } from '@octocodeai/octocode-core/schema';

function fieldDescription(schema: unknown, field: string): string | undefined {
  const shape = (schema as { shape?: Record<string, { description?: string }> })
    .shape;
  return shape?.[field]?.description;
}

describe('cross-tool field disambiguation (mode/match/keywords/filesOnly)', () => {
  it('ghSearch code match distinguishes the repositories operation', () => {
    const desc = fieldDescription(GitHubCodeSearchQueryLocalSchema, 'match');
    expect(desc).toContain('ghSearch operation:"code"');
    expect(desc).toContain('Operation:"repositories"');
  });

  it('ghSearch repositories match distinguishes the code operation', () => {
    const desc = fieldDescription(
      GitHubReposSearchSingleQueryLocalSchema,
      'match'
    );
    expect(desc).toContain('ghSearch operation:"repositories"');
    expect(desc).toContain('Operation:"code"');
  });

  it('history match distinguishes ghSearch code; issueNumber is described', () => {
    const matchDesc = fieldDescription(
      GitHubPullRequestSearchQueryLocalSchema,
      'match'
    );
    expect(matchDesc).toContain('ghSearch operation:"code"');

    const issueNumberDesc = fieldDescription(
      GitHubPullRequestSearchQueryLocalSchema,
      'issueNumber'
    );
    expect(issueNumberDesc).toBeTruthy();
  });

  it('keeps the local lexical-pattern description self-contained', () => {
    const modeDesc = fieldDescription(LocalRipgrepQuerySchema, 'mode');
    expect(modeDesc).toContain('structural');
    expect(modeDesc).not.toContain('ghSearchPullRequests');
    expect(modeDesc).not.toContain('localBinaryInspect');

    const searchTextDesc = fieldDescription(
      LocalRipgrepQuerySchema,
      'searchText'
    );
    expect(searchTextDesc).toContain('Single lexical pattern');
    expect(searchTextDesc).not.toContain('ghSearch operation:"code"');
  });
});
