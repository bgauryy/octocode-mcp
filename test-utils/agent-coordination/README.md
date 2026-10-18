# Agent coordination contract

`contract.json` holds the vectors for the reservation (path lease) rules that two systems implement separately and must
agree on, because an agent of one reads the other's reservations:

- `packages/octocode-agents-communication` (Python, `scripts/communication/paths.py`): the shared SQLite database for
  Claude, Codex and Pi agents.
- `packages/octocode-pi-extension` (TypeScript, `src/team/lease-key.ts`): Pi's own team database, which also reads the
  package's active leases before a guarded write (`src/team/peer-leases.ts`).

Each package runs the same file in its own suite:

| Suite | What it calls |
|---|---|
| `packages/octocode-agents-communication/tests/coordination-contract.test.mjs` | `communication.paths`, and the real `lock` / `lock_many` commands |
| `packages/octocode-pi-extension/tests/coordination-contract.test.ts` | `lease-key.ts`, `pathKey`, and `TeamStore.lock` / `conflict` |

## Vectors

| Key | Rule |
|---|---|
| `fold` | One path component is compared as NFD, Unicode full case folding, NFD again. `Straße.ts` and `STRASSE.ts` name one file; so do a Greek final sigma and a capital sigma, `ﬁ` and `fi`, a composed and a decomposed accent. Turkish `İ` folds to `i` + U+0307, and dotless `ı` is its own letter. |
| `keys` | A path's key is `/` plus its folded components (the workspace root is `''`; `.` and empty components are not components). |
| `overlap` | Two reservations conflict when their keys are equal, or when one is a tree whose key is an ancestor of the other's on a component boundary. A file covers only its own key. The relation is symmetric. |
| `batches` | One call that reserves several paths is refused, and takes nothing, if two of its requests overlap each other (a tree and a path inside it, two spellings of one path, one path twice). |

Paths in the vectors are workspace-relative and use `/`.

## Decisions

- **Overlapping requests in one call are refused, not merged.** The package already refuses them (`lock_many`); Pi
  used to take both and left two leases on one tree. Asking for the tree alone, or each path once, is the unambiguous
  intent, so both reject and name the pair.
- **The case-fold table is the package's.** Pi has no JavaScript case fold (`toLowerCase` keeps `ß` and `ς` apart from
  `ss` and `σ`, and leaves `ﬁ` alone), so `packages/octocode-pi-extension/src/team/casefold-table.ts` is generated from
  the package's frozen Unicode 16 table (`unicode16.json`) by `scripts/generate-casefold.mjs`; the Pi suite fails while
  the two differ. Keys therefore do not depend on the Node or ICU version.
- **Existing keys are not recomputed.** Pi's stored `path_key` changes only for names where folding is not
  lower-casing; a lease lives at most 90 s past its owner's heartbeat, so an old one disappears with the process that
  wrote it.

## Not covered: message state

The two systems share the word "message" but not its state machine, so there are no message vectors:

- The package records a protocol `kind` that fixes `replyRequired` (requests: question, task, decision, handoff; the
  default is an FYI), `conversationId`, per-recipient `acknowledgedAt`, and wake `dispatches` that a vendor adapter
  performs.
- Pi's messages carry `reply_required` (default false), a recipient's `delivered_at` when its model is called with
  the message, `completed_at` on an answer, and `dead_at` / `notified_at` for dead letters; it wakes an idle agent
  itself.

There is no state both implement with the same meaning, so a shared vector would pin one side to the other's model.
Add one only when a message rule is meant to be the same in both.

## Changing the fixture

Edit `contract.json` only to record a rule change, and change both implementations and both suites in the same
change. Expected values come from the package's functions: regenerate a vector from `communication.paths`, never by
hand from Pi's output.
