import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  githubSearchCode,
  githubGetFileContent,
  githubSearchRepositories,
  githubViewRepoStructure,
  githubSearchPullRequests,
} from '../index.js';
import { parseAndValidate, sendToolResult } from '../middleware/queryParser.js';
import {
  githubSearchSchema,
  githubContentSchema,
  githubReposSchema,
  githubStructureSchema,
  githubPRsSchema,
} from '../validation/index.js';

export const githubRoutes = Router();

// GET /github/search - Search code on GitHub
githubRoutes.get(
  '/search',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queries = parseAndValidate(
        req.query as Record<string, unknown>,
        githubSearchSchema
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await githubSearchCode({ queries } as any);
      sendToolResult(res, result);
    } catch (error) {
      next(error);
    }
  }
);

// GET /github/content - Read file from GitHub
githubRoutes.get(
  '/content',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queries = parseAndValidate(
        req.query as Record<string, unknown>,
        githubContentSchema
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await githubGetFileContent({ queries } as any);
      sendToolResult(res, result);
    } catch (error) {
      next(error);
    }
  }
);

// GET /github/repos - Search repositories
githubRoutes.get(
  '/repos',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queries = parseAndValidate(
        req.query as Record<string, unknown>,
        githubReposSchema
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await githubSearchRepositories({ queries } as any);
      sendToolResult(res, result);
    } catch (error) {
      next(error);
    }
  }
);

// GET /github/structure - View repository structure
githubRoutes.get(
  '/structure',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queries = parseAndValidate(
        req.query as Record<string, unknown>,
        githubStructureSchema
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await githubViewRepoStructure({ queries } as any);
      sendToolResult(res, result);
    } catch (error) {
      next(error);
    }
  }
);

// GET /github/prs - Search pull requests
githubRoutes.get(
  '/prs',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queries = parseAndValidate(
        req.query as Record<string, unknown>,
        githubPRsSchema
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await githubSearchPullRequests({ queries } as any);
      sendToolResult(res, result);
    } catch (error) {
      next(error);
    }
  }
);
