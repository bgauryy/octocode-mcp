import path from 'node:path';
import type { ExtensionContext, ToolAnnotations, ToolCallEvent, ToolCallEventResult } from '@earendil-works/pi-coding-agent';
import { canonicalPath, isWithin, octocodeHome, repoKey, resolveToolPath } from '../shared/home.js';
import type { Permission, PermissionRequest } from './ask.js';
import { reasonAsks, type AskReason } from './mode.js';
import { SHELL_TOOLS, simpleCommand } from './shell.js';

/**
 * The permission step of the `tool_call` pipeline, after the hard refusals and the PreToolUse hooks. A provenance hit
 * and a hook's `ask` are reasons that tighten the call's effect: one dialog names that effect, and one yes covers the
 * call. Full runs a provenance hit. A hook ask still asks in full, and that dialog leaves the provenance why out.
 * A call with no effect class still asks when a reason forces it. Octocode's own tools that need data only they have
 * (the `file` review, memory scope, a browser page's own loads, the subagent profile) call `Permission.check` from
 * inside their `execute` instead, so nothing is asked twice.
 */

/** A gate's result: a block, or an `ask` a later gate turns into a question (PreToolUse `permissionDecision: "ask"`). */
export type GateVerdict = ToolCallEventResult & { ask?: string };

/** Pi's tools that read a path: `read` takes `path`; `grep`, `find` and `ls` default to the working directory. */
const READ_TOOLS = new Set(['read', 'grep', 'find', 'ls']);
/** Pi's own file changers (active with `--tools edit,write`); Octocode's `file` tool checks itself. */
const CHANGE_TOOLS = new Set(['edit', 'write']);
/** Browser actions that act on the page or its host; the others read the page or manage tabs (`tab` with a `url` opens one). */
const BROWSER_ACTS = new Set(['attach', 'navigate', 'click', 'hover', 'drag', 'type', 'fill', 'press', 'evaluate', 'upload', 'download', 'dialog']);
/** Browser actions too broad to allow for a session: arbitrary script in the page, the user's own Chrome, sending files. */
const BROWSER_EACH_TIME = new Set(['evaluate', 'attach', 'upload']);

/** Conflicting hints keep the consequential classification in both permission and provenance checks. */
export const readOnlyMcp = (hint: ToolAnnotations | undefined): boolean => hint?.readOnlyHint === true && hint.destructiveHint !== true;

/**
 * Repository paths that load code, hooks or agent instructions in later sessions (git hooks and config, Pi, Claude Code,
 * Codex and Octocode project config, skills): a change there outlives the session, so it asks like an outside change.
 */
const RUNS_LATER = ['.git/', '.husky/', '.pi/', '.claude/', '.codex/', '.agents/', '.octocode/hooks.json', '.octocode/agents/', '.octocode/skills/'];

export function runsLater(file: string, root: string): boolean {
  const relative = path.relative(root, file).split(path.sep).join('/');
  return RUNS_LATER.some((prefix) => relative === prefix.replace(/\/$/, '') || relative.startsWith(prefix));
}

/** The refusal for a change inside Octocode's state folder (its trust store, agent database, config), in every mode. */
export function stateFolderRefusal(file: string, shown: string, tool: string): string | undefined {
  if (!isWithin(canonicalPath(file), canonicalPath(octocodeHome()))) return undefined;
  return `${shown} is in Octocode's state folder; ${tool} does not change it. Ask the user to change it themselves.`;
}

const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
/** The call's arguments, whole: the user approves exactly what is shown. */
const args = (input: Record<string, unknown>): string => JSON.stringify(input);

function hostOf(raw: string | undefined): string | undefined {
  try {
    return raw ? new URL(raw).host || undefined : undefined;
  } catch {
    return undefined;
  }
}

/** The folder grant for `file`: "changes under <dir>". */
const dirGrant = (file: string, verb: string) => {
  const dir = path.dirname(file);
  return { key: dir, label: `${verb} under ${dir}` };
};

/** What a call is, as a permission request; undefined when no mode asks about it. */
export function classify(event: ToolCallEvent, ctx: Pick<ExtensionContext, 'cwd'>, annotations: (toolName: string) => ToolAnnotations | undefined): PermissionRequest | undefined {
  const request = classOf(event.toolName, event.input as Record<string, unknown>, ctx.cwd, annotations);
  return request && event.parentToolCallId ? { ...request, nested: true } : request;
}

function classOf(tool: string, input: Record<string, unknown>, cwd: string, annotations: (toolName: string) => ToolAnnotations | undefined): PermissionRequest | undefined {
  const inRepo = (raw: string) => {
    const file = canonicalPath(resolveToolPath(cwd, raw));
    return { file, inside: isWithin(file, repoKey(cwd).root) };
  };
  if (SHELL_TOOLS.has(tool)) {
    const command = text(input['command']) ?? '';
    const simple = simpleCommand(command);
    const grant = simple ? { key: JSON.stringify([tool, canonicalPath(cwd), simple]), label: `\`${simple}\` with ${tool} in ${cwd}` } : undefined;
    return { action: 'shell', title: 'Run this command?', what: [command, `cwd: ${cwd}`], ...(grant ? { grant } : {}) };
  }
  if (CHANGE_TOOLS.has(tool) && text(input['path'])) {
    const { file, inside } = inRepo(text(input['path'])!);
    if (inside && runsLater(file, repoKey(cwd).root)) {
      return { action: 'file.outside', title: 'Change a file that runs in later sessions?', what: [`${tool} ${file}`], why: 'it loads code, hooks or instructions in later sessions', grant: dirGrant(file, 'file changes') };
    }
    return inside
      ? { action: 'file.workspace', title: 'Change this file?', what: [`${tool} ${file}`], grant: dirGrant(file, 'file changes') }
      : { action: 'file.outside', title: 'Change a file outside the workspace?', what: [`${tool} ${file}`], grant: dirGrant(file, 'file changes') };
  }
  if (READ_TOOLS.has(tool)) {
    const { file, inside } = inRepo(text(input['path']) ?? cwd);
    return inside ? undefined : { action: 'read.outside', title: 'Read outside the workspace?', what: [`${tool} ${file}`], grant: dirGrant(file, 'reads') };
  }
  if (tool === 'web') {
    const url = text(input['url']);
    const host = hostOf(url);
    if (url) return { action: 'web', title: 'Fetch this page?', what: [url], ...(host ? { grant: { key: host, label: host } } : {}) };
    return { action: 'web', title: 'Search the web?', what: [text(input['query']) ?? ''], grant: { key: 'search', label: 'web searches' } };
  }
  if (tool === 'browser') {
    const action = text(input['action']) ?? '';
    const opens = action === 'navigate' || (action === 'tab' && text(input['url']) !== undefined);
    if (!opens && !BROWSER_ACTS.has(action)) return undefined;
    const host = opens ? hostOf(text(input['url'])) : undefined;
    // A page action is granted per kind (the gate cannot see the page's host); scripts, attaching and uploads never.
    const grant = host ? { key: `host ${host}`, label: host } : BROWSER_EACH_TIME.has(action) || opens ? undefined : { key: `page ${action}`, label: `browser ${action} on any page` };
    return { action: 'browser', title: opens ? 'Open this page?' : 'Act on the page?', what: [`${action} ${args(input)}`], ...(grant ? { grant } : {}) };
  }
  if (tool.startsWith('mcp__')) {
    const hint = annotations(tool);
    if (readOnlyMcp(hint)) return undefined;
    // Only an explicit `destructiveHint: true` is destructive (asks each time, in workspace too). MCP's own default calls an
    // unannotated tool destructive; treating it so would ask on every call with no session grant (FEATURES: known limits).
    const destructive = hint?.destructiveHint === true;
    return {
      action: destructive ? 'mcp.destructive' : 'mcp.write',
      title: destructive ? 'Run this destructive MCP tool?' : 'Run this MCP tool?',
      what: [tool, args(input)],
      grant: { key: tool, label: tool },
    };
  }
  return undefined;
}

export interface PermissionGateOptions {
  permission: Permission;
  /** The provenance tripwire's check (`permission/provenance`). */
  provenance: { check(event: ToolCallEvent, ctx: { cwd: string }): { why: string } | undefined };
  annotations: (toolName: string) => ToolAnnotations | undefined;
}

/** The `tool_call` gate: reasons that this mode still asks about tighten the effect; otherwise the effect's own rule. A user's yes covers the call. */
export function permissionGate(options: PermissionGateOptions) {
  const { permission, provenance, annotations } = options;
  return async (event: ToolCallEvent, ctx: ExtensionContext, prior?: GateVerdict): Promise<ToolCallEventResult | undefined> => {
    const input = event.input as Record<string, unknown>;
    const target = CHANGE_TOOLS.has(event.toolName) ? text(input['path']) : undefined;
    const refused = target && stateFolderRefusal(resolveToolPath(ctx.cwd, target), target, `Pi ${event.toolName}`);
    if (refused) return { block: true, reason: refused };
    const request = classify(event, ctx, annotations);
    const hit = provenance.check(event, ctx);
    const reasons: AskReason[] = [
      ...(hit && reasonAsks(permission.mode, 'provenance') ? (['provenance'] as const) : []),
      ...(prior?.ask && reasonAsks(permission.mode, 'hook.ask') ? (['hook.ask'] as const) : []),
    ];
    if (reasons.length > 0) {
      const why = [reasons.includes('provenance') ? hit?.why : undefined, reasons.includes('hook.ask') ? prior?.ask : undefined].filter(Boolean).join('\n');
      const tightened: PermissionRequest = {
        ...(request ? { action: request.action, title: request.title, what: request.what } : { title: `Run ${event.toolName}?`, what: [`${event.toolName} ${args(input)}`] }),
        ...(request?.nested || event.parentToolCallId ? { nested: true } : {}),
        ...(ctx.signal ? { signal: ctx.signal } : {}),
        reasons,
        ...(why ? { why } : {}),
      };
      const verdict = await permission.check(ctx, tightened);
      return verdict.allowed ? undefined : { block: true, reason: verdict.message };
    }
    if (!request) return undefined;
    const verdict = await permission.check(ctx, { ...request, ...(ctx.signal ? { signal: ctx.signal } : {}) });
    return verdict.allowed ? undefined : { block: true, reason: verdict.message };
  };
}
