import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { interactive } from '../shared/interactive.js';
import { withDialog } from '../shared/locks.js';
import { redactSecrets, visibleControls } from '../shared/sanitize.js';
import type { ExternalPolicy } from './manager.js';

/**
 * An external ACP agent's permission request, put to the person: only `allow_once` and `reject_once` are offered (a
 * standing grant would outlive this prompt), through the one dialog queue. No UI, an abort, or no answer cancels.
 */
export const externalPermissionDialog: ExternalPolicy['permission'] = (ctx: ExtensionContext) => async (request, signal) => {
  const cancelled = { outcome: { outcome: 'cancelled' as const } };
  if (!interactive(ctx, false) || signal.aborted) return cancelled;
  const options = request.options.filter((option) => option.kind === 'allow_once' || option.kind === 'reject_once');
  if (options.length === 0) return cancelled;
  return withDialog(async () => {
    if (signal.aborted) return cancelled;
    const labels = options.map((option, index) => `${index + 1}. ${visibleControls(option.name)}`);
    const title = `External agent permission\n${visibleControls(redactSecrets(JSON.stringify(request.toolCall, null, 2)))}`;
    const selected = await ctx.ui.select(title, labels, { signal });
    if (signal.aborted) return cancelled;
    const index = selected ? labels.indexOf(selected) : -1;
    return index < 0 ? cancelled : { outcome: { outcome: 'selected' as const, optionId: options[index]!.optionId } };
  }, signal);
};
