import { Router, type Request, type Response, type NextFunction } from 'express';
import { packageSearch } from '../index.js';
import { parseAndValidate, sendToolResult } from '../middleware/queryParser.js';
import { packageSearchSchema } from '../validation/index.js';

export const packageRoutes = Router();

// GET /package/search - Search npm/pypi packages
packageRoutes.get(
  '/search',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queries = parseAndValidate(
        req.query as Record<string, unknown>,
        packageSearchSchema
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await packageSearch({ queries } as any);
      sendToolResult(res, result);
    } catch (error) {
      next(error);
    }
  }
);
