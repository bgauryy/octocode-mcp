/**
 * Grep command builder for constructing search commands
 */

import { BaseCommandBuilder } from './BaseCommandBuilder.js';
import type { SearchContentQuery } from '../types.js';

/**
 * Builder for grep commands
 */
export class GrepCommandBuilder extends BaseCommandBuilder {
  constructor() {
    super('grep');
  }

  /**
   * Builds a grep command from a search content query
   */
  fromQuery(query: SearchContentQuery): this {
    // Always recursive for directory search (unless following symlinks)
    if (query.followSymlinks) {
      this.addFlag('-R'); // Follow symlinks
    } else {
      this.addFlag('-r'); // Don't follow symlinks
    }

    // Search mode selection (mutually exclusive)
    if (query.fixedString) {
      // Fixed string search (fastest, no regex interpretation)
      this.addFlag('-F');
    } else if (query.perlRegex) {
      // Perl-compatible regex
      this.addFlag('-P');
    } else if (query.regex) {
      // Extended regex
      this.addFlag('-E');
    }

    // Case handling
    if (query.smartCase) {
      // Smart case: case-insensitive if pattern is lowercase
      const hasUpperCase = /[A-Z]/.test(query.pattern);
      if (!hasUpperCase) {
        this.addFlag('-i');
      }
    } else if (query.caseInsensitive) {
      this.addFlag('-i');
    }

    // Whole word match
    if (query.wholeWord) {
      this.addFlag('-w');
    }

    // Invert match
    if (query.invertMatch) {
      this.addFlag('-v');
    }

    // Binary file handling
    if (query.binaryFiles) {
      this.addOption('--binary-files', query.binaryFiles);
    } else {
      // Default: skip binary files
      this.addOption('--binary-files', 'without-match');
    }

    // Line numbers
    if (query.lineNumbers !== false) {
      // Default to showing line numbers for better context
      this.addFlag('-n');
    }

    // Output mode (mutually exclusive)
    if (query.filesOnly) {
      this.addFlag('-l'); // List matching files
    } else if (query.filesWithoutMatch) {
      this.addFlag('-L'); // List non-matching files
    } else if (query.count) {
      this.addFlag('-c'); // Count matches per file
    }

    // Max count per file
    if (query.maxCount !== undefined && query.maxCount > 0) {
      this.addOption('-m', query.maxCount);
    }

    // Context lines (priority: contextLines > before/after specific)
    if (query.contextLines !== undefined && query.contextLines > 0) {
      this.addOption('-C', query.contextLines);
    } else {
      // Before lines
      if (query.beforeLines !== undefined && query.beforeLines > 0) {
        this.addOption('-B', query.beforeLines);
      }
      // After lines
      if (query.afterLines !== undefined && query.afterLines > 0) {
        this.addOption('-A', query.afterLines);
      }
    }

    // Include patterns
    if (query.include && query.include.length > 0) {
      for (const pattern of query.include) {
        this.addOption('--include', pattern);
      }
    }

    // Exclude patterns
    if (query.exclude && query.exclude.length > 0) {
      for (const pattern of query.exclude) {
        this.addOption('--exclude', pattern);
      }
    }

    // Exclude directories
    if (query.excludeDir && query.excludeDir.length > 0) {
      for (const dir of query.excludeDir) {
        this.addOption('--exclude-dir', dir);
      }
    }

    // Add the pattern
    this.addArg(query.pattern);

    // Add the path
    this.addArg(query.path);

    return this;
  }

  /**
   * Builds a simple grep command
   */
  simple(pattern: string, path: string): this {
    this.addFlag('-r');
    this.addFlag('-n');
    this.addArg(pattern);
    this.addArg(path);
    return this;
  }

  /**
   * Sets case insensitive search
   */
  caseInsensitive(): this {
    this.addFlag('-i');
    return this;
  }

  /**
   * Sets line number display
   */
  lineNumbers(): this {
    this.addFlag('-n');
    return this;
  }

  /**
   * Sets context lines
   */
  context(lines: number): this {
    this.addOption('-C', lines);
    return this;
  }

  /**
   * Sets recursive search
   */
  recursive(): this {
    this.addFlag('-r');
    return this;
  }

  /**
   * Sets file pattern to include
   */
  include(pattern: string): this {
    this.addOption('--include', pattern);
    return this;
  }

  /**
   * Sets file pattern to exclude
   */
  exclude(pattern: string): this {
    this.addOption('--exclude', pattern);
    return this;
  }

  /**
   * Sets directory to exclude
   */
  excludeDir(dir: string): this {
    this.addOption('--exclude-dir', dir);
    return this;
  }

  /**
   * Sets the search pattern
   */
  pattern(pattern: string): this {
    this.addArg(pattern);
    return this;
  }

  /**
   * Sets the search path
   */
  path(path: string): this {
    this.addArg(path);
    return this;
  }

  /**
   * Lists matching files only
   */
  filesOnly(): this {
    this.addFlag('-l');
    return this;
  }
}
