import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RATE_LIMITS, RATE_LIMIT_MAX_WINDOW_MS } from '../config.ts'
import { openTestDb, type Db } from '../db/index.ts'
import { createRateLimiter, type RateLimiter } from './rateLimiter.ts'

const START = Date.parse('2025-01-01T00:00:00.000Z')

let db: Db
let limiter: RateLimiter
let clockMs: number

function advance(ms: number): void {
  clockMs += ms
}

beforeEach(() => {
  db = openTestDb()
  clockMs = START
  limiter = createRateLimiter(db, { clock: () => new Date(clockMs) })
})

afterEach(() => {
  limiter.stop()
  db.close()
})

async function failLogin(times: number, email = 'ada@example.com', ip = '10.0.0.1') {
  for (let i = 0; i < times; i++) {
    await limiter.recordFailure(email, ip)
  }
}

describe('checkLogin', () => {
  it('allows attempts up to the per-email limit and denies the next one', async () => {
    const max = RATE_LIMITS.loginPerEmail.max

    await failLogin(max - 1)
    expect(await limiter.checkLogin('ada@example.com', '10.0.0.1')).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    })

    await failLogin(1)
    const denied = await limiter.checkLogin('ada@example.com', '10.0.0.1')
    expect(denied.allowed).toBe(false)
    expect(denied.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('stays denied for every further attempt inside the window', async () => {
    await failLogin(RATE_LIMITS.loginPerEmail.max)

    for (let i = 0; i < 5; i++) {
      advance(60_000)
      await failLogin(1)
      expect((await limiter.checkLogin('ada@example.com', '10.0.0.1')).allowed).toBe(false)
    }
  })

  it('allows again once the window has rolled past the oldest attempt', async () => {
    await failLogin(RATE_LIMITS.loginPerEmail.max)
    expect((await limiter.checkLogin('ada@example.com', '10.0.0.1')).allowed).toBe(false)

    advance(RATE_LIMITS.loginPerEmail.windowMs + 1)
    expect(await limiter.checkLogin('ada@example.com', '10.0.0.1')).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    })
  })

  it('derives retryAfterSeconds from the oldest attempt in the window', async () => {
    await failLogin(RATE_LIMITS.loginPerEmail.max)
    advance(5 * 60_000) // 5 minutes into a 15-minute window

    const denied = await limiter.checkLogin('ada@example.com', '10.0.0.1')
    expect(denied.retryAfterSeconds).toBe(10 * 60)
  })

  it('treats email addresses case-insensitively', async () => {
    await failLogin(RATE_LIMITS.loginPerEmail.max, 'Ada@Example.COM')

    expect((await limiter.checkLogin('ada@example.com', '10.0.0.1')).allowed).toBe(false)
  })

  it('denies by IP even when each email is below its own limit', async () => {
    const perIp = RATE_LIMITS.loginPerIp.max

    for (let i = 0; i < perIp; i++) {
      await limiter.recordFailure(`user${i}@example.com`, '10.0.0.9')
    }

    // A fresh email, but the shared IP window is full.
    const denied = await limiter.checkLogin('fresh@example.com', '10.0.0.9')
    expect(denied.allowed).toBe(false)
    expect(denied.retryAfterSeconds).toBeGreaterThan(0)

    // A different IP is unaffected.
    expect((await limiter.checkLogin('fresh@example.com', '10.0.0.10')).allowed).toBe(true)
  })
})

describe('clearFor', () => {
  it('resets the counter after a successful login', async () => {
    await failLogin(RATE_LIMITS.loginPerEmail.max)
    expect((await limiter.checkLogin('ada@example.com', '10.0.0.1')).allowed).toBe(false)

    await limiter.clearFor('Ada@Example.com')

    expect(await limiter.checkLogin('ada@example.com', '10.0.0.1')).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    })
  })
})

describe('checkRegistration', () => {
  it('allows the configured number of registrations per IP then denies', async () => {
    const max = RATE_LIMITS.registerPerIp.max

    for (let i = 0; i < max; i++) {
      expect(await limiter.checkRegistration('10.0.0.2')).toEqual({
        allowed: true,
        retryAfterSeconds: 0,
      })
      advance(1000)
    }

    const denied = await limiter.checkRegistration('10.0.0.2')
    expect(denied.allowed).toBe(false)
    expect(denied.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('does not consume quota from another IP', async () => {
    for (let i = 0; i < RATE_LIMITS.registerPerIp.max; i++) {
      await limiter.checkRegistration('10.0.0.2')
    }

    expect((await limiter.checkRegistration('10.0.0.3')).allowed).toBe(true)
  })

  it('allows again after the hourly window passes', async () => {
    for (let i = 0; i < RATE_LIMITS.registerPerIp.max; i++) {
      await limiter.checkRegistration('10.0.0.2')
    }
    expect((await limiter.checkRegistration('10.0.0.2')).allowed).toBe(false)

    advance(RATE_LIMITS.registerPerIp.windowMs + 1)
    expect((await limiter.checkRegistration('10.0.0.2')).allowed).toBe(true)
  })

  it('keeps login and registration counters separate', async () => {
    await failLogin(RATE_LIMITS.loginPerEmail.max)

    expect((await limiter.checkRegistration('10.0.0.1')).allowed).toBe(true)
  })
})

describe('persistence and pruning', () => {
  it('survives a restart, since counters live in the database', async () => {
    await failLogin(RATE_LIMITS.loginPerEmail.max)

    const restarted = createRateLimiter(db, { clock: () => new Date(clockMs) })
    try {
      expect((await restarted.checkLogin('ada@example.com', '10.0.0.1')).allowed).toBe(false)
    } finally {
      restarted.stop()
    }
  })

  it('prunes only rows older than the longest window', async () => {
    await failLogin(2, 'old@example.com')
    advance(RATE_LIMIT_MAX_WINDOW_MS + 1000)
    await failLogin(3, 'recent@example.com')

    expect(limiter.prune()).toBe(2)

    const remaining = db.connection
      .prepare(`SELECT COUNT(*) AS n FROM login_attempts`)
      .get() as { n: number }
    expect(remaining.n).toBe(3)
  })

  it('never persists a password, because it never receives one', async () => {
    await limiter.recordFailure('ada@example.com', '10.0.0.1')

    const rows = db.connection.prepare(`SELECT * FROM login_attempts`).all()
    const serialized = JSON.stringify(rows)

    expect(rows).toHaveLength(1)
    expect(serialized).not.toContain('correct horse battery staple')
    // Only the documented columns exist, so there is nowhere to hide a secret.
    expect(Object.keys(rows[0] as object).sort()).toEqual([
      'attempted_at',
      'email',
      'id',
      'ip',
      'kind',
      'succeeded',
    ])
  })
})
