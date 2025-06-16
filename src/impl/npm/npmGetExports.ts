import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeNpmCommand } from '../../utils/exec';
import { NpmData } from '../../types';
import { createErrorResult, createSuccessResult } from '../util';
import { TOOL_NAMES } from '../../mcp/systemPrompts';

// Enhanced type for comprehensive API intelligence
interface ComprehensiveNpmExportsResult {
  packageName: string;
  version: string;
  apiIntelligence: {
    // Primary entry points for imports
    mainEntry: string;
    moduleEntry?: string;
    typesEntry?: string;
    browserEntry?: string;

    // Export mappings (modern packages)
    exports: Record<string, any>;

    // Public API indicators
    publicApiFinder: {
      hasExports: boolean;
      hasMain: boolean;
      hasModule: boolean;
      hasTypes: boolean;
      hasBrowser: boolean;
    };

    // Import path intelligence
    importPaths: {
      defaultImport: string;
      namedImports?: string[];
      subpathImports?: string[];
      conditionalImports?: string[];
    };

    // Code search targets
    searchTargets: {
      entryFiles: string[];
      publicModules: string[];
      apiKeywords: string[];
    };
  };

  // Additional context for intelligent analysis
  analysisContext: {
    packageType: 'esm' | 'cjs' | 'dual' | 'unknown';
    hasTypeSupport: boolean;
    hasBrowserSupport: boolean;
    hasFrameworkSupport: boolean;
    moduleStructure: 'single' | 'multi' | 'complex';
  };

  nextSteps: string[];
}

export async function npmGetExports(
  packageName: string
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('npm-get-exports', { packageName });

  return withCache(cacheKey, async () => {
    try {
      const result = await executeNpmCommand('view', [packageName, '--json'], {
        cache: true,
      });

      if (result.isError) {
        return result;
      }

      // Parse the result from the executed command
      const commandOutput = JSON.parse(result.content[0].text as string);
      const npmData: NpmData = JSON.parse(commandOutput.result);

      // Extract entry points
      const mainEntry = (npmData as any).main || 'index.js'; // fallback default
      const moduleEntry = (npmData as any).module;
      const typesEntry = (npmData as any).types || (npmData as any).typings;
      const browserEntry = (npmData as any).browser;

      // Analyze exports field (modern packages)
      const exports = npmData.exports || {};
      const hasExports = Object.keys(exports).length > 0;

      // Extract import paths from exports
      const importPaths = analyzeImportPaths(exports, packageName);

      // Generate search targets for code analysis
      const searchTargets = generateSearchTargets(npmData, exports);

      // Analyze package type and structure
      const analysisContext = analyzePackageContext(npmData, exports);

      const exportsResult: ComprehensiveNpmExportsResult = {
        packageName: npmData.name,
        version: npmData.version,
        apiIntelligence: {
          mainEntry,
          moduleEntry,
          typesEntry,
          browserEntry,
          exports,
          publicApiFinder: {
            hasExports,
            hasMain: !!mainEntry,
            hasModule: !!moduleEntry,
            hasTypes: !!typesEntry,
            hasBrowser: !!browserEntry,
          },
          importPaths,
          searchTargets,
        },
        analysisContext,
        nextSteps: [
          `${TOOL_NAMES.GITHUB_SEARCH_CODE} "${searchTargets.apiKeywords[0]}" path:src/`,
          `${TOOL_NAMES.GITHUB_SEARCH_REPOS} "${npmData.name}" stars:>10`,
          ...(searchTargets.entryFiles.length > 0
            ? [
                `${TOOL_NAMES.GITHUB_SEARCH_CODE} filename:${searchTargets.entryFiles[0]}`,
              ]
            : []),
        ],
      };

      return createSuccessResult(exportsResult);
    } catch (error) {
      return createErrorResult(
        'Failed to get npm exports and API intelligence',
        error
      );
    }
  });
}

function analyzeImportPaths(exports: Record<string, any>, packageName: string) {
  const defaultImport = `import ${toCamelCase(packageName)} from '${packageName}';`;
  const namedImports: string[] = [];
  const subpathImports: string[] = [];
  const conditionalImports: string[] = [];

  // Analyze exports for import patterns
  for (const [exportPath, exportConfig] of Object.entries(exports)) {
    if (exportPath === '.') {
      // Main export
      if (typeof exportConfig === 'object' && exportConfig !== null) {
        Object.keys(exportConfig).forEach(condition => {
          if (condition !== 'default') {
            conditionalImports.push(
              `// ${condition} condition: import from '${packageName}';`
            );
          }
        });
      }
    } else if (exportPath.startsWith('./')) {
      // Subpath exports
      const subpath = exportPath.slice(2);
      subpathImports.push(`import { ... } from '${packageName}/${subpath}';`);
    }
  }

  // Generate common named import patterns
  if (Object.keys(exports).length > 1) {
    namedImports.push(`import { specific } from '${packageName}';`);
  }

  return {
    defaultImport,
    namedImports: namedImports.length > 0 ? namedImports : undefined,
    subpathImports: subpathImports.length > 0 ? subpathImports : undefined,
    conditionalImports:
      conditionalImports.length > 0 ? conditionalImports : undefined,
  };
}

function generateSearchTargets(npmData: NpmData, exports: Record<string, any>) {
  const entryFiles: string[] = [];
  const publicModules: string[] = [];
  const apiKeywords: string[] = [];

  // Add main entry points
  if ((npmData as any).main) entryFiles.push((npmData as any).main);
  if ((npmData as any).module) entryFiles.push((npmData as any).module);

  // Extract from exports
  for (const [path, config] of Object.entries(exports)) {
    if (typeof config === 'object' && config !== null) {
      Object.values(config).forEach(value => {
        if (typeof value === 'string' && value.endsWith('.js')) {
          entryFiles.push(value);
        }
      });
    } else if (typeof config === 'string') {
      entryFiles.push(config);
    }

    // Extract module names from paths
    if (path.startsWith('./')) {
      const moduleName = path.slice(2).replace(/[/\\]/g, '-');
      publicModules.push(moduleName);
    }
  }

  // Generate API search keywords from package name and description
  apiKeywords.push(npmData.name);
  if (npmData.description) {
    // Extract key terms from description
    const terms = npmData.description
      .toLowerCase()
      .split(/\W+/)
      .filter(term => term.length > 3)
      .slice(0, 5);
    apiKeywords.push(...terms);
  }

  return {
    entryFiles: [...new Set(entryFiles)],
    publicModules: [...new Set(publicModules)],
    apiKeywords: [...new Set(apiKeywords)],
  };
}

function analyzePackageContext(npmData: NpmData, exports: Record<string, any>) {
  // Determine package type
  let packageType: 'esm' | 'cjs' | 'dual' | 'unknown' = 'unknown';
  const hasEsmIndicators =
    (npmData as any).type === 'module' ||
    (npmData as any).module ||
    Object.values(exports).some(
      config =>
        typeof config === 'object' && config !== null && 'import' in config
    );
  const hasCjsIndicators =
    (npmData as any).main ||
    Object.values(exports).some(
      config =>
        typeof config === 'object' && config !== null && 'require' in config
    );

  if (hasEsmIndicators && hasCjsIndicators) packageType = 'dual';
  else if (hasEsmIndicators) packageType = 'esm';
  else if (hasCjsIndicators) packageType = 'cjs';

  // Check for type system support
  const hasTypeSupport =
    !!(npmData as any).types ||
    !!(npmData as any).typings ||
    npmData.name.includes('@types/');

  // Check for browser support
  const hasBrowserSupport =
    !!(npmData as any).browser ||
    Object.values(exports).some(
      config =>
        typeof config === 'object' && config !== null && 'browser' in config
    );

  // Check for framework support
  const hasFrameworkSupport =
    npmData.keywords?.some(keyword =>
      ['framework', 'library', 'toolkit', 'sdk', 'api'].includes(
        keyword.toLowerCase()
      )
    ) ||
    !!npmData.description
      ?.toLowerCase()
      .match(/framework|library|toolkit|sdk|api/) ||
    Object.keys(exports).some(path => path.includes('runtime'));

  // Determine module structure complexity
  const exportCount = Object.keys(exports).length;
  let moduleStructure: 'single' | 'multi' | 'complex' = 'single';
  if (exportCount > 5) moduleStructure = 'complex';
  else if (exportCount > 1) moduleStructure = 'multi';

  return {
    packageType,
    hasTypeSupport,
    hasBrowserSupport,
    hasFrameworkSupport,
    moduleStructure,
  };
}

function toCamelCase(str: string): string {
  return str
    .replace(/[@/\-_]/g, ' ')
    .replace(/\s+(.)/g, (_, char) => char.toUpperCase())
    .replace(/^[A-Z]/, char => char.toLowerCase());
}
