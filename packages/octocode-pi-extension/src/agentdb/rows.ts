/** One SQLite result row as `node:sqlite` returns it. */
export type Row = Record<string, unknown>;

/** A numeric column, or 0 when it is NULL or not a number. */
export const num = (value: unknown): number => (typeof value === 'number' ? value : 0);
