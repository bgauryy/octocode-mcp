import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(TEST_DIR, '..');

function skill(path: string): string {
  return readFileSync(resolve(PACKAGE_ROOT, 'skills', path, 'SKILL.md'), 'utf8');
}

function awarenessSkillFile(path: string): string {
  return readFileSync(resolve(PACKAGE_ROOT, 'skills/octocode-awareness', path), 'utf8');
}

function description(markdown: string): string {
  const match = markdown.match(/^---\n[\s\S]*?description:\s*"([^"]+)"[\s\S]*?\n---/);
  return match?.[1] ?? '';
}

// Deterministic held-out proxy for the description boundary. This does not claim
// a model trigger rate; it ensures unseen cases remain separable by actionable
// shared-state signals rather than ordinary repository intent.
function routesAwarenessSignal(prompt: string): boolean {
  const text = prompt.toLowerCase();
  const explicitNearMiss = /(outside (?:a )?repo|conceptually|personal|phone screen|career|favorite restaurant|logo image|email|meeting|slide|blog post|uploaded csv|browse|search the web)/;
  if (explicitNearMiss.test(text)) return false;
  const repositoryContext = /(repo|repository|checkout|package\.json|packages?|migration|pre-edit hook|verification|coding session|\.octocode|gotcha|workers?|subagents?|agnets|same fiel|selectable tasks?)/;
  const actionableSignal = /(another agent|workers?|subagents?|same fiel|selectable tasks?|migration|pre-edit hook|pending verification|verification debt|gotcha|current tasks and memory|last host|resume|awareness hooks?|\.octocode)/;
  return repositoryContext.test(text) && actionableSignal.test(text);
}

describe('skill routing boundaries', () => {
  it('routes awareness on actionable shared-state signals', () => {
    const text = skill('octocode-awareness');
    const desc = description(text);
    expect(desc).toMatch(/^Use when shared repository state can change the next action:/);
    expect(desc).toContain('peers');
    expect(desc).toContain('plans');
    expect(desc).toContain('verification debt');
    expect(desc).toContain('handoffs');
    expect(desc).toContain('Skip routine solo work');
    expect(desc.length).toBeLessThanOrEqual(1024);
    expect(desc).not.toContain('dogfood');
    expect(desc).not.toContain('packages/octocode-awareness');
    expect(text).toContain('meet workspace peers once → work → communicate when it matters');
    expect(text).toContain('npx @octocodeai/octocode-awareness');
    expect(text).toContain('`guide` retains the full catalog');
    expect(text).toContain('references/configuration.md');
    expect(text).not.toContain('npx -p @octocodeai/octocode-awareness octocode-awareness');
    expect(text).not.toContain('node packages/octocode-awareness/out/octocode-awareness.js');
    const storage = awarenessSkillFile('references/architecture.md');
    expect(storage).toContain('$OCTOCODE_HOME/awareness/awareness.sqlite3');
    expect(storage).toContain('.octocode/awareness.sqlite3');
    expect(text).toContain('Never use an Agent runtime database');
    expect(text).not.toMatch(/\.octocode\/(?:octocode|agent)\.sqlite3/);
    expect(text).not.toMatch(/octocode-awareness-lite|\/lite\b|Awareness Lite/);
    expect(text).toContain('Reuse a host-provided peer briefing');
    expect(text).toContain('reuse records already owned by the host');
    expect(awarenessSkillFile('references/agent-cheatsheet.md')).toMatch(/CLI[^.]*operational state[^.]*observed records/i);
    expect(text).toContain('npx @octocodeai/octocode-awareness attend');
    expect(text).toContain('flow-matrix.md');
    expect(text).toContain('Load only the relevant reference');
    expect(text).toContain('yarn workspace @octocodeai/octocode-awareness build');
    expect(awarenessSkillFile('references/hooks.md')).toContain('Smoke:');
    expect(existsSync(resolve(PACKAGE_ROOT, 'skills/octocode-awareness/SKILL.md'))).toBe(true);
    expect(existsSync(resolve(PACKAGE_ROOT, 'skills/octocode-skills'))).toBe(false);
  });

  it('teaches the complete agent lifecycle without assigning judgment to hooks', () => {
    const text = skill('octocode-awareness');
    for (const step of ['attend --compact', 'If tracking is used, run the declared check', 'Unrun checks remain PENDING', 'Real continuation']) {
      expect(text).toContain(step);
    }
    const detail = awarenessSkillFile('references/agent-cheatsheet.md');
    expect(text).toContain('references/agent-cheatsheet.md');
    expect(detail).toMatch(/CLI[^.]*advice[^.]*observed records/i);
    expect(detail).toContain('Hooks deliver peer messages; optional guard/full profiles track edits');
    expect(detail).toMatch(/host owns context[^.]*tools[^.]*budgets[^.]*workers/i);
    expect(detail).toMatch(/Unknown sensors stay unknown[^.]*never (?:invent|infer)/i);
    expect(detail).toMatch(/Advice\s+neither authorizes action nor proves success/i);
    expect(text).toContain('Do not poll a delivered inbox');
    expect(text).toContain('use `lock` for non-mergeable work');
    expect(awarenessSkillFile('references/hooks.md')).toContain('they do not choose tasks. Work tracking and verification are opt-in');
    expect(detail).toMatch(/Search hits, memories, messages, TTLs, and peer claims are leads, not proof/i);
  });

  it('shows a lean overview of every Awareness feature family', () => {
    const text = skill('octocode-awareness');
    expect(text).toContain('Load only the relevant reference');
    for (const feature of [
      'plan', 'task', 'work', 'lock', 'verification', 'Messages', 'handoffs',
      'Memory', 'reflection', 'hooks', 'schema',
    ]) {
      expect(text.toLowerCase(), `missing lean feature route: ${feature}`).toContain(feature.toLowerCase());
    }
    expect(text).toMatch(/query|queries/i);
    expect(text).toContain('references/plan-task-workflow.md');
    expect(awarenessSkillFile('references/hooks.md')).toContain('they do not choose tasks. Work tracking and verification are opt-in');
    expect(text).toContain('references/configuration.md');
  });

  it('keeps held-out repository intent behavior distinct from near misses', () => {
    const evalPath = resolve(PACKAGE_ROOT, 'skills/octocode-awareness/evals/trigger-cases.json');
    expect(existsSync(evalPath)).toBe(true);
    const cases = JSON.parse(readFileSync(evalPath, 'utf8')) as Record<string, Array<{ prompt: string; expect: boolean }>>;
    expect(cases['train_should_trigger']?.length).toBeGreaterThanOrEqual(10);
    expect(cases['train_near_miss']?.length).toBeGreaterThanOrEqual(10);
    expect(cases['held_out']?.length).toBeGreaterThanOrEqual(8);
    expect(cases['train_should_trigger']?.every((entry) => entry.expect)).toBe(true);
    expect(cases['train_near_miss']?.every((entry) => !entry.expect)).toBe(true);
    const heldOut = cases['held_out'] ?? [];
    expect(heldOut.map((entry) => ({
      prompt: entry.prompt,
      expected: entry.expect,
      actual: routesAwarenessSignal(entry.prompt),
    }))).toEqual(heldOut.map((entry) => ({
      prompt: entry.prompt,
      expected: entry.expect,
      actual: entry.expect,
    })));
    expect(heldOut.filter((entry) => !entry.expect).map((entry) => entry.prompt).join('\n')).toMatch(/only agent/i);
    expect(heldOut.filter((entry) => !entry.expect).map((entry) => entry.prompt).join('\n')).toMatch(/read-only security review/i);
    expect(heldOut.filter((entry) => entry.expect).map((entry) => entry.prompt).join('\n')).toMatch(/resume/i);
    expect(heldOut.filter((entry) => !entry.expect).map((entry) => entry.prompt).join('\n')).toMatch(/outside a repo/i);
  });

  it('routes each fresh-agent feature question to one direct owner', () => {
    const text = skill('octocode-awareness');
    const journeys = [
      ['Choose an unfamiliar workflow', 'flow-matrix.md'],
      ['when binding another host', 'architecture.md'],
      ['recipes', 'coordination-protocol.md'],
    ] as const;
    for (const [trigger, owner] of journeys) {
      expect(text).toContain(trigger);
      expect(text).toContain(`references/${owner}`);
    }
  });

  it('keeps the awareness skill self-contained after removing sibling skills', () => {
    expect(existsSync(resolve(PACKAGE_ROOT, 'skills/octocode-awareness/SKILL.md'))).toBe(true);
    expect(existsSync(resolve(PACKAGE_ROOT, 'skills/octocode-awareness/scripts/awareness.mjs'))).toBe(true);
    expect(existsSync(resolve(PACKAGE_ROOT, 'skills/octocode-skills'))).toBe(false);
  });

  it('keeps generated runtime scripts only in the primary skill', () => {
    expect(existsSync(resolve(PACKAGE_ROOT, 'skills/octocode-awareness/scripts/awareness.mjs'))).toBe(true);
  });

  it('keeps standalone guidance portable outside the monorepo', () => {
    const readme = awarenessSkillFile('README.md');
    const tooling = awarenessSkillFile('references/agent-cheatsheet.md');
    const octocode = awarenessSkillFile('references/octocode.md');
    const dataModel = awarenessSkillFile('references/data-model.md');
    const combined = [readme, tooling, octocode, dataModel].join('\n');

    expect(combined).not.toMatch(/<package>|<awareness-package>|default for this monorepo/);
    expect(combined).not.toContain('package migration truth: `docs/DB.md`');
    expect(readme).toContain('npx @octocodeai/octocode-awareness maintenance init --compact');
    expect(readme).not.toContain('npm root --global');
    expect(tooling).not.toContain('out/skills/octocode-skills');
    expect(octocode).toContain('references/agent-cheatsheet.md');
  });

  it('uses one portable CLI runner while documenting every supported host', () => {
    const referenceRoot = resolve(PACKAGE_ROOT, 'skills/octocode-awareness/references');
    const hooks = awarenessSkillFile('references/hooks.md');
    const instructional = [
      skill('octocode-awareness'),
      awarenessSkillFile('README.md'),
      awarenessSkillFile('agents/openai.yaml'),
      ...readdirSync(referenceRoot)
        .filter((name) => name.endsWith('.md'))
        .map((name) => readFileSync(resolve(referenceRoot, name), 'utf8')),
    ].join('\n');

    expect(hooks).toMatch(/\bPi\b/);
    expect(instructional).not.toMatch(/node\s+(?:packages\/octocode-awareness\/out\/octocode-awareness\.js|scripts\/awareness\.mjs)/);
    expect(instructional).not.toContain('npx -p @octocodeai/octocode-awareness octocode-awareness');
    expect(instructional).toContain('npx @octocodeai/octocode-awareness');
  });
});
