export interface DirectoryFetchResult {
  localPath: string;
  repoRoot: string;
  files: Array<{ path: string; size: number; type: string }>;
  fileCount: number;
  totalSize: number;
  /** true = no files were skipped by size/type/limit/error */
  complete: boolean;
  /** true = completeness was proven against the remote tree (fresh fetch + complete) */
  verified: boolean;
  /** Immutable commit identity used by repoRoot and localPath. */
  commitSha: string;
  /** true when nonFile > 0 — subdirectory entries were present but not fetched; use ghCloneRepo for full coverage */
  hasSubdirectories?: boolean;
  directoryEntryCount: number;
  eligibleFileCount: number;
  savedFileCount: number;
  skipped: {
    nonFile: number;
    oversized: number;
    binary: number;
    fileLimit: number;
    fetchFailed: number;
    totalSizeLimit: number;
    pathTraversal: number;
  };
  limits: {
    maxDirectoryFiles: number;
    maxTotalSize: number;
    maxFileSize: number;
  };
  warnings?: string[];
  cached: boolean;
  expiresAt: string;
  owner: string;
  repo: string;
  branch: string;
  directoryPath: string;
}

export interface FileMaterializationResult {
  localPath: string;
  repoRoot: string;
  path: string;
  size: number;
  cached: boolean;
  expiresAt: string;
  owner: string;
  repo: string;
  branch: string;
  commitSha: string;
}
