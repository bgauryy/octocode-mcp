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
  readonly version: number;
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
  private _version = 0;

  /** Monotonic counter incremented on every mutation. Used for cache invalidation. */
  get version(): number {
    return this._version;
  }

  /** User-registered secret detection patterns (frozen copy). */
  get extraSecretPatterns(): readonly SensitiveDataPattern[] {
    return Object.freeze([...this._extraSecretPatterns]);
  }

  /** User-registered allowed commands (frozen copy). */
  get extraAllowedCommands(): readonly string[] {
    return Object.freeze([...this._extraAllowedCommands]);
  }

  /** User-registered additional root directories (frozen copy). */
  get extraAllowedRoots(): readonly string[] {
    return Object.freeze([...this._extraAllowedRoots]);
  }

  /** User-registered ignored path patterns (frozen copy). */
  get extraIgnoredPathPatterns(): readonly RegExp[] {
    return Object.freeze([...this._extraIgnoredPathPatterns]);
  }

  /** User-registered ignored file patterns (frozen copy). */
  get extraIgnoredFilePatterns(): readonly RegExp[] {
    return Object.freeze([...this._extraIgnoredFilePatterns]);
  }

  /**
   * Register additional secret detection patterns.
   * Deduplicates by pattern name — duplicate names are silently skipped.
   */
  addSecretPatterns(patterns: SensitiveDataPattern[]): void {
    for (const p of patterns) {
      if (!p.name || !p.regex) {
        throw new Error('Each pattern must have a name and regex');
      }
      if (!this._extraSecretPatterns.some(e => e.name === p.name)) {
        this._extraSecretPatterns.push(p);
      }
    }
    this._version++;
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
    this._version++;
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
    this._version++;
  }

  /**
   * Register additional ignored path patterns.
   * Deduplicates by regex source — duplicate sources are silently skipped.
   */
  addIgnoredPathPatterns(patterns: RegExp[]): void {
    for (const p of patterns) {
      if (!this._extraIgnoredPathPatterns.some(e => e.source === p.source)) {
        this._extraIgnoredPathPatterns.push(p);
      }
    }
    this._version++;
  }

  /**
   * Register additional ignored file patterns.
   * Deduplicates by regex source — duplicate sources are silently skipped.
   */
  addIgnoredFilePatterns(patterns: RegExp[]): void {
    for (const p of patterns) {
      if (!this._extraIgnoredFilePatterns.some(e => e.source === p.source)) {
        this._extraIgnoredFilePatterns.push(p);
      }
    }
    this._version++;
  }

  /** Remove all user-registered extensions. Useful for testing. */
  reset(): void {
    this._extraSecretPatterns = [];
    this._extraAllowedCommands = [];
    this._extraAllowedRoots = [];
    this._extraIgnoredPathPatterns = [];
    this._extraIgnoredFilePatterns = [];
    this._version++;
  }
}

const GLOBAL_KEY = '__octocode_security_registry__';

/**
 * Global singleton registry. Uses globalThis to survive module duplication
 * (e.g. vitest transforms, dual ESM/CJS loading, or bundler code-splitting).
 */
export const securityRegistry: SecurityRegistry =
  ((globalThis as Record<string, unknown>)[GLOBAL_KEY] as SecurityRegistry) ??
  ((globalThis as Record<string, unknown>)[GLOBAL_KEY] =
    new SecurityRegistry());
