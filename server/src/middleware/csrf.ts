/**
 * CSRF protection (design.md, "Security Design Notes" → CSRF).
 *
 * Cookie authentication means the browser attaches the session automatically,
 * including on requests a third-party page triggered. `SameSite=Lax` blocks the
 * common shapes of that attack; this middleware covers the rest with the
 * double-submit pattern (Requirement 5.4):
 *
 *   1. the server sets a readable random token in a cookie
 *   2. the client copies it into the `X-CSRF-Token` header
 *   3. a state-changing request is accepted only when the two match
 *
 * The security rests on the same-origin policy: a cross-origin page can cause
 * the cookie to be *sent*, but cannot *read* it, so it cannot produce the
 * header. Both values being attacker-unknown is the whole trick — the token
 * authorises nothing on its own.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { Request, RequestHandler, Response } from 'express'
import { CSRF_HEADER, CSRF_TOKEN_BYTES } from '../config.ts'
import { readCsrfCookie, setCsrfCookie } from './cookies.ts'

/**
 * Status returned when the double-submit check fails. Distinct from 401: the
 * session may well be valid, it is the request's origin that is not trusted.
 */
export const CSRF_FAILURE_STATUS = 403

/** The body returned when the check fails. */
export const CSRF_FAILURE_BODY = { error: 'Invalid or missing CSRF token' } as const

/** Methods that cannot change state, and so need no token. */
const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS'])

/** A fresh token with `CSRF_TOKEN_BYTES` bytes of CSPRNG entropy. */
export function generateCsrfToken(bytes = CSRF_TOKEN_BYTES): string {
  return randomBytes(bytes).toString('base64url')
}

/** Constant-time string comparison that tolerates differing lengths. */
function matches(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  // Length is not a secret here, and timingSafeEqual requires equal buffers.
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

/**
 * Ensures the request has a CSRF cookie, returning the token the client is
 * expected to echo. Issues a new one when the cookie is absent, so a first
 * visit is immediately able to make a state-changing call.
 */
export function ensureCsrfToken(req: Request, res: Response): string {
  const existing = readCsrfCookie(req)
  if (existing) return existing

  const token = generateCsrfToken()
  setCsrfCookie(req, res, token)
  return token
}

/**
 * Issues a fresh CSRF token unconditionally, replacing any existing one.
 * Used by `GET /api/auth/csrf` (task 5.2).
 */
export function issueCsrfToken(req: Request, res: Response): string {
  const token = generateCsrfToken()
  setCsrfCookie(req, res, token)
  return token
}

/** Reads the echoed token from the request header. */
function readCsrfHeader(req: Request): string | null {
  const value = req.headers[CSRF_HEADER]
  const header = Array.isArray(value) ? value[0] : value
  return typeof header === 'string' && header.length > 0 ? header : null
}

/**
 * Builds the CSRF middleware.
 *
 * On a safe method it only tops up the cookie, so the token is in place before
 * the first form submit. On a state-changing method it requires cookie and
 * header to match, and refuses the request otherwise.
 */
export function createCsrfProtection(): RequestHandler {
  return function csrfProtection(req, res, next) {
    if (SAFE_METHODS.has(req.method.toUpperCase())) {
      ensureCsrfToken(req, res)
      next()
      return
    }

    const cookieToken = readCsrfCookie(req)
    const headerToken = readCsrfHeader(req)

    if (!cookieToken || !headerToken || !matches(cookieToken, headerToken)) {
      // Deliberately not issuing a token here: handing one out on a rejected
      // request would let a cross-origin caller bootstrap a valid pair.
      res.status(CSRF_FAILURE_STATUS).json(CSRF_FAILURE_BODY)
      return
    }

    next()
  }
}

/** The middleware used by route code. */
export const csrfProtection: RequestHandler = createCsrfProtection()
