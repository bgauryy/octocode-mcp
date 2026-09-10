import {
  NativeCancellation, snapshotFile, replaceFile, deleteFile,
  type FileSnapshot, type MutationReceipt,
} from '@octocodeai/octocode-extension-rust';

/** Bound both growing-file reads and mutation inputs before allocating native work. */
export const MAX_FILE_BYTES = 64 * 1024 * 1024;

export function assertFileContentSize(content: string): void {
  if (Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) {
    throw new Error('File mutation exceeds the 64 MiB content limit. Split or reduce the file before retrying.');
  }
}

export function snapshotNativeFile(path: string, includeContent = false, allowLeafSymlink = false): Promise<FileSnapshot> {
  return snapshotFile(path, MAX_FILE_BYTES, includeContent, allowLeafSymlink);
}

/** Cancellation is cooperative before commit; a committed native receipt wins. */
async function runNativeFileOperation(
  operation: (cancellation: NativeCancellation) => Promise<MutationReceipt>,
  signal?: AbortSignal,
): Promise<MutationReceipt> {
  const cancellation = new NativeCancellation();
  const cancel = () => cancellation.cancel();
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    if (signal?.aborted) throw new Error('Operation aborted');
    return await operation(cancellation);
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
}

export function replaceNativeFile(
  path: string, content: string, version: string, signal?: AbortSignal, createMode?: number,
): Promise<MutationReceipt> {
  assertFileContentSize(content);
  return runNativeFileOperation(
    (cancellation) => replaceFile(path, Buffer.from(content, 'utf8'), version, MAX_FILE_BYTES, createMode, cancellation),
    signal,
  );
}

export function deleteNativeFile(path: string, version: string, signal?: AbortSignal): Promise<MutationReceipt> {
  return runNativeFileOperation((cancellation) => deleteFile(path, version, MAX_FILE_BYTES, cancellation), signal);
}
