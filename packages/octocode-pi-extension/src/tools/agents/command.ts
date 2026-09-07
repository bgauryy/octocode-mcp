/**
 * command.ts — /octocode-agents slash-command constants and handler.
 *
 * Owns: OCTOCODE_AGENTS_COMMAND_USAGE, OCTOCODE_AGENTS_COMMAND_COMPLETIONS,
 *       OCTOCODE_AGENTS_COMMAND_DESCRIPTIONS, handleOctocodeAgentsCommand.
 *
 * No imports from agent-tools (that file is being eliminated; all concrete
 * dependencies are drawn directly from the agents/ sub-modules).
 */

import { shortId } from '../ids.js';
import { truncateUserVisibleToolOutput } from '../../utils.js';
import type { PiContext } from '../../types.js';
import {
  agents,
  setLedgerHidden,
  isDroppable,
  findAgentByIdOrPrefix,
} from './registry.js';
import { killAgent, removePromptFiles } from './kill.js';
import {
  refreshAgentLedgerUi,
  formatAgentLedgerDetails,
} from './rendering.js';
import { MAX_AGENT_VIEW_CHARS } from './types.js';
import { renderSingleAgentResult } from './lifecycle.js';

// ─── Command constants ──────────────────────────────────────────────────────────────

export const OCTOCODE_AGENTS_COMMAND_USAGE = '/octocode-agents [help|list|inspect <id>|kill <id>|kill-all|prune|hide]';
export const OCTOCODE_AGENTS_COMMAND_COMPLETIONS = ['help', 'list', 'inspect ', 'kill ', 'kill-all', 'prune', 'hide'] as const;
export const OCTOCODE_AGENTS_COMMAND_DESCRIPTIONS: Record<(typeof OCTOCODE_AGENTS_COMMAND_COMPLETIONS)[number], string> = {
  help: 'Show command examples and lifecycle hints',
  list: 'Show the worker ledger and refresh footer/widget status',
  'inspect ': 'Show full state for one worker by id or prefix',
  'kill ': 'Stop one live worker by id or prefix',
  'kill-all': 'Stop every live worker',
  prune: 'Remove completed idle records from the in-memory ledger',
  hide: 'Clear the footer/widget ledger for this session',
};
function formatOctocodeAgentsHelp(): string {
  return [
    OCTOCODE_AGENTS_COMMAND_USAGE,
    '',
    'Commands:',
    '- help \u2014 show this command reference',
    '- list \u2014 show the ledger and refresh footer/widget state',
    '- inspect <id-or-prefix> [full] \u2014 show worker state, handback, evidence, recent events, and stderr; "full" returns the complete tool-call/ledger/evidence history instead of the truncated preview',
    '- kill <id-or-prefix> \u2014 stop one live worker',
    '- kill-all \u2014 stop every live worker',
    '- prune \u2014 remove completed records from the in-memory ledger (alive workers are unaffected)',
    '- hide \u2014 clear the footer/widget ledger for this session',
    '',
    'Examples:',
    '  /octocode-agents list',
    '  /octocode-agents inspect abc123',
    '  /octocode-agents kill abc123',
    '  /octocode-agents kill-all',
  ].join('\n');
}

export async function handleOctocodeAgentsCommand(args: string, ctx?: PiContext): Promise<void> {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  const action = (parts[0] || 'list').toLowerCase();
  const targetRaw = parts[1];
  const full = parts.slice(2).some((flag) => /^full$/i.test(flag));
  if (action === 'help') {
    ctx?.ui?.notify?.(formatOctocodeAgentsHelp(), 'info');
    return;
  }
  if (action === 'hide') {
    setLedgerHidden(true);
    refreshAgentLedgerUi(ctx);
    ctx?.ui?.notify?.('Octocode agent ledger hidden for this session. Run /octocode-agents list to show it again.', 'info');
    return;
  }
  if (action === 'prune') {
    const droppable = [...agents.entries()].filter(([, record]) => isDroppable(record));
    for (const [id, record] of droppable) {
      removePromptFiles(record);
      agents.delete(id);
    }
    refreshAgentLedgerUi(ctx);
    ctx?.ui?.notify?.(`Pruned ${droppable.length} Octocode agent record(s).\n${formatAgentLedgerDetails()}`, 'info');
    return;
  }
  if (action === 'inspect') {
    const record = findAgentByIdOrPrefix(targetRaw);
    if (!record) {
      ctx?.ui?.notify?.(`No Octocode agent matches: ${targetRaw ?? '(missing id)'}\n${formatAgentLedgerDetails()}`, 'error');
      return;
    }
    refreshAgentLedgerUi(ctx);
    const fullText = (renderSingleAgentResult(record, 'Agent status', { full }).content[0] as { text?: string } | undefined)?.text ?? '';
    const preview = truncateUserVisibleToolOutput(fullText, MAX_AGENT_VIEW_CHARS);
    ctx?.ui?.notify?.(`${preview.text}${preview.truncated ? `\n\u2026 ${preview.omittedChars} chars hidden in this UI view` : ''}`, 'info');
    return;
  }
  if (action === 'kill-all') {
    const alive = [...agents.values()].filter((record) => !isDroppable(record));
    for (const record of alive) killAgent(record);
    refreshAgentLedgerUi(ctx);
    ctx?.ui?.notify?.(`Killed ${alive.length} Octocode agent(s).\n${formatAgentLedgerDetails()}`, 'warning');
    return;
  }
  if (action === 'kill') {
    const record = findAgentByIdOrPrefix(targetRaw);
    if (!record) {
      ctx?.ui?.notify?.(`No Octocode agent matches: ${targetRaw ?? '(missing id)'}\n${formatAgentLedgerDetails()}`, 'error');
      return;
    }
    killAgent(record);
    refreshAgentLedgerUi(ctx);
    ctx?.ui?.notify?.(`Killed Octocode agent ${record.name} (${shortId(record.id)}).\n${formatAgentLedgerDetails()}`, 'warning');
    return;
  }
  if (action !== 'list') {
    ctx?.ui?.notify?.(formatOctocodeAgentsHelp(), 'warning');
    return;
  }
  setLedgerHidden(false);
  refreshAgentLedgerUi(ctx);
  ctx?.ui?.notify?.(formatAgentLedgerDetails(), 'info');
}
