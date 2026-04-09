/**
 * Types for local_view_structure tool (localViewStructure)
 * @module tools/local_view_structure/types
 */

import type {
  LocalViewStructurePagination,
  LocalViewStructureToolResult,
} from '@octocodeai/octocode-core';

/**
 * Query parameters for viewing local directory structure
 */
export interface ViewStructureQuery {
  id?: string;
  path: string;
  details?: boolean;
  hidden?: boolean;
  humanReadable?: boolean;
  sortBy?: 'name' | 'size' | 'time' | 'extension';
  reverse?: boolean;
  pattern?: string;
  directoriesOnly?: boolean;
  filesOnly?: boolean;
  extension?: string;
  extensions?: string[];
  depth?: number;
  recursive?: boolean;
  limit?: number;
  summary?: boolean;
  entriesPerPage?: number;
  entryPageNumber?: number;
  charOffset?: number;
  charLength?: number;
  showFileLastModified?: boolean;
  researchGoal?: string;
  reasoning?: string;
}

export type ViewStructurePagination = LocalViewStructurePagination;

export type ViewStructureResult = LocalViewStructureToolResult;
