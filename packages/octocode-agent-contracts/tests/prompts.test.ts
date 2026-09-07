import { describe, expect, it } from 'vitest';
import {
  PLAN_PROMPT_MAX_GOAL,
  PLAN_PROMPT_TRUNCATION_MARKER,
  SUBAGENT_PLACEHOLDERS,
  buildOctocodeSystemPrompt,
  buildPlanPrompt,
  expandSubagentPrompt,
} from '../src/prompts/index.js';
import * as sharedPrompts from '../src/prompts/index.js';

describe('shared prompts', () => {
  it('shares compact widget and context guidance without introducing host tool names', () => {
    const prompt = buildOctocodeSystemPrompt('');
    expect(prompt).toContain('<interaction_context>');
    expect(prompt).toContain('plain messages');
    expect(prompt).toContain('never imply approval');
    expect(prompt).toContain('continuations');
    expect(sharedPrompts).toHaveProperty('INTERACTION_CONTEXT_GUIDANCE');
  });
  it('exports only prompts that participate in a supported runtime flow', () => {
    expect(sharedPrompts).not.toHaveProperty('MULTIDIMENSIONAL_MATHEMATICAL_FRAMEWORK_PROMPT');
  });

  it('composes the host coordination contract exactly once', () => {
    const prompt = buildOctocodeSystemPrompt('<coordination>shared</coordination>');
    expect(prompt).toContain('<authority>');
    expect(prompt.match(/<coordination>shared<\/coordination>/g)).toHaveLength(1);
    expect(prompt.endsWith('\n')).toBe(true);
  });

  it('routes measurable loops to the installed graph-eval skill without legacy aliases', () => {
    const prompt = buildOctocodeSystemPrompt('<coordination>shared</coordination>');
    expect(prompt).toContain('octocode-graph-eval');
    expect(prompt).not.toContain('octocode-eval');
  });

  it('keeps the shared policy host-neutral instead of advertising Pi-only tools', () => {
    const prompt = buildOctocodeSystemPrompt('<coordination>shared</coordination>');
    for (const piOnlyName of ['chromeDebug', 'browser agent', 'askUser', 'localServer']) {
      expect(prompt).not.toContain(piOnlyName);
    }
    expect(prompt).toContain('live host capability catalog');
  });

  it('forbids replaying crash-left effects whose outcome is unknown', () => {
    const prompt = buildOctocodeSystemPrompt('<coordination>shared</coordination>');
    expect(prompt).toContain('crash-left `started` effect');
    expect(prompt).toContain('terminal `uncertain`');
    expect(prompt).toContain('Never re-execute it');
  });

  it('uses the negotiated research catalog instead of stale inner tool names', () => {
    const prompt = buildOctocodeSystemPrompt('<coordination>shared</coordination>');
    expect(prompt).toContain('Call catalog before choosing and schema before the first call');
    expect(prompt).toContain('never reuse an absent name');
    expect(prompt).not.toContain('localSearch operation:');
  });

  it('keeps plan goals bounded', () => {
    const prompt = buildPlanPrompt('x'.repeat(PLAN_PROMPT_MAX_GOAL + 1));
    expect(prompt).toContain(PLAN_PROMPT_TRUNCATION_MARKER);
  });

  it('expands every shared subagent placeholder', () => {
    const source = SUBAGENT_PLACEHOLDERS.join('\n');
    const expanded = expandSubagentPrompt(source);
    for (const placeholder of SUBAGENT_PLACEHOLDERS) expect(expanded).not.toContain(placeholder);
  });

  it('selects worker-only constraints when the host supplies canonical Awareness guidance', () => {
    const prompt = expandSubagentPrompt(SUBAGENT_PLACEHOLDERS.join('\n'), { coordination: 'worker-only' });
    expect(prompt).toContain('The parent owns scope, synthesis, and dependent decisions');
    expect(prompt).toContain('Edit only paths or symbols explicitly assigned in Ownership');
    expect(prompt).toContain('wait for an explicit release or reassignment');
    for (const marker of ['[DONE]', '[BLOCKED]', '[FAILED]', '[ARTIFACT]', '[EVIDENCE]', '[VERIFICATION]']) {
      expect(prompt).toContain(marker);
    }
    expect(prompt).not.toContain('Send new signals with signal publish');
    expect(prompt).not.toContain('signal ack --signal-id');
    expect(prompt).not.toContain('You are auto-registered');
    expect(prompt).toContain('Never run any Git command unless the user explicitly asks');
    expect(expandSubagentPrompt('{{OCTOCODE_COORDINATION}}')).toContain('signal ack --signal-id');
  });

  it('permits the harness Awareness CLI without widening worker shell or Git authority', () => {
    const prompt = expandSubagentPrompt('{{OCTOCODE_SURFACE}}');
    expect(prompt).toMatch(/Use the harness-provided Awareness CLI through shell for shared coordination and bookkeeping/);
    expect(prompt).toContain('using the supplied database, workspace, and your stable agent identity');
    expect(prompt).toContain('For other shell commands, use shell only when your assigned role includes it');
    expect(prompt).toContain('the task requires a test, build, or bounded debug command');
    expect(prompt).toContain('Never run any Git command unless the user explicitly asks for Git in the current request');
    expect(prompt).toContain('this includes read-only Git commands');
  });

  it('routes worker messages through canonical signal CLI fields and acknowledges after acting', () => {
    const prompt = expandSubagentPrompt('{{OCTOCODE_COORDINATION}}');
    expect(prompt).toContain('signal publish');
    expect(prompt).toContain('signal reply');
    expect(prompt).toContain('--kind');
    expect(prompt).toContain('--subject');
    expect(prompt).toContain('--to-agent');
    expect(prompt).toContain('signal ack --signal-id');
    expect(prompt).toContain('after acting');
    expect(prompt).not.toContain('Use the topic field');
  });
});
