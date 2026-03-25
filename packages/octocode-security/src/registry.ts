/**
 * SecurityRegistry — Central extensibility point for all security APIs.
 *
 * Users can add custom:
 *   - Secret detection patterns (regex)
 *   - Allowed commands
 *   - Ignored path/file patterns
 *
 * All security APIs read from the registry at call time, so extensions
 * take effect immediately after registration.
 *
 * @example
 * ```ts
 * import { securityRegistry } from '@octocode/security';
 *
 * // Add a custom secret pattern
 * securityRegistry.addSecretPatterns([{
 *   name: 'myInternalToken',
 *   description: 'Internal service token',
 *   regex: /\bMYCORP_[A-Z0-9]{32}\b/g,
 *   matchAccuracy: 'high',
 * }]);
 *
 * // Add a custom allowed command
 * securityRegistry.addAllowedCommands(['jq', 'yq']);
 *
 * // Add a custom ignored path
 * securityRegistry.addIgnoredPathPatterns([/^\.vault$/]);
 *
 * // Add a custom ignored file
 * securityRegistry.addIgnoredFilePatterns([/^internal[-_]secrets\.ya?ml$/]);
 * ```
 */

import type { SensitiveDataPattern } from './types.js';

/** Abstraction for the security registry (Dependency Inversion). */
export interface ISecurityRegistry {
  readonly extraSecretPatterns: readonly SensitiveDataPattern[];
  readonly extraAllowedCommands: readonly string[];
  readonly extraAllowedRoots: readonly string[];
  readonly extraIgnoredPathPatterns: readonly RegExp[];
  readonly extraIgnoredFilePatterns: readonly RegExp[];
  addSecretPatterns(patterns: SensitiveDataPattern[]): void;
  addAllowedCommands(commands: string[]): void;
  addAllowedRoots(roots: string[]): void;
  addIgnoredPathPatterns(patterns: RegExp[]): void;
  addIgnoredFilePatterns(patterns: RegExp[]): void;
  reset(): void;
}

export class SecurityRegistry implements ISecurityRegistry {
  private _extraSecretPatterns: SensitiveDataPattern[] = [];
  private _extraAllowedCommands: string[] = [];
  private _extraAllowedRoots: string[] = [];
  private _extraIgnoredPathPatterns: RegExp[] = [];
  private _extraIgnoredFilePatterns: RegExp[] = [];

  /** User-registered secret detection patterns. */
  get extraSecretPatterns(): readonly SensitiveDataPattern[] {
    return this._extraSecretPatterns;
  }

  /** User-registered allowed commands. */
  get extraAllowedCommands(): readonly string[] {
    return this._extraAllowedCommands;
  }

  /** User-registered additional root directories for path validation. */
  get extraAllowedRoots(): readonly string[] {
    return this._extraAllowedRoots;
  }

  /** User-registered ignored path patterns. */
  get extraIgnoredPathPatterns(): readonly RegExp[] {
    return this._extraIgnoredPathPatterns;
  }

  /** User-registered ignored file patterns. */
  get extraIgnoredFilePatterns(): readonly RegExp[] {
    return this._extraIgnoredFilePatterns;
  }

  /**
   * Register additional secret detection patterns.
   * These are merged with the built-in patterns at call time.
   */
  addSecretPatterns(patterns: SensitiveDataPattern[]): void {
    for (const p of patterns) {
      if (!p.name || !p.regex) {
        throw new Error('Each pattern must have a name and regex');
      }
    }
    this._extraSecretPatterns.push(...patterns);
  }

  /**
   * Register additional allowed commands for the command validator.
   * These are merged with the built-in allowed commands at call time.
   */
  addAllowedCommands(commands: string[]): void {
    for (const cmd of commands) {
      if (typeof cmd !== 'string' || cmd.trim() === '') {
        throw new Error('Each command must be a non-empty string');
      }
      if (!this._extraAllowedCommands.includes(cmd)) {
        this._extraAllowedCommands.push(cmd);
      }
    }
  }

  /**
   * Register additional root directories for path and execution context validation.
   * Use this to allow access to app-specific directories (e.g. cloned repos folder).
   */
  addAllowedRoots(roots: string[]): void {
    for (const root of roots) {
      if (typeof root !== 'string' || root.trim() === '') {
        throw new Error('Each root must be a non-empty string');
      }
      if (!this._extraAllowedRoots.includes(root)) {
        this._extraAllowedRoots.push(root);
      }
    }
  }

  /**
   * Register additional ignored path patterns.
   * These are checked alongside the built-in patterns in shouldIgnorePath().
   */
  addIgnoredPathPatterns(patterns: RegExp[]): void {
    this._extraIgnoredPathPatterns.push(...patterns);
  }

  /**
   * Register additional ignored file patterns.
   * These are checked alongside the built-in patterns in shouldIgnoreFile().
   */
  addIgnoredFilePatterns(patterns: RegExp[]): void {
    this._extraIgnoredFilePatterns.push(...patterns);
  }

  /** Remove all user-registered extensions. Useful for testing. */
  reset(): void {
    this._extraSecretPatterns = [];
    this._extraAllowedCommands = [];
    this._extraAllowedRoots = [];
    this._extraIgnoredPathPatterns = [];
    this._extraIgnoredFilePatterns = [];
  }
}

const GLOBAL_KEY = '__octocode_security_registry__';

/**
 * Global singleton registry. Uses globalThis to survive module duplication
 * (e.g. vitest transforms, dual ESM/CJS loading, or bundler code-splitting).
 */
export const securityRegistry: SecurityRegistry =
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] as SecurityRegistry ??
  ((globalThis as Record<string, unknown>)[GLOBAL_KEY] = new SecurityRegistry());
