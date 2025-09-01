import { GitHubCodeSearchQuery } from '../scheme/github_search_code';
import { GitHubReposSearchQuery } from '../scheme/github_search_repos';
import {
  GitHubPullRequestsSearchParams,
  GitHubCommitSearchParams,
} from './github-openapi';

/**
 * Helper function to intelligently detect if an owner is a user or organization
 * and return the appropriate search qualifier
 */
export function getOwnerQualifier(owner: string): string {
  // Use org: for organization-style names (containing hyphens, underscores, or 'org')
  // This heuristic covers most common organization naming patterns
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

/**
 * Base query builder class with shared utilities
 */
abstract class BaseQueryBuilder {
  protected queryParts: string[] = [];

  /**
   * Add owner/repo filters to the query
   */
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

  /**
   * Add date filters to the query
   */
  addDateFilters(
    params:
      | Record<string, unknown>
      | GitHubPullRequestsSearchParams
      | GitHubCommitSearchParams
  ): this {
    const dateFields: Record<string, string> = {
      created: 'created',
      updated: 'updated',
      pushed: 'pushed',
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

  /**
   * Add language filter
   */
  addLanguageFilter(language?: string | null | undefined): this {
    if (language && language !== null) {
      const mappedLanguage = mapLanguageToGitHub(language);
      this.queryParts.push(`language:${mappedLanguage}`);
    }
    return this;
  }

  /**
   * Add array-based filters
   */
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

  /**
   * Add boolean filters
   */
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

  /**
   * Add simple filters
   */
  addSimpleFilter(
    value: string | number | null | undefined,
    key: string
  ): this {
    if (value !== undefined && value !== null) {
      this.queryParts.push(`${key}:${value}`);
    }
    return this;
  }

  /**
   * Build the final query string
   */
  build(): string {
    return this.queryParts.join(' ').trim();
  }
}

/**
 * Code search query builder
 */
class CodeSearchQueryBuilder extends BaseQueryBuilder {
  addQueryTerms(params: GitHubCodeSearchQuery): this {
    if (Array.isArray(params.queryTerms) && params.queryTerms.length > 0) {
      // Filter out empty strings
      const nonEmptyTerms = params.queryTerms.filter(
        term => term && term.trim()
      );
      if (nonEmptyTerms.length > 0) {
        this.queryParts.push(...nonEmptyTerms);
      }
    }
    return this;
  }

  addSearchFilters(params: GitHubCodeSearchQuery): this {
    this.addLanguageFilter(params.language);
    this.addSimpleFilter(params.filename, 'filename');
    this.addSimpleFilter(params.extension, 'extension');
    this.addSimpleFilter(params.path, 'path');
    this.addSimpleFilter(params.stars, 'stars');
    this.addSimpleFilter(params.pushed, 'pushed');
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

/**
 * Repository search query builder
 */
class RepoSearchQueryBuilder extends BaseQueryBuilder {
  addQueryTerms(params: GitHubReposSearchQuery): this {
    if (Array.isArray(params.queryTerms) && params.queryTerms.length > 0) {
      this.queryParts.push(...params.queryTerms);
    }
    return this;
  }

  addRepoFilters(params: GitHubReposSearchQuery): this {
    this.addLanguageFilter(params.language);
    this.addArrayFilter(params.topic, 'topic');
    this.addSimpleFilter(params.stars, 'stars');
    this.addSimpleFilter(params.size, 'size');
    this.addSimpleFilter(params.created, 'created');

    if (params.updated) {
      this.queryParts.push(`pushed:${params.updated}`);
    }

    this.addArrayFilter(params.license, 'license');
    this.addSimpleFilter(params['good-first-issues'], 'good-first-issues');
    this.addSimpleFilter(params['help-wanted-issues'], 'help-wanted-issues');
    this.addSimpleFilter(params.followers, 'followers');
    this.addSimpleFilter(params['number-topics'], 'topics');
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
    this.queryParts.push('is:not-fork');
    return this;
  }
}

/**
 * Pull request search query builder
 */
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
    this.addBooleanFilter(params.locked, 'is:locked', '-is:locked');
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

  addReviewFilters(params: GitHubPullRequestsSearchParams): this {
    this.addSimpleFilter(params.review, 'review');
    if (params.checks) {
      this.queryParts.push(`status:${params.checks}`);
    }
    return this;
  }

  addOrganizationFilters(params: GitHubPullRequestsSearchParams): this {
    this.addArrayFilter(params.label, 'label', true);
    if (params.milestone) {
      this.queryParts.push(`milestone:"${params.milestone}"`);
    }
    if (params['team-mentions']) {
      this.queryParts.push(`team:${params['team-mentions']}`);
    }
    this.addSimpleFilter(params.project, 'project');
    this.addSimpleFilter(params.app, 'app');
    return this;
  }

  addNegativeFilters(params: GitHubPullRequestsSearchParams): this {
    if (params['no-assignee']) this.queryParts.push('no:assignee');
    if (params['no-label']) this.queryParts.push('no:label');
    if (params['no-milestone']) this.queryParts.push('no:milestone');
    if (params['no-project']) this.queryParts.push('no:project');
    return this;
  }

  addMiscFilters(params: GitHubPullRequestsSearchParams): this {
    this.addLanguageFilter(params.language);
    this.addArrayFilter(params.visibility, 'is');
    this.queryParts.push('archived:false');
    return this;
  }
}

/**
 * Commit search query builder
 */
class CommitSearchQueryBuilder extends BaseQueryBuilder {
  addQueryTerms(params: GitHubCommitSearchParams): this {
    if (params.exactQuery) {
      this.queryParts.push(`"${params.exactQuery}"`);
    } else if (params.queryTerms && params.queryTerms.length > 0) {
      this.queryParts.push(params.queryTerms.join(' '));
    } else if (params.orTerms && params.orTerms.length > 0) {
      this.queryParts.push(params.orTerms.join(' OR '));
    }
    return this;
  }

  addAuthorFilters(params: GitHubCommitSearchParams): this {
    this.addSimpleFilter(params.author, 'author');
    if (params['author-name']) {
      this.queryParts.push(`author-name:"${params['author-name']}"`);
    }
    this.addSimpleFilter(params['author-email'], 'author-email');
    return this;
  }

  addCommitterFilters(params: GitHubCommitSearchParams): this {
    this.addSimpleFilter(params.committer, 'committer');
    if (params['committer-name']) {
      this.queryParts.push(`committer-name:"${params['committer-name']}"`);
    }
    this.addSimpleFilter(params['committer-email'], 'committer-email');
    return this;
  }

  addHashFilters(params: GitHubCommitSearchParams): this {
    this.addSimpleFilter(params.hash, 'hash');
    this.addSimpleFilter(params.parent, 'parent');
    this.addSimpleFilter(params.tree, 'tree');
    return this;
  }

  addMiscFilters(params: GitHubCommitSearchParams): this {
    this.addBooleanFilter(params.merge, 'merge:true', 'merge:false');
    this.addSimpleFilter(params.visibility, 'is');
    return this;
  }
}

/**
 * Map common language identifiers to GitHub's search API language values
 */
function mapLanguageToGitHub(language: string): string {
  const languageMap: Record<string, string> = {
    // JavaScript family
    js: 'JavaScript',
    jsx: 'JavaScript',
    javascript: 'JavaScript',
    mjs: 'JavaScript',
    cjs: 'JavaScript',

    // TypeScript family
    ts: 'TypeScript',
    tsx: 'TypeScript',

    // Python family
    py: 'Python',
    py3: 'Python',

    // Java family
    java: 'Java',
    kt: 'Kotlin',
    scala: 'Scala',

    // C family
    c: 'C',
    cpp: 'C++',
    cc: 'C++',
    cxx: 'C++',
    cs: 'C#',

    // Web technologies
    html: 'HTML',
    css: 'CSS',
    scss: 'SCSS',
    sass: 'Sass',
    less: 'Less',

    // Other common languages
    go: 'Go',
    rs: 'Rust',
    rb: 'Ruby',
    php: 'PHP',
    swift: 'Swift',
    r: 'R',
    sql: 'SQL',
    sh: 'Shell',
    bash: 'Shell',
    zsh: 'Shell',
    fish: 'Shell',
    ps1: 'PowerShell',
    psm1: 'PowerShell',

    // Data formats
    json: 'JSON',
    xml: 'XML',
    yaml: 'YAML',
    yml: 'YAML',
    toml: 'TOML',
    ini: 'INI',

    // Documentation
    md: 'Markdown',
    rst: 'reStructuredText',

    // Configuration
    conf: 'Configuration',
    config: 'Configuration',
  };

  // Return mapped value or original if not found
  return languageMap[language.toLowerCase()] || language;
}

/**
 * Build search query string for GitHub API from parameters
 */
export function buildCodeSearchQuery(params: GitHubCodeSearchQuery): string {
  return new CodeSearchQueryBuilder()
    .addQueryTerms(params)
    .addOwnerRepo(params)
    .addSearchFilters(params)
    .addMatchFilters(params)
    .build();
}

/**
 * Build search query string for repository search
 */
export function buildRepoSearchQuery(params: GitHubReposSearchQuery): string {
  return new RepoSearchQueryBuilder()
    .addQueryTerms(params)
    .addOwnerRepo(params)
    .addRepoFilters(params)
    .addMatchFilters(params)
    .addQualityFilters()
    .build();
}

/**
 * Build pull request search query string for GitHub API
 * GitHub pull request search query building
 */
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

/**
 * Build commit search query string for GitHub API
 * GitHub commit search query building
 */
export function buildCommitSearchQuery(
  params: GitHubCommitSearchParams
): string {
  return new CommitSearchQueryBuilder()
    .addQueryTerms(params)
    .addOwnerRepo(params)
    .addAuthorFilters(params)
    .addCommitterFilters(params)
    .addDateFilters(params)
    .addHashFilters(params)
    .addMiscFilters(params)
    .build();
}

/**
 * Determine if we should use search API vs list API
 */
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
    params.review !== undefined ||
    params.checks !== undefined ||
    params.reactions !== undefined ||
    params.comments !== undefined ||
    params.interactions !== undefined ||
    params.milestone !== undefined ||
    params.project !== undefined ||
    params['team-mentions'] !== undefined ||
    params['no-assignee'] !== undefined ||
    params['no-label'] !== undefined ||
    params['no-milestone'] !== undefined ||
    params['no-project'] !== undefined ||
    params.language !== undefined ||
    params.visibility !== undefined ||
    // archived and fork parameters removed - always optimized to exclude archived repositories and forks for better quality
    params.app !== undefined ||
    params.created !== undefined ||
    params.updated !== undefined ||
    params['merged-at'] !== undefined ||
    params.closed !== undefined ||
    params.merged !== undefined ||
    params.locked !== undefined ||
    Array.isArray(params.owner) ||
    Array.isArray(params.repo)
  );
}
