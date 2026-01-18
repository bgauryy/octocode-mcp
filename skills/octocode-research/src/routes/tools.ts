/**
 * Tools Info Routes - Expose tool metadata via HTTP
 *
 * Routes:
 *   GET  /tools/list            - List all tools (concise)
 *   GET  /tools/info            - List all tools with details
 *   GET  /tools/info/:toolName  - Get specific tool info
 *   POST /tools/call/:toolName  - Execute a tool directly (simplified!)
 *
 * Query params:
 *   schema=true  - Include schema information
 *   hints=true   - Include hints information
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { getMcpContent } from '../mcpCache.js';
import { transformToJsonSchema } from '../types/mcp.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodTypeAny } from 'zod';

// Import Zod schemas from octocode-mcp (source of truth)
import {
  GitHubCodeSearchQuerySchema,
  GitHubViewRepoStructureQuerySchema,
  GitHubReposSearchSingleQuerySchema,
  GitHubPullRequestSearchQuerySchema,
  FileContentQuerySchema,
  RipgrepQuerySchema,
  FetchContentQuerySchema,
  FindFilesQuerySchema,
  ViewStructureQuerySchema,
  LSPGotoDefinitionQuerySchema,
  LSPFindReferencesQuerySchema,
  LSPCallHierarchyQuerySchema,
  PackageSearchQuerySchema,
} from 'octocode-mcp/public';
import {
  githubSearchCode,
  githubGetFileContent,
  githubViewRepoStructure,
  githubSearchRepositories,
  githubSearchPullRequests,
  packageSearch,
  localSearchCode,
  localGetFileContent,
  localFindFiles,
  localViewStructure,
  lspGotoDefinition,
  lspFindReferences,
  lspCallHierarchy,
  logToolCall,
} from '../index.js';
import {
  withGitHubResilience,
  withLocalResilience,
  withLspResilience,
  withPackageResilience,
} from '../utils/resilience.js';
import { parseToolResponse, parseToolResponseBulk } from '../utils/responseParser.js';

export const toolsRoutes = Router();

// Package version for response metadata
const PACKAGE_VERSION = '2.0.0';

interface ToolsInfoQuery {
  schema?: string;
  hints?: string;
}

// ============================================================================
// Zod Schema Registry - Maps tool names to their Zod schemas (source of truth)
// ============================================================================

const TOOL_ZOD_SCHEMAS: Record<string, ZodTypeAny> = {
  // GitHub tools
  githubSearchCode: GitHubCodeSearchQuerySchema,
  githubGetFileContent: FileContentQuerySchema,
  githubViewRepoStructure: GitHubViewRepoStructureQuerySchema,
  githubSearchRepositories: GitHubReposSearchSingleQuerySchema,
  githubSearchPullRequests: GitHubPullRequestSearchQuerySchema,
  // Local tools
  localSearchCode: RipgrepQuerySchema,
  localGetFileContent: FetchContentQuerySchema,
  localFindFiles: FindFilesQuerySchema,
  localViewStructure: ViewStructureQuerySchema,
  // LSP tools
  lspGotoDefinition: LSPGotoDefinitionQuerySchema,
  lspFindReferences: LSPFindReferencesQuerySchema,
  lspCallHierarchy: LSPCallHierarchyQuerySchema,
  // Package tools
  packageSearch: PackageSearchQuerySchema,
};

/**
 * Get JSON Schema for a tool from its Zod schema
 * Returns proper JSON Schema with correct types, required fields, and validations
 */
function getToolJsonSchema(toolName: string): Record<string, unknown> | null {
  const zodSchema = TOOL_ZOD_SCHEMAS[toolName];
  if (!zodSchema) return null;

  try {
    // Convert Zod schema to JSON Schema
    const jsonSchema = zodToJsonSchema(zodSchema, {
      name: toolName,
      $refStrategy: 'none', // Inline all references
    });
    return jsonSchema as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * GET /tools/list - Static list of all tools (concise discovery)
 *
 * Returns static JSON with tool names and short descriptions.
 * Use /tools/info/:toolName to get full description + schema BEFORE calling a tool.
 */
toolsRoutes.get('/list', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      tools: [
        { name: 'githubSearchCode', description: 'Search code in GitHub repos' },
        { name: 'githubGetFileContent', description: 'Read file from GitHub repo' },
        { name: 'githubViewRepoStructure', description: 'View GitHub repo tree' },
        { name: 'githubSearchRepositories', description: 'Search GitHub repositories' },
        { name: 'githubSearchPullRequests', description: 'Search pull requests' },
        { name: 'packageSearch', description: 'Search npm/PyPI packages' },
        { name: 'localSearchCode', description: 'Search local code with ripgrep' },
        { name: 'localGetFileContent', description: 'Read local file content' },
        { name: 'localFindFiles', description: 'Find files by pattern/metadata' },
        { name: 'localViewStructure', description: 'View local directory tree' },
        { name: 'lspGotoDefinition', description: 'Go to symbol definition' },
        { name: 'lspFindReferences', description: 'Find all symbol references' },
        { name: 'lspCallHierarchy', description: 'Get call hierarchy' },
      ],
    },
    hints: ['GET /tools/info/{name} for full schema before calling'],
  });
});

/**
 * GET /tools/info - Get info about all available tools
 */
toolsRoutes.get('/info', async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const content = getMcpContent();
    
    const query = req.query as ToolsInfoQuery;
    const includeSchema = query.schema === 'true';
    const includeHints = query.hints === 'true';
    
    const toolNames = Object.keys(content.tools);
    const tools = toolNames.map(name => {
      const tool = content.tools[name];
      const result: Record<string, unknown> = {
        name: tool.name,
        description: tool.description,
      };
      
      if (includeSchema) {
        result.schema = tool.schema;
      }
      
      if (includeHints) {
        result.hints = {
          hasResults: tool.hints.hasResults,
          empty: tool.hints.empty,
        };
      }
      
      return result;
    });
    
    const response: Record<string, unknown> = {
      totalTools: toolNames.length,
      toolNames,
      tools,
    };

    if (includeHints) {
      response.baseHints = content.baseHints;
      response.genericErrorHints = content.genericErrorHints;
    }

    res.json({
      success: true,
      data: response,
      hints: ['Use /tools/info/:{{TOOL_NAME}} to get the scheme and description before using it'],
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /tools/info/:toolName - Get full info for a specific tool (call before using!)
 *
 * Returns complete description, JSON schema, and hints for a tool.
 * ALWAYS call this before using a tool to understand its parameters.
 *
 * @example
 * GET /tools/info/localSearchCode
 *
 * Response includes:
 * - name: Tool name
 * - description: Full description with usage details
 * - schema: Complete JSON schema with all parameters
 * - hints: Success/empty result hints
 */
toolsRoutes.get('/info/:toolName', async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const content = getMcpContent();

    const { toolName } = req.params;
    const query = req.query as ToolsInfoQuery;
    const includeSchema = query.schema !== 'false';  // Default true for specific tool
    const includeHints = query.hints !== 'false';    // Default true for specific tool

    const tool = content.tools[toolName];

    if (!tool) {
      const availableTools = Object.keys(content.tools);
      res.status(404).json({
        success: false,
        data: null,
        hints: [
          `Tool not found: ${toolName}`,
          `Available tools: ${availableTools.slice(0, 5).join(', ')}...`,
          'Check spelling or use /tools/list to see all tools',
        ],
      });
      return;
    }

    const result: Record<string, unknown> = {
      name: tool.name,
      description: tool.description,
    };

    if (includeSchema) {
      // Try to get the actual Zod schema (source of truth with correct types and required fields)
      const zodJsonSchema = getToolJsonSchema(toolName);
      if (zodJsonSchema) {
        result.inputSchema = zodJsonSchema;
        result._schemaSource = 'zod'; // Indicates this is from the authoritative Zod schema
      } else {
        // Fallback to metadata-based schema (less accurate)
        result.inputSchema = transformToJsonSchema(tool.schema, tool.name);
        result._schemaSource = 'metadata'; // Indicates this is a fallback
      }
    }

    if (includeHints) {
      result.toolHints = {
        hasResults: tool.hints.hasResults,
        empty: tool.hints.empty,
      };
    }

    res.json({
      success: true,
      data: result,
      hints: ['Review schema carefully before calling this tool'],
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /tools/metadata - Get raw complete metadata (advanced)
 */
toolsRoutes.get('/metadata', async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const content = getMcpContent();

    res.json({
      success: true,
      data: {
        instructions: content.instructions,
        toolCount: Object.keys(content.tools).length,
        promptCount: Object.keys(content.prompts).length,
        hasBaseSchema: !!content.baseSchema,
      },
      hints: ['Use /tools/info for detailed tool information'],
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /tools/system - Get the FULL system instructions
 *
 * Returns the complete system prompt that should be loaded into context FIRST.
 * This defines the agent's behavior, methodology, and best practices.
 *
 * @example
 * GET /tools/system
 *
 * Response:
 * {
 *   "instructions": "## Expert Code Forensics Agent...",
 *   "_meta": { "charCount": 5432, "version": "2.0.0" }
 * }
 */
toolsRoutes.get('/system', async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const content = getMcpContent();

    res.json({
      success: true,
      data: {
        instructions: content.instructions,
        charCount: content.instructions.length,
        version: PACKAGE_VERSION,
      },
      hints: ['Load this system prompt FIRST before using tools'],
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Tool Registry - Maps tool names to functions and resilience wrappers
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
type ToolFn = (params: { queries: any[] }) => Promise<any>;
type ResilienceFn = <T>(fn: () => Promise<T>, toolName: string) => Promise<T>;

interface ToolEntry {
  fn: ToolFn;
  resilience: ResilienceFn;
  category: 'github' | 'local' | 'lsp' | 'package';
}

const TOOL_REGISTRY: Record<string, ToolEntry> = {
  // GitHub tools
  githubSearchCode: { fn: githubSearchCode as ToolFn, resilience: withGitHubResilience, category: 'github' },
  githubGetFileContent: { fn: githubGetFileContent as ToolFn, resilience: withGitHubResilience, category: 'github' },
  githubViewRepoStructure: { fn: githubViewRepoStructure as ToolFn, resilience: withGitHubResilience, category: 'github' },
  githubSearchRepositories: { fn: githubSearchRepositories as ToolFn, resilience: withGitHubResilience, category: 'github' },
  githubSearchPullRequests: { fn: githubSearchPullRequests as ToolFn, resilience: withGitHubResilience, category: 'github' },

  // Local tools
  localSearchCode: { fn: localSearchCode as ToolFn, resilience: withLocalResilience, category: 'local' },
  localGetFileContent: { fn: localGetFileContent as ToolFn, resilience: withLocalResilience, category: 'local' },
  localFindFiles: { fn: localFindFiles as ToolFn, resilience: withLocalResilience, category: 'local' },
  localViewStructure: { fn: localViewStructure as ToolFn, resilience: withLocalResilience, category: 'local' },

  // LSP tools
  lspGotoDefinition: { fn: lspGotoDefinition as ToolFn, resilience: withLspResilience, category: 'lsp' },
  lspFindReferences: { fn: lspFindReferences as ToolFn, resilience: withLspResilience, category: 'lsp' },
  lspCallHierarchy: { fn: lspCallHierarchy as ToolFn, resilience: withLspResilience, category: 'lsp' },

  // Package tools
  packageSearch: { fn: packageSearch as ToolFn, resilience: withPackageResilience, category: 'package' },
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Extract repository identifiers from query parameters for session logging
 */
function extractReposFromQueries(queries: unknown[]): string[] {
  const repos: string[] = [];
  for (const query of queries) {
    const q = query as Record<string, unknown>;
    // GitHub repos: owner/repo format
    if (q.owner && q.repo) {
      repos.push(`${q.owner}/${q.repo}`);
    }
    // Local paths
    if (q.path && typeof q.path === 'string') {
      repos.push(q.path);
    }
    // LSP uris
    if (q.uri && typeof q.uri === 'string') {
      repos.push(q.uri);
    }
  }
  return [...new Set(repos)]; // Deduplicate
}

/**
 * Extract research parameters from the first query for logging
 */
function extractResearchParams(queries: unknown[]): {
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
} {
  if (queries.length === 0) return {};
  const q = queries[0] as Record<string, unknown>;
  return {
    mainResearchGoal: q.mainResearchGoal as string | undefined,
    researchGoal: q.researchGoal as string | undefined,
    reasoning: q.reasoning as string | undefined,
  };
}

/**
 * POST /tools/call/:toolName - Execute a tool directly with JSON body
 *
 * This is the SIMPLIFIED way to call tools. Instead of URL-encoded query params,
 * just POST a JSON body with your queries array.
 *
 * @example
 * POST /tools/call/localSearchCode
 * Content-Type: application/json
 *
 * {
 *   "queries": [{
 *     "mainResearchGoal": "Find authentication handlers",
 *     "researchGoal": "Locate auth middleware",
 *     "reasoning": "Understanding auth flow",
 *     "pattern": "authenticate",
 *     "path": "/Users/me/project",
 *     "type": "ts"
 *   }]
 * }
 *
 * Response:
 * {
 *   "tool": "localSearchCode",
 *   "success": true,
 *   "data": { ... parsed tool response ... },
 *   "hints": ["Use lineHint for LSP tools", ...]
 * }
 */
toolsRoutes.post('/call/:toolName', async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { toolName } = req.params;
    const body = req.body as { queries?: unknown[] };

    // Validate tool exists
    const toolEntry = TOOL_REGISTRY[toolName];
    if (!toolEntry) {
      const availableTools = Object.keys(TOOL_REGISTRY);
      res.status(404).json({
        tool: toolName,
        success: false,
        data: null,
        hints: [
          `Tool not found: ${toolName}`,
          `Available tools: ${availableTools.join(', ')}`,
          'Check spelling or use GET /tools/list',
        ],
      });
      return;
    }

    // Validate queries array
    if (!body.queries || !Array.isArray(body.queries) || body.queries.length === 0) {
      res.status(400).json({
        tool: toolName,
        success: false,
        data: null,
        hints: [
          'Missing or invalid queries array',
          'Body must contain: { "queries": [{ ... }] }',
          `Use GET /tools/info/${toolName} for schema`,
        ],
      });
      return;
    }

    // Validate query limit (1-3)
    if (body.queries.length > 3) {
      res.status(400).json({
        tool: toolName,
        success: false,
        data: null,
        hints: [
          'Too many queries (max 3)',
          'Split into multiple requests for better performance',
        ],
      });
      return;
    }

    // Execute tool with resilience
    const rawResult = await toolEntry.resilience(
      () => toolEntry.fn({ queries: body.queries! }),
      toolName
    );

    // Log tool call for session telemetry
    const repos = extractReposFromQueries(body.queries!);
    const researchParams = extractResearchParams(body.queries!);
    logToolCall(
      toolName,
      repos,
      researchParams.mainResearchGoal,
      researchParams.researchGoal,
      researchParams.reasoning
    ).catch(() => {}); // Fire and forget

    const mcpResponse = rawResult as { content: Array<{ type: string; text: string }> };

    // For multiple queries, return bulk response format
    if (body.queries.length > 1) {
      const bulkParsed = parseToolResponseBulk(mcpResponse);

      res.status(bulkParsed.isError ? 500 : 200).json({
        tool: toolName,
        bulk: true,
        success: !bulkParsed.isError,
        instructions: bulkParsed.instructions,
        results: bulkParsed.results,
        hints: bulkParsed.hints,
        counts: bulkParsed.counts,
      });
      return;
    }

    // Single query - use existing response format for backward compatibility
    const parsed = parseToolResponse(mcpResponse);

    res.status(parsed.isError ? 500 : 200).json({
      tool: toolName,
      success: !parsed.isError,
      data: parsed.data,
      hints: parsed.hints,
      research: parsed.research,
    });
  } catch (error) {
    next(error);
  }
});
