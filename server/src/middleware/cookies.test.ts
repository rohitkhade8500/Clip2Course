import { describe, expect, it } from 'vitest'
import express from 'express'
import request from 'supertest'
import { SESSION_ABSOLUTE_TTL_MS, SESSION_COOKIE } from '../config.ts'
import {
  buildCsrfCookie,
  buildSessionCookie,
  clearSessionCookie,
  setSessionCookie,
} from './cookies.ts'

describe('buildSessionCookie', () => {
  it('is always httpOnly and SameSite=Lax', () => {
    for (const isHttps of [true, false]) {
      const options = buildSessionCookie(isHttps)
      expect(options.httpOnly).toBe(true)
      expect(options.sameSite).toBe('lax')
      expect(options.path).toBe('/')
      expect(options.maxAge).toBe(SESSION_ABSOLUTE_TTL_MS)
    }
  })

  it('sets Secure only when the request is HTTPS', () => {
    expect(buildSessionCookie(true).secure).toBe(true)
    expect(buildSessionCookie(false).secure).toBe(false)
  })
})

describe('buildCsrfCookie', () => {
  it('is readable by the client so it can be echoed in the header', () => {
    expect(buildCsrfCookie(false).httpOnly).toBe(false)
    expect(buildCsrfCookie(false).sameSite).toBe('lax')
  })
})

describe('session cookie over HTTP', () => {
  const app = express()
  app.post('/set', (req, res) => {
    setSessionCookie(req, res, 'token-value')
    res.status(204).end()
  })
  app.post('/clear', (req, res) => {
    clearSessionCookie(req, res)
    res.status(204).end()
  })

  it('emits HttpOnly and SameSite=Lax attributes', async () => {
    const response = await request(app).post('/set')
    const cookie = response.headers['set-cookie']![0]!

    expect(cookie).toContain(`${SESSION_COOKIE}=token-value`)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
  })

  it('expires the cookie immediately when cleared', async () => {
    const response = await request(app).post('/clear')
    const cookie = response.headers['set-cookie']![0]!

    expect(cookie).toContain(`${SESSION_COOKIE}=;`)
    expect(cookie).toContain('Expires=Thu, 01 Jan 1970')
  })
})
