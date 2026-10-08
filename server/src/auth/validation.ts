/**
 * Email normalization and registration validation.
 *
 * These two functions are the single place the registration policy lives, so
 * the HTTP layer and the AuthService cannot drift apart on what counts as a
 * valid email or an acceptable password (design.md, "Key Functions with Formal
 * Specifications").
 *
 * Requirements: 1.2, 1.3, 1.5, 1.6, 1.8, 10.4
 */

import {
  COMMON_PASSWORDS,
  MAX_EMAIL_LENGTH,
  MIN_PASSWORD_LENGTH,
} from '../config.ts'

/**
 * Field-keyed error map. Keys match the request body field names so the client
 * can show each message against the input that failed (Requirements 1.8, 10.4).
 */
export type FieldErrors = Record<string, string>

/**
 * Pragmatic email syntax check.
 *
 * Deliberately not RFC 5322: that grammar admits addresses no mail provider
 * accepts, and a permissive-but-sane pattern is the right trade here. It
 * requires a non-empty local part, an `@`, and a dotted domain — with no
 * whitespace, no empty labels, and no leading or trailing dots anywhere.
 */
const EMAIL_PATTERN =
  /^[^\s@.]+(?:\.[^\s@.]+)*@[^\s@.]+(?:\.[^\s@.]+)+$/

/**
 * Trims surrounding whitespace and lowercases an email address.
 *
 * Uniqueness and login are case-insensitive (Requirement 1.6), and stored
 * addresses are lowercased and trimmed (Requirement 1.5), so every comparison
 * against a stored address goes through here first.
 *
 * Idempotent: `normalizeEmail(normalizeEmail(x)) === normalizeEmail(x)`.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

/**
 * Validates a registration attempt against the account policy.
 *
 * Expects `email` to have been normalized already. Returns an empty object
 * when every rule passes; otherwise a message per failing field naming the
 * unmet rule (Requirement 1.3). Has no side effects and never logs the
 * password (Requirement 1.7).
 *
 * Password rules, in order: present, at least {@link MIN_PASSWORD_LENGTH}
 * characters, and absent from the bundled common-password list
 * (Requirement 1.2). Only the first failing rule per field is reported, since
 * a password that is too short has nothing useful to say about commonness.
 */
export function validateRegistration(
  email: string | undefined | null,
  password: string | undefined | null,
): FieldErrors {
  const errors: FieldErrors = {}

  if (!isNonEmptyString(email)) {
    errors.email = 'Email is required'
  } else if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    errors.email = 'Enter a valid email address'
  }

  if (!isNonEmptyString(password)) {
    errors.password = 'Password is required'
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters`
  } else if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    errors.password = 'This password is too common — choose another'
  }

  return errors
}

/**
 * Guards against a missing field arriving as `undefined`, `null`, a non-string
 * from a hand-rolled JSON body, or an empty string (Requirement 1.8).
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}
