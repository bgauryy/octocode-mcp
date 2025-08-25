import { BaseCommandBuilder, BaseCommandParams } from './BaseCommandBuilder';

/**
 * NPM-specific command builder
 * Handles NPM CLI command construction with common patterns
 */
export abstract class NpmCommandBuilder<
  T extends BaseCommandParams,
> extends BaseCommandBuilder<T> {
  constructor() {
    super('npm');
  }

  /**
   * Add NPM search-specific parameters
   */
  protected addSearchLimit(searchLimit?: number): this {
    if (searchLimit) {
      this.addFlag('searchlimit', searchLimit);
    }
    return this;
  }

  /**
   * Add NPM JSON output (always for npm commands)
   */
  protected addNpmJsonOutput(): this {
    this.args.push('--json');
    return this;
  }
}

/**
 * NPM Package Search Command Builder
 */
export class NpmPackageSearchBuilder extends NpmCommandBuilder<
  Record<string, unknown>
> {
  protected initializeCommand(): this {
    // Always start with empty args - the command is handled by executeNpmCommand
    this.args = [];
    return this;
  }

  build(params: Record<string, unknown>): string[] {
    const builder = this.reset().initializeCommand();

    // Handle query building for npm search
    if (
      params.queryTerms &&
      Array.isArray(params.queryTerms) &&
      params.queryTerms.length > 0
    ) {
      // Combine terms for npm search
      const combinedQuery = (params.queryTerms as string[]).join(' ');
      this.args.push(combinedQuery);
    } else if (params.query && typeof params.query === 'string') {
      this.args.push(params.query);
    }

    return builder
      .addSearchLimit((params.searchLimit as number) || 20)
      .addNpmJsonOutput()
      .getArgs();
  }
}

/**
 * NPM Package View Command Builder
 */
export class NpmPackageViewBuilder extends NpmCommandBuilder<
  Record<string, unknown>
> {
  protected initializeCommand(): this {
    // Always start with empty args - the command is handled by executeNpmCommand
    this.args = [];
    return this;
  }

  build(params: Record<string, unknown>): string[] {
    const builder = this.reset().initializeCommand();

    // Add package name (even if empty)
    if (params.packageName !== undefined) {
      this.args.push(params.packageName as string);
    }

    // Add specific field if requested
    if (params.field && typeof params.field === 'string') {
      this.args.push(params.field);
    } else if (params.match) {
      // Handle specific fields or multiple fields
      if (Array.isArray(params.match)) {
        (params.match as string[]).forEach((field: string) =>
          this.args.push(field)
        );
      } else if (typeof params.match === 'string') {
        this.args.push(params.match);
      }
    }

    return builder.addNpmJsonOutput().getArgs();
  }
}
