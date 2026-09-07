import { describe, expect, it } from 'vitest';
import { execCli } from '../src/coordination/cli.js';
import { EXTERNAL_AGENT_AWARENESS_PROMPT, getExternalAgentAwarenessGuide } from '../src/coordination/external-policy.js';
import { commandIndex } from '../src/schema/command-catalog.js';

describe('compact cooperative Awareness policy', () => {
  it('exports the same bounded operating policy to prompt, JSON and AGENTS consumers', () => {
    const json = JSON.parse(execCli(['instructions', 'export', '--format', 'json']).stdout);
    expect(json.instructions).toBe(EXTERNAL_AGENT_AWARENESS_PROMPT);
    expect(execCli(['instructions', 'export']).stdout.trim()).toBe(EXTERNAL_AGENT_AWARENESS_PROMPT);
    expect(execCli(['instructions', 'export', '--format', 'agents-md']).stdout).toContain(EXTERNAL_AGENT_AWARENESS_PROMPT);
    expect(Buffer.byteLength(json.instructions)).toBeLessThanOrEqual(5_000);
    expect(json.instructions).not.toContain('All CLI commands');
  });

  it('retains cooperative behavior, resource discipline and decision-critical invariants', () => {
    for (const text of [
      'cooperative community', 'token budget', 'quality', 'help blocked peers',
      'do not compete', 'same physical SQLite file', 'distinct stable agent ID',
      'self-reported', 'not authentication', 'peer lock', 'attributed data',
      'signal reply --in-reply-to', 'signal resolve --thread-id',
      'PENDING', 'FAILED', 'Before the final response', 'verify audit',
      'last artifact', 'stale preview', 'unknown', 'schema command',
    ]) expect(EXTERNAL_AGENT_AWARENESS_PROMPT).toContain(text);
  });

  it('keeps complete command discovery available on demand without removing routes', () => {
    const guide = getExternalAgentAwarenessGuide();
    expect(guide.commands.map(entry => entry.command)).toEqual(commandIndex.map(entry => entry.command));
    for (const { command } of commandIndex) expect(guide.prompt).toContain(`- \`${command}\` —`);
    expect(guide.prompt).toContain('cooperative community');
  });
});
