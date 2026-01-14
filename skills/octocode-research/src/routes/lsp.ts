import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  lspGotoDefinition,
  lspFindReferences,
  lspCallHierarchy,
} from '../index.js';
import { parseAndValidate, sendToolResult } from '../middleware/queryParser.js';
import {
  lspDefinitionSchema,
  lspReferencesSchema,
  lspCallsSchema,
} from '../validation/index.js';

export const lspRoutes = Router();

// GET /lsp/definition - Go to symbol definition
lspRoutes.get(
  '/definition',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queries = parseAndValidate(
        req.query as Record<string, unknown>,
        lspDefinitionSchema
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await lspGotoDefinition({ queries } as any);
      sendToolResult(res, result);
    } catch (error) {
      next(error);
    }
  }
);

// GET /lsp/references - Find all references to a symbol
lspRoutes.get(
  '/references',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queries = parseAndValidate(
        req.query as Record<string, unknown>,
        lspReferencesSchema
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await lspFindReferences({ queries } as any);
      sendToolResult(res, result);
    } catch (error) {
      next(error);
    }
  }
);

// GET /lsp/calls - Get call hierarchy (incoming/outgoing)
lspRoutes.get(
  '/calls',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queries = parseAndValidate(
        req.query as Record<string, unknown>,
        lspCallsSchema
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await lspCallHierarchy({ queries } as any);
      sendToolResult(res, result);
    } catch (error) {
      next(error);
    }
  }
);
