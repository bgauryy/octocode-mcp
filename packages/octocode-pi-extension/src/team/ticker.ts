import fs from 'node:fs';
import type { Member, Traffic } from './model.js';

const TICK_MS = 1_000;
/** A tick this long after the previous one means the machine slept (or this process stalled): peers could not heartbeat either. */
const SUSPEND_GAP_MS = 15_000;

/** What watchers (the agents panel) render: live agents, recent traffic, or why the team is off. */
export interface TeamView {
  members: Member[];
  traffic: Traffic[];
  error?: string;
  /** The error is transient (a locked or busy database): the next tick retries. Without it the team is off. */
  retrying?: boolean;
}

interface TickerSource {
  /** Whether the agent is joined: delivery and heartbeats need the ticker even with no watcher. */
  joined(): boolean;
  /** Delivery and heartbeat work, called on every tick. */
  beat(): void;
  /** The database file, or undefined when nobody created it yet (nothing to read). */
  dbFile(): string | undefined;
  /** One fresh read. */
  read(): TeamView;
  /** How long an unchanged snapshot may be reused; liveness is time-based, so re-read at this interval anyway. */
  maxAgeMs: number;
  /** The machine slept (or this process stalled) from `since` to `now`; called before that tick's beat. */
  resumed(since: number, now: number): void;
}

/** A cheap change marker for the database file and its WAL: writes by any process move it. */
function dbStamp(file: string): string {
  return [file, `${file}-wal`]
    .map((entry) => {
      const stat = fs.statSync(entry, { throwIfNoEntry: false });
      return stat ? `${stat.mtimeMs}:${stat.size}` : '-';
    })
    .join('|');
}

/**
 * The team's one 1-second ticker (unref'd): it runs only while the agent is joined or something watches, beats for
 * delivery, and refreshes a cached view for watchers only when the database changed, so watchers never read it.
 */
export class TeamTicker {
  private timer: NodeJS.Timeout | undefined;
  private readonly watchers = new Set<() => void>();
  private cached: TeamView = { members: [], traffic: [] };
  private stamp = '';
  private readAt = 0;
  /** Wall time of the previous tick while the timer runs; 0 when it is stopped. */
  private tickedAt = 0;

  constructor(private readonly source: TickerSource) {}

  get view(): TeamView {
    return this.cached;
  }

  /** Call `listener` now and on every tick with a fresh `view`, until the returned function is called. */
  watch(listener: () => void): () => void {
    this.watchers.add(listener);
    this.refresh(true);
    this.sync();
    listener();
    return () => {
      this.watchers.delete(listener);
      this.sync();
    };
  }

  /** Start or stop the timer to match whether there is any work. */
  sync(): void {
    const needed = this.source.joined() || this.watchers.size > 0;
    if (needed && !this.timer) {
      this.tickedAt = Date.now();
      this.timer = setInterval(() => this.tick(), TICK_MS);
      this.timer.unref();
    } else if (!needed && this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
      this.tickedAt = 0;
    }
  }

  reset(): void {
    this.cached = { members: [], traffic: [] };
    this.stamp = '';
  }

  private tick(): void {
    // Wall time jumped past the 1-second cadence: a timer cannot fire while the machine sleeps, so neither could any peer's.
    const now = Date.now();
    if (this.tickedAt > 0 && now - this.tickedAt > SUSPEND_GAP_MS) this.source.resumed(this.tickedAt, now);
    this.tickedAt = now;
    this.source.beat();
    if (this.watchers.size === 0) return;
    this.refresh();
    for (const listener of this.watchers) listener();
  }

  private refresh(force = false): void {
    const file = this.source.dbFile();
    if (!file) {
      this.cached = this.source.read();
      return;
    }
    const stamp = dbStamp(file);
    const now = Date.now();
    // Retry failed reads; liveness and recent traffic also expire even without a database write.
    if (!force && !this.cached.retrying && stamp === this.stamp &&
      (now - this.readAt < this.source.maxAgeMs || (this.cached.members.length === 0 && this.cached.traffic.length === 0))) return;
    this.cached = this.source.read();
    this.stamp = stamp;
    this.readAt = now;
  }
}
