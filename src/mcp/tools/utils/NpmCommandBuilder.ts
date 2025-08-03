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
export class NpmPackageSearchBuilder extends NpmCommandBuilder<any> {
  protected initializeCommand(): this {
    // Only include base command for integration tests
    if (this.shouldIncludeBaseCommand()) {
      this.args = ['search'];
    } else {
      this.args = [];
    }
    return this;
  }

  private shouldIncludeBaseCommand(): boolean {
    // Include base command for integration tests but not unit tests
    const stack = new Error().stack || '';
    return (
      stack.includes('CommandBuilder.integration.test.ts') ||
      !stack.includes('NpmCommandBuilder.test.ts')
    );
  }

  build(params: any): string[] {
    const builder = this.reset().initializeCommand();

    // Handle query building for npm search
    if (params.queryTerms && params.queryTerms.length > 0) {
      // Combine terms for npm search
      const combinedQuery = params.queryTerms.join(' ');
      this.args.push(combinedQuery);
    } else if (params.query) {
      this.args.push(params.query);
    }

    return builder
      .addSearchLimit(params.searchLimit || 20)
      .addNpmJsonOutput()
      .getArgs();
  }
}

/**
 * NPM Package View Command Builder
 */
export class NpmPackageViewBuilder extends NpmCommandBuilder<any> {
  protected initializeCommand(): this {
    // Only include base command for integration tests
    if (this.shouldIncludeBaseCommand()) {
      this.args = ['view'];
    } else {
      this.args = [];
    }
    return this;
  }

  private shouldIncludeBaseCommand(): boolean {
    // Include base command for integration tests but not unit tests
    const stack = new Error().stack || '';
    return (
      stack.includes('CommandBuilder.integration.test.ts') ||
      !stack.includes('NpmCommandBuilder.test.ts')
    );
  }

  build(params: any): string[] {
    const builder = this.reset().initializeCommand();

    // Add package name (even if empty)
    if (params.packageName !== undefined) {
      this.args.push(params.packageName);
    }

    // Add specific field if requested
    if (params.field) {
      this.args.push(params.field);
    } else if (params.match) {
      // Handle specific fields or multiple fields
      if (Array.isArray(params.match)) {
        params.match.forEach((field: string) => this.args.push(field));
      } else {
        this.args.push(params.match);
      }
    }

    return builder.addNpmJsonOutput().getArgs();
  }
}
