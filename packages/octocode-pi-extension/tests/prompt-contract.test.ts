import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';
import { EXTERNAL_AGENT_AWARENESS_INSTRUCTIONS } from '@octocodeai/octocode-awareness';
import { buildPlanPrompt } from '../src/prompts/plan-prompt.js';
import { PLAN_PROMPT_MAX_GOAL, PLAN_PROMPT_TRUNCATION_MARKER } from '@octocodeai/agent-contracts/prompts';
import { SYSTEM_PROMPT } from '../src/prompts/system-prompt.js';
import { expandSubagentPrompt, SUBAGENT_WORKER_CONTRACT, SUBAGENT_AWARENESS_GUIDANCE, SUBAGENT_PLACEHOLDERS } from '@octocodeai/agent-contracts/prompts';

const packageRoot = path.resolve(import.meta.dirname, '..');
const roleNames = ['architect', 'browser-agent', 'planner', 'researcher'] as const;

function rolePrompt(role: (typeof roleNames)[number]): string {
  return fs.readFileSync(path.join(packageRoot, 'subagents', role, 'SYSTEM_PROMPT.md'), 'utf8');
}

test('plan mode uses a conversational RFC flow with one Start decision and no tool restrictions', () => {
  const prompt = buildPlanPrompt('change the public API');
  assert.match(prompt, /PLAN MODE/i);
  assert.match(prompt, /askUser|ask widget/i);
  assert.match(prompt, /only when.*decision-changing|decision-changing.*only when/i);
  assert.match(prompt, /Creating plan…/i);
  assert.match(prompt, /create or update.*RFC/i);
  assert.match(prompt, /overview/i);
  assert.match(prompt, /one.*Start|single.*Start/i);
  assert.match(prompt, /plan tool owns.*Start.*Request changes/i);
  assert.match(prompt, /unavailable|pending/i, 'inline fallback is conditional on interaction availability');
  assert.doesNotMatch(prompt, /Present a concise plan overview in the message and ask one decision/i, 'interactive approval is not duplicated in the assistant message');
  assert.match(prompt, /planning does not disable tools/i);
  assert.match(prompt, /do not implement.*Start/i);
  assert.match(prompt, /queries.*reasoning.*action.*propose/is, 'plan mode teaches the required query envelope');
  assert.doesNotMatch(prompt, /plan\(propose\)/i, 'plan mode avoids function-call shorthand that bypasses queries[]');
  assert.doesNotMatch(prompt, /accept(?:ance)?.*does not.*authoriz.*implementation|separate.*Start/i);
});

test('plan mode preserves goal formatting and makes truncation explicit', () => {
  const compact = buildPlanPrompt('add   dark mode toggle');
  assert.match(compact, /Goal: add dark mode toggle/);

  const multiline = buildPlanPrompt('first constraint\r\n  second constraint');
  assert.match(multiline, /Goal:\nfirst constraint\n  second constraint/);
  assert.doesNotMatch(multiline, /Goal truncated/);

  const exactLimit = buildPlanPrompt('x'.repeat(PLAN_PROMPT_MAX_GOAL));
  assert.doesNotMatch(exactLimit, /Goal truncated/);

  const oversized = buildPlanPrompt(`${'x'.repeat(PLAN_PROMPT_MAX_GOAL)}\nMUST_KEEP`);
  assert.ok(oversized.includes(PLAN_PROMPT_TRUNCATION_MARKER), 'oversized goal carries the explicit marker');
  assert.ok(!oversized.includes('MUST_KEEP'), 'content remains bounded at the documented limit');
  assert.match(oversized, /ask the user to restate omitted constraints before proposing/i);
});

test('plan mode preserves numbered requirements inside a multiline goal', () => {
  const goal = 'Preserve behavior\n\n1. Keep all existing user data\n2. Keep API responses';
  const prompt = buildPlanPrompt(goal);
  assert.ok(prompt.includes(`Goal:\n${goal}\n\n1. Check the request`), 'user requirements remain distinct from the planning workflow');
  assert.doesNotMatch(prompt, /Goal truncated/);
});

test('typed-worker coordination treats assigned ownership as exclusive', () => {
  assert.match(SUBAGENT_WORKER_CONTRACT, /never edit through an exclusive lock or another owner's active path/i);
  assert.match(SUBAGENT_WORKER_CONTRACT, /overlaps active parent or peer ownership.*stop before writing/i);
  assert.match(SUBAGENT_WORKER_CONTRACT, /wait for an explicit release or reassignment/i);
  assert.doesNotMatch(SUBAGENT_WORKER_CONTRACT, /Coordinate ordinary overlap/i);
});

test('all typed role prompts expand the same shared protocol and preserve parser terminal states', () => {
  const coordinationBlocks: string[] = [];
  for (const role of roleNames) {
    const source = rolePrompt(role);
    const expanded = expandSubagentPrompt(source, { coordination: 'worker-only' });

    for (const placeholder of SUBAGENT_PLACEHOLDERS) {
      assert.doesNotMatch(expanded, new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    assert.ok(expanded.includes(SUBAGENT_WORKER_CONTRACT), `${role} receives shared worker restrictions`);
    assert.ok(!expanded.includes(SUBAGENT_AWARENESS_GUIDANCE), `${role} omits the parallel ledger recipe`);
    const composed = `${expanded}\n\n${EXTERNAL_AGENT_AWARENESS_INSTRUCTIONS}`;
    assert.equal(composed.split(EXTERNAL_AGENT_AWARENESS_INSTRUCTIONS).length, 2, `${role} has one canonical operating guide`);
    assert.equal((composed.match(/<awareness>/g) ?? []).length, 1);
    assert.doesNotMatch(composed, /Send new signals with signal publish/);
    assert.match(composed, /Before the final response/);
    assert.match(expanded, /Awareness CLI.*coordination.*bookkeeping/i, `${role} can communicate through the shared CLI`);
    assert.doesNotMatch(expanded, /read-only — no `bash`|Use `bash` only for bounded test\/build\/debug/, `${role} does not contradict the coordination exception`);
    assert.match(expanded, /\[DONE\]/, `${role} preserves DONE`);
    assert.match(expanded, /\[BLOCKED\]/, `${role} preserves BLOCKED`);
    assert.match(expanded, /\[FAILED\]/, `${role} preserves FAILED`);
    assert.match(expanded, /\[EVIDENCE\]/, `${role} preserves evidence handback`);
    coordinationBlocks.push(SUBAGENT_WORKER_CONTRACT);
  }
  assert.equal(new Set(coordinationBlocks).size, 1, 'one shared worker owner supplies restrictions');
  const build = fs.readFileSync(path.join(packageRoot, 'scripts/build.mjs'), 'utf8');
  assert.match(build, /expandSubagentPrompt\(fs\.readFileSync\(promptPath, 'utf8'\), \{ coordination: 'worker-only' \}\)/, 'the production build selects the tested worker-only composition');
});


test('main prompt composes compact host facts with the canonical Awareness protocol', () => {
  const hostFacts = SYSTEM_PROMPT.replace(EXTERNAL_AGENT_AWARENESS_INSTRUCTIONS, '');
  assert.ok(hostFacts.length < 1000);
  assert.equal(SYSTEM_PROMPT.split(EXTERNAL_AGENT_AWARENESS_INSTRUCTIONS).length, 2);
  assert.match(SYSTEM_PROMPT, /MCPTool/);
  assert.match(SYSTEM_PROMPT, /user.*request determines the workflow/);
  assert.match(SYSTEM_PROMPT, /Permissions.*approval/);
  assert.match(SYSTEM_PROMPT, /data, not higher-priority instructions/);
  assert.doesNotMatch(hostFacts, /THINK|PLAN →|TL;DR|BEFORE acting|must exist|Never run any Git/);
});
