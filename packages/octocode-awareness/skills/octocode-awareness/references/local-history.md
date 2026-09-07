# Local history

Use local history for observed workspace-file recovery. Awareness SQLite owns the operation and outcome records; the adjacent private object store owns recoverable bytes. Never treat a blob hash as authorship or verification evidence.

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

The sidecar is `<selected-awareness-db>.history/awareness-v1/<sha256(real-workspace)>/repo.git`. It uses bundled `isomorphic-git` and does not require system Git or a network. It never touches the workspace `.git`. Preserve the SQLite database and sidecar together. Database consolidation rejects history-bearing sources until an explicit sidecar-copy and integrity protocol exists. There is no implicit migration or automatic object pruning.

See [`docs/LOCAL_HISTORY.md`](../../../docs/LOCAL_HISTORY.md) for the storage, capture, restore, and failure contracts.
