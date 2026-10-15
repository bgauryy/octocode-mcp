import { describe, expect, it } from 'vitest';
import { subagentProcessEnv } from '../src/subagents/process.js';
import { messageText } from '../src/team/routing.js';
import { registerTurnSetup } from '../src/turn.js';
import { fakeOctocode, fakePi } from './fake-pi.js';

describe('agent context boundaries', () => {
  it('starts children with a fresh identity and browser mode while retaining user settings', () => {
    const inherited = {
      OCTOCODE_AGENT_ID: 'old', OCTOCODE_PARENT_ID: 'old-parent', OCTOCODE_AGENT_GOAL: 'old-task',
      OCTOCODE_AGENT_COLLABORATE: '1', OCTOCODE_AGENT_SCRATCH: '/old', OCTOCODE_TRUST_ROOT: '/old-trust',
      OCTOCODE_BROWSER_VISIBLE: '1', OCTOCODE_HOOKS: '1', OCTOCODE_MCP: '0', PATH: '/bin',
    };
    const child = subagentProcessEnv(undefined, inherited, { id: 'new' });
    expect(child).toMatchObject({ OCTOCODE_AGENT_ID: 'new', OCTOCODE_SUBAGENT: '1', OCTOCODE_MCP: '0', PATH: '/bin' });
    for (const key of ['OCTOCODE_PARENT_ID', 'OCTOCODE_AGENT_GOAL', 'OCTOCODE_AGENT_COLLABORATE', 'OCTOCODE_AGENT_SCRATCH', 'OCTOCODE_TRUST_ROOT', 'OCTOCODE_BROWSER_VISIBLE', 'OCTOCODE_HOOKS']) {
      expect(child).not.toHaveProperty(key);
    }
  });

  it('shows controls in incoming message content and sender as escapes before projecting them into context', () => {
    const text = messageText({ id: 1, from: 'peer\u001b[2J', to: 'me', text: 'hello\u001b]0;title\u0007\u202e', at: 0, replyRequired: false }, undefined);
    expect(text).toContain('from agent peer\\u{1b}[2J at');
    expect(text).toContain('\nhello\\u{1b}]0;title\\u{7}\\u{202e}\n');
    expect(text).not.toMatch(/[\u001b\u202e]/);
  });

  it('withholds an oversized body from another writer instead of delivering a partial instruction', () => {
    const text = messageText({ id: 1, from: 'peer', to: 'me', text: `delete everything${'x'.repeat(100_000)}`, at: 0, replyRequired: false }, undefined);
    expect(text.length).toBeLessThan(500);
    expect(text).not.toContain('delete everything');
    expect(text).toContain('not delivered');
    expect(text).toContain('file path');
  });

  it('retains the complete body at the limit, including a critical instruction at its end', () => {
    const ending = 'Do not delete files.';
    const body = `${'x'.repeat(8_000 - ending.length)}${ending}`;
    const text = messageText({ id: 1, from: 'peer', to: 'me', text: body, at: 0, replyRequired: false }, undefined);
    expect(text).toContain(body);
    expect(text).not.toContain('not delivered');
  });

  it('projects only active capabilities and refreshes changed profile guidance', async () => {
    // With no Octocode server running, guidance follows the Octocode tools present.
    const fake = fakePi();
    let description = 'first profile';
    registerTurnSetup(fake.pi, { isSubagent: false, profiles: () => new Map([['reviewer', { name: 'reviewer', description, prompt: '' }]]), octocode: fakeOctocode({ by: 'off' }).mcp });
    (fake.pi as unknown as { getCommands: () => unknown[] }).getCommands = () => [{ name: 'mcp' }];
    const prompt = async (selectedTools: string[]) => {
      const event = { systemPromptOptions: { sections: {} as Record<string, string>, selectedTools } };
      await fake.emit('before_agent_start', event, {});
      return event.systemPromptOptions.sections['octocode']!;
    };
    const inactive = await prompt(['read']);
    expect(inactive).not.toContain('Use Octocode MCP');
    expect(inactive).not.toContain('# Delegation');
    expect(inactive).not.toContain('# Subagent');
    const active = ['read', 'agent', 'mcp__octocode__localSearch'];
    expect(await prompt(active)).toContain('first profile');
    description = 'updated profile';
    expect(await prompt(active)).toContain('updated profile');
  });
});
