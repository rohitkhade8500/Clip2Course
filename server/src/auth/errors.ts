/**
 * Auth error types.
 *
 * The service layer throws these; the HTTP layer (task 5.2) maps them onto the
 * uniform response shape in design.md — 400 with `fieldErrors`, 429 with
 * `Retry-After`. Keeping them in their own module means the route code can
 * import the mapping data without importing the service.
 *
 * None of these carries a password, a hash, or a database message: the client
 * only ever sees what the requirements say it may see (Requirement 10.5).
 */

import type { FieldErrors } from './validation.ts'

/**
 * The submitted registration data broke the account policy.
 *
 * `fieldErrors` is keyed by request body field so the client can render each
 * message against the input that failed (Requirements 1.3, 1.8, 10.4).
 */
export class ValidationError extends Error {
  readonly fieldErrors: FieldErrors

  constructor(fieldErrors: FieldErrors, message = 'Please correct the highlighted fields') {
    super(message)
    this.name = 'ValidationError'
    this.fieldErrors = fieldErrors
  }
}

/**
 * A rate-limit window is full (Requirements 4.2, 4.3).
 *
 * The message is deliberately free of any hint about whether the attempted
 * credentials were valid — that is the whole point of answering 429 before
 * doing any lookup work.
 */
export class RateLimitError extends Error {
  readonly retryAfterSeconds: number

  constructor(retryAfterSeconds: number, message = 'Too many attempts. Try again later.') {
    super(message)
    this.name = 'RateLimitError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}
/**
 * The submitted credentials did not identify an account (Requirement 2.2).
 *
 * One error, one message, for both an unknown email and a wrong password. The
 * default message is the literal text the requirement names, and callers are
 * expected to leave it alone: a variation per case would be exactly the
 * disclosure the uniform message exists to prevent.
 */
export class AuthError extends Error {
  /** HTTP status the route layer answers with. */
  readonly status = 401

  constructor(message = 'Email or password is incorrect') {
    super(message)
    this.name = 'AuthError'
  }
}
