/**
 * Database layer.
 *
 * Owns the SQLite connection, the schema migrations, and every SQL statement in
 * the server. Route handlers and services talk to the narrow query interface
 * exposed here (`Db.users`, `Db.sessions`, `Db.loginAttempts`) so that swapping
 * SQLite for another engine touches this file only.
 *
 * Timestamps cross this boundary as ISO-8601 strings; converting to `Date` is
 * the caller's job, which keeps the storage format explicit.
 */

import Database from 'better-sqlite3'
import type { Database as SqliteDatabase } from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/** In-memory database identifier understood by SQLite. */
export const MEMORY_DB = ':memory:'

/**
 * Default on-disk location. Config lives in its own module (added separately),
 * so this reads the environment directly with a safe local default.
 */
const DEFAULT_DB_FILE = resolve(process.cwd(), 'data', 'clip2course.sqlite')

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

export interface UserRow {
  id: string
  email: string
  passwordHash: string
  displayName: string
  /** ISO-8601 */
  createdAt: string
}

export interface SessionRow {
  id: string
  userId: string
  tokenHash: string
  /** ISO-8601 */
  createdAt: string
  /** ISO-8601 */
  absoluteExpiresAt: string
  /** ISO-8601 */
  idleExpiresAt: string
}

export type AttemptKind = 'login' | 'register'

export interface LoginAttemptRow {
  id: number
  email: string | null
  ip: string
  kind: AttemptKind
  succeeded: boolean
  /** ISO-8601 */
  attemptedAt: string
}

// ---------------------------------------------------------------------------
// Query interface
// ---------------------------------------------------------------------------

export interface UserQueries {
  /** Inserts a user. Throws on a duplicate email (case-insensitive). */
  insert(row: UserRow): void
  /** Case-insensitive lookup; `email` need not be normalized. */
  findByEmail(email: string): UserRow | null
  findById(id: string): UserRow | null
}

export interface SessionQueries {
  insert(row: SessionRow): void
  findByTokenHash(tokenHash: string): SessionRow | null
  /** Moves the idle window only; the absolute expiry is never touched. */
  touchIdleExpiry(id: string, idleExpiresAt: string): void
  deleteById(id: string): number
  deleteByTokenHash(tokenHash: string): number
  deleteAllForUser(userId: string): number
  /** Deletes every session past either expiry bound at `nowIso`. */
  deleteExpired(nowIso: string): number
  countForUser(userId: string): number
}

export interface LoginAttemptQueries {
  insert(input: {
    email: string | null
    ip: string
    kind: AttemptKind
    succeeded: boolean
    attemptedAt: string
  }): void
  countForEmail(email: string, kind: AttemptKind, sinceIso: string): number
  countForIp(ip: string, kind: AttemptKind, sinceIso: string): number
  /** Oldest attempt in the window, used to derive `Retry-After`. */
  oldestForEmail(email: string, kind: AttemptKind, sinceIso: string): string | null
  oldestForIp(ip: string, kind: AttemptKind, sinceIso: string): string | null
  clearForEmail(email: string): number
  pruneOlderThan(cutoffIso: string): number
}

export interface Db {
  users: UserQueries
  sessions: SessionQueries
  loginAttempts: LoginAttemptQueries
  /** Runs `fn` inside a single transaction, rolling back if it throws. */
  transaction<T>(fn: () => T): T
  close(): void
  /** Escape hatch for migrations and tests. Avoid in service code. */
  readonly connection: SqliteDatabase
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * Ordered migrations. The array index + 1 is the `user_version` a migration
 * leaves behind, so appending a statement is the only way to evolve the schema.
 */
const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );

  -- Case-insensitive uniqueness (Requirement 1.6)
  CREATE UNIQUE INDEX idx_users_email ON users (LOWER(email));

  CREATE TABLE sessions (
    id                  TEXT PRIMARY KEY,
    user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash          TEXT NOT NULL UNIQUE,
    created_at          TEXT NOT NULL,
    absolute_expires_at TEXT NOT NULL,
    idle_expires_at     TEXT NOT NULL
  );

  CREATE INDEX idx_sessions_token ON sessions (token_hash);
  CREATE INDEX idx_sessions_user ON sessions (user_id);

  CREATE TABLE login_attempts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    email        TEXT,
    ip           TEXT NOT NULL,
    kind         TEXT NOT NULL,
    succeeded    INTEGER NOT NULL,
    attempted_at TEXT NOT NULL
  );

  CREATE INDEX idx_attempts_email_time ON login_attempts (email, attempted_at);
  CREATE INDEX idx_attempts_ip_time ON login_attempts (ip, attempted_at);
  `,
]

export const SCHEMA_VERSION = MIGRATIONS.length

/** Applies any migrations the database has not seen yet. */
export function migrate(connection: SqliteDatabase): number {
  const current = connection.pragma('user_version', { simple: true }) as number

  for (let version = current; version < MIGRATIONS.length; version++) {
    const statements = MIGRATIONS[version]
    connection.transaction(() => {
      connection.exec(statements)
      connection.pragma(`user_version = ${version + 1}`)
    })()
  }

  return connection.pragma('user_version', { simple: true }) as number
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

interface RawUser {
  id: string
  email: string
  password_hash: string
  display_name: string
  created_at: string
}

interface RawSession {
  id: string
  user_id: string
  token_hash: string
  created_at: string
  absolute_expires_at: string
  idle_expires_at: string
}

function toUser(row: RawUser | undefined): UserRow | null {
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    displayName: row.display_name,
    createdAt: row.created_at,
  }
}

function toSession(row: RawSession | undefined): SessionRow | null {
  if (!row) return null
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    createdAt: row.created_at,
    absoluteExpiresAt: row.absolute_expires_at,
    idleExpiresAt: row.idle_expires_at,
  }
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

export interface OpenDbOptions {
  /** File path, or `MEMORY_DB` for a throwaway database. */
  file?: string
  /** Logs every statement; off by default. */
  verbose?: boolean
}

/**
 * Opens a connection, applies pending migrations, and returns the query
 * interface. Each call produces an independent connection, which is what makes
 * per-test in-memory databases possible.
 */
export function openDb(options: OpenDbOptions = {}): Db {
  const file = options.file ?? process.env.DATABASE_FILE ?? DEFAULT_DB_FILE
  const isMemory = file === MEMORY_DB || file.startsWith('file::memory:')

  if (!isMemory) {
    mkdirSync(dirname(resolve(file)), { recursive: true })
  }

  const connection = options.verbose
    ? new Database(file, { verbose: (message?: unknown) => console.log(message) })
    : new Database(file)

  // Cascading deletes are how session rows die with their user, so this pragma
  // is load-bearing rather than cosmetic.
  connection.pragma('foreign_keys = ON')
  if (!isMemory) {
    connection.pragma('journal_mode = WAL')
  }

  migrate(connection)

  return createDb(connection)
}

/** Convenience wrapper for tests: a fresh, isolated, migrated database. */
export function openTestDb(): Db {
  return openDb({ file: MEMORY_DB })
}

function createDb(connection: SqliteDatabase): Db {
  const statements = {
    insertUser: connection.prepare(
      `INSERT INTO users (id, email, password_hash, display_name, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ),
    findUserByEmail: connection.prepare(
      `SELECT * FROM users WHERE LOWER(email) = LOWER(?)`,
    ),
    findUserById: connection.prepare(`SELECT * FROM users WHERE id = ?`),

    insertSession: connection.prepare(
      `INSERT INTO sessions
         (id, user_id, token_hash, created_at, absolute_expires_at, idle_expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ),
    findSessionByTokenHash: connection.prepare(
      `SELECT * FROM sessions WHERE token_hash = ?`,
    ),
    touchSession: connection.prepare(
      `UPDATE sessions SET idle_expires_at = ? WHERE id = ?`,
    ),
    deleteSessionById: connection.prepare(`DELETE FROM sessions WHERE id = ?`),
    deleteSessionByTokenHash: connection.prepare(
      `DELETE FROM sessions WHERE token_hash = ?`,
    ),
    deleteSessionsForUser: connection.prepare(
      `DELETE FROM sessions WHERE user_id = ?`,
    ),
    deleteExpiredSessions: connection.prepare(
      `DELETE FROM sessions
       WHERE absolute_expires_at <= ? OR idle_expires_at <= ?`,
    ),
    countSessionsForUser: connection.prepare(
      `SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?`,
    ),

    insertAttempt: connection.prepare(
      `INSERT INTO login_attempts (email, ip, kind, succeeded, attempted_at)
       VALUES (?, ?, ?, ?, ?)`,
    ),
    countAttemptsForEmail: connection.prepare(
      `SELECT COUNT(*) AS n FROM login_attempts
       WHERE email = ? AND kind = ? AND attempted_at >= ?`,
    ),
    countAttemptsForIp: connection.prepare(
      `SELECT COUNT(*) AS n FROM login_attempts
       WHERE ip = ? AND kind = ? AND attempted_at >= ?`,
    ),
    oldestAttemptForEmail: connection.prepare(
      `SELECT MIN(attempted_at) AS oldest FROM login_attempts
       WHERE email = ? AND kind = ? AND attempted_at >= ?`,
    ),
    oldestAttemptForIp: connection.prepare(
      `SELECT MIN(attempted_at) AS oldest FROM login_attempts
       WHERE ip = ? AND kind = ? AND attempted_at >= ?`,
    ),
    clearAttemptsForEmail: connection.prepare(
      `DELETE FROM login_attempts WHERE email = ?`,
    ),
    pruneAttempts: connection.prepare(
      `DELETE FROM login_attempts WHERE attempted_at < ?`,
    ),
  }

  const count = (row: unknown): number => (row as { n: number }).n
  const oldest = (row: unknown): string | null =>
    (row as { oldest: string | null } | undefined)?.oldest ?? null

  const users: UserQueries = {
    insert(row) {
      statements.insertUser.run(
        row.id,
        row.email,
        row.passwordHash,
        row.displayName,
        row.createdAt,
      )
    },
    findByEmail(email) {
      return toUser(statements.findUserByEmail.get(email) as RawUser | undefined)
    },
    findById(id) {
      return toUser(statements.findUserById.get(id) as RawUser | undefined)
    },
  }

  const sessions: SessionQueries = {
    insert(row) {
      statements.insertSession.run(
        row.id,
        row.userId,
        row.tokenHash,
        row.createdAt,
        row.absoluteExpiresAt,
        row.idleExpiresAt,
      )
    },
    findByTokenHash(tokenHash) {
      return toSession(
        statements.findSessionByTokenHash.get(tokenHash) as RawSession | undefined,
      )
    },
    touchIdleExpiry(id, idleExpiresAt) {
      statements.touchSession.run(idleExpiresAt, id)
    },
    deleteById(id) {
      return statements.deleteSessionById.run(id).changes
    },
    deleteByTokenHash(tokenHash) {
      return statements.deleteSessionByTokenHash.run(tokenHash).changes
    },
    deleteAllForUser(userId) {
      return statements.deleteSessionsForUser.run(userId).changes
    },
    deleteExpired(nowIso) {
      return statements.deleteExpiredSessions.run(nowIso, nowIso).changes
    },
    countForUser(userId) {
      return count(statements.countSessionsForUser.get(userId))
    },
  }

  const loginAttempts: LoginAttemptQueries = {
    insert(input) {
      // The submitted password is deliberately absent from this table
      // (Requirement 4.4) — there is no column to put it in.
      statements.insertAttempt.run(
        input.email,
        input.ip,
        input.kind,
        input.succeeded ? 1 : 0,
        input.attemptedAt,
      )
    },
    countForEmail(email, kind, sinceIso) {
      return count(statements.countAttemptsForEmail.get(email, kind, sinceIso))
    },
    countForIp(ip, kind, sinceIso) {
      return count(statements.countAttemptsForIp.get(ip, kind, sinceIso))
    },
    oldestForEmail(email, kind, sinceIso) {
      return oldest(statements.oldestAttemptForEmail.get(email, kind, sinceIso))
    },
    oldestForIp(ip, kind, sinceIso) {
      return oldest(statements.oldestAttemptForIp.get(ip, kind, sinceIso))
    },
    clearForEmail(email) {
      return statements.clearAttemptsForEmail.run(email).changes
    },
    pruneOlderThan(cutoffIso) {
      return statements.pruneAttempts.run(cutoffIso).changes
    },
  }

  return {
    users,
    sessions,
    loginAttempts,
    transaction<T>(fn: () => T): T {
      return connection.transaction(fn)()
    },
    close() {
      connection.close()
    },
    connection,
  }
}

// ---------------------------------------------------------------------------
// Process-wide instance
// ---------------------------------------------------------------------------

let instance: Db | null = null

/**
 * Returns the process-wide database, opening and migrating it on first use.
 * Tests should call `openTestDb()` instead of touching this.
 */
export function getDb(): Db {
  instance ??= openDb()
  return instance
}

/** Closes the process-wide database, if one was opened. */
export function closeDb(): void {
  instance?.close()
  instance = null
}
