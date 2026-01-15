import { Router, type Request, type Response, type NextFunction } from 'express';
import { packageSearch } from '../index.js';
import { parseAndValidate } from '../middleware/queryParser.js';
import { packageSearchSchema } from '../validation/index.js';
import { ResearchResponse } from '../utils/responseBuilder.js';
import { parseToolResponse } from '../utils/responseParser.js';

export const packageRoutes = Router();

// Type for structured content (flexible)
type StructuredData = Record<string, unknown>;

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
      const rawResult = await packageSearch({ queries } as any);
      const { data, isError, hints, research } = parseToolResponse(rawResult);

      // Extract packages from result
      const packages = extractPackages(data);
      const query = queries[0] as StructuredData;
      const registry = query.ecosystem === 'python' ? 'pypi' : 'npm';

      const response = ResearchResponse.packageSearch({
        packages,
        registry,
        query: String(query.name || ''),
        mcpHints: hints,
        research,
      });

      res.status(isError ? 500 : 200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// Helper: Extract packages from result
function extractPackages(
  data: StructuredData
): Array<{
  name: string;
  version?: string;
  description?: string;
  repository?: string;
}> {
  // Handle npm results
  if (Array.isArray(data.npmResults)) {
    return data.npmResults.map((pkg: StructuredData) => ({
      name: String(pkg.name || ''),
      version: typeof pkg.version === 'string' ? pkg.version : undefined,
      description: typeof pkg.description === 'string' ? pkg.description : undefined,
      repository:
        typeof pkg.repository === 'string'
          ? pkg.repository
          : typeof pkg.repository === 'object' && pkg.repository !== null
            ? String((pkg.repository as StructuredData).url || '')
            : undefined,
    }));
  }

  // Handle pypi results
  if (Array.isArray(data.pypiResults)) {
    return data.pypiResults.map((pkg: StructuredData) => ({
      name: String(pkg.name || ''),
      version: typeof pkg.version === 'string' ? pkg.version : undefined,
      description: typeof pkg.description === 'string' ? pkg.description : undefined,
      repository:
        typeof pkg.homepage === 'string'
          ? pkg.homepage
          : typeof pkg.project_url === 'string'
            ? pkg.project_url
            : undefined,
    }));
  }

  // Handle generic packages array (MCP uses 'path' for package name, 'repoUrl' for repository)
  if (Array.isArray(data.packages)) {
    return data.packages.map((pkg: StructuredData) => ({
      name: String(pkg.name || pkg.path || ''),
      version: typeof pkg.version === 'string' ? pkg.version : undefined,
      description: typeof pkg.description === 'string' ? pkg.description : undefined,
      repository:
        typeof pkg.repository === 'string'
          ? pkg.repository
          : typeof pkg.repoUrl === 'string'
            ? pkg.repoUrl
            : undefined,
    }));
  }

  // Handle results array (fallback)
  if (Array.isArray(data.results)) {
    return data.results.map((pkg: StructuredData) => ({
      name: String(pkg.name || ''),
      version: typeof pkg.version === 'string' ? pkg.version : undefined,
      description: typeof pkg.description === 'string' ? pkg.description : undefined,
      repository: typeof pkg.repository === 'string' ? pkg.repository : undefined,
    }));
  }

  return [];
}
