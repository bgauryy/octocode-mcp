/**
 * Pagination hint generation utilities
 * Unified hint generation for both local and GitHub tools
 */

import type { PaginationInfo } from '../../types.js';
import type {
  PaginationMetadata,
  GeneratePaginationHintsOptions,
  GitHubFileContentHintContext,
  StructurePaginationInfo,
  StructurePaginationHintContext,
} from './types.js';

/**
 * Generate token usage hints based on estimated tokens
 */
function generateTokenWarnings(
  estimatedTokens: number,
  enableWarnings: boolean
): string[] {
  if (!enableWarnings) return [];

  const hints: string[] = [];

  if (estimatedTokens > 50000) {
    hints.push(
      '🚨 CRITICAL: Response TOO LARGE (>50K tokens) - will likely exceed model context limits',
      'ACTION REQUIRED: Use smaller charLength or refine query to reduce output size'
    );
  } else if (estimatedTokens > 30000) {
    hints.push(
      '⚠️ WARNING: High token usage (>30K tokens) - may approach context limits',
      'RECOMMENDATION: Consider reducing charLength or using more specific queries'
    );
  } else if (estimatedTokens > 15000) {
    hints.push(
      'ℹ️ NOTICE: Moderate token usage (>15K tokens) - monitor context window usage'
    );
  } else if (estimatedTokens > 5000) {
    hints.push(
      'ℹ️ Moderate usage: Response uses ~' +
        estimatedTokens.toLocaleString() +
        ' tokens'
    );
  } else {
    hints.push(
      '✓ Efficient query: Response uses ~' +
        estimatedTokens.toLocaleString() +
        ' tokens'
    );
  }

  return hints;
}

/**
 * Generate generic pagination navigation hints
 * Uses character offsets (for local tools that use JavaScript string operations)
 */
function generateNavigationHints(metadata: PaginationMetadata): string[] {
  const hints: string[] = [];

  if (metadata.hasMore && metadata.nextCharOffset !== undefined) {
    hints.push(
      '📄 More available: This is page ' +
        metadata.currentPage +
        ' of ' +
        metadata.totalPages,
      '▶ Next page: Use charOffset=' + metadata.nextCharOffset + ' to continue'
    );
  } else if (metadata.charOffset > 0 && !metadata.hasMore) {
    hints.push('✓ Final page: Reached end of content');
  }

  return hints;
}

/**
 * Generate pagination hints based on metadata (generic, for local tools)
 */
export function generatePaginationHints(
  metadata: PaginationMetadata,
  options: GeneratePaginationHintsOptions = {}
): string[] {
  const { enableWarnings = true, customHints = [] } = options;
  const hints: string[] = [];

  // Add custom hints first
  hints.push(...customHints);

  // Token usage warnings (if enabled)
  if (metadata.estimatedTokens) {
    hints.push(
      ...generateTokenWarnings(metadata.estimatedTokens, enableWarnings)
    );
  }

  // Pagination navigation hints
  hints.push(...generateNavigationHints(metadata));

  return hints;
}

/**
 * Generate hints for GitHub file content paginated responses
 * Uses byte offsets (for GitHub API compatibility)
 */
export function generateGitHubPaginationHints(
  pagination: PaginationInfo,
  query: GitHubFileContentHintContext
): string[] {
  if (!pagination.hasMore) {
    return [
      `✓ Complete content retrieved ` +
        `(${pagination.totalPages} page${pagination.totalPages > 1 ? 's' : ''})`,
    ];
  }

  // Use byte offsets for GitHub API compatibility
  const nextOffset =
    (pagination.byteOffset ?? 0) + (pagination.byteLength ?? 0);
  const branchParam = query.branch ? `, branch="${query.branch}"` : '';

  return [
    `📄 Page ${pagination.currentPage}/${pagination.totalPages} ` +
      `(${(pagination.byteLength ?? 0).toLocaleString()} of ` +
      `${(pagination.totalBytes ?? 0).toLocaleString()} bytes)`,
    ``,
    `▶ TO GET NEXT PAGE:`,
    `  Use: charOffset=${nextOffset}`,
    `  Same params: owner="${query.owner}", repo="${query.repo}", ` +
      `path="${query.path}"${branchParam}`,
    ``,
    `💡 TIP: Use matchString for targeted extraction instead of ` +
      `paginating through entire file`,
  ];
}

/**
 * Generate hints for repository structure pagination
 */
export function generateStructurePaginationHints(
  pagination: StructurePaginationInfo,
  context: StructurePaginationHintContext
): string[] {
  const hints: string[] = [];

  // Summary of current page
  hints.push(
    `📂 Page ${pagination.currentPage}/${pagination.totalPages} ` +
      `(${context.pageFiles} files, ${context.pageFolders} folders on this page)`
  );

  hints.push(
    `📊 Total: ${context.allFiles} files, ${context.allFolders} folders ` +
      `(${pagination.totalEntries} entries)`
  );

  if (pagination.hasMore) {
    const pathParam = context.path ? `path="${context.path}", ` : '';
    const depthParam =
      context.depth && context.depth > 1 ? `depth=${context.depth}, ` : '';

    hints.push('');
    hints.push(`▶ TO GET NEXT PAGE:`);
    hints.push(`  Use: entryPageNumber=${pagination.currentPage + 1}`);
    hints.push(
      `  Same params: owner="${context.owner}", repo="${context.repo}", ` +
        `branch="${context.branch}", ${pathParam}${depthParam}entriesPerPage=${pagination.entriesPerPage}`
    );
    hints.push('');
    hints.push(
      `💡 TIP: Use githubSearchCode with path filter for targeted discovery ` +
        `instead of paginating through entire structure`
    );
  } else {
    hints.push('');
    hints.push(
      `✓ Complete structure retrieved ` +
        `(${pagination.totalPages} page${pagination.totalPages > 1 ? 's' : ''})`
    );
  }

  return hints;
}
