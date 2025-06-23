/**
 * Generalized response transformers for API data
 * Provides consistent data transformation patterns across all tools
 */

import { toDDMMYYYY, simplifyRepoUrl, humanizeBytes } from './responses';

export interface BaseTransformOptions {
  includeDates?: boolean;
  includeMetadata?: boolean;
  maxItems?: number;
  simplifyUrls?: boolean;
}

export interface GitHubTransformOptions extends BaseTransformOptions {
  singleRepo?: boolean;
  includeRepository?: boolean;
  dateFormat?: 'DDMMYYYY' | 'relative' | 'iso';
}

export interface NPMTransformOptions extends BaseTransformOptions {
  maxVersions?: number;
  includeExports?: boolean;
  humanizeSizes?: boolean;
}

/**
 * Base transformer class with common functionality
 */
export abstract class BaseTransformer<
  TInput,
  TOutput,
  TOptions extends BaseTransformOptions,
> {
  protected options: TOptions;

  constructor(options: TOptions) {
    this.options = { maxItems: 100, simplifyUrls: true, ...options };
  }

  abstract transform(input: TInput): TOutput;

  protected limitItems<T>(items: T[]): T[] {
    return this.options.maxItems
      ? items.slice(0, this.options.maxItems)
      : items;
  }

  protected transformUrl(url: string): string {
    return this.options.simplifyUrls ? simplifyRepoUrl(url) : url;
  }

  protected transformDate(date: string): string {
    if (!date) return 'Unknown';
    return toDDMMYYYY(date);
  }
}

/**
 * GitHub API response transformer
 */
export class GitHubResponseTransformer<TInput, TOutput> extends BaseTransformer<
  TInput,
  TOutput,
  GitHubTransformOptions
> {
  constructor(options: GitHubTransformOptions = {}) {
    super({ dateFormat: 'DDMMYYYY', includeRepository: true, ...options });
  }

  // Override in subclasses
  transform(_input: TInput): TOutput {
    throw new Error('Transform method must be implemented by subclass');
  }

  protected transformGitHubDate(date: string): string {
    if (!date) return 'Unknown';

    switch (this.options.dateFormat) {
      case 'DDMMYYYY':
        return toDDMMYYYY(date);
      case 'iso':
        return date;
      case 'relative':
      default:
        return toDDMMYYYY(date); // Default to DDMMYYYY as per requirements
    }
  }

  protected extractSingleRepository<T extends { repository?: any }>(
    items: T[]
  ): T['repository'] | null {
    if (items.length === 0) return null;

    const firstRepo = items[0].repository;
    if (!firstRepo) return null;

    const repoIdentifier =
      firstRepo.fullName || firstRepo.nameWithOwner || firstRepo.name;
    const allSameRepo = items.every(item => {
      const itemRepo = item.repository;
      if (!itemRepo) return false;
      const itemIdentifier =
        itemRepo.fullName || itemRepo.nameWithOwner || itemRepo.name;
      return itemIdentifier === repoIdentifier;
    });

    return allSameRepo ? firstRepo : null;
  }

  protected buildMetadata(
    items: any[],
    additionalMetadata: Record<string, any> = {}
  ): Record<string, any> {
    if (!this.options.includeMetadata) return {};

    return {
      total_count: items.length,
      ...additionalMetadata,
    };
  }
}

/**
 * NPM response transformer
 */
export class NPMResponseTransformer<TInput, TOutput> extends BaseTransformer<
  TInput,
  TOutput,
  NPMTransformOptions
> {
  constructor(options: NPMTransformOptions = {}) {
    super({
      maxVersions: 5,
      includeExports: true,
      humanizeSizes: true,
      ...options,
    });
  }

  // Override in subclasses
  transform(_input: TInput): TOutput {
    throw new Error('Transform method must be implemented by subclass');
  }

  protected transformSize(bytes: number): string | number {
    return this.options.humanizeSizes ? humanizeBytes(bytes) : bytes;
  }

  protected limitVersions<T extends { version: string; date?: string }>(
    versions: T[]
  ): T[] {
    return this.options.maxVersions
      ? versions.slice(-this.options.maxVersions)
      : versions;
  }

  protected simplifyExports(
    exports: any
  ): { main: string; types?: string; [key: string]: any } | undefined {
    if (!this.options.includeExports || !exports) return undefined;

    if (typeof exports === 'string') {
      return { main: exports };
    }

    if (typeof exports === 'object') {
      const simplified: any = {};

      // Extract main entry point
      if (exports['.']) {
        const mainExport = exports['.'];
        if (typeof mainExport === 'string') {
          simplified.main = mainExport;
        } else if (mainExport.default) {
          simplified.main = mainExport.default;
        } else if (mainExport.import) {
          simplified.main = mainExport.import;
        }
      }

      // Extract types if available
      if (exports['./types'] || exports['.']?.types) {
        simplified.types = exports['./types'] || exports['.'].types;
      }

      // Add a few other important exports (max 3 total)
      let count = 0;
      for (const [key, value] of Object.entries(exports)) {
        if (count >= 3 || key === '.' || key === './types') continue;
        if (key.includes('package.json') || key.includes('node_modules'))
          continue;

        simplified[key] =
          typeof value === 'object' ? (value as any).default || value : value;
        count++;
      }

      return Object.keys(simplified).length > 0 ? simplified : undefined;
    }

    return undefined;
  }
}

/**
 * Factory functions for creating specialized transformers
 */
export const createGitHubTransformer = <TInput, TOutput>(
  transformFn: (
    input: TInput,
    transformer: GitHubResponseTransformer<TInput, TOutput>
  ) => TOutput,
  options: GitHubTransformOptions = {}
): GitHubResponseTransformer<TInput, TOutput> => {
  const transformer = new GitHubResponseTransformer<TInput, TOutput>(options);
  transformer.transform = (input: TInput) => transformFn(input, transformer);
  return transformer;
};

export const createNPMTransformer = <TInput, TOutput>(
  transformFn: (
    input: TInput,
    transformer: NPMResponseTransformer<TInput, TOutput>
  ) => TOutput,
  options: NPMTransformOptions = {}
): NPMResponseTransformer<TInput, TOutput> => {
  const transformer = new NPMResponseTransformer<TInput, TOutput>(options);
  transformer.transform = (input: TInput) => transformFn(input, transformer);
  return transformer;
};
