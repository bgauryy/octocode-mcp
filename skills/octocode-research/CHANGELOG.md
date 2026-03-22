# Octocode Research — Changelog

## Detached Daemon Architecture

`server-init.ts` no longer keeps the server as a child process. The server is now spawned **detached** (`detached: true`, `child.unref()`) so no client owns it. Every `server-init` invocation exits after confirming health — whether it spawned the server or found it already running. The server self-manages its lifecycle via the existing 30-minute idle timeout and SIGTERM handling.

- **PID file**: `server.ts` writes `~/.octocode/research-server-{PORT}.pid` on startup, removes on shutdown
- **Multi-client safe**: multiple agents/IDEs share one server instance without ownership conflicts
- **`/health` endpoint**: now includes `pid` field and `processManager: 'self (detached daemon)'`
- **Tests**: lifecycle tests updated to verify detached behavior (init exits, server survives, PID file lifecycle)

---

**36 files changed** | +1,456 −2,391 | Net: **−935 lines**

---

## Dead Code Removal

Deleted `src/types/toolTypes.ts`, `src/utils/logEmoji.ts`. Removed unused exports from 15 files (`errorGuards`, `guards`, `responses`, `mcp`, `circuitBreaker`, `logger`, `responseFactory`, `responseParser`, `retry`, `resilience`, `routeFactory`, `schemas`, `toolCallSchema`, `httpPreprocess`, `index`). Removed unused `queryParser` middleware.

## Bug Fixes

- **Port fallback**: `server.ts` now reads `OCTOCODE_PORT` like `server-init.ts`
- **Version mismatch**: routes hardcoded `2.0.0` while package.json said `2.2.0` — fixed via build-time `__PACKAGE_VERSION__` injection
- **Missing routes**: added `GET /tools/info` and `GET /tools/metadata` to 404 handler + startup log
- **PM2 cleanup**: replaced `processManager: 'pm2'`, removed `process.send('ready')`
- **Empty JSON Schemas**: `zod-to-json-schema` produced empty `{}` for Zod v4 schemas — replaced with `z.toJSONSchema()` (native Zod v4), removed `zod-to-json-schema` dependency. All 13 tool schemas now return full properties, types, and constraints.

## `bin` → Init Lifecycle

`"bin"` now points to `server-init.js` (was `server.js`). `npx octocode-research` gets health polling, parent-child lifecycle, and graceful shutdown. All PM2 scripts removed.

## Version — Single Source of Truth

`tsdown.config.ts` reads `package.json` at build time, injects `__PACKAGE_VERSION__`. Version bump = edit `package.json` only.

## `server-init.ts` Rewrite (288 → 55 lines)

PM2-based init replaced with standalone lifecycle: health-check → spawn child → exponential backoff poll → stay alive → signal forwarding.

## Route Refactors

Extracted helpers in `lsp.ts` and `package.ts` to reduce cognitive complexity.

## Documentation

- **SKILL.md** (→ 380 lines): all 11 routes, 503 warm-up note, env var table, parallel/session sections extracted to `references/`
- **README.md** (→ 209 lines): "Why a Server?" section, corrected examples with required `id` field, accurate per-circuit resilience table
- **package.json**: renamed `octocode-skill` → `octocode-research`, removed PM2 scripts, removed `zod-to-json-schema`

## New Files

- `references/SESSION_MANAGEMENT.md` — checkpoint/resume protocol
- `src/__tests__/integration/serverLifecycle.test.ts` — init/shutdown tests
- `src/__tests__/unit/schemas.test.ts` — Zod schema validation tests (509 lines)

## Verification

Build OK | Lint 0 errors | Tests 215/215
