/**
 * Session Migration Utility
 *
 * Migrates sessions from the legacy JSON file storage to the new SQLite database.
 * This is a one-way migration - messages are not preserved from JSON since they
 * were never stored in the legacy format.
 */

import { getSessionManager } from './session-manager.js';
import { getSessionStore } from './session-store.js';
import { closeDatabase } from '../db/index.js';

export interface MigrationResult {
  /** Number of sessions successfully migrated */
  migrated: number;
  /** Number of sessions that failed to migrate */
  failed: number;
  /** Number of sessions skipped (already exist) */
  skipped: number;
  /** Error messages for failed migrations */
  errors: string[];
}

/**
 * Migrate all sessions from JSON storage to SQLite
 */
export async function migrateJsonToSqlite(): Promise<MigrationResult> {
  const jsonManager = getSessionManager();
  const sqliteStore = getSessionStore();

  const result: MigrationResult = {
    migrated: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  try {
    // Get all legacy sessions
    const legacySessions = await jsonManager.listSessions();

    if (legacySessions.length === 0) {
      return result;
    }

    for (const legacy of legacySessions) {
      try {
        // Check if session already exists in SQLite
        const existing = await sqliteStore.getSession(legacy.id);
        if (existing) {
          result.skipped++;
          continue;
        }

        // Create session in SQLite store
        const session = await sqliteStore.createSession({
          prompt: legacy.prompt,
          mode: legacy.mode,
          cwd: legacy.cwd,
          provider: legacy.provider,
        });

        // Update with legacy metadata
        await sqliteStore.updateSession(session.id, {
          status: legacy.status,
          transcriptPath: legacy.transcriptPath,
        });

        // If legacy has token data, update it
        if (legacy.totalTokens !== undefined) {
          await sqliteStore.completeSession(session.id, {
            totalInputTokens: legacy.totalTokens,
          });
        }

        result.migrated++;
      } catch (error) {
        result.failed++;
        result.errors.push(
          `Session ${legacy.id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return result;
  } catch (error) {
    result.errors.push(
      `Migration failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return result;
  }
}

/**
 * Run migration and optionally clean up legacy files
 */
export async function runMigration(
  options: {
    cleanup?: boolean;
    verbose?: boolean;
  } = {}
): Promise<MigrationResult> {
  const { cleanup = false, verbose = false } = options;

  if (verbose) {
    console.log('Starting migration from JSON to SQLite...');
  }

  const result = await migrateJsonToSqlite();

  if (verbose) {
    console.log(`\nMigration complete:`);
    console.log(`  Migrated: ${result.migrated}`);
    console.log(`  Skipped:  ${result.skipped}`);
    console.log(`  Failed:   ${result.failed}`);

    if (result.errors.length > 0) {
      console.log('\nErrors:');
      for (const error of result.errors) {
        console.log(`  - ${error}`);
      }
    }
  }

  // Clean up legacy JSON files if requested
  if (cleanup && result.migrated > 0 && result.failed === 0) {
    const jsonManager = getSessionManager();
    const deleted = await jsonManager.clearAllSessions();
    if (verbose) {
      console.log(`\nCleaned up ${deleted} legacy JSON files.`);
    }
  }

  // Close database connection
  closeDatabase();

  return result;
}

/**
 * Check if migration is needed
 */
export async function needsMigration(): Promise<boolean> {
  const jsonManager = getSessionManager();
  const legacySessions = await jsonManager.listSessions();
  return legacySessions.length > 0;
}
