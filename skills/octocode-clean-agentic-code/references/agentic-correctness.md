# Report-Only Defects

Load when an agent-authored smell hides a wrong result rather than dead weight. Why: deleting these changes behavior, so they exit this skill as findings instead of entering an excision batch. The tell is the same across every class — the code makes a failure look like a success, so removing the disguise reveals a real bug, which is a fix and not cleanup.

## Error masking

| Signal | Why it is not junk |
|--------|-------------------|
| `catch` block that logs and continues, with no rethrow and no user-visible signal | Deleting it surfaces a failure the caller never handled |
| `except: pass`, empty `catch {}`, `.catch(() => {})` | The swallowed path may already be relied on in production |
| Fallback value substituted for a failed call (`?? 'default'`, hardcoded sample response) | Callers may depend on the fallback shape |
| Success returned without verifying the effect landed | Every downstream check trusts this return |

The last row is the highest-severity item here: a routine reporting success while the target bytes, rows, or requests are unchanged defeats every check above it.

## Test integrity

| Signal | Why it is not junk |
|--------|-------------------|
| Assertion changed to match current output, with no spec change | The test may be the only record of intended behavior |
| Branch on the test's own input, or a hardcoded expected value | Removing it exposes an unimplemented path |
| Grader, verifier, fixture, or threshold edited alongside the code it scores | Scores in history become invalid |
| Test deleted or `skip`-ed in the same change that made it fail | Coverage loss is the actual defect |
| Assertion that cannot fail (`expect(true)`, no `expect` at all) | Silent zero coverage on a path believed covered |

Route confirmed findings through `references/test-hygiene.md` for the excision protocol only after the underlying bug is fixed.

## Dependency and credential defects


| Signal | Verification required |
|--------|----------------------|
| Dependency that does not resolve on the registry | `npmSearch` returns no package under that exact name |
| Plausible-looking package published recently with near-zero adoption | Name compared against the real package it imitates |
| Import of a package absent from any manifest | Phantom dependency confirmed via `references/dependency-hygiene.md` |
| Placeholder key, token, or URL standing in for a real integration | The integration has never run against a real credential |
| Credential committed to version control | Rotate first; removal from history is a separate task |

An unresolvable dependency name is a supply-chain risk, not a typo — treat the slot as attacker-controllable until a maintainer confirms the intended package.

## Escalation protocol

1. Record file, line, class, and the exact failure the code disguises.
2. State the correct behavior, and whether any caller depends on the current one.
3. Keep it out of every excision batch, including batches the user already approved.
4. Hand blast-radius mapping to `octocode-research` and the fix to normal development work, reporting the finding even when the user asked only for cleanup.

Never satisfy a check by widening the mask: no broadened catch, relaxed assertion, or lowered threshold to hide a failure. Preserve repository acceptance requirements.

Next: for the behavior-preserving tier load `references/agentic-defects.md`; for measured base rates load `references/agentic-evidence.md`.
