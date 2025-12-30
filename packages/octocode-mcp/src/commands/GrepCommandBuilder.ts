/**
 * Command builder for grep (fallback when ripgrep is not available)
 * Maps RipgrepQuery parameters to grep equivalents where possible
 */

import { BaseCommandBuilder } from './BaseCommandBuilder.js';
import type { RipgrepQuery } from '../scheme/local_ripgrep.js';

/**
 * Maps ripgrep file types to glob patterns for grep --include
 */
const TYPE_TO_EXTENSIONS: Record<string, string[]> = {
  ts: ['ts', 'tsx'],
  js: ['js', 'jsx', 'mjs', 'cjs'],
  py: ['py', 'pyi'],
  rust: ['rs'],
  go: ['go'],
  java: ['java'],
  cpp: ['cpp', 'cc', 'cxx', 'hpp', 'h'],
  c: ['c', 'h'],
  css: ['css', 'scss', 'sass', 'less'],
  html: ['html', 'htm'],
  json: ['json'],
  yaml: ['yaml', 'yml'],
  md: ['md', 'markdown'],
  xml: ['xml'],
  sh: ['sh', 'bash', 'zsh'],
  rb: ['rb'],
  php: ['php'],
  swift: ['swift'],
  kt: ['kt', 'kts'],
  scala: ['scala'],
  sql: ['sql'],
  vim: ['vim'],
  lua: ['lua'],
  r: ['r', 'R'],
  dockerfile: ['Dockerfile'],
  make: ['Makefile', 'makefile', 'mk'],
};

/**
 * Features not supported by grep (will generate warnings)
 */
export interface GrepUnsupportedFeatures {
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
   * Build grep command from RipgrepQuery
   * Maps compatible options and ignores unsupported ones
   */
  fromQuery(query: RipgrepQuery): this {
    // Always recursive for directory searches
    this.addFlag('-r');

    // Pattern handling
    if (query.fixedString) {
      this.addFlag('-F');
    } else if (query.perlRegex) {
      // GNU grep supports -P, but macOS BSD grep does not
      // We'll try -E (extended regex) as a safer fallback
      this.addFlag('-E');
    }

    // Case sensitivity
    // Note: grep doesn't have smart case, so we fall back to case-insensitive
    if (query.caseInsensitive || query.smartCase) {
      this.addFlag('-i');
    }
    // caseSensitive is the default for grep, no flag needed

    // Word matching
    if (query.wholeWord) {
      this.addFlag('-w');
    }

    // Invert match
    if (query.invertMatch) {
      this.addFlag('-v');
    }

    // Context lines
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

    // Line numbers (always include for parsing)
    this.addFlag('-n');

    // Output modes
    if (query.filesOnly) {
      this.addFlag('-l');
    } else if (query.filesWithoutMatch) {
      this.addFlag('-L');
    } else if (query.count || query.countMatches) {
      // grep -c counts lines, not matches (different from ripgrep --count-matches)
      this.addFlag('-c');
    }

    // File type filtering (convert ripgrep type to grep --include)
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

    // Include patterns (glob filtering)
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

    // Binary files handling
    if (query.binaryFiles) {
      if (query.binaryFiles === 'text') {
        this.addFlag('-a'); // Treat binary as text
      } else if (query.binaryFiles === 'without-match') {
        this.addFlag('-I'); // Ignore binary files
      }
      // 'binary' mode has no direct grep equivalent
    } else {
      // Default: ignore binary files
      this.addFlag('-I');
    }

    // Follow symlinks (grep -r follows by default, use -R to not dereference)
    // Note: This is opposite of ripgrep behavior
    // query.followSymlinks = true means follow, which is grep's default with -r

    // Hidden files: grep searches hidden files by default with -r
    // No flag needed for hidden files

    // Color output disabled for parsing
    this.addOption('--color', 'never');

    // Show filename (needed for multi-file results)
    this.addFlag('-H');

    // Line-level regex match (like ripgrep -x)
    if (query.lineRegexp) {
      this.addFlag('-x');
    }

    // Add the pattern
    this.addArg(query.pattern);

    // Add the search path
    this.addArg(query.path);

    return this;
  }

  /**
   * Simple grep search builder
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
   * Case insensitive search
   */
  caseInsensitive(): this {
    this.addFlag('-i');
    return this;
  }

  /**
   * Files only (like ripgrep -l)
   */
  filesOnly(): this {
    this.addFlag('-l');
    return this;
  }

  /**
   * Add context lines
   */
  context(lines: number): this {
    this.addOption('-C', lines);
    return this;
  }

  /**
   * Include pattern
   */
  include(pattern: string): this {
    this.addOption('--include', pattern);
    return this;
  }

  /**
   * Exclude pattern
   */
  exclude(pattern: string): this {
    this.addOption('--exclude', pattern);
    return this;
  }

  /**
   * Exclude directory
   */
  excludeDir(dir: string): this {
    this.addOption('--exclude-dir', dir);
    return this;
  }

  /**
   * Fixed string search (no regex)
   */
  fixedString(): this {
    this.addFlag('-F');
    return this;
  }

  /**
   * Extended regex
   */
  extendedRegex(): this {
    this.addFlag('-E');
    return this;
  }
}
