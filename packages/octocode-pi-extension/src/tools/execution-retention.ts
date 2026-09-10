/** Keep recent terminal activity useful to the inspector without unbounded live-session growth. */
export const EXECUTION_HISTORY_LIMIT = 256;

export function retainRecent<T>(
  records: Record<string, T>,
  keep: (value: T) => boolean
): Record<string, T> {
  const entries = Object.entries(records);
  let removable = -EXECUTION_HISTORY_LIMIT;
  for (const [, value] of entries) {
    if (!keep(value)) removable += 1;
  }
  if (removable <= 0) return records;
  return Object.fromEntries(
    entries.filter(([, value]) => keep(value) || removable-- <= 0)
  );
}
