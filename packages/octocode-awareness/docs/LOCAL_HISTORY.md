# Local file history

Awareness keeps recoverable file bytes without reading from or writing to the workspace's Git repository. SQLite remains the canonical owner of operation, version, outcome, and restore records. A private bare Git object store holds only the captured blobs, trees, commits, and immutable refs that those rows identify.

## Storage boundary

For a selected Awareness database at `<db-path>`, local history uses this sidecar:

```text
<db-path>.history/awareness-v1/<sha256(real workspace path)>/repo.git
```

The adjacent `history-store.json` marker contains the format version, store ID, workspace ID, and object format. It contains no absolute database or workspace path, so an explicit sidecar copy can preserve the binding when a database moves. The store never uses the workspace `.git` directory, index, refs, configuration, hooks, remotes, filters, or object alternates.

The implementation bundles the exact `isomorphic-git` version declared in the package manifest. It runs through Node's file-system API, requires no `git` executable or network access, and is distributed under its MIT license. Direct object reads validate a caller-supplied limit after the object is inflated; that limit bounds returned content, not peak compressed-object inflation work.

History is lazy. Status and in-memory Awareness databases do not create a sidecar. There is no implicit history migration, automatic garbage collection, or use of the workspace repository as a fallback object source.

## Capture coverage

Capture accepts workspace-relative paths or absolute paths beneath the canonical workspace. Paths outside the workspace are rejected. Regular files preserve raw bytes and executable mode; a missing file is recorded as an explicit state. Symlinks, symlinked ancestors, directories, and other file types are omitted from recoverable coverage.

Default limits are 200 files, 2 MiB for one file, and 16 MiB for one batch. `.git`, `.octocode`, `node_modules`, `dist`, `out`, `target`, `.env`, `.env.*`, `*.pem`, and `*.key` are excluded by default. Internal capture policy can explicitly include an exact path, while public history routes use the default exclusions. Inclusion cannot bypass workspace containment, file-type checks, or byte limits. Capture reports `omitted`, `unstable`, and `missing` separately; omitted bytes are never represented as recoverable.

The file reader opens final files without following symlinks and compares file identity, size, timestamp, and mode before and after the read. A change during capture produces `unstable` coverage. These checks narrow local races; they do not prove authorship when another process writes concurrently.

## Operations and outcomes

A before capture creates the operation and recoverable preimages. The matching after capture records the observed terminal outcome and postimages. Reusing the same operation ID and request returns the recorded operation; conflicting reuse is rejected. A recorded terminal outcome cannot be overwritten.

Capture publishes immutable refs under `refs/octocode/<sha256(operation-id)>/{before,after}`. Each ref points to a commit over the explicitly selected paths. Partial, failed, interrupted, timeout, and unknown outcomes remain visible. A crash or capture gap does not grant verification credit and does not turn an underlying file mutation into a reported success.

## Restore safety

`history restore-preview` records a preview without changing workspace files. It binds the selected operation side and paths to current existence, byte digest, size, and executable mode. Apply checks the preview owner, workspace, expiry, active peer locks, and current file state. A content, mode, or existence change rejects the stale preview.

Apply acquires a dedicated exclusive work lease, claims the preview once, rechecks all selected files under that lease, and captures a durable undo operation before it changes a file. It checks and renews the complete lease before each write. It restores only selected paths with atomic temporary-file rename for regular files and explicit deletion for a missing target. Multi-file restore can still end partially; the restore record retains per-file results, the undo operation ID, and its lease run ID. It does not rewind coordination state, messages, checks, or external effects.

A completed restore leaves its work run `PENDING` and returns `verification_run_id`. Inspect the restored files, run the applicable checks, and use `verify mark` with the observed result. Restoring bytes never grants a successful verification receipt. A failed application releases its own lease as `FAILED`; crash recovery retains the applying journal and uses lease expiry.

## Consolidation and maintenance

Database consolidation rejects a source that contains local-history rows. Copying SQLite alone leaves object IDs without their sidecar bytes. A future explicit conversion must copy the matching sidecar, verify its marker and referenced objects, then publish the destination as one operation. Until that protocol exists, use the original database and sidecar together.

No automatic object pruning runs. Missing or corrupt objects block the affected read or restore path. Preserve the database and `<db-path>.history` together for backup and recovery.

## Command contract

Seven routes are defined by `src/schema/definitions-history.ts`:

| Route | Purpose |
|---|---|
| `history status` | Report capability, initialization, and bounded counts. |
| `history capture` | Record before or after state for one operation. |
| `history checkpoint` | Record one named set of file versions. |
| `history timeline` | List bounded operations with a continuation cursor. |
| `history read` | Read a bounded range of one before or after version. |
| `history restore-preview` | Review a selective restore without mutation. |
| `history restore-apply` | Apply one valid, unexpired preview. |

Use `schema command history <action> --compact` for the current fields and examples. The source schemas, rather than copied prose, own required arguments, limits, and result shapes.
