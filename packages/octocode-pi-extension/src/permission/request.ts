import type { ActionClass, AskReason } from './mode.js';

/** What an ask shows: the effect card, any reasons that tighten it, and exactly what it would do. */
export interface PermissionRequest {
  /** The effect. Absent when a reason forces a call that has no action class. */
  action?: ActionClass;
  /** Other classes the same call is, each of which must also be allowed (an upload from outside the workspace is browser control and an outside upload): one prompt names them all, and no session grant answers it. */
  also?: readonly ActionClass[];
  /** Reasons that can apply to this call. A reason only tightens: it never loosens the effect's own rule. In full none asks, but each is recorded. */
  reasons?: readonly AskReason[];
  /** A verb and the action: "Run this command?". */
  title: string;
  /** What exactly: the command, path, host or arguments (model text; sanitized when shown). */
  what: string[];
  /** The system's reasons beyond the mode (a hook's reason, a provenance source), one per line. Never agent text. */
  reason?: string;
  /**
   * What the agent says the call is for, unverified. Source order: the tool's own field, then the last sentence of the
   * assistant message that issued the call (`toolCallId`), then `no reason given`. An empty string means no agent is
   * involved (a command the user typed) and the card shows no such line.
   */
  purpose?: string;
  /** The assistant call this check belongs to: where `purpose` falls back to. */
  toolCallId?: string;
  /** The folder the call runs in (a snapshot's repository, the card's measurements). */
  cwd?: string;
  /** The card's lines; computed from the class when the caller does not set them. */
  effect?: string;
  undo?: string;
  risk?: string;
  /** Offered as "Allow <label> for this session"; `key` is what the grant matches next time. */
  grant?: { key: string; label: string };
  /** Issued by a codemode script (`parentToolCallId` set). */
  nested?: boolean;
  signal?: AbortSignal;
}
