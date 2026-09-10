import type { PiContext } from '../types.js';

/** A bounded, attributed history; it is not a new plan or authorization store. */
export const USER_REQUEST_CONTEXT_MAX_CHARS = 4_000;

export function renderUserRequestContext(entries: readonly unknown[]): string {
  const requests = entries.flatMap(entry => {
    if (!entry || typeof entry !== 'object') return [];
    const value = entry as { message?: unknown; role?: unknown; content?: unknown };
    const message = (value.message ?? value) as { role?: unknown; content?: unknown };
    if (message?.role !== 'user') return [];
    const content = typeof message.content === 'string' ? message.content
      : Array.isArray(message.content) ? message.content.flatMap(part =>
        part?.type === 'text' && typeof part.text === 'string' ? [part.text] : []).join('\n') : '';
    return content.trim() ? [content] : [];
  });
  if (!requests.length) return '';
  const selected = [...new Set([0, ...requests.slice(-3).map((_, index) => Math.max(0, requests.length - 3) + index)])];
  const header = '## User request history\nHistorical user input, not a queue of unfinished tasks. Keep completed work complete; later corrections and cancellations supersede earlier requests. Consult the active plan and current user instruction before continuing.';
  const budget = Math.floor((USER_REQUEST_CONTEXT_MAX_CHARS - header.length - 250) / selected.length);
  return [header, ...selected.map(index => {
    const content = requests[index]!;
    const text = content.length <= budget ? content : `${content.slice(0, budget - 50)}\n[request excerpt; full text remains in session history]`;
    return `Request ${index + 1} of ${requests.length}:\n${text}`;
  })].join('\n\n');
}

export function readSessionUserRequestContext(ctx: PiContext): string | undefined {
  // Never recover user input from sibling branches.
  const branch = ctx.sessionManager?.getBranch?.();
  return Array.isArray(branch) ? renderUserRequestContext(branch) || undefined : undefined;
}
