/**
 * Generalized command builder for GitHub CLI and NPM commands
 * Reduces code duplication across tools and provides consistent parameter handling
 */

export interface CommandBuilder {
  addQuery(query: string): CommandBuilder;
  addFilter(
    key: string,
    value: string | number | boolean | string[]
  ): CommandBuilder;
  addFlag(flag: string): CommandBuilder;
  addConditionalFilter(
    condition: boolean,
    key: string,
    value: string | number | boolean | string[]
  ): CommandBuilder;
  addArrayFilter(key: string, values: string | string[]): CommandBuilder;
  addRangeFilter(key: string, value: string | number): CommandBuilder;
  setLimit(limit: number): CommandBuilder;
  setSort(sort: string, order?: 'asc' | 'desc'): CommandBuilder;
  setJsonFields(fields: string[]): CommandBuilder;
  build(): string[];
}

export class GitHubCommandBuilder implements CommandBuilder {
  private args: string[] = [];
  private baseCommand: string;

  constructor(baseCommand: string) {
    this.baseCommand = baseCommand;
    this.args = [baseCommand];
  }

  addQuery(query: string): CommandBuilder {
    if (query.trim()) {
      this.args.push(query);
    }
    return this;
  }

  addFilter(
    key: string,
    value: string | number | boolean | string[]
  ): CommandBuilder {
    if (value !== undefined && value !== null) {
      if (Array.isArray(value)) {
        value.forEach(v => this.args.push(`--${key}=${v}`));
      } else {
        this.args.push(`--${key}=${value}`);
      }
    }
    return this;
  }

  addFlag(flag: string): CommandBuilder {
    this.args.push(`--${flag}`);
    return this;
  }

  addConditionalFilter(
    condition: boolean,
    key: string,
    value: string | number | boolean | string[]
  ): CommandBuilder {
    if (condition) {
      this.addFilter(key, value);
    }
    return this;
  }

  addArrayFilter(key: string, values: string | string[]): CommandBuilder {
    if (values) {
      const valueArray = Array.isArray(values) ? values : [values];
      valueArray.forEach(value => this.args.push(`--${key}=${value}`));
    }
    return this;
  }

  addRangeFilter(key: string, value: string | number): CommandBuilder {
    if (value !== undefined) {
      const stringValue = typeof value === 'number' ? value.toString() : value;
      if (
        typeof value === 'number' ||
        /^(\d+|>\d+|<\d+|\d+\.\.\d+|>=\d+|<=\d+)$/.test(stringValue)
      ) {
        this.args.push(`--${key}=${stringValue}`);
      }
    }
    return this;
  }

  setLimit(limit: number): CommandBuilder {
    if (limit) {
      this.args.push(`--limit=${limit}`);
    }
    return this;
  }

  setSort(sort: string, order?: 'asc' | 'desc'): CommandBuilder {
    if (sort) {
      this.args.push(`--sort=${sort}`);
    }
    if (order) {
      this.args.push(`--order=${order}`);
    }
    return this;
  }

  setJsonFields(fields: string[]): CommandBuilder {
    if (fields.length > 0) {
      this.args.push('--json', fields.join(','));
    }
    return this;
  }

  build(): string[] {
    return [...this.args];
  }
}

export class NPMCommandBuilder implements CommandBuilder {
  private args: string[] = [];
  private baseCommand: string;

  constructor(baseCommand: string) {
    this.baseCommand = baseCommand;
    this.args = [baseCommand];
  }

  addQuery(query: string): CommandBuilder {
    if (query.trim()) {
      this.args.push(query);
    }
    return this;
  }

  addFilter(
    key: string,
    value: string | number | boolean | string[]
  ): CommandBuilder {
    if (value !== undefined && value !== null) {
      this.args.push(`--${key}=${value}`);
    }
    return this;
  }

  addFlag(flag: string): CommandBuilder {
    this.args.push(`--${flag}`);
    return this;
  }

  addConditionalFilter(
    condition: boolean,
    key: string,
    value: string | number | boolean | string[]
  ): CommandBuilder {
    if (condition) {
      this.addFilter(key, value);
    }
    return this;
  }

  addArrayFilter(key: string, values: string | string[]): CommandBuilder {
    return this.addFilter(key, values);
  }

  addRangeFilter(key: string, value: string | number): CommandBuilder {
    return this.addFilter(key, value);
  }

  setLimit(limit: number): CommandBuilder {
    if (limit) {
      this.args.push(`--searchlimit=${limit}`);
    }
    return this;
  }

  setSort(_sort: string, _order?: 'asc' | 'desc'): CommandBuilder {
    // NPM doesn't typically use sort/order parameters
    return this;
  }

  setJsonFields(_fields: string[]): CommandBuilder {
    this.args.push('--json');
    return this;
  }

  build(): string[] {
    return [...this.args];
  }
}

// Factory functions for easy instantiation
export const createGitHubCommand = (
  baseCommand: string
): GitHubCommandBuilder => new GitHubCommandBuilder(baseCommand);

export const createNPMCommand = (baseCommand: string): NPMCommandBuilder =>
  new NPMCommandBuilder(baseCommand);
