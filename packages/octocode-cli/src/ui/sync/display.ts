import { c, bold, dim } from '../../utils/colors.js';
import type { MCPServer } from '../../types/index.js';
import type {
  SyncAnalysis,
  MCPDiff,
  ClientConfigSnapshot,
  SyncResult,
} from '../../features/sync.js';
import { getClientDisplayName } from '../../features/sync.js';

export function printSyncSummary(analysis: SyncAnalysis): void {
  const { summary } = analysis;

  console.log();
  console.log(c('blue', ' ┌' + '─'.repeat(60) + '┐'));
  console.log(
    c('blue', ' │ ') + bold('MCP Sync Status') + ' '.repeat(44) + c('blue', '│')
  );
  console.log(c('blue', ' └' + '─'.repeat(60) + '┘'));
  console.log();

  console.log(` ${bold('Clients:')}`);
  console.log(
    `   ${c('cyan', '•')} ${summary.clientsWithConfig} of ${summary.totalClients} with MCP configs`
  );
  console.log();

  console.log(` ${bold('MCPs:')}`);
  console.log(
    `   ${c('cyan', '•')} ${summary.totalUniqueMCPs} unique MCPs found`
  );

  if (summary.consistentMCPs > 0) {
    console.log(`   ${c('green', '✓')} ${summary.consistentMCPs} fully synced`);
    for (const diff of analysis.fullyConsistent) {
      console.log(`       ${dim('•')} ${diff.mcpId}`);
    }
  }

  if (summary.needsSyncCount > 0) {
    const count = summary.needsSyncCount;
    console.log(`   ${c('yellow', '○')} ${count} can be synced`);
    for (const diff of analysis.needsSync) {
      const missing = diff.missingIn.map(getClientDisplayName).join(', ');
      console.log(`       ${c('yellow', '•')} ${diff.mcpId}`);
      console.log(`         ${dim(`missing from: ${missing}`)}`);
    }
  }

  if (summary.conflictCount > 0) {
    console.log(`   ${c('red', '!')} ${summary.conflictCount} have conflicts`);
    for (const diff of analysis.conflicts) {
      const clients = Array.from(diff.variants.keys())
        .map(getClientDisplayName)
        .join(' vs ');
      console.log(`       ${c('red', '•')} ${diff.mcpId}`);
      console.log(`         ${dim(`different in: ${clients}`)}`);
    }
    console.log();
    console.log(
      `   ${c('cyan', 'ℹ')} ${dim('Continue to choose which config to use for each conflict')}`
    );
  }

  console.log();
}

export function printClientStatus(snapshots: ClientConfigSnapshot[]): void {
  console.log(` ${bold('Client Configurations:')}`);
  console.log();

  for (const snapshot of snapshots) {
    const name = getClientDisplayName(snapshot.client);
    const statusIcon = snapshot.exists ? c('green', '●') : c('dim', '○');
    const mcpInfo = snapshot.exists
      ? `${snapshot.mcpCount} MCPs`
      : dim('no config');

    console.log(`   ${statusIcon} ${name}`);
    console.log(`     ${dim(snapshot.configPath)}`);
    console.log(`     ${dim(mcpInfo)}`);
    console.log();
  }
}

function printMCPDiff(diff: MCPDiff): void {
  const icon = diff.hasConflict
    ? c('red', '!')
    : diff.missingIn.length > 0
      ? c('yellow', '○')
      : c('green', '✓');

  console.log(`   ${icon} ${bold(diff.mcpId)}`);

  const presentNames = diff.presentIn.map(getClientDisplayName).join(', ');
  console.log(`     ${dim('Present in:')} ${presentNames}`);

  if (diff.missingIn.length > 0) {
    const missingNames = diff.missingIn.map(getClientDisplayName).join(', ');
    console.log(`     ${c('yellow', 'Missing from:')} ${missingNames}`);
  }

  if (diff.hasConflict) {
    console.log(
      `     ${c('red', 'Conflict:')} Different configurations detected`
    );
  }

  console.log();
}

export function printAllDiffs(analysis: SyncAnalysis): void {
  if (analysis.fullyConsistent.length > 0) {
    console.log(` ${c('green', '✓')} ${bold('Fully Synced:')}`);
    for (const diff of analysis.fullyConsistent) {
      console.log(`     ${c('dim', '•')} ${diff.mcpId}`);
    }
    console.log();
  }

  if (analysis.needsSync.length > 0) {
    console.log(
      ` ${c('yellow', '○')} ${bold('Needs Sync (auto-resolvable):')}`
    );
    for (const diff of analysis.needsSync) {
      printMCPDiff(diff);
    }
  }

  if (analysis.conflicts.length > 0) {
    console.log(
      ` ${c('red', '!')} ${bold('Conflicts (requires resolution):')}`
    );
    for (const diff of analysis.conflicts) {
      printMCPDiff(diff);
    }
  }
}

function printServerConfig(server: MCPServer, indent: string = '     '): void {
  console.log(`${indent}${dim('command:')} ${server.command || dim('(none)')}`);
  const argsStr = server.args?.join(' ') || '';
  if (argsStr) {
    console.log(`${indent}${dim('args:')} ${argsStr}`);
  }

  if (server.env && Object.keys(server.env).length > 0) {
    console.log(`${indent}${dim('env:')}`);
    for (const [key, value] of Object.entries(server.env)) {
      const displayValue = key.toLowerCase().includes('token')
        ? '***'
        : value && value.length > 30
          ? value.slice(0, 30) + '...'
          : value || '';
      console.log(`${indent}  ${c('cyan', key)}: ${displayValue}`);
    }
  }
}

export function printConflictDetails(
  diff: MCPDiff,
  showFullConfig: boolean = false
): void {
  console.log();
  console.log(c('yellow', ' ┌' + '─'.repeat(60) + '┐'));
  console.log(
    c('yellow', ' │ ') +
      `${c('yellow', '⚠')} Conflict: ${bold(diff.mcpId)}` +
      ' '.repeat(Math.max(0, 43 - diff.mcpId.length)) +
      c('yellow', '│')
  );
  console.log(c('yellow', ' └' + '─'.repeat(60) + '┘'));
  console.log();

  console.log(
    ` ${dim('This MCP has different configurations across clients:')}`
  );
  console.log();

  let variantIndex = 1;
  for (const [client, server] of diff.variants) {
    const clientName = getClientDisplayName(client);
    console.log(`   ${c('cyan', `[${variantIndex}]`)} ${bold(clientName)}`);

    if (showFullConfig) {
      printServerConfig(server, '       ');
    } else {
      const argsStr = server.args?.join(' ') || '';
      const cmdLine = [server.command, argsStr].filter(Boolean).join(' ');
      console.log(`       ${dim('command:')} ${cmdLine || dim('(none)')}`);
      if (server.env && Object.keys(server.env).length > 0) {
        console.log(
          `       ${dim('env:')} ${Object.keys(server.env).length} variables`
        );
      }
    }
    console.log();
    variantIndex++;
  }
}

export function printSyncPreview(
  mcpsToSync: Array<{ mcpId: string }>,
  targetClients: ClientConfigSnapshot[]
): void {
  console.log();
  console.log(c('blue', ' ┌' + '─'.repeat(60) + '┐'));
  console.log(
    c('blue', ' │ ') + bold('Sync Preview') + ' '.repeat(47) + c('blue', '│')
  );
  console.log(c('blue', ' └' + '─'.repeat(60) + '┘'));
  console.log();

  console.log(` ${bold('MCPs to sync:')} ${mcpsToSync.length}`);
  for (const { mcpId } of mcpsToSync) {
    console.log(`   ${c('cyan', '•')} ${mcpId}`);
  }
  console.log();

  console.log(` ${bold('Target clients:')} ${targetClients.length}`);
  for (const snapshot of targetClients) {
    const name = getClientDisplayName(snapshot.client);
    console.log(`   ${c('cyan', '•')} ${name}`);
    console.log(`     ${dim(snapshot.configPath)}`);
  }
  console.log();

  console.log(` ${c('yellow', '⚠')} ${bold('Note:')}`);
  console.log(
    `   ${dim('Backups will be created before modifying any config.')}`
  );
  console.log();
}

export function printSyncResult(result: SyncResult): void {
  console.log();

  if (result.success) {
    console.log(c('green', ' ┌' + '─'.repeat(60) + '┐'));
    console.log(
      c('green', ' │ ') +
        `${c('green', '✓')} ${bold('Sync Complete!')}` +
        ' '.repeat(43) +
        c('green', '│')
    );
    console.log(c('green', ' └' + '─'.repeat(60) + '┘'));
  } else {
    console.log(c('red', ' ┌' + '─'.repeat(60) + '┐'));
    console.log(
      c('red', ' │ ') +
        `${c('red', '✗')} ${bold('Sync completed with errors')}` +
        ' '.repeat(32) +
        c('red', '│')
    );
    console.log(c('red', ' └' + '─'.repeat(60) + '┘'));
  }

  console.log();

  if (result.mcpsSynced.length > 0) {
    console.log(` ${bold('Synced MCPs:')} ${result.mcpsSynced.length}`);
    for (const mcpId of result.mcpsSynced) {
      console.log(`   ${c('green', '✓')} ${mcpId}`);
    }
    console.log();
  }

  console.log(` ${bold('Client Results:')}`);
  for (const [client, clientResult] of result.clientResults) {
    const name = getClientDisplayName(client);
    if (clientResult.success) {
      console.log(`   ${c('green', '✓')} ${name}`);
      if (clientResult.backupPath) {
        console.log(`     ${dim('Backup:')} ${clientResult.backupPath}`);
      }
    } else {
      console.log(`   ${c('red', '✗')} ${name}`);
      if (clientResult.error) {
        console.log(`     ${c('red', 'Error:')} ${clientResult.error}`);
      }
    }
  }

  if (result.errors.length > 0) {
    console.log();
    console.log(` ${c('red', 'Errors:')}`);
    for (const error of result.errors) {
      console.log(`   ${c('red', '•')} ${error}`);
    }
  }

  console.log();
}

export function printNoSyncNeeded(): void {
  console.log();
  console.log(c('green', ' ┌' + '─'.repeat(60) + '┐'));
  console.log(
    c('green', ' │ ') +
      `${c('green', '✓')} ${bold('All MCPs are already in sync!')}` +
      ' '.repeat(28) +
      c('green', '│')
  );
  console.log(c('green', ' └' + '─'.repeat(60) + '┘'));
  console.log();
  console.log(
    ` ${dim('All your MCP configurations are consistent across clients.')}`
  );
  console.log();
}
