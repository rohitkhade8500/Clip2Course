/**
 * Central configuration for the auth server.
 *
 * Everything security-relevant that has a number attached to it lives here:
 * hashing cost, session lifetimes, cookie names, body size and rate limits.
 * Keeping them in one module means they can be reviewed together and raised
 * without hunting through route code (see design.md, "Argon2id parameters").
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// --- Environment -----------------------------------------------------------

/** Node environment, defaulting to development when unset. */
export const NODE_ENV = process.env.NODE_ENV ?? 'development'

export const IS_PRODUCTION = NODE_ENV === 'production'
export const IS_TEST = NODE_ENV === 'test'

/** HTTP port for the Express server. Falls back to 3001 when unset or invalid. */
export const PORT = parsePort(process.env.PORT, 3001)

/**
 * SQLite file location. `:memory:` is honoured so tests can run against a
 * throwaway database (task 1.3).
 */
export const DATABASE_FILE =
  process.env.DATABASE_FILE ?? resolveDataPath('clip2course.sqlite')

// --- Time helpers ----------------------------------------------------------

const SECOND_MS = 1000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

// --- Password hashing (Requirement 4.5) ------------------------------------

/**
 * Argon2id parameters. `type: 2` is argon2id — spelled as a literal so this
 * module stays free of a native-module import.
 *
 * 64 MiB / 3 passes / 1 lane targets ≥100ms on the reference hardware, which
 * is what makes offline cracking of a leaked database expensive. The encoded
 * hash records the parameters used, so raising these later does not invalidate
 * existing hashes.
 */
export const ARGON2_OPTIONS = {
  type: 2 as const,
  memoryCost: 64 * 1024, // KiB
  timeCost: 3,
  parallelism: 1,
} satisfies {
  type: 2
  memoryCost: number
  timeCost: number
  parallelism: number
}

/** Minimum hashing time we expect from ARGON2_OPTIONS, for the benchmark. */
export const ARGON2_TARGET_MIN_MS = 100

// --- Password and email policy (Requirements 1.2, 1.5) ---------------------

export const MIN_PASSWORD_LENGTH = 12
export const MAX_PASSWORD_LENGTH = 1024
export const MAX_EMAIL_LENGTH = 254

// --- Sessions (Requirements 2.4, 5.5, 5.6) ---------------------------------

/** Absolute session lifetime: 30 days from issue, never extended. */
export const SESSION_ABSOLUTE_TTL_MS = 30 * DAY_MS

/** Inactivity lifetime: 7 days from last use, extended on each request. */
export const SESSION_IDLE_TTL_MS = 7 * DAY_MS

/** Bytes of entropy in a raw session token (256 bits). */
export const SESSION_TOKEN_BYTES = 32

export const SESSION_COOKIE = 'c2c_session'
export const CSRF_COOKIE = 'c2c_csrf'
export const CSRF_HEADER = 'x-csrf-token'
export const CSRF_TOKEN_BYTES = 32

/** Max JSON body accepted on auth endpoints (Requirement 5.6). */
export const BODY_LIMIT = '100kb'
export const BODY_LIMIT_BYTES = 100 * 1024

// --- Rate limits (Requirements 4.1, 4.3) -----------------------------------

export const RATE_LIMITS = {
  /** 10 login attempts per email address per 15 minutes. */
  loginPerEmail: { windowMs: 15 * MINUTE_MS, max: 10 },
  /** 30 login attempts per client IP per 15 minutes. */
  loginPerIp: { windowMs: 15 * MINUTE_MS, max: 30 },
  /** 5 registrations per client IP per hour. */
  registerPerIp: { windowMs: HOUR_MS, max: 5 },
} as const

/** Longest rate-limit window; rows older than this are prunable. */
export const RATE_LIMIT_MAX_WINDOW_MS = Math.max(
  ...Object.values(RATE_LIMITS).map((limit) => limit.windowMs),
)

/** How often the background prune of expired sessions/attempts runs. */
export const CLEANUP_INTERVAL_MS = 15 * MINUTE_MS

// --- Common-password list (Requirement 1.2) --------------------------------

/**
 * The 10,000 most common passwords, lowercased, loaded once at startup.
 * Source: SecLists 10k-most-common.
 */
export const COMMON_PASSWORDS: ReadonlySet<string> = loadCommonPasswords()

// --- Internals -------------------------------------------------------------

function parsePort(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw)
  const isValid =
    Number.isInteger(parsed) && parsed > 0 && parsed <= 65535
  return isValid ? parsed : fallback
}

/** Resolves a file in `server/data`, which sits beside both `src` and `dist`. */
function resolveDataPath(fileName: string): string {
  return fileURLToPath(new URL(`../data/${fileName}`, import.meta.url))
}

function loadCommonPasswords(): ReadonlySet<string> {
  const path = resolveDataPath('common-passwords.txt')

  let contents: string
  try {
    contents = readFileSync(path, 'utf8')
  } catch (cause) {
    // Failing fast beats silently accepting "password123" forever.
    throw new Error(
      `Common-password list missing at ${path}. The password policy in ` +
        'Requirement 1.2 cannot be enforced without it.',
      { cause },
    )
  }

  const passwords = new Set<string>()
  for (const line of contents.split('\n')) {
    const password = line.trim().toLowerCase()
    if (password.length > 0) passwords.add(password)
  }

  return passwords
}
