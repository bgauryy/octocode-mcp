import tseslint from 'typescript-eslint';

// File-size governance for the extension.
//
// New files must stay under the limits below. Every entry in the two baseline
// blocks is an existing oversized file pinned to its CURRENT length: the file
// cannot grow, and the pin shrinks (or is deleted) as the file is split. Treat
// these numbers as a ratchet — lower them, never raise them.
const MAX_SRC_LINES = 400;
const MAX_TEST_LINES = 1200;

export default tseslint.config(
  {
    ignores: ['dist/**', 'out/**', 'coverage/**', 'node_modules/**', 'skills/**', 'themes/**'],
  },
  {
    // Registered so the inline `@typescript-eslint/*` disable directives that
    // already exist in the source resolve to real rules.
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    plugins: { '@typescript-eslint': tseslint.plugin },
  },
  {
    files: ['src/**/*.ts'],
    rules: { 'max-lines': ['error', { max: MAX_SRC_LINES }] },
  },
  {
    files: ['tests/**/*.ts'],
    rules: { 'max-lines': ['error', { max: MAX_TEST_LINES }] },
  },
  // ── Baseline: oversized src files, pinned to current size ──────────────────
    { files: ['src/tools/mcp-tool.ts'], rules: { 'max-lines': ['error', { max: 2657 }] } },
    { files: ['src/chrome-debug-schemes.ts'], rules: { 'max-lines': ['error', { max: 1839 }] } },
    { files: ['src/index.ts'], rules: { 'max-lines': ['error', { max: 1748 }] } },
    { files: ['tests/helpers/pi-production-probe.ts'], rules: { 'max-lines': ['error', { max: 1596 }] } },
    { files: ['src/tools/ask-user-tool.ts'], rules: { 'max-lines': ['error', { max: 1262 }] } },
    { files: ['src/web.ts'], rules: { 'max-lines': ['error', { max: 1080 }] } },
    { files: ['src/tools/planning/plan-store.ts'], rules: { 'max-lines': ['error', { max: 1029 }] } },
    { files: ['src/tools/agents/process.ts'], rules: { 'max-lines': ['error', { max: 932 }] } },
    { files: ['src/tools/planning/plan-registration.ts'], rules: { 'max-lines': ['error', { max: 926 }] } },
    { files: ['src/tools/edit-tool.ts'], rules: { 'max-lines': ['error', { max: 888 }] } },
    { files: ['src/chrome-debug.ts'], rules: { 'max-lines': ['error', { max: 883 }] } },
    { files: ['src/tools/bash-tool.ts'], rules: { 'max-lines': ['error', { max: 855 }] } },
    { files: ['src/tools/render-helpers.ts'], rules: { 'max-lines': ['error', { max: 832 }] } },
    { files: ['src/tools/session-artifacts.ts'], rules: { 'max-lines': ['error', { max: 702 }] } },
    { files: ['src/tools/dynamic-tools.ts'], rules: { 'max-lines': ['error', { max: 681 }] } },
    { files: ['src/tools/mcp/catalog.ts'], rules: { 'max-lines': ['error', { max: 668 }] } },
    { files: ['src/tools/call-tool.ts'], rules: { 'max-lines': ['error', { max: 639 }] } },
    { files: ['src/types.ts'], rules: { 'max-lines': ['error', { max: 619 }] } },
    { files: ['src/tools/awareness-tool.ts'], rules: { 'max-lines': ['error', { max: 613 }] } },
    { files: ['src/tools/plan-html.ts'], rules: { 'max-lines': ['error', { max: 606 }] } },
    { files: ['src/tools/execution-events.ts'], rules: { 'max-lines': ['error', { max: 550 }] } },
    { files: ['src/tools/mcp/html.ts'], rules: { 'max-lines': ['error', { max: 545 }] } },
    { files: ['src/tools/mcp/config.ts'], rules: { 'max-lines': ['error', { max: 542 }] } },
    { files: ['src/tools/ux-snapshot.ts'], rules: { 'max-lines': ['error', { max: 526 }] } },
    { files: ['src/extension-ui.ts'], rules: { 'max-lines': ['error', { max: 518 }] } },
    { files: ['src/tools/agents/lifecycle.ts'], rules: { 'max-lines': ['error', { max: 514 }] } },
    { files: ['src/tools/interaction-broker.ts'], rules: { 'max-lines': ['error', { max: 504 }] } },
    { files: ['src/tools/compaction-hooks.ts'], rules: { 'max-lines': ['error', { max: 498 }] } },
    { files: ['src/tui/status-policy.ts'], rules: { 'max-lines': ['error', { max: 479 }] } },
    { files: ['src/tools/query-envelope.ts'], rules: { 'max-lines': ['error', { max: 474 }] } },
    { files: ['src/tools/agents/inbox.ts'], rules: { 'max-lines': ['error', { max: 469 }] } },
    { files: ['src/tools/media-tool.ts'], rules: { 'max-lines': ['error', { max: 431 }] } },
    { files: ['src/adapters/pi-registry-adapters.ts'], rules: { 'max-lines': ['error', { max: 410 }] } },
  // ── Baseline: oversized test files, pinned to current size ─────────────────
    { files: ['tests/package.test.ts'], rules: { 'max-lines': ['error', { max: 5266 }] } },
    { files: ['tests/mcp-tool.test.ts'], rules: { 'max-lines': ['error', { max: 2249 }] } },
    { files: ['tests/chrome-debug.test.ts'], rules: { 'max-lines': ['error', { max: 1679 }] } },
    { files: ['tests/active-plan.test.ts'], rules: { 'max-lines': ['error', { max: 1524 }] } },
);
