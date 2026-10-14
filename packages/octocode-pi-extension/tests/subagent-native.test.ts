import fs from 'node:fs';
import path from 'node:path';
import { createFauxCore, fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai';
import { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager, type ExtensionFactory } from '@earendil-works/pi-coding-agent';
import { describe, expect, it } from 'vitest';
import { runSubagent } from '../src/subagents/process.js';
import { tmp } from './helpers.js';

describe('native Pi subagent completion', () => {
  it.each(['answer', 'tool', 'completed'] as const)('respects native settlement after %s', async (boundary) => {
    const cwd = tmp();
    const agentDir = path.join(cwd, 'agent');
    fs.mkdirSync(agentDir);
    fs.writeFileSync(path.join(cwd, 'evidence.txt'), 'evidence');
    const faux = createFauxCore({ provider: 'faux', models: [{ id: 'faux-1', contextWindow: 200_000, maxTokens: 4096 }] });
    const provider: ExtensionFactory = (pi) => pi.registerProvider('faux', {
      name: 'Faux', api: faux.api, baseUrl: 'http://127.0.0.1:0', apiKey: 'test', models: faux.models,
      streamSimple: faux.streamSimple,
    } as never);
    const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
    const resourceLoader = new DefaultResourceLoader({
      cwd, agentDir, settingsManager, extensionFactories: [{ name: 'faux', factory: provider }],
      noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    });
    await resourceLoader.reload();
    const { session } = await createAgentSession({ cwd, agentDir, resourceLoader, settingsManager, sessionManager: SessionManager.inMemory(cwd), tools: ['read'] });
    const records: string[] = [];
    let aborted: boolean | undefined;
    let abortedMessage = false;
    let cancellation: Promise<void> | undefined;
    const oldScript = process.argv[1];
    try {
      await session.bindExtensions({ mode: 'json', shutdownHandler: () => undefined } as never);
      await session.setModel(session.modelRuntime.getModel('faux', 'faux-1')!);
      faux.setResponses(boundary === 'tool'
        ? [() => fauxAssistantMessage([fauxToolCall('read', { path: 'evidence.txt' })], { stopReason: 'toolUse' }), () => fauxAssistantMessage('Unexpected continuation')]
        : [() => fauxAssistantMessage('REPORT')]);
      session.subscribe((event) => {
        records.push(JSON.stringify(event));
        if (event.type === 'agent_settled') aborted = event.aborted;
        if (event.type === 'message_end' && event.message.role === 'assistant') {
          abortedMessage ||= event.message.stopReason === 'aborted';
          if (boundary === 'answer' && event.message.stopReason === 'stop') cancellation = session.abort();
        }
        if (boundary === 'tool' && event.type === 'tool_execution_end') cancellation = session.abort();
      });
      await session.prompt('Inspect the evidence and report.');
      await cancellation;
      expect(aborted).toBe(boundary !== 'completed');
      expect(abortedMessage).toBe(false);
      // Replay the real native event sequence through the supervisor's child-process boundary.
      const script = path.join(cwd, 'pi');
      fs.writeFileSync(script, `process.stdout.write(${JSON.stringify(`${records.join('\n')}\n`)});`);
      process.argv[1] = script;
      const result = await runSubagent('', [], cwd, undefined, { id: 'native-test' }, undefined, () => undefined);
      if (boundary === 'completed') {
        expect(result.text).toBe('REPORT');
        expect(result.error).toBeUndefined();
      } else {
        expect(result.error).toMatch(/cancelled/i);
        if (boundary === 'answer') expect(result.text).toContain('REPORT');
      }
    } finally {
      process.argv[1] = oldScript!;
      session.dispose();
    }
  });
});
