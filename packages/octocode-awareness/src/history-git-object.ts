import { resolve } from 'node:path';
import type { GitObject } from '@octocodeai/octocode-extension-rust';
import { loadNativeFiles, withNativeFiles } from './native-files.js';

export const MAX_HISTORY_OBJECT_BYTES = 16 * 1024 * 1024;
export const MAX_HISTORY_COMPRESSED_BYTES = 17 * 1024 * 1024;
export const HISTORY_OBJECT_TIMEOUT_MS = 10_000;
const OID = /^[0-9a-f]{40}$/;

export async function readHistoryObject(gitdir: string, oid: string, maxBytes = MAX_HISTORY_OBJECT_BYTES, includeContent = true, signal?: AbortSignal, timeoutMs = HISTORY_OBJECT_TIMEOUT_MS): Promise<GitObject> {
  if (!OID.test(oid)) throw new Error('HISTORY_OBJECT_INVALID: invalid object id');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > MAX_HISTORY_OBJECT_BYTES) throw new Error(`HISTORY_OBJECT_LIMIT: read limit must be between 0 and ${MAX_HISTORY_OBJECT_BYTES}`);
  // Loading remains lazy: ordinary Awareness commands do not require an addon.
  await loadNativeFiles();
  return withNativeFiles(signal, (native, cancellation) => native.readGitObject(resolve(gitdir, 'objects', oid.slice(0, 2), oid.slice(2)), oid, maxBytes, MAX_HISTORY_COMPRESSED_BYTES, timeoutMs, includeContent, cancellation));
}

function invalid(message: string): never { throw new Error(`HISTORY_OBJECT_INVALID: ${message}`); }
const utf8 = new TextDecoder('utf-8', { fatal: true });

export interface RawHistoryTreeEntry { mode: string; path: string; oid: string; type: 'blob' | 'tree' }
export function parseHistoryTree(object: GitObject): RawHistoryTreeEntry[] {
  if (object.objectType !== 'tree' || !object.content) return invalid('expected tree');
  const bytes = object.content;
  const entries: RawHistoryTreeEntry[] = [];
  const seen = new Set<string>();
  let offset = 0;
  while (offset < bytes.length) {
    const space = bytes.indexOf(32, offset);
    const nul = bytes.indexOf(0, space + 1);
    if (space < offset || nul < space || nul + 21 > bytes.length) return invalid('truncated tree entry');
    if (nul - space > 32768 || entries.length >= 100_000) throw new Error('HISTORY_OBJECT_LIMIT: tree entry count or name exceeds limit');
    // latin1 preserves every byte; Node's ascii decoder silently clears high bits.
    const mode = bytes.subarray(offset, space).toString('latin1');
    if (!['40000', '040000', '100644', '100755', '120000'].includes(mode)) return invalid('unsupported tree mode');
    const path = utf8.decode(bytes.subarray(space + 1, nul));
    if (!path || path === '.' || path === '..' || path.includes('/') || path.includes('\\') || seen.has(path)) return invalid('invalid or duplicate tree path');
    seen.add(path);
    entries.push({ mode: mode === '40000' ? '040000' : mode, path, oid: bytes.subarray(nul + 1, nul + 21).toString('hex'), type: mode.endsWith('40000') ? 'tree' : 'blob' });
    offset = nul + 21;
  }
  return entries;
}

export function parseHistoryCommit(object: GitObject): { tree: string; parents: string[]; message: string; timestampMs: number } {
  if (object.objectType !== 'commit' || !object.content) return invalid('expected commit');
  if (object.size > 1024 * 1024) throw new Error('HISTORY_OBJECT_LIMIT: commit metadata exceeds 1 MiB');
  const text = utf8.decode(object.content);
  const boundary = text.indexOf('\n\n');
  if (boundary < 0) return invalid('missing commit header boundary');
  const lines = text.slice(0, boundary).split('\n');
  if (lines.length > 4096) throw new Error('HISTORY_OBJECT_LIMIT: commit header exceeds 4096 lines');
  const trees = lines.filter(line => line.startsWith('tree '));
  const committers = lines.filter(line => line.startsWith('committer '));
  const tree = trees[0]?.slice(5) ?? '';
  const parents = lines.filter(line => line.startsWith('parent ')).map(line => line.slice(7));
  const timestamp = committers[0]?.match(/ (-?\d+) [+-]\d{4}$/)?.[1];
  if (trees.length !== 1 || committers.length !== 1 || !OID.test(tree) || parents.some(parent => !OID.test(parent)) || timestamp === undefined || !Number.isSafeInteger(Number(timestamp) * 1000)) return invalid('invalid commit tree, parent, or timestamp');
  return { tree, parents, message: text.slice(boundary + 2), timestampMs: Number(timestamp) * 1000 };
}
