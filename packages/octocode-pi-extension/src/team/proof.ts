import { createHmac } from 'node:crypto';
import { sameSecret } from '../shared/env.js';
import type { Message } from './model.js';

/**
 * What lets a subagent tell the user's message from a forged one. The sender column of the shared database says "user" for
 * anyone who writes it, so the parent (the process the user types into) signs each message it stores for a child with the
 * secret it gave that child at spawn (read from the file named by `PERMISSION_NONCE_FILE_ENV`); the child checks the signature with the same secret. Only the
 * parent and that child hold it: the model's tools, a peer session or a sibling cannot make a signature, and one signature
 * fits one message (id, recipient and text).
 */

/** The signature of `message` for the child that holds `secret`: HMAC-SHA256 over the fields a reader sees, hex. */
export const userProof = (secret: string, message: Pick<Message, 'id' | 'to' | 'text'>): string =>
  createHmac('sha256', secret).update(JSON.stringify(['octocode-user-message', message.id, message.to, message.text])).digest('hex');

/** Whether `message`, recorded as from the user, carries the signature of `secret` (false without a secret or a signature). */
export function userProofValid(secret: string | undefined, message: Pick<Message, 'id' | 'to' | 'text' | 'proof'>): boolean {
  if (!secret || !message.proof) return false;
  return sameSecret(userProof(secret, message), message.proof);
}
