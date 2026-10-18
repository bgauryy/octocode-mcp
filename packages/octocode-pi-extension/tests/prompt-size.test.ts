import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import octocode from '../src/index.js';
import { fakeCtx, fakePi } from './fake-pi.js';
import { tmp } from './helpers.js';

let saved: NodeJS.ProcessEnv;
beforeEach(() => {
  saved = { ...process.env };
  process.env['OCTOCODE_HOME'] = tmp();
  // Hermetic: a run inside a Pi subagent inherits its identity, which changes the tools and the prompt.
  for (const key of ['OCTOCODE_SUBAGENT', 'OCTOCODE_BROWSER_VISIBLE', 'OCTOCODE_AGENT_COLLABORATE']) delete process.env[key];
});
afterEach(() => {
  process.env = saved;
});

interface Size {
  total: number;
  prompt: number;
  perTool: Record<string, number>;
}

/**
 * Extension-owned descriptions, JSON schemas, prompt guidelines and the `octocode` section. This fake host excludes
 * Pi's base prompt/tools, MCP, skill metadata, repository instructions and snippets. e2e.test.ts also budgets the real
 * default Pi + MCP prefix. `exclude` mirrors a subagent profile's `excludeTools`.
 */
async function promptSize(options: { subagent: boolean; exclude?: string[] }): Promise<Size> {
  if (options.subagent) process.env['OCTOCODE_SUBAGENT'] = '1';
  const fake = fakePi();
  Object.assign(fake.pi, { getSessionName: () => undefined });
  await octocode(fake.pi);
  const ctx = fakeCtx({ cwd: tmp(), hasUI: !options.subagent });
  Object.assign(ctx.ui, { onTerminalInput: () => () => undefined });
  await fake.fire('session_start', { type: 'session_start', reason: 'startup' }, ctx);
  const active = fake.pi.getActiveTools().filter((name) => !options.exclude?.includes(name));
  const sections: Record<string, string> = {};
  await fake.fire('before_agent_start', { type: 'before_agent_start', prompt: 'hi', systemPromptOptions: { sections, selectedTools: active } }, ctx);
  const perTool: Record<string, number> = {};
  for (const tool of fake.pi.getAllTools().filter((candidate) => active.includes(candidate.name))) {
    const { description, parameters, promptGuidelines } = tool as { description: string; parameters: unknown; promptGuidelines?: string[] };
    perTool[tool.name] = description.length + JSON.stringify(parameters).length + (promptGuidelines ?? []).join('').length;
  }
  const prompt = (sections['octocode'] ?? '').length;
  return { total: Object.values(perTool).reduce((sum, size) => sum + size, prompt), prompt, perTool };
}

/*
 * Ceilings are about 5% above the size measured when they were set. When the prompt shrinks, lower them to match;
 * never raise one without a reason a reviewer can weigh against paying these characters on every request.
 */
// 17_900: +100 for the no-polling rule in the agent and bash descriptions. Without it an agent
// sleep-polled a background subagent for about 25 minutes.
// +1,100 for the user-requested main-session externalAgent contract: one adapter surface
// replaces vendor-specific tool descriptions; subagents still exclude it.
// +900 each for the user-requested `archive` tool (840 measured): one tool with a goal and a reason searches and reads
// every history the session may read, replacing the rg/localSearch recipe; subagents keep it (a core tool).
const MAIN_CEILING = 19_900;
const READ_ONLY_SUBAGENT_CEILING = 12_050;

describe('prompt size', () => {
  it('main session', async () => {
    const size = await promptSize({ subagent: false });
    console.log(`main session: ${size.total} chars (prompt ${size.prompt}); ${JSON.stringify(size.perTool)}`);
    expect(size.prompt).toBeGreaterThan(0);
    expect(size.total, `main session measured ${size.total}`).toBeLessThan(MAIN_CEILING);
  });

  it('read-only subagent', async () => {
    const size = await promptSize({ subagent: true, exclude: ['file', 'browser'] });
    console.log(`read-only subagent: ${size.total} chars (prompt ${size.prompt}); ${JSON.stringify(size.perTool)}`);
    expect(size.prompt).toBeGreaterThan(0);
    expect(size.total, `read-only subagent measured ${size.total}`).toBeLessThan(READ_ONLY_SUBAGENT_CEILING);
  });
});
