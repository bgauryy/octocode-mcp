#!/usr/bin/env node
// Repo task runner for the Octocode monorepo; replaces the root package.json scripts.
// Usage: node skills-dev/octocode-dev/scripts/dev.mjs <task> [args...]   (--help lists tasks)
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
// CI never builds native: native artifacts are built locally (`build:all` / `build:publish`).
const CI_EXCLUDE = ['--exclude', '@octocodeai/octocode-benchmark', '--exclude', '@octocodeai/octocode-native'];

const script = (name, ...args) => ['node', [path.join(HERE, name), ...args]];
const health = (...args) => script('workspace-health.mjs', ...args);
const yarn = (...args) => ['yarn', args];
// Skills are not workspaces: lint the collection, check the shared report viewer, and run each skill's script tests.
const skill = (rel, ...args) => ['node', [path.join(ROOT, 'skills', rel), ...args]];
const SKILL_CHECKS = [
  skill('octocode-skills/scripts/skill-review.mjs', path.join(ROOT, 'skills')),
  skill('octocode-skills/scripts/skill-review.mjs', '--self-test'),
  skill('octocode-skills/scripts/skill-sync.mjs', '--self-test'),
  skill('octocode-skills/scripts/render-report.mjs', '--self-test'),
  skill('octocode-skills/scripts/report-viewer-sync.mjs', '--check'),
  ['node', ['--test', 'skills/octocode-brainstorming/scripts/tests/*.test.mjs', 'skills/octocode-scraping/scripts/tests/*.test.mjs']],
];

/** task → [description, steps]; extra CLI args go to the last step. */
const TASKS = {
  build: ['Release build of every workspace (slow)', [health('run', 'build', '--parallel')]],
  'build:dev': ['Fast debug build of every workspace (default locally)', [health('run', 'build', '--parallel', '--prefer', 'build:dev')]],
  'build:ci': ['Resolution check, then release build without benchmark or native', [script('prepublish.mjs'), health('run', 'build', '--parallel', ...CI_EXCLUDE)]],
  'build:publish': ['Resolution check, 6-platform native build, MCP publish build', [script('prepublish.mjs'), yarn('build:native:all'), yarn('workspace', 'octocode-mcp', 'build')]],
  test: ['Run every workspace test script', [health('run', 'test')]],
  'test:ci': ['Skill checks, then tests without benchmark or native', [...SKILL_CHECKS, health('run', 'test', ...CI_EXCLUDE)]],
  'skills:check': ['Skill lint, shared report viewer, and skill script tests', SKILL_CHECKS],
  // Not in test:ci: it drives the built native binary and addon, so CI runs it in its own `e2e` job after build:dev.
  'test:tools': ['End-to-end health of every tool via CLI and MCP, hermetic: driver self-test, then every lead explored (needs build:dev; [tool,...] [--deep])', [
    ['node', ['--test', path.join(ROOT, 'octocode-local-testing/harness/tool-health/driver.test.mjs')]],
    ['node', [path.join(ROOT, 'octocode-local-testing/harness/tool-health.mjs')]],
  ]],
  lint: ['Run every workspace lint script', [health('run', 'lint')]],
  'lint:ci': ['Lint without benchmark or native', [health('run', 'lint', ...CI_EXCLUDE)]],
  typecheck: ['Run every workspace typecheck script', [health('run', 'typecheck')]],
  'typecheck:ci': ['Typecheck without benchmark or native', [health('run', 'typecheck', ...CI_EXCLUDE)]],
  verify: ['Full repo contract: dedupe, docs, per-package verify', [health('verify')]],
  'health:check': ['Required workspace scripts exist', [health('check')]],
  'health:report': ['Workspace script matrix', [health('report')]],
  'check-outputs': ['Build outputs exist and staged native artifacts match the current version and contract', [health('check-outputs')]],
  clean: ['Remove every workspace build output (dist/, out/, native target/ + staged binaries)', [yarn('workspaces', 'foreach', '-A', 'run', 'clean')]],
  'clean:cache': ['Drop stale native build copies; compiled dependencies stay warm', [yarn('workspace', '@octocodeai/octocode-native', 'clean:cache')]],
  'docs:verify': ['Docs links, catalog, config keys, publishing contracts', [script('docs-verify.mjs')]],
  'check:dev-unify': ['Opt-in: test:rust reuses every crate build:dev compiles (nightly unit graph, else cargo tree)', [script('dev-unify-check.mjs')]],
  'deps:dedupe': ['One version range per external dependency (--fix rewrites)', [script('dedupe-deps.mjs')]],
  setup: ['Local dev resolutions (--dry-run, --install, --reset); then yarn install', [script('dev-setup.mjs')]],
  prepublish: ['Local-resolution check (--fix strips local resolutions, --dry-run previews)', [script('prepublish.mjs')]],
  'brew:formula': ['Render the Homebrew formula from the published native npm packages ([version] [--out FILE])', [script('brew-formula.mjs')]],
};

function help() {
  const width = Math.max(...Object.keys(TASKS).map(name => name.length));
  console.log('Usage: node skills-dev/octocode-dev/scripts/dev.mjs <task> [args...]\n\nTasks:');
  for (const [name, [description]] of Object.entries(TASKS)) {
    console.log(`  ${name.padEnd(width)}  ${description}`);
  }
}

const [task, ...extra] = process.argv.slice(2);
if (!task || task === '--help' || task === '-h') {
  help();
  process.exit(task ? 0 : 1);
}
if (!TASKS[task]) {
  console.error(`Unknown task "${task}".\n`);
  help();
  process.exit(1);
}

const steps = TASKS[task][1];
steps.forEach(([command, args], index) => {
  const finalArgs = index === steps.length - 1 ? [...args, ...extra] : args;
  const { status, error } = spawnSync(command, finalArgs, { cwd: ROOT, stdio: 'inherit' });
  if (error) {
    console.error(`dev ${task}: ${command} failed to start: ${error.message}`);
    process.exit(1);
  }
  if (status !== 0) process.exit(status ?? 1);
});
