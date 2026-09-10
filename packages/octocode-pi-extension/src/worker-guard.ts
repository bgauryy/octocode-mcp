/** Minimal Pi entry for lean workers: capability gates only, no tools or catalogs. */
import type { PiInstance } from './types.js';
import {
  assertCurrentWorkerNativeTool,
  disposeWorkerCapabilityRuntime,
  refreshCurrentWorkerCapabilities,
} from './tools/worker-capabilities.js';

export default function registerLeanWorkerGuard(pi: PiInstance): void {
  let controller = new AbortController();
  let signature = '';
  const refresh = async (beginTurn = false) => {
    const view = await refreshCurrentWorkerCapabilities({ beginTurn, signal: controller.signal });
    if (!view) throw new Error('Lean workers require an authenticated parent capability binding.');
    if (view.snapshot.skills.length || view.snapshot.mcpTools.length) throw new Error('Lean workers cannot activate skills or MCP tools; spawn an Octocode worker for those resources.');
    return view;
  };
  pi.on('session_start', async () => {
    controller = new AbortController();
    const view = await refresh();
    pi.setActiveTools?.(view.snapshot.nativeTools);
  });
  pi.on('before_agent_start', async () => {
    const view = await refresh(true);
    pi.setActiveTools?.(view.snapshot.nativeTools);
    const nextSignature = `${view.grant.revision}:${view.snapshot.revision}`;
    if (signature !== nextSignature) {
      pi.appendEntry?.('octocode-worker-capabilities', { schemaVersion: 1, grant: view.grant, capabilityRevision: view.snapshot.revision });
      signature = nextSignature;
    }
  });
  pi.on('tool_call', async event => {
    try {
      await refresh();
      assertCurrentWorkerNativeTool(event.toolName);
    } catch (error) {
      return { block: true, reason: error instanceof Error ? error.message : String(error) };
    }
    return undefined;
  });
  pi.on('session_shutdown', async () => {
    controller.abort();
    signature = '';
    await disposeWorkerCapabilityRuntime();
  });
}
