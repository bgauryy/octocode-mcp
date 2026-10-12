import type { AgentToolResult, ToolAnnotations as PiToolAnnotations, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { toLlmContent, type CallToolResult, type Tool } from '@earendil-works/pi-mcp';
import type { TSchema } from 'typebox';
import { clip, queryTarget, resultBlock, resultText, timedTool, timingOf, toolHeader } from '../shared/render.js';
import { sanitizeTerminalText } from '../shared/sanitize.js';
import { boundImagePart, capOutputToFile } from '../shared/spill.js';
import { isRecord } from '../shared/util.js';

/** What the extension registers a server's tool as. */
export interface ToolBinding {
  /** Pi's tool name prefix for the server, `mcp__octocode__`. */
  prefix: string;
  /** The tools' namespace: the server's name and its instructions. */
  namespace: NonNullable<ToolDefinition['namespace']>;
  call(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<CallToolResult>;
}

/** Hints the server gave about the tool, as Pi's annotations (booleans only: nothing else is a hint). */
function annotations(tool: Tool): PiToolAnnotations | undefined {
  const hints = tool.annotations;
  if (!hints) return undefined;
  const picked: PiToolAnnotations = {};
  for (const key of ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'] as const) {
    if (typeof hints[key] === 'boolean') picked[key] = hints[key];
  }
  return Object.keys(picked).length > 0 ? picked : undefined;
}

/** Text one result part may put in the context whole: about 50,000 tokens. */
const TEXT_MAX_BYTES = 200_000;
const TEXT_MAX_LINES = 10_000;

/**
 * A tool result for Pi. Text and images pass through, embedded text resources become text and other blocks a short
 * placeholder (`toLlmContent`). A server bounds and pages its own output and a cut can hide the continuation inside
 * it, so text is left whole up to `TEXT_MAX_BYTES`; a longer part is saved whole to the session's `output/` folder and
 * replaced by its head and tail plus the file's path. An image over `IMAGE_MAX_CHARS` is saved and replaced by a note
 * naming the file: a gateway rejects a request of a few MB (HTTP 413). Repository, GitHub and registry text is untrusted: terminal control
 * sequences, bidi overrides and invisible characters (Unicode tags among them) are stripped from every string before
 * the model reads it or the terminal draws it. `structuredContent` is the server's, kept for tools that declare an
 * `outputSchema`. An error result is the server's text as an error.
 */
export function toToolResult(tool: string, result: CallToolResult, declaresOutput: boolean): AgentToolResult<{ tool: string }> {
  const content = (sanitizeJson(toLlmContent(result)) as ReturnType<typeof toLlmContent>).map((part) =>
    part.type === 'text' ? { ...part, text: capOutputToFile(part.text, { label: `mcp ${tool}`, maxBytes: TEXT_MAX_BYTES, maxLines: TEXT_MAX_LINES }) } : part.type === 'image' ? boundImagePart(part, `mcp ${tool} image`) : part,
  );
  if (result.isError && content.length === 0) content.push({ type: 'text', text: `${tool} failed without a message.` });
  return {
    content,
    details: { tool },
    ...(declaresOutput && result.structuredContent !== undefined ? { structuredContent: sanitizeJson(result.structuredContent) as AgentToolResult['structuredContent'] } : {}),
    ...(result.isError ? { isError: true } : {}),
  };
}

/** Every string in a JSON value, sanitized; the same object when nothing changed. */
export function sanitizeJson(value: unknown): unknown {
  if (typeof value === 'string') return sanitizeTerminalText(value);
  if (Array.isArray(value)) {
    const next = value.map(sanitizeJson);
    return next.some((item, i) => item !== value[i]) ? next : value;
  }
  if (value && typeof value === 'object') {
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      next[key] = sanitizeJson(item);
      if (next[key] !== item) changed = true;
    }
    return changed ? next : value;
  }
  return value;
}

/** The call's header: the tool name, then what its first query looks for; a batch adds one line per query. */
function callSummary(args: unknown): { summary: string; queries: string[] } {
  const queries = isRecord(args) && Array.isArray(args['queries']) ? args['queries'].filter(isRecord) : [];
  const targets = queries.map((query) => clip(queryTarget(query), 200));
  return { summary: targets.length === 1 ? targets[0]! : targets.length > 1 ? `${targets.length} queries` : '', queries: targets.length > 1 ? targets : [] };
}

/**
 * The Pi tool for one tool the server lists. Its input schema is the server's JSON Schema as is (Pi validates calls
 * against it), and every definition is `direct`: declared to the model from the first request, no `tool_search` step.
 */
export function octocodeToolDefinition(tool: Tool, binding: ToolBinding): ToolDefinition {
  const hints = annotations(tool);
  const declaresOutput = tool.outputSchema !== undefined;
  return timedTool({
    name: `${binding.prefix}${tool.name}`,
    label: tool.title?.trim() || tool.name,
    description: tool.description?.trim() || tool.title?.trim() || `Octocode tool ${tool.name}`,
    parameters: tool.inputSchema as unknown as TSchema,
    ...(declaresOutput ? { outputSchema: tool.outputSchema as unknown as TSchema } : {}),
    exposure: 'direct',
    namespace: binding.namespace,
    ...(hints ? { annotations: hints } : {}),
    renderCall(args, theme, context) {
      const { summary, queries } = callSummary(args);
      const lines = queries.map((query) => `${theme.fg('mdCode', query)}`);
      return toolHeader(theme, context, tool.name, summary, { lines });
    },
    renderResult(result, _options, theme, context) {
      const text = resultText(result);
      // An error is one message: its first line is the summary, the rest the body.
      const failed = context.isError === true;
      return resultBlock(theme, context, { summary: failed ? text : '', body: failed ? text.split('\n').slice(1).join('\n') : text, ...timingOf(result.details) });
    },
    async execute(_toolCallId, params, signal) {
      return toToolResult(tool.name, await binding.call(tool.name, isRecord(params) ? params : {}, signal), declaresOutput);
    },
  });
}
