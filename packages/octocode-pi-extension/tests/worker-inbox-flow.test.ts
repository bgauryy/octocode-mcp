import { expect, it, vi } from 'vitest';
import type { PiContext, WorkerLedgerEntry } from '../src/types.js';

// The picker is independent of subprocess creation, the worker registry, and OS notifications.
vi.mock('../src/tools/agents/lifecycle.js', () => ({
  getWorkerTranscript: vi.fn(),
  steerWorkerById: vi.fn(),
}));
vi.mock('../src/tools/agents/kill.js', () => ({ killWorkerById: vi.fn() }));
vi.mock('../src/tools/agents/ledger.js', () => ({
  listWorkerLedgerEntries: vi.fn(),
  registerWorkerLedgerListener: vi.fn(),
}));
vi.mock('../src/tools/agents/rendering.js', () => ({
  formatElapsed: () => '1s',
}));
vi.mock('../src/tools/ui-overlays.js', () => ({ runSelectOverlay: vi.fn() }));
vi.mock('../src/tools/desktop-notify.js', () => ({}));
import {
  runAgentInboxOverlay,
  type AgentInboxDeps,
} from '../src/tools/agents/inbox.js';

function flow() {
  const entry = {
    agentId: 'worker-1',
    name: 'atlas',
    status: 'idle',
    startedAt: '',
    updatedAt: '',
    recentEvents: [],
  } as unknown as WorkerLedgerEntry;
  const inspect = vi.fn<AgentInboxDeps['inspect']>(async () => {});
  const notify = vi.fn();
  const deps: AgentInboxDeps = {
    ctx: { hasUI: true } as PiContext,
    listEntries: () => [entry],
    runOverlay: vi
      .fn()
      .mockResolvedValueOnce(entry.agentId)
      .mockResolvedValueOnce('view'),
    transcript: () =>
      Array.from({ length: 125 }, (_, index) => `line ${index + 1}`).join('\n'),
    inspect,
    notify,
    steer: vi.fn(),
    kill: vi.fn(),
  };
  return { deps, entry, inspect, notify };
}

it('opens all retained worker output in the scroll inspector without adding transcript notifications', async () => {
  const { deps, inspect, notify } = flow();
  await runAgentInboxOverlay(deps);
  expect(inspect).toHaveBeenCalledWith(
    deps.ctx,
    'atlas · worker output',
    expect.arrayContaining(['line 1', 'line 125'])
  );
  expect(inspect.mock.calls[0]?.[2]).toHaveLength(125);
  expect(notify).not.toHaveBeenCalled();
  expect(deps.steer).not.toHaveBeenCalled();
  expect(deps.kill).not.toHaveBeenCalled();
});

it('rereads the selected worker before presenting actions after it exits', async () => {
  const { deps, entry } = flow();
  deps.runOverlay = vi
    .fn()
    .mockImplementationOnce(async () => {
      deps.listEntries = () => [{ ...entry, status: 'exited' }];
      return entry.agentId;
    })
    .mockResolvedValueOnce('dismiss');
  await runAgentInboxOverlay(deps);
  const items = vi.mocked(deps.runOverlay).mock.calls[1]![1].items;
  expect(items.map(item => item.value)).toEqual(['view', 'dismiss']);
});

it('closes a stale selection with an explicit message when the worker disappears', async () => {
  const { deps, entry, notify } = flow();
  deps.runOverlay = vi.fn(async () => {
    deps.listEntries = () => [];
    return entry.agentId;
  });
  await runAgentInboxOverlay(deps);
  expect(deps.runOverlay).toHaveBeenCalledOnce();
  expect(notify).toHaveBeenCalledWith(
    deps.ctx,
    'This worker is no longer available.',
    'info'
  );
});
