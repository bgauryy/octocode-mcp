/**
 * Write operations used by the public file tool.
 * Atomic writes record read-state for subsequent edit stale checks.
 */
import type { ToolCallResult } from '../types.js';
import { resolveFilePath, withFileMutationQueue } from './file-state.js';
import { assertFileContentSize, replaceNativeFile } from './native-files.js';
import { peerWipNotice } from './peer-wip.js';
import { finishFileMutation } from './file-mutation-receipt.js';
import { assertWellFormedText } from './file-text.js';
import { prepareFileMutationTarget, assertFileMutationTargetCurrent, type FileMutationTarget } from './file-mutation-target.js';

export function resolveWritePath(filePath: string, cwd = process.cwd()): string {
  return resolveFilePath(filePath, cwd);
}

export interface PreparedWrite {
  operation: 'write';
  target: FileMutationTarget;
  content: string;
}

export async function prepareWrite(requestPath: string, content: string, cwd: string): Promise<PreparedWrite> {
  assertFileContentSize(content);
  return { operation: 'write', target: await prepareFileMutationTarget(requestPath, cwd, true), content };
}

export function validateWriteParams(params: Record<string, unknown>): { path: string; content: string; reasoning: string } {
  const rawPath = params['path'];
  if (typeof rawPath !== 'string' || rawPath.trim().length === 0) {
    throw new Error('Write tool input is invalid. path must be a non-empty string.');
  }
  if (typeof params['content'] !== 'string') {
    throw new Error('Write tool input is invalid. content must be a string.');
  }
  assertWellFormedText(params['content'], 'content');
  if (typeof params['reasoning'] !== 'string' || params['reasoning'].trim().length === 0) {
    throw new Error('Write tool input is invalid. reasoning is required — provide a non-empty string explaining why this write is necessary.');
  }
  return { path: rawPath, content: params['content'], reasoning: params['reasoning'] };
}

/** Execute one path-guarded write after the caller has preflighted the batch. */
export async function commitWrite(
  prepared: PreparedWrite,
  signal?: AbortSignal,
): Promise<ToolCallResult> {
  const { target, content } = prepared;
  const { requestPath, canonicalPath: absolutePath } = target;
  if (signal?.aborted) throw new Error('Operation aborted');
  const peerNotice = peerWipNotice(absolutePath, requestPath);
  const created = !target.snapshot.exists;

  const { receipt, warnings } = await withFileMutationQueue(absolutePath, async () => {
    if (signal?.aborted) throw new Error('Operation aborted');
    assertFileMutationTargetCurrent(target);
    const receipt = await replaceNativeFile(absolutePath, content, target.snapshot.version, signal);
    const warnings = [...receipt.warnings, ...await finishFileMutation(absolutePath, content)];
    return { receipt, warnings };
  });

  return {
    content: [{
      type: 'text',
      text: `Successfully wrote ${Buffer.byteLength(content, 'utf8')} bytes to ${requestPath}${peerNotice}${warnings.length ? `\n${warnings.join('\n')}` : ''}`,
    }],
    details: {
      operation: 'write',
      committed: true,
      durable: receipt.durable,
      ...(warnings.length ? { warnings } : {}),
      created,
      path: requestPath,
      absolutePath: target.absolutePath,
      canonicalPath: absolutePath,
      bytes: Buffer.byteLength(content, 'utf8'),
    },
  };
}
