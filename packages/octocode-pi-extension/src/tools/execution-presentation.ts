import { stripVTControlCharacters } from 'node:util';
import { redactCompactionText } from './compaction-redaction.js';
import type { ExecutionUsage } from './execution-events.js';

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function executionLabel(value: unknown, limit = 180): string {
  return typeof value === 'string'
    ? redactCompactionText(stripVTControlCharacters(value))
        .split('')
        .map(character =>
          character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
            ? ' '
            : character
        )
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, limit)
    : '';
}
export function executionQueries(args: unknown): Record<string, unknown>[] {
  const envelope = record(args);
  return Array.isArray(envelope.queries)
    ? envelope.queries.map(record)
    : [envelope];
}

/** Pi providers report cost as a breakdown; the journal stores only known totals. */
export function executionUsage(value: unknown): ExecutionUsage {
  const usage = record(value);
  const result: ExecutionUsage = {};
  for (const key of [
    'input',
    'output',
    'cacheRead',
    'cacheWrite',
    'cost',
  ] as const) {
    const count =
      key === 'cost' && typeof usage.cost !== 'number'
        ? record(usage.cost).total
        : usage[key];
    if (typeof count === 'number' && Number.isFinite(count) && count >= 0)
      result[key] = count;
  }
  return result;
}

/** Display intent using known fields only; never stringify arbitrary tool input. */
export function executionToolTitle(tool: string, args: unknown): string {
  const queries = executionQueries(args);
  const q = queries[0] ?? {};
  const suffix = queries.length > 1 ? ` · ${queries.length} queries` : '';
  const path = executionLabel(q.path ?? q.uri, 100);
  const operation = executionLabel(q.operation ?? q.type ?? q.action, 40);
  let title: string;
  if (tool === 'MCPTool') {
    const innerTool = executionLabel(q.tool, 64);
    const inner = q.arguments ?? q.args ?? q.input;
    title =
      innerTool && inner
        ? executionToolTitle(innerTool, inner)
        : [q.action === 'describe' ? 'Describe' : 'MCP', q.server, innerTool]
            .filter(Boolean)
            .join(' ');
  } else if (tool === 'bash')
    title = `Bash ${executionLabel(q.command ?? q.cmd)}`;
  else if (tool === 'file')
    title = `${q.type === 'edit' ? 'Edit' : q.type === 'write' ? 'Write' : q.type === 'delete' ? 'Delete' : 'File'} ${path}`;
  else if (tool === 'skill')
    title = `Skill ${executionLabel(q.name ?? q.skillType ?? q.action)}`;
  else if (tool === 'localGetFileContent' || tool === 'ghGetFileContent')
    title = `Read ${path}${q.startLine ? `:${q.startLine}${q.endLine ? `-${q.endLine}` : ''}` : ''}`;
  else if (tool === 'localSearch' || tool === 'astSearch' || tool === 'ghSearch')
    title = `${operation === 'tree' || operation === 'files' ? 'Browse' : 'Search'} ${executionLabel(q.searchText ?? q.pattern ?? (Array.isArray(q.keywords) ? q.keywords.join(' ') : ''))}${path ? ` ${path}` : ''}`;
  else if (tool === 'lspSearch')
    title = `${operation || 'Inspect'} ${executionLabel(q.symbolName)} ${path}`;
  else if (tool === 'askUser')
    title = `Question ${executionLabel(q.question ?? q.title)}`;
  else if (tool === 'agent')
    title = `Agent ${operation} ${executionLabel(q.name ?? q.agentId ?? q.task, 120)}`;
  else if (tool === 'plan') title = `Plan ${operation}`;
  else if (tool === 'web') title = `Web ${executionLabel(q.query ?? q.url)}`;
  else
    title = `${executionLabel(tool, 64)} ${operation}${path ? ` ${path}` : ''}`;
  return executionLabel(title, 180) + suffix;
}

export function executionResultSummary(
  result: unknown,
  isError: boolean
): string {
  const value = record(result);
  const details = record(value.details);
  if (Array.isArray(details.results)) {
    const rows = details.results.map(record);
    const succeeded = rows.filter(row => row.status === 'success').length;
    const failed = rows.filter(row => row.status === 'failed').length;
    const skipped = rows.filter(row => row.status === 'not-run').length;
    if (succeeded + failed + skipped > 0)
      return [
        succeeded ? `${succeeded} succeeded` : '',
        failed ? `${failed} failed` : '',
        skipped ? `${skipped} not run` : '',
      ]
        .filter(Boolean)
        .join(' · ');
  }
  if (typeof details.summary === 'string')
    return executionLabel(details.summary);
  if (typeof details.bytes === 'number') return `${details.bytes} bytes`;
  if (typeof details.replacements === 'number')
    return `${details.replacements} replacements`;
  for (const block of Array.isArray(value.content) ? value.content : []) {
    const text = record(block).text;
    if (typeof text !== 'string') continue;
    const line = text.split('\n').find(line => line.trim());
    if (line) return executionLabel(line);
  }
  const exit = details.exitCode ?? details.code;
  return typeof exit === 'number'
    ? `exit ${exit}`
    : isError
      ? 'Failed · inspect tool result'
      : 'Completed';
}

/** Batch rows carry child details, so partial failures never fabricate successful changes. */
export function executionResultDetails(
  result: unknown
): Array<{ details: Record<string, unknown>; failed: boolean; index: number }> {
  const value = record(result);
  const details = record(value.details);
  return Array.isArray(details.results)
    ? details.results
        .map(record)
        .filter(row => row.status !== 'not-run')
        .map((row, index) => ({
          details: record(row.result),
          failed: row.status === 'failed',
          index: typeof row.index === 'number' ? row.index : index,
        }))
    : [{ details, failed: value.isError === true, index: 0 }];
}
