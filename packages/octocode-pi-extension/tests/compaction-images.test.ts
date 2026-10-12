import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { describe, expect, it, vi } from 'vitest';
import { KEEP_RECENT_IMAGES, KEEP_RECENT_IMAGE_CHARS, REQUEST_PRESSURE_CHARS, contextChars, isRequestTooLarge, planTooLargeRecovery } from '../src/compaction/images.js';
import { trimsDue } from '../src/compaction/policy.js';
import { planContextTrims, registerCompaction } from '../src/compaction/register.js';
import type { FileGuard } from '../src/files/tool.js';

type Handler = (event: unknown, ctx: unknown) => Promise<unknown>;

/** A screenshot-sized image (about 450 KB of base64), as the `read` tool returns it. */
const SHOT = 'A'.repeat(450_000);
/** A result as Pi projects it once an image-stripping edit applied. */
const APPLIED = '[image from an earlier tool call omitted; saved at ~/x.png; read that file to see it again]';
const NOTE = expect.stringMatching(/^\[image from an earlier tool call omitted; saved at \S+\.png \(sha256 [0-9a-f]{16}, \d+ bytes\); read that file to see it again\]$/) as unknown as string;

const shot = (index: number, data = SHOT) => ({
  id: `r${index}`,
  message: {
    role: 'toolResult',
    toolName: 'read',
    toolCallId: `c${index}`,
    content: [
      { type: 'text', text: 'Read image file [image/png]' },
      { type: 'image', data, mimeType: 'image/png' },
    ],
  },
});
const readCall = (index: number) => ({
  id: `a${index}`,
  message: { role: 'assistant', content: [{ type: 'toolCall', id: `c${index}`, name: 'read', arguments: { path: `/tmp/shots/${index}.png` } }] },
});
const history = (count: number, data = SHOT) => Array.from({ length: count }, (_, index) => [readCall(index), shot(index, data)]).flat();
/** A mid-size image: three of them fit the kept-image byte budget. */
const MID = 'A'.repeat(100_000);
const failed = (text = '413 status code (no body)') => ({ role: 'assistant', stopReason: 'error', errorMessage: text, content: [], timestamp: Date.now() });
const turnEnd = (entries: Array<{ id: string; message: unknown }>, message: unknown, messageEntryId = 'fail', toolResultEntryIds: string[] = []) => ({
  entries: [],
  message,
  messageEntryId,
  toolResultEntryIds,
  context: { contextEntries: entries.map((entry) => ({ sourceEntry: { type: 'message', id: entry.id }, messages: [entry.message] })) },
});

const imagesIn = (content: unknown) => (content as Array<{ type: string }>).filter((part) => part.type === 'image').length;

function register(percent = 10) {
  const handlers = new Map<string, Handler>();
  const pi = { on: (name: string, handler: Handler) => void handlers.set(name, handler), getSettings: () => ({}) } as unknown as ExtensionAPI;
  const notify = vi.fn();
  registerCompaction(pi, { reset: vi.fn(), forget: vi.fn() } as unknown as FileGuard);
  const ctx = {
    model: { promptCache: { short: 300 } },
    cwd: '/repo',
    hasUI: true,
    ui: { notify },
    sessionManager: { getSessionId: () => 's1' },
    getContextUsage: () => ({ tokens: 1, contextWindow: 100, percent }),
  };
  return { notify, fire: (name: string, event: unknown = {}) => handlers.get(name)!(event, ctx) };
}

describe('image budget', () => {
  it('counts an image by its real size, so a few screenshots exceed the request-size pressure', () => {
    expect(contextChars(history(1))).toBeGreaterThanOrEqual(SHOT.length);
    expect(contextChars(history(4))).toBeGreaterThan(REQUEST_PRESSURE_CHARS);
    expect(contextChars(history(2))).toBeLessThan(REQUEST_PRESSURE_CHARS);
  });

  it('makes trims due under request-size pressure even on a warm cache with room in the window', () => {
    const now = Date.now();
    expect(trimsDue({ written: now, ttlMs: 300_000 }, 10, now, REQUEST_PRESSURE_CHARS - 1)).toBe(false);
    expect(trimsDue({ written: now, ttlMs: 300_000 }, 10, now, REQUEST_PRESSURE_CHARS)).toBe(true);
  });

  it('keeps only the newest image results verbatim, even inside the recent window, and keeps their text', () => {
    const entries = history(KEEP_RECENT_IMAGES + 2, MID);
    const edits = planContextTrims(entries);
    expect(edits.map((edit) => edit.targetId)).toEqual(['r0', 'r1']);
    const content = (edits[0]!.replacement as { content: unknown }).content;
    expect(imagesIn(content)).toBe(0);
    expect(content).toEqual([
      { type: 'text', text: 'Read image file [image/png]' },
      { type: 'text', text: NOTE },
    ]);
    // The newest images stay: the model may still be comparing them.
    expect(planContextTrims(history(KEEP_RECENT_IMAGES, MID))).toEqual([]);
  });

  it('keeps recent images only while they fit a byte budget, but always the newest one', () => {
    // Three screenshots exceed the budget: the two newest keep their images.
    expect(SHOT.length * 3).toBeGreaterThan(KEEP_RECENT_IMAGE_CHARS);
    expect(planContextTrims(history(4)).map((edit) => edit.targetId)).toEqual(['r0', 'r1']);
    // One image over the budget on its own still stays: the model just asked for it.
    const huge = 'A'.repeat(KEEP_RECENT_IMAGE_CHARS + 1);
    expect(planContextTrims(history(1, huge))).toEqual([]);
  });

  it('never strips results with images the model has not seen yet (this turn)', () => {
    const entries = history(14);
    const unseen = new Set(entries.filter((entry) => entry.id.startsWith('r')).map((entry) => entry.id));
    expect(planContextTrims(entries, new Map(), unseen)).toEqual([]);
    // Seen results still give way, and the unseen ones fill the image budget first.
    const later = [...history(3), readCall(9), shot(9)];
    expect(planContextTrims(later, new Map(), new Set(['r9'])).map((edit) => edit.targetId)).toEqual(['r0', 'r1']);
  });

  it('trims old screenshots at the next turn_end under size pressure, despite a warm cache', async () => {
    const { fire } = register();
    const done = { role: 'assistant', stopReason: 'toolUse', content: [], timestamp: Date.now() };
    const result = (await fire('turn_end', turnEnd(history(KEEP_RECENT_IMAGES + 2), done, 'ok'))) as { entries: Array<{ targetId: string }> };
    expect(result.entries.map((entry) => entry.targetId)).toEqual(['r0', 'r1', 'r2']);
    // This turn's results are not stripped before the model has seen them, even past the budget.
    const fresh = (await fire('turn_end', turnEnd(history(KEEP_RECENT_IMAGES + 2), done, 'ok', ['r2', 'r3', 'r4']))) as { entries: Array<{ targetId: string }> };
    expect(fresh.entries.map((entry) => entry.targetId)).toEqual(['r0', 'r1']);
  });
});

describe('request too large (HTTP 413)', () => {
  const ANTHROPIC = '413 {"error":{"type":"request_too_large","message":"Request exceeds the maximum size"}}';

  it('recognises byte-size rejections from Anthropic and from gateways without a body, not other errors', () => {
    expect(isRequestTooLarge(failed())).toBe(true);
    expect(isRequestTooLarge(failed(ANTHROPIC))).toBe(true);
    expect(isRequestTooLarge(failed('Request Entity Too Large'))).toBe(true);
    expect(isRequestTooLarge(failed('Payload Too Large'))).toBe(true);
    expect(isRequestTooLarge(failed('HTTP 413: rejected'))).toBe(true);
    expect(isRequestTooLarge(failed('429 rate limit'))).toBe(false);
    expect(isRequestTooLarge(failed('500 overloaded'))).toBe(false);
    // A bare number elsewhere in an error is not a status.
    expect(isRequestTooLarge(failed('prompt has 413 tokens too many'))).toBe(false);
    expect(isRequestTooLarge({ role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: 'HTTP 413 explained' }] })).toBe(false);
  });

  it('plans a recovery that omits the failed attempt and strips images beyond the ones kept', () => {
    const entries = [...history(3), { id: 'fail', message: failed() }];
    const keepOne = planTooLargeRecovery(entries, 'fail', 1)!;
    expect(keepOne.find((edit) => edit.targetId === 'fail')!.replacement).toBeNull();
    expect(keepOne.filter((edit) => edit.targetId !== 'fail').map((edit) => edit.targetId)).toEqual(['r0', 'r1']);
    const keepNone = planTooLargeRecovery(entries, 'fail', 0)!;
    expect(keepNone.filter((edit) => edit.targetId !== 'fail').map((edit) => edit.targetId)).toEqual(['r0', 'r1', 'r2']);
    // Without a failed id (Pi recovers that attempt itself) only images are stripped.
    expect(planTooLargeRecovery(entries, undefined, 1)!.map((edit) => edit.targetId)).toEqual(['r0', 'r1']);
    // Nothing left to strip: no recovery to try.
    expect(planTooLargeRecovery([readCall(0), { id: 'fail', message: failed() }], 'fail', 0)).toBeUndefined();
  });

  it('retries from agent_before_settle (Pi ignores turn_end continuation after an error): older images, then none, then stops', async () => {
    const { fire, notify } = register();
    const settle = (outcome = 'error') => fire('agent_before_settle', { type: 'agent_before_settle', outcome, entries: [], continue: false });
    const entries = history(3);
    const first = (await fire('turn_end', turnEnd(entries, failed()))) as { entries: Array<{ targetId: string; replacement: unknown }>; continue?: boolean };
    expect(first.continue).toBeUndefined();
    expect(first.entries.find((edit) => edit.targetId === 'fail')!.replacement).toBeNull();
    expect(first.entries.filter((edit) => edit.targetId !== 'fail').map((edit) => edit.targetId)).toEqual(['r0', 'r1']);
    expect(await settle()).toEqual({ continue: true });
    // One continuation per recovery.
    expect(await settle()).toBeUndefined();

    // Pi applied those edits; the retry still failed: strip the last image too.
    const projected = entries.map((entry) => (entry.id === 'r0' || entry.id === 'r1' ? { ...entry, message: { ...entry.message, content: [{ type: 'text', text: APPLIED }] } } : entry));
    const second = (await fire('turn_end', turnEnd(projected, failed(), 'fail2'))) as { entries: Array<{ targetId: string }> };
    expect(second.entries.map((edit) => edit.targetId)).toEqual(['fail2', 'r2']);
    expect(await settle()).toEqual({ continue: true });

    // No images left: no loop; the user is told to compact.
    const bare = projected.map((entry) => (entry.id === 'r2' ? { ...entry, message: { ...entry.message, content: [{ type: 'text', text: APPLIED }] } } : entry));
    expect(await fire('turn_end', turnEnd(bare, failed(), 'fail3'))).toBeUndefined();
    expect(await settle()).toBeUndefined();
    expect(notify).toHaveBeenCalledOnce();
    expect(notify.mock.calls[0]![0]).toMatch(/\/compact/);
    expect(notify.mock.calls[0]![1]).toBe('warning');
  });

  it('only strips images when Pi recognises the overflow itself (Pi compacts and retries)', async () => {
    const { fire, notify } = register();
    const result = (await fire('turn_end', turnEnd(history(3), failed(ANTHROPIC)))) as { entries: Array<{ targetId: string }> };
    expect(result.entries.map((edit) => edit.targetId)).toEqual(['r0', 'r1']);
    expect(await fire('agent_before_settle', { outcome: 'error', entries: [], continue: false })).toBeUndefined();
    expect(notify).not.toHaveBeenCalled();
  });

  it('does not continue a run that did not fail, and starts over after a successful turn or a tree move', async () => {
    const { fire } = register();
    await fire('turn_end', turnEnd(history(3), failed()));
    // The user aborted instead: no continuation.
    expect(await fire('agent_before_settle', { outcome: 'aborted', entries: [], continue: false })).toBeUndefined();
    await fire('turn_end', turnEnd(history(1), { role: 'assistant', stopReason: 'stop', content: [], timestamp: Date.now() }, 'ok'));
    const again = (await fire('turn_end', turnEnd(history(3), failed(), 'fail4'))) as { entries: Array<{ targetId: string }> };
    // First stage again: the newest image is kept.
    expect(again.entries.map((edit) => edit.targetId)).toEqual(['fail4', 'r0', 'r1']);
    await fire('session_tree', {});
    expect(await fire('agent_before_settle', { outcome: 'error', entries: [], continue: false })).toBeUndefined();
    const moved = (await fire('turn_end', turnEnd(history(3), failed(), 'fail5'))) as { entries: Array<{ targetId: string }> };
    expect(moved.entries.map((edit) => edit.targetId)).toEqual(['fail5', 'r0', 'r1']);
  });
});
