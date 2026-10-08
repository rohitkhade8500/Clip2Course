import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import cookieParser from 'cookie-parser'
import express, { type Express } from 'express'
import request from 'supertest'
import { createSessionStore, type SessionStore } from '../auth/sessionStore.ts'
import { SESSION_COOKIE } from '../config.ts'
import { openTestDb, type Db } from '../db/index.ts'
import { createUserRepository } from '../repositories/userRepository.ts'
import { createRequireAuth } from './requireAuth.ts'

let db: Db
let clock: Date
let sessions: SessionStore

function buildApp(): Express {
  const app = express()
  app.use(cookieParser())
  app.get('/protected', createRequireAuth({ db, sessions }), (req, res) => {
    res.json({ user: req.user })
  })
  return app
}

async function seedUser(email = 'reader@example.com') {
  return createUserRepository(db).create({ email, passwordHash: 'not-a-real-hash' })
}

function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}`
}

beforeEach(() => {
  db = openTestDb()
  clock = new Date('2025-01-01T00:00:00.000Z')
  sessions = createSessionStore({ db, now: () => clock })
})

afterEach(() => {
  db.close()
})

describe('requireAuth', () => {
  it('rejects a request with no session cookie and clears the cookie', async () => {
    const response = await request(buildApp()).get('/protected')

    expect(response.status).toBe(401)
    expect(response.body).toEqual({ error: 'Not authenticated' })
    expect(response.headers['set-cookie']![0]!).toContain(`${SESSION_COOKIE}=;`)
  })

  it('attaches the public user for a live session', async () => {
    const user = await seedUser()
    const { token } = await sessions.issue(user.id)

    const response = await request(buildApp())
      .get('/protected')
      .set('Cookie', sessionCookie(token))

    expect(response.status).toBe(200)
    expect(response.body.user).toEqual({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    })
    // No password hash escapes, even indirectly.
    expect(JSON.stringify(response.body)).not.toContain('not-a-real-hash')
  })

  it('extends the idle window without moving the absolute expiry', async () => {
    const user = await seedUser()
    const { token, record } = await sessions.issue(user.id)

    clock = new Date(clock.getTime() + 60_000)
    await request(buildApp()).get('/protected').set('Cookie', sessionCookie(token)).expect(200)

    const row = db.sessions.findByTokenHash(record.tokenHash)!
    expect(new Date(row.idleExpiresAt).getTime()).toBeGreaterThan(
      record.idleExpiresAt.getTime(),
    )
    expect(row.absoluteExpiresAt).toBe(record.absoluteExpiresAt.toISOString())
  })

  it('rejects a revoked session indistinguishably from an unknown one', async () => {
    const user = await seedUser()
    const { token } = await sessions.issue(user.id)
    await sessions.revoke(token)

    const revoked = await request(buildApp())
      .get('/protected')
      .set('Cookie', sessionCookie(token))
    const unknown = await request(buildApp())
      .get('/protected')
      .set('Cookie', sessionCookie('never-issued'))

    expect(revoked.status).toBe(401)
    expect(revoked.body).toEqual(unknown.body)
  })

  it('rejects a session past its absolute expiry', async () => {
    const user = await seedUser()
    const { token, record } = await sessions.issue(user.id)

    clock = new Date(record.absoluteExpiresAt.getTime() + 1000)

    await request(buildApp())
      .get('/protected')
      .set('Cookie', sessionCookie(token))
      .expect(401)
  })
})
