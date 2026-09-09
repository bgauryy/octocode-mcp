# Local history

Use local history for observed workspace-file recovery. Awareness SQLite owns the operation and outcome records; the workspace-local private object store owns recoverable bytes. Never treat a blob hash as authorship or verification evidence.

## Inspect before acting

```bash
npx @octocodeai/octocode-awareness history status --workspace "$PWD" --compact
npx @octocodeai/octocode-awareness schema command history capture --compact
```

The seven routes are `history status`, `capture`, `checkpoint`, `timeline`, `read`, `restore-preview`, and `restore-apply`. Their live source schemas own all flags and limits. Follow a returned cursor when timeline or file content is partial.

## Capture

Use `history capture --phase before` at the actual mutation boundary, then reuse its operation ID with `--phase after` and the observed terminal outcome. Use `history checkpoint` for an explicit group of current files. Retries must reuse the same payload; conflicting reuse and terminal-outcome changes are errors.

Coverage is conservative:

- Paths must stay beneath the canonical workspace.
- Regular bytes and executable mode are recoverable.
- Missing files are explicit tombstones.
- Symlinks and symlinked ancestors are omitted.
- Secrets and generated directories are excluded by default.
- File-count, per-file, and batch-byte limits return omissions.
- Unstable, unknown, failed, interrupted, and partial capture stay visible.

An omitted or unstable version is not recoverable. A capture receipt is not a verification receipt.

## Read and restore

Use `history timeline` to select an operation and `history read` to inspect a bounded before or after version. Restore always has two steps:

1. Run `history restore-preview` for the exact side and optional paths.
2. Review conflicts and omissions, then pass its preview ID to `history restore-apply` while it remains valid.

Apply rechecks workspace identity, ownership, expiry, peer locks, file existence, content digest, size, and executable mode. Any drift rejects the preview. Apply holds a dedicated exclusive work lease, captures a durable undo operation, and records partial results if a later path fails. Do not retry with a new payload under the same ID; inspect the recorded result and create a fresh preview when needed.

A completed restore returns `verification_run_id` with its work run `PENDING`. Inspect the files and run applicable checks, then record the observed outcome using `verify mark`. A restore receipt does not settle verification debt.

## Storage rules

Private bytes live under `<workspace>/.octocode/.localGit`. Use `history status`
for the exact database namespace and relocation diagnostics; never edit refs or
derive storage paths yourself. Preserve the SQLite database and private store
together. Old sidecars require an explicit offline relocation before new captures;
an upgrade never moves them. The bundled backend needs neither system Git nor a
network and never touches workspace `.git`.

When a peer needs an existing capture, send its workspace, operation ID, side and
file through a signal; the peer can fetch just the needed `history read` page.
If the host binds history to another checkout, ask the originating agent for the
needed excerpt; do not override host workspace bindings.
Keep intent, decisions, acknowledgements and file/area memory in their existing
Awareness owners. A capture pointer does not grant restore permission.

An expired restore preview requires a fresh preview. Release owned work leases;
reacquire an expired lease instead of renewing it. `history status.retention`
reports recovery pressure, not permission to delete it. Automatic object pruning
and crash reconciliation are not implemented; never use Git GC or age-based
deletion to repair an active capture.

Use `schema command history <action> --compact` for the exact capture or restore
contract. After recovery, return to the [tracked-work recipe](agent-cheatsheet.md)
to settle the returned verification run.
