/**
 * Base command builder for CLI tools
 * Eliminates duplicated command construction logic across tools
 */

export type CommandType = 'github' | 'npm';

export interface BaseCommandParams {
  [key: string]: unknown;
}

export abstract class BaseCommandBuilder<T extends BaseCommandParams> {
  protected args: string[] = [];

  constructor(protected commandType: CommandType) {}

  /**
   * Initialize the command with base command
   */
  protected abstract initializeCommand(): this;

  /**
   * Add query parameters (exact query or query terms)
   */
  protected addQuery(
    params: {
      exactQuery?: string;
      queryTerms?: string[];
      orTerms?: string[];
    },
    addQuotesToExactQuery: boolean = true
  ): this {
    if (params.exactQuery) {
      const query = params.exactQuery.trim();
      this.args.push(addQuotesToExactQuery ? `"${query}"` : query);
    } else if (params.queryTerms && params.queryTerms.length > 0) {
      const queryParts: string[] = [];

      // Add AND terms
      const processedAndTerms = params.queryTerms.map(term => {
        const hasSpecialChars = /[()[\]{}*?^$|.\\+]/.test(term);
        return hasSpecialChars ? `"${term}"` : term;
      });
      queryParts.push(...processedAndTerms);

      // Add OR terms if provided
      if (params.orTerms && params.orTerms.length > 0) {
        const processedOrTerms = params.orTerms.map(term => {
          const hasSpecialChars = /[()[\]{}*?^$|.\\+]/.test(term);
          return hasSpecialChars ? `"${term}"` : term;
        });

        if (processedOrTerms.length === 1) {
          queryParts.push(processedOrTerms[0]);
        } else {
          const orQuery = `(${processedOrTerms.join(' OR ')})`;
          queryParts.push(orQuery);
        }
      }

      if (queryParts.length > 0) {
        this.args.push(queryParts.join(' '));
      }
    } else if (params.orTerms && params.orTerms.length > 0) {
      // Handle OR terms when there are no AND terms
      const processedOrTerms = params.orTerms.map(term => {
        const hasSpecialChars = /[()[\]{}*?^$|.\\+]/.test(term);
        return hasSpecialChars ? `"${term}"` : term;
      });

      if (processedOrTerms.length === 1) {
        this.args.push(processedOrTerms[0]);
      } else {
        const orQuery = `(${processedOrTerms.join(' OR ')})`;
        this.args.push(orQuery);
      }
    }
    return this;
  }

  /**
   * Add a flag with value in --flag=value format
   */
  protected addFlag(
    flag: string,
    value: string | number | boolean | string[] | unknown | undefined
  ): this {
    // Skip undefined and null values
    if (value === undefined || value === null) {
      return this;
    }

    // Handle arrays by joining them
    if (Array.isArray(value)) {
      this.args.push(`--${flag}=${value.join(',')}`);
    } else if (typeof value === 'boolean') {
      this.args.push(`--${flag}=${value}`);
    } else {
      this.args.push(`--${flag}=${value}`);
    }
    return this;
  }

  /**
   * Add a flag with separate value in --flag value format
   */
  protected addFlagWithSeparateValue(
    flag: string,
    value: string | number | boolean | string[] | unknown | undefined
  ): this {
    // Skip undefined and null values
    if (value === undefined || value === null) {
      return this;
    }

    // Handle arrays by joining them
    if (Array.isArray(value)) {
      this.args.push('--' + flag, value.join(','));
    } else {
      this.args.push('--' + flag, value.toString());
    }
    return this;
  }

  /**
   * Handle owner/repo combinations with proper formatting
   */
  protected addOwnerRepo(params: {
    owner?: string | string[];
    repo?: string | string[];
  }): this {
    if (params.repo) {
      const repos = this.normalizeArrayParam(params.repo);

      repos.forEach(repo => {
        if (params.owner && !repo.includes('/')) {
          const owners = this.normalizeArrayParam(params.owner);
          owners.forEach(owner => {
            this.addFlag('repo', `${owner}/${repo}`);
          });
        } else {
          this.addFlag('repo', repo);
        }
      });
    } else if (params.owner) {
      const owners = this.normalizeArrayParam(params.owner);
      owners.forEach(owner => {
        this.addFlag('owner', owner);
      });
    }
    return this;
  }

  /**
   * Normalize string or array parameters (handles MCP SDK stringified arrays)
   */
  protected normalizeArrayParam(param: string | string[]): string[] {
    if (Array.isArray(param)) {
      return param;
    }

    if (typeof param === 'string') {
      // Handle various stringified array formats
      if (param.includes('", "')) {
        return param.split('", "').map(item => item.replace(/^"|"$/g, ''));
      } else if (param.includes(', ')) {
        return param.split(', ');
      } else if (param.includes(',')) {
        return param.split(',');
      } else {
        return [param];
      }
    }

    return [String(param)];
  }

  /**
   * Add multiple flags from params object
   */
  protected addFlags(
    params: Record<string, unknown>,
    flagMappings: Record<string, string>
  ): this {
    for (const [paramKey, flagName] of Object.entries(flagMappings)) {
      const value = params[paramKey];
      if (value !== undefined && value !== null) {
        this.addFlag(flagName, value as string | number | boolean);
      }
    }
    return this;
  }

  /**
   * Add conditional flags based on param existence
   */
  protected addConditionalFlags(
    params: Record<string, unknown>,
    conditionalFlags: string[]
  ): this {
    conditionalFlags.forEach(flag => {
      if (params[flag]) {
        this.args.push(`--${flag}`);
      }
    });
    return this;
  }

  /**
   * Add JSON output format
   */
  protected addJsonOutput(fields?: string): this {
    if (fields) {
      this.addFlag('json', fields);
    } else {
      this.args.push('--json');
    }
    return this;
  }

  /**
   * Add limit parameter
   */
  protected addLimit(limit?: number, defaultLimit?: number): this {
    const finalLimit = limit || defaultLimit;
    if (finalLimit) {
      this.addFlag('limit', finalLimit);
    }
    return this;
  }

  /**
   * Build and return the final command arguments
   */
  abstract build(params: T): string[];

  /**
   * Get the final arguments array
   */
  public getArgs(): string[] {
    return this.args;
  }

  /**
   * Reset the builder for reuse
   */
  protected reset(): this {
    this.args = [];
    return this;
  }
}
