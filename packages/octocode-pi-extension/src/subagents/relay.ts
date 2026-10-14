import type { ExtensionUIContext } from '@earendil-works/pi-coding-agent';
import { ALLOW_ONCE, DENY_NOTE, NOTE_TITLE } from '../permission/ask.js';
import { AUDIT_NOTIFY_PREFIX, childAuditEntry, type AuditEntry } from '../permission/audit.js';
import { splitHeader, type PermissionHeader } from '../permission/header.js';
import type { ActionClass, AskReason } from '../permission/mode.js';
import { headerText } from '../shared/fence.js';
import { withDialog } from '../shared/locks.js';
import { sanitizeTerminalText } from '../shared/sanitize.js';

/**
 * A subagent's dialogs, answered by its parent. The child runs in Pi's RPC mode: its `ctx.ui.select`, `confirm` and `input`
 * arrive as `extension_ui_request` records on its stdout and wait for an `extension_ui_response` on its stdin. The parent
 * shows each one in its own UI, unchanged apart from a title line naming the child (taken from the process the request
 * arrived on, never from the request), and returns the user's answer. A permission prompt's options are the child's, so the
 * grant a user picks ("Allow all shell commands for this session") applies to that child only: the parent's own grants are
 * never touched. This enforces the parent's policy; it is not a sandbox, the child is the same OS user.
 */

/** The methods that wait for an answer. */
const DIALOG_METHODS: ReadonlySet<string> = new Set(['select', 'confirm', 'input', 'editor']);

/** Dialogs shown to the user for one child in one window; the rest of the window is denied. */
const RELAY_MAX_DIALOGS = 10;
const RELAY_WINDOW_MS = 60_000;

/** What the parent says to a child it stops asking about. The child's own deny-with-a-note path carries it to the model. */
export const RELAY_LIMIT_NOTE = `Not run: this subagent sent more than ${RELAY_MAX_DIALOGS} approval dialogs within a minute, so the rest of that minute is denied without asking the user. Do not retry now; report it to your parent as a blocker.`;

/** The part of the parent's permission state a relay uses. */
export interface RelayPermission {
  /** The parent's own mode allows every class and no reason asks. */
  allows(classes: readonly ActionClass[], reasons: readonly AskReason[]): boolean;
  /** The parent answered "Allow once" itself. */
  relayedAllow(agent: string, action: ActionClass, what: readonly string[]): void;
  /** The child's own audit entry. */
  adopt(entry: AuditEntry): void;
}

/** What the parent offers its children: its permission state always, its UI only when a person can be asked. */
export interface RelayHost {
  permission: RelayPermission;
  ui?: Pick<ExtensionUIContext, 'select' | 'confirm' | 'input' | 'notify'> | undefined;
}

/** The child as the parent knows it: from its own spawn, not from anything the child says. */
interface ChildWho {
  id: string;
  role?: string | undefined;
  goal?: string | undefined;
}

interface RelayOptions {
  /** Sends one `extension_ui_response` record to the child. */
  send: (response: Record<string, unknown>) => void;
  /** Called when the child's first dialog opens (`true`) and when its last one closes (`false`). */
  onWaiting?: (waiting: boolean) => void;
  now?: () => number;
}

const strings = (value: unknown): string[] | undefined => (Array.isArray(value) && value.every((item) => typeof item === 'string') ? (value as string[]) : undefined);
const sameList = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((item, index) => item === b[index]);

export class ChildRelay {
  readonly #who: ChildWho;
  readonly #host: RelayHost | undefined;
  readonly #options: RelayOptions;
  readonly #open = new Map<string, AbortController>();
  #windowStart = 0;
  #shown = 0;
  #limited = false;
  /** The note the next "Tell the agent why" input of this child gets (set when a prompt was denied for its rate). */
  #denyNote: string | undefined;

  constructor(who: ChildWho, host: RelayHost | undefined, options: RelayOptions) {
    this.#who = who;
    this.#host = host;
    this.#options = options;
  }

  /** Dialogs of this child open now (or queued behind another dialog). The watchdog pauses while it is above zero. */
  get open(): number {
    return this.#open.size;
  }

  /** One `extension_ui_request` record from the child. */
  handle(event: Record<string, unknown>): void {
    const method = String(event['method']);
    if (method === 'notify') {
      this.#audit(event['message']);
      return;
    }
    const id = event['id'];
    if (!DIALOG_METHODS.has(method) || typeof id !== 'string') return;
    const title = typeof event['title'] === 'string' ? event['title'] : '';
    const options = strings(event['options']) ?? [];
    const ui = this.#host?.ui;
    // The note for a denial the limit made: the child's own deny-with-a-note follow-up asks for it.
    const note = this.#denyNote;
    this.#denyNote = undefined;
    if (method === 'input' && title === NOTE_TITLE && note) return this.#options.send({ type: 'extension_ui_response', id, value: note });
    if (!ui || method === 'editor' || this.#open.size > 0 || this.#open.has(id)) return this.#cancel(id);
    const { title: shown, header } = method === 'select' ? splitHeader(title) : { title, header: undefined };
    if (header && this.#fastPath(id, header, options)) return;
    if (this.#overLimit(ui)) {
      if (method === 'select' && options.includes(DENY_NOTE)) {
        this.#denyNote = RELAY_LIMIT_NOTE;
        return this.#options.send({ type: 'extension_ui_response', id, value: DENY_NOTE });
      }
      return this.#cancel(id);
    }
    void this.#show(ui, id, method, shown, options, event);
  }

  /** The child's audit entry, recorded in the parent's log under the child's name. Anything else notified is ignored. */
  #audit(message: unknown): void {
    if (typeof message !== 'string' || !message.startsWith(AUDIT_NOTIFY_PREFIX)) return;
    const entry = childAuditEntry(message, this.#who.id);
    if (entry) this.#host?.permission.adopt(entry);
  }

  /** The parent's own mode already allows the call: answer "Allow once" without a dialog, and audit it. */
  #fastPath(id: string, header: PermissionHeader, options: readonly string[]): boolean {
    const permission = this.#host?.permission;
    // The header only speeds a call up: it must match the dialog it came with, and name a label the child offers.
    if (!permission || !options.includes(ALLOW_ONCE) || !sameList(header.options, options)) return false;
    if (!permission.allows([header.action, ...header.also], header.reasons)) return false;
    permission.relayedAllow(this.#who.id, header.action, header.what);
    this.#options.send({ type: 'extension_ui_response', id, value: ALLOW_ONCE });
    return true;
  }

  /** Whether this dialog is past the window's limit (the first dialog opens a window; its minute ends it). */
  #overLimit(ui: NonNullable<RelayHost['ui']>): boolean {
    const now = (this.#options.now ?? Date.now)();
    if (now - this.#windowStart >= RELAY_WINDOW_MS) {
      this.#windowStart = now;
      this.#shown = 0;
      this.#limited = false;
    }
    if (this.#shown < RELAY_MAX_DIALOGS) {
      this.#shown += 1;
      return false;
    }
    if (!this.#limited) {
      this.#limited = true;
      try {
        ui.notify(`${this.#label()} sent more than ${RELAY_MAX_DIALOGS} approval dialogs within a minute: the rest of that minute is denied.`, 'warning');
      } catch {
        // The UI is gone; the denial stands.
      }
    }
    return true;
  }

  /** `Subagent inky-kraken · implementer · fix login`: from the spawn, one line. */
  #label(): string {
    const { id, role, goal } = this.#who;
    return headerText(['Subagent', id, ...(role ? [`· ${role}`] : []), ...(goal ? [`· ${goal}`] : [])].join(' '), 200);
  }

  #cancel(id: string): void {
    this.#options.send({ type: 'extension_ui_response', id, cancelled: true });
  }

  /** Shows one dialog in the parent's UI behind its other dialogs, and answers the child. */
  async #show(ui: NonNullable<RelayHost['ui']>, id: string, method: string, title: string, options: readonly string[], event: Record<string, unknown>): Promise<void> {
    const controller = new AbortController();
    this.#open.set(id, controller);
    if (this.#open.size === 1) this.#options.onWaiting?.(true);
    const heading = `${this.#label()} asks:\n${sanitizeTerminalText(title)}`;
    const dialogOptions = { signal: controller.signal, ...(typeof event['timeout'] === 'number' ? { timeout: event['timeout'] } : {}) };
    let response: Record<string, unknown> = { cancelled: true };
    try {
      response = await withDialog(async () => {
        if (controller.signal.aborted) return { cancelled: true };
        if (method === 'select') {
          // Labels are drawn sanitized; the answer is the child's own label.
          const drawn = options.map((option) => sanitizeTerminalText(option));
          const choice = await ui.select(heading, drawn, dialogOptions);
          const index = choice === undefined ? -1 : drawn.indexOf(choice);
          return index < 0 ? { cancelled: true } : { value: options[index] };
        }
        if (method === 'confirm') {
          const message = typeof event['message'] === 'string' ? sanitizeTerminalText(event['message']) : '';
          const confirmed = await ui.confirm(heading, message, dialogOptions);
          return controller.signal.aborted ? { cancelled: true } : { confirmed };
        }
        const placeholder = typeof event['placeholder'] === 'string' ? sanitizeTerminalText(event['placeholder']) : undefined;
        const value = await ui.input(heading, placeholder, dialogOptions);
        return value === undefined ? { cancelled: true } : { value };
      }, controller.signal);
    } catch {
      // The parent's UI failed (its session was replaced): the child is told nobody answered.
    }
    // `cancelAll` may have answered already.
    if (!this.#open.delete(id)) return;
    if (this.#open.size === 0) this.#options.onWaiting?.(false);
    this.#options.send({ type: 'extension_ui_response', id, ...response });
  }

  /** Cancels every open dialog (the parent stopped the child, or it ended): closes them in the parent's UI and answers the child. */
  cancelAll(): void {
    if (this.#open.size === 0) return;
    const ids = [...this.#open.keys()];
    const controllers = [...this.#open.values()];
    this.#open.clear();
    this.#options.onWaiting?.(false);
    for (const id of ids) this.#cancel(id);
    for (const controller of controllers) controller.abort();
  }
}
