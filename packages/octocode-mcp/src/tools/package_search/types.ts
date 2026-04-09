import type { z } from 'zod/v4';
import type {
  NpmPackageQuerySchema,
  PythonPackageQuerySchema,
} from '@octocodeai/octocode-core';
import type {
  MinimalPackageResult as CommonMinimalPackageResult,
  NpmPackageResult as CommonNpmPackageResult,
  PythonPackageResult as CommonPythonPackageResult,
  PackageResult as CommonPackageResult,
  PackageSearchAPIResult as CommonPackageSearchAPIResult,
  PackageSearchError as CommonPackageSearchError,
  DeprecationInfo as CommonDeprecationInfo,
} from '../../utils/package/common.js';

export type NpmPackageSearchQuery = z.infer<typeof NpmPackageQuerySchema>;

export type PythonPackageSearchQuery = z.infer<typeof PythonPackageQuerySchema>;

export type MinimalPackageResult = CommonMinimalPackageResult;

export type NpmPackageResult = CommonNpmPackageResult;

export type PythonPackageResult = CommonPythonPackageResult;

export type PackageResult = CommonPackageResult;

export type DeprecationInfo = CommonDeprecationInfo;

export type PackageSearchAPIResult = CommonPackageSearchAPIResult;

export type PackageSearchError = CommonPackageSearchError;
