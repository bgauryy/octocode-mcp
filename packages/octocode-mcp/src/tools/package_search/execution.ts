import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { PackageSearchQuery } from './scheme.js';
import {
  searchPackage,
  checkNpmDeprecation,
} from '../../utils/package/common.js';
import type {
  PackageSearchAPIResult,
  PackageSearchError,
  PackageResult,
  DeprecationInfo,
} from '../../utils/package/common.js';
import { executeBulkOperation } from '../../utils/response/bulk.js';
import {
  handleCatchError,
  createSuccessResult,
  createErrorResult,
} from '../utils.js';
import { TOOL_NAMES } from '../toolMetadata.js';

function isPackageSearchError(
  result: PackageSearchAPIResult | PackageSearchError
): result is PackageSearchError {
  return 'error' in result;
}

function getPackageName(pkg: PackageResult): string {
  if ('path' in pkg) {
    return pkg.path;
  }
  return pkg.name;
}

function getPackageRepo(pkg: PackageResult): string | null {
  if ('repoUrl' in pkg) {
    return pkg.repoUrl;
  }
  return pkg.repository;
}

function parseRepoInfo(repoUrl: string | null | undefined): {
  owner?: string;
  repo?: string;
} {
  if (!repoUrl || !repoUrl.includes('github.com')) return {};
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (match && match[1] && match[2]) {
    const owner = match[1];
    const repoName = match[2];
    const cleanRepo = repoName.replace(/\.git$/, '').replace(/\/$/, '');
    return { owner, repo: cleanRepo };
  }
  return {};
}

export async function searchPackages(
  queries: PackageSearchQuery[]
): Promise<CallToolResult> {
  return executeBulkOperation(
    queries,
    async (query: PackageSearchQuery, _index: number) => {
      try {
        const apiResult = await searchPackage(query);

        if (isPackageSearchError(apiResult)) {
          return createErrorResult(apiResult.error, query);
        }

        const packages = (apiResult.packages as PackageResult[]).map(pkg => {
          const repoUrl = getPackageRepo(pkg);
          const { owner, repo } = parseRepoInfo(repoUrl);
          if (owner && repo) {
            return { ...pkg, owner, repo };
          }
          return pkg;
        });

        const result = {
          packages,
          totalFound: apiResult.totalFound,
        };

        const hasContent = result.packages.length > 0;

        let deprecationInfo: DeprecationInfo | null = null;
        if (hasContent && query.ecosystem === 'npm' && result.packages[0]) {
          deprecationInfo = await checkNpmDeprecation(
            getPackageName(result.packages[0])
          );
        }

        // Generate context-specific hints for package search
        const extraHints = hasContent
          ? generateSuccessHints(result, query.ecosystem, deprecationInfo)
          : generateEmptyHints(query);

        // Use unified pattern with extraHints for package-specific guidance
        return createSuccessResult(
          query,
          result,
          hasContent,
          TOOL_NAMES.PACKAGE_SEARCH,
          { extraHints }
        );
      } catch (error) {
        return handleCatchError(error, query);
      }
    },
    {
      toolName: TOOL_NAMES.PACKAGE_SEARCH,
      keysPriority: ['packages', 'totalFound', 'error'],
    }
  );
}

function generateSuccessHints(
  result: {
    packages: PackageResult[];
  },
  ecosystem: 'npm' | 'python',
  deprecationInfo?: DeprecationInfo | null
): string[] {
  const hints: string[] = [];
  const pkg = result.packages[0];
  if (!pkg) return hints;

  const name = getPackageName(pkg);
  const repo = getPackageRepo(pkg);

  if (deprecationInfo?.deprecated) {
    const msg = deprecationInfo.message || 'This package is deprecated';
    hints.push(`DEPRECATED: ${name} - ${msg}`);
  }

  if (repo?.includes('github.com')) {
    const match = repo.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (match && match[1] && match[2]) {
      const owner = match[1];
      const repoName = match[2];
      const cleanRepo = repoName.replace(/\.git$/, '').replace(/\/$/, '');
      hints.push(
        `Explore: githubViewRepoStructure(owner="${owner}", repo="${cleanRepo}")`
      );
    }
  }

  hints.push(
    ecosystem === 'npm'
      ? `Install: npm install ${name}`
      : `Install: pip install ${name}`
  );

  return hints;
}

function generateEmptyHints(query: PackageSearchQuery): string[] {
  const hints: string[] = [];
  const name = query.name;

  hints.push(`No ${query.ecosystem} packages found for '${name}'`);

  const variations = generateNameVariations(name, query.ecosystem);
  if (variations.length > 0) {
    hints.push(`Try: ${variations.join(', ')}`);
  }

  const browseUrl =
    query.ecosystem === 'npm'
      ? `https://npmjs.com/search?q=${encodeURIComponent(name)}`
      : `https://pypi.org/search/?q=${encodeURIComponent(name)}`;
  hints.push(`Browse: ${browseUrl}`);

  return hints;
}

function generateNameVariations(
  name: string,
  ecosystem: 'npm' | 'python'
): string[] {
  const variations: string[] = [];

  if (name.includes('-')) {
    variations.push(name.replace(/-/g, '_'));
    variations.push(name.replace(/-/g, ''));
  }
  if (name.includes('_')) {
    variations.push(name.replace(/_/g, '-'));
  }

  if (name.startsWith('@')) {
    const unscoped = name.split('/').pop();
    if (unscoped) variations.push(unscoped);
  }

  if (ecosystem === 'npm' && !name.endsWith('js')) {
    variations.push(name + 'js');
  }
  if (ecosystem === 'python' && !name.startsWith('py')) {
    variations.push('py' + name);
  }

  return [...new Set(variations)].filter(v => v !== name).slice(0, 3);
}
