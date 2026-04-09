/**
 * Types for local_fetch_content tool (localGetFileContent)
 * @module tools/local_fetch_content/types
 */

import type {
  LocalGetFileContentPagination,
  LocalGetFileContentToolResult,
} from '@octocodeai/octocode-core';

/**
 * Query parameters for fetching local file content
 */
export interface FetchContentQuery {
  id?: string;
  path: string;
  fullContent?: boolean;
  matchString?: string;
  matchStringContextLines?: number;
  matchStringIsRegex?: boolean;
  matchStringCaseSensitive?: boolean;
  startLine?: number;
  endLine?: number;
  charOffset?: number;
  charLength?: number;
  researchGoal?: string;
  reasoning?: string;
}

export type FetchContentPagination = LocalGetFileContentPagination;

export type FetchContentResult = LocalGetFileContentToolResult;
