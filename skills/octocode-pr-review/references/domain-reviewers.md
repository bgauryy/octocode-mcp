# Domain Reviewers Reference

Specialized review lenses for comprehensive PR analysis. Each domain has detection signals and priority mapping.

---

## Bug Domain

**Detect**: Runtime errors, logic flaws, data corruption, resource leaks, race conditions, type violations, API misuse

**Priority**:
- **HIGH**: Crashes, data corruption, security breach, null access in hot path
- **MED**: Edge-case errors, uncertain race conditions
- **LOW**: Theoretical issues without evidence

**Skip**: Try/catch without cleanup need, compiler-caught issues, style preferences

---

## Architecture Domain

**Detect**: Pattern violations, tight coupling, circular dependencies, mixed concerns, leaky abstractions, wrong module placement

**Priority**:
- **HIGH**: Breaking public API, circular dependencies causing bugs
- **MED**: Significant pattern deviations, tech debt increase
- **LOW**: Minor inconsistencies

**Skip**: Single-file organization, framework-standard patterns

---

## Performance Domain

**Detect**: O(n^2) where O(n) possible, blocking operations, missing cache, unbatched ops, memory leaks

**Priority**:
- **HIGH**: O(n^2) on large datasets, memory leaks, blocking main thread
- **MED**: Moderate inefficiency in frequent paths
- **LOW**: Micro-optimizations, one-time setup code

**Skip**: Negligible impact, theoretical improvements

---

## Code Quality Domain

**Detect**: Naming violations, confusing structure, convention breaks, visible typos, magic numbers, TODO comments in new code

**Priority**:
- **HIGH**: Typos in public API/endpoints
- **MED**: Internal naming issues, DRY violations, codebase convention deviations
- **LOW**: Comment typos, minor readability, TODO notes

**Skip**: Personal style, linter-handled formatting

---

## Duplicate Code Domain

**Detect**: Missed opportunities to leverage existing code, utilities, or established patterns in the codebase

**Priority**:
- **HIGH**: Missing use of critical existing utilities that could prevent bugs
- **MED**: Code duplication violating DRY across files
- **LOW**: Minor opportunities to reuse patterns

**Skip**: Intentional duplication for clarity

---

## Error Handling & Diagnostics Domain

**Detect**: Poor error messages, unclear logs, swallowed exceptions, missing debugging context

**Priority**:
- **HIGH**: Swallowed exceptions hiding critical failures
- **MED**: Unclear error messages, missing context in logs
- **LOW**: Verbose logging improvements

**Skip**: Internal service calls in trusted environments (assume reliability)

---

## Flow Impact Domain

**Detect**: How changed code alters existing execution flows, data paths, or system behavior

**Priority**:
- **HIGH**: Changes that break existing callers, alter critical paths, or change data flow semantics
- **MED**: Flow changes requiring updates in dependent code, altered return values/types
- **LOW**: Internal refactors with same external behavior

**Analysis**: Trace callers of modified functions, check all usages of changed interfaces, verify data flow integrity

---

## Global Exclusions (NEVER Suggest)

- Compiler/TypeScript/Linter errors (tooling catches these)
- Unchanged code (no '+' prefix)
- Test implementation details (unless broken)
- Generated/vendor files
- Speculative "what if" scenarios
- Issues already raised in existing PR comments
