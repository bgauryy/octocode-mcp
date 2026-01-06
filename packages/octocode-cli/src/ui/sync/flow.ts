/**
 * MCP Sync UI Flow
 *
 * Interactive flow for syncing MCP configurations across clients.
 */

import { c, bold, dim } from '../../utils/colors.js';
import { loadInquirer, select, Separator, input } from '../../utils/prompts.js';
import { Spinner } from '../../utils/spinner.js';
import { assertDefined } from '../../utils/assert.js';
import {
  readAllClientConfigs,
  analyzeSyncState,
  isSyncNeeded,
  prepareSyncPayload,
  executeSyncToClients,
  getClientDisplayName,
  type SyncAnalysis,
  type MCPDiff,
  type ConflictResolution,
} from '../../features/sync.js';
import {
  printSyncSummary,
  printClientStatus,
  printAllDiffs,
  printConflictDetails,
  printSyncPreview,
  printSyncResult,
  printNoSyncNeeded,
} from './display.js';
import type { MCPClient, MCPServer } from '../../types/index.js';

type SyncStep =
  | 'analyze'
  | 'showStatus'
  | 'resolveConflicts'
  | 'preview'
  | 'confirm'
  | 'execute'
  | 'done';

interface SyncFlowState {
  analysis: SyncAnalysis | null;
  resolutions: ConflictResolution[];
  currentConflictIndex: number;
}

async function pressEnterToContinue(): Promise<void> {
  console.log();
  await input({
    message: dim('Press Enter to continue...'),
    default: '',
  });
}

/**
 * Prompt user to resolve a single conflict
 */
async function resolveConflict(
  diff: MCPDiff
): Promise<ConflictResolution | null> {
  printConflictDetails(diff, true);

  // Build choices from variants
  const choices: Array<{
    name: string;
    value: { client: MCPClient; server: MCPServer } | 'skip' | 'back';
    description?: string;
  }> = [];

  let index = 1;
  for (const [client, server] of diff.variants) {
    const clientName = getClientDisplayName(client);
    const argsStr = server.args?.join(' ') || '';
    const cmdDesc = [server.command, argsStr].filter(Boolean).join(' ');
    choices.push({
      name: `${c('cyan', `[${index}]`)} Use config from ${bold(clientName)}`,
      value: { client, server },
      description: cmdDesc || '(no command)',
    });
    index++;
  }

  choices.push(
    new Separator() as unknown as {
      name: string;
      value: { client: MCPClient; server: MCPServer } | 'skip' | 'back';
    }
  );
  choices.push({
    name: `${c('yellow', '⏭')} Skip this MCP (don't sync)`,
    value: 'skip',
  });
  choices.push({
    name: `${c('dim', '← Back')}`,
    value: 'back',
  });

  const choice = await select<
    { client: MCPClient; server: MCPServer } | 'skip' | 'back'
  >({
    message: `Choose config for ${bold(diff.mcpId)}:`,
    choices,
    loop: false,
  });

  if (choice === 'back' || choice === 'skip') {
    return null;
  }

  return {
    mcpId: diff.mcpId,
    chosenConfig: choice.server,
    sourceClient: choice.client,
  };
}

/**
 * Main sync flow
 */
export async function runSyncFlow(): Promise<void> {
  await loadInquirer();

  console.log();
  console.log(c('blue', '━'.repeat(66)));
  console.log(` 🔄 ${bold('Sync System MCP')}`);
  console.log(c('blue', '━'.repeat(66)));
  console.log();
  console.log(` ${dim('Synchronize MCP servers across all your IDE clients')}`);

  const state: SyncFlowState = {
    analysis: null,
    resolutions: [],
    currentConflictIndex: 0,
  };

  let currentStep: SyncStep = 'analyze';

  while (currentStep !== 'done') {
    switch (currentStep) {
      case 'analyze': {
        const spinner = new Spinner(
          'Scanning client configurations...'
        ).start();

        // Small delay for UX
        await new Promise(resolve => setTimeout(resolve, 300));

        const snapshots = readAllClientConfigs();
        state.analysis = analyzeSyncState(snapshots);

        spinner.succeed('Configuration scan complete!');

        if (state.analysis.summary.clientsWithConfig < 2) {
          console.log();
          console.log(
            ` ${c('yellow', '⚠')} ${bold('Not enough clients to sync')}`
          );
          console.log(
            ` ${dim('Found only')} ${state.analysis.summary.clientsWithConfig} ${dim('client(s) with MCP configs.')}`
          );
          console.log(` ${dim('Need at least 2 clients to sync.')}`);
          console.log();
          await pressEnterToContinue();
          return;
        }

        currentStep = 'showStatus';
        break;
      }

      case 'showStatus': {
        const analysis = assertDefined(
          state.analysis,
          'Analysis should be populated before showStatus step'
        );
        printSyncSummary(analysis);

        if (!isSyncNeeded(analysis)) {
          printNoSyncNeeded();
          await pressEnterToContinue();
          return;
        }

        type StatusChoice = 'continue' | 'details' | 'clients' | 'back';

        const choice = await select<StatusChoice>({
          message: 'What would you like to do?',
          choices: [
            {
              name: `${c('green', '✓')} Continue to sync`,
              value: 'continue' as const,
            },
            {
              name: `${c('cyan', 'ℹ')} Show MCP details`,
              value: 'details' as const,
            },
            {
              name: `${c('cyan', 'ℹ')} Show client details`,
              value: 'clients' as const,
            },
            new Separator() as unknown as { name: string; value: StatusChoice },
            {
              name: `${c('dim', '← Back to menu')}`,
              value: 'back' as const,
            },
          ],
          loop: false,
        });

        if (choice === 'back') {
          return;
        }

        if (choice === 'details') {
          console.log();
          printAllDiffs(analysis);
          await pressEnterToContinue();
          // Stay in showStatus
          break;
        }

        if (choice === 'clients') {
          console.log();
          printClientStatus(analysis.clients);
          await pressEnterToContinue();
          // Stay in showStatus
          break;
        }

        // Continue to next step
        if (analysis.conflicts.length > 0) {
          currentStep = 'resolveConflicts';
        } else {
          currentStep = 'preview';
        }
        break;
      }

      case 'resolveConflicts': {
        const analysis = assertDefined(
          state.analysis,
          'Analysis should be populated before resolveConflicts step'
        );
        const conflicts = analysis.conflicts;

        console.log();
        console.log(
          ` ${c('yellow', '⚠')} ${bold(`Resolve ${conflicts.length} conflict(s)`)}`
        );
        console.log(
          ` ${dim('You need to choose which configuration to use for each conflicting MCP.')}`
        );

        state.resolutions = [];

        for (let i = 0; i < conflicts.length; i++) {
          console.log();
          console.log(` ${dim(`Conflict ${i + 1} of ${conflicts.length}`)}`);

          const resolution = await resolveConflict(conflicts[i]);

          if (resolution === null) {
            // User chose skip or back - skip this MCP
            console.log(
              ` ${c('yellow', '⏭')} Skipping ${bold(conflicts[i].mcpId)}`
            );
            continue;
          }

          state.resolutions.push(resolution);
          console.log(
            ` ${c('green', '✓')} Using config from ${bold(getClientDisplayName(resolution.sourceClient))}`
          );
        }

        currentStep = 'preview';
        break;
      }

      case 'preview': {
        const analysis = assertDefined(
          state.analysis,
          'Analysis should be populated before preview step'
        );
        const payload = prepareSyncPayload(analysis, state.resolutions);

        if (payload.length === 0) {
          console.log();
          console.log(` ${c('yellow', '⚠')} ${bold('No MCPs to sync')}`);
          console.log(
            ` ${dim('All conflicts were skipped or no sync is needed.')}`
          );
          console.log();
          await pressEnterToContinue();
          return;
        }

        const targetClients = analysis.clients.filter(s => s.exists);

        printSyncPreview(
          payload.map(p => ({ mcpId: p.mcpId })),
          targetClients
        );

        currentStep = 'confirm';
        break;
      }

      case 'confirm': {
        type ConfirmChoice = 'proceed' | 'back' | 'cancel';

        const choice = await select<ConfirmChoice>({
          message: 'Proceed with sync?',
          choices: [
            {
              name: `${c('green', '✓')} Yes, sync all clients`,
              value: 'proceed' as const,
            },
            new Separator() as unknown as {
              name: string;
              value: ConfirmChoice;
            },
            {
              name: `${c('dim', '← Back to review')}`,
              value: 'back' as const,
            },
            {
              name: `${c('dim', '✗ Cancel')}`,
              value: 'cancel' as const,
            },
          ],
          loop: false,
        });

        if (choice === 'cancel') {
          console.log(` ${dim('Sync cancelled.')}`);
          return;
        }

        if (choice === 'back') {
          currentStep = 'showStatus';
          break;
        }

        currentStep = 'execute';
        break;
      }

      case 'execute': {
        const analysis = assertDefined(
          state.analysis,
          'Analysis should be populated before execute step'
        );
        const payload = prepareSyncPayload(analysis, state.resolutions);
        const targetClients = analysis.clients.filter(s => s.exists);

        const spinner = new Spinner('Syncing configurations...').start();

        // Small delay for UX
        await new Promise(resolve => setTimeout(resolve, 500));

        const result = executeSyncToClients(
          analysis.clients,
          payload,
          targetClients.map(c => c.client)
        );

        if (result.success) {
          spinner.succeed('Sync complete!');
        } else {
          spinner.fail('Sync completed with errors');
        }

        printSyncResult(result);

        console.log(` ${bold('Next steps:')}`);
        console.log(`   ${dim('Restart your IDEs to apply the changes.')}`);
        console.log();

        await pressEnterToContinue();
        currentStep = 'done';
        break;
      }
    }
  }
}

/**
 * Quick sync - non-interactive, used by CLI
 * Returns true if sync was performed, false if not needed or error
 */
export async function quickSync(options: {
  force?: boolean;
  dryRun?: boolean;
}): Promise<{
  success: boolean;
  message: string;
  syncPerformed: boolean;
}> {
  const snapshots = readAllClientConfigs();
  const analysis = analyzeSyncState(snapshots);

  if (analysis.summary.clientsWithConfig < 2) {
    return {
      success: false,
      message: `Not enough clients to sync (found ${analysis.summary.clientsWithConfig})`,
      syncPerformed: false,
    };
  }

  if (!isSyncNeeded(analysis)) {
    return {
      success: true,
      message: 'All MCPs are already in sync',
      syncPerformed: false,
    };
  }

  // Check for conflicts
  if (analysis.conflicts.length > 0 && !options.force) {
    return {
      success: false,
      message: `${analysis.conflicts.length} conflict(s) found. Use --force to auto-resolve or run interactive mode.`,
      syncPerformed: false,
    };
  }

  // Build payload - for conflicts with force, use first variant
  const resolutions: ConflictResolution[] = [];
  if (options.force) {
    for (const diff of analysis.conflicts) {
      const firstVariant = Array.from(diff.variants.entries())[0];
      if (firstVariant) {
        resolutions.push({
          mcpId: diff.mcpId,
          chosenConfig: firstVariant[1],
          sourceClient: firstVariant[0],
        });
      }
    }
  }

  const payload = prepareSyncPayload(analysis, resolutions);

  if (options.dryRun) {
    return {
      success: true,
      message: `Would sync ${payload.length} MCP(s) to ${analysis.summary.clientsWithConfig} client(s)`,
      syncPerformed: false,
    };
  }

  const targetClients = analysis.clients.filter(s => s.exists);
  const result = executeSyncToClients(
    analysis.clients,
    payload,
    targetClients.map(c => c.client)
  );

  if (result.success) {
    return {
      success: true,
      message: `Synced ${result.mcpsSynced.length} MCP(s) to ${targetClients.length} client(s)`,
      syncPerformed: true,
    };
  }

  return {
    success: false,
    message: `Sync failed: ${result.errors.join(', ')}`,
    syncPerformed: true,
  };
}
