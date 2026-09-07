/** Canonical local-history relations. Payload bytes remain in the private Git sidecar. */
export const LOCAL_HISTORY_SCHEMA_DDL = `
  CREATE TABLE IF NOT EXISTS local_history_operations (
    operation_id TEXT PRIMARY KEY, workspace_path TEXT NOT NULL, agent_id TEXT NOT NULL, session_id TEXT,
    run_id TEXT REFERENCES task_runs(run_id) ON DELETE SET NULL, host TEXT,
    kind TEXT NOT NULL CHECK(kind IN ('edit','checkpoint','restore')),
    status TEXT NOT NULL CHECK(status IN ('capturing','open','complete','partial','failed')),
    outcome TEXT NOT NULL DEFAULT 'unknown' CHECK(outcome IN ('unknown','success','failure','interrupted','timeout')),
    request_hash TEXT NOT NULL, label TEXT,
    before_commit_oid TEXT CHECK(before_commit_oid IS NULL OR (length(before_commit_oid)=40 AND before_commit_oid NOT GLOB '*[^0-9a-f]*')),
    after_commit_oid TEXT CHECK(after_commit_oid IS NULL OR (length(after_commit_oid)=40 AND after_commit_oid NOT GLOB '*[^0-9a-f]*')),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(workspace_path, request_hash)
  );
  CREATE TABLE IF NOT EXISTS local_history_versions (
    operation_id TEXT NOT NULL REFERENCES local_history_operations(operation_id) ON DELETE CASCADE,
    file_path TEXT NOT NULL, ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
    before_oid TEXT CHECK(before_oid IS NULL OR (length(before_oid)=40 AND before_oid NOT GLOB '*[^0-9a-f]*')),
    after_oid TEXT CHECK(after_oid IS NULL OR (length(after_oid)=40 AND after_oid NOT GLOB '*[^0-9a-f]*')),
    before_mode TEXT CHECK(before_mode IS NULL OR before_mode IN ('100644','100755')),
    after_mode TEXT CHECK(after_mode IS NULL OR after_mode IN ('100644','100755')),
    before_status TEXT NOT NULL DEFAULT 'unknown' CHECK(before_status IN ('captured','missing','omitted','unstable','unknown')),
    after_status TEXT NOT NULL DEFAULT 'unknown' CHECK(after_status IN ('captured','missing','omitted','unstable','unknown')),
    before_reason TEXT, after_reason TEXT,
    PRIMARY KEY(operation_id, file_path), UNIQUE(operation_id, ordinal)
  );
  CREATE TABLE IF NOT EXISTS local_history_restores (
    preview_id TEXT PRIMARY KEY, workspace_path TEXT NOT NULL, agent_id TEXT NOT NULL,
    source_operation_id TEXT NOT NULL REFERENCES local_history_operations(operation_id) ON DELETE RESTRICT,
    side TEXT NOT NULL CHECK(side IN ('before','after')), files_json TEXT NOT NULL,
    expected_json TEXT NOT NULL, target_json TEXT NOT NULL,
    undo_operation_id TEXT REFERENCES local_history_operations(operation_id) ON DELETE SET NULL,
    lease_run_id TEXT REFERENCES task_runs(run_id) ON DELETE SET NULL,
    status TEXT NOT NULL CHECK(status IN ('ready','applying','applied','conflict','partial','failed')),
    expires_at TEXT NOT NULL, result_json TEXT, created_at TEXT NOT NULL
  );
`;

export const LOCAL_HISTORY_INDEX_DDL = `
  CREATE INDEX IF NOT EXISTS idx_local_history_operations_workspace ON local_history_operations(workspace_path, created_at DESC, operation_id);
  CREATE INDEX IF NOT EXISTS idx_local_history_operations_run ON local_history_operations(run_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_local_history_versions_file ON local_history_versions(file_path, operation_id);
  CREATE INDEX IF NOT EXISTS idx_local_history_restores_source ON local_history_restores(source_operation_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_local_history_restores_expiry ON local_history_restores(status, expires_at);
`;

export const LOCAL_HISTORY_SCHEMA_OBJECT_NAMES = new Set([
  'local_history_operations', 'local_history_versions', 'local_history_restores',
  'idx_local_history_operations_workspace', 'idx_local_history_operations_run', 'idx_local_history_versions_file',
  'idx_local_history_restores_source', 'idx_local_history_restores_expiry',
]);
