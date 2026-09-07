import { consolidateDatabase } from '../src/db-consolidation.js';
import { parseArgs } from './cli-model.js';

/** Conversion never opens the source through the mutable runtime initializer. */
export function runDatabaseCommand(argv: string[]): number {
  const [action, ...rest] = argv;
  if (action === 'consolidate' && rest.includes('--help')) {
    process.stdout.write('Usage: octocode-awareness database consolidate --source <existing-file> --destination <new-file> [--dry-run] [--compact]\nschema: database_consolidate\nexample: octocode-awareness database consolidate --source current.sqlite3 --destination new.sqlite3 --dry-run\nCopies an exact current canonical database into a new file. The source is read-only. --dry-run validates a private copy and discards it without publishing the destination.\n');
    return 0;
  }
  const args = parseArgs(rest);
  const compact = args['compact'] === true;
  const print = (value: unknown) => process.stdout.write(JSON.stringify(value, null, compact ? 0 : 2) + '\n');
  try {
    if (action !== 'consolidate') throw new Error('database action must be consolidate');
    const allowed = new Set(['source', 'destination', 'dry_run', 'compact', '_']);
    for (const key of Object.keys(args)) {
      if (!allowed.has(key)) throw new Error(`unknown flag: --${key.replaceAll('_', '-')}`);
    }
    if (args._.length) throw new Error('database consolidate accepts flags only');
    const required = (key: string) => {
      const value = args[key];
      if (typeof value !== 'string' || !value.trim()) throw new Error(`--${key.replaceAll('_', '-')} requires a value`);
      return value;
    };
    const source = required('source');
    const destination = required('destination');
    if (args['dry_run'] !== undefined && typeof args['dry_run'] !== 'boolean') throw new Error('--dry-run does not accept a value');
    print({ ok: true, ...consolidateDatabase(source, destination, { dryRun: args['dry_run'] === true }) });
    return 0;
  } catch (error) {
    print({ ok: false, error_code: 'DATABASE_CONSOLIDATION_ERROR', error: error instanceof Error ? error.message : String(error) });
    return 1;
  }
}
