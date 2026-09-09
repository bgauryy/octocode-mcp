# Octocode Session Jobs

`@octocodeai/pi-extension` supports opt-in session-scoped jobs while Pi is open.
They are deliberately **not** OS cron: timers start on `session_start` and are
cleared on `session_shutdown`, `/new`, reload, resume, fork, or quit.

## Safety model

- The built-in job runs report-first Awareness `status`, which also prunes expired locks and work rows.
- No job calls a model.
- No automatic job is scheduled when `OCTOCODE_CRON=0`.
- Mutating cleanup such as `memory forget` remains explicit.

## Operation

The scheduler starts with the session and reports failures through the extension. The status job is disabled unless `OCTOCODE_CRON_STATUS=1`. Configure jobs and intervals before starting Pi. There is no separate maintenance slash-command surface. To inspect coordination manually, use the native `awareness` tool's `status` command.

## Available job

| Job | Interval | Action |
|---|---:|---|
| `awareness-status` | 30 min when enabled | `executeAwarenessCommand({ command: 'status' }, context)` with native workspace, database, and identity bindings |

## Configuration

| Variable | Default | Effect |
|---|---:|---|
| `OCTOCODE_CRON` | `1` | Set `0` to disable all session jobs. |
| `OCTOCODE_CRON_STATUS` | Unset (disabled) | Set exactly `1` to schedule status checks. |
| `OCTOCODE_CRON_STATUS_INTERVAL_MS` | `1800000` | Override status interval in milliseconds. |

The scheduler imports the [Awareness API](../../octocode-awareness/docs/API.md) directly.
It creates no Awareness CLI process and parses no stdout. Scheduled runs report
command failures through the extension. The timeout uses cooperative cancellation.
