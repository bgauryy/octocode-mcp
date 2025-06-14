import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_NAMES } from '../contstants';
import { npmSearch } from '../../impl/npm/npmSearch';
import { TOOL_DESCRIPTIONS } from '../systemPrompts/tools';

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
        .optional()
        .default(50)
        .describe(
          'Maximum number of search results to return per query. Defaults to 50.'
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
        const allResults: any[] = [];
        let hadError = false;
        const errorMessages: string[] = [];

        // For each term, perform npm search (supporting prefix/partial)
        for (const term of terms) {
          // If the term ends with '-' treat it as an explicit prefix search.
          // Removing the length < 4 heuristic to avoid overly broad queries like 'vue'.
          const isPrefix = term.endsWith('-');
          const searchTerm = isPrefix ? term : term;
          try {
            const result = await npmSearch({
              query: searchTerm,
              searchlimit: args.searchlimit,
              json: true,
            });
            if (result.content && result.content[0]) {
              const responseText = result.content[0].text as string;
              let parsed;
              try {
                parsed = JSON.parse(responseText);
              } catch {
                hadError = true;
                errorMessages.push(
                  `Failed to parse NPM search results for '${term}'`
                );
                continue;
              }
              // Robustly extract package array (supports different shapes)
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
            hadError = true;
            errorMessages.push(
              `NPM search failed for '${term}': ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }

        // Dedupe by package name
        const deduped = dedupePackages(allResults as NpmPkgMeta[]);
        // Map to minimal output
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
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ results: simplifiedResults }, null, 2),
              },
            ],
            isError: false,
          };
        }

        // If no results, fallback message
        let fallbackMsg = 'No results found.';
        if (hadError) fallbackMsg += ` Errors: ${errorMessages.join('; ')}`;
        fallbackMsg +=
          '\nFALLBACK: Use GitHub search tools (topics, repos, code, issues, PRs) for further discovery.';
        return {
          content: [{ type: 'text', text: fallbackMsg }],
          isError: true,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: `NPM Search Failed: ${errorMessage}\nFALLBACK: Use GitHub search tools (topics, repos, code, issues, PRs).`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
