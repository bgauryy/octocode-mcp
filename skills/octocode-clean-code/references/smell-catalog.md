# Smell Catalog

Load when classifying a target as dead, duplicate, kludge, or junk prose. Why: class determines the evidence bar and excision protocol.

## Re-exports and barrel aliases

| Signal | Verification required |
|--------|----------------------|
| `export { X } from './X'` with no added logic | LSP zero-callers on re-export path + graph zero-import-edges |
| `export * from './module'` barrel that only re-namespaces | Graph: no external consumer of the barrel |
| `export default aliasedName` wrapping another export | LSP callers on alias and original both checked |

## Legacy shims and compatibility stubs

| Signal | Verification required |
|--------|----------------------|
| Comment: `// legacy`, `// compat`, `// deprecated`, `// removed in vX` | No caller that cannot use the real path |
| Adapter function mapping old API shape to new | All call sites confirmed on the new shape |
| `if (legacyMode)` / `if (version < X)` conditionals | Branch never true in any live config |

## Duplicate logic

| Signal | Verification required |
|--------|----------------------|
| Near-identical function bodies in different modules | AST structural match; diff the two bodies |
| Copy-pasted constant blocks | Text search for the literal; confirm all sites |
| Parallel helpers imported by the same consumers | Graph: both edges confirmed; canonical chosen |

Keep the canonical copy; update all callers before deleting the duplicate.

## Patch kludges and regex fixups

| Signal | Verification required |
|--------|----------------------|
| `str.replace(/old-value/, …)` at module scope | Value correctable at its source |
| `Object.assign(prototype, …)` outside tests | Patched object is internal and owned |
| Env check always true in deployed config | Confirmed across all deployment targets |

## Junk prose

| Type | Remove when |
|------|------------|
| Syntax narration (`// increment counter`) | Always |
| Dead comment block (`/* old impl */`) | Always |
| TODO with no ticket and no owner >90 days | Always |
| `@deprecated` JSDoc with no migration path | After caller updates complete |

## Test debt

| Signal | Verification required |
|--------|----------------------|
| Test filename ends with `-N`, `-N-N`, or contains a date (`2026-07-10`) | Base file exists; numbered file's describe blocks are a strict subset — no unique paths |
| `it.skip` / `describe.skip` / `xit` with no linked ticket or >90-day stale comment | No observable test coverage gap after removal |
| `vi.fn().mockReturnValue(x)` where x equals the real return and no `expect` references the mock | Stub is purely decorative — safe to delete |
| Mock asserts `toHaveBeenCalledTimes` on a non-exported helper | Tests internals — rewrite to assert on the public output |
| `spawnSync` called without `env:` while subprocess reads a host-injected var (`OCTOCODE_AGENT_ID`, `CI`) | Test is environment-coupled — add explicit `env:` isolation |
| `beforeEach` creates a resource; no `it` in the same block consumes it | Unused setup — delete the setup block |

Next: when the class is confirmed, load `references/cleanup-playbook.md` for the TRIAGE and EXCISE phases. For replacement tests, load `references/test-quality.md`.
