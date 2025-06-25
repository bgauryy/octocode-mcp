import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { createResult } from '../../utils/responses';
import { executeNpmCommand } from '../../utils/exec';
import { NpmPackage } from '../../types';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

const TOOL_NAME = 'npm_package_search';

const DESCRIPTION = `Search npm packages by keywords using fuzzy matching. Use space-separated keywords like "react hooks" or "cli typescript". No boolean operators supported.`;

const MAX_DESCRIPTION_LENGTH = 100;
const MAX_KEYWORDS = 10;

export function registerNpmSearchTool(server: McpServer) {
  server.registerTool(
    TOOL_NAME,
    {
      description: DESCRIPTION,
      inputSchema: {
        queries: z
          .union([z.string(), z.array(z.string())])
          .describe(
            'Package names or keywords to search for. Use simple space-separated keywords like "react hooks" or "typescript cli" for fuzzy matching.'
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
            data: {
              total_count: deduplicatedPackages.length,
              results: deduplicatedPackages,
            },
          });
        }

        return createResult({
          error: 'No packages found',
        });
      } catch (error) {
        return createResult({
          error:
            'Package search failed - check terms or try different keywords',
        });
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
    const commandResult = wrapper.result;

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
