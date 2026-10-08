/**
 * User repository.
 *
 * Owns every read and write of user rows on behalf of the services above it, so
 * no route handler or service touches SQL. The database layer speaks ISO-8601
 * strings; this boundary converts them to `Date` so callers work with real
 * temporal values (design: Component 1).
 *
 * Normalization lives here as well: an email is stored trimmed and lowercased
 * (Requirements 1.5, 1.6), and a missing display name falls back to the local
 * part of the address (Requirement 1.1).
 */

import { randomUUID } from 'node:crypto'
import { getDb, type Db, type UserRow } from '../db/index.ts'

export interface UserRecord {
  id: string
  /** Stored lowercased and trimmed. */
  email: string
  passwordHash: string
  displayName: string
  createdAt: Date
}

export interface CreateUserInput {
  email: string
  passwordHash: string
  /** Blank or omitted falls back to the email's local part. */
  displayName?: string
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>
  findById(id: string): Promise<UserRecord | null>
  create(input: CreateUserInput): Promise<UserRecord>
}

/**
 * Trim + lowercase, matching `normalizeEmail` in the auth layer. Duplicated
 * deliberately: the repository must not depend on validation to hold its own
 * storage invariant.
 */
function normalize(email: string): string {
  return email.trim().toLowerCase()
}

/** Local part of an address, or the whole string when there is no `@`. */
export function defaultDisplayName(email: string): string {
  const normalized = normalize(email)
  const at = normalized.indexOf('@')
  return at > 0 ? normalized.slice(0, at) : normalized
}

function toRecord(row: UserRow | null): UserRecord | null {
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    displayName: row.displayName,
    createdAt: new Date(row.createdAt),
  }
}

/**
 * Builds a repository over the given connection. Tests pass `openTestDb()`;
 * production callers use `userRepository`.
 */
export function createUserRepository(db: Db): UserRepository {
  return {
    async findByEmail(email) {
      const normalized = normalize(email)
      if (!normalized) return null
      return toRecord(db.users.findByEmail(normalized))
    },

    async findById(id) {
      if (!id) return null
      return toRecord(db.users.findById(id))
    },

    async create(input) {
      const email = normalize(input.email)
      const row: UserRow = {
        id: randomUUID(),
        email,
        passwordHash: input.passwordHash,
        displayName: input.displayName?.trim() || defaultDisplayName(email),
        createdAt: new Date().toISOString(),
      }

      // The unique index on LOWER(email) is the real guard against duplicates;
      // a racing insert surfaces as a throw rather than a second account.
      db.users.insert(row)

      return toRecord(row) as UserRecord
    },
  }
}

/** Lazily bound to the process-wide database. */
export const userRepository: UserRepository = {
  findByEmail: (email) => createUserRepository(getDb()).findByEmail(email),
  findById: (id) => createUserRepository(getDb()).findById(id),
  create: (input) => createUserRepository(getDb()).create(input),
}
