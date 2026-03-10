/**
 * Types for local_view_structure tool (localViewStructure)
 * @module tools/local_view_structure/types
 */

import type {
  LocalViewStructurePagination,
  LocalViewStructureToolResult,
} from '../../scheme/outputTypes.js';

// ============================================================================
// INPUT TYPES
// ============================================================================

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
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
}

// ============================================================================
// OUTPUT TYPES
// ============================================================================

export type ViewStructurePagination = LocalViewStructurePagination;

export type ViewStructureResult = LocalViewStructureToolResult;
