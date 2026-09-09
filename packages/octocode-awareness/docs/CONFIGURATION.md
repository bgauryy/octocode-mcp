# Awareness Configuration

Awareness has two separate configurations:

- An optional `<workspace>/.octocode/awareness.json` selects logical
  coordination/memory behavior, scope, and the hook profile. Durable state
  defaults to `$OCTOCODE_HOME/awareness/awareness.sqlite3`; repository scope is
  `<workspace>/.octocode/awareness.sqlite3`.
- `$OCTOCODE_HOME/awareness.json` controls global automatic-feature preferences.

Awareness reads global automatic-feature preferences from
`$OCTOCODE_HOME/awareness.json`, normally `~/.octocode/awareness.json`.
Missing configuration uses lean defaults: hooks and peer notifications enabled,
verification gates, automatic session capture, and maintenance reminders disabled.
No setup questionnaire is required. Existing explicit preferences remain effective;
changing defaults does not rewrite an existing file.

## Configure shell-hook automation

```bash
npx @octocodeai/octocode-awareness config show --compact
```

`source: "defaults"` means the file is absent. `config validate` also accepts those
defaults. To persist preferences, set only the overrides you need:

```bash
npx @octocodeai/octocode-awareness config init \
  --verification-gate true \
  --compact
npx @octocodeai/octocode-awareness config validate --compact
```

Initialization uses defaults for omitted flags, creates a private file, and refuses overwrite.
Validation rejects malformed JSON, unknown or missing keys, wrong types, and versions
other than `1`. The bundled skill includes the machine-readable
`references/awareness-config.schema.json` contract.

## Defaults

```json
{
  "version": 1,
  "features": {
    "hooks": true,
    "notifications": true,
    "verificationGate": false,
    "sessionCapture": false,
    "maintenanceReminders": false
  }
}
```

| Feature | Effect when disabled |
|---|---|
| `hooks` | Installed Awareness shell-hook entrypoints become inert. |
| `notifications` | Hooks do not deliver changed peer messages. |
| `verificationGate` | Stop hooks do not surface verification debt. Explicit audits remain available. |
| `sessionCapture` | Compact/end hooks do not create resumable captures; lifecycle cleanup still runs. |
| `maintenanceReminders` | Hooks do not emit maintenance-pressure reminders. |

The file controls shell-hook automation; Pi owns its native events separately.
It does not disable explicit API/CLI operations, evidence rules, or database integrity.
Existing environment kill switches
remain supported and take precedence when disabling automation. `--db-scope
repo|global` selects the repository or global Awareness database for one call.
Global Awareness resolves under `$OCTOCODE_HOME/awareness/` by default, while
`--db` selects an explicit Awareness database path and has highest precedence.
Scope changes do not merge existing databases. Agent-specific directory and
database overrides don't redirect Awareness.
See [storage scopes](STORAGE_SCOPES.md).

## Workspace profiles

| Profile | Hook commands | Behavior |
|---|---|---|
| `coordination` (default) | `notify-deliver`, `post-edit`, `session-end` | Register peers, deliver messages, and end presence. `post-edit` only delivers communication; it creates no work rows. |
| `guard` | `pre-edit`, `post-edit`, `stop-verify` | Track recognized writes, enforce mutation admission, and finalize automatic work. |
| `full` | All six commands, including `session-compact` | Combine communication and tracked work, with automatic history capture and supported capture boundaries. |

Profile selection and global feature switches are separate. `guard` or `full`
supplies the stop hook; `verificationGate: true` enables its debt reminder.
Automatic continuation capture also requires `sessionCapture: true`.
Explicit plans, locks, verification, memory, history, and maintenance remain
available through the [API](API.md) and CLI.

Pi uses the workspace profile for automatic work bookkeeping and worker audits;
`full` also enables native file-history capture. Pi checks existing peer locks
even with the default profile. Scheduled Pi status checks require a separate
`OCTOCODE_CRON_STATUS=1` opt-in; see [Pi session jobs](../../octocode-pi-extension/docs/CRON.md).

Host support, installation surfaces, and runtime verification belong to
[hooks and host integration](HOOKS.md). Pi uses native extension events and needs
no shell-hook installation.

Preferences are not authorization. A real `hooks install` always requires a separate
preview and explicit user approval immediately before the host settings mutation.
