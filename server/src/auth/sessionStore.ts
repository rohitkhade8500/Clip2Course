/**
 * SessionStore (design.md, Component 2).
 *
 * Sessions are opaque 256-bit random tokens. Only the SHA-256 hash of a token
 * is persisted, so a leaked database hands an attacker hashes rather than
 * usable sessions. The raw token exists exactly once, in the return value of
 * `issue()`, on its way into the session cookie.
 *
 * Two independent bounds govern a session (Requirement 2.4):
 *   - `absoluteExpiresAt` — createdAt + 30 days, never extended
 *   - `idleExpiresAt`     — last seen + 7 days, extended by `touch()`
 *
 * `verify()` enforces both and deletes rows it finds expired, which is also
 * what keeps revoked tokens unusable: revocation deletes the row, so there is
 * nothing left to find.
 *
 * The clock is injectable so expiry can be tested without waiting 30 days.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto'
import {
  SESSION_ABSOLUTE_TTL_MS,
  SESSION_IDLE_TTL_MS,
  SESSION_TOKEN_BYTES,
} from '../config.ts'
import { getDb, type Db, type SessionRow } from '../db/index.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionRecord {
  /** Session id (uuid). Distinct from the token, and safe to log. */
  id: string
  userId: string
  /** SHA-256 of the raw token, hex encoded. */
  tokenHash: string
  createdAt: Date
  /** createdAt + absolute TTL. Never moves. */
  absoluteExpiresAt: Date
  /** Last seen + idle TTL. Moved forward by `touch()`. */
  idleExpiresAt: Date
}

export interface IssuedSession {
  /** The raw token. Never persisted — hand it to the cookie and forget it. */
  token: string
  record: SessionRecord
}

export interface SessionStore {
  issue(userId: string): Promise<IssuedSession>
  verify(token: string | undefined | null): Promise<SessionRecord | null>
  touch(sessionId: string): Promise<void>
  revoke(token: string | undefined | null): Promise<void>
  revokeAllForUser(userId: string): Promise<number>
  deleteExpired(): Promise<number>
}

/** Returns the current time. Injected so tests can move time at will. */
export type Clock = () => Date

export interface SessionStoreOptions {
  /** Defaults to the process-wide database. */
  db?: Db
  /** Defaults to `() => new Date()`. */
  now?: Clock
  absoluteTtlMs?: number
  idleTtlMs?: number
  tokenBytes?: number
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

/** SHA-256, hex encoded. The only form of a token that reaches storage. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** A URL-safe token with `bytes` bytes of entropy from the CSPRNG. */
export function generateSessionToken(bytes = SESSION_TOKEN_BYTES): string {
  return randomBytes(bytes).toString('base64url')
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function toRecord(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    createdAt: new Date(row.createdAt),
    absoluteExpiresAt: new Date(row.absoluteExpiresAt),
    idleExpiresAt: new Date(row.idleExpiresAt),
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export function createSessionStore(options: SessionStoreOptions = {}): SessionStore {
  const now = options.now ?? (() => new Date())
  const absoluteTtlMs = options.absoluteTtlMs ?? SESSION_ABSOLUTE_TTL_MS
  const idleTtlMs = options.idleTtlMs ?? SESSION_IDLE_TTL_MS
  const tokenBytes = options.tokenBytes ?? SESSION_TOKEN_BYTES

  // Resolved lazily: constructing a store must not force a database open,
  // which is what lets tests inject an in-memory Db.
  const database = (): Db => options.db ?? getDb()

  return {
    async issue(userId) {
      const token = generateSessionToken(tokenBytes)
      const createdAt = now()
      const createdMs = createdAt.getTime()

      const row: SessionRow = {
        id: randomUUID(),
        userId,
        tokenHash: hashSessionToken(token),
        createdAt: createdAt.toISOString(),
        absoluteExpiresAt: new Date(createdMs + absoluteTtlMs).toISOString(),
        idleExpiresAt: new Date(createdMs + idleTtlMs).toISOString(),
      }

      database().sessions.insert(row)

      return { token, record: toRecord(row) }
    },

    async verify(token) {
      if (!token) return null

      const db = database()
      const row = db.sessions.findByTokenHash(hashSessionToken(token))
      if (!row) return null

      const record = toRecord(row)
      const current = now().getTime()

      // Requirement 2.6: past either bound the session is dead. Deleting on
      // sight means an expired row can never be resurrected by a later touch.
      if (
        current >= record.absoluteExpiresAt.getTime() ||
        current >= record.idleExpiresAt.getTime()
      ) {
        db.sessions.deleteById(record.id)
        return null
      }

      return record
    },

    async touch(sessionId) {
      // Requirement 2.5: the idle window slides, the absolute expiry does not.
      const idleExpiresAt = new Date(now().getTime() + idleTtlMs).toISOString()
      database().sessions.touchIdleExpiry(sessionId, idleExpiresAt)
    },

    async revoke(token) {
      if (!token) return
      // Requirement 3.1/3.2: the row is gone, so the cookie the client keeps
      // holding verifies against nothing.
      database().sessions.deleteByTokenHash(hashSessionToken(token))
    },

    async revokeAllForUser(userId) {
      return database().sessions.deleteAllForUser(userId)
    },

    async deleteExpired() {
      return database().sessions.deleteExpired(now().toISOString())
    },
  }
}

// ---------------------------------------------------------------------------
// Process-wide instance
// ---------------------------------------------------------------------------

let instance: SessionStore | null = null

/** The store used by route code, bound to the process-wide database. */
export function getSessionStore(): SessionStore {
  instance ??= createSessionStore()
  return instance
}
