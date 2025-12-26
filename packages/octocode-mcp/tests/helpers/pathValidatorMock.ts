/**
 * Path Validator Mock for Testing
 *
 * Provides a fluent builder API for setting up path validation mocks.
 *
 * @example
 * ```typescript
 * const pvMock = createPathValidatorMock()
 *   .allowPath('/workspace')
 *   .allowPath('/workspace/src')
 *   .denyPath('/etc/passwd', 'Path outside workspace')
 *   .build();
 *
 * // Use in tests
 * vi.mocked(pathValidator.validate).mockImplementation(pvMock.validate);
 * ```
 */

import { vi } from 'vitest';
import type { PathValidationResult } from '../../src/utils/types.js';

/**
 * Path validator mock interface
 */
export interface PathValidatorMock {
  /** Mock implementation for pathValidator.validate */
  validate: (path: string) => PathValidationResult;

  /** Check if path is allowed */
  isAllowed: (path: string) => boolean;

  /** Get all allowed paths */
  getAllowedPaths: () => Set<string>;

  /** Get all denied paths with reasons */
  getDeniedPaths: () => Map<string, string>;
}

/**
 * Builder for creating path validator mocks
 */
export class PathValidatorMockBuilder {
  private allowedPaths: Set<string> = new Set();
  private deniedPaths: Map<string, string> = new Map();
  private allowedPrefixes: string[] = [];
  private defaultBehavior: 'allow' | 'deny' = 'allow';
  private sanitizeTransforms: Map<string, string> = new Map();

  /**
   * Allow a specific path
   */
  allowPath(path: string, sanitizedPath?: string): this {
    this.allowedPaths.add(path);
    if (sanitizedPath) {
      this.sanitizeTransforms.set(path, sanitizedPath);
    }
    return this;
  }

  /**
   * Allow all paths starting with prefix
   */
  allowPrefix(prefix: string): this {
    this.allowedPrefixes.push(prefix);
    return this;
  }

  /**
   * Deny a specific path with optional error message
   */
  denyPath(path: string, error?: string): this {
    this.deniedPaths.set(path, error ?? `Path '${path}' is not allowed`);
    return this;
  }

  /**
   * Set default behavior for unspecified paths
   */
  setDefault(behavior: 'allow' | 'deny'): this {
    this.defaultBehavior = behavior;
    return this;
  }

  /**
   * Add sanitization transform (path -> sanitizedPath)
   */
  sanitize(originalPath: string, sanitizedPath: string): this {
    this.sanitizeTransforms.set(originalPath, sanitizedPath);
    return this;
  }

  /**
   * Build the mock
   */
  build(): PathValidatorMock {
    const allowed = new Set(this.allowedPaths);
    const denied = new Map(this.deniedPaths);
    const prefixes = [...this.allowedPrefixes];
    const defaultBehavior = this.defaultBehavior;
    const transforms = new Map(this.sanitizeTransforms);

    const isAllowed = (path: string): boolean => {
      // Check explicit deny first
      if (denied.has(path)) return false;

      // Check explicit allow
      if (allowed.has(path)) return true;

      // Check prefixes
      for (const prefix of prefixes) {
        if (path.startsWith(prefix)) return true;
      }

      // Use default behavior
      return defaultBehavior === 'allow';
    };

    const validate = (path: string): PathValidationResult => {
      // Check if path is empty
      if (!path || path.trim() === '') {
        return {
          isValid: false,
          error: 'Path cannot be empty',
        };
      }

      // Check explicit deny
      if (denied.has(path)) {
        return {
          isValid: false,
          error: denied.get(path),
        };
      }

      // Check if allowed
      if (!isAllowed(path)) {
        return {
          isValid: false,
          error: `Path '${path}' is outside allowed directories`,
        };
      }

      // Path is valid
      const sanitized = transforms.get(path) ?? path;
      return {
        isValid: true,
        sanitizedPath: sanitized,
      };
    };

    return {
      validate,
      isAllowed,
      getAllowedPaths: () => new Set(allowed),
      getDeniedPaths: () => new Map(denied),
    };
  }
}

/**
 * Create a path validator mock with fluent builder API
 */
export function createPathValidatorMock(): PathValidatorMockBuilder {
  return new PathValidatorMockBuilder();
}

/**
 * Create a simple path validator mock that allows all paths
 */
export function createPermissivePathValidatorMock(): PathValidatorMock {
  return createPathValidatorMock().setDefault('allow').build();
}

/**
 * Create a workspace-restricted path validator mock
 *
 * @param workspaceRoot - The workspace root path
 */
export function createWorkspacePathValidatorMock(
  workspaceRoot: string
): PathValidatorMock {
  return createPathValidatorMock()
    .allowPrefix(workspaceRoot)
    .setDefault('deny')
    .denyPath('/etc/passwd', 'Path outside workspace')
    .denyPath('/etc/shadow', 'Path outside workspace')
    .denyPath('..', 'Path traversal not allowed')
    .build();
}

/**
 * Apply path validator mock to vitest mocked module
 *
 * @example
 * ```typescript
 * vi.mock('../../src/security/pathValidator.js', () => ({
 *   pathValidator: { validate: vi.fn() },
 * }));
 *
 * const pvMock = createPathValidatorMock().allowPrefix('/workspace').build();
 * applyPathValidatorMock(pathValidator, pvMock);
 * ```
 */
export function applyPathValidatorMock(
  mockModule: { pathValidator: { validate: ReturnType<typeof vi.fn> } },
  mock: PathValidatorMock
): void {
  mockModule.pathValidator.validate.mockImplementation(mock.validate);
}

/**
 * Create a mock implementation function for direct use with vi.mocked
 *
 * @example
 * ```typescript
 * vi.mocked(pathValidator.pathValidator.validate).mockImplementation(
 *   createPathValidatorImpl('/workspace')
 * );
 * ```
 */
export function createPathValidatorImpl(
  workspaceRoot: string
): (path: string) => PathValidationResult {
  const mock = createWorkspacePathValidatorMock(workspaceRoot);
  return mock.validate;
}
