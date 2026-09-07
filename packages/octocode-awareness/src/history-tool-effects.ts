export interface HistoryToolEffect {
  readonly effect: 'workspace-write' | 'none';
  readonly files: readonly string[];
}

const record = (value: unknown): Record<string, unknown> | undefined => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
);

/**
 * Extract history targets only from the canonical native `file` mutation shape.
 * Paths present in reads, shell commands, MCP payloads, or unknown tools never
 * become write effects merely because they look like file names.
 */
export function historyToolEffect(toolName: string | undefined, input: unknown): HistoryToolEffect {
  if (toolName !== 'file') return { effect: 'none', files: [] };
  const root = record(input);
  if (!root || !Array.isArray(root['queries'])) return { effect: 'none', files: [] };

  const files = new Set<string>();
  for (const item of root['queries']) {
    const query = record(item);
    if (!query) continue;
    if (!['edit', 'write', 'delete'].includes(String(query['type'] ?? ''))) continue;
    const file = query['path'];
    if (typeof file === 'string' && file.trim()) files.add(file.trim());
  }
  return files.size > 0
    ? { effect: 'workspace-write', files: [...files] }
    : { effect: 'none', files: [] };
}
