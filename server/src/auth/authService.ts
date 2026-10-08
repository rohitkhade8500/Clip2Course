/**
 * AuthService (design.md, Component 3).
 *
 * Applies the account policy from Requirements 1–4 on top of the primitives:
 * validation, hashing, session issuance and rate limiting. Route handlers do no
 * policy work of their own — they translate an `AuthResult` or a thrown error
 * from this module into HTTP.
 *
 * Built as a factory over injectable dependencies so tests can run against
 * `openTestDb()` without touching the process-wide database.
 */

import { getDb, type Db } from '../db/index.ts'
import {
  createUserRepository,
  type UserRecord,
  type UserRepository,
} from '../repositories/userRepository.ts'
import { AuthError, RateLimitError, ValidationError } from './errors.ts'
import { DUMMY_ARGON2_HASH, hashPassword, verifyPassword } from './password.ts'
import { createRateLimiter, type RateLimiter } from './rateLimiter.ts'
import { createSessionStore, type SessionStore } from './sessionStore.ts'
import { normalizeEmail, validateRegistration } from './validation.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegisterInput {
  email: string
  password: string
  displayName?: string
}

export interface LoginInput {
  email: string
  password: string
}

/** The only shape of a user that leaves the server. No hash, ever. */
export interface PublicUser {
  id: string
  email: string
  displayName: string
}

export interface AuthResult {
  /** null on the "email already taken" path (Requirement 1.4). */
  user: PublicUser | null
  /** Raw session token for the cookie, or null when no session was issued. */
  token: string | null
}

export interface AuthService {
  register(input: RegisterInput, clientIp: string): Promise<AuthResult>
  login(input: LoginInput, clientIp: string): Promise<AuthResult>
  logout(token?: string | null): Promise<void>
  currentUser(token?: string | null): Promise<PublicUser | null>
}

export interface AuthServiceDependencies {
  /** Defaults to the process-wide database, opened on first use. */
  db?: Db
  users?: UserRepository
  sessions?: SessionStore
  rateLimiter?: RateLimiter
}

/** Strips everything a client has no business seeing. */
export function toPublicUser(user: UserRecord): PublicUser {
  return { id: user.id, email: user.email, displayName: user.displayName }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

interface ResolvedDependencies {
  users: UserRepository
  sessions: SessionStore
  rateLimiter: RateLimiter
}

export function createAuthService(
  dependencies: AuthServiceDependencies = {},
): AuthService {
  // Resolved on first call, not at construction: wiring the service must not
  // force a database open, which is what keeps startup order and tests free.
  let resolved: ResolvedDependencies | null = null

  function deps(): ResolvedDependencies {
    if (!resolved) {
      const db = dependencies.db ?? getDb()
      resolved = {
        users: dependencies.users ?? createUserRepository(db),
        sessions: dependencies.sessions ?? createSessionStore({ db }),
        rateLimiter: dependencies.rateLimiter ?? createRateLimiter(db),
      }
    }
    return resolved
  }

  return {
    /**
     * Registers an account and signs the new user in.
     *
     * Order matters and follows the design pseudocode: quota, then validation,
     * then the existing-email lookup, then hash, insert and session. Checking
     * the quota first means a flood of malformed requests cannot buy an
     * attacker unlimited cheap lookups (Requirement 4.3).
     *
     * @throws RateLimitError when the per-IP registration window is full
     * @throws ValidationError when a field is missing or breaks the policy
     */
    async register(input, clientIp) {
      const { users, sessions, rateLimiter } = deps()

      // Requirement 4.3. This call also consumes the quota slot, so a caller
      // cannot probe the limit for free.
      const quota = await rateLimiter.checkRegistration(clientIp)
      if (!quota.allowed) {
        throw new RateLimitError(quota.retryAfterSeconds)
      }

      // Requirements 1.5, 1.6: one normalized form for storage and comparison.
      // The typeof guard matters because a hand-rolled JSON body can carry
      // anything; a non-string falls through to "Email is required".
      const email = typeof input.email === 'string' ? normalizeEmail(input.email) : ''

      // Requirements 1.3, 1.8: every unmet rule named, nothing created.
      const fieldErrors = validateRegistration(email, input.password)
      if (Object.keys(fieldErrors).length > 0) {
        throw new ValidationError(fieldErrors)
      }

      const existing = await users.findByEmail(email)

      if (existing) {
        // Requirement 1.4: same work, same response shape. Hashing anyway keeps
        // the timing profile identical to a real registration, so the response
        // cannot be used to discover which addresses exist.
        await hashPassword(input.password)
        return { user: null, token: null }
      }

      // Requirement 1.7: only the hash is ever persisted.
      const passwordHash = await hashPassword(input.password)

      const user = await users.create({
        email,
        passwordHash,
        displayName: input.displayName,
      })

      // Requirement 1.1: a fresh account arrives signed in.
      const { token } = await sessions.issue(user.id)

      return { user: toPublicUser(user), token }
    },

    /**
     * Verifies credentials and signs the user in on a fresh session.
     *
     * Every failure — unknown email, wrong password, a malformed body — leaves
     * through the same `AuthError` with the same message, so a caller learns
     * nothing beyond "not those credentials" (Requirements 2.2, 2.3).
     *
     * @throws RateLimitError when the per-email or per-IP login window is full
     * @throws AuthError when the credentials do not identify an account
     */
    async login(input, clientIp) {
      const { users, sessions, rateLimiter } = deps()

      // A non-string arriving from a hand-rolled JSON body must not crash or
      // shortcut: it becomes a value that cannot match, and takes the ordinary
      // failure path.
      const email = typeof input.email === 'string' ? normalizeEmail(input.email) : ''
      const password = typeof input.password === 'string' ? input.password : ''

      // Requirements 4.1, 4.2: answered before any lookup, so a 429 says
      // nothing about whether the credentials were valid.
      const quota = await rateLimiter.checkLogin(email, clientIp)
      if (!quota.allowed) {
        throw new RateLimitError(quota.retryAfterSeconds)
      }

      const user = await users.findByEmail(email)

      // Requirement 2.3: an unknown email still costs one Argon2 verification,
      // against a hash nobody holds the preimage of, so response timing does
      // not disclose which addresses are registered.
      const hashToCompare = user?.passwordHash ?? DUMMY_ARGON2_HASH
      const passwordMatches = await verifyPassword(hashToCompare, password)

      if (!user || !passwordMatches) {
        // Requirement 4.4: email and IP only — the submitted password never
        // reaches the limiter.
        await rateLimiter.recordFailure(email, clientIp)
        throw new AuthError()
      }

      // Requirement 2.7: rotate. Revoking first means a token captured before
      // this login stops verifying the moment the new one is issued.
      await sessions.revokeAllForUser(user.id)
      const { token } = await sessions.issue(user.id)

      // Requirement 4.1: a genuine sign-in clears the failure counter, so an
      // earlier typo cannot lock the account out later in the window.
      await rateLimiter.clearFor(email)

      return { user: toPublicUser(user), token }
    },

    /**
     * Ends a session server-side.
     *
     * Deleting the row is what makes revocation total: the cookie the client
     * keeps holding then verifies against nothing, so a replayed token is
     * rejected on every later request (Requirements 3.1, 3.2).
     *
     * Never throws. A missing, unknown or already-expired token is a no-op,
     * which is what makes logging out idempotent — the caller's intent is
     * "leave me signed out", and that is already true (Requirement 3.4).
     */
    async logout(token) {
      const { sessions } = deps()

      // `revoke()` short-circuits on a falsy token and deletes by token hash,
      // so an unknown hash simply matches no row.
      await sessions.revoke(typeof token === 'string' ? token : null)
    },

    /**
     * Resolves a session token to the user it belongs to.
     *
     * Returns null for anything that is not a live session — absent, unknown,
     * revoked or past either expiry bound — and null again if the session
     * outlived the account it points at, so a deleted user cannot be revived
     * by an old cookie.
     *
     * Read-only with respect to the idle window: extending it is the
     * middleware's job (Requirement 2.5), which keeps this usable for a plain
     * lookup that should not itself count as activity.
     */
    async currentUser(token) {
      const { users, sessions } = deps()

      const session = await sessions.verify(typeof token === 'string' ? token : null)
      if (!session) return null

      const user = await users.findById(session.userId)
      if (!user) return null

      return toPublicUser(user)
    },
  }
}

// ---------------------------------------------------------------------------
// Process-wide instance
// ---------------------------------------------------------------------------

let instance: AuthService | null = null

/** The service used by route code, bound to the process-wide database. */
export function getAuthService(): AuthService {
  instance ??= createAuthService()
  return instance
}
