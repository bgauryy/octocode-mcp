/**
 * Tools Info Routes - Expose tool metadata via HTTP
 * 
 * Routes:
 *   GET /tools/info           - List all tools
 *   GET /tools/info/:toolName - Get specific tool info
 * 
 * Query params:
 *   schema=true  - Include schema information
 *   hints=true   - Include hints information
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { loadToolContent, initialize } from 'octocode-mcp/public';
import { QuickResult } from '../utils/responseBuilder.js';
import { transformToJsonSchema, type ListToolsResponse, type McpTool } from '../types/mcp.js';

export const toolsRoutes = Router();

// Package version for response metadata
const PACKAGE_VERSION = '2.0.0';

interface ToolsInfoQuery {
  schema?: string;
  hints?: string;
}

/**
 * GET /tools/list - List all tools (MCP-compatible format)
 * 
 * Returns tool names, descriptions, and JSON schemas following MCP protocol.
 * This is the standard MCP tools/list format for tool discovery.
 * 
 * @example
 * GET /tools/list
 * 
 * Response:
 * {
 *   "tools": [
 *     {
 *       "name": "localSearchCode",
 *       "description": "Search code with ripgrep...",
 *       "inputSchema": { "$schema": "...", "type": "object", "properties": {...} }
 *     }
 *   ],
 *   "_meta": { "totalCount": 13, "version": "2.0.0" }
 * }
 */
toolsRoutes.get('/list', async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await initialize();
    const content = await loadToolContent();
    
    const tools: McpTool[] = Object.values(content.tools).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: transformToJsonSchema(tool.schema, tool.name),
    }));
    
    const response: ListToolsResponse = {
      tools,
      _meta: {
        totalCount: tools.length,
        version: PACKAGE_VERSION,
      },
    };
    
    res.json(response);
  } catch (error) {
    next(error);
  }
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
    await initialize();
    const content = await loadToolContent();
    
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
    
    res.json(QuickResult.success(
      `Found ${toolNames.length} tools`,
      response,
      ['Use /tools/info/:toolName for specific tool details']
    ));
  } catch (error) {
    next(error);
  }
});

/**
 * GET /tools/info/:toolName - Get info about a specific tool
 */
toolsRoutes.get('/info/:toolName', async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await initialize();
    const content = await loadToolContent();
    
    const { toolName } = req.params;
    const query = req.query as ToolsInfoQuery;
    const includeSchema = query.schema !== 'false';  // Default true for specific tool
    const includeHints = query.hints !== 'false';    // Default true for specific tool
    
    const tool = content.tools[toolName];
    
    if (!tool) {
      const availableTools = Object.keys(content.tools);
      res.status(404).json(QuickResult.empty(
        `Tool not found: ${toolName}`,
        [
          `Available tools: ${availableTools.slice(0, 5).join(', ')}...`,
          'Check spelling or use /tools/info to list all tools',
        ]
      ));
      return;
    }
    
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
    
    res.json(QuickResult.success(
      `Tool: ${tool.name}`,
      result,
      ['Schema and hints included by default for specific tool queries']
    ));
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
    await initialize();
    const content = await loadToolContent();
    
    res.json(QuickResult.success(
      'Metadata summary',
      {
        instructions: content.instructions,
        toolCount: Object.keys(content.tools).length,
        promptCount: Object.keys(content.prompts).length,
        hasBaseSchema: !!content.baseSchema,
      },
      ['Use /tools/info for detailed tool information']
    ));
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
    await initialize();
    const content = await loadToolContent();
    
    res.json({
      instructions: content.instructions,
      _meta: {
        charCount: content.instructions.length,
        version: PACKAGE_VERSION,
      },
    });
  } catch (error) {
    next(error);
  }
});
