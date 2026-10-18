/** What reading a branch needs from a session manager. */
export interface BranchSource {
  getBranch(): readonly unknown[];
}

/** How far a session's fold has read: the branch length, the id of its last entry (the proof it is the same branch), and the state. */
interface Cursor<S> {
  length: number;
  tail: string;
  state: S;
}

/**
 * A fold over a session branch that a request resumes instead of repeating. A branch only grows at its end (Pi's entries
 * are immutable and their ids unique, so a branch whose entry at the old length has the old last id begins with the same
 * entries), so a read visits only the entries added since the last one. A branch that does not continue the last one (another
 * leaf, a compaction that moved the path) or whose entries have no ids is folded again from its start. Per session manager.
 *
 * `visit` adds one entry to the state and must not throw (a visit that does drops the cursor, so the next read starts over).
 * The state is shared between reads: a caller treats it as read-only.
 */
export class BranchIndex<S> {
  private readonly cursors = new WeakMap<object, Cursor<S>>();

  constructor(
    private readonly start: () => S,
    private readonly visit: (state: S, entry: unknown) => void,
  ) {}

  /** The state for the session's current branch. `getBranch` itself still builds the branch array (Pi walks it from the leaf). */
  read(session: BranchSource): S {
    const branch = session.getBranch();
    const known = this.cursors.get(session);
    const resumes = known !== undefined && branch.length >= known.length && idOf(branch[known.length - 1]) === known.tail;
    const cursor = resumes ? known : { length: 0, tail: '', state: this.start() };
    this.cursors.delete(session);
    for (let index = cursor.length; index < branch.length; index++) this.visit(cursor.state, branch[index]);
    const tail = idOf(branch[branch.length - 1]);
    if (tail !== undefined) this.cursors.set(session, { length: branch.length, tail, state: cursor.state });
    return cursor.state;
  }
}

function idOf(entry: unknown): string | undefined {
  const id = typeof entry === 'object' && entry !== null ? (entry as { id?: unknown }).id : undefined;
  return typeof id === 'string' ? id : undefined;
}
