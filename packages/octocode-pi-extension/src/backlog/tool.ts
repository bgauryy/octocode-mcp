import { StringEnum } from '@earendil-works/pi-ai';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { clip, timingOf, plural, resultBlock, timedTool, toolHeader } from '../shared/render.js';
import { sanitizeTerminalText } from '../shared/sanitize.js';
import { textResult } from '../shared/util.js';
import { openBacklog, type Backlog, type BacklogOptions } from './context.js';
import { itemDetail, itemLine } from './format.js';
import { BODY_MAX, GOAL_MAX, NOTE_MAX, PRIORITIES, refuseSecrets, STATES, TAGS_MAX, TITLE_MAX, type Item, type State } from './store.js';

const DEFAULT_LIST_LIMIT = 20;
const DEFAULT_LIST_STATES: State[] = ['ongoing', 'todo'];
const DONE_NOTE = 'Marking an item done needs a note: say what changed and how its goal was verified.';

interface BacklogToolDetails {
  item?: Item;
  /** list: items shown and matched. */
  shown?: number;
  total?: number;
  /** remove: the removed item's ref. */
  removed?: string;
  durationMs?: number;
}

/** The `⎿` line: `B12 → done`, `Added B3`, `Removed B1`, `3 items`. */
function backlogSummary(op: unknown, details: BacklogToolDetails, text: string): string {
  const item = details.item;
  if (op === 'list' && details.total !== undefined) return details.total === 0 ? 'No items' : details.total > (details.shown ?? 0) ? `${details.shown} of ${plural(details.total, 'item')}` : plural(details.total, 'item');
  if (op === 'remove' && details.removed) return `Removed ${details.removed}`;
  if (item && op === 'add') return `Added ${item.ref} · ${item.state}`;
  if (item && op === 'update') return `${item.ref} → ${item.state}`;
  if (item) return `${item.ref} · ${item.state} · ${item.title}`;
  return text.split('\n', 1)[0] ?? '';
}

/** What the model reads about `backlog`: the description says what it is, `op` owns the operations, the guidelines only when to use it. */
function backlogPrompt(subagent: boolean): { description: string; ops: string; promptSnippet: string; promptGuidelines: string[] } {
  const description =
    'Track repository work across sessions. An item has a title, a goal (what done means) and a body; states: backlog = proposed, todo = accepted, ongoing = claimed, done. ' +
    'Changes and times are logged automatically. ' +
    (subagent ? 'A subagent proposes items and updates only items its parent has claimed. ' : 'An item another running session holds takes only notes. ') +
    'Text that looks like a secret is refused.';
  const ops =
    'list: items (default ongoing+todo; filter with states, query, from); get: one item with goal, body, times, origin, derived items, notes and changes; list/get: follow Next for more; ' +
    (subagent
      ? 'add: propose an item (state backlog); update: set state ongoing or done, or log progress with a note alone'
      : 'add: new item (state backlog unless given); update: change an item (state ongoing claims it for you; a note alone logs progress); remove: delete an item and its notes, only a duplicate or one the user asked to drop');
  return {
    description,
    ops,
    promptSnippet: subagent ? 'Record progress on claimed items; propose follow-ups' : 'Propose, claim and close repository tasks',
    promptGuidelines: subagent
      ? ['Use backlog to note progress on the item your parent gave you and to propose follow-ups you find (from: that item, with a goal) instead of doing them; mark it done only after verifying its goal, noting what changed and how.']
      : [
          'Use backlog for work that outlives this turn: propose follow-ups you discover (from: their source item, with a goal) and claim an item when you start it; steps of the current task need no item.',
          'Close an item only after verifying its goal, with a note on what changed and how it was verified.',
        ],
  };
}

/** The states a subagent may set: claiming and closing items its parent holds. */
const SUBAGENT_STATES = ['ongoing', 'done'] as const;

export function registerBacklogTool(pi: ExtensionAPI, options: BacklogOptions & { changed?: (ctx: ExtensionContext) => void }): void {
  const subagent = options.isSubagent;
  const { ops, ...prompt } = backlogPrompt(subagent);
  pi.registerTool(timedTool({
    name: 'backlog',
    label: 'Backlog',
    ...prompt,
    parameters: Type.Object({
      op: StringEnum(subagent ? ['list', 'get', 'add', 'update'] as const : ['list', 'get', 'add', 'update', 'remove'] as const, { description: ops }),
      id: Type.Optional(Type.String({ description: `${subagent ? 'get/update' : 'get/update/remove'}: item id, e.g. "B12"` })),
      title: Type.Optional(Type.String({ maxLength: TITLE_MAX, description: `${subagent ? 'add' : 'add/update'}: one-line summary` })),
      goal: Type.Optional(Type.String({ maxLength: GOAL_MAX, description: `${subagent ? 'add' : 'add/update'}: what done means, one checkable outcome, e.g. "the board shows each item's goal; yarn test passes"` })),
      body: Type.Optional(Type.String({ maxLength: BODY_MAX, description: `${subagent ? 'add' : 'add/update'}: why it matters, evidence (paths, measurements), plan` })),
      state: Type.Optional(subagent ? StringEnum(SUBAGENT_STATES, { description: 'update: ongoing or done' }) : StringEnum(STATES, { description: 'add: initial state (default backlog); update: new state' })),
      priority: Type.Optional(StringEnum(PRIORITIES, { description: `${subagent ? 'add' : 'add/update'}: p0 urgent … p3 someday (default p2)` })),
      tags: Type.Optional(Type.Array(Type.String(), { maxItems: TAGS_MAX, description: `${subagent ? 'add' : 'add/update'}: short labels, e.g. ["docs"]` })),
      from: Type.Optional(Type.String({ description: `${subagent ? 'add' : 'add/update'}: the item this came from (split, follow-up, finding), e.g. "B12"${subagent ? '' : '; update "" clears'}; list: items derived from it` })),
      note: Type.Optional(Type.String({ maxLength: NOTE_MAX, description: `${subagent ? 'update' : 'update, or add with state ongoing/done'}: appended to the item log: why, or what you found` })),
      query: Type.Optional(Type.String({ description: 'list: text in titles, goals and bodies, or a whole tag' })),
      states: Type.Optional(Type.Array(StringEnum(STATES), { description: 'list: states to show (default ongoing, todo)' })),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, description: `list/get: page size (items default ${DEFAULT_LIST_LIMIT}, notes default 10)` })),
      offset: Type.Optional(Type.Integer({ minimum: 0, description: 'list/get: items or newest notes to skip; copy from Next (default 0)' })),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      signal?.throwIfAborted();
      const backlog = openBacklog(ctx, options);
      try {
        return run(backlog, params);
      } finally {
        options.changed?.(ctx);
      }
    },
    renderCall(args, theme, context) {
      const target = [args.op, args.id, args.state ? `→ ${args.state}` : '', args.from ? `from ${clip(String(args.from), 20)}` : '', args.title ? `"${clip(String(args.title), 80)}"` : '', args.query ? `"${clip(String(args.query), 80)}"` : ''].filter(Boolean).join(' ');
      return toolHeader(theme, context, 'Backlog', target);
    },
    renderResult(result, _options, theme, context) {
      const text = result.content.map((part) => (part.type === 'text' ? part.text : '')).join('\n');
      const details = (result.details ?? {}) as BacklogToolDetails;
      const summary = context.isError ? (text.split('\n', 1)[0] ?? '') : backlogSummary(context.args?.op, details, text);
      const firstIsSummary = context.isError || (context.args?.op !== 'list' && context.args?.op !== 'get');
      return resultBlock(theme, context, { summary, body: firstIsSummary ? text.split('\n').slice(1).join('\n') : text, ...timingOf(result.details) });
    },
  }, { exclusive: true }));

  type Params = { op: 'list' | 'get' | 'add' | 'update' | 'remove'; id?: string; title?: string; goal?: string; body?: string; state?: State; priority?: string; tags?: string[]; from?: string; note?: string; query?: string; states?: State[]; limit?: number; offset?: number };

  function run({ store, actor, session }: Backlog, params: Params) {
    const priority = params.priority === undefined ? undefined : PRIORITIES.indexOf(params.priority as (typeof PRIORITIES)[number]);
    if (params.op === 'list') {
      const states = params.states?.length ? params.states : DEFAULT_LIST_STATES;
      const limit = params.limit ?? DEFAULT_LIST_LIMIT;
      const offset = params.offset ?? 0;
      const filters = { ...(params.query ? { query: params.query } : {}), ...(params.from ? { from: params.from } : {}) };
      const { items, total } = store.list({ states, ...filters, limit, offset });
      const lines = items.map((item) => itemLine(item, actor.id, actor.owners));
      if (lines.length === 0) lines.push(`No ${states.join('/')} items${params.query ? ` matching "${sanitizeTerminalText(params.query)}"` : ''}${params.from ? ` from ${sanitizeTerminalText(params.from)}` : ''}.`);
      if (total > offset + items.length) lines.push(`Next: backlog ${JSON.stringify({ op: 'list', states, ...filters, limit, offset: offset + items.length })}`);
      const triage = states.includes('backlog') ? 0 : store.counts().backlog;
      if (triage > 0) lines.push(`${triage} proposed item(s) await triage (list with states: ["backlog"]).`);
      return textResult(lines.join('\n'), { shown: items.length, total } as BacklogToolDetails);
    }
    if (params.op === 'add') {
      if (!params.title?.trim()) throw new Error('add needs a title.');
      // A subagent proposes; the user or the parent accepts.
      const wanted = subagent ? 'backlog' : (params.state ?? 'backlog');
      // The note is stored by a second step: every refusal comes first, so a retry never leaves a duplicate behind.
      refuseSecrets({ note: params.note });
      if (params.note !== undefined && subagent) {
        // A proposal is not claimed by the parent, so a follow-up update with the note would be refused too.
        throw new Error('A subagent adds without a note: put the details in body.');
      }
      if (params.note !== undefined && wanted !== 'ongoing' && wanted !== 'done') {
        throw new Error('add takes a note only with state ongoing or done; put details in body, or add then update with the note.');
      }
      if (wanted === 'done' && !params.note?.trim()) throw new Error(DONE_NOTE);
      let item = store.add({
        title: params.title,
        ...(params.goal !== undefined ? { goal: params.goal } : {}),
        ...(params.body !== undefined ? { body: params.body } : {}),
        state: wanted === 'ongoing' || wanted === 'done' ? 'todo' : wanted,
        ...(priority !== undefined ? { priority } : {}),
        ...(params.tags ? { tags: params.tags } : {}),
        ...(params.from ? { from: params.from } : {}),
        createdBy: subagent ? `agent:${actor.id}` : 'agent',
        sourceSession: session,
      });
      if (wanted === 'ongoing' || wanted === 'done') {
        item = store.update(item.ref, { state: wanted, ...(params.note ? { note: params.note } : {}) }, actor);
      }
      return textResult(`Added ${itemLine(item, actor.id, actor.owners)}`, { item } as BacklogToolDetails);
    }
    if (!params.id?.trim()) throw new Error(`${params.op} needs an id, e.g. "B12".`);
    if (params.op === 'get') {
      const item = store.get(params.id);
      if (!item) throw new Error(`No backlog item ${sanitizeTerminalText(params.id)}.`);
      const offset = params.offset ?? 0;
      const limit = params.limit ?? 10;
      const notes = store.notes(item, limit, offset);
      const total = store.noteCount(item);
      const origin = item.from === undefined ? undefined : store.get(item.from);
      const detail = itemDetail(item, notes, total, Date.now(), {
        self: actor.id,
        noteOffset: offset,
        ...(actor.owners ? { parents: actor.owners } : {}),
        ...(origin ? { origin } : {}),
        derived: store.derived(item),
      });
      const next = offset + notes.length < total ? `\nNext: backlog ${JSON.stringify({ op: 'get', id: item.ref, limit, offset: offset + notes.length })}` : '';
      return textResult(`${detail}${next}`, { item } as BacklogToolDetails);
    }
    if (params.op === 'remove') {
      if (subagent) throw new Error('A subagent cannot remove backlog items; report it to your parent.');
      const item = store.remove(params.id, undefined, actor);
      return textResult(`Removed ${item.ref} "${sanitizeTerminalText(item.title)}" and its notes.`, { removed: item.ref } as BacklogToolDetails);
    }
    const fields = { title: params.title, goal: params.goal, body: params.body, priority, tags: params.tags, from: params.from };
    if (subagent && Object.values(fields).some((value) => value !== undefined)) throw new Error('A subagent changes only the state and notes of an item; report other changes to your parent.');
    // Moving an item back to todo or backlog would release the parent's claim behind its back.
    if (subagent && (params.state === 'todo' || params.state === 'backlog')) throw new Error(`A subagent sets only ongoing or done; ask your parent to move an item to ${params.state}.`);
    if (params.state === undefined && params.note === undefined && Object.values(fields).every((value) => value === undefined)) throw new Error('update needs something to change: state, note, title, goal, body, priority, tags or from.');
    const current = store.get(params.id);
    if (params.state === 'done' && current?.state !== 'done' && !params.note?.trim()) throw new Error(DONE_NOTE);
    const item = store.update(
      params.id,
      {
        ...(params.title !== undefined ? { title: params.title } : {}),
        ...(params.goal !== undefined ? { goal: params.goal } : {}),
        ...(params.body !== undefined ? { body: params.body } : {}),
        ...(params.state !== undefined ? { state: params.state } : {}),
        ...(priority !== undefined ? { priority } : {}),
        ...(params.tags !== undefined ? { tags: params.tags } : {}),
        ...(params.from !== undefined ? { from: params.from.trim() === '' ? null : params.from } : {}),
        ...(params.note !== undefined ? { note: params.note } : {}),
      },
      actor,
    );
    return textResult(`Updated ${itemLine(item, actor.id, actor.owners)}`, { item } as BacklogToolDetails);
  }
}
