# Test Hygiene

Load when the task involves removing bad tests, skipped tests, legacy test iterations, rigid mocks, redundant stubs, or unused test configuration. Why: test debt is structurally different from production dead code — the evidence bar relies on coverage and behavioral overlap, not just LSP callers.

## Smell classes and detection

### 1. Legacy / iteration test files

Pattern: numbered suffixes (`-2.test.ts`, `-3-3.test.ts`), date-stamped names (`audit-2026-07-10-fixes.test.ts`), version-slug names (`cli-cli-2-8.test.ts`, `memory-recall-3.test.ts`).

| Signal | Evidence required before delete |
|--------|----------------------------------|
| Filename contains trailing `-N`, `-N-N`, or a date segment | Confirm a base file exists with no suffix (`cli.test.ts`, `memory.test.ts`). Read both with `minify:symbols` and compare `describe` blocks. Delete the numbered file only when every test it contains is a strict behavioural subset of the base file or is already obsolete. |
| File tests a specific bug reported on a date | Check the bug behaviour is covered by a domain test; delete the patch-specific file. |
| File tests a version-specific CLI output format | Confirm the format has changed or is covered by the current CLI contract test. |

Detection query (run once per package):
```
localSearch operation:"files" names:["*.test.ts"] — then grep filename list for /[-_]\d+(\.test\.ts)$/ or /\d{4}-\d{2}-\d{2}/
```

### 2. Skipped tests

Pattern: `it.skip`, `describe.skip`, `xit`, `xdescribe`, `test.skip`, `it.todo` with no linked ticket.

| Signal | Action |
|--------|--------|
| `skip` with a comment that references a bug/ticket | Keep until the ticket is closed; add a TODO with the ticket number. |
| `skip` with no comment or a comment like "TODO fix later" > 90 days old | Delete the test block. |
| `todo` with no implementation hint | Delete; the intent is unknown. |

Detection query:
```
localSearch operation:"text" searchText:"it.skip|describe.skip|xit\\(|xdescribe|test.skip|it.todo" regex:true
```

### 3. Rigid mocks — implementation-coupled

Pattern: mocks that hard-code internal field names, private method signatures, or serialization details that have nothing to do with the public contract.

| Signal | Evidence required |
|--------|-------------------|
| Mock reconstructs a full internal object (>5 fields) to test one field | Identify the one field under test; replace the mock with the smallest stub. |
| Mock asserts the exact number of times an internal helper was called | Remove the call-count assertion; assert on the observable output instead. |
| Mock file mirrors a production file 1-to-1 (`__mocks__/foo.ts` with identical shape) | Check if the module under test can be tested with the real implementation in a tmp dir; prefer real over fake. |
| Mock uses `jest.spyOn` / `vi.spyOn` on a private or unexported symbol | This tests internals; delete or refactor to test via the public API. |

Detection query:
```
localSearch operation:"structural" pattern:"vi.spyOn($A, $B)" — review $B; flag any non-exported symbol
localSearch operation:"text" searchText:"toHaveBeenCalledTimes|toHaveBeenCalledWith" — review each; flag calls on internal helpers
```

### 4. Redundant stubs

Pattern: a stub that either always returns the same constant and is never verified, or duplicates what the real implementation would return.

| Signal | Evidence required |
|--------|-------------------|
| `vi.fn().mockReturnValue(x)` where `x` is what the real function returns anyway | Remove the mock; use the real function. |
| A `beforeEach` stub that is never referenced in any `expect` in the same block | Dead stub; delete. |
| Two test files set up the same stub with the same constant | Collapse into a shared helper or use the real implementation. |

Detection query:
```
localSearch operation:"text" searchText:"mockReturnValue|mockResolvedValue|mockImplementation" contextLines:3
— for each: check if the value matches the real return; check if any expect in the same describe references the mock.
```

### 5. Unused test configuration

Pattern: `beforeEach` / `afterEach` / `beforeAll` / `afterAll` setup that creates a resource never used in any `it` block of that `describe`.

| Signal | Evidence required |
|--------|-------------------|
| `beforeEach` creates a temp dir; no `it` block reads from that path | Delete the setup. |
| `afterEach` restores an env var that was never changed in the block | Delete the teardown. |
| `let x: T` declared at describe scope; no `it` block assigns or reads it | Delete the declaration. |

Detection query:
```
localSearch operation:"structural" pattern:"beforeEach($BODY)" — cross-reference variables set in $BODY with expects in sibling it() blocks.
```

### 6. Environment-coupled tests

Pattern: tests that inherit ambient env vars from the calling process (e.g. `OCTOCODE_AGENT_ID`, `HOME`, `CI`) and produce different results depending on how they are run.

| Signal | Fix |
|--------|-----|
| Test calls `spawnSync` without an explicit `env:` option and the subprocess reads an ambient env var | Pass `env: { ...process.env, SENSITIVE_VAR: undefined }` or an explicit env object. |
| Test reads `process.env.X` directly with no reset in `afterEach` | Add `const prev = process.env.X; afterEach(() => { process.env.X = prev ?? undefined; })`. |
| Test result depends on the current working directory | Pass an explicit `cwd:` to `spawnSync` / `execSync`. |

## Evidence bar

| Confidence | Condition | Action |
|------------|-----------|--------|
| **High — delete** | Numbered/dated file AND base file covers same behaviour | Delete immediately |
| **High — delete** | Skip with no comment or stale comment >90 days | Delete immediately |
| **Medium — rewrite** | Rigid mock that tests internals | Rewrite to test public API |
| **Medium — trim** | Redundant stub with no expect reference | Delete the stub; keep the test |
| **Low — investigate** | Numbered file with unique describe blocks not in base | Read both files fully before deciding |

## Excision protocol

1. **List** all candidate files / blocks (use detection queries above).
2. **Diff** each numbered file against its base file (`minify:symbols` on both).
3. **Confirm** unique tests: keep any block that exercises a path not covered by the base file.
4. **Delete** files or blocks with explicit `file.delete` or targeted `file.edit` removals.
5. **Run** `yarn workspace <pkg> test` after each batch. If coverage drops below the threshold, either lower the threshold with justification or add a replacement test that covers the same path via the public API.
6. **Update** coverage thresholds downward only with a comment explaining why the deleted tests were invalid. Never lower thresholds silently.

## Coverage threshold changes

When deleting tests causes coverage to drop below a configured threshold:

1. Check `vitest.config.ts` for the `thresholds` block.
2. Measure actual coverage of the removed tests: run with `--coverage` before and after.
3. If the deleted tests covered **only** implementation details (private functions, internal fields), adjust the threshold to the new measured value.
4. If they covered a real code path, add a **quality replacement test** (see `references/test-quality.md`) before lowering.
5. Commit threshold changes in a separate, labelled commit: `test: lower coverage threshold — removed legacy iteration tests`.

Next: when replacement tests need to be written, load `references/test-quality.md`.
