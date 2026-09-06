/** Optional redacted host projection schema. No runtime imports. */
export const WORKER_LIFECYCLE_DDL = `
  CREATE TABLE IF NOT EXISTS worker_lifecycle_events (
    sequence        INTEGER PRIMARY KEY AUTOINCREMENT,
    packet_id       TEXT NOT NULL UNIQUE,
    workspace_path  TEXT NOT NULL,
    session_id      TEXT NOT NULL,
    worker_id       TEXT NOT NULL,
    correlation_id  TEXT NOT NULL,
    event_type      TEXT NOT NULL,
    redaction       TEXT NOT NULL CHECK(redaction IN ('public','sensitive','secret','internal')),
    created_at      TEXT NOT NULL,
    payload_json    TEXT NOT NULL,
    recorded_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_worker_lifecycle_scope_sequence
    ON worker_lifecycle_events(workspace_path, session_id, sequence);
  CREATE INDEX IF NOT EXISTS idx_worker_lifecycle_worker_sequence
    ON worker_lifecycle_events(workspace_path, session_id, worker_id, sequence);
  CREATE INDEX IF NOT EXISTS idx_worker_lifecycle_correlation_sequence
    ON worker_lifecycle_events(workspace_path, session_id, correlation_id, sequence);
`;
