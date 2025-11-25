## JS minification, bundling & obfuscation — concise reference for analysis agents

## Goal

Provide a structured approach to understanding minified JavaScript files of any size.

- **Objectives:**
  - Identify minification techniques and bundling/obfuscation patterns within the file.
  - Locate and extract relevant code regions using regex and pattern searches.
  - Use targeted extraction (cherry-pick) to retrieve specific content chunks by character offsets or matching anchors.
  - Document discovered locations and their contexts for effective navigation and analysis.


### 1) Quick orientation (capabilities)
- **File search**: fast substring/regex lookups.
- **Content slicing**: extract ranges/offsets.
- Use for first-pass heuristics: detect signatures, split module tables, locate string decoders, isolate large functions.

### 2) Minimum vocabulary (terms to recognize)
- **Minification**: whitespace/identifier shortening, dead code removal, property mangling. Tools: Terser, UglifyJS, Closure, esbuild. (Minify JS)
- **Obfuscation**: string arrays + decoder, control-flow flattening, opaque predicates, eval/Function wrappers. (Reflectiz)
- **Bundling**: modules packaged into a runtime + module table (webpack, rollup, parcel, esbuild, browserify, vite). (webpack)
- **Module systems**: CommonJS (`require`, `module.exports`), AMD, UMD, ESM (`import`/`export`), webpack bootstrap (`__webpack_require__`, `webpackJsonp`), parcel/browserify wrappers.

### 3) First-pass detection (fast, non-executing checks)
- **Source map**: look for `//# sourceMappingURL=`; prefer using it when present.
- **Webpack bootstrap**: `__webpack_require__`, `webpackJsonp`, `__webpack_modules__`, `__webpack_exports__`.
- **Parcel/Browserify**: top-level wrapper `function(require,module,exports)` or `parcelRequire`.
- **ESM/rollup/UMD**: UMD checks, `exports.__esModule`, `export {`.
- **Modern ESM**: `import.meta.url` (assets), `import.meta.hot`, `import.meta.glob`, `import.meta.env`.
- **SystemJS**: `System.register()` or `System.import()`.
- **Packed/eval**: `eval(`, `Function("...")`, base64/hex literals, long `_0x...=['a','b',...]` arrays. (Trickster)
- **Large IIFE**: `(function(...){ ... })()` wrapping entire file.

### 4) Module-resolution patterns (find dependencies)
- Static CommonJS: `require('...')`
- Static ESM: `import ... from '...'`
- Webpack modules: `__webpack_require__(...)` or numeric module IDs in array/object, e.g. `({0:function(...),1:function(...)})` or `__webpack_modules__[id] = function...` (webpack)
- Dynamic/chunked: `require.ensure(...)`, `import('...')`
- Module boundaries: `module.exports` / `exports.*`
- Practical: when you find a module table, extract each function value and treat as separate “files” for AST parsing.

### 5) Minification vs obfuscation (how to tell)
- **Minification**: short names, compact formatting, predictable patterns, no runtime string-decoding loops. Size/benchmarks can hint the minifier (esbuild/terser/uglify/closure).
- **Obfuscation**: decoding functions, string arrays (`_0x...`), `while(true)` + `switch` state machine, opaque predicates, layers of `eval`/`Function`. (Reflectiz)
- **Heuristic**: identifier entropy. Very short/systematic → minified. Hex-like + string table + decoder → obfuscated.

### 6) Reverse-engineering workflow (safest → deeper)
- **A. Static (non-executing)**
  - Use source maps (fast win).
  - Find module table (webpack/browserify/parcel) and split modules.
  - Prettify per module (js-beautify/prettier).
  - Parse AST (acorn/espree/babel). Build dep graph from `require`/`import`/`__webpack_require__` and `module.exports`.
  - Flag business modules: large bodies, many locals/strings, network/DOM/crypto usage.
- **B. Deobfuscation (when needed)**
  - Find string-array decoders (`_0x1234(idx)`), extract array, statically replace calls. (Trickster)
  - Unwrap `eval`: recover constructed strings statically or via isolated/sandboxed evaluation.
  - Control-flow flattening: detect `while(true)` + `switch(state)`; reconstruct via simulated transitions or symbolic evaluation. (JavaScript in Plain English)
  - Opaque predicates: eliminate constant branches.
  - Safety: never execute untrusted code in host; use real sandboxes (Node vm/headless browser + strict CSP). Prefer static resolution.
- **C. Dynamic (last resort)**
  - Run in sandboxed browser (Puppeteer). Instrument to log module evaluation order, network calls, exports.
  - Hook `__webpack_require__`/`require` to log module id → function mapping at runtime.

### 7) Concrete regex/snippets (first-pass detectors)

```regex
// Source map
//# sourceMappingURL=.*

// Webpack bootstrap
__webpack_require__|webpackJsonp|__webpack_modules__|__webpack_exports__

// Module Federation (webpack 5)
__webpack_modules__|container|remoteEntry

// Module object/array
\{?\s*\d+\s*:\s*function\s*\(|__webpack_modules__\s*=\s*\{

// SystemJS
System\.register\(|System\.import\(

// HMR patterns
module\.hot\.accept|import\.meta\.hot

// String-array obfuscator
var\s+_0x[a-f0-9]+\s*=\s*\[(['"][^'"]+['"],?)+\]

// String array rotation pattern
stringArray\['push'\]\(stringArray\['shift'\]\(\)\)

// Control flow flattening
while\s*\(true\)\s*\{.*switch\s*\(

// Tree shaking markers
\/\*#__PURE__\*\/|"sideEffects"

// Packer (Dean Edwards)
eval\(function\(p,a,c,k,e,d\)

// Dynamic import
import\(\s*['"][^'"]+['"]\s*\)|require\.ensure\(

// Glob imports (Vite)
import\.meta\.glob\(

// Asset URLs
new\s+URL\([^,]+,\s*import\.meta\.url\)

// Parcel/Browserify wrapper
function\s*\(\s*require\s*,\s*module\s*,\s*exports\s*\)|parcelRequire

// UMD pattern
typeof\s+exports\s*===\s*['"]object['"].*typeof\s+define\s*===\s*['"]function['"]
```

### 8) Heuristics to find business logic quickly
- Rank modules by:
  - Size (bytes/LOC), esp. >100KB
  - String density (unique literals: messages, URLs, selectors)
  - API usage (fetch, axios, XMLHttpRequest, ws, localStorage, DOM selectors/listeners)
  - Crypto/custom encoding
  - Network endpoints (literal URLs or paths)
  - Entry points (early-required modules or exporting top-level objects)
- Automate: per module compute size, unique strings, network/DOM/export counts, functions > N lines; sort and inspect top N.

### 9) Common bundlers — quick signatures
- **Webpack**: `__webpack_require__`, `__webpack_modules__`, chunk arrays, `webpackJsonp`. (webpack)
- **Module Federation**: `container`, `remoteEntry.js`, shared scopes → webpack 5 micro-frontends.
- **Rollup**: ESM-like wrappers; often `exports.__esModule = true` in UMD builds.
- **Browserify**: top wrapper `function(require,module,exports){...}` + module map object.
- **Parcel**: `parcelRequire`, HMR runtime markers.
- **SystemJS**: `System.register()`, registry-based dynamic loader.
- **esbuild / Vite**: modern ESM bundles; Vite pre-bundles with esbuild and uses ESM dev server patterns. (vitejs)

### 10) Common obfuscation techniques (short list)
- Identifier renaming (minifiers/obfuscators): `a,b,c` or `_0x12`.
- String array + decoder: replace literals with array lookups decoded at runtime. (Trickster)
- Control-flow flattening/state machine: `while(true)` + `switch`.
- Opaque predicates & dead code insertion. (Reflectiz)
- Eval/Function constructor packing.
- Virtualization/bytecode (rare; commercial obfuscators).

**Modern bundler features:**
- Module Federation: micro-frontend containers, remote module loading
- HMR: `module.hot.accept()` (webpack), `import.meta.hot` (Vite)
- Tree shaking: `/*#__PURE__*/` annotations, `sideEffects` flag
- Code splitting: dynamic `import()` chunks, lazy loading
- Glob imports: `import.meta.glob('./**/*.js')` (Vite)

**Specific transformations (javascript-obfuscator):**
- String array rotation: `stringArray['push'](stringArray['shift']())` in while loop
- Control flow replacers: BinaryExpression, CallExpression, LogicalExpression, StringLiteral
- Property mangling: RenamePropertiesTransformer
- Member expression obfuscation: computed property access
- Object expression flattening
- Export/import obfuscation

**String array rotation signature (exact pattern):**
```javascript
(function(stringArrayFunction, comparisonValue) {
    const stringArray = stringArrayFunction();
    while (true) {
        try {
            if ({expression} === comparisonValue) break;
            else stringArray['push'](stringArray['shift']());
        } catch (e) {
            stringArray['push'](stringArray['shift']());
        }
    }
})({functionName}, {value});
```
→ Detect: IIFE + while(true) + push/shift + comparison value

### 11) Deobfuscation transformation patterns (proven techniques)
**Unminify (webcrack):**
- `for` → `while` normalization
- Split merged variable declarations
- Merge string concatenations (`'a'+'b'` → `'ab'`)
- Logical expression → if statement (`a && fn()` → `if(a) fn()`)
- Ternary → if statement
- `typeof x === 'undefined'` → standard check
- Computed properties → dot notation
- Yoda conditions reversal (`5 === x` → `x === 5`)
- `void 0` → `undefined`
- `JSON.parse('...')` → object literal

**Deobfuscation (javascript-deobfuscator):**
- Array unpacker: extract string array, map indices to values
- Proxy function removal: inline wrapper functions
- Dead branch removal: eliminate unreachable code
- Expression simplifier: constant folding, arithmetic reduction
- String decoder: resolve encoded strings
- Property simplifier: `obj['key']` → `obj.key`
- Variable renaming: restore meaningful names from context

### 12) Tools & commands (practical)
- Prettify & parse:

```bash
prettier --parser babel file.js
js-beautify file.js > pretty.js
node -e "const acorn=require('acorn'); console.log(acorn.parse(require('fs').readFileSync('pretty.js','utf8')))"
```

- AMD/RequireJS pattern:

```javascript
// AMD define
define(['dep1', 'dep2'], function(dep1, dep2) {
  return { /* exports */ };
});
```

- Split webpack bundle: find module object and extract function bodies programmatically.
- Replace string-table calls: evaluate array safely and statically substitute `_0x123(idx)` at callsites via AST transform.
- Static graph: run madge or dependency-cruiser on extracted modules.
- Bundle inspection: source-map-explorer or webpack-bundle-analyzer (on builds or extracted modules). (Medium)
- Dynamic sandbox: Puppeteer; instrument `window`/`__webpack_require__` to capture decoded sources.

### 13) Fast dependency-finding recipes
- If module table exists: split modules → parse requires per module → build adjacency list.
- If no table but many `require("x")`: extract and map all.
- Obfuscated requires (e.g., `require(_0x1a2(0x12))`): decode string table first, then map.
- Dynamic imports: sandbox partial execution to capture runtime module names.

### 14) Example — split a webpack bundle (pseudo-steps)
- Find region like `({0:function(module,exports,require){...},1:function(...) {...}})`.
- Extract each `function(...) { ... }` body to `module-<id>.js`.
- Run prettier per file; parse with acorn/Babel to collect `require`/`import` tokens.
- Build graph: per module `deps = set(requires)`; analyze entries used in bootstrap.

### 15) Red flags & safety
- Do not `eval`/`require` untrusted code in your host.
- Use a sandboxed VM or containerized headless browser with strict CSP.
- Obfuscated code that decodes then fetches remote payloads may be malicious; treat network calls carefully.

### 16) Quick checklist for every large JS file
- Find source map → if yes, reconstruct and stop.
- Detect bundler signature (webpack/parcel/rollup) → split modules.
- Prettify modules → parse AST → extract dependency graph.
- Detect obfuscation patterns; if present, statically decode string arrays.
- Score modules (size, string density, network/DOM/crypto) → surface top N.
- If needed, sandbox and instrument module loader to capture runtime decoding.