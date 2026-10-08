/**
 * Cookie construction (design.md, "Function: buildSessionCookie()").
 *
 * Every cookie this server sets is built here, so the security attributes are
 * decided in one place rather than per route. Two cookies exist and they are
 * deliberately opposites:
 *
 *   - the session cookie is `httpOnly`, so an injected script cannot read the
 *     credential (Requirement 5.5)
 *   - the CSRF cookie is readable on purpose, because the client has to copy
 *     its value into `X-CSRF-Token` for the double-submit check (Requirement 5.4)
 *
 * Both carry `SameSite=Lax`, and `Secure` whenever the request arrived over
 * HTTPS — or unconditionally in production, where credentials are only ever
 * submitted over HTTPS anyway (Requirement 9.1). Forcing it there means a
 * misconfigured `trust proxy` cannot silently downgrade a live cookie.
 */

import type { CookieOptions, Request, Response } from 'express'
import {
  CSRF_COOKIE,
  IS_PRODUCTION,
  SESSION_ABSOLUTE_TTL_MS,
  SESSION_COOKIE,
} from '../config.ts'

/**
 * Whether cookies on this request must carry `Secure`.
 *
 * `req.secure` reflects the protocol Express resolved, including
 * `X-Forwarded-Proto` when `trust proxy` is enabled.
 */
export function isSecureRequest(req: Request): boolean {
  return req.secure || IS_PRODUCTION
}

/**
 * Attributes for the session cookie.
 *
 * `maxAge` matches the absolute session TTL: a cookie outliving the row it
 * points at would only produce a 401 the client cannot explain.
 */
export function buildSessionCookie(isHttps: boolean): CookieOptions {
  return {
    httpOnly: true, // unreachable from JavaScript
    sameSite: 'lax', // blocks cross-site form posts
    secure: isHttps, // Requirement 5.5
    path: '/',
    maxAge: SESSION_ABSOLUTE_TTL_MS,
  }
}

/**
 * Attributes for the CSRF cookie.
 *
 * `httpOnly` is false by design — see the module comment. The value is not a
 * credential on its own: it authorises nothing without the session cookie.
 */
export function buildCsrfCookie(isHttps: boolean): CookieOptions {
  return {
    httpOnly: false, // the client must be able to echo it back
    sameSite: 'lax',
    secure: isHttps,
    path: '/',
    maxAge: SESSION_ABSOLUTE_TTL_MS,
  }
}

/** Sets the session cookie for `token`, deriving `Secure` from the request. */
export function setSessionCookie(req: Request, res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, buildSessionCookie(isSecureRequest(req)))
}

/**
 * Instructs the browser to drop the session cookie (Requirements 2.6, 3.1).
 *
 * The attributes must match those used when setting it, or the browser treats
 * it as a different cookie and keeps the original.
 */
export function clearSessionCookie(req: Request, res: Response): void {
  const { maxAge: _maxAge, ...attributes } = buildSessionCookie(isSecureRequest(req))
  res.clearCookie(SESSION_COOKIE, attributes)
}

/** Sets the readable CSRF cookie. */
export function setCsrfCookie(req: Request, res: Response, token: string): void {
  res.cookie(CSRF_COOKIE, token, buildCsrfCookie(isSecureRequest(req)))
}

/**
 * Reads the raw session token from the request cookies.
 *
 * Returns null when cookie parsing has not run or the cookie is absent, so
 * callers never have to distinguish "no cookie" from "no cookie-parser".
 */
export function readSessionToken(req: Request): string | null {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[SESSION_COOKIE]
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** Reads the CSRF cookie value, or null when absent. */
export function readCsrfCookie(req: Request): string | null {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[CSRF_COOKIE]
  return typeof value === 'string' && value.length > 0 ? value : null
}
