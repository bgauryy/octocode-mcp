import assert from 'node:assert/strict';
import { test } from 'vitest';
import { collectPublicCommands } from '../src/commands.js';
import type { PiCommand, PiInstance } from '../src/types.js';

function command(
  name: string,
  description: string | undefined,
  source: PiCommand['source'] = 'extension'
): PiCommand {
  return {
    name,
    description,
    source,
    sourceInfo: {
      path: '/test',
      source: 'test',
      scope: 'temporary',
      origin: 'top-level',
    },
  };
}

test('collectPublicCommands returns the live deduplicated registry and excludes private commands', () => {
  const commands = [
    command('octocode-status', 'Show live work'),
    command('_octocode-clear-context-impl', 'private'),
    command('model', 'Select model'),
    command('octocode-status', 'Latest description wins'),
  ];
  const pi = { getCommands: () => commands } as unknown as PiInstance;

  assert.deepEqual(
    collectPublicCommands(pi).map(({ name, description }) => ({
      name,
      description,
    })),
    [
      { name: 'model', description: 'Select model' },
      { name: 'octocode-status', description: 'Latest description wins' },
    ]
  );

  commands.push(command('skill:review', 'Run the review skill', 'skill'));
  assert.deepEqual(
    collectPublicCommands(pi).map(item => item.name),
    ['model', 'octocode-status', 'skill:review'],
    'each invocation reads the current registry rather than a startup snapshot'
  );
});
