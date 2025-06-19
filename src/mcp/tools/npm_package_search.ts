import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_DESCRIPTIONS, TOOL_NAMES } from '../systemPrompts';
import {
  createResult,
  getNoResultsSuggestions,
  getErrorSuggestions,
} from '../../utils/responses';
import { executeNpmCommand } from '../../utils/exec';
import { NpmPackage } from '../../types';

const MAX_DESCRIPTION_LENGTH = 100;
const MAX_KEYWORDS = 10;

export function registerNpmSearchTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.NPM_PACKAGE_SEARCH,
    TOOL_DESCRIPTIONS[TOOL_NAMES.NPM_PACKAGE_SEARCH],
    {
      queries: z
        .union([z.string(), z.array(z.string())])
        .describe('Package names or keywords to search for'),
      searchlimit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(20)
        .describe('Max results per query (default: 20)'),
    },
    {
      title: 'Search NPM Packages by Name/Keyword',
      description: TOOL_DESCRIPTIONS[TOOL_NAMES.NPM_PACKAGE_SEARCH],
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

        const suggestions = getNoResultsSuggestions(
          TOOL_NAMES.NPM_PACKAGE_SEARCH
        );
        return createResult('No packages found', true, suggestions);
      } catch (error) {
        const suggestions = getErrorSuggestions(TOOL_NAMES.NPM_PACKAGE_SEARCH);
        return createResult(
          `Search failed: ${(error as Error).message}`,
          true,
          suggestions
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

function normalizePackage(pkg: any): NpmPackage {
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

    let packages: any[] = [];

    // Handle different npm search output formats
    if (Array.isArray(commandResult)) {
      packages = commandResult;
    } else if (commandResult?.objects && Array.isArray(commandResult.objects)) {
      packages = commandResult.objects.map((obj: any) => obj.package || obj);
    } else if (commandResult?.results && Array.isArray(commandResult.results)) {
      packages = commandResult.results;
    }

    return packages.map(normalizePackage);
  } catch {
    return [];
  }
}
