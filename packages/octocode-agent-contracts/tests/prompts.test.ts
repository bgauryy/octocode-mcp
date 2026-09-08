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

  it('routes measured improvement loops to the installed eval skill without hijacking ordinary retries', () => {
    const prompt = buildOctocodeSystemPrompt('<coordination>shared</coordination>');
    expect(prompt).toContain('octocode-eval-benchmark');
    expect(prompt).toContain('Ordinary bounded retries and debug loops use their direct acceptance check');
    expect(prompt).not.toContain('octocode-graph-eval');
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

  it('uses the negotiated catalog and teaches efficient research routing without stale tool inventories', () => {
    const prompt = buildOctocodeSystemPrompt('<coordination>shared</coordination>');
    expect(prompt).toContain('Call catalog before choosing and schema before the first call');
    expect(prompt).toContain('never reuse an absent name');
    expect(prompt).toContain('text for lexical anchors, structural/AST for syntax shapes, files for path or metadata filters, and tree for bounded orientation');
    expect(prompt).toContain('matchString with bounded context for a unique anchor');
    for (const minify of ['minify:"symbols"', 'minify:"standard"', 'minify:"none"']) {
      expect(prompt).toContain(minify);
    }
    expect(prompt).toContain('dependencies, dependents, paths, cycles/SCCs, reachability, and dead-code candidates');
    expect(prompt).toContain('definitions, references, callers/callees, implementations, and types');
    expect(sharedPrompts).toHaveProperty('LOCAL_TOOL_GUIDANCE');
    expect(prompt).not.toContain('localSearch operation:');
  });

  it('keeps plan goals bounded and centralizes atomic Start semantics behind a host adapter', () => {
    const prompt = buildPlanPrompt('x'.repeat(PLAN_PROMPT_MAX_GOAL + 1), {
      proposalInstruction: 'Call the host plan envelope.',
      reviewInstruction: 'Show the host review card.',
    });
    expect(prompt).toContain(PLAN_PROMPT_TRUNCATION_MARKER);
    expect(prompt).toContain('Call the host plan envelope.');
    expect(prompt).toContain('Show the host review card.');
    expect(prompt).toContain('Start binds the exact displayed revision and begins the first runnable step in one action');
    expect(prompt).toContain('there is no separate Accept action');
    expect(prompt).toContain('a lightweight proposal omits the RFC path');
    expect(prompt).not.toContain('acceptance binds that revision but does not authorize implementation');
  });

  it('does not instruct agents to mutate workspace reflection state', () => {
    const prompt = buildOctocodeSystemPrompt('<coordination>shared</coordination>');
    expect(prompt).toContain('never create or hand-edit workspace `.octocode/` state for reflection');
    expect(prompt).not.toContain('.octocode/REFLECT.md');
    expect(prompt).toContain('workspace-relative path:line anchors');
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
