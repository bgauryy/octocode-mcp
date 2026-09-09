# Local file history

Awareness keeps recoverable file bytes without reading from or writing to the workspace's Git repository. SQLite remains the canonical owner of operation, version, outcome, and restore records. A private bare Git object store holds only the captured blobs, trees, commits, and immutable refs that those rows identify.

Automatic history capture requires the `full` workspace profile. The default
coordination profile captures no file history. Explicit `history` commands remain
available through the CLI and [API](API.md). Pi imports that API for native capture,
checkpoints, and restore; it does not launch the Awareness CLI.

## Storage boundary

For a selected persistent Awareness database, local history uses a private store
under the physical workspace:

```text
<workspace>/.octocode/.localGit/<sha256(real database path)>/awareness-v1/<sha256(real workspace path)>/repo.git
```

`history status` reports the exact `storage.root` and `storage.git_dir`; callers
must not derive these paths independently. Database namespaces prevent two stores
using the same operation ID from colliding. The adjacent `history-store.json`
marker contains the format version, store ID, workspace ID, and object format,
without absolute paths. Moving a database changes its namespace and requires an
explicit matching store relocation. The store never uses the workspace `.git`
directory, index, refs, configuration, hooks, remotes, filters, or object alternates.
Workspace storage ancestors must be real directories, not symlinks. On the first
actual store initialization, Awareness creates `.octocode/.localGit/.gitignore`
with the catch-all `*` rule so generated history stays out of ordinary Git status.
An existing marker containing that rule is preserved; an incompatible marker or
symlink is rejected without overwriting its contents.

The implementation bundles the exact `isomorphic-git` version declared in the package manifest. It runs through Node's file-system API, requires no `git` executable or network access, and is distributed under its MIT license. Direct object reads validate a caller-supplied limit after the object is inflated; that limit bounds returned content, not peak compressed-object inflation work.

History is lazy. Status and in-memory Awareness databases do not create the marker
or a store. There is no implicit history migration, automatic garbage collection,
or use of the workspace repository as a fallback object source.

### Existing sidecars

An old `<db-path>.history/awareness-v1/<workspace-hash>` directory is preserved.
`history status` reports `storage.legacy_root` and `relocation_required: true`;
capture and object access reject `HISTORY_STORE_RELOCATION_REQUIRED` instead of
creating a disconnected history. Capture rejects this before writing journal rows.

For an offline relocation, stop all history writers, close host integrations, and
back up the database and complete old store. Using the same database and workspace,
read `history status`, create private destination parents, and move the complete
`storage.legacy_root` directory to the absent `storage.root` destination. Preserve
`history-store.json`, `repo.git`, and every object/ref; never merge two directories
or overwrite a destination. A same-filesystem rename preserves the tree atomically.
Cross-filesystem copies require separate integrity verification before retiring
the source; no automatic conversion command is provided. Resume only after status
reports initialization without relocation pressure and retained `history read`
operations return their expected bytes. Runtime tests exercise this exact offline
rename and subsequent reads/captures. No live store is moved by an upgrade.

## Capture coverage

Capture accepts workspace-relative paths or absolute paths beneath the canonical workspace. Paths outside the workspace are rejected. Regular files preserve raw bytes and executable mode; a missing file is recorded as an explicit state. Symlinks, symlinked ancestors, directories, and other file types are omitted from recoverable coverage.

Default limits are 200 files, 2 MiB for one file, and 16 MiB for one batch. `.git`, `.octocode`, `node_modules`, `dist`, `out`, `target`, `.env`, `.env.*`, `*.pem`, and `*.key` are excluded by default. Internal capture policy can explicitly include an exact path, while public history routes use the default exclusions. Inclusion cannot bypass workspace containment, file-type checks, or byte limits. Capture reports `omitted`, `unstable`, and `missing` separately; omitted bytes are never represented as recoverable.

The file reader opens final files without following symlinks and compares file identity, size, timestamp, and mode before and after the read. A change during capture produces `unstable` coverage. These checks narrow local races; they do not prove authorship when another process writes concurrently.

## Operations and outcomes

A before capture creates the operation and recoverable preimages. The matching after capture records the observed terminal outcome and postimages. Reusing the same operation ID and request returns the recorded operation; conflicting reuse is rejected. A recorded terminal outcome cannot be overwritten.

Capture publishes immutable refs under `refs/octocode/<sha256(operation-id)>/{before,after}`. Each ref points to a commit over the explicitly selected paths. Publication installs a complete temporary ref with an atomic hard link; a competing creator receives a conflict and cannot overwrite the winner. Partial, failed, interrupted, timeout, and unknown outcomes remain visible. A crash or capture gap does not grant verification credit and does not turn an underlying file mutation into a reported success.

## Restore safety

`history restore-preview` records a preview without changing workspace files. It binds the selected operation side and paths to current existence, byte digest, size, and executable mode. Apply checks the preview owner, workspace, expiry, active peer locks, and current file state. A content, mode, or existence change rejects the stale preview.

Apply acquires a dedicated exclusive work lease, claims the preview once, rechecks all selected files under that lease, and captures a durable undo operation before it changes a file. It checks and renews the complete lease before each write. It restores only selected paths with atomic temporary-file rename for regular files and explicit deletion for a missing target. Multi-file restore can still end partially; the restore record retains per-file results, the undo operation ID, and its lease run ID. It does not rewind coordination state, messages, checks, or external effects.

A completed restore leaves its work run `PENDING` and returns `verification_run_id`. Inspect the restored files, run the applicable checks, and use `verify mark` with the observed result. Restoring bytes never grants a successful verification receipt. A failed application releases its own lease as `FAILED`; crash recovery retains the applying journal and uses lease expiry.

When an undo checkpoint exists, the result also supplies `undo_preview`: execute
that returned request to preview its available `after` image. API callers receive
`{command, params}`; CLI callers receive argv. Do not guess the side from the word
"undo", and do not apply a newly created preview without its exact authorized ID.

## Consolidation and maintenance

Database consolidation rejects a source that contains local-history rows. Copying SQLite alone leaves object IDs without their sidecar bytes. A future explicit conversion must copy the matching sidecar, verify its marker and referenced objects, then publish the destination as one operation. Until that protocol exists, use the original database and sidecar together.

No automatic object pruning runs. Missing or corrupt objects block the affected
read or restore path. Preserve the database and its workspace `.octocode/.localGit`
stores together for backup and recovery.

Expiration and deletion are separate contracts:

- Restore previews expire after five minutes and cannot be applied at or after
  their deadline. The row remains available as recovery evidence.
- Expired exclusive leases stop protecting files; the lock maintenance owner
  removes them without marking work successful.
- Captures, immutable refs, and their reachable objects have no automatic TTL.
  `history status.retention` reports unfinished captures, expired ready previews,
  and applying restores without guessing whether a process is dead.
- A process killed during publication may leave a private temporary file; it is
  not a lock and cannot block another publisher. Capture can also leave objects
  without a ref or a published ref without completed SQLite metadata. Automatic
  cross-store reconciliation and safe object reclamation remain unimplemented.

The explicit maintenance routes provide bounded recovery without guessing about
process death. `history retention-preview` lists expired `ready` restore previews
in pages; `history retention-prune --confirm prune` removes only expired rows and
never deletes source operations or their blobs. `history recovery --action report`
reports capturing operations, failed captures, and applying restores. Reconcile
with `--action reconcile --confirm reconcile` only when an applying restore has a
complete durable per-file result journal; uncertain rows remain untouched and no
filesystem edit is replayed.

`history evidence --action report` enumerates loose private-Git objects unreachable
from immutable refs and SQLite-referenced objects after an explicit grace period.
Evidence maintenance is observational and report-only. Reclamation is
unavailable because a cross-process atomic handshake with capture writers is not
yet established; no filesystem object is deleted. Reports identify candidates
under the observed SQLite/ref state and may become stale if writers run
concurrently, so they never authorize deletion.

Do not run `git gc --prune=now` while captures can write. Git documents that
concurrent pruning can delete objects before a writer publishes their ref, and
even its usual age grace does not eliminate that race. A future GC
must exclude writers, protect SQLite-referenced and recovery objects, and verify
reachability before deleting anything. See [Git GC](https://git-scm.com/docs/git-gc).

## Command contract

Routes are defined by `src/schema/definitions-history.ts`:

| Route | Purpose |
|---|---|
| `history status` | Report capability, exact storage paths, relocation pressure, and recovery/retention counts without initializing Git. |
| `history capture` | Record before or after state for one operation. |
| `history checkpoint` | Record one named set of file versions. |
| `history timeline` | List bounded operations with a continuation cursor. |
| `history read` | Read a bounded range of one before or after version. |
| `history restore-preview` | Review a selective restore without mutation. |
| `history restore-apply` | Apply one valid, unexpired preview. |
| `history retention-preview` | Enumerate expired ready previews in bounded pages. |
| `history retention-prune` | Explicitly delete one bounded page of expired ready previews. |
| `history recovery` | Report or reconcile only unambiguous journal states. |
| `history evidence` | Report orphan private-Git candidates; destructive reclamation is unavailable. |

Use `schema command history <action> --compact` for the current fields and examples. The source schemas, rather than copied prose, own required arguments, limits, and result shapes.
