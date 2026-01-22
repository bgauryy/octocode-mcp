# Octocode LSP Tools Test Plan

> Comprehensive agent evaluation tests for LSP tools: `lspGotoDefinition`, `lspFindReferences`, `lspCallHierarchy`
> Tests focus on semantic code navigation using Language Server Protocol.


---

## Table of Contents

1. [Test Repository Targets](#test-repository-targets)
2. [LSP Tools](#lsp-tools)
   - [4.1 lspGotoDefinition](#41-lspgotodefinition)
   - [4.2 lspFindReferences](#42-lspfindreferences)
   - [4.3 lspCallHierarchy](#43-lspcallhierarchy)
3. [Advanced LSP Scenarios](#advanced-lsp-scenarios)
   - [5.1 Cross-File Navigation](#51-cross-file-navigation)
   - [5.2 Call Hierarchy Depth & Cycles](#52-call-hierarchy-depth--cycles)
   - [5.3 Fallback Behavior](#53-fallback-behavior)
4. [Integration Test Flows](#integration-test-flows)


---

## Test Repository Targets

> **Note:** LSP tools require `lineHint` from `localSearchCode`. Test on TypeScript files in local workspace.

| Repository | Path | Purpose |
|------------|------|---------|
| octocode-mcp | `/packages/octocode-mcp/src` | Main MCP server TypeScript codebase |
| octocode-cli | `/packages/octocode-cli/src` | CLI TypeScript codebase |
| octocode-shared | `/packages/octocode-shared/src` | Shared utilities |


---

## LSP Tools

### 4.1 lspGotoDefinition

#### Schema Parameters

| Parameter | Type | Required | Constraints | Default |
|-----------|------|----------|-------------|---------|
| `uri` | string | ✅ Yes | min: 1 char | - |
| `symbolName` | string | ✅ Yes | 1-255 chars | - |
| `lineHint` | number | ✅ Yes | min: 1 (1-indexed) | - |
| `orderHint` | number | No | min: 0 | 0 |
| `contextLines` | number | No | 0-20 | 5 |

#### Normal Usage Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| LGD-N01 | Function definition | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="LSPClient", lineHint=53` | Returns LSPClient class definition |
| LGD-N02 | Method definition | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="gotoDefinition", lineHint=222` | Returns gotoDefinition method |
| LGD-N03 | Interface definition | `uri="packages/octocode-mcp/src/lsp/types.ts", symbolName="ExactPosition", lineHint=10` | Returns interface definition |
| LGD-N04 | Type alias | `uri="packages/octocode-mcp/src/lsp/types.ts", symbolName="SymbolKind", lineHint=15` | Returns type alias definition |
| LGD-N05 | With context lines | `uri="packages/octocode-mcp/src/lsp/resolver.ts", symbolName="SymbolResolver", lineHint=62, contextLines=10` | Returns class with 10 lines context |
| LGD-N06 | Imported symbol | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="spawn", lineHint=7` | Returns node child_process spawn |
| LGD-N07 | Exported constant | `uri="packages/octocode-mcp/src/lsp/resolver.ts", symbolName="defaultResolver", lineHint=240` | Returns defaultResolver definition |
| LGD-N08 | Private property | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="connection", lineHint=55` | Returns private connection property |
| LGD-N09 | Multiple occurrences with orderHint | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="uri", lineHint=175, orderHint=1` | Returns second occurrence of uri |
| LGD-N10 | Generic type parameter | `uri="packages/octocode-mcp/src/lsp/types.ts", symbolName="CodeSnippet", lineHint=20` | Returns CodeSnippet interface |

#### Edge Case Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| LGD-E01 | Min context (0) | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="start", lineHint=68, contextLines=0` | No context lines, just definition |
| LGD-E02 | Max context (20) | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="start", lineHint=68, contextLines=20` | 20 lines context around definition |
| LGD-E03 | Symbol at line 1 | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="spawn", lineHint=1` | Handles first line symbol |
| LGD-E04 | Symbol near end of file | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="stop", lineHint=513` | Handles near-end symbol |
| LGD-E05 | Cross-file definition | `uri="packages/octocode-mcp/src/lsp/manager.ts", symbolName="LSPClient", lineHint=5` | Jumps to client.ts definition |
| LGD-E06 | Re-exported symbol | `uri="packages/octocode-mcp/src/lsp/index.ts", symbolName="SymbolResolver", lineHint=35` | Follows to original definition |
| LGD-E07 | Async method | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="openDocument", lineHint=170` | Returns async method definition |
| LGD-E08 | Constructor | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="constructor", lineHint=61` | Returns constructor definition |
| LGD-E09 | High orderHint (no match) | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="uri", lineHint=175, orderHint=99` | Returns empty or error (symbol not found at that occurrence) |
| LGD-E10 | Unicode in path | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="test"` | Handles unicode path encoding |

#### Failure Tests

| Test ID | Description | Query | Expected Error |
|---------|-------------|-------|----------------|
| LGD-F01 | Missing uri | `symbolName="LSPClient", lineHint=53` | Validation error: uri required |
| LGD-F02 | Missing symbolName | `uri="packages/octocode-mcp/src/lsp/client.ts", lineHint=53` | Validation error: symbolName required |
| LGD-F03 | Missing lineHint | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="LSPClient"` | Validation error: lineHint required |
| LGD-F04 | Empty symbolName | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="", lineHint=53` | Validation error: min 1 char |
| LGD-F05 | Symbol too long (256 chars) | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="a".repeat(256), lineHint=53` | Validation error: max 255 chars |
| LGD-F06 | Invalid lineHint (0) | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="LSPClient", lineHint=0` | Validation error: min 1 |
| LGD-F07 | Invalid lineHint (negative) | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="LSPClient", lineHint=-5` | Validation error: min 1 |
| LGD-F08 | Invalid contextLines (25) | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="LSPClient", lineHint=53, contextLines=25` | Validation error: max 20 |
| LGD-F09 | Non-existent file | `uri="packages/octocode-mcp/src/nonexistent.ts", symbolName="test", lineHint=5` | File not found error |
| LGD-F10 | Symbol not found | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="nonExistentSymbol123", lineHint=53` | Symbol not found error |


---

### 4.2 lspFindReferences

#### Schema Parameters

| Parameter | Type | Required | Constraints | Default |
|-----------|------|----------|-------------|---------|
| `uri` | string | ✅ Yes | min: 1 char | - |
| `symbolName` | string | ✅ Yes | 1-255 chars | - |
| `lineHint` | number | ✅ Yes | min: 1 (1-indexed) | - |
| `orderHint` | number | No | min: 0 | 0 |
| `includeDeclaration` | boolean | No | - | true |
| `contextLines` | number | No | 0-10 | 2 |
| `referencesPerPage` | number | No | 1-50 | 20 |
| `page` | number | No | min: 1 | 1 |

#### Normal Usage Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| LFR-N01 | Find class references | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="LSPClient", lineHint=53` | Returns all LSPClient usages |
| LFR-N02 | Find function references | `uri="packages/octocode-mcp/src/lsp/resolver.ts", symbolName="resolveSymbolPosition", lineHint=245` | Returns all function usages |
| LFR-N03 | Find interface references | `uri="packages/octocode-mcp/src/lsp/types.ts", symbolName="ExactPosition", lineHint=10` | Returns all interface usages |
| LFR-N04 | Find type references | `uri="packages/octocode-mcp/src/lsp/types.ts", symbolName="SymbolKind", lineHint=15` | Returns all type usages |
| LFR-N05 | Exclude declaration | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="LSPClient", lineHint=53, includeDeclaration=false` | Excludes class definition, only usages |
| LFR-N06 | With context lines | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="connection", lineHint=55, contextLines=5` | Returns 5 lines context per reference |
| LFR-N07 | Pagination page 1 | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="uri", lineHint=175, referencesPerPage=5, page=1` | Returns first 5 references |
| LFR-N08 | Pagination page 2 | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="uri", lineHint=175, referencesPerPage=5, page=2` | Returns next 5 references |
| LFR-N09 | Find constant references | `uri="packages/octocode-mcp/src/lsp/resolver.ts", symbolName="defaultResolver", lineHint=240` | Returns all constant usages |
| LFR-N10 | Find method references | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="gotoDefinition", lineHint=222` | Returns all method calls |

#### Edge Case Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| LFR-E01 | Min context (0) | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="process", lineHint=54, contextLines=0` | No context lines per reference |
| LFR-E02 | Max context (10) | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="process", lineHint=54, contextLines=10` | 10 lines context per reference |
| LFR-E03 | Min referencesPerPage (1) | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="connection", lineHint=55, referencesPerPage=1` | Returns 1 reference per page |
| LFR-E04 | Max referencesPerPage (50) | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="connection", lineHint=55, referencesPerPage=50` | Returns up to 50 references |
| LFR-E05 | Single reference symbol | `uri="packages/octocode-mcp/src/lsp/resolver.ts", symbolName="lineSearchRadius", lineHint=63` | Returns single usage |
| LFR-E06 | Many references symbol | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="this", lineHint=60` | Handles many references |
| LFR-E07 | Cross-file references | `uri="packages/octocode-mcp/src/lsp/types.ts", symbolName="LSPRange", lineHint=25` | Returns refs across multiple files |
| LFR-E08 | High page number (beyond results) | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="LSPClient", lineHint=53, page=100` | Returns empty or last page |
| LFR-E09 | Multiple orderHint | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="uri", lineHint=175, orderHint=2` | Uses 3rd occurrence as starting point |
| LFR-E10 | Private symbol references | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="initialized", lineHint=56` | Returns private field usages |

#### Failure Tests

| Test ID | Description | Query | Expected Error |
|---------|-------------|-------|----------------|
| LFR-F01 | Missing uri | `symbolName="LSPClient", lineHint=53` | Validation error: uri required |
| LFR-F02 | Missing symbolName | `uri="packages/octocode-mcp/src/lsp/client.ts", lineHint=53` | Validation error: symbolName required |
| LFR-F03 | Missing lineHint | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="LSPClient"` | Validation error: lineHint required |
| LFR-F04 | Invalid lineHint (0) | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="LSPClient", lineHint=0` | Validation error: min 1 |
| LFR-F05 | Invalid contextLines (15) | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="LSPClient", lineHint=53, contextLines=15` | Validation error: max 10 |
| LFR-F06 | Invalid referencesPerPage (60) | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="LSPClient", lineHint=53, referencesPerPage=60` | Validation error: max 50 |
| LFR-F07 | Invalid page (0) | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="LSPClient", lineHint=53, page=0` | Validation error: min 1 |
| LFR-F08 | Symbol too long | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="a".repeat(256), lineHint=53` | Validation error: max 255 chars |
| LFR-F09 | Non-existent file | `uri="packages/octocode-mcp/src/nonexistent.ts", symbolName="test", lineHint=5` | File not found error |
| LFR-F10 | Symbol not found | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="nonExistentSymbol", lineHint=53` | Symbol not found, empty results |


---

### 4.3 lspCallHierarchy

#### Schema Parameters

| Parameter | Type | Required | Constraints | Default |
|-----------|------|----------|-------------|---------|
| `uri` | string | ✅ Yes | min: 1 char | - |
| `symbolName` | string | ✅ Yes | 1-255 chars | - |
| `lineHint` | number | ✅ Yes | min: 1 (1-indexed) | - |
| `direction` | enum | ✅ Yes | `incoming` \| `outgoing` | - |
| `orderHint` | number | No | min: 0 | 0 |
| `depth` | number | No | 1-3 | 1 |
| `contextLines` | number | No | 0-10 | 2 |
| `callsPerPage` | number | No | 1-30 | 15 |
| `page` | number | No | min: 1 | 1 |

#### Normal Usage Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| LCH-N01 | Incoming calls to method | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="gotoDefinition", lineHint=222, direction="incoming"` | Returns all callers of gotoDefinition |
| LCH-N02 | Outgoing calls from method | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="gotoDefinition", lineHint=222, direction="outgoing"` | Returns all functions called by gotoDefinition |
| LCH-N03 | Incoming with depth 2 | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="openDocument", lineHint=170, direction="incoming", depth=2` | Returns 2-level caller hierarchy |
| LCH-N04 | Outgoing with depth 2 | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="start", lineHint=68, direction="outgoing", depth=2` | Returns 2-level callee hierarchy |
| LCH-N05 | With context lines | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="stop", lineHint=513, direction="incoming", contextLines=5` | Returns 5 lines context per call |
| LCH-N06 | Pagination | `uri="packages/octocode-mcp/src/lsp/resolver.ts", symbolName="resolvePositionFromContent", lineHint=94, direction="incoming", callsPerPage=5, page=1` | Returns first 5 callers |
| LCH-N07 | Constructor callers | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="constructor", lineHint=61, direction="incoming"` | Returns all instantiations |
| LCH-N08 | Async function callees | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="initialize", lineHint=112, direction="outgoing"` | Returns async function callees |
| LCH-N09 | Private method callers | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="locationsToSnippets", lineHint=392, direction="incoming"` | Returns internal callers |
| LCH-N10 | Exported function callers | `uri="packages/octocode-mcp/src/lsp/manager.ts", symbolName="createClient", lineHint=10, direction="incoming"` | Returns external callers |
|| LCH-N11 | With orderHint | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="uri", lineHint=175, direction="incoming", orderHint=1` | Uses 2nd occurrence of uri as starting point |

#### Edge Case Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| LCH-E01 | Min depth (1) | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="gotoDefinition", lineHint=222, direction="incoming", depth=1` | Direct callers only |
| LCH-E02 | Max depth (3) | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="gotoDefinition", lineHint=222, direction="incoming", depth=3` | 3-level deep hierarchy |
| LCH-E03 | Min callsPerPage (1) | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="openDocument", lineHint=170, direction="incoming", callsPerPage=1` | Returns 1 call per page |
| LCH-E04 | Max callsPerPage (30) | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="openDocument", lineHint=170, direction="incoming", callsPerPage=30` | Returns up to 30 calls |
| LCH-E05 | No callers (entry point) | `uri="packages/octocode-mcp/src/index.ts", symbolName="main", lineHint=1, direction="incoming"` | Returns empty callers list |
| LCH-E06 | No callees (leaf function) | `uri="packages/octocode-mcp/src/lsp/uri.ts", symbolName="toUri", lineHint=5, direction="outgoing"` | Returns empty or minimal callees |
| LCH-E07 | Recursive function | `uri="packages/octocode-mcp/src/tools/lsp_call_hierarchy/callHierarchy.ts", symbolName="gatherIncomingCallsRecursive", lineHint=304, direction="outgoing"` | Handles self-reference |
| LCH-E08 | Mutual recursion cycle | `uri="packages/octocode-mcp/src/tools/lsp_call_hierarchy/callHierarchy.ts", symbolName="gatherIncomingCallsRecursive", lineHint=304, direction="outgoing", depth=3` | Detects and handles cycle |
| LCH-E09 | Many callers | `uri="packages/octocode-mcp/src/lsp/resolver.ts", symbolName="resolvePositionFromContent", lineHint=94, direction="incoming"` | Handles pagination of many callers |
| LCH-E10 | Cross-file call hierarchy | `uri="packages/octocode-mcp/src/lsp/manager.ts", symbolName="isLanguageServerAvailable", lineHint=15, direction="incoming"` | Returns callers from multiple files |

|| LCH-E11 | Min contextLines (0) | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="gotoDefinition", lineHint=222, direction="incoming", contextLines=0` | No context lines per call |
|| LCH-E12 | Max contextLines (10) | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="gotoDefinition", lineHint=222, direction="incoming", contextLines=10` | 10 lines context per call |
|| LCH-E13 | High page number (beyond results) | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="gotoDefinition", lineHint=222, direction="incoming", page=100` | Returns empty or last page |

#### Failure Tests

| Test ID | Description | Query | Expected Error |
|---------|-------------|-------|----------------|
| LCH-F01 | Missing uri | `symbolName="gotoDefinition", lineHint=222, direction="incoming"` | Validation error: uri required |
| LCH-F02 | Missing symbolName | `uri="packages/octocode-mcp/src/lsp/client.ts", lineHint=222, direction="incoming"` | Validation error: symbolName required |
| LCH-F03 | Missing lineHint | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="gotoDefinition", direction="incoming"` | Validation error: lineHint required |
| LCH-F04 | Missing direction | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="gotoDefinition", lineHint=222` | Validation error: direction required |
| LCH-F05 | Invalid direction | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="gotoDefinition", lineHint=222, direction="invalid"` | Validation error: enum mismatch |
| LCH-F06 | Invalid depth (0) | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="gotoDefinition", lineHint=222, direction="incoming", depth=0` | Validation error: min 1 |
| LCH-F07 | Invalid depth (4) | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="gotoDefinition", lineHint=222, direction="incoming", depth=4` | Validation error: max 3 |
| LCH-F08 | Invalid callsPerPage (35) | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="gotoDefinition", lineHint=222, direction="incoming", callsPerPage=35` | Validation error: max 30 |
| LCH-F09 | Non-callable symbol (interface) | `uri="packages/octocode-mcp/src/lsp/types.ts", symbolName="ExactPosition", lineHint=10, direction="incoming"` | Not callable or empty |
| LCH-F10 | Non-existent file | `uri="packages/octocode-mcp/src/nonexistent.ts", symbolName="test", lineHint=5, direction="incoming"` | File not found error |

|| LCH-F11 | Invalid page (0) | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="gotoDefinition", lineHint=222, direction="incoming", page=0` | Validation error: min 1 |
|| LCH-F12 | Invalid contextLines (15) | `uri="packages/octocode-mcp/src/lsp/client.ts", symbolName="gotoDefinition", lineHint=222, direction="incoming", contextLines=15` | Validation error: max 10 |

---

## Advanced LSP Scenarios

### 5.1 Cross-File Navigation

| Test ID | Description | Flow | Expected Result |
|---------|-------------|------|-----------------|
| XF-01 | Jump to imported type | 1. `localSearchCode` for "LSPClient" in manager.ts<br>2. `lspGotoDefinition` | Navigates to client.ts definition |
| XF-02 | Find all usages across files | 1. `localSearchCode` for "SymbolKind"<br>2. `lspFindReferences` | Returns usages in types.ts, client.ts, callHierarchy.ts |
| XF-03 | Trace cross-file calls | 1. `lspCallHierarchy` on `createClient` incoming | Shows callers from multiple tool files |
| XF-04 | Re-export chain | 1. `lspGotoDefinition` on symbol from index.ts | Follows re-export to original |
| XF-05 | Monorepo import | 1. `lspGotoDefinition` on `octocode-shared` import | Navigates to shared package |

### 5.2 Call Hierarchy Depth & Cycles

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| DC-01 | Direct recursion detection | `symbolName="gatherIncomingCallsRecursive", direction="outgoing", depth=2` | Includes self but doesn't infinite loop |
| DC-02 | Mutual recursion (A↔B) | `symbolName="enhanceIncomingCalls", direction="outgoing", depth=2` | Handles A→B→A cycle |
| DC-03 | Long cycle (A→B→C→A) | `symbolName="processCallHierarchy", direction="outgoing", depth=3` | Detects cycle, limits traversal |
| DC-04 | Deep hierarchy flatten | `symbolName="executeGotoDefinition", direction="incoming", depth=3` | Flattens 3-level results correctly |
| DC-05 | Cycle with pagination | `symbolName="processCallHierarchy", direction="outgoing", depth=2, callsPerPage=5` | Handles paginated cycle results |

### 5.3 Fallback Behavior

> LSP tools fallback to pattern matching (ripgrep/grep) when language server unavailable.

| Test ID | Description | Scenario | Expected Result |
|---------|-------------|----------|-----------------|
| FB-01 | Unsupported file type | `.txt` file | Falls back to text search |
| FB-02 | LSP server not installed | Python file without pylsp | Falls back to ripgrep |
| FB-03 | Definition detection heuristic | `const myFunc = function()` | Correctly identifies as definition |
| FB-04 | Reference sorting | Multiple references found | Definition sorted first |
| FB-05 | Context extraction | Fallback with context | Extracts surrounding lines correctly |


---

## Integration Test Flows

### Flow 1: Symbol Discovery → Definition → References

```
1. localSearchCode(pattern="SymbolResolver", path="/packages/octocode-mcp/src") → Get lineHint
2. lspGotoDefinition(symbolName="SymbolResolver", lineHint=N) → Get definition location
3. lspFindReferences(symbolName="SymbolResolver", lineHint=N) → Get all usages
```

### Flow 2: Call Hierarchy Trace

```
1. localSearchCode(pattern="executeGotoDefinition", path="/packages/octocode-mcp/src") → Get lineHint
2. lspCallHierarchy(symbolName="executeGotoDefinition", direction="incoming") → Who calls?
3. lspCallHierarchy(symbolName="executeGotoDefinition", direction="outgoing") → What does it call?
4. lspCallHierarchy(symbolName="<callee>", direction="outgoing", depth=2) → Deeper trace
```

### Flow 3: Type Navigation Chain

```
1. localSearchCode(pattern="CallHierarchyResult", path="/packages/octocode-mcp/src") → Get lineHint
2. lspGotoDefinition(symbolName="CallHierarchyResult", lineHint=N) → Jump to type
3. lspFindReferences(symbolName="CallHierarchyResult", lineHint=N) → Find all usages
4. lspGotoDefinition(symbolName="CallHierarchyItem", lineHint=M) → Navigate to nested type
```

### Flow 4: Cross-File Investigation

```
1. lspGotoDefinition(uri="src/tools/lsp_goto_definition/execution.ts", symbolName="createClient", lineHint=N)
   → Jumps to manager.ts
2. lspCallHierarchy(uri="src/lsp/manager.ts", symbolName="createClient", direction="incoming", depth=2)
   → Shows all tools that use createClient
3. lspFindReferences(uri="src/lsp/manager.ts", symbolName="createClient", lineHint=M)
   → Shows complete usage map
```


---

## Bulk Query Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| BQ-LSP-01 | 5 parallel definitions | 5 `lspGotoDefinition` queries | Returns 5 definition results |
| BQ-LSP-02 | 5 parallel references | 5 `lspFindReferences` queries | Returns 5 reference sets |
| BQ-LSP-03 | 3 parallel call hierarchies | 3 `lspCallHierarchy` queries | Returns 3 call graphs |
| BQ-LSP-04 | 6 queries (over limit) | 6 `lspGotoDefinition` queries | Validation error: max 5 |
| BQ-LSP-05 | Mixed success/failure | 5 queries, 2 invalid | Returns 3 results, 2 errors |


---

## Test Execution Checklist

- [ ] **lspGotoDefinition**: All 30 tests (10 normal, 10 edge, 10 failure)
- [ ] **lspFindReferences**: All 30 tests (10 normal, 10 edge, 10 failure)
- [ ] **lspCallHierarchy**: All 36 tests (11 normal, 13 edge, 12 failure)
- [ ] **Cross-File Navigation**: All 5 scenarios
- [ ] **Depth & Cycles**: All 5 scenarios
- [ ] **Fallback Behavior**: All 5 scenarios
- [ ] **Integration Flows**: All 4 flows
- [ ] **Bulk Queries**: All 5 bulk tests


---

*Test Plan Version: 1.0*
*Last Updated: January 2026*
*Total Test Cases: 121+*


---

## Additional Bulk Query Tests for lspCallHierarchy

### 6.1 lspCallHierarchy Bulk Query Limit Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| BQ-LCH-01 | 3 parallel call hierarchies (max) | 3 `lspCallHierarchy` queries with different symbols | Returns 3 call hierarchy results |
| BQ-LCH-02 | 4 queries (over limit) | 4 `lspCallHierarchy` queries | Validation error: maxQueries=3, got 4 |
| BQ-LCH-03 | Mixed directions | 2 incoming + 1 outgoing queries | Returns 3 results with correct directions |
| BQ-LCH-04 | Mixed depths | queries with depth=1, depth=2, depth=3 | Returns hierarchies at different depths |
| BQ-LCH-05 | One invalid in batch | 2 valid + 1 invalid (missing direction) | Returns 2 results + 1 validation error |
