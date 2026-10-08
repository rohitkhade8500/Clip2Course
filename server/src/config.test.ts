import { describe, expect, it } from 'vitest'
import {
  ARGON2_OPTIONS,
  BODY_LIMIT_BYTES,
  COMMON_PASSWORDS,
  CSRF_COOKIE,
  MAX_EMAIL_LENGTH,
  MIN_PASSWORD_LENGTH,
  PORT,
  RATE_LIMITS,
  RATE_LIMIT_MAX_WINDOW_MS,
  SESSION_ABSOLUTE_TTL_MS,
  SESSION_COOKIE,
  SESSION_IDLE_TTL_MS,
  SESSION_TOKEN_BYTES,
} from './config.ts'

const DAY_MS = 24 * 60 * 60 * 1000

describe('config', () => {
  it('uses the documented session lifetimes', () => {
    expect(SESSION_ABSOLUTE_TTL_MS).toBe(30 * DAY_MS)
    expect(SESSION_IDLE_TTL_MS).toBe(7 * DAY_MS)
    expect(SESSION_IDLE_TTL_MS).toBeLessThan(SESSION_ABSOLUTE_TTL_MS)
  })

  it('defaults the port to 3001 when PORT is unset', () => {
    // The test runner does not set PORT, so the fallback is what we observe.
    expect(PORT).toBe(process.env.PORT ? Number(process.env.PORT) : 3001)
  })

  it('uses distinct cookie names', () => {
    expect(SESSION_COOKIE).not.toBe(CSRF_COOKIE)
  })

  it('enforces the documented policy limits', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12)
    expect(MAX_EMAIL_LENGTH).toBe(254)
    expect(BODY_LIMIT_BYTES).toBe(100 * 1024)
    expect(SESSION_TOKEN_BYTES).toBe(32)
  })

  it('uses argon2id with a memory-hard cost', () => {
    expect(ARGON2_OPTIONS.type).toBe(2)
    expect(ARGON2_OPTIONS.memoryCost).toBeGreaterThanOrEqual(19 * 1024)
    expect(ARGON2_OPTIONS.timeCost).toBeGreaterThanOrEqual(2)
  })

  it('sets the rate limits from Requirement 4', () => {
    expect(RATE_LIMITS.loginPerEmail).toEqual({ windowMs: 15 * 60_000, max: 10 })
    expect(RATE_LIMITS.loginPerIp).toEqual({ windowMs: 15 * 60_000, max: 30 })
    expect(RATE_LIMITS.registerPerIp).toEqual({ windowMs: 60 * 60_000, max: 5 })
    expect(RATE_LIMIT_MAX_WINDOW_MS).toBe(60 * 60_000)
  })

  it('loads the common-password list once as a lowercased set', () => {
    expect(COMMON_PASSWORDS.size).toBeGreaterThanOrEqual(9_000)
    expect(COMMON_PASSWORDS.has('password')).toBe(true)
    expect(COMMON_PASSWORDS.has('123456')).toBe(true)
    expect(COMMON_PASSWORDS.has('')).toBe(false)
    for (const password of COMMON_PASSWORDS) {
      expect(password).toBe(password.toLowerCase().trim())
    }
  })
})
