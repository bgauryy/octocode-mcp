/** Compact numbers, durations, clock times, paths, tokens and cost for the agents panel, the footer and `coordinate list`. */
import os from 'node:os';
import path from 'node:path';
import type { UsageTotals } from './util.js';

/** `file` relative to `cwd` when inside it, else with the home directory as `~`; otherwise unchanged. */
export function shortPath(file: string, cwd = process.cwd(), home = os.homedir()): string {
  const inside = (root: string) => {
    const relative = path.relative(root, file);
    return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : undefined;
  };
  const local = inside(cwd);
  if (local) return local;
  const homed = inside(home);
  return homed ? `~${path.sep}${homed}` : file;
}

/** `950`, `12.4k`, `250k`, `1.2M`, `144M`. */
export function formatTokens(count: number): string {
  const short = (value: number, unit: string) => (value < 100 ? `${value.toFixed(1).replace(/\.0$/, '')}${unit}` : `${Math.round(value)}${unit}`);
  if (count < 1_000) return String(count);
  return count < 999_500 ? short(count / 1_000, 'k') : short(count / 1_000_000, 'M');
}

/**
 * The one token format: `↑1.2M (94% cached) ↓35k`. ↑ is every prompt token (uncached input, cache reads and writes), the
 * share is the part read from cache, shown when there is one. Empty when nothing was spent.
 */
export function formatTokenUsage(usage: Pick<UsageTotals, 'input' | 'cacheRead' | 'output'>): string {
  if (!usage.input && !usage.output) return '';
  const cached = usage.cacheRead > 0 && usage.input > 0 ? ` (${Math.round((usage.cacheRead / usage.input) * 100)}% cached)` : '';
  return `↑${formatTokens(usage.input)}${cached} ↓${formatTokens(usage.output)}`;
}

/**
 * The one money format. Pi prices replies at the model's list rates (`models.json`), not at what a gateway bills, so it
 * reads as an estimate: `≈$2.28`. Usage from a model without pricing is never shown as free: `≈$2.28 + n/a`, or
 * `cost n/a` when no part was priced. Empty when nothing was spent.
 */
export function formatCost(usage: Pick<UsageTotals, 'cost' | 'unpriced'>): string {
  const money = usage.cost > 0 ? `≈$${usage.cost < 0.01 ? '<0.01' : usage.cost.toFixed(2)}` : '';
  if (!usage.unpriced) return money;
  return money ? `${money} + n/a` : 'cost n/a';
}

/**
 * The one duration format: `45s`, `2m14s`, `15m`, `1h03m`, `2h`. `precise` adds sub-10s detail for timings
 * (`850ms`, `1.2s`).
 */
export function formatDuration(ms: number, precise = false): string {
  const safe = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  if (precise && safe < 999.5) return `${Math.round(safe)}ms`;
  if (precise && safe < 9_950) return `${(safe / 1_000).toFixed(1)}s`;
  const seconds = Math.round(safe / 1_000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const pad = (value: number, unit: string) => (value ? `${String(value).padStart(2, '0')}${unit}` : '');
  return minutes < 60 ? `${minutes}m${pad(seconds % 60, 's')}` : `${Math.floor(minutes / 60)}h${pad(minutes % 60, 'm')}`;
}

export const toolCallCount = (count: number) => `${count} tool call${count === 1 ? '' : 's'}`;

export const formatClock = (at: number) => new Date(at).toTimeString().slice(0, 8);

/** `7 tool calls · ↑12k (25% cached) ↓3k · ≈$0.02`: an agent's work in `coordinate list` and /agents. */
export function memberStats(member: { toolCalls: number } & UsageTotals): string {
  return [toolCallCount(member.toolCalls), formatTokenUsage(member), formatCost(member)].filter(Boolean).join(' · ');
}
