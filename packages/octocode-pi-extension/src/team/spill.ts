import fs from 'node:fs';
import path from 'node:path';
import { sha256 } from '../shared/atomic.js';
import { saveNamedContent } from '../shared/spill.js';

/**
 * The file a long message is saved to (`spilledMessage`): `message-<sha256 of its content>.txt` in the session's private
 * output folder. The name is the content's hash, so the message's signature (`team/proof.ts`), which covers the delivered
 * head and the pointer with this path, also covers the whole text: a recipient checks the file against its own name
 * (`spillIntact`) before it reads a verified message as the user's.
 */
const FILE_NAME = /^message-([0-9a-f]{64})\.txt$/;

/** The pointer `spilledMessage` ends a long message with: the path is the file's. */
const POINTER = /\n\[Full message \(\d+ characters\): (.+)\]$/;

/** Saves `content` under its hash and returns the path, or undefined when it could not be written. Never throws. */
export const saveMessageFile = (content: string): string | undefined => saveNamedContent(content, `message-${sha256(content)}.txt`);

/**
 * Whether the saved file a delivered message points at still holds what was saved: true for a message with no pointer; false
 * when the file is missing, changed, or not named by a content hash (a pointer this version did not write).
 */
export function spillIntact(text: string): boolean {
  const file = POINTER.exec(text)?.[1];
  if (file === undefined) return true;
  const hash = FILE_NAME.exec(path.basename(file))?.[1];
  if (hash === undefined) return false;
  try {
    return sha256(fs.readFileSync(file)) === hash;
  } catch {
    return false;
  }
}
