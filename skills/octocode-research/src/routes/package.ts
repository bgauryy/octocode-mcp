import { Router, type Request, type Response, type NextFunction } from 'express';
import { packageSearch } from '../index.js';
import { parseAndValidate } from '../middleware/queryParser.js';
import { packageSearchSchema } from '../validation/index.js';
import { ResearchResponse } from '../utils/responseBuilder.js';
import { parseToolResponse } from '../utils/responseParser.js';
import { withPackageResilience } from '../utils/resilience.js';
import { toPackageSearchParams } from '../types/toolTypes.js';
import { safeString, safeArray } from '../utils/responseFactory.js';
import { isObject, hasProperty, hasStringProperty } from '../types/guards.js';

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
      const rawResult = await withPackageResilience(
        () => packageSearch(toPackageSearchParams(queries)),
        'packageSearch'
      );
      const { data, isError, hints, research } = parseToolResponse(rawResult);

      // Extract packages from result
      const packages = extractPackages(data);
      const query = queries[0] as Record<string, unknown>;
      const registry = query.ecosystem === 'python' ? 'pypi' : 'npm';

      const response = ResearchResponse.packageSearch({
        packages,
        registry,
        query: safeString(query, 'name'),
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
  data: Record<string, unknown>
): Array<{
  name: string;
  version?: string;
  description?: string;
  repository?: string;
}> {
  // Handle npm results
  if (hasProperty(data, 'npmResults') && Array.isArray(data.npmResults)) {
    return data.npmResults.map((pkg: unknown) => {
      if (!isObject(pkg)) return { name: '' };
      return {
        name: safeString(pkg, 'name'),
        version: hasStringProperty(pkg, 'version') ? pkg.version : undefined,
        description: hasStringProperty(pkg, 'description') ? pkg.description : undefined,
        repository: extractRepositoryUrl(pkg),
      };
    });
  }

  // Handle pypi results
  if (hasProperty(data, 'pypiResults') && Array.isArray(data.pypiResults)) {
    return data.pypiResults.map((pkg: unknown) => {
      if (!isObject(pkg)) return { name: '' };
      return {
        name: safeString(pkg, 'name'),
        version: hasStringProperty(pkg, 'version') ? pkg.version : undefined,
        description: hasStringProperty(pkg, 'description') ? pkg.description : undefined,
        repository: hasStringProperty(pkg, 'homepage')
          ? pkg.homepage
          : hasStringProperty(pkg, 'project_url')
            ? pkg.project_url
            : undefined,
      };
    });
  }

  // Handle generic packages array (MCP uses 'path' for package name, 'repoUrl' for repository)
  if (hasProperty(data, 'packages') && Array.isArray(data.packages)) {
    return data.packages.map((pkg: unknown) => {
      if (!isObject(pkg)) return { name: '' };
      return {
        name: safeString(pkg, 'name') || safeString(pkg, 'path'),
        version: hasStringProperty(pkg, 'version') ? pkg.version : undefined,
        description: hasStringProperty(pkg, 'description') ? pkg.description : undefined,
        repository: extractRepositoryUrl(pkg),
      };
    });
  }

  // Handle results array (fallback)
  const results = safeArray<Record<string, unknown>>(data, 'results');
  return results.map((pkg) => ({
    name: safeString(pkg, 'name'),
    version: hasStringProperty(pkg, 'version') ? pkg.version : undefined,
    description: hasStringProperty(pkg, 'description') ? pkg.description : undefined,
    repository: hasStringProperty(pkg, 'repository') ? pkg.repository : undefined,
  }));
}

// Helper: Extract repository URL from various formats
function extractRepositoryUrl(pkg: Record<string, unknown>): string | undefined {
  if (hasStringProperty(pkg, 'repository')) {
    return pkg.repository;
  }
  if (hasStringProperty(pkg, 'repoUrl')) {
    return pkg.repoUrl;
  }
  if (hasProperty(pkg, 'repository') && isObject(pkg.repository)) {
    const repo = pkg.repository;
    if (hasStringProperty(repo, 'url')) {
      return repo.url;
    }
  }
  return undefined;
}
