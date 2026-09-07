# Test Quality Patterns

Load when writing replacement tests after removing legacy, rigid, or environment-coupled ones. Why: a test removed without a quality replacement leaves a coverage gap. Good tests are behavioral, environment-independent, and named by outcome.

## Quality test checklist

| Property | Rule |
|----------|------|
| **Behavioral** | Tests observable outputs (return values, emitted events, written files, exit codes), never private state or internal call counts. |
| **Isolated** | Creates its own temp dirs, resets env vars in `afterEach`, and never shares mutable state between `it` blocks. |
| **Deterministic** | Same result on every machine, any time of day, regardless of ambient env vars, current directory, or pre-existing files. |
| **Named by outcome** | `it('returns 404 when the key is missing')` not `it('test case 3')` or `it('works')`. |
| **Minimal fixture** | Sets up only what the test needs; no kitchen-sink `beforeAll` that primes 15 fields for a test that touches 2. |
| **Readable failure** | When it fails, the assertion message tells you what was expected and what arrived — no raw JSON dumps without labels. |

## Pattern library

### Pattern 1 — subprocess env isolation

Use when testing a CLI that reads env vars, replacing an environment-coupled test.

```ts
function run(args: string[], env: NodeJS.ProcessEnv = process.env) {
  return spawnSync(NODE, [SCRIPT, ...args], {
    encoding: 'utf8',
    timeout: 30_000,
    // Explicit env: strip host-injected vars that leak from the calling process
    env: { ...env, OCTOCODE_AGENT_ID: undefined, CI: undefined },
  });
}

it('exits 1 and prints --agent-id is required when no identity is available', () => {
  const r = run(['agent', 'register'], {});
  expect(r.status).toBe(1);
  const body = JSON.parse(r.stdout);
  expect(body.error).toContain('--agent-id is required');
});
```

### Pattern 2 — isolated temp workspace

Use when testing file-system behaviour, replacing a test that depended on the repo's own directories.

```ts
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'test-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

it('creates the output file at the given path', () => {
  const out = join(dir, 'result.json');
  run(['generate', '--out', out]);
  expect(JSON.parse(readFileSync(out, 'utf8'))).toMatchObject({ ok: true });
});
```

### Pattern 3 — real implementation over stub

Use when replacing a test that mocked a function that should have been called for real.

```ts
// Before (rigid mock — tests the mock, not the function):
const spy = vi.spyOn(db, 'exec').mockReturnValue(undefined);
initDb(db);
expect(spy).toHaveBeenCalledTimes(3); // ← tests internal call count, not behavior

// After (behavioral — tests the actual outcome):
const db = new DatabaseSync(':memory:');
initDb(db);
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
expect(tables.map(t => t.name)).toContain('work_presence');
```

### Pattern 4 — narrow fixture, single assertion

Use when replacing a monolithic test that asserted 20 things in one `it` block.

```ts
// Each it block owns one observable: split the monolith into named slices.
describe('registerAgent', () => {
  it('stores the agent_id in the registry', () => { … });
  it('returns the registered row on success', () => { … });
  it('rejects a duplicate agent_id with a clear error', () => { … });
});
```

### Pattern 5 — env var guard

Use when replacing a test that mutated `process.env` without cleanup.

```ts
let savedId: string | undefined;
beforeEach(() => { savedId = process.env.OCTOCODE_AGENT_ID; });
afterEach(() => {
  if (savedId === undefined) delete process.env.OCTOCODE_AGENT_ID;
  else process.env.OCTOCODE_AGENT_ID = savedId;
});

it('resolves the agent id from the environment when --agent-id is omitted', () => {
  process.env.OCTOCODE_AGENT_ID = 'env-agent';
  expect(resolveAgentId({})).toBe('env-agent');
});
```

### Pattern 6 — schema-driven assertion (replaces snapshot strings)

Use when replacing a test that `.toContain('some hardcoded string')` against a schema or prompt.

```ts
// Before (rigid string match — breaks on any prose edit):
expect(prompt).toContain('Run `agent register --agent-id`');

// After (structural / semantic — tests the concept, not the exact prose):
const idx = commandIndex.find(c => c.command === 'agent');
expect(idx).toBeDefined();
expect(prompt).toMatch(/agent\s+register/i);
expect(Buffer.byteLength(prompt, 'utf8')).toBeLessThanOrEqual(5_000);
```

## Naming convention

```
<domain>-<what-is-under-test>.test.ts
```

Examples:
- `agent-registry.test.ts` (not `cli-work-cli-6.test.ts`)
- `work-presence-exclusive.test.ts` (not `cli-lock-acquire-5.test.ts`)
- `memory-recall-workspace-scope.test.ts` (not `memory-getmemory-2.test.ts`)

Never include iteration numbers or dates in file names. If a test file grows beyond 400 lines, split by describe group into separate named files.

## Coverage replacement rule

For each deleted test file, run:

```bash
yarn workspace <pkg> test --coverage 2>&1 | grep 'Uncovered Line'
```

If a previously-covered line is now uncovered, write a quality replacement test before lowering the threshold. The replacement must:
1. Test the same code path via the **public API**, not internal state.
2. Use one of the isolation patterns above.
3. Have a descriptive name.
4. Pass on any machine without pre-conditions.

Threshold adjustments that eliminate a real coverage gap are only acceptable when the code path is unreachable in production (dead branch). Prove unreachability with `lspGetSemantics` callers before adjusting.
