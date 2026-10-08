/**
 * Rate limiting for the auth endpoints (Requirement 4).
 *
 * Fixed windows, counted from rows in `login_attempts`, so a process restart
 * does not hand an attacker a fresh quota — the counters live in the database
 * rather than in memory.
 *
 * Two things are deliberate here:
 *  - The submitted password never reaches this module. `recordFailure` takes an
 *    email and an IP and nothing else, so there is no path by which a secret
 *    could be persisted (Requirement 4.4).
 *  - `retryAfterSeconds` is derived from the *oldest* attempt still inside the
 *    window: that is the moment the window rolls forward and a slot frees up.
 */

import {
  CLEANUP_INTERVAL_MS,
  RATE_LIMITS,
  RATE_LIMIT_MAX_WINDOW_MS,
} from '../config.ts'
import type { AttemptKind, Db } from '../db/index.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitResult {
  allowed: boolean
  /** Seconds the caller must wait. Always 0 when allowed. */
  retryAfterSeconds: number
}

export interface RateLimiter {
  /** Checks the per-email and per-IP login windows. Records nothing. */
  checkLogin(email: string, ip: string): Promise<RateLimitResult>
  /**
   * Checks the per-IP registration window and, when allowed, records the
   * attempt. Registrations are limited by count rather than by failure, so the
   * check is what consumes the quota — one call per register request.
   */
  checkRegistration(ip: string): Promise<RateLimitResult>
  /** Records one failed login. Never receives or stores the password. */
  recordFailure(email: string, ip: string): Promise<void>
  /** Clears the login counter for an email, called after a successful login. */
  clearFor(email: string): Promise<void>
  /** Deletes attempt rows older than the longest window. Returns rows removed. */
  prune(): number
  /** Stops the periodic prune, if one was started. */
  stop(): void
}

export interface RateLimiterOptions {
  /** Injectable clock so window arithmetic is testable. */
  clock?: () => Date
  /** Start the periodic prune. Off by default so tests stay timer-free. */
  autoPrune?: boolean
  /** Interval for the periodic prune. */
  pruneIntervalMs?: number
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createRateLimiter(
  db: Db,
  options: RateLimiterOptions = {},
): RateLimiter {
  const now = options.clock ?? (() => new Date())
  const pruneIntervalMs = options.pruneIntervalMs ?? CLEANUP_INTERVAL_MS

  /**
   * Counts rows in a window and, if the limit is reached, works out how long
   * until the oldest of them ages out.
   */
  function evaluate(
    limit: { windowMs: number; max: number },
    count: number,
    oldestIso: string | null,
  ): RateLimitResult {
    if (count < limit.max) return ALLOWED

    const oldestMs = oldestIso ? Date.parse(oldestIso) : Number.NaN
    const nowMs = now().getTime()

    // A missing or unparseable timestamp shouldn't turn a denial into an
    // allowance, so fall back to the full window.
    const freesAtMs = Number.isNaN(oldestMs)
      ? nowMs + limit.windowMs
      : oldestMs + limit.windowMs

    return {
      allowed: false,
      retryAfterSeconds: toRetryAfterSeconds(freesAtMs - nowMs),
    }
  }

  function windowStart(windowMs: number): string {
    return new Date(now().getTime() - windowMs).toISOString()
  }

  function checkPerEmail(email: string): RateLimitResult {
    const limit = RATE_LIMITS.loginPerEmail
    const since = windowStart(limit.windowMs)
    const kind: AttemptKind = 'login'

    return evaluate(
      limit,
      db.loginAttempts.countForEmail(email, kind, since),
      db.loginAttempts.oldestForEmail(email, kind, since),
    )
  }

  function checkPerIp(
    ip: string,
    kind: AttemptKind,
    limit: { windowMs: number; max: number },
  ): RateLimitResult {
    const since = windowStart(limit.windowMs)

    return evaluate(
      limit,
      db.loginAttempts.countForIp(ip, kind, since),
      db.loginAttempts.oldestForIp(ip, kind, since),
    )
  }

  function pruneNow(): number {
    const cutoff = new Date(
      now().getTime() - RATE_LIMIT_MAX_WINDOW_MS,
    ).toISOString()
    return db.loginAttempts.pruneOlderThan(cutoff)
  }

  let timer: ReturnType<typeof setInterval> | null = null
  if (options.autoPrune) {
    timer = setInterval(pruneNow, pruneIntervalMs)
    // Never hold the process open just for housekeeping.
    timer.unref?.()
  }

  return {
    async checkLogin(email, ip) {
      // Requirement 4.1: 10 per email and 30 per IP per 15 minutes. Whichever
      // window is further from resetting decides the wait.
      return worseOf(checkPerEmail(normalizeKey(email)), checkPerIp(ip, 'login', RATE_LIMITS.loginPerIp))
    },

    async checkRegistration(ip) {
      // Requirement 4.3: 5 accounts per IP per hour.
      const limit = RATE_LIMITS.registerPerIp
      const result = checkPerIp(ip, 'register', limit)
      if (!result.allowed) return result

      db.loginAttempts.insert({
        email: null,
        ip,
        kind: 'register',
        succeeded: true,
        attemptedAt: now().toISOString(),
      })

      return ALLOWED
    },

    async recordFailure(email, ip) {
      db.loginAttempts.insert({
        email: normalizeKey(email),
        ip,
        kind: 'login',
        succeeded: false,
        attemptedAt: now().toISOString(),
      })
    },

    async clearFor(email) {
      db.loginAttempts.clearForEmail(normalizeKey(email))
    },

    prune() {
      return pruneNow()
    },

    stop() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const ALLOWED: RateLimitResult = { allowed: true, retryAfterSeconds: 0 }

/**
 * Counter keys are case-insensitive, matching the email uniqueness rule
 * (Requirement 1.6). Kept local rather than importing the validator, since a
 * limiter key only needs to be stable, not valid.
 */
function normalizeKey(email: string): string {
  return email.trim().toLowerCase()
}

/** A denial always wins, and between two denials the longer wait wins. */
function worseOf(a: RateLimitResult, b: RateLimitResult): RateLimitResult {
  if (a.allowed && b.allowed) return ALLOWED
  return {
    allowed: false,
    retryAfterSeconds: Math.max(a.retryAfterSeconds, b.retryAfterSeconds),
  }
}

/** Whole seconds, and never 0 — a denial must always ask for a real wait. */
function toRetryAfterSeconds(remainingMs: number): number {
  return Math.max(1, Math.ceil(remainingMs / 1000))
}
