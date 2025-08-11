/**
 * Translation Management System
 *
 * GitHub MCP-compatible translation system supporting JSON config files
 * and environment variable overrides for tool descriptions and messages.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';

export type TranslationHelperFunc = (
  key: string,
  defaultValue: string
) => string;

interface TranslationMap {
  [key: string]: string;
}

export class TranslationManager {
  private static translations: TranslationMap = {};
  private static initialized = false;
  private static configPath = './octocode-mcp-config.json';

  /**
   * Initialize translation system
   */
  static initialize(): TranslationHelperFunc {
    if (this.initialized) {
      return this.getTranslationHelper();
    }

    this.initialized = true;
    this.loadTranslations();

    return this.getTranslationHelper();
  }

  /**
   * Get translation helper function
   */
  static getTranslationHelper(): TranslationHelperFunc {
    return (key: string, defaultValue: string): string => {
      const upperKey = key.toUpperCase();

      // Check if already cached
      if (this.translations[upperKey]) {
        return this.translations[upperKey];
      }

      // Check environment variable (highest priority)
      const envKey = `OCTOCODE_MCP_${upperKey}`;
      const envValue = process.env[envKey];
      if (envValue) {
        this.translations[upperKey] = envValue;
        return envValue;
      }

      // Use default value and cache it
      this.translations[upperKey] = defaultValue;
      return defaultValue;
    };
  }

  /**
   * Export current translations to config file
   */
  static exportTranslations(): void {
    try {
      const exportData: TranslationMap = {};

      // Include all current translations
      for (const [key, value] of Object.entries(this.translations)) {
        exportData[key] = value;
      }

      // Add default tool descriptions
      const defaultTranslations = this.getDefaultTranslations();
      for (const [key, value] of Object.entries(defaultTranslations)) {
        if (!exportData[key]) {
          exportData[key] = value;
        }
      }

      writeFileSync(
        this.configPath,
        JSON.stringify(exportData, null, 2),
        'utf8'
      );
      // TODO: LOG
      //console.log(`Translations exported to ${this.configPath}`);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Could not export translations:', error);
    }
  }

  /**
   * Load translations from config file
   */
  private static loadTranslations(): void {
    try {
      if (existsSync(this.configPath)) {
        const configData = readFileSync(this.configPath, 'utf8');
        const loadedTranslations = JSON.parse(configData);

        // Merge with existing translations
        this.translations = { ...this.translations, ...loadedTranslations };
      }
    } catch (error) {
      // Config file not found or invalid - continue with defaults
      // TODO: LOG
      //console.warn(
      //  'Could not load translation config:',
      //  error instanceof Error ? error.message : 'Unknown error'
      //);
    }
  }

  /**
   * Get default translations for all tools
   */
  private static getDefaultTranslations(): TranslationMap {
    return {
      // Tool descriptions
      TOOL_GITHUB_SEARCH_CODE_DESCRIPTION:
        'Search code across GitHub repositories with advanced filtering',
      TOOL_GITHUB_FETCH_CONTENT_DESCRIPTION:
        'Fetch file contents from GitHub repositories',
      TOOL_GITHUB_SEARCH_REPOSITORIES_DESCRIPTION:
        'Search GitHub repositories with comprehensive filtering',
      TOOL_GITHUB_SEARCH_COMMITS_DESCRIPTION:
        'Search commit history across GitHub repositories',
      TOOL_GITHUB_SEARCH_PULL_REQUESTS_DESCRIPTION:
        'Search pull requests with detailed filtering options',
      TOOL_GITHUB_VIEW_REPO_STRUCTURE_DESCRIPTION:
        'View repository structure and file organization',
      TOOL_PACKAGE_SEARCH_DESCRIPTION:
        'Search NPM and Python packages with metadata',

      // Parameter descriptions
      PARAM_OWNER_DESCRIPTION: 'Repository owner (username or organization)',
      PARAM_REPO_DESCRIPTION: 'Repository name',
      PARAM_QUERY_DESCRIPTION: 'Search query string',
      PARAM_LIMIT_DESCRIPTION: 'Maximum number of results to return',
      PARAM_FILE_PATH_DESCRIPTION: 'Path to file within repository',

      // Error messages
      ERROR_TOKEN_NOT_FOUND:
        'No GitHub token found. Please set GITHUB_TOKEN environment variable or authenticate with GitHub CLI',
      ERROR_RATE_LIMIT_EXCEEDED:
        'GitHub API rate limit exceeded. Please try again later',
      ERROR_REPOSITORY_NOT_FOUND: 'Repository not found or access denied',
      ERROR_ORGANIZATION_ACCESS_DENIED:
        'Access denied to organization resources',

      // Enterprise messages
      ENTERPRISE_AUDIT_ENABLED: 'Enterprise audit logging is enabled',
      ENTERPRISE_RATE_LIMIT_APPLIED: 'Enterprise rate limiting is active',
      ENTERPRISE_ORG_VALIDATION_ENABLED:
        'Organization access validation is enabled',

      // Success messages
      SUCCESS_TOOL_EXECUTED: 'Tool executed successfully',
      SUCCESS_ENTERPRISE_INITIALIZED:
        'Enterprise features initialized successfully',
    };
  }

  /**
   * Clear all translations (for testing)
   */
  static clearTranslations(): void {
    this.translations = {};
    this.initialized = false;
  }

  /**
   * Get current translations
   */
  static getTranslations(): TranslationMap {
    return { ...this.translations };
  }
}

// Export convenience functions
export function initializeTranslations(): TranslationHelperFunc {
  return TranslationManager.initialize();
}

export function exportTranslations(): void {
  TranslationManager.exportTranslations();
}

export function getTranslation(key: string, defaultValue: string): string {
  const helper = TranslationManager.getTranslationHelper();
  return helper(key, defaultValue);
}

// Default translation helper (null pattern)
export function nullTranslationHelper(
  _key: string,
  defaultValue: string
): string {
  return defaultValue;
}
