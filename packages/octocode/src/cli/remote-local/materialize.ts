import path from 'node:path';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { executeDirectTool } from '@octocodeai/octocode-tools-core/direct';
import { paths } from '@octocodeai/octocode-tools-core/paths';
import { refLabel, type GithubRef } from '../routing.js';
import {
  directToolText,
  parseCloneResult,
  parseFileContentResult,
} from './parse.js';
import { normalizeRepoPath, resolveRepoOption } from './path-utils.js';
import type {
  DirectToolResult,
  RemoteMaterialization,
  RemoteMaterializationRequest,
} from './types.js';

export async function materializeRemoteForCli(
  request: RemoteMaterializationRequest
): Promise<RemoteMaterialization> {
  const repo = resolveRepoOption(request.repoRef, request.branch);
  const requestedPath = normalizeRepoPath(repo.subpath, request.path);

  if (request.kind === 'file') {
    if (!requestedPath) {
      throw new Error(
        'File materialization requires a repository-relative path.'
      );
    }
    return materializeFileForCli(repo, requestedPath, request);
  }

  // `repo` and `tree` both materialize through a (sparse) clone: the tool-side
  // tree materialization was retired, and a sparse clone is the one runner that
  // yields a real on-disk directory.
  return materializeCloneForCli(repo, requestedPath, request);
}

async function materializeCloneForCli(
  repo: GithubRef,
  requestedPath: string,
  request: RemoteMaterializationRequest
): Promise<RemoteMaterialization> {
  const result = (await executeDirectTool('ghCloneRepo', {
    queries: [
      {
        owner: repo.owner,
        repo: repo.repo,
        branch: repo.branch,
        sparsePath: requestedPath || undefined,
        forceRefresh: request.forceRefresh || undefined,
        goal: `Save ${refLabel(repo)}${requestedPath ? `/${requestedPath}` : ''} locally`,
        reasoning: 'CLI remote-as-local materialization',
      },
    ],
  })) as DirectToolResult;

  if (result.isError) {
    throw new Error(directToolText(result));
  }

  const data = parseCloneResult(result);
  const cloneLocation = data.location;
  if (!cloneLocation?.localPath) {
    throw new Error('ghCloneRepo did not return location.localPath.');
  }

  const repoRoot = path.resolve(cloneLocation.localPath);
  const localPath = requestedPath
    ? path.resolve(repoRoot, ...requestedPath.split('/'))
    : repoRoot;
  const resolvedBranch = cloneLocation.resolvedBranch ?? repo.branch;
  const cached = Boolean(cloneLocation.cached);
  const complete = cloneLocation.complete === true;
  const verified = cloneLocation.verified === true;

  return {
    owner: repo.owner,
    repo: repo.repo,
    location: {
      kind: requestedPath
        ? statSync(localPath).isFile()
          ? 'file'
          : 'directory'
        : 'repo',
      localPath,
      repoRoot,
      ...(requestedPath ? { requestedPath } : {}),
      source: 'clone',
      cached,
      complete,
      verified,
      ...(cloneLocation.commitSha
        ? { commitSha: cloneLocation.commitSha }
        : {}),
      ...(resolvedBranch ? { resolvedBranch } : {}),
    },
  };
}

/** Branch names may contain '/'; keep the on-disk segment flat. */
function branchSegment(branch: string | undefined): string {
  return (branch ?? 'default').replace(/[^A-Za-z0-9._-]+/g, '_');
}

async function materializeFileForCli(
  repo: GithubRef,
  requestedPath: string,
  request: RemoteMaterializationRequest
): Promise<RemoteMaterialization> {
  const result = (await executeDirectTool('ghGetFileContent', {
    queries: [
      {
        owner: repo.owner,
        repo: repo.repo,
        branch: repo.branch,
        path: requestedPath,
        fullContent: true,
        contextLines: 0,
        minify: 'none',
        forceRefresh: request.forceRefresh || undefined,
        goal: `Save ${refLabel(repo)}/${requestedPath} locally`,
        reasoning: 'CLI remote-as-local materialization',
      },
    ],
  })) as DirectToolResult;

  if (result.isError) {
    throw new Error(directToolText(result));
  }

  const file = parseFileContentResult(result);
  if (typeof file.content !== 'string') {
    throw new Error('ghGetFileContent did not return file content.');
  }

  // The tool no longer materializes; the CLI owns the write under the shared
  // tmp cache so `cache status`/`cache clear` keep governing the bytes.
  const resolvedBranch = file.resolvedBranch ?? repo.branch;
  const repoRoot = path.join(
    paths.tmp,
    'fetch',
    repo.owner,
    repo.repo,
    branchSegment(resolvedBranch)
  );
  const localPath = path.join(repoRoot, ...requestedPath.split('/'));
  mkdirSync(path.dirname(localPath), { recursive: true });
  writeFileSync(localPath, file.content, 'utf8');

  return {
    owner: repo.owner,
    repo: repo.repo,
    location: {
      kind: 'file',
      localPath,
      repoRoot,
      requestedPath,
      source: 'fetch',
      cached: false,
      complete: true,
      verified: false,
      ...(resolvedBranch ? { resolvedBranch } : {}),
    },
  };
}
