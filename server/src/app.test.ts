import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { createApp } from './app.ts'
import { CSRF_COOKIE, SESSION_COOKIE } from './config.ts'
import { openTestDb, type Db } from './db/index.ts'

/**
 * Wiring tests for the HTTP layer: the routes exist, the middleware order is
 * right, and failures leave in the uniform shape. The broader behavioural suite
 * (rate limits, cross-user isolation, cookie flags) is task 5.3.
 */

let db: Db
let app: Express

beforeEach(() => {
  db = openTestDb()
  // Silence the fault logger; nothing here should reach it anyway.
  app = createApp({ db, serveClient: false, logger: () => {} })
})

afterEach(() => {
  db.close()
})

/** An agent holding cookies, primed with a CSRF token to echo. */
async function signedAgent() {
  const agent = request.agent(app)
  const response = await agent.get('/api/auth/csrf').expect(200)
  return { agent, csrfToken: response.body.csrfToken as string }
}

const VALID = { email: 'ada@example.com', password: 'correct horse battery' }

describe('GET /api/auth/csrf', () => {
  it('issues the readable double-submit cookie', async () => {
    const response = await request(app).get('/api/auth/csrf').expect(200)

    expect(typeof response.body.csrfToken).toBe('string')
    const cookies = response.headers['set-cookie'] as unknown as string[]
    expect(cookies.join(';')).toContain(CSRF_COOKIE)
  })
})

describe('POST /api/auth/register', () => {
  it('rejects a state-changing request with no CSRF token', async () => {
    const response = await request(app).post('/api/auth/register').send(VALID).expect(403)

    expect(response.body.error).toMatch(/csrf/i)
  })

  it('answers 400 naming every missing field', async () => {
    const { agent, csrfToken } = await signedAgent()

    const response = await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(400)

    expect(response.body.fieldErrors).toEqual({
      email: 'Email is required',
      password: 'Password is required',
    })
  })

  it('creates an account, sets an httpOnly session cookie, and /me resolves it', async () => {
    const { agent, csrfToken } = await signedAgent()

    const registered = await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', csrfToken)
      .send(VALID)
      .expect(201)

    expect(registered.body.user).toMatchObject({ email: VALID.email })

    const sessionCookie = (registered.headers['set-cookie'] as unknown as string[]).find(
      (cookie) => cookie.startsWith(`${SESSION_COOKIE}=`),
    )
    expect(sessionCookie).toBeDefined()
    expect(sessionCookie).toMatch(/HttpOnly/i)

    const me = await agent.get('/api/auth/me').expect(200)
    expect(me.body.user).toMatchObject({ email: VALID.email })

    await agent.post('/api/auth/logout').set('X-CSRF-Token', csrfToken).expect(200)
    await agent.get('/api/auth/me').expect(401)
  })

  it('answers the same status and body shape for an already-registered email', async () => {
    const { agent, csrfToken } = await signedAgent()

    const first = await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', csrfToken)
      .send(VALID)
      .expect(201)

    const second = await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', csrfToken)
      .send({ ...VALID, password: 'a different passphrase' })
      .expect(201)

    expect(Object.keys(second.body)).toEqual(Object.keys(first.body))
  })
})

describe('POST /api/auth/login', () => {
  it('uses one message for an unknown email and a wrong password', async () => {
    const { agent, csrfToken } = await signedAgent()
    await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', csrfToken)
      .send(VALID)
      .expect(201)

    const unknownEmail = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .send({ email: 'nobody@example.com', password: VALID.password })
      .expect(401)

    const wrongPassword = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .send({ email: VALID.email, password: 'not the right passphrase' })
      .expect(401)

    expect(unknownEmail.body).toEqual(wrongPassword.body)
    expect(unknownEmail.body.error).toBe('Email or password is incorrect')
  })
})

describe('GET /api/auth/me', () => {
  it('answers 401 with no resource data when anonymous', async () => {
    const response = await request(app).get('/api/auth/me').expect(401)

    expect(response.body.user).toBeUndefined()
    expect(response.body.error).toBeDefined()
  })
})

describe('uniform failure shapes', () => {
  it('answers 404 for an unknown API path', async () => {
    const response = await request(app).get('/api/does-not-exist').expect(404)

    expect(response.body).toEqual({ error: 'Not found' })
  })

  it('answers 413 for a body over the limit', async () => {
    const { agent, csrfToken } = await signedAgent()

    const response = await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', csrfToken)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: VALID.email, password: 'x'.repeat(150 * 1024) }))
      .expect(413)

    expect(response.body.error).toMatch(/too large/i)
  })

  it('answers 400 for a body that is not valid JSON', async () => {
    const { agent, csrfToken } = await signedAgent()

    const response = await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', csrfToken)
      .set('Content-Type', 'application/json')
      .send('{ not json')
      .expect(400)

    expect(response.body.error).toMatch(/json/i)
  })
})
