/**
 * Find command builder for file discovery
 */

import { BaseCommandBuilder } from './BaseCommandBuilder.js';
import type { FindFilesQuery } from '../types.js';

/**
 * Builder for find commands
 */
export class FindCommandBuilder extends BaseCommandBuilder {
  constructor() {
    super('find');
  }

  /**
   * Builds a find command from a find files query
   */
  fromQuery(query: FindFilesQuery): this {
    // Add the path (first argument for find)
    this.addArg(query.path);

    // Max depth
    if (query.maxDepth !== undefined) {
      this.addOption('-maxdepth', query.maxDepth);
    }

    // Min depth
    if (query.minDepth !== undefined) {
      this.addOption('-mindepth', query.minDepth);
    }

    // File type
    if (query.type) {
      this.addOption('-type', query.type);
    }

    // Multiple names with OR logic: find . \( -name "*.ts" -o -name "*.js" \)
    if (query.names && query.names.length > 0) {
      if (query.names.length === 1) {
        this.addOption('-name', query.names[0]);
      } else {
        this.addArg('(');
        query.names.forEach((name, index) => {
          if (index > 0) {
            this.addArg('-o');
          }
          this.addOption('-name', name);
        });
        this.addArg(')');
      }
    }
    // Single name (case-sensitive)
    else if (query.name) {
      this.addOption('-name', query.name);
    }

    // Name (case-insensitive)
    if (query.iname) {
      this.addOption('-iname', query.iname);
    }

    // Path pattern
    if (query.pathPattern) {
      this.addOption('-path', query.pathPattern);
    }

    // Regex with type specification
    if (query.regex) {
      if (query.regexType) {
        this.addOption('-regextype', query.regexType);
      }
      this.addOption('-regex', query.regex);
    }

    // Empty files or directories
    if (query.empty) {
      this.addFlag('-empty');
    }

    // Size filters
    if (query.sizeGreater) {
      this.addOption('-size', `+${query.sizeGreater}`);
    }

    if (query.sizeLess) {
      this.addOption('-size', `-${query.sizeLess}`);
    }

    // Time filters
    if (query.modifiedWithin) {
      this.addOption(
        '-mtime',
        `-${this.parseTimeString(query.modifiedWithin)}`
      );
    }

    if (query.modifiedBefore) {
      this.addOption(
        '-mtime',
        `+${this.parseTimeString(query.modifiedBefore)}`
      );
    }

    if (query.accessedWithin) {
      this.addOption(
        '-atime',
        `-${this.parseTimeString(query.accessedWithin)}`
      );
    }

    // Permission filters
    if (query.permissions) {
      this.addOption('-perm', query.permissions);
    }

    if (query.executable) {
      this.addFlag('-executable');
    }

    if (query.readable) {
      this.addFlag('-readable');
    }

    if (query.writable) {
      this.addFlag('-writable');
    }

    // Exclude directories with prune pattern
    if (query.excludeDir && query.excludeDir.length > 0) {
      for (const dir of query.excludeDir) {
        this.addArg('(');
        this.addArg('-path');
        this.addArg(`*/${dir}`);
        this.addArg('-o');
        this.addArg('-path');
        this.addArg(`*/${dir}/*`);
        this.addArg(')');
        this.addArg('-prune');
        this.addArg('-o');
      }
      // Add final -print to show non-excluded results
      this.addArg('-print');
    }

    return this;
  }

  /**
   * Simple file search by name
   */
  simple(path: string, name: string): this {
    this.addArg(path);
    this.addOption('-name', name);
    return this;
  }

  /**
   * Find files by type
   */
  type(type: 'f' | 'd' | 'l'): this {
    this.addOption('-type', type);
    return this;
  }

  /**
   * Find by name pattern
   */
  name(pattern: string): this {
    this.addOption('-name', pattern);
    return this;
  }

  /**
   * Find by name pattern (case-insensitive)
   */
  iname(pattern: string): this {
    this.addOption('-iname', pattern);
    return this;
  }

  /**
   * Set max depth
   */
  maxDepth(depth: number): this {
    this.addOption('-maxdepth', depth);
    return this;
  }

  /**
   * Set min depth
   */
  minDepth(depth: number): this {
    this.addOption('-mindepth', depth);
    return this;
  }

  /**
   * Find by size
   */
  size(size: string): this {
    this.addOption('-size', size);
    return this;
  }

  /**
   * Find by modification time
   */
  mtime(time: string): this {
    this.addOption('-mtime', time);
    return this;
  }

  /**
   * Set the search path
   */
  path(path: string): this {
    this.addArg(path);
    return this;
  }

  /**
   * Parse time string to days (e.g., "7d" -> 7, "2h" -> 0.08)
   */
  private parseTimeString(timeStr: string): number {
    const match = timeStr.match(/^(\d+)([hdwm])$/);
    if (!match) {
      return 0;
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 'h':
        return Math.round(value / 24);
      case 'd':
        return value;
      case 'w':
        return value * 7;
      case 'm':
        return value * 30;
      default:
        return value;
    }
  }
}
