/**
 * Ls command builder for directory listing
 */

import { BaseCommandBuilder } from './BaseCommandBuilder.js';
import type { ViewStructureQuery } from '../types.js';

/**
 * Builder for ls commands
 */
export class LsCommandBuilder extends BaseCommandBuilder {
  constructor() {
    super('ls');
  }

  /**
   * Builds an ls command from a view structure query
   */
  fromQuery(query: ViewStructureQuery): this {
    // Detailed listing
    if (query.details) {
      this.addFlag('-l');
    }

    // Show hidden files
    if (query.hidden) {
      this.addFlag('-a');
    }

    // Human-readable sizes
    if (query.humanReadable) {
      this.addFlag('-h');
    }

    // Recursive
    if (query.recursive) {
      this.addFlag('-R');
    }

    // Reverse sort
    if (query.reverse) {
      this.addFlag('-r');
    }

    // Sort by option
    if (query.sortBy) {
      switch (query.sortBy) {
        case 'size':
          this.addFlag('-S');
          break;
        case 'time':
          this.addFlag('-t');
          break;
        case 'extension':
          this.addFlag('-X');
          break;
        case 'name':
        default:
          // Default sort is by name
          break;
      }
    }

    // Directories only - don't use -d flag, filter after parsing instead
    // The -d flag lists the directory itself, not its contents

    // Add the path
    this.addArg(query.path);

    return this;
  }

  /**
   * Simple directory listing
   */
  simple(path: string): this {
    this.addArg(path);
    return this;
  }

  /**
   * Detailed listing with long format
   */
  detailed(): this {
    this.addFlag('-l');
    return this;
  }

  /**
   * Show hidden files
   */
  all(): this {
    this.addFlag('-a');
    return this;
  }

  /**
   * Human-readable file sizes
   */
  humanReadable(): this {
    this.addFlag('-h');
    return this;
  }

  /**
   * Recursive listing
   */
  recursive(): this {
    this.addFlag('-R');
    return this;
  }

  /**
   * Sort by size
   */
  sortBySize(): this {
    this.addFlag('-S');
    return this;
  }

  /**
   * Sort by time
   */
  sortByTime(): this {
    this.addFlag('-t');
    return this;
  }

  /**
   * Reverse sort order
   */
  reverse(): this {
    this.addFlag('-r');
    return this;
  }

  /**
   * Set the path to list
   */
  path(path: string): this {
    this.addArg(path);
    return this;
  }
}
