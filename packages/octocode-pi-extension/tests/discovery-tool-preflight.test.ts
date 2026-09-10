import { expect, it, vi } from 'vitest';
import type { ToolDefinition } from '../src/types.js';
const calls = vi.hoisted(() => ({ connect: vi.fn(), skill: vi.fn() }));
vi.mock('../src/chrome-debug.js', () => ({ connectToChrome: calls.connect, cleanupConnection: vi.fn(), redactObject: (v: unknown) => v }));
vi.mock('../src/tools/call-skill.js', () => ({ orchestrate: calls.skill }));
import { registerChromeDebugTool } from '../src/tools/chrome-debug-tool.js';
import { registerSkillTool } from '../src/tools/skill-tool.js';

it('rejects a later raw CDP request without a method before connecting', async () => {
  let tool: ToolDefinition | undefined;
  registerChromeDebugTool({ registerTool: value => { tool = value; } }, new Set(), (pi, _names, value) => pi.registerTool?.(value));
  calls.connect.mockRejectedValue(new Error('connection must not start'));
  await expect(tool!.execute('cdp-preflight', { queries: [
    { reasoning: 'navigate', scheme: 'dom', url: 'https://example.com' },
    { reasoning: 'invalid raw call', scheme: 'raw' },
  ] })).rejects.toThrow(/queries\[1\].*preflight.*method/);
  expect(calls.connect).not.toHaveBeenCalled();
});

it('rejects a later incomplete skill load before dynamic lifecycle effects', async () => {
  let tool: ToolDefinition | undefined;
  registerSkillTool({ registerTool: value => { tool = value; } }, new Set(), (pi, _names, value) => pi.registerTool?.(value), () => []);
  calls.skill.mockResolvedValue({ status: 'deleted', message: 'first deletion' });
  await expect(tool!.execute('skill-preflight', { queries: [
    { reasoning: 'delete dynamic fixture', type: 'call', mode: 'delete', skillType: 'fixture' },
    { reasoning: 'incomplete load', type: 'load', action: 'load' },
  ] })).rejects.toThrow(/queries\[1\].*preflight.*name/);
  expect(calls.skill).not.toHaveBeenCalled();
});
