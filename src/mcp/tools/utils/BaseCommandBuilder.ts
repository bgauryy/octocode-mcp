/**
 * Base command builder for CLI tools
 * Eliminates duplicated command construction logic across tools
 */
type CommandType = 'github' | 'npm';

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
   * Add query parameters (query terms)
   */
  protected addQuery(params: {
    queryTerms?: string[];
    orTerms?: string[];
  }): this {
    if (params.queryTerms && params.queryTerms.length > 0) {
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
  protected addFlag(flag: string, value: string | number | boolean): this {
    // Skip undefined and null values
    if (value === undefined || value === null) {
      return this;
    }

    if (typeof value === 'boolean') {
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
    value: string | number
  ): this {
    this.args.push('--' + flag, value.toString());
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
   * Normalize string or array parameters with secure parsing
   * Handles MCP SDK stringified arrays safely
   */
  protected normalizeArrayParam(param: string | string[]): string[] {
    if (Array.isArray(param)) {
      return param.filter(
        item => typeof item === 'string' && this.isValidArrayItem(item)
      );
    }

    if (typeof param === 'string') {
      // Try JSON parsing first (most secure)
      try {
        const parsed = JSON.parse(param);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            item => typeof item === 'string' && this.isValidArrayItem(item)
          );
        }
      } catch {
        // Not JSON, continue with safe fallback parsing
      }

      // Safe fallback parsing with validation
      let items: string[];
      if (param.includes(', ')) {
        items = param.split(', ');
      } else if (param.includes(',')) {
        items = param.split(',');
      } else {
        items = [param];
      }

      // Validate and clean each item (remove quotes and trim)
      return items
        .map(item => item.trim().replace(/^["']|["']$/g, '')) // Remove surrounding quotes
        .filter(item => item.length > 0 && this.isValidArrayItem(item));
    }

    return [String(param)].filter(item => this.isValidArrayItem(item));
  }

  /**
   * Validate array items to prevent injection attacks
   */
  private isValidArrayItem(item: string): boolean {
    // Reject items that look like command injection attempts
    if (item.includes(';') || item.includes('|') || item.includes('&')) {
      return false;
    }

    // Reject items that start with dangerous characters
    if (item.startsWith('-') && item.length > 1) {
      return false; // Prevent flag injection
    }

    // Reject items with suspicious shell metacharacters
    if (/[`$\\<>]/.test(item)) {
      return false;
    }

    return true;
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
