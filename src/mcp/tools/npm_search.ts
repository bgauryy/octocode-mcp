import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_NAMES } from '../contstants';
import { npmSearch } from '../../impl/npm/npmSearch';
import { TOOL_DESCRIPTIONS } from '../systemPrompts/tools';

// Analyze NPM search patterns and suggest fallbacks
function analyzeNpmSearchPattern(args: {
  query: string;
  searchlimit?: number;
}): {
  patternType: string;
  suggestions: string[];
  fallbackStrategy: string[];
  organizationalHints: string[];
} {
  const suggestions: string[] = [];
  const fallbackStrategy: string[] = [];
  const organizationalHints: string[] = [];
  let patternType = 'basic';

  const query = args.query.toLowerCase();

  // Detect organizational packages
  if (
    query.includes('@') ||
    query.includes('internal') ||
    query.includes('private')
  ) {
    patternType = 'organizational';
    organizationalHints.push(
      'ORGANIZATIONAL PACKAGE DETECTED: Consider checking GitHub organizations first'
    );
    fallbackStrategy.push(
      `Use ${TOOL_NAMES.GITHUB_GET_USER_ORGS} to discover private package access`
    );
  }

  // Complex search patterns
  if (query.split(' ').length > 2) {
    patternType = 'complex-multi-term';
    suggestions.push(
      'PROVEN: Complex phrases often yield zero results - try single terms'
    );
    fallbackStrategy.push('Break down into primary term → secondary filters');
  }

  // Technology-specific patterns
  if (
    query.includes('react') ||
    query.includes('vue') ||
    query.includes('angular')
  ) {
    patternType = 'framework-specific';
    suggestions.push(
      'FRAMEWORK DETECTED: Consider ecosystem-specific searches'
    );
    fallbackStrategy.push(
      `Use ${TOOL_NAMES.GITHUB_SEARCH_TOPICS} for framework ecosystem discovery`
    );
  }

  // Generic fallback strategy for all patterns
  fallbackStrategy.push(
    `1. ${TOOL_NAMES.GITHUB_SEARCH_TOPICS} - Search ecosystem terms`,
    `2. ${TOOL_NAMES.GITHUB_SEARCH_REPOS} - Find repositories that might be packages`,
    `3. ${TOOL_NAMES.GITHUB_SEARCH_CODE} - Search package.json files`,
    `4. ${TOOL_NAMES.GITHUB_SEARCH_COMMITS} - Search package development history`,
    `5. ${TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS} - Search package mentions in PRs`,
    `6. ${TOOL_NAMES.GITHUB_SEARCH_ISSUES} - Search package discussions`
  );

  return { patternType, suggestions, fallbackStrategy, organizationalHints };
}

export function registerNpmSearchTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.NPM_SEARCH_PACKAGES,
    TOOL_DESCRIPTIONS[TOOL_NAMES.NPM_SEARCH_PACKAGES],
    {
      query: z
        .string()
        .describe(
          "The search term(s) to find packages on NPM. Multiple terms can be space-separated (e.g., 'react query client'). Supports regex if term starts with /."
        ),
      searchlimit: z
        .number()
        .optional()
        .default(50)
        .describe(
          'Maximum number of search results to return. Defaults to 50.'
        ),
      json: z
        .boolean()
        .optional()
        .default(true)
        .describe('Output search results in JSON format. Defaults to true.'),
    },
    {
      title: 'Search NPM Packages',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: { query: string; searchlimit?: number; json?: boolean }) => {
      try {
        // Analyze search pattern for insights and fallbacks
        const patternAnalysis = analyzeNpmSearchPattern(args);

        const result = await npmSearch(args);

        // Check if we got poor results and enhance with fallback suggestions
        if (result.content && result.content[0]) {
          let responseText = result.content[0].text as string;

          // Parse result to check quality
          let resultCount = 0;
          try {
            const parsed = JSON.parse(responseText);
            if (parsed.results && Array.isArray(parsed.results)) {
              resultCount = parsed.results.length;
            }
          } catch {
            // If not JSON, try to estimate from text
            const lines = responseText.split('\n').filter(line => line.trim());
            resultCount = Math.max(0, lines.length - 5); // Rough estimate
          }

          // Add organizational hints if detected
          if (patternAnalysis.organizationalHints.length > 0) {
            responseText += `\n\n🏢 ORGANIZATIONAL PACKAGE INSIGHTS:`;
            patternAnalysis.organizationalHints.forEach(hint => {
              responseText += `\n• ${hint}`;
            });
          }

          // Add pattern-specific suggestions
          if (patternAnalysis.suggestions.length > 0) {
            responseText += `\n\n💡 SEARCH PATTERN INSIGHTS (${patternAnalysis.patternType.toUpperCase()}):`;
            patternAnalysis.suggestions.forEach(suggestion => {
              responseText += `\n• ${suggestion}`;
            });
          }

          // Add fallback strategy if results are poor (< 5 results or specific patterns)
          if (resultCount < 5 || patternAnalysis.patternType !== 'basic') {
            responseText += `\n\n🔄 NPM SEARCH FALLBACK STRATEGY:`;
            responseText += `\nIf NPM search yields insufficient results, try this validated workflow:`;
            patternAnalysis.fallbackStrategy.forEach((step, index) => {
              responseText += `\n${index + 1}. ${step}`;
            });
          }

          // Add general best practices
          responseText += `\n\n📋 NPM SEARCH BEST PRACTICES:`;
          responseText += `\n• Single terms work best: "react", "auth", "cli"`;
          responseText += `\n• Combined terms: "react-hooks", "typescript-cli"`;
          responseText += `\n• Avoid complex phrases: Break "react auth jwt library" → "react" + "auth"`;
          responseText += `\n• Organizational packages: @company/ triggers private search workflow`;
          responseText += `\n• 0 results → broader terms, 1-20 IDEAL, 100+ → more specific`;

          return {
            content: [
              {
                type: 'text',
                text: responseText,
              },
            ],
            isError: false,
          };
        }

        return result;
      } catch (error) {
        // Enhanced error handling with fallback suggestions
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        const fallbackSuggestions = `
🔄 NPM SEARCH FALLBACK WORKFLOW:
When NPM registry search fails, try this proven sequence:

1. ${TOOL_NAMES.GITHUB_SEARCH_TOPICS} - Discover ecosystem terminology
   • Use broader terms: "authentication" instead of "jwt-auth-library"
   • Find related technologies and packages

2. ${TOOL_NAMES.GITHUB_SEARCH_REPOS} - Find package repositories
   • Search for repositories that might contain packages
   • Look for package.json indicators

3. ${TOOL_NAMES.GITHUB_SEARCH_CODE} - Search package manifests
   • Query: "package.json" + your terms
   • Find actual package definitions

4. ${TOOL_NAMES.GITHUB_SEARCH_COMMITS} - Development history
   • Search commit messages for package development
   • Find package creation/updates

5. ${TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS} - Package discussions
   • Find PRs mentioning package development
   • Discover package features and issues

6. ${TOOL_NAMES.GITHUB_SEARCH_ISSUES} - Community discussions
   • Find issues discussing packages
   • Discover alternatives and recommendations

💡 PROVEN STRATEGIES:
• Try simpler terms if complex search fails
• Check organizational access for @company/ packages  
• Use GitHub ecosystem discovery when NPM fails`;

        return {
          content: [
            {
              type: 'text',
              text: `NPM Search Failed: ${errorMessage}${fallbackSuggestions}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
