import type { DatabaseSync } from 'node:sqlite';
import { flagBool, resolveAgentId, type ParsedArgs } from './commands/args.js';
import { emit, type EmitOptions } from './command-output.js';
import { cmdAgentRegistry, cmdAgentSignal, cmdInit, cmdNotifyPrune, cmdStatus } from './commands/admin.js';
import { cmdGetMemory, cmdRefineGet, cmdRefineSet, cmdReflect, cmdTellMemory } from './commands/memory.js';
import { cmdAuditUnverified, cmdReleaseFileLock, cmdVerify, cmdWork } from './commands/work.js';
import { cmdExportHarness, cmdForget, cmdMemoryLifecycle, cmdPlan, cmdRefineDelete, cmdTask } from './commands/plans.js';
import { cmdAttend, cmdDeveloperReview, cmdDocStaleness, cmdDocsCatalog, cmdQuery } from './commands/repo.js';
import { mineWeakness } from './memory-weakness.js';
import { pruneStale } from './maintenance-stale.js';
import { notifyGet } from './maintenance-briefing.js';
import { sessionCapture } from './maintenance-session.js';
import { digest } from './maintenance-digest.js';
import { exportMemoryDoc } from './maintenance-workspace.js';

/** Shared command handlers. No argv, process lifecycle, or output parsing. */
export async function runDatabaseCommandHandler(db: DatabaseSync, command: string, args: ParsedArgs, dbPath: string, opts: EmitOptions, signal?: AbortSignal): Promise<number> {
  let exitCode = 0;
  switch (command) {
    case 'history_status': case 'history_capture': case 'history_checkpoint': case 'history_timeline':
    case 'history_read': case 'history_restore_preview': case 'history_restore_apply':
    case 'history_retention_preview': case 'history_retention_prune': case 'history_recovery': case 'history_evidence': {
      const { runHistoryCommand } = await import('./commands/history.js');
      signal?.throwIfAborted();
      const result = await runHistoryCommand(db, command, args);
      if (opts.cli && command === 'history_restore_apply' && result.undo_preview && typeof result.undo_preview === 'object') {
        const preview = result.undo_preview as { command?: string; params?: Record<string, unknown> };
        if (preview.command === 'history restore-preview' && preview.params) {
          const params = preview.params;
          result.undo_preview = { command: { name: preview.command, args: [
            '--db', dbPath, '--workspace', String(params.workspace), '--agent-id', String(params.agent_id),
            '--operation-id', String(params.operation_id), '--side', String(params.side), '--compact',
          ] } };
        }
      }
      exitCode = emit(result, result.ok === false ? 2 : 0, opts); break;
    }
    case 'tell-memory':    exitCode = cmdTellMemory(db, args, dbPath, opts); break;
    case 'get-memory':     exitCode = cmdGetMemory(db, args, dbPath, opts); break;
    case 'reflect':        exitCode = cmdReflect(db, args, dbPath, opts); break;
    case 'refine-set':     exitCode = cmdRefineSet(db, args, dbPath, opts); break;
    case 'refine-get':     exitCode = cmdRefineGet(db, args, dbPath, opts); break;
    case 'release-file-lock': exitCode = cmdReleaseFileLock(db, args, dbPath, opts); break;
    case 'plan-command':   exitCode = cmdPlan(db, args, dbPath, opts); break;
    case 'task-command':   exitCode = cmdTask(db, args, dbPath, opts); break;
    case 'status':         exitCode = cmdStatus(db, dbPath, args, opts); break;
    case 'init':           exitCode = cmdInit(db, dbPath, opts); break;
    case 'prune-stale-locks': {
      const rawTargetFiles = args['target_file'];
      const pruneResult = pruneStale(db, {
        ...(Boolean(args['dry_run'] ?? args['dry-run']) ? { dry_run: true } : {}),
        ...(Boolean(args['expired_only'] ?? args['expired-only']) ? { expired_only: true } : {}),
        ...(args['older_than_minutes'] != null ? { older_than_minutes: Number(args['older_than_minutes']) } : {}),
        ...(args['agent_id'] ? { agent_id: String(args['agent_id']) } : {}),
        ...(args['workspace'] ? { workspace_path: String(args['workspace']) } : {}),
        ...(args['artifact'] ? { artifact: String(args['artifact']) } : {}),
        ...(rawTargetFiles != null ? { target_file: rawTargetFiles } : {}),
      });
      exitCode = emit({ db_path: dbPath, ...pruneResult }, 0, opts);
      break;
    }
    case 'audit-unverified':  exitCode = cmdAuditUnverified(db, args, dbPath, opts); break;
    case 'verify':             exitCode = cmdVerify(db, args, dbPath, opts); break;
    case 'session-capture': exitCode = emit({
      db_path: dbPath,
      ...sessionCapture(db, {
        agent_id: resolveAgentId(args),
        workspace_path: args['workspace'],
        artifact: args['artifact'],
        repo: args['repo'],
        ref: args['ref'],
        reason: args['reason'],
        cwd: args['cwd'],
      }),
    }, 0, opts); break;
    case 'mine-weakness': {
      const mwParams = {
        agentId:       args['agent_id'] as string | undefined,
        workspacePath: args['workspace'] as string | undefined,
        artifact:      args['artifact'] as string | undefined,
        minCount:      args['min_count'] ? Number(args['min_count']) : undefined,
        limit:         args['limit']     ? Number(args['limit'])     : undefined,
        cwd:           args['cwd']       as string | undefined,
      };
      exitCode = emit({ db_path: dbPath, ...mineWeakness(db, mwParams) }, 0, opts);
      break;
    }
    case 'doc-staleness': exitCode = cmdDocStaleness(db, args, dbPath, opts); break;
    case 'docs-catalog': exitCode = cmdDocsCatalog(args, opts); break;
    case 'digest': {
      const retDays = args['retention_days'] ? Number(args['retention_days']) : undefined;
      const handoffDays = args['refinement_handoff_retention_days'] ? Number(args['refinement_handoff_retention_days']) : undefined;
      const signalDays = args['handoff_signal_retention_days'] ? Number(args['handoff_signal_retention_days']) : undefined;
      const doneDays = args['refinement_done_retention_days'] ? Number(args['refinement_done_retention_days']) : undefined;
      const operationalDays = args['operational_retention_days'] ? Number(args['operational_retention_days']) : undefined;
      const pressureAgeDays = args['pressure_age_days'] ? Number(args['pressure_age_days']) : 1;
      const isDryRun = Boolean(args['dry_run'] ?? args['dry-run']);
      const digestResult = digest(db, {
        ...(retDays !== undefined ? { retention_days: retDays } : {}),
        ...(handoffDays !== undefined ? { refinement_handoff_retention_days: handoffDays } : {}),
        ...(signalDays !== undefined ? { handoff_signal_retention_days: signalDays } : {}),
        ...(doneDays !== undefined ? { refinement_done_retention_days: doneDays } : {}),
        ...(operationalDays !== undefined ? { operational_retention_days: operationalDays } : {}),
        pressure_age_days: pressureAgeDays,
        ...(args['fail_stale_active_runs'] !== undefined ? { fail_stale_active_runs: flagBool(args['fail_stale_active_runs']) } : {}),
        ...(args['workspace'] ? { workspace_path: String(args['workspace']) } : {}),
        ...(args['artifact'] ? { artifact: String(args['artifact']) } : {}),
        ...(isDryRun ? { dry_run: true } : {}),
      });
      const payload: Record<string, unknown> = { db_path: dbPath, ...digestResult };
      if (!isDryRun && (args['export_doc'] ?? args['export-doc'])) {
        try {
          const wsPath = (args['workspace'] as string | undefined) ?? process.cwd();
          const artifact = args['artifact'] as string | undefined;
          const { mkdirSync, writeFileSync } = await import('node:fs');
          const { join } = await import('node:path');
          const docDir = join(wsPath, '.octocode', 'memory-reports');
          mkdirSync(docDir, { recursive: true });
          const dateStr = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
          const docPath = (typeof (args['export_doc'] ?? args['export-doc']) === 'string'
            ? args['export_doc'] ?? args['export-doc']
            : join(docDir, `memory-report-${dateStr}.md`)) as string;
          writeFileSync(docPath, exportMemoryDoc(db, { workspace_path: wsPath, artifact }), 'utf8');
          payload['doc_path'] = docPath;
        } catch (err) {
          payload['doc_warning'] = `Could not write doc: ${(err as Error).message}`;
        }
      }
      exitCode = emit(payload, 0, opts);
      break;
    }
    case 'work-command':    exitCode = cmdWork(db, args, dbPath, opts); break;
    case 'forget':          exitCode = cmdForget(db, args, dbPath, opts); break;
    case 'memory-archive':  exitCode = cmdMemoryLifecycle(db, args, dbPath, opts, 'archive'); break;
    case 'memory-restore':  exitCode = cmdMemoryLifecycle(db, args, dbPath, opts, 'restore'); break;
    case 'refine-delete':   exitCode = cmdRefineDelete(db, args, dbPath, opts); break;
    case 'export-harness':  exitCode = cmdExportHarness(db, args, dbPath, opts); break;
    case 'developer-review': exitCode = cmdDeveloperReview(db, args, dbPath, opts); break;
    case 'query':           exitCode = cmdQuery(db, args, dbPath, opts); break;
    case 'attend':          exitCode = cmdAttend(db, args, dbPath, opts); break;
    case 'agent-registry':  exitCode = cmdAgentRegistry(db, args, dbPath, opts); break;
    case 'agent-signal': {
      const signalFormat = String(args['format'] ?? 'json');
      if (args['action'] === 'list' && signalFormat === 'hook') {
        const signalBriefing = notifyGet(db, {
          workspace_path: args['workspace'] as string | undefined,
          artifact: args['artifact'] as string | undefined,
          format: signalFormat,
          agent_id: args['agent_id'] as string | undefined,
        }) as unknown as Record<string, unknown>;
        exitCode = signalBriefing['additionalContext']
          ? emit({ additionalContext: signalBriefing['additionalContext'] }, 0, opts)
          : emit({ db_path: dbPath, ...signalBriefing }, 0, opts);
      } else {
        exitCode = cmdAgentSignal(db, args, dbPath, opts);
      }
      break;
    }
    case 'notify-prune':    exitCode = cmdNotifyPrune(db, args, dbPath, opts); break;
    default:
      exitCode = emit({ error: `unknown command: ${command}. Run --help for usage.` }, 1, opts);
  }
  return exitCode;
}
