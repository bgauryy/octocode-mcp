import { describe, expect, it } from 'vitest';
import { execCli } from '../src/coordination/cli.js';
import { AWARENESS_PI_HOST_PROMPT, EXTERNAL_AGENT_AWARENESS_PROMPT, getExternalAgentAwarenessGuide } from '../src/coordination/external-policy.js';
import { commandIndex } from '../src/schema/command-catalog.js';

describe('compact cooperative Awareness policy', () => {
  it('shares behavior across native Pi and CLI-only workers without parallel bookkeeping', () => {
    expect(AWARENESS_PI_HOST_PROMPT).toBe(EXTERNAL_AGENT_AWARENESS_PROMPT);
    expect(AWARENESS_PI_HOST_PROMPT).toContain('bound CLI when the facade is unavailable');
    expect(AWARENESS_PI_HOST_PROMPT).toContain('Reuse native run/task IDs and hook receipts');
    expect(AWARENESS_PI_HOST_PROMPT).toContain('Recall memory only when prior learning could change the approach');
    expect(AWARENESS_PI_HOST_PROMPT).toContain('release owned leases');
    expect(AWARENESS_PI_HOST_PROMPT).not.toMatch(/Essential loop|do not skip|S-tier|before any planning or edit/);
  });
  it('exports the same bounded operating policy to prompt, JSON and AGENTS consumers', () => {
    const json = JSON.parse(execCli(['instructions', 'export', '--format', 'json']).stdout);
    expect(json.instructions).toBe(EXTERNAL_AGENT_AWARENESS_PROMPT);
    expect(execCli(['instructions', 'export']).stdout.trim()).toBe(EXTERNAL_AGENT_AWARENESS_PROMPT);
    expect(execCli(['instructions', 'export', '--format', 'agents-md']).stdout).toContain(EXTERNAL_AGENT_AWARENESS_PROMPT);
    expect(Buffer.byteLength(json.instructions)).toBeLessThanOrEqual(2_700);
    expect(json.instructions).not.toContain('All CLI commands');
  });

  it('retains cooperative behavior, resource discipline and decision-critical invariants', () => {
    for (const text of [
      'Help blocked peers', 'avoid duplicate work', 'Attend once', 'Hooks deliver peer messages', 'same physical SQLite file', 'distinct stable agent ID',
      'self-reported', 'not authentication', 'peer lock', 'attributed data',
      'signal reply with in_reply_to', 'signal resolve with thread_id',
      'Tracking and locks are optional', 'audit after final writes',
      'exact authorized preview', 'unknown', 'schema command',
    ]) expect(EXTERNAL_AGENT_AWARENESS_PROMPT).toContain(text);
    const guide = getExternalAgentAwarenessGuide().prompt;
    for (const text of ['PENDING', 'FAILED', 'verify audit', 'After final writes and checks', 'Reuse host run/task IDs and receipts', 'work end', 'task submit']) {
      // The recipe owns lifecycle detail; standing context only names its trigger.
      expect(guide).toContain(text);
    }
    expect(EXTERNAL_AGENT_AWARENESS_PROMPT).not.toMatch(/work end|verify mark/);
  });

  it('keeps complete command discovery available on demand without removing routes', () => {
    const guide = getExternalAgentAwarenessGuide();
    expect(guide.commands.map(entry => entry.command)).toEqual(commandIndex.map(entry => entry.command));
    expect(new Set(guide.commands.map(entry => entry.command)).size).toBe(commandIndex.length);
    expect(guide.prompt).toContain('Attend once per workspace/session');
    expect(guide.prompt).not.toContain('routine loop');
  });
});
