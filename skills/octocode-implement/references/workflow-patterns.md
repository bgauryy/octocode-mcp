# Workflow Patterns - Implementation Agent

Common implementation flows for different task types.

---

## Pre-Implementation Patterns

### 1. Codebase Orientation (First Time)

**Use when**: New to the repository, need mental model.

```
localViewStructure(root, depth=1) → identify src/tests/config → drill into src (depth=2)
```

**Steps:**
1. **Map Root**: See top-level structure
2. **Identify Key Dirs**: src, tests, config, types
3. **Drill Into Source**: Understand feature organization
4. **Find Entry Points**: main.ts, index.ts, app.ts
5. **Note Test Structure**: How are tests organized?

```json
// 1. Map root
{ "path": "", "depth": 1 }

// 2. Drill into source
{ "path": "src", "depth": 2 }

// 3. Find entry points
{ "pattern": "createApp|bootstrap|main", "path": "src", "filesOnly": true }

// 4. Understand test structure
{ "path": "tests", "depth": 1 }
```

**Output**: Clear mental model of where things live.

---

### 2. Feature Area Discovery

**Use when**: Know what feature to implement, need to find where.

```
localSearchCode(featureName, filesOnly) → localGetFileContent → trace dependencies
```

**Steps:**
1. **Search for Similar**: Find existing similar features
2. **Read Implementation**: Understand the pattern
3. **Trace Dependencies**: What does it import/use?
4. **Find Tests**: How is it tested?

```json
// 1. Find similar feature
{ "pattern": "export.*UserService|class.*UserService", "path": "src", "filesOnly": true }

// 2. Read implementation
{ "path": "src/services/UserService.ts", "matchString": "export class UserService", "matchStringContextLines": 50 }

// 3. Find tests
{ "pattern": "describe.*UserService", "path": "tests", "filesOnly": true }
```

---

### 3. Impact Analysis (Before Modification)

**Use when**: About to modify existing code, need to understand impact.

```
lspFindReferences → lspCallHierarchy(incoming) → map affected files
```

**Steps:**
1. **Find All Usages**: Who uses this function/class?
2. **Trace Callers**: What's the call chain?
3. **Map Affected Files**: Create change impact list
4. **Prioritize**: Which callers need updates?

```json
// 1. Find all usages
{ "uri": "src/core/processor.ts", "symbolName": "processData", "lineHint": 45, "includeDeclaration": false }

// 2. Trace call hierarchy
{ "uri": "src/core/processor.ts", "symbolName": "processData", "lineHint": 45, "direction": "incoming", "depth": 2 }
```

**Output**: List of files that need attention.

---

## Implementation Patterns

### 4. Feature Addition (Copy Pattern)

**Use when**: Adding new feature similar to existing one.

```
Find Similar → Read Thoroughly → Copy Structure → Adapt → Test
```

**Steps:**
1. **Find Exemplar**: Locate similar existing feature
2. **Deep Read**: Read entire implementation + tests
3. **Copy Structure**: Create files mirroring the pattern
4. **Adapt Content**: Modify for new requirements
5. **Add Tests**: Follow same test patterns
6. **Validate**: Run test suite

```json
// 1. Find similar feature
{ "pattern": "export class ProductService", "path": "src/services", "filesOnly": true }

// 2. Read implementation fully
{ "path": "src/services/ProductService.ts", "fullContent": true }  // if small
// OR
{ "path": "src/services/ProductService.ts", "matchString": "export class", "matchStringContextLines": 100 }

// 3. Read its tests
{ "path": "tests/services/ProductService.test.ts", "fullContent": true }

// 4. Create new files following same patterns...
```

---

### 5. API Addition

**Use when**: Adding new endpoint/method to existing API.

```
Find API Layer → Read Existing Endpoints → Copy Pattern → Add Types → Test
```

**Steps:**
1. **Locate API Layer**: Find route/controller files
2. **Read Existing**: Understand endpoint patterns
3. **Find Types**: Locate request/response types
4. **Find Validation**: How is input validated?
5. **Implement**: Follow exact pattern
6. **Add Tests**: Follow API test patterns

```json
// 1. Find API routes
{ "pattern": "@(Controller|Router|Get|Post)", "path": "src", "type": "ts", "filesOnly": true }

// 2. Read existing endpoint
{ "path": "src/api/users.ts", "matchString": "@Get", "matchStringContextLines": 30 }

// 3. Find types
{ "pattern": "interface.*Request|interface.*Response", "path": "src/types", "filesOnly": true }

// 4. Find validation
{ "pattern": "validate|schema|zod|yup", "path": "src/api", "filesOnly": true }
```

---

### 6. Bug Fix

**Use when**: Fixing specific broken behavior.

```
Understand Bug → Locate Code → Trace Flow → Find Root Cause → Minimal Fix → Regression Test
```

**Steps:**
1. **Understand**: What's expected vs actual?
2. **Locate**: Find the relevant code area
3. **Trace Flow**: How does data flow through?
4. **Root Cause**: Why does it fail?
5. **Minimal Fix**: Change as little as possible
6. **Test**: Add regression test

```json
// 1. Find relevant area
{ "pattern": "handleUserLogin|processLogin", "path": "src", "filesOnly": true }

// 2. Read implementation
{ "path": "src/auth/login.ts", "matchString": "handleUserLogin", "matchStringContextLines": 40 }

// 3. Trace the flow
{ "uri": "src/auth/login.ts", "symbolName": "handleUserLogin", "lineHint": 25, "direction": "outgoing" }

// 4. Find where validation happens
{ "pattern": "validate.*credentials|checkPassword", "path": "src/auth" }
```

---

### 7. Refactoring (Rename/Move)

**Use when**: Restructuring without changing behavior.

```
Find ALL References → Plan Changes → Execute Incrementally → Keep Tests Green
```

**CRITICAL**: Tests must pass after EVERY change.

**Steps:**
1. **Find All Usages**: Complete impact analysis
2. **Plan Order**: Determine safe change order
3. **Execute One**: Make single atomic change
4. **Run Tests**: Must pass
5. **Repeat**: Continue until complete

```json
// 1. Find ALL references
{ "uri": "src/utils/helper.ts", "symbolName": "oldFunctionName", "lineHint": 10, "includeDeclaration": true }

// 2. Use LSP across all found files
// ... then make changes file by file, testing after each
```

---

### 8. Interface Change

**Use when**: Modifying types/interfaces used by multiple modules.

```
Find All Usages → Assess Impact → Update Types → Update Consumers → Update Implementation
```

**Steps:**
1. **Find All Usages**: Where is this type used?
2. **Categorize**: Type assertions, function params, returns
3. **Plan Migration**: Adding required field? Make optional first
4. **Update Types**: Change the interface
5. **Update Consumers**: Fix each usage
6. **Validate**: Full test suite

```json
// 1. Find type usages
{ "uri": "src/types/user.ts", "symbolName": "UserDTO", "lineHint": 5, "includeDeclaration": true, "referencesPerPage": 50 }

// 2. Categorize by reviewing each reference
// 3. Make changes incrementally
```

---

### 9. Adding Tests

**Use when**: Need to add tests for existing code.

```
Find Code → Understand Behavior → Find Test Patterns → Write Tests
```

**Steps:**
1. **Read Code**: Understand what to test
2. **Find Test Patterns**: How are similar things tested?
3. **Find Mocking Patterns**: How are dependencies mocked?
4. **Write Tests**: Follow existing patterns
5. **Run**: Ensure they pass

```json
// 1. Read the code to test
{ "path": "src/services/OrderService.ts", "matchString": "export class OrderService", "matchStringContextLines": 100 }

// 2. Find similar test patterns
{ "pattern": "describe.*Service", "path": "tests", "filesOnly": true }

// 3. Read a similar test file
{ "path": "tests/services/UserService.test.ts", "fullContent": true }

// 4. Find mocking patterns
{ "pattern": "mock|jest.fn|vi.fn|beforeEach", "path": "tests/services/UserService.test.ts" }
```

---

## Advanced Patterns

### 10. Cross-Module Feature

**Use when**: Feature spans multiple modules/packages.

```
Map All Affected Modules → Research Each → Plan Integration Order → Implement Bottom-Up
```

**Steps:**
1. **Map Scope**: Which modules are affected?
2. **Research Each**: Understand each module's patterns
3. **Find Integration Points**: How do they communicate?
4. **Plan Order**: Bottom-up (dependencies first)
5. **Implement**: One module at a time, test between

---

### 11. External Library Integration

**Use when**: Integrating a new third-party library.

```
packageSearch → Read Upstream Docs → Find Local Examples → Implement Wrapper → Test
```

**Steps:**
1. **Find Library**: `packageSearch` for repo location
2. **Read Docs**: Understand API from upstream
3. **Find Local Examples**: Are similar libs used locally?
4. **Plan Wrapper**: How to isolate the dependency
5. **Implement**: Follow local patterns for external deps
6. **Test**: Include integration tests

```json
// 1. Find library repo
{ "name": "axios", "ecosystem": "npm" }

// 2. Search for existing usage patterns locally
{ "pattern": "import.*from 'axios'|require.*axios", "path": "src", "filesOnly": true }

// 3. Read existing wrapper if any
{ "path": "src/utils/http.ts", "matchString": "axios", "matchStringContextLines": 30 }
```

---

### 12. Performance Optimization

**Use when**: Need to improve performance of existing code.

```
Profile/Identify → Understand Current Flow → Find Optimization Patterns → Apply → Measure
```

**Steps:**
1. **Identify**: What's slow? (from spec)
2. **Trace Flow**: Understand current implementation
3. **Find Patterns**: How are similar things optimized in codebase?
4. **Research**: Check for caching, batching, async patterns
5. **Apply**: Make targeted changes
6. **Validate**: Ensure correctness, measure improvement

```json
// 1. Read slow code
{ "path": "src/data/processor.ts", "matchString": "processLargeDataset", "matchStringContextLines": 50 }

// 2. Trace its calls
{ "uri": "src/data/processor.ts", "symbolName": "processLargeDataset", "lineHint": 30, "direction": "outgoing", "depth": 2 }

// 3. Find optimization patterns in codebase
{ "pattern": "cache|memo|batch|Promise\\.all|concurrent", "path": "src", "filesOnly": true }
```

---

## Anti-Patterns to Avoid

| Bad | Good |
|-----|------|
| **Implementing without reading similar code** | **Find exemplar first, then copy pattern** |
| **Modifying without impact analysis** | **lspFindReferences before any change** |
| **Writing new patterns** | **Follow existing codebase patterns** |
| **Big bang changes** | **Small incremental changes with tests** |
| **Skipping tests** | **Tests for every change** |
| **Guessing file locations** | **Search first, then read** |
| **Reading entire files** | **Use matchString for targeted reads** |

---

## Checklist Before Starting Implementation

- [ ] **Spec understood?** (Requirements clear)
- [ ] **Codebase mapped?** (Know where things are)
- [ ] **Similar feature found?** (Pattern to follow)
- [ ] **Impact analyzed?** (Know what's affected)
- [ ] **Test patterns found?** (Know how to test)
- [ ] **User checkpoint?** (Approach confirmed)

## Checklist Before Declaring Done

- [ ] **All tasks complete?** (Per TodoWrite)
- [ ] **Patterns followed?** (No new patterns)
- [ ] **Tests added?** (Coverage maintained)
- [ ] **Validation passed?** (Compile, lint, test)
- [ ] **No scope creep?** (Only what spec asked)

