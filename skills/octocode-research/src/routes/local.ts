import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  localSearchCode,
  localGetFileContent,
  localFindFiles,
  localViewStructure,
} from '../index.js';
import { parseAndValidate, sendToolResult } from '../middleware/queryParser.js';
import {
  localSearchSchema,
  localContentSchema,
  localFindSchema,
  localStructureSchema,
} from '../validation/index.js';

export const localRoutes = Router();

// GET /local/search - Search for patterns in code
localRoutes.get(
  '/search',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queries = parseAndValidate(
        req.query as Record<string, unknown>,
        localSearchSchema
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await localSearchCode({ queries } as any);
      sendToolResult(res, result);
    } catch (error) {
      next(error);
    }
  }
);

// GET /local/content - Read file contents
localRoutes.get(
  '/content',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queries = parseAndValidate(
        req.query as Record<string, unknown>,
        localContentSchema
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await localGetFileContent({ queries } as any);
      sendToolResult(res, result);
    } catch (error) {
      next(error);
    }
  }
);

// GET /local/find - Find files by metadata
localRoutes.get(
  '/find',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queries = parseAndValidate(
        req.query as Record<string, unknown>,
        localFindSchema
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await localFindFiles({ queries } as any);
      sendToolResult(res, result);
    } catch (error) {
      next(error);
    }
  }
);

// GET /local/structure - View directory tree
localRoutes.get(
  '/structure',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queries = parseAndValidate(
        req.query as Record<string, unknown>,
        localStructureSchema
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await localViewStructure({ queries } as any);
      sendToolResult(res, result);
    } catch (error) {
      next(error);
    }
  }
);
