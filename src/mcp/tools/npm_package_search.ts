import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { createSuccessResult, createErrorResult } from '../../utils/responses';
import { executeNpmCommand } from '../../utils/exec';
import {
  NpmSearchedPackageItem,
  NpmPackageSearchResultData,
  NpmPackageLinkInfo,
  NpmPackageUserInfo,
} from '../../types';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

const TOOL_NAME = 'npm_package_search';

const DESCRIPTION = `Discover packages by keywords using fuzzy matching. Use for finding alternatives, implementations, and ecosystem exploration.`;

const MAX_DESCRIPTION_LENGTH = 80;
const MAX_KEYWORDS = 8;

export function registerNpmSearchTool(server: McpServer) {
  server.registerTool(
    TOOL_NAME,
    {
      description: DESCRIPTION,
      inputSchema: {
        queries: z
          .union([z.string(), z.array(z.string())])
          .describe(
            'Keywords for fuzzy search. Examples: "react hooks", "build tools", "testing utilities". Space-separated only.'
          ),
        searchlimit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .default(15)
          .describe(
            'Max results per query. Default 15 for research focus. Max 50.'
          ),
      },
      annotations: {
        title: 'NPM Package Search',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args: {
      queries: string | string[];
      searchlimit?: number;
    }): Promise<CallToolResult> => {
      try {
        const searchQueries = Array.isArray(args.queries)
          ? args.queries
          : [args.queries];
        const searchLimit = args.searchlimit || 15;
        const allFoundPackages: NpmSearchedPackageItem[] = [];

        for (const query of searchQueries) {
          if (query.trim() === '') continue;

          const result = await executeNpmCommand(
            'search',
            [query, `--searchlimit=${searchLimit}`, '--json'],
            { cache: true }
          );

          if (!result.isError && result.content?.[0]?.text) {
            // Parse the response - it's wrapped in an object with a 'result' field
            const responseData = JSON.parse(result.content[0].text as string);
            const packages = parseNpmSearchOutput(responseData.result);
            allFoundPackages.push(...packages);
          } else if (result.isError) {
            return result;
          }
        }

        const deduplicatedPackages = deduplicatePackages(allFoundPackages);

        if (deduplicatedPackages.length > 0) {
          const searchResultData: NpmPackageSearchResultData = {
            search_terms: searchQueries.filter(q => q.trim() !== ''),
            total_found_for_terms: deduplicatedPackages.length,
            packages: deduplicatedPackages,
          };
          return createSuccessResult(searchResultData);
        }

        return createErrorResult(
          `No packages found | Try: different keywords, broader terms, or check spelling`
        );
      } catch (error) {
        return createErrorResult(
          'NPM search failed | Try: check internet connection, verify NPM installation, or use different keywords',
          error
        );
      }
    }
  );
}

function deduplicatePackages(
  packages: NpmSearchedPackageItem[]
): NpmSearchedPackageItem[] {
  const seen = new Set<string>();
  return packages.filter(pkg => {
    if (seen.has(pkg.name)) return false;
    seen.add(pkg.name);
    return true;
  });
}

function normalizePackage(rawPkg: any): NpmSearchedPackageItem {
  const description = rawPkg.description || null;
  const truncatedDescription =
    description && description.length > MAX_DESCRIPTION_LENGTH
      ? description.substring(0, MAX_DESCRIPTION_LENGTH) + '...'
      : description;

  const keywords = Array.isArray(rawPkg.keywords) ? rawPkg.keywords : [];
  const limitedKeywords = keywords.slice(0, MAX_KEYWORDS);

  const links: NpmPackageLinkInfo | null = rawPkg.links
    ? {
        npm: rawPkg.links.npm || null,
        homepage: rawPkg.links.homepage || null,
        repository: rawPkg.links.repository || null,
        bugs: rawPkg.links.bugs || null,
      }
    : null;

  const publisher: NpmPackageUserInfo | null = rawPkg.publisher
    ? {
        username: rawPkg.publisher.username,
        email: rawPkg.publisher.email || null,
      }
    : null;

  const maintainers: NpmPackageUserInfo[] | null = Array.isArray(
    rawPkg.maintainers
  )
    ? rawPkg.maintainers.map((m: any) => ({
        username: m.username,
        email: m.email || null,
      }))
    : null;

  return {
    name: rawPkg.name || 'N/A',
    version: rawPkg.version || 'N/A',
    description: truncatedDescription,
    keywords: limitedKeywords.length > 0 ? limitedKeywords : null,
    date: rawPkg.date || null,
    links: links,
    publisher: publisher,
    maintainers: maintainers,
    license: rawPkg.license || null,
  };
}

function parseNpmSearchOutput(output: string): NpmSearchedPackageItem[] {
  try {
    const rawPackages: any[] = JSON.parse(output);
    if (Array.isArray(rawPackages)) {
      return rawPackages.map(normalizePackage);
    }
    return [];
  } catch (e) {
    return [];
  }
}
