import { GitHubCodeSearchQuery } from '../../mcp/tools/scheme/github_search_code';
import { GitHubReposSearchQuery } from '../../mcp/tools/scheme/github_search_repos';
import {
  GitHubPullRequestsSearchParams,
  GitHubIssuesSearchParams,
  GitHubCommitSearchParams,
} from '../../types/github-openapi';

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
 * Automatically apply quality boosting parameters for better search relevance
 * This function enhances search queries with quality filters when qualityBoost is enabled
 */
export function applyQualityBoost(
  params: GitHubCodeSearchQuery
): GitHubCodeSearchQuery {
  // If quality boost is disabled, return params as-is
  if (params.qualityBoost === false) {
    return params;
  }

  const enhancedParams = { ...params };

  // Apply default quality filters if not explicitly set
  if (!enhancedParams.stars && !enhancedParams.owner && !enhancedParams.repo) {
    // For broad searches, require at least some popularity
    enhancedParams.stars = '>10';
  }

  if (!enhancedParams.pushed && !enhancedParams.owner && !enhancedParams.repo) {
    // For broad searches, require recent activity
    enhancedParams.pushed = '>2022-01-01';
  }

  // Ensure we're using best-match sorting for relevance
  if (!enhancedParams.sort) {
    enhancedParams.sort = 'best-match';
  }

  return enhancedParams;
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
  const queryParts: string[] = [];

  // Add main search terms
  if (params.queryTerms && params.queryTerms.length > 0) {
    queryParts.push(...params.queryTerms);
  }

  // GitHub API allows searches with just filters, so we don't require queryTerms
  // If no queryTerms provided, we can still search with filters like language:, repo:, etc.

  // Add filters as qualifiers
  if (params.language) {
    const mappedLanguage = mapLanguageToGitHub(params.language);
    queryParts.push(`language:${mappedLanguage}`);
  }

  // Repository filters - prioritize specific repo, then owner
  if (params.owner && params.repo) {
    const owner = Array.isArray(params.owner) ? params.owner[0] : params.owner;
    const repo = Array.isArray(params.repo) ? params.repo[0] : params.repo;
    queryParts.push(`repo:${owner}/${repo}`);
  } else if (params.owner) {
    // For owner parameter, intelligently detect user vs organization
    const owners = Array.isArray(params.owner) ? params.owner : [params.owner];
    owners.forEach(owner => {
      queryParts.push(getOwnerQualifier(owner));
    });
  }

  if (params.filename) {
    queryParts.push(`filename:${params.filename}`);
  }

  if (params.extension) {
    queryParts.push(`extension:${params.extension}`);
  }

  if (params.path) {
    queryParts.push(`path:${params.path}`);
  }

  if (params.size) {
    queryParts.push(`size:${params.size}`);
  }

  // NEW: Repository quality filters for better relevance
  if (params.stars) {
    queryParts.push(`stars:${params.stars}`);
  }

  if (params.pushed) {
    queryParts.push(`pushed:${params.pushed}`);
  }

  if (params.created) {
    queryParts.push(`created:${params.created}`);
  }

  // Always exclude forks and archived repositories for better quality results
  queryParts.push('is:not-fork');
  queryParts.push('is:not-archived');

  if (params.match) {
    const matches = Array.isArray(params.match) ? params.match : [params.match];
    matches.forEach(match => {
      if (match === 'file') {
        queryParts.push('in:file');
      } else if (match === 'path') {
        queryParts.push('in:path');
      }
    });
  }

  return queryParts.join(' ');
}

/**
 * Build search query string for repository search
 */
export function buildRepoSearchQuery(params: GitHubReposSearchQuery): string {
  const queryParts: string[] = [];

  // Add queryTerms for specific text matching in repository names and descriptions
  // This is used for targeted searches like "todo app", "authentication", etc.
  if (params.queryTerms && params.queryTerms.length > 0) {
    queryParts.push(...params.queryTerms);
  }

  // Add filters as qualifiers
  if (params.language) {
    const mappedLanguage = mapLanguageToGitHub(params.language);
    queryParts.push(`language:${mappedLanguage}`);
  }

  if (params.owner) {
    const owners = Array.isArray(params.owner) ? params.owner : [params.owner];
    owners.forEach(owner => queryParts.push(getOwnerQualifier(owner)));
  }

  // Add topics for exploratory discovery by technology/framework/domain
  // This is used for broad technology searches like "react", "typescript", "machine-learning"
  if (params.topic) {
    const topics = Array.isArray(params.topic) ? params.topic : [params.topic];
    topics.forEach(topic => queryParts.push(`topic:${topic}`));
  }

  if (params.stars) {
    queryParts.push(`stars:${params.stars}`);
  }

  if (params.size) {
    queryParts.push(`size:${params.size}`);
  }

  if (params.created) {
    queryParts.push(`created:${params.created}`);
  }

  if (params.updated) {
    queryParts.push(`pushed:${params.updated}`);
  }

  // Always exclude archived repositories and forks for better quality results
  queryParts.push('is:not-archived');
  queryParts.push('is:not-fork');

  if (params.license) {
    const licenses = Array.isArray(params.license)
      ? params.license
      : [params.license];
    licenses.forEach(license => queryParts.push(`license:${license}`));
  }

  if (params['good-first-issues']) {
    queryParts.push(`good-first-issues:${params['good-first-issues']}`);
  }

  if (params['help-wanted-issues']) {
    queryParts.push(`help-wanted-issues:${params['help-wanted-issues']}`);
  }

  if (params.followers) {
    queryParts.push(`followers:${params.followers}`);
  }

  if (params['number-topics']) {
    queryParts.push(`topics:${params['number-topics']}`);
  }

  if (params.match) {
    const matches = Array.isArray(params.match) ? params.match : [params.match];
    matches.forEach(match => {
      if (match === 'name') {
        queryParts.push('in:name');
      } else if (match === 'description') {
        queryParts.push('in:description');
      } else if (match === 'readme') {
        queryParts.push('in:readme');
      }
    });
  }

  return queryParts.join(' ');
}

/**
 * Build pull request search query string for GitHub API
 * GitHub pull request search query building
 */
export function buildPullRequestSearchQuery(
  params: GitHubPullRequestsSearchParams
): string {
  const queryParts: string[] = [];

  // Add main query if provided (keywords)
  if (params.query && params.query.trim()) {
    queryParts.push(params.query.trim());
  }

  // Always add is:pr to ensure we only get pull requests
  queryParts.push('is:pr');

  // Repository filters - handle arrays properly
  if (params.owner && params.repo) {
    const owners = Array.isArray(params.owner) ? params.owner : [params.owner];
    const repos = Array.isArray(params.repo) ? params.repo : [params.repo];

    // Create repo combinations
    owners.forEach(owner => {
      repos.forEach(repo => {
        queryParts.push(`repo:${owner}/${repo}`);
      });
    });
  } else if (params.owner) {
    const owners = Array.isArray(params.owner) ? params.owner : [params.owner];
    owners.forEach(owner => {
      queryParts.push(getOwnerQualifier(owner));
    });
  }

  // State filters
  if (params.state) {
    queryParts.push(`is:${params.state}`);
  }
  if (params.draft !== undefined) {
    queryParts.push(params.draft ? 'is:draft' : '-is:draft');
  }
  if (params.merged !== undefined) {
    queryParts.push(params.merged ? 'is:merged' : 'is:unmerged');
  }
  if (params.locked !== undefined) {
    queryParts.push(params.locked ? 'is:locked' : '-is:locked');
  }

  // User involvement filters
  if (params.author) {
    queryParts.push(`author:${params.author}`);
  }
  if (params.assignee) {
    queryParts.push(`assignee:${params.assignee}`);
  }
  if (params.mentions) {
    queryParts.push(`mentions:${params.mentions}`);
  }
  if (params.commenter) {
    queryParts.push(`commenter:${params.commenter}`);
  }
  if (params.involves) {
    queryParts.push(`involves:${params.involves}`);
  }
  if (params['reviewed-by']) {
    queryParts.push(`reviewed-by:${params['reviewed-by']}`);
  }
  if (params['review-requested']) {
    queryParts.push(`review-requested:${params['review-requested']}`);
  }

  // Branch filters
  if (params.head) {
    queryParts.push(`head:${params.head}`);
  }
  if (params.base) {
    queryParts.push(`base:${params.base}`);
  }

  // Date filters
  if (params.created) {
    queryParts.push(`created:${params.created}`);
  }
  if (params.updated) {
    queryParts.push(`updated:${params.updated}`);
  }
  if (params['merged-at']) {
    queryParts.push(`merged:${params['merged-at']}`);
  }
  if (params.closed) {
    queryParts.push(`closed:${params.closed}`);
  }

  // Engagement filters
  if (params.comments !== undefined) {
    queryParts.push(`comments:${params.comments}`);
  }
  if (params.reactions !== undefined) {
    queryParts.push(`reactions:${params.reactions}`);
  }
  if (params.interactions !== undefined) {
    queryParts.push(`interactions:${params.interactions}`);
  }

  // Review and CI filters
  if (params.review) {
    queryParts.push(`review:${params.review}`);
  }
  if (params.checks) {
    queryParts.push(`status:${params.checks}`);
  }

  // Label filters (handle arrays)
  if (params.label) {
    const labels = Array.isArray(params.label) ? params.label : [params.label];
    labels.forEach(label => {
      queryParts.push(`label:"${label}"`);
    });
  }

  // Organization filters
  if (params.milestone) {
    queryParts.push(`milestone:"${params.milestone}"`);
  }
  if (params['team-mentions']) {
    queryParts.push(`team:${params['team-mentions']}`);
  }
  if (params.project) {
    queryParts.push(`project:${params.project}`);
  }
  if (params.app) {
    queryParts.push(`app:${params.app}`);
  }

  // Boolean "missing" filters
  if (params['no-assignee']) {
    queryParts.push('no:assignee');
  }
  if (params['no-label']) {
    queryParts.push('no:label');
  }
  if (params['no-milestone']) {
    queryParts.push('no:milestone');
  }
  if (params['no-project']) {
    queryParts.push('no:project');
  }

  // Language filter
  if (params.language) {
    queryParts.push(`language:${params.language}`);
  }

  // Visibility filter (handle arrays)
  if (params.visibility) {
    const visibilities = Array.isArray(params.visibility)
      ? params.visibility
      : [params.visibility];
    visibilities.forEach(vis => {
      queryParts.push(`is:${vis}`);
    });
  }

  // Always exclude archived repositories and forks for better quality results
  queryParts.push('archived:false');

  return queryParts.join(' ').trim();
}

/**
 * Build issue search query string for GitHub API
 */
export function buildIssueSearchQuery(
  params: GitHubIssuesSearchParams
): string {
  const queryParts: string[] = [];

  // Add main query
  if (params.query && params.query.trim()) {
    queryParts.push(params.query.trim());
  }

  // Always add is:issue unless including PRs
  if (!params['include-prs']) {
    queryParts.push('is:issue');
  }

  // Repository filters
  if (params.owner && params.repo) {
    const owners = Array.isArray(params.owner) ? params.owner : [params.owner];
    owners.forEach(owner => {
      queryParts.push(`repo:${owner}/${params.repo}`);
    });
  } else if (params.owner) {
    const owners = Array.isArray(params.owner) ? params.owner : [params.owner];
    owners.forEach(owner => {
      queryParts.push(getOwnerQualifier(owner));
    });
  }

  // State filters
  if (params.state) {
    queryParts.push(`is:${params.state}`);
  }
  if (params.locked !== undefined) {
    queryParts.push(params.locked ? 'is:locked' : '-is:locked');
  }

  // User involvement filters
  if (params.author) {
    queryParts.push(`author:${params.author}`);
  }
  if (params.assignee) {
    queryParts.push(`assignee:${params.assignee}`);
  }
  if (params.mentions) {
    queryParts.push(`mentions:${params.mentions}`);
  }
  if (params.commenter) {
    queryParts.push(`commenter:${params.commenter}`);
  }
  if (params.involves) {
    queryParts.push(`involves:${params.involves}`);
  }

  // Date filters
  if (params.created) {
    queryParts.push(`created:${params.created}`);
  }
  if (params.updated) {
    queryParts.push(`updated:${params.updated}`);
  }
  if (params.closed) {
    queryParts.push(`closed:${params.closed}`);
  }

  // Engagement filters
  if (params.comments !== undefined) {
    queryParts.push(`comments:${params.comments}`);
  }
  if (params.reactions !== undefined) {
    queryParts.push(`reactions:${params.reactions}`);
  }
  if (params.interactions !== undefined) {
    queryParts.push(`interactions:${params.interactions}`);
  }

  // Label filters
  if (params.label) {
    const labels = Array.isArray(params.label) ? params.label : [params.label];
    labels.forEach(label => {
      queryParts.push(`label:"${label}"`);
    });
  }

  // Organization filters
  if (params.milestone) {
    queryParts.push(`milestone:"${params.milestone}"`);
  }
  if (params['team-mentions']) {
    queryParts.push(`team:${params['team-mentions']}`);
  }

  // Boolean "missing" filters
  if (params['no-assignee']) {
    queryParts.push('no:assignee');
  }
  if (params['no-label']) {
    queryParts.push('no:label');
  }
  if (params['no-milestone']) {
    queryParts.push('no:milestone');
  }
  if (params['no-project']) {
    queryParts.push('no:project');
  }

  // Language filter
  if (params.language) {
    queryParts.push(`language:${params.language}`);
  }

  // Visibility filter
  if (params.visibility) {
    queryParts.push(`is:${params.visibility}`);
  }

  // App filter
  if (params.app) {
    queryParts.push(`app:${params.app}`);
  }

  // Always exclude archived repositories for better quality results
  queryParts.push('-is:archived');

  return queryParts.join(' ').trim();
}

/**
 * Build commit search query string for GitHub API
 * GitHub commit search query building
 */
export function buildCommitSearchQuery(
  params: GitHubCommitSearchParams
): string {
  const queryParts: string[] = [];

  // Handle different query types
  if (params.exactQuery) {
    // Exact phrase search
    queryParts.push(`"${params.exactQuery}"`);
  } else if (params.queryTerms && params.queryTerms.length > 0) {
    // AND logic - terms are space separated (GitHub default)
    queryParts.push(params.queryTerms.join(' '));
  } else if (params.orTerms && params.orTerms.length > 0) {
    // OR logic - explicit OR operator
    queryParts.push(params.orTerms.join(' OR '));
  }

  // Repository filters
  if (params.owner && params.repo) {
    queryParts.push(`repo:${params.owner}/${params.repo}`);
  } else if (params.owner) {
    queryParts.push(getOwnerQualifier(params.owner));
  }

  // Author filters
  if (params.author) {
    queryParts.push(`author:${params.author}`);
  }
  if (params['author-name']) {
    queryParts.push(`author-name:"${params['author-name']}"`);
  }
  if (params['author-email']) {
    queryParts.push(`author-email:${params['author-email']}`);
  }

  // Committer filters
  if (params.committer) {
    queryParts.push(`committer:${params.committer}`);
  }
  if (params['committer-name']) {
    queryParts.push(`committer-name:"${params['committer-name']}"`);
  }
  if (params['committer-email']) {
    queryParts.push(`committer-email:${params['committer-email']}`);
  }

  // Date filters
  if (params['author-date']) {
    queryParts.push(`author-date:${params['author-date']}`);
  }
  if (params['committer-date']) {
    queryParts.push(`committer-date:${params['committer-date']}`);
  }

  // Hash filters
  if (params.hash) {
    queryParts.push(`hash:${params.hash}`);
  }
  if (params.parent) {
    queryParts.push(`parent:${params.parent}`);
  }
  if (params.tree) {
    queryParts.push(`tree:${params.tree}`);
  }

  // Merge filter
  if (params.merge === true) {
    queryParts.push('merge:true');
  } else if (params.merge === false) {
    queryParts.push('merge:false');
  }

  // Visibility filter
  if (params.visibility) {
    queryParts.push(`is:${params.visibility}`);
  }

  return queryParts.join(' ').trim();
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
