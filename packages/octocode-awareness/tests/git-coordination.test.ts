import { it } from 'vitest';
import { gitCoordinationScenario } from './helpers/git-coordination-scenario.js';
import { allowLocalFixtureProcesses } from '../../../test-utils/external-effects-guard.js';

it('shares peers, signals and file memory across Git worktrees while preserving physical scope', async () => {
  const restore = allowLocalFixtureProcesses();
  try { await gitCoordinationScenario(); } finally { restore(); }
});
