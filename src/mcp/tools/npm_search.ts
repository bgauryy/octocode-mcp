import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_DESCRIPTIONS, TOOL_NAMES, SEARCH_TYPES } from '../systemPrompts';
import { npmSearch } from '../../impl/npm/npmSearch';
import {
  detectOrganizationalQuery,
  createSmartError,
  createStandardResponse,
} from '../../impl/util';

interface NpmPkgMeta {
  name: string;
  version: string;
  description: string | null;
  date: string | null;
  keywords: string[];
  links: {
    homepage: string | null;
    repository: string | null;
    bugs: string | null;
    npm: string | null;
    [key: string]: string | null | undefined;
  };
}

// Helper to ensure unique packages by name (type-safe)
function dedupePackages(pkgs: NpmPkgMeta[]): NpmPkgMeta[] {
  const seen = new Set<string>();
  return pkgs.filter(pkg => {
    if (seen.has(pkg.name)) return false;
    seen.add(pkg.name);
    return true;
  });
}

export function registerNpmSearchTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.NPM_SEARCH_PACKAGES,
    TOOL_DESCRIPTIONS[TOOL_NAMES.NPM_SEARCH_PACKAGES],
    {
      queries: z
        .union([z.string(), z.array(z.string())])
        .describe(
          "One or more search terms or package names. Accepts a string or array of strings. Supports partial/prefix search (e.g., 'react-'). Results are always deduped and returned as a minimal, consistent package metadata list."
        ),
      searchlimit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(20)
        .describe(
          'Maximum number of search results to return per query (default: 20, max: 50 for LLM optimization).'
        ),
      json: z
        .boolean()
        .optional()
        .default(true)
        .describe('Output search results in JSON format. Defaults to true.'),
    },
    {
      title: 'Search NPM Packages (multi & partial support)',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: {
      queries: string | string[];
      searchlimit?: number;
      json?: boolean;
    }) => {
      try {
        // Normalize queries to array
        const terms = Array.isArray(args.queries)
          ? args.queries
          : [args.queries];

        // Check for organizational patterns
        const orgQueries = terms.map(term => ({
          term,
          orgInfo: detectOrganizationalQuery(term),
        }));

        const allResults: any[] = [];
        const errorMessages: string[] = [];

        // For each term, perform npm search
        for (const { term } of orgQueries) {
          try {
            const result = await npmSearch({
              query: term,
              searchlimit: args.searchlimit,
              json: true,
            });
            if (result.content && result.content[0]) {
              const responseText = result.content[0].text as string;
              let parsed;
              try {
                parsed = JSON.parse(responseText);
              } catch {
                errorMessages.push(`Parse failed: ${term}`);
                continue;
              }

              const pkgArray: any[] = Array.isArray(parsed)
                ? parsed
                : Array.isArray(parsed.results)
                  ? parsed.results
                  : Array.isArray(parsed.objects)
                    ? parsed.objects
                    : [];

              if (pkgArray.length > 0) {
                allResults.push(...pkgArray);
              }
            }
          } catch (err) {
            errorMessages.push(`Search failed: ${term}`);
          }
        }

        // Dedupe by package name
        const deduped = dedupePackages(allResults as NpmPkgMeta[]);
        const simplifiedResults = deduped.map(pkg => ({
          name: pkg.name,
          version: pkg.version,
          description: pkg.description,
          date: (pkg as any).date || (pkg as any).published || null,
          keywords: pkg.keywords || [],
          links: {
            homepage: pkg.links?.homepage || null,
            repository: pkg.links?.repository || null,
            bugs: pkg.links?.bugs || null,
            npm: pkg.links?.npm || `https://www.npmjs.com/package/${pkg.name}`,
          },
        }));

        if (simplifiedResults.length > 0) {
          return createStandardResponse({
            searchType: SEARCH_TYPES.NPM_PACKAGES,
            query: Array.isArray(args.queries)
              ? args.queries.join(', ')
              : args.queries,
            data: { results: simplifiedResults },
          });
        }

        // Check if any org queries need special handling
        const orgNeedsAccess = orgQueries.some(q => q.orgInfo.needsOrgAccess);
        if (orgNeedsAccess) {
          return createSmartError(
            TOOL_NAMES.NPM_SEARCH_PACKAGES,
            'NPM search',
            'Private package not found',
            terms[0]
          );
        }

        return createSmartError(
          TOOL_NAMES.NPM_SEARCH_PACKAGES,
          'NPM search',
          'No packages found',
          terms[0]
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        return createSmartError(
          TOOL_NAMES.NPM_SEARCH_PACKAGES,
          'NPM search',
          errorMessage,
          Array.isArray(args.queries) ? args.queries[0] : args.queries
        );
      }
    }
  );
}
