import path from 'node:path';
import type { PiContext } from '../types.js';
import { isSubagentProcess } from '../tools/agents/registry.js';
import { createPiModelDiscovery, type PiModelDiscovery } from './pi-model-discovery.js';
import { createPiHookRuntime, type PiHookRuntime } from './pi-hook-runtime.js';

export interface PiCapabilityAdapters {
  readonly models: PiModelDiscovery;
  readonly hooks: PiHookRuntime;
}

const runtimes = new Map<string, PiCapabilityAdapters>();
let activeWorkspace: string | undefined;
const workspaceKey = (ctx?: PiContext): string => path.resolve(ctx?.cwd ?? activeWorkspace ?? process.cwd());
function workspaceTrusted(ctx?: PiContext): boolean {
  try { return ctx?.isProjectTrusted?.() === true; } catch { return false; }
}

/** Both main and worker sessions use the same adapters after environment propagation. */
export function initializeCapabilityAdapters(ctx?: PiContext): PiCapabilityAdapters {
  disposeCapabilityAdapters(ctx);
  const workspace = workspaceKey(ctx);
  activeWorkspace = workspace;
  const adapters = { models: createPiModelDiscovery({ workspace }), hooks: createPiHookRuntime({ workspace, worker: isSubagentProcess() }) };
  runtimes.set(workspace, adapters);
  adapters.models.refresh(ctx?.modelRegistry, { trusted: workspaceTrusted(ctx) });
  adapters.hooks.refresh({ trusted: workspaceTrusted(ctx) });
  return adapters;
}

export function refreshCapabilityAdapters(ctx?: PiContext): PiCapabilityAdapters {
  const adapters = getCapabilityAdapters(ctx) ?? initializeCapabilityAdapters(ctx);
  adapters.models.refresh(ctx?.modelRegistry, { trusted: workspaceTrusted(ctx) });
  adapters.hooks.refresh({ trusted: workspaceTrusted(ctx) });
  return adapters;
}

export function getCapabilityAdapters(ctx?: PiContext): PiCapabilityAdapters | undefined {
  return runtimes.get(workspaceKey(ctx));
}

export function disposeCapabilityAdapters(ctx?: PiContext): void {
  const key = workspaceKey(ctx);
  const adapters = runtimes.get(key);
  if (!adapters) return;
  adapters.hooks.dispose();
  adapters.models.dispose();
  runtimes.delete(key);
  if (activeWorkspace === key) activeWorkspace = undefined;
}
