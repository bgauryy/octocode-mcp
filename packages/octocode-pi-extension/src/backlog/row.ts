/** A persisted item, including the joined sequence number of its origin. */
export interface Row<State extends string> {
  id: number;
  seq: number;
  title: string;
  goal: string;
  body: string;
  paths: string;
  why: string;
  evidence: string;
  plan: string;
  state: State;
  priority: number;
  tags: string;
  assignee: string | null;
  created_by: string;
  source_session: string | null;
  created_at: number;
  updated_at: number;
  started_at: number | null;
  done_at: number | null;
  from_item: number | null;
  from_seq: number | null;
  version: number;
}

/** A stored list (one entry per line) as entries. */
const lines = (text: string): string[] => (text ? text.split('\n') : []);

export const toItem = <State extends string>(row: Row<State>) => ({
  rowId: row.id,
  seq: row.seq,
  ref: `B${row.seq}`,
  title: row.title,
  goal: row.goal,
  body: row.body,
  paths: lines(row.paths),
  why: row.why,
  evidence: lines(row.evidence),
  plan: row.plan,
  state: row.state,
  priority: row.priority,
  tags: row.tags ? row.tags.split(' ') : [],
  ...(row.assignee ? { assignee: row.assignee } : {}),
  createdBy: row.created_by,
  ...(row.source_session ? { sourceSession: row.source_session } : {}),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  ...(row.started_at ? { startedAt: row.started_at } : {}),
  ...(row.done_at ? { doneAt: row.done_at } : {}),
  ...(row.from_seq ? { from: row.from_seq } : {}),
  version: row.version,
});
