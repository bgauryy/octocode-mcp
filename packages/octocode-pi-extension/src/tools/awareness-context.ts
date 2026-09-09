import path from 'node:path';
import { defaultDbPath, type AwarenessCommandContext } from '@octocodeai/octocode-awareness';
import type { PiContext } from '../types.js';
import { getAwarenessAgentIdentity } from './awareness-shared.js';
import { resolveAwarenessCoordinationScope } from '../assets.js';

/** Native bindings do not depend on a CLI file or shell environment. */
export function buildAwarenessContext(ctx?: PiContext): AwarenessCommandContext {
  const workspace = path.resolve(ctx?.cwd ?? process.cwd());
  const scope = resolveAwarenessCoordinationScope(workspace);
  return { workspace, scope, database: defaultDbPath(workspace, scope), agentId: getAwarenessAgentIdentity(ctx).agentId, compact: true };
}
