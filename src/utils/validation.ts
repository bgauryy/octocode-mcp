/**
 * Generalized validation utilities for tool parameters
 * Provides consistent validation patterns across all tools
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  suggestions?: string[];
}

export interface ValidationRule<T> {
  validate(value: T): ValidationResult;
  message?: string;
}

/**
 * Base validator class with common validation rules
 */
export class BaseValidator {
  static required<T>(value: T, fieldName: string): ValidationResult {
    if (value === undefined || value === null || value === '') {
      return {
        isValid: false,
        error: `${fieldName} is required`,
        suggestions: [`Provide a valid ${fieldName.toLowerCase()}`],
      };
    }
    return { isValid: true };
  }

  static minLength(
    value: string,
    min: number,
    fieldName: string
  ): ValidationResult {
    if (!value || value.length < min) {
      return {
        isValid: false,
        error: `${fieldName} must be at least ${min} characters`,
        suggestions: [
          `Provide a ${fieldName.toLowerCase()} with at least ${min} characters`,
        ],
      };
    }
    return { isValid: true };
  }

  static maxLength(
    value: string,
    max: number,
    fieldName: string
  ): ValidationResult {
    if (value && value.length > max) {
      return {
        isValid: false,
        error: `${fieldName} must be less than ${max} characters`,
        suggestions: [
          `Shorten your ${fieldName.toLowerCase()} to under ${max} characters`,
        ],
      };
    }
    return { isValid: true };
  }

  static pattern(
    value: string,
    pattern: RegExp,
    fieldName: string,
    example?: string
  ): ValidationResult {
    if (value && !pattern.test(value)) {
      return {
        isValid: false,
        error: `${fieldName} format is invalid`,
        suggestions: example
          ? [`Use format like: ${example}`]
          : [`Check ${fieldName.toLowerCase()} format`],
      };
    }
    return { isValid: true };
  }

  static range(
    value: number,
    min: number,
    max: number,
    fieldName: string
  ): ValidationResult {
    if (value < min || value > max) {
      return {
        isValid: false,
        error: `${fieldName} must be between ${min} and ${max}`,
        suggestions: [`Use a value between ${min} and ${max}`],
      };
    }
    return { isValid: true };
  }

  static oneOf<T>(
    value: T,
    allowedValues: T[],
    fieldName: string
  ): ValidationResult {
    if (!allowedValues.includes(value)) {
      return {
        isValid: false,
        error: `${fieldName} must be one of: ${allowedValues.join(', ')}`,
        suggestions: [`Use one of: ${allowedValues.join(', ')}`],
      };
    }
    return { isValid: true };
  }
}

/**
 * GitHub-specific validation rules
 */
export class GitHubValidator extends BaseValidator {
  static githubUsername(username: string): ValidationResult {
    const result = this.pattern(
      username,
      /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/,
      'GitHub username',
      'microsoft'
    );

    if (!result.isValid) {
      result.suggestions = [
        'Use alphanumeric characters and hyphens only',
        'Cannot start or end with hyphen',
        'Examples: microsoft, facebook, google',
      ];
    }

    return result;
  }

  static repositoryName(repoName: string): ValidationResult {
    const result = this.pattern(
      repoName,
      /^[a-zA-Z0-9._-]+$/,
      'Repository name',
      'my-awesome-repo'
    );

    if (!result.isValid) {
      result.suggestions = [
        'Use alphanumeric characters, dots, underscores, and hyphens',
        'Examples: vscode, react, tensorflow',
      ];
    }

    return result;
  }

  static ownerRepoFormat(value: string): ValidationResult {
    const result = this.pattern(
      value,
      /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]\/[a-zA-Z0-9._-]+$/,
      'Owner/Repository format',
      'microsoft/vscode'
    );

    if (!result.isValid) {
      result.suggestions = [
        'Use format: owner/repository',
        'Examples: microsoft/vscode, facebook/react',
      ];
    }

    return result;
  }

  static branchName(branchName: string): ValidationResult {
    const result = this.pattern(branchName, /^[^\s]+$/, 'Branch name', 'main');

    if (!result.isValid) {
      result.suggestions = [
        'Branch names cannot contain spaces',
        'Examples: main, develop, feature/new-feature',
      ];
    }

    return result;
  }

  static searchQuery(query: string): ValidationResult {
    // Check for required query
    const requiredResult = this.required(query, 'Search query');
    if (!requiredResult.isValid) return requiredResult;

    // Check length
    const lengthResult = this.maxLength(query, 1000, 'Search query');
    if (!lengthResult.isValid) return lengthResult;

    // Check for unmatched quotes
    const quoteCount = (query.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      return {
        isValid: false,
        error: 'Unmatched quotes in search query',
        suggestions: [
          'Ensure all quotes are properly paired',
          'Use quotes for exact phrases',
        ],
      };
    }

    // Check for invalid boolean operators
    const invalidBooleans = query.match(/\b(and|or|not)\b/g);
    if (invalidBooleans) {
      return {
        isValid: false,
        error: `Boolean operators must be uppercase: ${invalidBooleans.join(', ')}`,
        suggestions: ['Use AND, OR, NOT instead of and, or, not'],
      };
    }

    return { isValid: true };
  }

  static dateRange(dateRange: string): ValidationResult {
    const result = this.pattern(
      dateRange,
      /^[<>]=?\d{4}-\d{2}-\d{2}$/,
      'Date range',
      '>2020-01-01'
    );

    if (!result.isValid) {
      result.suggestions = [
        'Use format: >2020-01-01, <2023-12-31, >=2020-01-01',
        'Date format must be YYYY-MM-DD',
      ];
    }

    return result;
  }

  static starsRange(stars: string | number): ValidationResult {
    if (typeof stars === 'number') {
      return this.range(stars, 0, Number.MAX_SAFE_INTEGER, 'Stars');
    }

    const result = this.pattern(
      stars,
      /^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/,
      'Stars range',
      '>100'
    );

    if (!result.isValid) {
      result.suggestions = [
        'Use format: 100, >100, <50, >=5, <=1000, 10..100',
        'Examples: >100 for popular repos, 10..100 for specific range',
      ];
    }

    return result;
  }
}

/**
 * NPM-specific validation rules
 */
export class NPMValidator extends BaseValidator {
  static packageName(packageName: string): ValidationResult {
    // Check for required package name
    const requiredResult = this.required(packageName, 'Package name');
    if (!requiredResult.isValid) return requiredResult;

    // Check for valid NPM package name format
    const result = this.pattern(
      packageName,
      /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/,
      'NPM package name',
      'lodash'
    );

    if (!result.isValid) {
      result.suggestions = [
        'Use lowercase letters, numbers, hyphens, and dots',
        'Scoped packages: @scope/package-name',
        'Examples: lodash, @types/node, react-dom',
      ];
    }

    return result;
  }

  static searchKeywords(keywords: string): ValidationResult {
    // Check for required keywords
    const requiredResult = this.required(keywords, 'Search keywords');
    if (!requiredResult.isValid) return requiredResult;

    // Check length
    const lengthResult = this.maxLength(keywords, 200, 'Search keywords');
    if (!lengthResult.isValid) return lengthResult;

    // NPM search doesn't support boolean operators
    if (/\b(AND|OR|NOT)\b/i.test(keywords)) {
      return {
        isValid: false,
        error: 'NPM search does not support boolean operators',
        suggestions: [
          'Use simple space-separated keywords',
          'Examples: "react hooks", "typescript cli", "testing library"',
        ],
      };
    }

    return { isValid: true };
  }
}

/**
 * Validation composer for combining multiple validations
 */
export class ValidationComposer {
  private validations: (() => ValidationResult)[] = [];

  add(validation: () => ValidationResult): ValidationComposer {
    this.validations.push(validation);
    return this;
  }

  validate(): ValidationResult {
    for (const validation of this.validations) {
      const result = validation();
      if (!result.isValid) {
        return result;
      }
    }
    return { isValid: true };
  }
}

/**
 * Factory function for creating validation chains
 */
export const createValidation = (): ValidationComposer =>
  new ValidationComposer();
