import { BaseCommandBuilder } from './BaseCommandBuilder.js';
import type { FindFilesQuery } from '../utils/types.js';

export class FindCommandBuilder extends BaseCommandBuilder {
  private isMacOS: boolean;
  private isLinux: boolean;
  private isWindows: boolean;

  constructor() {
    super('find');
    this.isMacOS = process.platform === 'darwin';
    this.isLinux = process.platform === 'linux';
    this.isWindows = process.platform === 'win32';
  }

  fromQuery(query: FindFilesQuery): this {
    // Windows is not supported - find command doesn't exist
    if (this.isWindows) {
      throw new Error(
        'Windows is not supported for localFindFiles. Use localViewStructure or localSearchCode instead.'
      );
    }

    // macOS requires -E flag BEFORE path for extended regex
    if (this.isMacOS && query.regex) {
      this.addFlag('-E');
    }

    this.addArg(query.path);

    if (this.isLinux) {
      this.addFlag('-O3');
    }

    if (query.maxDepth !== undefined) {
      this.addOption('-maxdepth', query.maxDepth);
    }

    if (query.minDepth !== undefined) {
      this.addOption('-mindepth', query.minDepth);
    }

    const hasExcludeDir = query.excludeDir && query.excludeDir.length > 0;
    if (hasExcludeDir) {
      this.buildExcludeDirPrune(query.excludeDir!);
      this.addArg('-o'); // Connect prune to filters with OR
    }

    this.addFilters(query);
    this.addArg('-print0');

    return this;
  }

  /**
   * Builds the excludeDir prune block:
   * ( -path "*\/dir" -o -path "*\/dir/*" ) -prune
   * Repeated for each directory
   */
  private buildExcludeDirPrune(excludeDirs: string[]): void {
    this.addArg('(');
    excludeDirs.forEach((dir, index) => {
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
  }

  /**
   * Adds all filter options (type, names, size, time, etc.)
   * These must come AFTER the prune block when excludeDir is used
   */
  private addFilters(query: FindFilesQuery): void {
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
      if (this.isLinux && query.regexType) {
        // GNU find uses -regextype
        this.addOption('-regextype', query.regexType);
      }
      // macOS -E flag was added at the beginning
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
      if (this.isLinux) {
        this.addFlag('-executable');
      } else {
        // macOS: use -perm +111 (any execute bit)
        this.addOption('-perm', '+111');
      }
    }

    if (query.readable) {
      if (this.isLinux) {
        this.addFlag('-readable');
      } else {
        // macOS: use -perm +444 (any read bit)
        this.addOption('-perm', '+444');
      }
    }

    if (query.writable) {
      if (this.isLinux) {
        this.addFlag('-writable');
      } else {
        // macOS: use -perm +222 (any write bit)
        this.addOption('-perm', '+222');
      }
    }
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
