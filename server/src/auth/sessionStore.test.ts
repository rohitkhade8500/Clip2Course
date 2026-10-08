import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openTestDb, type Db } from '../db/index.ts'
import {
  createSessionStore,
  generateSessionToken,
  hashSessionToken,
  type SessionStore,
} from './sessionStore.ts'

const DAY_MS = 24 * 60 * 60 * 1000
const USER_ID = 'user-1'

let db: Db
let clockMs: number
let store: SessionStore

/** Moves the injected clock forward; nothing else observes real time. */
function advance(ms: number): void {
  clockMs += ms
}

function rowCount(): number {
  return db.sessions.countForUser(USER_ID)
}

beforeEach(() => {
  db = openTestDb()
  db.users.insert({
    id: USER_ID,
    email: 'ada@example.com',
    passwordHash: '$argon2id$fake',
    displayName: 'Ada',
    createdAt: new Date(0).toISOString(),
  })

  clockMs = Date.UTC(2025, 0, 1)
  store = createSessionStore({ db, now: () => new Date(clockMs) })
})

afterEach(() => {
  db.close()
})

describe('issue', () => {
  it('persists only the token hash and both expiry bounds', async () => {
    const { token, record } = await store.issue(USER_ID)

    expect(record.tokenHash).toBe(hashSessionToken(token))
    expect(record.id).not.toBe(token)
    expect(record.absoluteExpiresAt.getTime()).toBe(clockMs + 30 * DAY_MS)
    expect(record.idleExpiresAt.getTime()).toBe(clockMs + 7 * DAY_MS)

    const stored = db.sessions.findByTokenHash(record.tokenHash)
    expect(stored?.userId).toBe(USER_ID)
    // The raw token appears nowhere in the row.
    expect(JSON.stringify(stored)).not.toContain(token)
  })

  it('produces a distinct token and id for every session', async () => {
    const issued = await Promise.all([
      store.issue(USER_ID),
      store.issue(USER_ID),
      store.issue(USER_ID),
    ])

    expect(new Set(issued.map((s) => s.token)).size).toBe(3)
    expect(new Set(issued.map((s) => s.record.id)).size).toBe(3)
    expect(rowCount()).toBe(3)
  })
})

describe('verify', () => {
  it('returns the session while both bounds hold', async () => {
    const { token, record } = await store.issue(USER_ID)

    advance(6 * DAY_MS)
    const verified = await store.verify(token)

    expect(verified?.id).toBe(record.id)
    expect(verified?.userId).toBe(USER_ID)
  })

  it('returns null for an unknown or missing token', async () => {
    await store.issue(USER_ID)

    expect(await store.verify(generateSessionToken())).toBeNull()
    expect(await store.verify(undefined)).toBeNull()
    expect(await store.verify('')).toBeNull()
  })

  it('rejects and deletes a session past the idle bound', async () => {
    const { token } = await store.issue(USER_ID)

    advance(7 * DAY_MS)

    expect(await store.verify(token)).toBeNull()
    expect(rowCount()).toBe(0)
  })

  it('rejects and deletes a session past the absolute bound even when recently used', async () => {
    const { token, record } = await store.issue(USER_ID)

    // Keep the idle window alive up to day 29, then cross day 30.
    for (let day = 0; day < 29; day++) {
      advance(DAY_MS)
      await store.touch(record.id)
    }
    expect(await store.verify(token)).not.toBeNull()

    advance(2 * DAY_MS)

    expect(await store.verify(token)).toBeNull()
    expect(rowCount()).toBe(0)
  })
})

describe('touch', () => {
  it('extends the idle window and leaves the absolute expiry alone', async () => {
    const { token, record } = await store.issue(USER_ID)

    advance(5 * DAY_MS)
    await store.touch(record.id)

    const verified = await store.verify(token)
    expect(verified?.idleExpiresAt.getTime()).toBe(clockMs + 7 * DAY_MS)
    expect(verified?.absoluteExpiresAt.getTime()).toBe(
      record.absoluteExpiresAt.getTime(),
    )
  })

  it('keeps a continuously used session alive beyond the idle TTL', async () => {
    const { token, record } = await store.issue(USER_ID)

    for (let day = 0; day < 20; day++) {
      advance(DAY_MS)
      await store.touch(record.id)
    }

    expect(await store.verify(token)).not.toBeNull()
  })
})

describe('revocation', () => {
  it('makes a revoked token fail verification', async () => {
    const { token } = await store.issue(USER_ID)

    await store.revoke(token)

    expect(await store.verify(token)).toBeNull()
    expect(rowCount()).toBe(0)
  })

  it('ignores revoking an absent token', async () => {
    await expect(store.revoke(undefined)).resolves.toBeUndefined()
    await expect(store.revoke(generateSessionToken())).resolves.toBeUndefined()
  })

  it('revokes every session for a user', async () => {
    const first = await store.issue(USER_ID)
    const second = await store.issue(USER_ID)

    expect(await store.revokeAllForUser(USER_ID)).toBe(2)
    expect(await store.verify(first.token)).toBeNull()
    expect(await store.verify(second.token)).toBeNull()
  })
})

describe('deleteExpired', () => {
  it('removes only sessions past a bound', async () => {
    const stale = await store.issue(USER_ID)

    advance(8 * DAY_MS)
    const fresh = await store.issue(USER_ID)

    expect(await store.deleteExpired()).toBe(1)
    expect(db.sessions.findByTokenHash(stale.record.tokenHash)).toBeNull()
    expect(await store.verify(fresh.token)).not.toBeNull()
  })
})
