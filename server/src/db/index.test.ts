import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION, migrate, openTestDb, type Db } from './index.ts'

function iso(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString()
}

function seedUser(db: Db, overrides: Partial<Parameters<Db['users']['insert']>[0]> = {}) {
  const row = {
    id: 'user-1',
    email: 'Ada@Example.com',
    passwordHash: '$argon2id$fake',
    displayName: 'Ada',
    createdAt: iso(),
    ...overrides,
  }
  db.users.insert(row)
  return row
}

describe('migrations', () => {
  it('applies the schema at boot and is idempotent', () => {
    const db = openTestDb()
    try {
      expect(db.connection.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)

      const tables = db.connection
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
        .all()
        .map((row) => (row as { name: string }).name)

      expect(tables).toContain('users')
      expect(tables).toContain('sessions')
      expect(tables).toContain('login_attempts')

      // Re-running must not throw or bump the version
      expect(migrate(db.connection)).toBe(SCHEMA_VERSION)
    } finally {
      db.close()
    }
  })

  it('creates the designed indexes', () => {
    const db = openTestDb()
    try {
      const indexes = db.connection
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'index'`)
        .all()
        .map((row) => (row as { name: string }).name)

      expect(indexes).toEqual(
        expect.arrayContaining([
          'idx_users_email',
          'idx_sessions_token',
          'idx_sessions_user',
          'idx_attempts_email_time',
          'idx_attempts_ip_time',
        ]),
      )
    } finally {
      db.close()
    }
  })
})

describe('users', () => {
  it('finds by email case-insensitively and rejects duplicates', () => {
    const db = openTestDb()
    try {
      const user = seedUser(db)

      expect(db.users.findByEmail('ada@example.com')?.id).toBe(user.id)
      expect(db.users.findByEmail('  ADA@EXAMPLE.COM  '.trim())?.id).toBe(user.id)
      expect(db.users.findById(user.id)?.displayName).toBe('Ada')
      expect(db.users.findByEmail('nobody@example.com')).toBeNull()

      expect(() => seedUser(db, { id: 'user-2', email: 'ADA@example.com' })).toThrow()
    } finally {
      db.close()
    }
  })
})

describe('sessions', () => {
  it('supports the full lifecycle and cascades with the user', () => {
    const db = openTestDb()
    try {
      const user = seedUser(db)
      db.sessions.insert({
        id: 'session-1',
        userId: user.id,
        tokenHash: 'hash-1',
        createdAt: iso(),
        absoluteExpiresAt: iso(30 * 86_400_000),
        idleExpiresAt: iso(7 * 86_400_000),
      })

      const found = db.sessions.findByTokenHash('hash-1')
      expect(found?.userId).toBe(user.id)

      const extended = iso(8 * 86_400_000)
      db.sessions.touchIdleExpiry('session-1', extended)
      const touched = db.sessions.findByTokenHash('hash-1')
      expect(touched?.idleExpiresAt).toBe(extended)
      expect(touched?.absoluteExpiresAt).toBe(found?.absoluteExpiresAt)

      expect(db.sessions.deleteByTokenHash('hash-1')).toBe(1)
      expect(db.sessions.findByTokenHash('hash-1')).toBeNull()

      db.sessions.insert({
        id: 'session-2',
        userId: user.id,
        tokenHash: 'hash-2',
        createdAt: iso(),
        absoluteExpiresAt: iso(-1000),
        idleExpiresAt: iso(-1000),
      })
      expect(db.sessions.deleteExpired(iso())).toBe(1)

      db.sessions.insert({
        id: 'session-3',
        userId: user.id,
        tokenHash: 'hash-3',
        createdAt: iso(),
        absoluteExpiresAt: iso(30 * 86_400_000),
        idleExpiresAt: iso(7 * 86_400_000),
      })
      expect(db.sessions.countForUser(user.id)).toBe(1)

      db.connection.prepare(`DELETE FROM users WHERE id = ?`).run(user.id)
      expect(db.sessions.countForUser(user.id)).toBe(0)
    } finally {
      db.close()
    }
  })
})

describe('login attempts', () => {
  it('counts within a window, reports the oldest, and prunes', () => {
    const db = openTestDb()
    try {
      const windowStart = iso(-15 * 60_000)

      const firstAttemptAt = iso(-60_000)
      db.loginAttempts.insert({
        email: 'ada@example.com',
        ip: '10.0.0.1',
        kind: 'login',
        succeeded: false,
        attemptedAt: firstAttemptAt,
      })
      db.loginAttempts.insert({
        email: 'ada@example.com',
        ip: '10.0.0.1',
        kind: 'login',
        succeeded: false,
        attemptedAt: iso(-30_000),
      })
      db.loginAttempts.insert({
        email: null,
        ip: '10.0.0.1',
        kind: 'register',
        succeeded: true,
        attemptedAt: iso(-10_000),
      })
      const stale = iso(-2 * 3_600_000)
      db.loginAttempts.insert({
        email: 'ada@example.com',
        ip: '10.0.0.1',
        kind: 'login',
        succeeded: false,
        attemptedAt: stale,
      })

      expect(db.loginAttempts.countForEmail('ada@example.com', 'login', windowStart)).toBe(2)
      expect(db.loginAttempts.countForIp('10.0.0.1', 'login', windowStart)).toBe(2)
      expect(db.loginAttempts.countForIp('10.0.0.1', 'register', windowStart)).toBe(1)
      expect(db.loginAttempts.oldestForEmail('ada@example.com', 'login', windowStart)).toBe(
        firstAttemptAt,
      )
      expect(db.loginAttempts.oldestForIp('10.0.0.1', 'login', windowStart)).toBe(
        firstAttemptAt,
      )
      expect(db.loginAttempts.oldestForEmail('nobody@example.com', 'login', windowStart)).toBeNull()

      expect(db.loginAttempts.pruneOlderThan(iso(-3_600_000))).toBe(1)
      expect(db.loginAttempts.clearForEmail('ada@example.com')).toBe(2)
      expect(db.loginAttempts.countForIp('10.0.0.1', 'register', windowStart)).toBe(1)
    } finally {
      db.close()
    }
  })

  it('has no column that could hold a submitted password', () => {
    const db = openTestDb()
    try {
      const columns = db.connection
        .prepare(`SELECT name FROM pragma_table_info('login_attempts')`)
        .all()
        .map((row) => (row as { name: string }).name)

      expect(columns).toEqual(['id', 'email', 'ip', 'kind', 'succeeded', 'attempted_at'])
    } finally {
      db.close()
    }
  })
})

describe('transactions', () => {
  it('rolls back every statement when the callback throws', () => {
    const db = openTestDb()
    try {
      expect(() =>
        db.transaction(() => {
          seedUser(db, { id: 'user-a', email: 'a@example.com' })
          throw new Error('boom')
        }),
      ).toThrow('boom')

      expect(db.users.findByEmail('a@example.com')).toBeNull()
    } finally {
      db.close()
    }
  })
})
