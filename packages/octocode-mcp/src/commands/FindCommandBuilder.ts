import { BaseCommandBuilder } from './BaseCommandBuilder.js';
import type { FindFilesQuery } from '../utils/types.js';

export class FindCommandBuilder extends BaseCommandBuilder {
  constructor() {
    super('find');
  }

  fromQuery(query: FindFilesQuery): this {
    this.addArg(query.path);

    if (process.platform === 'linux') {
      this.addFlag('-O3');
    }

    // Depth constraints must come first (they apply globally)
    if (query.maxDepth !== undefined) {
      this.addOption('-maxdepth', query.maxDepth);
    }

    if (query.minDepth !== undefined) {
      this.addOption('-mindepth', query.minDepth);
    }

    // excludeDir prune clauses must come BEFORE other filters
    // Correct find syntax: find path (exclude) -prune -o (filters) -print0
    const hasExcludeDir = query.excludeDir && query.excludeDir.length > 0;
    if (hasExcludeDir) {
      // Add all prune clauses first
      this.addArg('(');
      query.excludeDir!.forEach((dir: string, index: number) => {
        if (index > 0) {
          this.addArg('-o');
        }
        this.addArg('-path');
        this.addArg(`*/${dir}`);
        this.addArg('-o');
        this.addArg('-path');
        this.addArg(`*/${dir}/*`);
      });
      this.addArg(')');
      this.addArg('-prune');
      this.addArg('-o');
    }

    // Check if we have any filters that need grouping
    const hasFilters = this.hasAnyFilter(query);

    // When using excludeDir with filters, we need to group the filters
    // to ensure they apply correctly after -prune -o
    if (hasExcludeDir && hasFilters) {
      this.addArg('(');
    }

    // Now add all the filters (these come AFTER -prune -o when excludeDir is used)
    if (query.type) {
      this.addOption('-type', query.type);
    }

    if (query.names && query.names.length > 0) {
      if (query.names.length === 1) {
        this.addOption('-name', query.names[0]!);
      } else {
        this.addArg('(');
        query.names.forEach((name: string, index: number) => {
          if (index > 0) {
            this.addArg('-o');
          }
          this.addOption('-name', name);
        });
        this.addArg(')');
      }
    } else if (query.name) {
      this.addOption('-name', query.name);
    }

    if (query.iname) {
      this.addOption('-iname', query.iname);
    }

    if (query.pathPattern) {
      this.addOption('-path', query.pathPattern);
    }

    if (query.regex) {
      if (query.regexType) {
        this.addOption('-regextype', query.regexType);
      }
      this.addOption('-regex', query.regex);
    }

    if (query.empty) {
      this.addFlag('-empty');
    }

    if (query.sizeGreater) {
      this.addOption('-size', `+${query.sizeGreater}`);
    }

    if (query.sizeLess) {
      this.addOption('-size', `-${query.sizeLess}`);
    }

    if (query.modifiedWithin) {
      const parsed = this.parseTimeString(query.modifiedWithin);
      this.addOption(parsed.unit, `-${parsed.value}`);
    }

    if (query.modifiedBefore) {
      const parsed = this.parseTimeString(query.modifiedBefore);
      this.addOption(parsed.unit, `+${parsed.value}`);
    }

    if (query.accessedWithin) {
      const parsed = this.parseTimeStringAccess(query.accessedWithin);
      this.addOption(parsed.unit, `-${parsed.value}`);
    }

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

    // Add -print0 and close grouping if needed
    this.addArg('-print0');

    if (hasExcludeDir && hasFilters) {
      this.addArg(')');
    }

    return this;
  }

  /**
   * Check if query has any filter conditions
   */
  private hasAnyFilter(query: FindFilesQuery): boolean {
    return !!(
      query.type ||
      query.name ||
      (query.names && query.names.length > 0) ||
      query.iname ||
      query.pathPattern ||
      query.regex ||
      query.empty ||
      query.sizeGreater ||
      query.sizeLess ||
      query.modifiedWithin ||
      query.modifiedBefore ||
      query.accessedWithin ||
      query.permissions ||
      query.executable ||
      query.readable ||
      query.writable
    );
  }

  simple(path: string, name: string): this {
    this.addArg(path);
    this.addOption('-name', name);
    return this;
  }

  type(type: 'f' | 'd' | 'l'): this {
    this.addOption('-type', type);
    return this;
  }

  name(pattern: string): this {
    this.addOption('-name', pattern);
    return this;
  }

  iname(pattern: string): this {
    this.addOption('-iname', pattern);
    return this;
  }

  maxDepth(depth: number): this {
    this.addOption('-maxdepth', depth);
    return this;
  }

  minDepth(depth: number): this {
    this.addOption('-mindepth', depth);
    return this;
  }

  size(size: string): this {
    this.addOption('-size', size);
    return this;
  }

  mtime(time: string): this {
    this.addOption('-mtime', time);
    return this;
  }

  path(path: string): this {
    this.addArg(path);
    return this;
  }

  /**
   * Parses time string and returns appropriate find flag
   * Hours use -mmin (minutes), days/weeks/months use -mtime (days)
   */
  private parseTimeString(timeStr: string): {
    value: number;
    unit: '-mtime' | '-mmin';
  } {
    const match = timeStr.match(/^(\d+)([hdwm])$/);
    if (!match || !match[1] || !match[2]) {
      return { value: 0, unit: '-mtime' };
    }

    const value = parseInt(match[1], 10);
    const timeUnit = match[2];

    switch (timeUnit) {
      case 'h':
        // Use -mmin for hours (converted to minutes)
        return { value: value * 60, unit: '-mmin' };
      case 'd':
        return { value, unit: '-mtime' };
      case 'w':
        return { value: value * 7, unit: '-mtime' };
      case 'm':
        return { value: value * 30, unit: '-mtime' };
      default:
        return { value, unit: '-mtime' };
    }
  }

  /**
   * Parses access time string (similar to mtime but uses -atime/-amin)
   */
  private parseTimeStringAccess(timeStr: string): {
    value: number;
    unit: '-atime' | '-amin';
  } {
    const match = timeStr.match(/^(\d+)([hdwm])$/);
    if (!match || !match[1] || !match[2]) {
      return { value: 0, unit: '-atime' };
    }

    const value = parseInt(match[1], 10);
    const timeUnit = match[2];

    switch (timeUnit) {
      case 'h':
        // Use -amin for hours (converted to minutes)
        return { value: value * 60, unit: '-amin' };
      case 'd':
        return { value, unit: '-atime' };
      case 'w':
        return { value: value * 7, unit: '-atime' };
      case 'm':
        return { value: value * 30, unit: '-atime' };
      default:
        return { value, unit: '-atime' };
    }
  }
}
