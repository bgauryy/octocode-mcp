import { Router, type Request, type Response, type NextFunction } from 'express';
import { loadToolContent, initialize } from 'octocode-mcp/public';
import type { ListPromptsResponse, McpPrompt } from '../types/mcp.js';

export const promptsRoutes = Router();

// Package version for response metadata
const PACKAGE_VERSION = '2.0.0';

/**
 * GET /prompts/list - List all prompts (MCP-compatible format)
 * 
 * Returns prompt names, descriptions, and arguments following MCP protocol.
 * 
 * @example
 * GET /prompts/list
 * 
 * Response:
 * {
 *   "prompts": [
 *     {
 *       "name": "research",
 *       "description": "Start a code research session",
 *       "arguments": [
 *         { "name": "goal", "description": "The research goal", "required": true }
 *       ]
 *     }
 *   ],
 *   "_meta": { "totalCount": 5, "version": "2.0.0" }
 * }
 */
promptsRoutes.get('/list', async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await initialize();
    const content = await loadToolContent();
    
    // Use Object.entries to get both key and prompt
    // The key is what's used for lookup in /prompts/info/:promptName
    const prompts: McpPrompt[] = Object.entries(content.prompts).map(([key, prompt]) => ({
      name: key, // Use the key (lookup name), not prompt.name (display name may differ)
      description: prompt.description,
      arguments: prompt.args?.map(arg => ({
        name: arg.name,
        description: arg.description,
        required: arg.required ?? false,
      })),
    }));
    
    const response: ListPromptsResponse = {
      prompts,
      _meta: {
        totalCount: prompts.length,
        version: PACKAGE_VERSION,
      },
    };
    
    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /prompts/info/:promptName - Get specific prompt details
 * 
 * Returns detailed information about a specific prompt.
 */
promptsRoutes.get('/info/:promptName', async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await initialize();
    const content = await loadToolContent();
    const { promptName } = req.params;
    
    const prompt = content.prompts[promptName];
    
    if (!prompt) {
      const availablePrompts = Object.keys(content.prompts);
      res.status(404).json({
        error: `Prompt not found: ${promptName}`,
        availablePrompts: availablePrompts.slice(0, 10),
        hints: [
          'Check spelling and case sensitivity',
          'Use /prompts/list to see all available prompts',
        ],
      });
      return;
    }
    
    const mcpPrompt: McpPrompt = {
      name: prompt.name,
      description: prompt.description,
      arguments: prompt.args?.map(arg => ({
        name: arg.name,
        description: arg.description,
        required: arg.required ?? false,
      })),
    };
    
    res.json({
      prompt: mcpPrompt,
      content: prompt.content, // Include actual prompt content for specific queries
    });
  } catch (error) {
    next(error);
  }
});
