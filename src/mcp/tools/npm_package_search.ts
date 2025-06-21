import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { createResult } from '../../utils/responses';
import { executeNpmCommand } from '../../utils/exec';
import { NpmPackage } from '../../types';

const TOOL_NAME = 'npm_package_search';

const DESCRIPTION = `Search npm packages by keywords using fuzzy matching. 

IMPORTANT LIMITATIONS:
 NO BOOLEAN OPERATORS: NPM search does NOT support AND/OR/NOT - use space-separated keywords for broader search
 FUZZY MATCHING ONLY: No exact phrase matching - searches are approximate keyword matching
 KEYWORD-BASED: Best results with simple, space-separated terms like "react hooks" or "cli typescript"

Required when package name is unknown. If you have the exact package name, use npm_view_package directly. This reduces the need to use GitHub search when packages are found.`;

const MAX_DESCRIPTION_LENGTH = 100;
const MAX_KEYWORDS = 10;

export function registerNpmSearchTool(server: McpServer) {
  server.tool(
    TOOL_NAME,
    DESCRIPTION,
    {
      queries: z
        .union([z.string(), z.array(z.string())])
        .describe(
          'Package names or keywords to search for. NOTE: No boolean operators (AND/OR/NOT) supported - use simple space-separated keywords like "react hooks" or "typescript cli" for fuzzy matching.'
        ),
      searchlimit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(20)
        .describe('Max results per query (default: 20, max: 50)'),
    },
    {
      title: TOOL_NAME,
      description: DESCRIPTION,
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: { queries: string | string[]; searchlimit?: number }) => {
      try {
        const queries = Array.isArray(args.queries)
          ? args.queries
          : [args.queries];
        const searchLimit = args.searchlimit || 20;
        const allPackages: NpmPackage[] = [];

        // Search for each query term
        for (const query of queries) {
          const result = await executeNpmCommand(
            'search',
            [query, `--searchlimit=${searchLimit}`, '--json'],
            { cache: true }
          );

          if (!result.isError && result.content?.[0]?.text) {
            const packages = parseNpmSearchOutput(
              result.content[0].text as string
            );
            allPackages.push(...packages);
          }
        }

        const deduplicatedPackages = deduplicatePackages(allPackages);

        if (deduplicatedPackages.length > 0) {
          return createResult({
            query: Array.isArray(args.queries)
              ? args.queries.join(', ')
              : args.queries,
            total: deduplicatedPackages.length,
            results: deduplicatedPackages,
          });
        }

        return createResult('No packages found', true);
      } catch (error) {
        return createResult(
          'NPM package search failed - check search terms or try different keywords',
          true
        );
      }
    }
  );
}

function deduplicatePackages(packages: NpmPackage[]): NpmPackage[] {
  const seen = new Set<string>();
  return packages.filter(pkg => {
    if (seen.has(pkg.name)) return false;
    seen.add(pkg.name);
    return true;
  });
}

function normalizePackage(pkg: {
  name?: string;
  version?: string;
  description?: string;
  keywords?: string[];
  links?: { repository?: string };
  repository?: { url?: string };
}): NpmPackage {
  const description = pkg.description || null;
  const truncatedDescription =
    description && description.length > MAX_DESCRIPTION_LENGTH
      ? description.substring(0, MAX_DESCRIPTION_LENGTH) + '...'
      : description;

  const keywords = pkg.keywords || [];
  const limitedKeywords = keywords.slice(0, MAX_KEYWORDS);

  return {
    name: pkg.name || '',
    version: pkg.version || '',
    description: truncatedDescription,
    keywords: limitedKeywords,
    repository: pkg.links?.repository || pkg.repository?.url || null,
  };
}

function parseNpmSearchOutput(output: string): NpmPackage[] {
  try {
    const wrapper = JSON.parse(output);
    const commandResult =
      typeof wrapper.result === 'string'
        ? JSON.parse(wrapper.result)
        : wrapper.result;

    let packages: Array<{
      name?: string;
      version?: string;
      description?: string;
      keywords?: string[];
      links?: { repository?: string };
      repository?: { url?: string };
    }> = [];

    // Handle different npm search output formats
    if (Array.isArray(commandResult)) {
      packages = commandResult;
    } else if (commandResult?.objects && Array.isArray(commandResult.objects)) {
      packages = commandResult.objects.map(
        (obj: {
          package?: {
            name?: string;
            version?: string;
            description?: string;
            keywords?: string[];
            links?: { repository?: string };
            repository?: { url?: string };
          };
          [key: string]: unknown;
        }) => obj.package || obj
      );
    } else if (commandResult?.results && Array.isArray(commandResult.results)) {
      packages = commandResult.results;
    }

    return packages.map(normalizePackage);
  } catch {
    return [];
  }
}
