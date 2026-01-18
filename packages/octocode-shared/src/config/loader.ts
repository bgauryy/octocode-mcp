/**
 * Configuration File Loader
 *
 * Handles loading and parsing of ~/.octocode/.octocoderc files.
 * Supports JSON5 format (JSON with comments and trailing commas).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HOME } from '../platform/index.js';
import type { OctocodeConfig, LoadConfigResult } from './types.js';
import { CONFIG_FILE_NAME } from './types.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Octocode configuration directory
 */
export const OCTOCODE_DIR = join(HOME, '.octocode');

/**
 * Full path to configuration file
 */
export const CONFIG_FILE_PATH = join(OCTOCODE_DIR, CONFIG_FILE_NAME);

// ============================================================================
// JSON5-LIKE PARSER
// ============================================================================

/**
 * Strip comments and trailing commas from JSON5-like content.
 * This is a lightweight parser that handles the most common JSON5 features
 * without requiring an external dependency.
 *
 * Supported features:
 * - Single-line comments (//)
 * - Multi-line comments (/* ... *\/)
 * - Trailing commas
 *
 * @param content - JSON5-like string content
 * @returns Standard JSON string
 */
function stripJson5Features(content: string): string {
  let result = '';
  let i = 0;
  let inString = false;
  let stringChar = '';

  while (i < content.length) {
    const char = content[i];
    const nextChar = content[i + 1];

    // Handle string literals (don't process comments inside strings)
    if (!inString && (char === '"' || char === "'")) {
      inString = true;
      stringChar = char;
      result += char;
      i++;
      continue;
    }

    if (inString) {
      result += char;
      // Check for escape sequences
      if (char === '\\' && i + 1 < content.length) {
        result += content[i + 1];
        i += 2;
        continue;
      }
      // Check for end of string
      if (char === stringChar) {
        inString = false;
      }
      i++;
      continue;
    }

    // Handle single-line comments
    if (char === '/' && nextChar === '/') {
      // Skip until end of line
      while (i < content.length && content[i] !== '\n') {
        i++;
      }
      continue;
    }

    // Handle multi-line comments
    if (char === '/' && nextChar === '*') {
      i += 2; // Skip /*
      while (i < content.length - 1) {
        if (content[i] === '*' && content[i + 1] === '/') {
          i += 2; // Skip */
          break;
        }
        i++;
      }
      continue;
    }

    result += char;
    i++;
  }

  // Remove trailing commas before ] or }
  result = result.replace(/,(\s*[}\]])/g, '$1');

  return result;
}

/**
 * Parse JSON5-like content to object.
 *
 * @param content - JSON5-like string content
 * @returns Parsed object
 * @throws Error if parsing fails
 */
function parseJson5(content: string): unknown {
  const jsonContent = stripJson5Features(content);
  return JSON.parse(jsonContent);
}

// ============================================================================
// LOADER FUNCTIONS
// ============================================================================

/**
 * Check if configuration file exists.
 *
 * @returns true if .octocoderc exists
 */
export function configExists(): boolean {
  return existsSync(CONFIG_FILE_PATH);
}

/**
 * Load raw .octocoderc file (async).
 * Returns null if file doesn't exist.
 *
 * @returns Loaded config result
 */
export async function loadConfig(): Promise<LoadConfigResult> {
  return loadConfigSync();
}

/**
 * Load raw .octocoderc file (sync).
 * Returns null if file doesn't exist.
 *
 * @returns Loaded config result
 */
export function loadConfigSync(): LoadConfigResult {
  const path = CONFIG_FILE_PATH;

  // Check if file exists
  if (!existsSync(path)) {
    return {
      success: false,
      error: 'Config file does not exist',
      path,
    };
  }

  try {
    // Read file content
    const content = readFileSync(path, 'utf-8');

    // Handle empty file
    if (!content.trim()) {
      return {
        success: true,
        config: {},
        path,
      };
    }

    // Parse JSON5-like content
    const parsed = parseJson5(content);

    // Validate it's an object
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {
        success: false,
        error: 'Config file must be a JSON object',
        path,
      };
    }

    return {
      success: true,
      config: parsed as OctocodeConfig,
      path,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: `Failed to parse config file: ${message}`,
      path,
    };
  }
}

/**
 * Get the path to the configuration file.
 *
 * @returns Full path to .octocoderc
 */
export function getConfigPath(): string {
  return CONFIG_FILE_PATH;
}

/**
 * Get the path to the octocode directory.
 *
 * @returns Full path to ~/.octocode
 */
export function getOctocodeDir(): string {
  return OCTOCODE_DIR;
}
