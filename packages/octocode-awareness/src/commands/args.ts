import { die } from '../command-output.js';

export type ArgValue = string | boolean | string[];
export type ParsedArgs = Record<string, ArgValue> & { _: string[] };

export const MAX_CLI_TTL_SECONDS = 10 * 60;
export const MAX_CLI_WAIT_SECONDS = 60 * 60;
export const MAX_CLI_RETRY_INTERVAL_SECONDS = 5 * 60;
export const MEMORY_SORTS = new Set(['smart', 'score', 'importance', 'recent', 'accessed']);

export function parseBoundedSeconds(args: ParsedArgs, key: string, min: number, max: number): number | null {
  const raw = args[key];
  if (raw == null || raw === false) return null;
  const flag = `--${key.replace(/_/g, '-')}`;
  const value = Number(String(raw));
  if (!Number.isInteger(value)) die(`${flag} must be an integer`);
  if (value < min) die(`${flag} must be >= ${min}`);
  if (value > max) die(`${flag} must be <= ${max}`);
  return value;
}

export function listLimit(args: ParsedArgs, defaultLimit = 20): number {
  const value = Number(String(args['limit'] ?? defaultLimit));
  if (!Number.isInteger(value) || value < 1) die('--limit must be a positive integer');
  return Math.min(value, 200);
}

export function valuesFor(args: ParsedArgs, key: string): string[] {
  const value = args[key];
  if (value === undefined || value === false) return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

export function firstValue(args: ParsedArgs, key: string): string | undefined {
  return valuesFor(args, key)[0];
}

export function flagBool(value: ArgValue | undefined, fallback?: boolean): boolean | undefined {
  if (value === undefined) return fallback;
  if (value === false) return false;
  if (value === true) return true;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  return Boolean(value);
}

export function resolveAgentId(args: ParsedArgs): string {
  const value = args['agent_id'];
  if (typeof value !== 'string' || !value.trim()) die('--agent-id is required; supply agent_id in API parameters or agentId in host context.');
  return value.trim();
}
