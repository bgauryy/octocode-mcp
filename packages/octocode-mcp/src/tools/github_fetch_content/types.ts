/**
 * Types for github_fetch_content tool (githubGetFileContent)
 * @module tools/github_fetch_content/types
 */

import type { PaginationInfo } from '../../utils/core/types.js';

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Content fetch type: file (default) or directory.
 * When 'directory', the tool fetches all files in the directory,
 * saves them to disk (like clone), and returns a localPath.
 */
export type ContentFetchType = 'file' | 'directory';

/**
 * Query parameters for fetching GitHub file content
 */
export interface FileContentQuery {
  owner: string;
  repo: string;
  path: string;
  branch?: string;
  /** Fetch type: 'file' (default) returns content inline; 'directory' saves to disk and returns localPath */
  type?: ContentFetchType;
  fullContent?: boolean;
  startLine?: number;
  endLine?: number;
  matchString?: string;
  matchStringContextLines?: number;
  charOffset?: number;
  charLength?: number;
  noTimestamp?: boolean;
  /** When true, bypass the cache and force a fresh fetch */
  forceRefresh?: boolean;
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
}

// ============================================================================
// OUTPUT TYPES
// ============================================================================

/** File content result data */
export interface ContentResultData {
  owner?: string;
  repo?: string;
  path?: string;
  content?: string;
  branch?: string;
  startLine?: number;
  endLine?: number;
  isPartial?: boolean;
  matchLocations?: string[];
  lastModified?: string;
  lastModifiedBy?: string;
  pagination?: PaginationInfo;
  /** True when matchString was provided but not found in file (not an error, just no match) */
  matchNotFound?: boolean;
  /** The matchString that was searched for (when matchNotFound is true) */
  searchedFor?: string;
}

/** Base result interface */
interface BaseToolResult<TQuery = object> {
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
  error?: string;
  hints?: string[];
  query?: TQuery;
}

/** Complete file content result */
export interface ContentResult
  extends BaseToolResult<FileContentQuery>, ContentResultData {}

// ============================================================================
// DIRECTORY FETCH TYPES
// ============================================================================

/** Single file entry fetched from a directory */
export interface DirectoryFileEntry {
  /** Relative path within the directory */
  path: string;
  /** File size in bytes */
  size: number;
  /** File type (always 'file') */
  type: 'file';
}

/** Result of a directory fetch operation */
export interface DirectoryFetchResult {
  /** Absolute local path where files are saved */
  localPath: string;
  /** List of files saved to disk */
  files: DirectoryFileEntry[];
  /** Total number of files saved */
  fileCount: number;
  /** Total size of all files in bytes */
  totalSize: number;
  /** Whether result was served from cache */
  cached: boolean;
  /** ISO-8601 cache expiry timestamp */
  expiresAt: string;
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** Branch fetched from */
  branch: string;
  /** Directory path fetched */
  directoryPath: string;
}
