import type { GitHubCodeSearchQuery, GitHubReposSearchQuery } from '../types';
import { GitHubPullRequestsSearchParams } from './githubAPI';

export function getOwnerQualifier(owner: string): string {
  if (
    owner.includes('-') ||
    owner.includes('_') ||
    owner.toLowerCase().includes('org')
  ) {
    return `org:${owner}`;
  } else {
    return `user:${owner}`;
  }
}

abstract class BaseQueryBuilder {
  protected queryParts: string[] = [];

  addOwnerRepo(params: {
    owner?: string | string[] | null;
    repo?: string | string[] | null;
  }): this {
    if (params.owner && params.repo) {
      const owners = Array.isArray(params.owner)
        ? params.owner
        : [params.owner];
      const repos = Array.isArray(params.repo) ? params.repo : [params.repo];

      owners.forEach(owner => {
        repos.forEach(repo => {
          this.queryParts.push(`repo:${owner}/${repo}`);
        });
      });
    } else if (params.owner) {
      const owners = Array.isArray(params.owner)
        ? params.owner
        : [params.owner];
      owners.forEach(owner => {
        this.queryParts.push(getOwnerQualifier(owner));
      });
    }
    return this;
  }

  addDateFilters(
    params: Record<string, unknown> | GitHubPullRequestsSearchParams
  ): this {
    const dateFields: Record<string, string> = {
      created: 'created',
      updated: 'updated',
      'author-date': 'author-date',
      'committer-date': 'committer-date',
      'merged-at': 'merged',
      closed: 'closed',
    };

    Object.entries(dateFields).forEach(([paramKey, queryKey]) => {
      const value = (params as Record<string, unknown>)[paramKey];
      if (value) {
        this.queryParts.push(`${queryKey}:${value}`);
      }
    });
    return this;
  }

  addArrayFilter(
    values: string | string[] | null | undefined,
    prefix: string,
    quoted = false
  ): this {
    if (values && values !== null) {
      const valueArray = Array.isArray(values) ? values : [values];
      valueArray.forEach(value => {
        const formattedValue = quoted ? `"${value}"` : value;
        this.queryParts.push(`${prefix}:${formattedValue}`);
      });
    }
    return this;
  }

  addBooleanFilter(
    value: boolean | undefined,
    trueQuery: string,
    falseQuery: string
  ): this {
    if (value === true) {
      this.queryParts.push(trueQuery);
    } else if (value === false) {
      this.queryParts.push(falseQuery);
    }
    return this;
  }

  addSimpleFilter(
    value: string | number | null | undefined,
    key: string
  ): this {
    if (value !== undefined && value !== null) {
      this.queryParts.push(`${key}:${value}`);
    }
    return this;
  }

  build(): string {
    return this.queryParts.join(' ').trim();
  }
}

class CodeSearchQueryBuilder extends BaseQueryBuilder {
  addQueryTerms(params: GitHubCodeSearchQuery): this {
    if (
      Array.isArray(params.keywordsToSearch) &&
      params.keywordsToSearch.length > 0
    ) {
      const nonEmptyTerms = params.keywordsToSearch.filter(
        term => term && term.trim()
      );
      if (nonEmptyTerms.length > 0) {
        this.queryParts.push(...nonEmptyTerms);
      }
    }
    return this;
  }

  addSearchFilters(params: GitHubCodeSearchQuery): this {
    this.addSimpleFilter(params.filename, 'filename');
    this.addSimpleFilter(params.extension, 'extension');
    this.addSimpleFilter(params.path, 'path');
    this.addSimpleFilter(params.stars, 'stars');
    return this;
  }

  addMatchFilters(params: GitHubCodeSearchQuery): this {
    if (params.match) {
      const matches = Array.isArray(params.match)
        ? params.match
        : [params.match];
      matches.forEach(match => {
        if (match === 'file') {
          this.queryParts.push('in:file');
        } else if (match === 'path') {
          this.queryParts.push('in:path');
        }
      });
    }
    return this;
  }
}

class RepoSearchQueryBuilder extends BaseQueryBuilder {
  addQueryTerms(params: GitHubReposSearchQuery): this {
    if (
      Array.isArray(params.keywordsToSearch) &&
      params.keywordsToSearch.length > 0
    ) {
      this.queryParts.push(...params.keywordsToSearch);
    }
    return this;
  }

  addRepoFilters(params: GitHubReposSearchQuery): this {
    this.addArrayFilter(params.topicsToSearch, 'topic');
    this.addSimpleFilter(params.stars, 'stars');
    this.addSimpleFilter(params.size, 'size');
    this.addSimpleFilter(params.created, 'created');

    if (params.updated) {
      this.queryParts.push(`pushed:${params.updated}`);
    }

    return this;
  }

  addMatchFilters(params: GitHubReposSearchQuery): this {
    if (params.match) {
      const matches = Array.isArray(params.match)
        ? params.match
        : [params.match];
      matches.forEach(match => {
        if (match === 'name') {
          this.queryParts.push('in:name');
        } else if (match === 'description') {
          this.queryParts.push('in:description');
        } else if (match === 'readme') {
          this.queryParts.push('in:readme');
        }
      });
    }
    return this;
  }

  addQualityFilters(): this {
    this.queryParts.push('is:not-archived');
    return this;
  }
}

class PullRequestSearchQueryBuilder extends BaseQueryBuilder {
  addBasicFilters(params: GitHubPullRequestsSearchParams): this {
    if (params.query && params.query.trim()) {
      this.queryParts.push(params.query.trim());
    }

    this.queryParts.push('is:pr');
    return this;
  }

  addStateFilters(params: GitHubPullRequestsSearchParams): this {
    this.addSimpleFilter(params.state, 'is');
    this.addBooleanFilter(params.draft, 'is:draft', '-is:draft');
    this.addBooleanFilter(params.merged, 'is:merged', 'is:unmerged');
    return this;
  }

  addUserFilters(params: GitHubPullRequestsSearchParams): this {
    this.addSimpleFilter(params.author, 'author');
    this.addSimpleFilter(params.assignee, 'assignee');
    this.addSimpleFilter(params.mentions, 'mentions');
    this.addSimpleFilter(params.commenter, 'commenter');
    this.addSimpleFilter(params.involves, 'involves');
    this.addSimpleFilter(params['reviewed-by'], 'reviewed-by');
    this.addSimpleFilter(params['review-requested'], 'review-requested');
    return this;
  }

  addBranchFilters(params: GitHubPullRequestsSearchParams): this {
    this.addSimpleFilter(params.head, 'head');
    this.addSimpleFilter(params.base, 'base');
    return this;
  }

  addEngagementFilters(params: GitHubPullRequestsSearchParams): this {
    this.addSimpleFilter(params.comments, 'comments');
    this.addSimpleFilter(params.reactions, 'reactions');
    this.addSimpleFilter(params.interactions, 'interactions');
    return this;
  }

  addReviewFilters(_params: GitHubPullRequestsSearchParams): this {
    return this;
  }

  addOrganizationFilters(params: GitHubPullRequestsSearchParams): this {
    this.addArrayFilter(params.label, 'label', true);
    return this;
  }

  addNegativeFilters(params: GitHubPullRequestsSearchParams): this {
    if (params['no-assignee']) this.queryParts.push('no:assignee');
    if (params['no-label']) this.queryParts.push('no:label');
    if (params['no-milestone']) this.queryParts.push('no:milestone');
    if (params['no-project']) this.queryParts.push('no:project');
    return this;
  }

  addMiscFilters(_params: GitHubPullRequestsSearchParams): this {
    this.queryParts.push('archived:false');
    return this;
  }
}

export function buildCodeSearchQuery(params: GitHubCodeSearchQuery): string {
  return new CodeSearchQueryBuilder()
    .addQueryTerms(params)
    .addSearchFilters(params)
    .addOwnerRepo(params)
    .addMatchFilters(params)
    .build();
}

export function buildRepoSearchQuery(params: GitHubReposSearchQuery): string {
  return new RepoSearchQueryBuilder()
    .addQueryTerms(params)
    .addOwnerRepo(params)
    .addRepoFilters(params)
    .addMatchFilters(params)
    .addQualityFilters()
    .build();
}

export function buildPullRequestSearchQuery(
  params: GitHubPullRequestsSearchParams
): string {
  return new PullRequestSearchQueryBuilder()
    .addBasicFilters(params)
    .addOwnerRepo(params)
    .addStateFilters(params)
    .addUserFilters(params)
    .addBranchFilters(params)
    .addDateFilters(params)
    .addEngagementFilters(params)
    .addReviewFilters(params)
    .addOrganizationFilters(params)
    .addNegativeFilters(params)
    .addMiscFilters(params)
    .build();
}

export function shouldUseSearchForPRs(
  params: GitHubPullRequestsSearchParams
): boolean {
  // Use search if we have complex filters
  return (
    params.draft !== undefined ||
    params.author !== undefined ||
    params.assignee !== undefined ||
    params.query !== undefined ||
    (params.label && params.label.length > 0) ||
    params.mentions !== undefined ||
    params.commenter !== undefined ||
    params.involves !== undefined ||
    params['reviewed-by'] !== undefined ||
    params['review-requested'] !== undefined ||
    params.reactions !== undefined ||
    params.comments !== undefined ||
    params.interactions !== undefined ||
    params['no-assignee'] !== undefined ||
    params['no-label'] !== undefined ||
    params['no-milestone'] !== undefined ||
    params['no-project'] !== undefined ||
    params.created !== undefined ||
    params.updated !== undefined ||
    params['merged-at'] !== undefined ||
    params.closed !== undefined ||
    params.merged !== undefined ||
    Array.isArray(params.owner) ||
    Array.isArray(params.repo)
  );
}
