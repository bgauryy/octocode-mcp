/**
 * Command builder for grep (fallback when ripgrep is not available)
 * Maps RipgrepQuery parameters to grep equivalents where possible
 */

import { BaseCommandBuilder } from './BaseCommandBuilder.js';
import type { RipgrepQuery } from '../scheme/local_ripgrep.js';
import { TYPE_TO_EXTENSIONS } from '../utils/file/types.js';

/**
 * Features not supported by grep (will generate warnings)
 */
interface GrepUnsupportedFeatures {
  smartCase: boolean;
  multiline: boolean;
  countMatches: boolean;
  jsonOutput: boolean;
  sortOptions: boolean;
  threads: boolean;
  mmap: boolean;
  stats: boolean;
  gitignore: boolean;
}

/**
 * Check which features are unsupported when using grep
 */
export function getUnsupportedGrepFeatures(
  query: RipgrepQuery
): GrepUnsupportedFeatures {
  return {
    smartCase: query.smartCase === true,
    multiline: query.multiline === true,
    countMatches: query.countMatches === true,
    jsonOutput: query.jsonOutput === true,
    sortOptions: query.sort !== undefined && query.sort !== 'path',
    threads: query.threads !== undefined,
    mmap: query.mmap !== undefined,
    stats: query.includeStats === true,
    gitignore: !query.noIgnore, // grep doesn't respect .gitignore
  };
}

/**
 * Generate warnings for unsupported grep features
 */
export function getGrepFeatureWarnings(query: RipgrepQuery): string[] {
  const warnings: string[] = [];
  const unsupported = getUnsupportedGrepFeatures(query);

  if (unsupported.smartCase) {
    warnings.push(
      'smartCase not supported by grep - using case-insensitive search (-i)'
    );
  }

  if (unsupported.multiline) {
    warnings.push(
      'multiline patterns not supported by grep - feature disabled'
    );
  }

  if (unsupported.countMatches) {
    warnings.push(
      'countMatches not supported by grep - using line count (-c) instead'
    );
  }

  if (unsupported.sortOptions) {
    warnings.push(
      `sort="${query.sort}" not supported by grep - results will be in file order`
    );
  }

  if (unsupported.gitignore) {
    warnings.push(
      'grep does not respect .gitignore - all files will be searched'
    );
  }

  if (unsupported.stats) {
    warnings.push(
      'includeStats not supported by grep - stats will not be available'
    );
  }

  return warnings;
}

export class GrepCommandBuilder extends BaseCommandBuilder {
  constructor() {
    super('grep');
  }

  /**
   * Simple convenience method to set pattern and path with default flags
   */
  simple(pattern: string, path: string): this {
    this.addFlag('-r');
    this.addFlag('-n');
    this.addFlag('-H');
    this.addFlag('-I');
    this.addOption('--color', 'never');
    this.addArg(pattern);
    this.addArg(path);
    return this;
  }

  /**
   * Enable case-insensitive search
   */
  caseInsensitive(): this {
    this.addFlag('-i');
    return this;
  }

  /**
   * Only show filenames with matches
   */
  filesOnly(): this {
    this.addFlag('-l');
    return this;
  }

  /**
   * Show context lines around matches
   */
  context(lines: number): this {
    this.addOption('-C', lines);
    return this;
  }

  /**
   * Include only files matching pattern
   */
  include(pattern: string): this {
    this.addOption('--include', pattern);
    return this;
  }

  /**
   * Exclude files matching pattern
   */
  exclude(pattern: string): this {
    this.addOption('--exclude', pattern);
    return this;
  }

  /**
   * Exclude directory from search
   */
  excludeDir(dir: string): this {
    this.addOption('--exclude-dir', dir);
    return this;
  }

  /**
   * Treat pattern as fixed string (not regex)
   */
  fixedString(): this {
    this.addFlag('-F');
    return this;
  }

  /**
   * Build grep command from RipgrepQuery
   * Maps compatible options and ignores unsupported ones
   */
  fromQuery(query: RipgrepQuery): this {
    this.addFlag('-r');

    if (query.fixedString) {
      this.addFlag('-F');
    } else if (query.perlRegex) {
      // GNU grep supports -P, but macOS BSD grep does not
      // We'll try -E (extended regex) as a safer fallback
      this.addFlag('-E');
    }

    if (query.caseInsensitive || query.smartCase) {
      this.addFlag('-i');
    }

    if (query.wholeWord) {
      this.addFlag('-w');
    }

    if (query.invertMatch) {
      this.addFlag('-v');
    }

    if (query.contextLines !== undefined && query.contextLines > 0) {
      this.addOption('-C', query.contextLines);
    } else {
      if (query.beforeContext !== undefined && query.beforeContext > 0) {
        this.addOption('-B', query.beforeContext);
      }
      if (query.afterContext !== undefined && query.afterContext > 0) {
        this.addOption('-A', query.afterContext);
      }
    }

    this.addFlag('-n');

    if (query.filesOnly) {
      this.addFlag('-l');
    } else if (query.filesWithoutMatch) {
      this.addFlag('-L');
    } else if (query.count || query.countMatches) {
      // grep -c counts lines, not matches (different from ripgrep --count-matches)
      this.addFlag('-c');
    }

    if (query.type) {
      const extensions = TYPE_TO_EXTENSIONS[query.type];
      if (extensions) {
        for (const ext of extensions) {
          this.addOption('--include', `*.${ext}`);
        }
      } else {
        // Unknown type, try as extension directly
        this.addOption('--include', `*.${query.type}`);
      }
    }

    if (query.include && query.include.length > 0) {
      for (const pattern of query.include) {
        this.addOption('--include', pattern);
      }
    }

    if (query.exclude && query.exclude.length > 0) {
      for (const pattern of query.exclude) {
        this.addOption('--exclude', pattern);
      }
    }

    if (query.excludeDir && query.excludeDir.length > 0) {
      for (const dir of query.excludeDir) {
        this.addOption('--exclude-dir', dir);
      }
    }

    if (query.binaryFiles) {
      if (query.binaryFiles === 'text') {
        this.addFlag('-a');
      } else if (query.binaryFiles === 'without-match') {
        this.addFlag('-I');
      }
    } else {
      this.addFlag('-I');
    }

    this.addOption('--color', 'never');
    this.addFlag('-H');

    if (query.lineRegexp) {
      this.addFlag('-x');
    }

    this.addArg(query.pattern);
    this.addArg(query.path);

    return this;
  }
}
