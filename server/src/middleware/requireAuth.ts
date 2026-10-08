/**
 * Session verification middleware (design.md, "Session verification middleware").
 *
 * The single gate in front of every protected endpoint. It answers exactly one
 * question — does this request carry a live session? — and it answers it from
 * the cookie alone, never from a client-supplied user id (Requirement 5.1).
 *
 * Failure is uniform: an absent, unknown, expired or revoked token all produce
 * the same 401 and the same cookie clear, so a caller learns nothing about why
 * it was refused (Requirements 2.6, 5.2).
 *
 * Built as a factory over injectable dependencies, matching the rest of the
 * server, so integration tests can run it against an in-memory database.
 */

import type { Request, RequestHandler, Response } from 'express'
import { toPublicUser, type PublicUser } from '../auth/authService.ts'
import { createSessionStore, type SessionStore } from '../auth/sessionStore.ts'
import { getDb, type Db } from '../db/index.ts'
import {
  createUserRepository,
  type UserRepository,
} from '../repositories/userRepository.ts'
import { clearSessionCookie, readSessionToken } from './cookies.ts'

// `req.user` is the one piece of state this middleware publishes. Declaring it
// globally keeps route handlers free of casts.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set only by `requireAuth`, and only for a live session. */
      user?: PublicUser
    }
  }
}

/** The body returned for every authentication failure. */
export const NOT_AUTHENTICATED = { error: 'Not authenticated' } as const

export interface RequireAuthOptions {
  /** Defaults to the process-wide database, opened on first use. */
  db?: Db
  users?: UserRepository
  sessions?: SessionStore
}

interface Resolved {
  users: UserRepository
  sessions: SessionStore
}

/** Answers 401 and drops the cookie the client is holding. */
function unauthenticated(req: Request, res: Response): void {
  clearSessionCookie(req, res)
  res.status(401).json(NOT_AUTHENTICATED)
}

/**
 * Builds the middleware.
 *
 * Requires cookie parsing to have run. Dependencies resolve on first request
 * rather than at construction, so mounting a router does not force a database
 * open.
 */
export function createRequireAuth(options: RequireAuthOptions = {}): RequestHandler {
  let resolved: Resolved | null = null

  function deps(): Resolved {
    if (!resolved) {
      const db = options.db ?? getDb()
      resolved = {
        users: options.users ?? createUserRepository(db),
        sessions: options.sessions ?? createSessionStore({ db }),
      }
    }
    return resolved
  }

  return function requireAuth(req, res, next) {
    const { users, sessions } = deps()
    const token = readSessionToken(req)

    void (async () => {
      const session = token ? await sessions.verify(token) : null

      if (!session) {
        // Requirements 2.6, 5.2.
        unauthenticated(req, res)
        return
      }

      // Requirement 2.5: the idle window slides on every authenticated
      // request; the absolute expiry is untouched.
      await sessions.touch(session.id)

      const user = await users.findById(session.userId)
      if (!user) {
        // The account went away while the session lived. Revoking keeps the
        // orphaned row from being retried on the next request.
        await sessions.revoke(token)
        unauthenticated(req, res)
        return
      }

      // Requirement 5.1: the identity comes from the session, not the request.
      req.user = toPublicUser(user)
      next()
    })().catch(next)
  }
}

/** The middleware used by route code, bound to the process-wide database. */
export const requireAuth: RequestHandler = createRequireAuth()
