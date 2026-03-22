# Target Change Checklists

Use this reference whenever a task changes behavior in the target codebase, not just code shape.

The goal is to keep implementation work grounded in five questions:

1. What behavior exists today?
2. What behavior should exist after the change?
3. Which public contracts are affected?
4. Which docs and examples now need updating?
5. How will the change be rolled out and explained safely?

---

## 1. Behavior Contract

Write this down before editing code:

- **Current behavior**: what users, callers, or downstream systems observe today
- **Desired behavior**: exact target behavior after the change
- **Acceptance criteria**: happy path, negative path, and edge-case outcomes
- **Invariants**: what must stay true before and after the change
- **Non-goals**: what is intentionally out of scope
- **Affected callers**: who depends on the current behavior

Use a compact template:

```markdown
- Current:
- Desired:
- Acceptance criteria:
- Invariants:
- Non-goals:
- Affected callers:
```

If you cannot state the behavior contract clearly, pause before coding.

---

## 2. CLI Change Checklist

Treat the CLI as a public API.

Check these before and after the change:

- Command and subcommand names
- Flag and option names, aliases, defaults, and requiredness
- Positional argument order and parsing
- `--help` / usage text
- Stdout vs stderr behavior
- Exit codes on success, validation failures, and runtime failures
- Machine-readable output formats (`json`, `yaml`, line-oriented output)
- Environment variables and config-file interactions
- Shell examples in docs or scripts
- Backward compatibility, aliases, or migration notes for renamed flags

Recommended validation:

- Run `--help`
- Run one happy-path example
- Run one invalid-input example
- Run one backward-compatible path when applicable
- Run `test:cli`, `test:e2e`, or equivalent if the repo provides them

If the CLI is consumed by scripts, be extra careful with output shape and exit codes.

---

## 3. API Change Checklist

Treat handlers, DTOs, schemas, and serialized responses as contracts.

Check these explicitly:

- Route or operation name, method, and path
- Request schema: required fields, optional fields, defaults, enums, nullability
- Response schema: field names, types, nullability, ordering assumptions
- Status codes and error shapes
- Auth, permission, and rate-limit behavior
- Pagination, filtering, sorting, and idempotency rules
- Versioning and deprecation path
- Compatibility for existing clients and tests
- OpenAPI, GraphQL schema, protobuf, or other generated contract artifacts

Recommended validation:

- Run contract, integration, or API tests when present
- Read the route/handler and the serializer together
- Trace downstream callers if shared types or response shapes changed
- Add or update request/response examples in docs

If a breaking change is required, document migration steps and call it out plainly.

---

## 4. Functionality Validation Loop

Do not stop at "the code compiles."

For behavior-changing work, verify:

- Happy path works
- Invalid input is rejected correctly
- Edge cases still behave intentionally
- Existing invariants remain true
- Regression coverage exists for the bug or feature
- Related security or performance assumptions still hold when relevant

Preferred order:

1. Add or update the failing test first when practical
2. Implement the fix or feature
3. Re-run the narrow test
4. Re-run broader relevant tests
5. Run lint and build
6. Re-scan the changed scope if the skill's detectors apply

---

## 5. Docs and Examples Checklist

Any externally visible behavior change should trigger a docs check.

Update whichever of these exist:

- `README.md`
- `docs/` pages
- Inline CLI help text
- Usage examples and snippets
- OpenAPI or generated API references
- Migration notes / upgrade guides
- Changelog / release notes
- Example config files or `.env.example`

Docs updates are required when you change:

- CLI flags, commands, defaults, or output
- API paths, payloads, errors, auth, or versioning
- Environment variables or config keys
- Workflow steps users must follow

If no docs change is needed, say why.

---

## 6. Rollout and Operability Checklist

For risky or user-facing changes, define the operational plan:

- Feature flag or staged rollout needed?
- Data migration or backfill needed?
- Telemetry, logs, or metrics needed to confirm success?
- Alerting or dashboards affected?
- Rollback path available?
- Cleanup plan after rollout complete?

Use this especially for high fan-in modules, shared interfaces, and breaking changes.

---

## 7. Explanation Checklist

When reporting the work back, explain the change at the behavior level:

- **Behavior delta**: what changed for users or callers
- **Interface impact**: CLI/API compatibility notes
- **Docs impact**: what was updated
- **Verification**: tests, contract checks, lint/build, scans
- **Residual risk**: anything still uncertain or intentionally deferred

If there was no public behavior change, say that explicitly instead of making the reader infer it.
