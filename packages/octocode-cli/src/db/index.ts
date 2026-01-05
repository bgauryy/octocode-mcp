/**
 * Database Connection Module
 *
 * Provides a singleton SQLite database connection with optimal settings
 * for CLI usage. Uses WAL mode for better concurrency and performance.
 */

import Database from 'better-sqlite3';
import {
  drizzle,
  type BetterSQLite3Database,
} from 'drizzle-orm/better-sqlite3';
import { sql } from 'drizzle-orm';
import { join } from 'node:path';
import { mkdirSync, existsSync, statSync } from 'node:fs';
import * as schema from './schema.js';
import { HOME } from '../utils/platform.js';

// ============================================
// Constants
// ============================================

const DB_DIR = join(HOME, '.octocode');
const DB_PATH = join(DB_DIR, 'sessions.db');

// ============================================
// Database Singleton
// ============================================

let dbInstance: BetterSQLite3Database<typeof schema> | null = null;
let sqliteInstance: Database.Database | null = null;

/**
 * Initialize the database schema
 * Creates tables if they don't exist
 */
function initializeSchema(db: BetterSQLite3Database<typeof schema>): void {
  // Create sessions table
  db.run(sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      title TEXT,
      prompt TEXT NOT NULL,
      prompt_preview TEXT,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      cwd TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      total_input_tokens INTEGER,
      total_output_tokens INTEGER,
      message_count INTEGER DEFAULT 0,
      sdk_session_id TEXT,
      transcript_path TEXT
    )
  `);

  // Create messages table
  db.run(sql`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      token_count INTEGER,
      turn_index INTEGER NOT NULL,
      message_index INTEGER NOT NULL,
      tool_call_id TEXT,
      parent_message_id TEXT
    )
  `);

  // Create tool_calls table
  db.run(sql`
    CREATE TABLE IF NOT EXISTS tool_calls (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      args TEXT,
      result TEXT,
      status TEXT NOT NULL,
      started_at INTEGER,
      completed_at INTEGER,
      duration_ms INTEGER
    )
  `);

  // Create indexes for better query performance
  db.run(
    sql`CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)`
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS idx_messages_turn_order ON messages(session_id, turn_index, message_index)`
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS idx_tool_calls_session_id ON tool_calls(session_id)`
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS idx_tool_calls_message_id ON tool_calls(message_id)`
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at)`
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)`
  );
}

/**
 * Get the singleton database instance
 * Creates the database and applies schema if it doesn't exist
 */
export function getDatabase(): BetterSQLite3Database<typeof schema> {
  if (dbInstance) {
    return dbInstance;
  }

  // Ensure directory exists with proper permissions
  if (!existsSync(DB_DIR)) {
    mkdirSync(DB_DIR, { recursive: true, mode: 0o700 });
  }

  // Create SQLite connection
  sqliteInstance = new Database(DB_PATH);

  // Performance optimizations for CLI usage
  sqliteInstance.pragma('journal_mode = WAL'); // Better concurrency
  sqliteInstance.pragma('synchronous = NORMAL'); // Good balance of safety/speed
  sqliteInstance.pragma('cache_size = 10000'); // ~40MB cache
  sqliteInstance.pragma('temp_store = MEMORY'); // Temp tables in memory
  sqliteInstance.pragma('mmap_size = 268435456'); // 256MB memory-mapped I/O
  sqliteInstance.pragma('foreign_keys = ON'); // Enable foreign key constraints

  // Create drizzle instance with schema
  dbInstance = drizzle(sqliteInstance, { schema });

  // Initialize schema (create tables if needed)
  initializeSchema(dbInstance);

  return dbInstance;
}

/**
 * Close the database connection
 * Should be called on process exit for clean shutdown
 */
export function closeDatabase(): void {
  if (sqliteInstance) {
    sqliteInstance.close();
    sqliteInstance = null;
    dbInstance = null;
  }
}

/**
 * Get the database file path
 */
export function getDatabasePath(): string {
  return DB_PATH;
}

/**
 * Get the database directory path
 */
export function getDatabaseDir(): string {
  return DB_DIR;
}

/**
 * Check if the database file exists
 */
export function databaseExists(): boolean {
  return existsSync(DB_PATH);
}

/**
 * Get database statistics
 */
export function getDatabaseStats(): {
  path: string;
  exists: boolean;
  sizeBytes?: number;
} {
  const stats = {
    path: DB_PATH,
    exists: existsSync(DB_PATH),
    sizeBytes: undefined as number | undefined,
  };

  if (stats.exists) {
    try {
      stats.sizeBytes = statSync(DB_PATH).size;
    } catch {
      // Ignore stat errors
    }
  }

  return stats;
}

// Re-export schema types and tables
export * from './schema.js';
