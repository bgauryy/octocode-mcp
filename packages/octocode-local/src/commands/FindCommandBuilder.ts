import { BaseCommandBuilder } from './BaseCommandBuilder.js';
import type { FindFilesQuery } from '../types.js';

export class FindCommandBuilder extends BaseCommandBuilder {
  constructor() {
    super('find');
  }

  fromQuery(query: FindFilesQuery): this {
    this.addArg(query.path);

    if (process.platform === 'linux') {
      this.addFlag('-O3');
    }

    if (query.maxDepth !== undefined) {
      this.addOption('-maxdepth', query.maxDepth);
    }

    if (query.minDepth !== undefined) {
      this.addOption('-mindepth', query.minDepth);
    }

    if (query.type) {
      this.addOption('-type', query.type);
    }

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
      const { value, unit } = this.parseTime(query.modifiedWithin);
      this.addOption(unit === 'min' ? '-mmin' : '-mtime', `-${value}`);
    }

    if (query.modifiedBefore) {
      const { value, unit } = this.parseTime(query.modifiedBefore);
      this.addOption(unit === 'min' ? '-mmin' : '-mtime', `+${value}`);
    }

    if (query.accessedWithin) {
      const { value, unit } = this.parseTime(query.accessedWithin);
      this.addOption(unit === 'min' ? '-amin' : '-atime', `-${value}`);
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
      this.addArg('-print0');
    } else {
      this.addArg('-print0');
    }

    return this;
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

  private parseTime(timeStr: string): { value: number; unit: 'min' | 'day' } {
    const match = timeStr.match(/^(\d+)([hdwm])$/);
    if (!match) {
      return { value: 0, unit: 'day' };
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 'm': // minutes
        return { value: value, unit: 'min' };
      case 'h': // hours
        return { value: value * 60, unit: 'min' };
      case 'd': // days
        return { value: value, unit: 'day' };
      case 'w': // weeks
        return { value: value * 7, unit: 'day' };
      default:
        return { value: value, unit: 'day' };
    }
  }
}
