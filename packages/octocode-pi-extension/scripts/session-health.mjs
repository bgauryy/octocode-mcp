#!/usr/bin/env node
/**
 * Session health: reads Pi session transcripts (JSONL) and reports, per session and per segment between compactions,
 * the thinking blocks Anthropic dropped from requests, the prompt-cache hit rate, requests whose cache read fell
 * (a prefix change), and what each compaction cost and kept. Transcripts show what tests cannot: the stale-thinking bug
 * dropped 2,581 blocks in one session while every test passed. How to read it: docs/CONTEXT-AND-COST.md#session-health.
 * Plain Node, no dependencies.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isMain } from './is-main.mjs';

const HELP = `Usage: session-health.mjs [options] [session.jsonl ...]

Reports Pi session transcripts: per session and per segment between compactions, thinking blocks dropped from
requests (count per request, reasons, first path), cache hit rate = cacheRead / (cacheRead + cacheWrite + input),
requests whose cache read fell to 0 or by more than half (a prefix change), and per compaction: tokensBefore,
summary size, method, usage and cost, kept messages, characters and thinking blocks. Without paths it reads the
newest sessions under the sessions folder.

Options:
  --dir <folder>      Sessions folder with <project>/<session>.jsonl inside (default ~/.pi/agent/sessions)
  --limit <n>         Newest n sessions when no paths are given (default 5)
  --session <text>    Keep only sessions whose file path contains text (applied before --limit)
  --json              Print JSON (one document, never paged)
  --page <n>          Text page to print, 1-based (default 1)
  --page-size <n>     Lines per text page (default 200); a footer names the next page
  --help              Show this help
`;

const DEFAULT_LIMIT = 5;
const DEFAULT_PAGE_SIZE = 200;
/** A cache read below this share of the previous request's is a sharp drop. */
const SHARP_DROP = 0.5;

class UsageError extends Error {}

/** Parsed command line. */
export function parseArgs(argv) {
  const options = { paths: [], dir: path.join(os.homedir(), '.pi', 'agent', 'sessions'), limit: DEFAULT_LIMIT, session: undefined, json: false, page: 1, pageSize: DEFAULT_PAGE_SIZE, help: false };
  const number = (flag, value) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) throw new UsageError(`${flag} needs a positive integer, got ${value ?? 'nothing'}`);
    return parsed;
  };
  const text = (flag, value) => {
    if (value === undefined) throw new UsageError(`${flag} needs a value`);
    return value;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--dir') options.dir = text(arg, argv[++i]);
    else if (arg === '--limit') options.limit = number(arg, argv[++i]);
    else if (arg === '--session') options.session = text(arg, argv[++i]);
    else if (arg === '--page') options.page = number(arg, argv[++i]);
    else if (arg === '--page-size') options.pageSize = number(arg, argv[++i]);
    else if (arg.startsWith('-')) throw new UsageError(`unknown option ${arg}`);
    else options.paths.push(arg);
  }
  return options;
}

/** Every `<dir>/<project>/*.jsonl`, newest modification first. Folder names start with `--`, so no shell glob. */
export function newestSessionFiles(dir) {
  const found = [];
  let projects;
  try {
    projects = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    throw new Error(`cannot read sessions folder ${dir}: ${error.message}`);
  }
  for (const project of projects) {
    if (!project.isDirectory()) continue;
    const folder = path.join(dir, project.name);
    for (const name of fs.readdirSync(folder)) {
      if (!name.endsWith('.jsonl')) continue;
      const file = path.join(folder, name);
      found.push({ file, mtime: fs.statSync(file).mtimeMs });
    }
  }
  return found.sort((a, b) => b.mtime - a.mtime || a.file.localeCompare(b.file)).map((entry) => entry.file);
}

const sum = (values) => values.reduce((total, value) => total + value, 0);
const count = (map, key, by = 1) => { map[key] = (map[key] ?? 0) + by; };

/** The usage fields of an assistant message, or undefined when it recorded none. */
function usageOf(message) {
  const usage = message?.usage;
  if (!usage || typeof usage !== 'object') return undefined;
  return { input: usage.input ?? 0, output: usage.output ?? 0, cacheRead: usage.cacheRead ?? 0, cacheWrite: usage.cacheWrite ?? 0, cost: usage.cost?.total ?? 0 };
}

/** Anthropic input transformations recorded on an assistant message. */
function transformationsOf(message) {
  const found = [];
  for (const diagnostic of message.diagnostics ?? []) {
    for (const transformation of diagnostic?.details?.transformations ?? []) found.push(transformation);
  }
  return found;
}

/** Characters of a message's content: text and thinking blocks, tool call arguments as JSON, tool result text, image data. */
function contentChars(content) {
  if (typeof content === 'string') return content.length;
  if (!Array.isArray(content)) return 0;
  let chars = 0;
  for (const block of content) {
    if (typeof block?.text === 'string') chars += block.text.length;
    else if (typeof block?.thinking === 'string') chars += block.thinking.length;
    else if (block?.type === 'toolCall') chars += JSON.stringify(block.arguments ?? {}).length;
    else if (typeof block?.data === 'string') chars += block.data.length;
  }
  return chars;
}

const thinkingBlocks = (content) => (Array.isArray(content) ? content.filter((block) => block?.type === 'thinking').length : 0);

/** Hit rate of cache reads among all prompt tokens, or null with none. */
function hitRate({ input, cacheRead, cacheWrite }) {
  const prompt = input + cacheRead + cacheWrite;
  return prompt === 0 ? null : cacheRead / prompt;
}

/** Totals, thinking-drop and cache statistics of a group of requests. */
function summarize(requests) {
  const usage = { input: sum(requests.map((r) => r.input)), output: sum(requests.map((r) => r.output)), cacheRead: sum(requests.map((r) => r.cacheRead)), cacheWrite: sum(requests.map((r) => r.cacheWrite)) };
  const drops = requests.map((r) => r.drops.length);
  const reasons = {};
  const otherTransformations = {};
  for (const request of requests) {
    for (const dropped of request.drops) count(reasons, dropped.reason ?? 'unknown');
    for (const type of request.otherTransformations) count(otherTransformations, type);
  }
  const min = drops.length ? Math.min(...drops) : 0;
  const max = drops.length ? Math.max(...drops) : 0;
  return {
    requests: requests.length,
    usage,
    cost: sum(requests.map((r) => r.cost)),
    cacheHitRate: hitRate(usage),
    thinkingDrops: {
      total: sum(drops),
      min,
      max,
      constant: min === max,
      requestsWithDrops: drops.filter((n) => n > 0).length,
      reasons,
      otherTransformations,
      firstPath: requests.flatMap((r) => r.drops).find((d) => d.path)?.path ?? null,
    },
  };
}

/** Requests whose cache read fell to 0 or below half of the previous request's. */
function findCacheResets(requests, previous) {
  const resets = [];
  let before = previous;
  for (const request of requests) {
    if (request.input + request.cacheRead + request.cacheWrite === 0) continue;
    if (before && before.cacheRead > 0) {
      const kind = request.cacheRead === 0 ? 'zero' : request.cacheRead < before.cacheRead * SHARP_DROP ? 'drop' : undefined;
      if (kind) {
        resets.push({ id: request.id, timestamp: request.timestamp, kind, previousCacheRead: before.cacheRead, cacheRead: request.cacheRead, cacheWrite: request.cacheWrite, afterCompaction: request.afterCompaction });
      }
    }
    before = request;
  }
  return resets;
}

/** The compaction entry's report; `kept` are the message entries from firstKeptEntryId up to it. */
function compactionReport(entry, entries, index) {
  const firstKept = entries.findIndex((candidate) => candidate.id === entry.firstKeptEntryId);
  const keptFound = firstKept !== -1 && firstKept < index;
  const kept = keptFound ? entries.slice(firstKept, index).filter((candidate) => candidate.type === 'message') : [];
  const usage = usageOf(entry) ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
  return {
    id: entry.id,
    timestamp: entry.timestamp,
    tokensBefore: entry.tokensBefore ?? 0,
    summaryChars: typeof entry.summary === 'string' ? entry.summary.length : 0,
    method: entry.details?.summaryMethod?.method ?? 'unknown',
    cost: usage.cost,
    usage: { input: usage.input, output: usage.output, cacheRead: usage.cacheRead, cacheWrite: usage.cacheWrite },
    keptMessages: kept.length,
    keptChars: sum(kept.map((candidate) => contentChars(candidate.message?.content))),
    keptThinkingBlocks: sum(kept.map((candidate) => thinkingBlocks(candidate.message?.content))),
    keptFound,
  };
}

/** The report of one transcript's lines. */
export function analyzeSession(file, text) {
  const entries = [];
  let skipped = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      skipped++;
    }
  }
  const header = entries.find((entry) => entry.type === 'session');
  const groups = [{ requests: [], compaction: null, startedAt: undefined, endedAt: undefined }];
  entries.forEach((entry, index) => {
    const group = groups[groups.length - 1];
    group.startedAt ??= entry.timestamp;
    group.endedAt = entry.timestamp ?? group.endedAt;
    if (entry.type === 'compaction') {
      group.compaction = compactionReport(entry, entries, index);
      groups.push({ requests: [], compaction: null, startedAt: undefined, endedAt: undefined, after: true });
    } else if (entry.type === 'message' && entry.message?.role === 'assistant') {
      const usage = usageOf(entry.message);
      if (!usage) return;
      const transformations = transformationsOf(entry.message);
      group.requests.push({
        ...usage,
        id: entry.id,
        timestamp: entry.timestamp,
        model: entry.message.model,
        afterCompaction: group.after === true && group.requests.length === 0,
        drops: transformations.filter((t) => t.type === 'thinking_dropped'),
        otherTransformations: transformations.filter((t) => t.type !== 'thinking_dropped').map((t) => t.type ?? 'unknown'),
      });
    }
  });
  // A trailing group holding nothing after the last compaction is not a segment.
  if (groups.length > 1 && groups[groups.length - 1].requests.length === 0 && groups[groups.length - 1].startedAt === undefined) groups.pop();

  let previous;
  const segments = groups.map((group, position) => {
    const resets = findCacheResets(group.requests, previous);
    previous = [...group.requests].reverse().find((r) => r.input + r.cacheRead + r.cacheWrite > 0) ?? previous;
    return { index: position + 1, startedAt: group.startedAt ?? null, endedAt: group.endedAt ?? null, ...summarize(group.requests), cacheResets: resets, compaction: group.compaction };
  });
  const all = groups.flatMap((group) => group.requests);
  const compactionCost = sum(segments.map((segment) => segment.compaction?.cost ?? 0));
  const total = summarize(all);
  return {
    file,
    id: header?.id ?? path.basename(file),
    startedAt: header?.timestamp ?? entries[0]?.timestamp ?? null,
    cwd: header?.cwd ?? null,
    models: [...new Set(all.map((r) => r.model).filter(Boolean))],
    skippedLines: skipped,
    ...total,
    compactionCost,
    cost: total.cost + compactionCost,
    segments,
  };
}

const money = (value) => `$${value.toFixed(4)}`;
const percent = (value) => (value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`);
const tokens = (usage) => `input ${usage.input}, output ${usage.output}, cacheRead ${usage.cacheRead}, cacheWrite ${usage.cacheWrite}`;

function dropLines(drops, indent) {
  const reasons = Object.entries(drops.reasons).map(([reason, n]) => `${reason} ${n}`).join(', ') || 'none';
  const lines = [
    `${indent}thinking drops: total ${drops.total}, per request ${drops.min}..${drops.max} (${drops.constant ? 'constant' : 'varies'}), requests with drops ${drops.requestsWithDrops}`,
    `${indent}drop reasons: ${reasons}`,
  ];
  if (drops.firstPath) lines.push(`${indent}first dropped path: ${drops.firstPath}`);
  const other = Object.entries(drops.otherTransformations).map(([type, n]) => `${type} ${n}`).join(', ');
  if (other) lines.push(`${indent}other input transformations: ${other}`);
  return lines;
}

/** The plain-text report as lines. */
export function renderLines(sessions) {
  const lines = [];
  for (const session of sessions) {
    if (lines.length) lines.push('');
    lines.push(`session ${session.id}  ${session.file}`);
    lines.push(`  started ${session.startedAt ?? 'unknown'}, models ${session.models.join(', ') || 'none'}, ${session.requests} requests, ${session.segments.length} segments`);
    lines.push(`  cost ${money(session.cost)} (requests ${money(session.cost - session.compactionCost)}, compactions ${money(session.compactionCost)})`);
    lines.push(`  usage: ${tokens(session.usage)}`);
    lines.push(`  cache hit rate: ${percent(session.cacheHitRate)}`);
    lines.push(...dropLines(session.thinkingDrops, '  '));
    if (session.skippedLines) lines.push(`  skipped ${session.skippedLines} unreadable lines`);
    for (const segment of session.segments) {
      lines.push(`  segment ${segment.index}  ${segment.startedAt ?? '?'} .. ${segment.endedAt ?? '?'}  ${segment.requests} requests, cost ${money(segment.cost)}`);
      lines.push(`    usage: ${tokens(segment.usage)}`);
      lines.push(`    cache hit rate: ${percent(segment.cacheHitRate)}`);
      lines.push(...dropLines(segment.thinkingDrops, '    '));
      lines.push(`    cache resets: ${segment.cacheResets.length}`);
      for (const reset of segment.cacheResets) {
        lines.push(`      ${reset.timestamp ?? '?'}  ${reset.id}  ${reset.kind === 'zero' ? 'fell to 0' : 'dropped sharply'}: cacheRead ${reset.previousCacheRead} -> ${reset.cacheRead}, cacheWrite ${reset.cacheWrite}${reset.afterCompaction ? ' (first request after a compaction)' : ''}`);
      }
      const compaction = segment.compaction;
      if (compaction) {
        lines.push(`    compaction ${compaction.id}  ${compaction.timestamp ?? '?'}: tokensBefore ${compaction.tokensBefore}, summary ${compaction.summaryChars} chars, method ${compaction.method}`);
        lines.push(`      usage: ${tokens(compaction.usage)}, cost ${money(compaction.cost)}`);
        lines.push(compaction.keptFound
          ? `      kept ${compaction.keptMessages} messages, ${compaction.keptChars} chars, ${compaction.keptThinkingBlocks} thinking blocks`
          : '      kept: firstKeptEntryId not found before the compaction entry');
      }
    }
  }
  return lines;
}

/** One page of lines with a footer naming the next page; no footer when everything fits on one page. */
export function paginate(lines, page, pageSize) {
  const pages = Math.max(1, Math.ceil(lines.length / pageSize));
  if (page > pages) throw new UsageError(`page ${page} is past the last page ${pages}`);
  const body = lines.slice((page - 1) * pageSize, page * pageSize);
  if (pages === 1) return body;
  return [...body, page < pages ? `-- page ${page} of ${pages}; next: --page ${page + 1}` : `-- page ${page} of ${pages}`];
}

function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }
  let files = options.paths.length ? options.paths : newestSessionFiles(options.dir);
  if (options.session !== undefined) files = files.filter((file) => file.includes(options.session));
  if (!options.paths.length) files = files.slice(0, options.limit);
  const sessions = files.map((file) => {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (error) {
      throw new Error(`cannot read ${file}: ${error.code ?? error.message}`);
    }
    return analyzeSession(file, text);
  });
  if (options.json) {
    process.stdout.write(`${JSON.stringify({ sessions }, null, 2)}\n`);
    return;
  }
  if (!sessions.length) {
    process.stdout.write('no sessions found\n');
    return;
  }
  process.stdout.write(`${paginate(renderLines(sessions), options.page, options.pageSize).join('\n').trimEnd()}\n`);
}

if (isMain(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`session-health: ${error.message}\n`);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}
