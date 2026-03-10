/**
 * Types for package_search tool (packageSearch)
 * @module tools/package_search/types
 */

import type {
  PackageSearchData,
  PackageSearchPackage,
} from '../../scheme/outputTypes.js';
import type {
  MinimalPackageResult as CommonMinimalPackageResult,
  NpmPackageResult as CommonNpmPackageResult,
  PythonPackageResult as CommonPythonPackageResult,
  PackageResult as CommonPackageResult,
  PackageSearchAPIResult as CommonPackageSearchAPIResult,
  PackageSearchError as CommonPackageSearchError,
  DeprecationInfo as CommonDeprecationInfo,
} from '../../utils/package/common.js';

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Base query for package search
 */
interface PackageSearchBaseQuery {
  id?: string;
  name: string;
  searchLimit?: number;
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
}

/**
 * NPM-specific package search query
 */
export interface NpmPackageSearchQuery extends PackageSearchBaseQuery {
  ecosystem: 'npm';
  npmFetchMetadata?: boolean;
}

/**
 * Python-specific package search query
 */
export interface PythonPackageSearchQuery extends PackageSearchBaseQuery {
  ecosystem: 'python';
  pythonFetchMetadata?: boolean;
}

/**
 * Combined package search query type
 */
export type PackageSearchQuery =
  | NpmPackageSearchQuery
  | PythonPackageSearchQuery;

// ============================================================================
// OUTPUT TYPES
// ============================================================================

export type MinimalPackageResult = CommonMinimalPackageResult;

export type NpmPackageResult = CommonNpmPackageResult;

export type PythonPackageResult = CommonPythonPackageResult;

export type PackageResult = CommonPackageResult;

export type PackageResultWithRepo = PackageSearchPackage;

export type DeprecationInfo = CommonDeprecationInfo;

export type PackageSearchAPIResult = CommonPackageSearchAPIResult;

export type PackageSearchError = CommonPackageSearchError;

export type PackageSearchResult = PackageSearchData;
