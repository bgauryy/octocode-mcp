// These calls suggest new research; they do not continue a bounded result.
// Unknown next keys are preserved so adding a continuation cannot lose data.
const ADVISORY_CALLS = new Set([
  'fetch',
  'getLines',
  'readSite',
  'viewDeeper',
  'viewStructure',
  'viewTree',
  'searchCode',
  'searchRepositoryCode',
  'cloneRepo',
  'cloneForSemantics',
  'lspDefinition',
  'lspReferences',
  'verifyReferences',
  'readIssue',
  'prDetail',
]);

// Visit response metadata only. Content, matches, bodies, patches and executable
// queries are evidence and may themselves contain fields named hints or next.
const METADATA_CONTAINERS = new Set([
  'data',
  'meta',
  'diagnostics',
  'error',
  'files',
  'directories',
  'results',
  'packages',
  'entries',
  'items',
]);

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function concise(value: string): string {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= 160) return text;
  const prefix = text.slice(0, 159);
  const boundary = prefix.lastIndexOf(' ');
  return `${prefix.slice(0, boundary > 80 ? boundary : 159)}…`;
}

function shapeNext(value: unknown, recovery: boolean): unknown {
  const next = record(value);
  if (!next) return value;
  return Object.fromEntries(
    Object.entries(next).flatMap(([key, value]) => {
      const call = record(value);
      if (!call || typeof call.tool !== 'string' || !record(call.query)) {
        return [[key, value]];
      }
      if (!recovery && ADVISORY_CALLS.has(key.split(':')[0]!)) return [];
      const { why, ...rest } = call;
      return [
        [
          key,
          recovery && typeof why === 'string'
            ? { ...rest, why: concise(why) }
            : rest,
        ],
      ];
    })
  );
}

function visit(value: unknown, recovery: boolean, seen: Set<string>): void {
  if (Array.isArray(value)) {
    for (const child of value) visit(child, recovery, seen);
    return;
  }
  const node = record(value);
  if (!node) return;
  const needsHelp =
    node.status === 'error' || node.status === 'empty' || recovery;
  if ('next' in node) node.next = shapeNext(node.next, needsHelp);
  for (const [key, child] of Object.entries(node)) {
    if (METADATA_CONTAINERS.has(key)) visit(child, needsHelp, seen);
    if (key === 'repositories') {
      for (const repo of Object.values(record(child) ?? {}))
        visit(repo, needsHelp, seen);
    }
  }
  if ('hints' in node) {
    const hints: string[] = [];
    if (needsHelp && Array.isArray(node.hints)) {
      for (const hint of node.hints) {
        if (typeof hint !== 'string') continue;
        const short = concise(hint);
        if (!short || seen.has(short) || seen.size >= 2) continue;
        seen.add(short);
        hints.push(short);
      }
    }
    if (hints.length) node.hints = hints;
    else delete node.hints;
  }
}

/** Apply once after tool finalization, before rendering either public channel. */
export function applyHintPolicy(rows: unknown[]): void {
  for (const row of rows) visit(row, false, new Set());
}
