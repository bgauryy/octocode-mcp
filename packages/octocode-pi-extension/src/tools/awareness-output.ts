/** Preserve exact recovery handles separately from oversized write detail bodies. */
export function awarenessWriteReceipt(value: unknown, depth = 0): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const receipt: Record<string, unknown> = {};
  let omitted = false;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'operation' && depth === 0) {
      const operation = awarenessWriteReceipt(child, depth + 1);
      if (operation) receipt[key] = operation;
    } else if (/^(?:id|.*_id|.*Id|ok|status|expires_at)$/.test(key)) {
      if (typeof child === 'boolean' || child === null ||
        (typeof child === 'string' && child.length <= 512)) receipt[key] = child;
      else omitted = true;
    }
    if (JSON.stringify(receipt).length > 4_000) {
      delete receipt[key];
      omitted = true;
    }
  }
  if (omitted) receipt['partial'] = true;
  return Object.keys(receipt).length ? receipt : undefined;
}
