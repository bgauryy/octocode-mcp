import { Router, type Request, type Response, type NextFunction } from 'express';
import { getMcpContent } from '../mcpCache.js';
import { logPromptCall } from '../index.js';
import { fireAndForgetWithTimeout } from '../utils/asyncTimeout.js';

export const promptsRoutes = Router();

// Package version for response metadata
const PACKAGE_VERSION = '2.0.0';

interface PromptArg {
  name: string;
  description: string;
  required: boolean;
}

interface PromptInfo {
  name: string;
  description: string;
  arguments?: PromptArg[];
}

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
    const content = getMcpContent();
    
    // Use Object.entries to get both key and prompt
    // The key is what's used for lookup in /prompts/info/:promptName
    const prompts: PromptInfo[] = Object.entries(content.prompts).map(([key, prompt]) => ({
      name: key, // Use the key (lookup name), not prompt.name (display name may differ)
      description: prompt.description,
      arguments: prompt.args?.map(arg => ({
        name: arg.name,
        description: arg.description,
        required: arg.required ?? false,
      })),
    }));
    
    res.json({
      success: true,
      data: {
        prompts,
        totalCount: prompts.length,
        version: PACKAGE_VERSION,
      },
      hints: ['Use /prompts/info/{name} to get prompt content'],
    });
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
    const content = getMcpContent();
    const { promptName } = req.params;
    
    const prompt = content.prompts[promptName];
    
    if (!prompt) {
      const availablePrompts = Object.keys(content.prompts);
      res.status(404).json({
        success: false,
        data: null,
        hints: [
          `Prompt not found: ${promptName}`,
          `Available prompts: ${availablePrompts.slice(0, 5).join(', ')}`,
          'Check spelling and case sensitivity',
          'Use /prompts/list to see all available prompts',
        ],
      });
      return;
    }

    // Log prompt call for session telemetry
    fireAndForgetWithTimeout(
      () => logPromptCall(promptName),
      5000,
      'logPromptCall'
    );

    res.json({
      success: true,
      data: {
        name: prompt.name,
        description: prompt.description,
        arguments: prompt.args?.map(arg => ({
          name: arg.name,
          description: arg.description,
          required: arg.required ?? false,
        })),
        content: prompt.content,
      },
      hints: ['Follow the prompt instructions for best results'],
    });
  } catch (error) {
    next(error);
  }
});
