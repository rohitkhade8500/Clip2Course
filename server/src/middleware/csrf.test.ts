import { describe, expect, it } from 'vitest'
import cookieParser from 'cookie-parser'
import express, { type Express } from 'express'
import request from 'supertest'
import { CSRF_COOKIE, CSRF_HEADER } from '../config.ts'
import { createCsrfProtection } from './csrf.ts'

function buildApp(): Express {
  const app = express()
  app.use(cookieParser())
  app.use(createCsrfProtection())
  app.get('/thing', (_req, res) => res.json({ ok: true }))
  app.post('/thing', (_req, res) => res.json({ ok: true }))
  return app
}

function csrfCookieValue(setCookie: string[] | undefined): string {
  const cookie = setCookie?.find((value) => value.startsWith(`${CSRF_COOKIE}=`))
  return cookie ? cookie.split(';')[0]!.slice(CSRF_COOKIE.length + 1) : ''
}

describe('csrfProtection', () => {
  it('issues a readable token cookie on a safe request', async () => {
    const response = await request(buildApp()).get('/thing')

    const cookie = response.headers['set-cookie']!.find((value) =>
      value.startsWith(`${CSRF_COOKIE}=`),
    )!

    expect(response.status).toBe(200)
    expect(cookie).not.toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(csrfCookieValue(response.headers['set-cookie'])).not.toBe('')
  })

  it('accepts a state-changing request whose header matches the cookie', async () => {
    const app = buildApp()
    const seed = await request(app).get('/thing')
    const token = csrfCookieValue(seed.headers['set-cookie'])

    const response = await request(app)
      .post('/thing')
      .set('Cookie', `${CSRF_COOKIE}=${token}`)
      .set(CSRF_HEADER, token)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })
  })

  it('rejects a state-changing request with no header', async () => {
    const app = buildApp()
    const seed = await request(app).get('/thing')
    const token = csrfCookieValue(seed.headers['set-cookie'])

    const response = await request(app)
      .post('/thing')
      .set('Cookie', `${CSRF_COOKIE}=${token}`)

    expect(response.status).toBe(403)
    expect(response.body.error).toMatch(/csrf/i)
  })

  it('rejects a header that does not match the cookie', async () => {
    const response = await request(buildApp())
      .post('/thing')
      .set('Cookie', `${CSRF_COOKIE}=cookie-token`)
      .set(CSRF_HEADER, 'header-token')

    expect(response.status).toBe(403)
  })

  it('rejects a state-changing request with no cookie at all', async () => {
    const response = await request(buildApp()).post('/thing').set(CSRF_HEADER, 'lonely')

    expect(response.status).toBe(403)
  })

  it('does not hand out a token on a rejected request', async () => {
    const response = await request(buildApp()).post('/thing')

    expect(response.status).toBe(403)
    expect(csrfCookieValue(response.headers['set-cookie'])).toBe('')
  })
})
