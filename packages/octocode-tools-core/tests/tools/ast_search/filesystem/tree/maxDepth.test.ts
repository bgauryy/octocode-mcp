import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

import { viewFilesystemTree } from '../../../../../src/tools/ast_search/filesystem/tree.js';
import {
  resetContextUtilsNativeLoaderForTesting,
  setContextUtilsNativeLoaderForTesting,
} from '../../../../../src/utils/contextUtils.js';

type NativeContextUtilsModule = typeof import('@octocodeai/octocode-engine');

function installQueryFileSystem(
  queryFileSystem: ReturnType<typeof vi.fn>
): void {
  setContextUtilsNativeLoaderForTesting(
    () =>
      ({
        queryFileSystem,
      }) as unknown as NativeContextUtilsModule
  );
}

function emptyNativeResult() {
  return {
    entries: [],
    totalDiscovered: 0,
    wasCapped: false,
    skipped: 0,
    permissionDenied: 0,
    warnings: [],
  };
}

describe('astSearch filesystem tree effective maxDepth (documented defaults)', () => {
  const validBasePath = join(process.cwd(), 'tests');

  afterEach(() => {
    resetContextUtilsNativeLoaderForTesting();
  });

  it('omitting maxDepth lists immediate children only', async () => {
    const queryFileSystem = vi.fn().mockResolvedValue(emptyNativeResult());
    installQueryFileSystem(queryFileSystem);

    await viewFilesystemTree({ operation: 'tree', path: validBasePath });

    expect(queryFileSystem).toHaveBeenCalledWith(
      expect.objectContaining({ recursive: false, maxDepth: 1 })
    );
  });

  it('maxDepth 5 enables a recursive walk of depth 5', async () => {
    const queryFileSystem = vi.fn().mockResolvedValue(emptyNativeResult());
    installQueryFileSystem(queryFileSystem);

    await viewFilesystemTree({
      operation: 'tree',
      path: validBasePath,
      maxDepth: 5,
    });

    expect(queryFileSystem).toHaveBeenCalledWith(
      expect.objectContaining({ recursive: true, maxDepth: 5 })
    );
  });

  it('maxDepth limits the recursive walk', async () => {
    const queryFileSystem = vi.fn().mockResolvedValue(emptyNativeResult());
    installQueryFileSystem(queryFileSystem);

    await viewFilesystemTree({
      operation: 'tree',
      path: validBasePath,
      maxDepth: 3,
    });

    expect(queryFileSystem).toHaveBeenCalledWith(
      expect.objectContaining({ recursive: true, maxDepth: 3 })
    );
  });
});
