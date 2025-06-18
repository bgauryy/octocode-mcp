import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_DESCRIPTIONS, TOOL_NAMES } from '../systemPrompts';
import { npmSearch } from '../../impl/npm/npmSearch';
import { createResult, parseJsonResponse } from '../../impl/util';

// Simplified interface
interface NpmPkg {
  name: string;
  version: string;
  description: string | null;
  keywords: string[];
  repository: string | null;
  links?: {
    repository?: string;
  };
}

function dedupePackages(pkgs: NpmPkg[]): NpmPkg[] {
  const seen = new Set<string>();
  return pkgs.filter(pkg => {
    if (seen.has(pkg.name)) return false;
    seen.add(pkg.name);
    return true;
  });
}

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
        const terms = Array.isArray(args.queries)
          ? args.queries
          : [args.queries];
        const allResults: any[] = [];

        // Process each search term
        for (const term of terms) {
          try {
            const result = await npmSearch({
              query: term,
              searchlimit: args.searchlimit,
              json: true,
            });
            if (result.content?.[0] && !result.isError) {
              const { data } = parseJsonResponse(
                result.content[0].text as string
              );
              const pkgArray = Array.isArray(data)
                ? data
                : Array.isArray(data?.results)
                  ? data.results
                  : Array.isArray(data?.objects)
                    ? data.objects
                    : [];
              if (pkgArray.length > 0) allResults.push(...pkgArray);
            }
          } catch {
            continue; // Skip failed searches
          }
        }

        // Simplified result processing
        const deduped = dedupePackages(allResults);
        const simplified = deduped.map(pkg => ({
          name: pkg.name,
          version: pkg.version,
          description: pkg.description,
          keywords: pkg.keywords || [],
          repository: pkg.links?.repository || null,
        }));

        if (simplified.length > 0) {
          return createResult({
            q: Array.isArray(args.queries)
              ? args.queries.join(', ')
              : args.queries,
            results: simplified,
          });
        }

        return createResult('No packages found', true);
      } catch (error) {
        return createResult(`Search failed: ${(error as Error).message}`, true);
      }
    }
  );
}
