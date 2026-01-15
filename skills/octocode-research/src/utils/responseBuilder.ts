/**
 * Research-specific response builders for octocode-research skill.
 *
 * Provides high-level response helpers that wrap the MCP role-based response API
 * with research-specific patterns and formatting.
 */

import {
  createRoleBasedResult,
  QuickResult,
  StatusEmoji,
  ContentBuilder,
} from 'octocode-mcp/responses';

// CallToolResult type from MCP SDK (re-exported via octocode-mcp)
type CallToolResult = ReturnType<typeof createRoleBasedResult>;

/**
 * Pagination info for paginated responses
 */
interface PaginationInfo {
  page: number;
  total: number;
  hasMore: boolean;
  perPage?: number;
  totalItems?: number;
}

/**
 * File match info for search results
 */
interface FileMatch {
  path: string;
  matches?: number;
  line?: number;
  preview?: string;
  repo?: string;
}

/**
 * Research-specific response builders
 */
export const ResearchResponse = {
  /**
   * Search results with navigation hints
   *
   * @example
   * ```typescript
   * ResearchResponse.searchResults({
   *   files: [{ path: 'src/index.ts', matches: 5, line: 42 }],
   *   totalMatches: 15,
   *   pagination: { page: 1, total: 3, hasMore: true }
   * });
   * ```
   */
  searchResults(results: {
    files: FileMatch[];
    totalMatches: number;
    pagination?: PaginationInfo;
    searchPattern?: string;
  }): CallToolResult {
    const { files, totalMatches, pagination, searchPattern } = results;

    // Build summary
    const patternInfo = searchPattern ? ` for "${searchPattern}"` : '';
    const summary =
      files.length > 0
        ? `Found ${totalMatches} matches${patternInfo} in ${files.length} files:\n` +
          files
            .slice(0, 10)
            .map(
              f =>
                `- ${f.path}${f.line ? ` (line ${f.line})` : ''}${f.matches ? ` [${f.matches} matches]` : ''}`
            )
            .join('\n') +
          (files.length > 10 ? `\n... and ${files.length - 10} more files` : '')
        : `No matches found${patternInfo}`;

    // Build hints
    const hints: string[] = [
      'Use lineHint from results for LSP tools (lspGotoDefinition, lspFindReferences)',
    ];
    if (files.length > 10) {
      hints.push(`Showing 10 of ${files.length} files`);
    }
    if (pagination?.hasMore) {
      hints.push(`Next page: page=${pagination.page + 1}`);
    }

    // Return appropriate response type
    if (files.length === 0) {
      return QuickResult.empty(summary, [
        'Try broader search terms',
        'Check spelling and case sensitivity',
        'Remove path filters to widen search',
      ]);
    }

    if (pagination) {
      return QuickResult.paginated(summary, results, pagination, hints);
    }

    return QuickResult.success(summary, results, hints);
  },

  /**
   * File content with context
   *
   * @example
   * ```typescript
   * ResearchResponse.fileContent({
   *   path: 'src/utils.ts',
   *   content: 'export function helper() {...}',
   *   lines: { start: 10, end: 25 },
   *   language: 'typescript'
   * });
   * ```
   */
  fileContent(result: {
    path: string;
    content: string;
    lines?: { start: number; end: number };
    language?: string;
    totalLines?: number;
    isPartial?: boolean;
  }): CallToolResult {
    const { path, content, lines, language, totalLines, isPartial } = result;

    const lineInfo = lines ? ` (lines ${lines.start}-${lines.end})` : '';
    const lang = language || detectLanguage(path);

    // Format content with code fence
    const formattedContent = `📄 ${path}${lineInfo}\n\n\`\`\`${lang}\n${content}\n\`\`\``;

    const hints: string[] = ['Content retrieved successfully'];
    if (lines) {
      hints.push(`Showing lines ${lines.start}-${lines.end}`);
    }
    if (totalLines && isPartial) {
      hints.push(`File has ${totalLines} total lines`);
      hints.push('Use startLine/endLine for specific ranges');
    }

    return createRoleBasedResult({
      system: { hints },
      assistant: { summary: formattedContent, format: 'markdown' },
      user: { message: `Retrieved: ${path}`, emoji: StatusEmoji.file },
      data: result,
    });
  },

  /**
   * LSP definition/reference/call hierarchy results
   *
   * @example
   * ```typescript
   * ResearchResponse.lspResult({
   *   symbol: 'fetchData',
   *   locations: [{ uri: 'src/api.ts', line: 42, preview: 'export async function fetchData' }],
   *   type: 'definition'
   * });
   * ```
   */
  lspResult(result: {
    symbol: string;
    locations: Array<{ uri: string; line: number; preview?: string }>;
    type: 'definition' | 'references' | 'calls' | 'incoming' | 'outgoing';
  }): CallToolResult {
    const { symbol, locations, type } = result;

    const typeLabels: Record<string, string> = {
      definition: 'Definition',
      references: 'References',
      calls: 'Call sites',
      incoming: 'Incoming calls',
      outgoing: 'Outgoing calls',
    };
    const typeEmojis: Record<string, string> = {
      definition: StatusEmoji.definition,
      references: StatusEmoji.reference,
      calls: StatusEmoji.call,
      incoming: '📥',
      outgoing: '📤',
    };

    const typeLabel = typeLabels[type] || type;
    const typeEmoji = typeEmojis[type] || StatusEmoji.info;

    const summary =
      locations.length > 0
        ? `${typeLabel} for "${symbol}":\n` +
          locations
            .map(
              l =>
                `- ${l.uri}:${l.line}${l.preview ? `\n  ${l.preview}` : ''}`
            )
            .join('\n')
        : `No ${type} found for "${symbol}"`;

    const hints =
      locations.length > 0
        ? [
            'Use returned line numbers for further navigation',
            type === 'definition'
              ? 'Use lspFindReferences to find all usages'
              : null,
            type === 'references'
              ? 'Use lspCallHierarchy for call relationships'
              : null,
          ].filter(Boolean) as string[]
        : [
            'Symbol may be external or unindexed',
            'Try localSearchCode as fallback',
            'Check if file is in workspace',
          ];

    return createRoleBasedResult({
      system: { hints },
      assistant: { summary },
      user: {
        message: `${typeLabel}: ${locations.length} found`,
        emoji: locations.length > 0 ? typeEmoji : StatusEmoji.empty,
      },
      data: result,
    });
  },

  /**
   * Repository structure view
   *
   * @example
   * ```typescript
   * ResearchResponse.repoStructure({
   *   path: 'src/',
   *   structure: { files: ['index.ts'], folders: ['utils/', 'components/'] },
   *   depth: 2
   * });
   * ```
   */
  repoStructure(result: {
    path: string;
    structure: { files: string[]; folders: string[] };
    depth?: number;
    totalFiles?: number;
    totalFolders?: number;
    owner?: string;
    repo?: string;
  }): CallToolResult {
    const { path, structure, depth, totalFiles, totalFolders, owner, repo } =
      result;

    const repoInfo = owner && repo ? `${owner}/${repo}` : '';
    const pathInfo = path || '/';

    const fileList = structure.files.slice(0, 20);
    const folderList = structure.folders.slice(0, 20);

    const summary =
      `📁 ${repoInfo ? `${repoInfo}:` : ''}${pathInfo}\n\n` +
      (folderList.length > 0
        ? `Folders:\n${folderList.map(f => `  📁 ${f}`).join('\n')}\n\n`
        : '') +
      (fileList.length > 0
        ? `Files:\n${fileList.map(f => `  📄 ${f}`).join('\n')}`
        : 'No files in this directory');

    const hints: string[] = [];
    if (depth === 1) {
      hints.push('Use depth=2 to see nested contents');
    }
    if (structure.files.length > 20 || structure.folders.length > 20) {
      hints.push('Results truncated - use path filter to narrow scope');
    }
    hints.push('Use localSearchCode or githubSearchCode to find specific files');

    return createRoleBasedResult({
      system: {
        hints,
        pagination:
          totalFiles || totalFolders
            ? {
                currentPage: 1,
                totalPages: 1,
                hasMore: false,
                totalItems: (totalFiles || 0) + (totalFolders || 0),
              }
            : undefined,
      },
      assistant: { summary, format: 'markdown' },
      user: {
        message: `${structure.files.length} files, ${structure.folders.length} folders`,
        emoji: StatusEmoji.folder,
      },
      data: result,
    });
  },

  /**
   * Package search results
   *
   * @example
   * ```typescript
   * ResearchResponse.packageSearch({
   *   packages: [{ name: 'lodash', version: '4.17.21', description: '...' }],
   *   registry: 'npm'
   * });
   * ```
   */
  packageSearch(result: {
    packages: Array<{
      name: string;
      version?: string;
      description?: string;
      repository?: string;
    }>;
    registry: 'npm' | 'pypi';
    query?: string;
  }): CallToolResult {
    const { packages, registry, query } = result;

    const queryInfo = query ? ` for "${query}"` : '';
    const summary =
      packages.length > 0
        ? `Found ${packages.length} packages${queryInfo} on ${registry.toUpperCase()}:\n` +
          packages
            .slice(0, 10)
            .map(
              p =>
                `- ${p.name}${p.version ? `@${p.version}` : ''}\n  ${p.description || 'No description'}${p.repository ? `\n  ${p.repository}` : ''}`
            )
            .join('\n')
        : `No packages found${queryInfo} on ${registry.toUpperCase()}`;

    const hints =
      packages.length > 0
        ? [
            'Use repository URL with githubViewRepoStructure to explore source',
            'Use githubSearchCode to find usage examples',
          ]
        : ['Try different search terms', 'Check package name spelling'];

    if (packages.length === 0) {
      return QuickResult.empty(summary, hints);
    }

    return QuickResult.success(summary, result, hints);
  },

  /**
   * Pull request search results
   *
   * @example
   * ```typescript
   * ResearchResponse.pullRequests({
   *   prs: [{ number: 123, title: 'Fix bug', state: 'merged' }],
   *   repo: 'owner/repo'
   * });
   * ```
   */
  pullRequests(result: {
    prs: Array<{
      number: number;
      title: string;
      state: string;
      author?: string;
      url?: string;
    }>;
    repo?: string;
    pagination?: PaginationInfo;
  }): CallToolResult {
    const { prs, repo, pagination } = result;

    const repoInfo = repo ? ` in ${repo}` : '';
    const summary =
      prs.length > 0
        ? `Found ${prs.length} pull requests${repoInfo}:\n` +
          prs
            .slice(0, 10)
            .map(
              pr =>
                `- #${pr.number}: ${pr.title} [${pr.state}]${pr.author ? ` by @${pr.author}` : ''}`
            )
            .join('\n')
        : `No pull requests found${repoInfo}`;

    const hints =
      prs.length > 0
        ? [
            'Use prNumber with type="fullContent" to see full diff',
            'Use type="partialContent" with file filter for specific changes',
          ]
        : ['Try broader date range', 'Check repository name'];

    if (prs.length === 0) {
      return QuickResult.empty(summary, hints);
    }

    if (pagination) {
      return QuickResult.paginated(summary, result, pagination, hints);
    }

    return QuickResult.success(summary, result, hints);
  },

  /**
   * Generic bulk operation result
   *
   * @example
   * ```typescript
   * ResearchResponse.bulkResult({
   *   results: [{ status: 'success', data: {...} }, { status: 'error', error: '...' }],
   *   operation: 'search'
   * });
   * ```
   */
  bulkResult(result: {
    results: Array<{ status: string; data?: unknown; error?: string }>;
    operation: string;
    totalQueries: number;
  }): CallToolResult {
    const { results, operation, totalQueries } = result;

    const successful = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'error').length;
    const empty = results.filter(r => r.status === 'empty').length;

    const summary =
      `Bulk ${operation} completed:\n` +
      `- ✅ Success: ${successful}/${totalQueries}\n` +
      (empty > 0 ? `- 📭 Empty: ${empty}/${totalQueries}\n` : '') +
      (failed > 0 ? `- ❌ Failed: ${failed}/${totalQueries}` : '');

    const hints: string[] = [];
    if (failed > 0) {
      hints.push('Check individual error messages for failed queries');
    }
    if (empty > 0) {
      hints.push('Empty results may indicate no matches or invalid parameters');
    }

    const emoji =
      failed === 0
        ? StatusEmoji.success
        : failed === totalQueries
          ? StatusEmoji.error
          : StatusEmoji.partial;

    return createRoleBasedResult({
      system: { hints },
      assistant: { summary },
      user: {
        message: `${successful}/${totalQueries} queries succeeded`,
        emoji,
      },
      data: result,
      isError: failed === totalQueries,
    });
  },
};

/**
 * Detect language from file extension
 */
function detectLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    yml: 'yaml',
    yaml: 'yaml',
    json: 'json',
    md: 'markdown',
    sql: 'sql',
    html: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
  };
  return langMap[ext] || '';
}

// Re-export utilities for convenience
export { QuickResult, StatusEmoji, ContentBuilder, createRoleBasedResult };
