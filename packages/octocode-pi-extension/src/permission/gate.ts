import path from 'node:path';
import type { ExtensionContext, ToolAnnotations, ToolCallEvent, ToolCallEventResult } from '@earendil-works/pi-coding-agent';
import { canonicalPath, isWithin, octocodeHome, resolveToolPath, workspaceRoot } from '../shared/home.js';
import type { Permission } from './ask.js';
import type { PermissionRequest } from './request.js';
import type { AskReason } from './mode.js';
import { isMcpTool } from '../shared/octocode-tools.js';
import type { Classification } from '../shared/winclassify.js';
import { classifyPowerShell } from '../shared/winhelper.js';
import { catastrophicCommand, SHELL_TOOLS, simpleCommand } from './shell.js';

/**
 * The permission step of the `tool_call` pipeline, after the invariants and the PreToolUse hooks. A provenance hit
 * and a hook's `ask` are reasons that tighten the call's effect: one dialog names that effect, and one yes covers the
 * call. In full no reason asks, but each is recorded with the call. A call with no effect class still asks when a
 * reason forces it. Octocode's own tools that need data only they have (the `file` review, memory scope, a web URL's or
 * browser page's host, an upload's paths, the subagent profile) call `Permission.check` from inside their `execute`
 * instead, so nothing is asked twice.
 */

/** A gate's result: a block, or an `ask` a later gate turns into a question (PreToolUse `permissionDecision: "ask"`). */
export type GateVerdict = ToolCallEventResult & { ask?: string };

/** Pi's tools that read a path: `read` takes `path`; `grep`, `find` and `ls` default to the working directory. */
const READ_TOOLS = new Set(['read', 'grep', 'find', 'ls']);
/** Pi's own file changers (active with `--tools edit,write`); Octocode's `file` tool checks itself. */
const CHANGE_TOOLS = new Set(['edit', 'write']);
/** Browser actions that act on the page; the others read the page or manage tabs. `navigate`, `tab` with a `url` and `upload` are checked by the browser tool, which knows the host and the paths. */
const BROWSER_ACTS = new Set(['click', 'hover', 'drag', 'type', 'fill', 'press', 'download', 'dialog']);
/** Browser actions that take control of a browser: the user's own Chrome, arbitrary script in the page. Each is a `browser.control` ask. */
const BROWSER_CONTROL = new Set(['evaluate', 'attach']);

/** Conflicting hints keep the consequential classification in both permission and provenance checks. */
export const readOnlyMcp = (hint: ToolAnnotations | undefined): boolean => hint?.readOnlyHint === true && hint.destructiveHint !== true;

/**
 * Repository paths that load code, hooks or agent instructions in later sessions (git config, Pi, Claude Code, Codex
 * and Octocode project config, skills): a change there outlives the session, so it asks like an outside change.
 */
const RUNS_LATER_AT_ROOT = ['.git', '.pi', '.claude', '.codex', '.agents', '.octocode/hooks.json', '.octocode/agents', '.octocode/skills'];
/** Paths that run or load code at any depth (a nested repository's hooks, a package's `.husky`, a folder's `.envrc`). */
const RUNS_LATER_ANYWHERE = ['.git/hooks', '.husky', '.github/workflows', '.vscode/tasks.json', '.envrc'];

export function runsLater(file: string, root: string): boolean {
  const relative = path.relative(root, file).split(path.sep).join('/');
  const rooted = RUNS_LATER_AT_ROOT.some((entry) => relative === entry || relative.startsWith(`${entry}/`));
  return rooted || RUNS_LATER_ANYWHERE.some((entry) => `/${relative}`.endsWith(`/${entry}`) || `/${relative}`.includes(`/${entry}/`));
}

/** The refusal for a change inside Octocode's state folder (its trust store, agent database, config), in every mode. */
export function stateFolderRefusal(file: string, shown: string, tool: string): string | undefined {
  if (!isWithin(canonicalPath(file), canonicalPath(octocodeHome()))) return undefined;
  return `${shown} is in Octocode's state folder; ${tool} does not change it. Ask the user to change it themselves.`;
}

/** Whether `command` is a shell command a destructive pattern matches, relative targets resolved against `cwd`: a `shell.destructive` call, ask each time. */
const destructive = (command: string, cwd: string): boolean => catastrophicCommand(command, cwd) !== undefined;

/**
 * Whether a `powershell` command is `shell.destructive`: the helper flagged it, or could not parse it (no PowerShell, a
 * syntax error), which fails closed. A command it parsed cleanly and did not flag is an ordinary `shell` call.
 */
export async function powershellDestructive(command: string, classifier: (command: string) => Promise<Classification> = classifyPowerShell): Promise<boolean> {
  const verdict = await classifier(command);
  return !verdict.parsed || verdict.destructive !== undefined;
}

const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
/** The call's arguments, whole: the user approves exactly what is shown. */
const args = (input: Record<string, unknown>): string => JSON.stringify(input);

/** The folder grant for `file`: "changes under <dir>". */
const dirGrant = (file: string, verb: string) => {
  const dir = path.dirname(file);
  return { key: dir, label: `${verb} under ${dir}` };
};

/** What a call is, as a permission request; undefined when no mode asks about it. */
export function classify(event: ToolCallEvent, ctx: Pick<ExtensionContext, 'cwd'>, annotations: (toolName: string) => ToolAnnotations | undefined, forceDestructive = false): PermissionRequest | undefined {
  const request = classOf(event.toolName, event.input as Record<string, unknown>, ctx.cwd, annotations, forceDestructive);
  return request ? { ...request, toolCallId: event.toolCallId, cwd: ctx.cwd, ...(event.parentToolCallId ? { nested: true } : {}) } : undefined;
}

function classOf(tool: string, input: Record<string, unknown>, cwd: string, annotations: (toolName: string) => ToolAnnotations | undefined, forceDestructive: boolean): PermissionRequest | undefined {
  const inRepo = (raw: string) => {
    const file = canonicalPath(resolveToolPath(cwd, raw));
    const root = workspaceRoot(cwd);
    return { file, root, inside: root !== undefined && isWithin(file, root) };
  };
  if (SHELL_TOOLS.has(tool)) {
    const command = text(input['command']) ?? '';
    const simple = simpleCommand(command);
    if (forceDestructive || destructive(command, cwd)) return { action: 'shell.destructive', title: 'Run this destructive command?', what: [command, `cwd: ${cwd}`] };
    const grant = simple ? { key: JSON.stringify([tool, canonicalPath(cwd), simple]), label: `\`${simple}\` with ${tool} in ${cwd}` } : undefined;
    return { action: 'shell', title: 'Run this command?', what: [command, `cwd: ${cwd}`], ...(grant ? { grant } : {}) };
  }
  if (CHANGE_TOOLS.has(tool) && text(input['path'])) {
    const { file, root, inside } = inRepo(text(input['path'])!);
    if (inside && runsLater(file, root!)) {
      return { action: 'file.outside', title: 'Change a file that runs in later sessions?', what: [`${tool} ${file}`], reason: 'it loads code, hooks or instructions in later sessions', grant: dirGrant(file, 'file changes') };
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
    // A URL is checked by the web tool, which resolves its host: public is `web`, private is `net.private`.
    if (text(input['url'])) return undefined;
    return { action: 'web', title: 'Search the web?', what: [text(input['query']) ?? ''], grant: { key: 'search', label: 'web searches' } };
  }
  if (tool === 'browser') {
    const action = text(input['action']) ?? '';
    if (BROWSER_CONTROL.has(action)) return { action: 'browser.control', title: action === 'attach' ? 'Attach to a browser?' : 'Run script in the page?', what: [`${action} ${args(input)}`] };
    if (!BROWSER_ACTS.has(action)) return undefined;
    // A page action is granted per kind: the gate cannot see the page's host.
    return { action: 'browser', title: 'Act on the page?', what: [`${action} ${args(input)}`], grant: { key: `page ${action}`, label: `browser ${action} on any page` } };
  }
  if (isMcpTool(tool)) {
    const hint = annotations(tool);
    if (readOnlyMcp(hint)) return undefined;
    // Only an explicit `destructiveHint: true` is destructive (asks each time, in workspace too). MCP's own default calls an
    // unannotated tool destructive; treating it so would ask on every call with no session grant (FEATURES: known limits).
    const marked = hint?.destructiveHint === true;
    return {
      action: marked ? 'mcp.destructive' : 'mcp.write',
      title: marked ? 'Run this destructive MCP tool?' : 'Run this MCP tool?',
      what: [tool, args(input)],
      grant: { key: tool, label: tool },
    };
  }
  return undefined;
}

interface PermissionGateOptions {
  permission: Permission;
  /** The provenance tripwire's check (`permission/provenance`). */
  provenance: { check(event: ToolCallEvent, ctx: { cwd: string }): { why: string } | undefined };
  annotations: (toolName: string) => ToolAnnotations | undefined;
  /** Whether a PowerShell command is `shell.destructive`; the Windows helper's parse by default (replaceable in tests). */
  powershell?: (command: string) => Promise<boolean>;
}

/** The `tool_call` gate: every call with an effect class (or a reason) reaches `Permission.check`, which applies the mode, records the call and asks when it must. A user's yes covers the call. */
export function permissionGate(options: PermissionGateOptions) {
  const { permission, provenance, annotations, powershell = powershellDestructive } = options;
  return async (event: ToolCallEvent, ctx: ExtensionContext, prior?: GateVerdict): Promise<ToolCallEventResult | undefined> => {
    const input = event.input as Record<string, unknown>;
    const target = CHANGE_TOOLS.has(event.toolName) ? text(input['path']) : undefined;
    const refused = target && stateFolderRefusal(resolveToolPath(ctx.cwd, target), target, `Pi ${event.toolName}`);
    if (refused) {
      permission.refused([`${event.toolName} ${target}`], refused, event.toolName);
      return { block: true, reason: refused };
    }
    // PowerShell's grammar is parsed by the Windows helper (async); classify itself stays synchronous.
    const forceDestructive = event.toolName === 'powershell' && (await powershell(text(input['command']) ?? ''));
    const request = classify(event, ctx, annotations, forceDestructive);
    const hit = provenance.check(event, ctx);
    const reasons: AskReason[] = [...(hit ? (['provenance'] as const) : []), ...(prior?.ask ? (['hook.ask'] as const) : [])];
    const reason = [hit?.why, prior?.ask].filter(Boolean).join('\n');
    const call: PermissionRequest | undefined =
      reasons.length > 0
        ? {
            ...(request ?? { title: `Run ${event.toolName}?`, what: [`${event.toolName} ${args(input)}`], toolCallId: event.toolCallId, ...(event.parentToolCallId ? { nested: true } : {}) }),
            reasons,
            ...(reason ? { reason: [request?.reason, reason].filter(Boolean).join('\n') } : {}),
          }
        : request;
    if (!call) return undefined;
    const verdict = await permission.check(ctx, { ...call, ...(ctx.signal ? { signal: ctx.signal } : {}) });
    return verdict.allowed ? undefined : { block: true, reason: verdict.message };
  };
}
