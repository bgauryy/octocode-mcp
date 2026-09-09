# Test Quality Patterns

Load when writing a replacement test after removing a legacy, rigid, or environment-coupled one. Why: a deletion without a replacement converts test debt into a silent coverage gap.

## What a replacement must satisfy

| Property | Rule |
|---|---|
| Behavioral | asserts the relevant contract: output, state transition, side effect, or interaction when that interaction is itself required |
| Isolated | creates its own temp directory, restores any environment variable it sets, shares no mutable state between blocks |
| Deterministic | controls the relevant time, environment, working directory, and fixtures; declares required platform or service dependencies |
| Named by outcome | `it('returns 404 when the key is missing')`, not `it('test case 3')` |
| Minimal fixture | sets up only what this assertion needs |
| Readable failure | the message names what was expected and what arrived |

## Assert the outcome, not the call

The most common rigid-mock repair — the test watched how the work was done instead of what it produced.

```ts
// Wrong — passes even when initDb writes the wrong schema
const spy = vi.spyOn(db, 'exec').mockReturnValue(undefined);
initDb(db);
expect(spy).toHaveBeenCalledTimes(3);
// Right — fails when the schema is wrong
const db = new DatabaseSync(':memory:');
initDb(db);
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
expect(tables.map(t => t.name)).toContain('work_presence');
```

## Match the contract, not the prose

```ts
// Wrong — breaks on any wording edit, passes when the command is gone
expect(prompt).toContain('Run `agent register --agent-id`');
// Right — holds the concept and the budget
expect(prompt).toMatch(/agent\s+register/i);
expect(Buffer.byteLength(prompt, 'utf8')).toBeLessThanOrEqual(5_000);
```

## Isolate ambient state

One principle covers subprocess, filesystem, and environment tests: never inherit what you did not set. Pass explicit `env` and `cwd` to `spawnSync`, create work directories with `mkdtempSync` and remove them in `afterEach`, and capture any `process.env` value before overwriting it so teardown can restore or delete it. A test that passes only because the host exported a variable is not evidence. Name files `<domain>-<what-is-under-test>.test.ts`, never with an iteration number or a date.

## Coverage replacement rule

Compare coverage and behavioral cases before and after deletion. Restore useful lost coverage through an appropriate public contract. Preserve repository coverage floors; if cleanup cannot pass them, revise the change rather than weakening the check.

Next: to continue the batch load `references/cleanup-playbook.md`; for the smells that triggered the deletion load `references/test-hygiene.md`.
