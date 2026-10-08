/**
 * Auth endpoints (design.md, "API Surface").
 *
 *   POST /api/auth/register  create an account and sign in
 *   POST /api/auth/login     verify credentials and sign in
 *   POST /api/auth/logout    revoke the session, clear the cookie
 *   GET  /api/auth/me        the signed-in user, for session restore
 *   GET  /api/auth/csrf      issue the readable double-submit cookie
 *
 * These handlers do no policy work. Validation, hashing, rate limiting and
 * session lifetime all belong to the AuthService; the job here is to read the
 * request, call the service, set or clear a cookie, and let a thrown error
 * reach the error handler that owns the status mapping. Keeping policy out of
 * routes is what stops the HTTP layer and the service from drifting apart.
 *
 * Requirements: 1.8, 2.2, 4.2, 5.2, 5.4, 5.6, 10.3, 10.4, 10.5
 */

import { Router } from 'express'
import type { Request, RequestHandler, Response } from 'express'
import { AuthError } from '../auth/errors.ts'
import { getAuthService, type AuthService } from '../auth/authService.ts'
import type { Db } from '../db/index.ts'
import { createAuthService } from '../auth/authService.ts'
import {
  clearSessionCookie,
  readSessionToken,
  setSessionCookie,
} from '../middleware/cookies.ts'
import { createCsrfProtection, issueCsrfToken } from '../middleware/csrf.ts'
import { createRequireAuth } from '../middleware/requireAuth.ts'

export interface AuthRouterOptions {
  /** Database for the default service and session verification. */
  db?: Db
  authService?: AuthService
  /** Overridable so tests can mount the router without a real session store. */
  requireAuth?: RequestHandler
  csrfProtection?: RequestHandler
}

/**
 * The client's IP address, derived from the connection.
 *
 * Read from `req.ip`, which Express resolves from the socket unless
 * `trust proxy` is configured — deliberately left off, because a client-set
 * `X-Forwarded-For` would otherwise be a free reset of its own rate limit
 * (design.md: "`clientIp` is derived server-side, never from a client-supplied
 * header alone").
 */
export function getClientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown'
}

/** Reads a body field, collapsing anything that is not a string to `''`. */
function readField(body: unknown, field: string): string {
  const value = (body as Record<string, unknown> | null | undefined)?.[field]
  return typeof value === 'string' ? value : ''
}

/** Bridges an async handler onto Express's error channel. */
function asyncHandler(
  handler: (req: Request, res: Response) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res).catch(next)
  }
}

/**
 * Builds the auth router.
 *
 * CSRF protection is applied to the whole router rather than per route: on a
 * safe method it tops the cookie up, and on a state-changing one it requires
 * the header to match (Requirement 5.4). Mounting it here means a route added
 * later is covered by default instead of by memory.
 */
export function createAuthRouter(options: AuthRouterOptions = {}): Router {
  const authService = options.authService ?? createDefaultService(options.db)
  const requireAuth = options.requireAuth ?? createRequireAuth({ db: options.db })
  const csrfProtection = options.csrfProtection ?? createCsrfProtection()

  const router = Router()
  router.use(csrfProtection)

  /**
   * Creates an account and signs the new user in (Requirement 1.1).
   *
   * The already-registered path returns the same 201 and the same body keys
   * with a null user, because a distinguishable response is exactly what
   * Requirement 1.4 forbids. Missing fields leave as a 400 carrying every
   * unmet rule (Requirements 1.8, 10.4), and a full registration window as a
   * 429 (Requirement 4.3) — both raised by the service, mapped by the error
   * handler.
   */
  router.post(
    '/register',
    asyncHandler(async (req, res) => {
      const displayName = readField(req.body, 'displayName')

      const result = await authService.register(
        {
          email: readField(req.body, 'email'),
          password: readField(req.body, 'password'),
          ...(displayName.length > 0 ? { displayName } : {}),
        },
        getClientIp(req),
      )

      if (result.token) setSessionCookie(req, res, result.token)

      res.status(201).json({ user: result.user })
    }),
  )

  /**
   * Verifies credentials and issues a rotated session (Requirements 2.1, 2.7).
   *
   * Every rejection arrives here as an `AuthError` with one message, so a
   * caller cannot tell an unknown address from a wrong password
   * (Requirement 2.2).
   */
  router.post(
    '/login',
    asyncHandler(async (req, res) => {
      const result = await authService.login(
        {
          email: readField(req.body, 'email'),
          password: readField(req.body, 'password'),
        },
        getClientIp(req),
      )

      // The service throws on every failure, so this is a belt-and-braces
      // guard: an empty result must never answer 200 with no session.
      if (!result.user || !result.token) throw new AuthError()

      setSessionCookie(req, res, result.token)
      res.status(200).json({ user: result.user })
    }),
  )

  /**
   * Ends the session (Requirement 3.1) and always succeeds.
   *
   * No `requireAuth` on purpose: logging out with an expired or absent cookie
   * is the caller asking for a state that already holds, so it answers 200
   * (Requirement 3.4).
   */
  router.post(
    '/logout',
    asyncHandler(async (req, res) => {
      await authService.logout(readSessionToken(req))
      clearSessionCookie(req, res)
      res.status(200).json({ ok: true })
    }),
  )

  /**
   * The signed-in user, for session restore on page load.
   *
   * `requireAuth` answers 401 and clears the cookie for anything that is not a
   * live session, so this handler only ever runs for a verified one
   * (Requirements 5.1, 5.2).
   */
  router.get('/me', requireAuth, (req, res) => {
    res.status(200).json({ user: req.user })
  })

  /** Issues a fresh readable CSRF cookie and echoes the token. */
  router.get('/csrf', (req, res) => {
    res.status(200).json({ csrfToken: issueCsrfToken(req, res) })
  })

  return router
}

/**
 * The service the router uses when none is injected.
 *
 * With no database either, this defers to the process-wide instance, which
 * opens its connection on first use rather than at mount time.
 */
function createDefaultService(db?: Db): AuthService {
  return db ? createAuthService({ db }) : getAuthService()
}
