import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXTERNAL_AGENT_AWARENESS_INSTRUCTIONS, EXTERNAL_AGENT_AWARENESS_PROMPT } from '../src/coordination/external-policy.js';
import { commandIndex } from '../src/schema/command-catalog.js';
import { HELP, HELP_COMPACT, ROUTE_EXAMPLE } from '../bin/cli-help-data.js';

const skillRoot = resolve(import.meta.dirname, '../skills/octocode-awareness');
const read = (path: string) => readFileSync(resolve(skillRoot, path), 'utf8');

describe('Awareness operating guidance', () => {
  it('makes identity registration and discovery visible in help and command examples', () => {
    for (const help of [HELP, HELP_COMPACT]) {
      expect(help).toContain('agent register');
      expect(help).toContain('agent list');
      expect(help).toContain('OCTOCODE_AGENT_ID');
    }
    const registration = commandIndex.find(entry => entry.command === 'agent register');
    expect(registration?.example).toBe(ROUTE_EXAMPLE['agent register']);
    for (const flag of ['--agent-name', '--agent-vendor', '--agent-host']) expect(registration?.example).toContain(flag);
    expect(registration?.example).not.toContain('--agent-id agent ');
    expect(registration?.use).toContain('stable');
    const discovery = commandIndex.find(entry => entry.command === 'agent list');
    expect(discovery?.use).toContain('agent_id');
    expect(discovery?.use).toContain('continuations');
  });

  it('separates stable routing identity from self-reported vendor and host labels', () => {
    for (const prompt of [EXTERNAL_AGENT_AWARENESS_PROMPT, EXTERNAL_AGENT_AWARENESS_INSTRUCTIONS]) {
      expect(prompt).toContain('agent register');
      expect(prompt).toContain('agent list');
      expect(prompt).toMatch(/self-reported[^.]*not authentication/i);
      expect(prompt).toMatch(/route[^.]*agent ID[^.]*not name or vendor/i);
    }
    for (const text of [read('references/configuration.md'), read('references/coordination-protocol.md')]) {
      for (const flag of ['--agent-id', '--agent-name', '--agent-vendor', '--agent-host']) expect(text).toContain(flag);
      expect(text).toContain('OCTOCODE_AGENT_ID');
      expect(text).toContain('OCTOCODE_AGENT_NAME');
      expect(text).toContain('OCTOCODE_AGENT_VENDOR');
      expect(text).toContain('OCTOCODE_AGENT_HOST');
      expect(text).toContain('null');
    }
    const skill = read('SKILL.md');
    expect(skill).toContain('agent register');
    expect(skill).toContain('references/configuration.md');
    expect(skill).toContain('route by exact agent ID');
  });

  it('supports agents with and without native delivery while retaining physical ownership', () => {
    for (const policy of [EXTERNAL_AGENT_AWARENESS_PROMPT, read('SKILL.md')]) {
      expect(policy).toContain('same physical SQLite file');
      expect(policy).toContain('linked Git worktrees');
      expect(policy).toContain('own checkout');
      expect(policy).toMatch(/Without (?:native delivery or installed hooks|either), [^.]*signal list/);
      expect(policy).toContain('expected reply');
    }
    expect(EXTERNAL_AGENT_AWARENESS_INSTRUCTIONS).toContain('locks, recovery and verification tied to the physical checkout');
    expect(EXTERNAL_AGENT_AWARENESS_INSTRUCTIONS).toContain('separate clones and separate databases do not connect automatically');
    expect(EXTERNAL_AGENT_AWARENESS_INSTRUCTIONS).toContain('Existing authorization for that target remains valid');
  });

  it('keeps the short skill actionable and delegates complete recipes to supported CLI routes', () => {
    const skill = read('SKILL.md');
    expect(Buffer.byteLength(skill)).toBeLessThanOrEqual(6_400);
    expect(skill).toContain('distinct stable ID');
    expect(skill).toContain('same physical SQLite file');
    expect(skill).toContain('Audit owned tracked work after the last artifact or worker write');
    expect(skill).toContain('signal reply --in-reply-to <signal-id>');
    expect(skill).toContain('never publish a fake reply');
    expect(skill).toContain('references/coordination-protocol.md');
    const protocol = read('references/coordination-protocol.md');
    expect(protocol).toContain('--db "$AWARENESS_DB"');
    expect(protocol).toContain('--to-agent "$PEER_AGENT_ID"');
    expect(protocol).toContain('--in-reply-to "$SIGNAL_ID"');
    const finish = read('references/agent-cheatsheet.md');
    expect(finish).toContain('--status SUCCESS');
    expect(finish).toContain('--status FAILED');
    expect(finish).toContain('does not prune signals');
    for (const route of ['signal publish', 'signal list', 'signal reply', 'signal ack', 'signal resolve', 'signal prune', 'maintenance digest', 'verify mark', 'verify audit']) {
      const command = commandIndex.find(entry => entry.command === route);
      expect(command, route).toBeDefined();
      expect(command?.schema, route).toBeTypeOf('string');
    }
  });
});
