import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MIN_PASSWORD_LENGTH, RATE_LIMITS } from '../config.ts'
import { openTestDb, type Db } from '../db/index.ts'
import { createUserRepository } from '../repositories/userRepository.ts'
import { createAuthService, type AuthService } from './authService.ts'
import { AuthError, RateLimitError, ValidationError } from './errors.ts'
import { createRateLimiter, type RateLimiter } from './rateLimiter.ts'
import { createSessionStore, type SessionStore } from './sessionStore.ts'
import { verifyPassword } from './password.ts'

const PASSWORD = 'correct horse battery staple'
const IP = '203.0.113.7'

let db: Db
let sessions: SessionStore
let rateLimiter: RateLimiter
let auth: AuthService

beforeEach(() => {
  db = openTestDb()
  sessions = createSessionStore({ db })
  rateLimiter = createRateLimiter(db)
  auth = createAuthService({
    db,
    users: createUserRepository(db),
    sessions,
    rateLimiter,
  })
})

afterEach(() => {
  rateLimiter.stop()
  db.close()
})

function userCount(): number {
  return (db.connection.prepare(`SELECT COUNT(*) AS n FROM users`).get() as { n: number }).n
}

describe('register', () => {
  it('creates the user, issues a session and returns the public user', async () => {
    const result = await auth.register(
      { email: 'ada@example.com', password: PASSWORD },
      IP,
    )

    expect(result.user).toEqual({
      id: expect.any(String),
      email: 'ada@example.com',
      displayName: 'ada',
    })
    expect(result.token).toBeTypeOf('string')

    const session = await sessions.verify(result.token as string)
    expect(session?.userId).toBe(result.user?.id)
  })

  it('stores the email lowercased and trimmed', async () => {
    const result = await auth.register(
      { email: '  Ada@Example.COM ', password: PASSWORD },
      IP,
    )

    expect(result.user?.email).toBe('ada@example.com')
    const stored = await createUserRepository(db).findByEmail('ADA@EXAMPLE.COM')
    expect(stored?.email).toBe('ada@example.com')
  })

  it('uses a supplied display name, trimmed', async () => {
    const result = await auth.register(
      { email: 'ada@example.com', password: PASSWORD, displayName: '  Ada L  ' },
      IP,
    )

    expect(result.user?.displayName).toBe('Ada L')
  })

  it('stores only a hash of the password', async () => {
    const result = await auth.register(
      { email: 'ada@example.com', password: PASSWORD },
      IP,
    )

    const row = db.connection
      .prepare(`SELECT * FROM users WHERE id = ?`)
      .get(result.user?.id) as Record<string, unknown>

    expect(JSON.stringify(row)).not.toContain(PASSWORD)
    expect(row.password_hash).not.toBe(PASSWORD)
    expect(await verifyPassword(row.password_hash as string, PASSWORD)).toBe(true)
  })

  it('returns the same success shape for an already-registered email, without a duplicate', async () => {
    const first = await auth.register({ email: 'ada@example.com', password: PASSWORD }, IP)
    const second = await auth.register({ email: 'ADA@example.com', password: PASSWORD }, IP)

    expect(first.user).not.toBeNull()
    expect(second).toEqual({ user: null, token: null })
    expect(Object.keys(second).sort()).toEqual(Object.keys(first).sort())
    expect(userCount()).toBe(1)
  })

  it('rejects a short password without creating an account', async () => {
    const attempt = auth.register(
      { email: 'ada@example.com', password: 'short' },
      IP,
    )

    await expect(attempt).rejects.toThrow(ValidationError)
    await attempt.catch((error: ValidationError) => {
      expect(error.fieldErrors.password).toContain(String(MIN_PASSWORD_LENGTH))
    })
    expect(userCount()).toBe(0)
  })

  it('rejects a common password', async () => {
    const attempt = auth.register(
      // Long enough for the length rule, but on the bundled common list.
      { email: 'ada@example.com', password: 'unbelievable' },
      IP,
    )

    await expect(attempt).rejects.toThrow(ValidationError)
    expect(userCount()).toBe(0)
  })

  it('names every missing field', async () => {
    const attempt = auth.register({} as { email: string; password: string }, IP)

    await expect(attempt).rejects.toThrow(ValidationError)
    await attempt.catch((error: ValidationError) => {
      expect(Object.keys(error.fieldErrors).sort()).toEqual(['email', 'password'])
    })
    expect(userCount()).toBe(0)
  })

  it('rejects an invalid email address', async () => {
    const attempt = auth.register({ email: 'not-an-email', password: PASSWORD }, IP)

    await expect(attempt).rejects.toThrow(ValidationError)
    expect(userCount()).toBe(0)
  })

  it('denies registration once the per-IP window is full', async () => {
    const max = RATE_LIMITS.registerPerIp.max

    for (let i = 0; i < max; i++) {
      await auth.register({ email: `user${i}@example.com`, password: PASSWORD }, IP)
    }

    const attempt = auth.register({ email: 'late@example.com', password: PASSWORD }, IP)

    await expect(attempt).rejects.toThrow(RateLimitError)
    await attempt.catch((error: RateLimitError) => {
      expect(error.retryAfterSeconds).toBeGreaterThan(0)
      expect(error.message).not.toContain('late@example.com')
    })
    expect(userCount()).toBe(max)

    // A different client is unaffected.
    const other = await auth.register(
      { email: 'late@example.com', password: PASSWORD },
      '198.51.100.4',
    )
    expect(other.user?.email).toBe('late@example.com')
  })
})

describe('login', () => {
  async function seedUser(email = 'ada@example.com') {
    const result = await auth.register({ email, password: PASSWORD }, IP)
    return result
  }

  it('returns the public user and a working session for correct credentials', async () => {
    const registered = await seedUser()

    const result = await auth.login({ email: 'ada@example.com', password: PASSWORD }, IP)

    expect(result.user).toEqual({
      id: registered.user?.id,
      email: 'ada@example.com',
      displayName: 'ada',
    })

    const session = await sessions.verify(result.token as string)
    expect(session?.userId).toBe(registered.user?.id)
  })

  it('accepts a differently cased and padded email', async () => {
    await seedUser()

    const result = await auth.login({ email: '  ADA@Example.com ', password: PASSWORD }, IP)

    expect(result.user?.email).toBe('ada@example.com')
  })

  it('rotates the session, invalidating the token issued before login', async () => {
    const registered = await seedUser()
    const oldToken = registered.token as string

    const result = await auth.login({ email: 'ada@example.com', password: PASSWORD }, IP)

    expect(result.token).not.toBe(oldToken)
    expect(await sessions.verify(oldToken)).toBeNull()
    expect(await sessions.verify(result.token as string)).not.toBeNull()

    const liveSessions = db.connection
      .prepare(`SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?`)
      .get(registered.user?.id) as { n: number }
    expect(liveSessions.n).toBe(1)
  })

  it('uses one identical message for an unknown email and a wrong password', async () => {
    await seedUser()

    const unknown = await auth
      .login({ email: 'nobody@example.com', password: PASSWORD }, IP)
      .catch((error: unknown) => error)
    const wrongPassword = await auth
      .login({ email: 'ada@example.com', password: 'a different password' }, IP)
      .catch((error: unknown) => error)

    expect(unknown).toBeInstanceOf(AuthError)
    expect(wrongPassword).toBeInstanceOf(AuthError)
    expect((unknown as AuthError).message).toBe('Email or password is incorrect')
    expect((wrongPassword as AuthError).message).toBe(
      (unknown as AuthError).message,
    )
    expect((wrongPassword as AuthError).status).toBe((unknown as AuthError).status)
  })

  it('issues no session on a failed attempt', async () => {
    const registered = await seedUser()

    await expect(
      auth.login({ email: 'ada@example.com', password: 'a different password' }, IP),
    ).rejects.toThrow(AuthError)

    // Only the session from registration remains.
    const liveSessions = db.connection
      .prepare(`SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?`)
      .get(registered.user?.id) as { n: number }
    expect(liveSessions.n).toBe(1)
  })

  it('rejects a missing email or password with the same uniform error', async () => {
    await expect(
      auth.login({} as { email: string; password: string }, IP),
    ).rejects.toThrow(AuthError)
  })

  it('records the failed attempt without the submitted password', async () => {
    await seedUser()

    await expect(
      auth.login({ email: 'ada@example.com', password: 'a different password' }, IP),
    ).rejects.toThrow(AuthError)

    const rows = db.connection
      .prepare(`SELECT * FROM login_attempts WHERE kind = 'login'`)
      .all() as Record<string, unknown>[]

    expect(rows).toHaveLength(1)
    expect(JSON.stringify(rows)).not.toContain('a different password')
    expect(rows[0].email).toBe('ada@example.com')
  })

  it('denies further attempts once the per-email window is full', async () => {
    await seedUser()
    const max = RATE_LIMITS.loginPerEmail.max

    for (let i = 0; i < max; i++) {
      await expect(
        auth.login({ email: 'ada@example.com', password: `wrong ${i}` }, IP),
      ).rejects.toThrow(AuthError)
    }

    const attempt = auth.login({ email: 'ada@example.com', password: PASSWORD }, IP)

    await expect(attempt).rejects.toThrow(RateLimitError)
    await attempt.catch((error: RateLimitError) => {
      expect(error.retryAfterSeconds).toBeGreaterThan(0)
      expect(error.message).not.toContain('ada@example.com')
    })
  })

  it('clears the failure counter on a successful login', async () => {
    await seedUser()

    await expect(
      auth.login({ email: 'ada@example.com', password: 'wrong once' }, IP),
    ).rejects.toThrow(AuthError)

    await auth.login({ email: 'ada@example.com', password: PASSWORD }, IP)

    const remaining = db.connection
      .prepare(`SELECT COUNT(*) AS n FROM login_attempts WHERE email = ?`)
      .get('ada@example.com') as { n: number }
    expect(remaining.n).toBe(0)
  })
})

describe('logout', () => {
  it('deletes the session server-side so the token stops verifying', async () => {
    const registered = await auth.register(
      { email: 'ada@example.com', password: PASSWORD },
      IP,
    )
    const token = registered.token as string

    await auth.logout(token)

    expect(await sessions.verify(token)).toBeNull()
    const rows = db.connection
      .prepare(`SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?`)
      .get(registered.user?.id) as { n: number }
    expect(rows.n).toBe(0)
  })

  it('rejects a revoked token on every later lookup', async () => {
    const registered = await auth.register(
      { email: 'ada@example.com', password: PASSWORD },
      IP,
    )
    const token = registered.token as string

    await auth.logout(token)

    // The client may keep holding the cookie; it verifies against nothing.
    expect(await auth.currentUser(token)).toBeNull()
    expect(await auth.currentUser(token)).toBeNull()
  })

  it('succeeds with a missing, unknown or repeated token', async () => {
    const registered = await auth.register(
      { email: 'ada@example.com', password: PASSWORD },
      IP,
    )
    const token = registered.token as string

    await expect(auth.logout(undefined)).resolves.toBeUndefined()
    await expect(auth.logout('')).resolves.toBeUndefined()
    await expect(auth.logout('not-a-real-token')).resolves.toBeUndefined()
    await expect(auth.logout(token)).resolves.toBeUndefined()
    await expect(auth.logout(token)).resolves.toBeUndefined()

    expect(await sessions.verify(token)).toBeNull()
  })

  it('leaves another user signed in', async () => {
    const ada = await auth.register({ email: 'ada@example.com', password: PASSWORD }, IP)
    const grace = await auth.register({ email: 'grace@example.com', password: PASSWORD }, IP)

    await auth.logout(ada.token as string)

    expect(await auth.currentUser(ada.token as string)).toBeNull()
    expect(await auth.currentUser(grace.token as string)).toEqual(grace.user)
  })
})

describe('currentUser', () => {
  it('returns the public user for a valid session', async () => {
    const registered = await auth.register(
      { email: 'ada@example.com', password: PASSWORD },
      IP,
    )

    const user = await auth.currentUser(registered.token as string)

    expect(user).toEqual({
      id: registered.user?.id,
      email: 'ada@example.com',
      displayName: 'ada',
    })
    // Nothing beyond the public shape leaves the server.
    expect(Object.keys(user as object).sort()).toEqual(['displayName', 'email', 'id'])
  })

  it('returns null for a missing or unknown token', async () => {
    await auth.register({ email: 'ada@example.com', password: PASSWORD }, IP)

    expect(await auth.currentUser(undefined)).toBeNull()
    expect(await auth.currentUser('')).toBeNull()
    expect(await auth.currentUser('not-a-real-token')).toBeNull()
  })

  it('returns null once the session has expired', async () => {
    let clock = new Date('2025-01-01T00:00:00.000Z')
    const expiringSessions = createSessionStore({ db, now: () => clock })
    const expiringAuth = createAuthService({
      db,
      users: createUserRepository(db),
      sessions: expiringSessions,
      rateLimiter,
    })

    const registered = await expiringAuth.register(
      { email: 'ada@example.com', password: PASSWORD },
      IP,
    )
    const token = registered.token as string

    expect(await expiringAuth.currentUser(token)).not.toBeNull()

    // Past the 7-day idle bound with no activity.
    clock = new Date('2025-01-15T00:00:00.000Z')
    expect(await expiringAuth.currentUser(token)).toBeNull()
  })

  it('returns null when the account behind the session is gone', async () => {
    const registered = await auth.register(
      { email: 'ada@example.com', password: PASSWORD },
      IP,
    )
    const token = registered.token as string

    // Sessions cascade on user delete, so drop the user row and its session
    // together the way the database would.
    db.connection.prepare(`DELETE FROM users WHERE id = ?`).run(registered.user?.id)

    expect(await auth.currentUser(token)).toBeNull()
  })

  it('does not extend the idle window', async () => {
    const registered = await auth.register(
      { email: 'ada@example.com', password: PASSWORD },
      IP,
    )
    const token = registered.token as string

    const readExpiry = () =>
      (
        db.connection
          .prepare(`SELECT idle_expires_at AS idle FROM sessions WHERE user_id = ?`)
          .get(registered.user?.id) as { idle: string }
      ).idle

    const before = readExpiry()
    await auth.currentUser(token)

    // Requirement 2.5 puts the sliding window in the middleware, not here.
    expect(readExpiry()).toBe(before)
  })
})
