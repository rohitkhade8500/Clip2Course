/**
 * Uniform error mapping (design.md, "Error Handling").
 *
 * Every failure that reaches HTTP is classified exactly once, here, and leaves
 * as the same shape: `{ error, fieldErrors? }`. The client then never has to
 * guess what a response means, and no handler has to remember which status a
 * given failure deserves.
 *
 * The other half of the job is what does *not* leave: stack traces, SQL text
 * and driver messages are logged server-side and replaced with one generic
 * sentence (Requirement 10.5). Anything this module does not recognise is
 * treated as an unexpected fault, so a new error type can only ever leak less
 * than it might have, never more.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { ErrorRequestHandler } from 'express'
import { AuthError, RateLimitError, ValidationError } from '../auth/errors.ts'
import type { FieldErrors } from '../auth/validation.ts'

// ---------------------------------------------------------------------------
// Response bodies
// ---------------------------------------------------------------------------

/** What the client receives for an unexpected server fault (Requirement 10.5). */
export const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.'

/**
 * Answer for a resource that either does not exist or belongs to someone else.
 * One message for both, so existence is never disclosed (Requirement 5.3).
 */
export const NOT_FOUND_MESSAGE = 'Not found'

/** Answer when the body exceeded the configured limit (Requirement 5.6). */
export const BODY_TOO_LARGE_MESSAGE = 'Request body is too large'

/** Answer when a body arrived that is not parseable JSON. */
export const MALFORMED_BODY_MESSAGE = 'Request body is not valid JSON'

export interface ErrorBody {
  error: string
  fieldErrors?: FieldErrors
  retryAfterSeconds?: number
}

/**
 * Requested resource is absent, or belongs to another user.
 *
 * Route code throws this rather than answering 403, because "you may not see
 * this" already confirms the thing exists (Requirement 5.3).
 */
export class NotFoundError extends Error {
  readonly status = 404

  constructor(message = NOT_FOUND_MESSAGE) {
    super(message)
    this.name = 'NotFoundError'
  }
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/** Minimal view of the errors `express.json` raises while parsing a body. */
interface BodyParserError {
  type?: string
  status?: number
  statusCode?: number
}

function bodyParserType(error: unknown): string | null {
  const candidate = error as BodyParserError | null
  return typeof candidate?.type === 'string' ? candidate.type : null
}

export interface Logger {
  (message: string, detail?: unknown): void
}

export interface ErrorHandlerOptions {
  /** Where unexpected-fault detail goes. Defaults to `console.error`. */
  logger?: Logger
}

interface Mapped {
  status: number
  body: ErrorBody
  /** Seconds for the `Retry-After` header, when the status calls for one. */
  retryAfterSeconds?: number
  /** Whether the detail needs logging: true for anything unrecognised. */
  unexpected: boolean
}

/**
 * Maps a thrown value onto a status and body.
 *
 * Exported for the tests, and because the table is easier to review as data
 * than as branches buried in a middleware.
 */
export function classifyError(error: unknown): Mapped {
  // Requirements 1.3, 1.8, 10.4: name every field that failed.
  if (error instanceof ValidationError) {
    return {
      status: 400,
      body: { error: error.message, fieldErrors: error.fieldErrors },
      unexpected: false,
    }
  }

  // Requirements 4.2, 10.3: the client derives the wait from `Retry-After`.
  if (error instanceof RateLimitError) {
    return {
      status: 429,
      body: { error: error.message, retryAfterSeconds: error.retryAfterSeconds },
      retryAfterSeconds: error.retryAfterSeconds,
      unexpected: false,
    }
  }

  // Requirement 2.2: one status, one message, both failure causes.
  if (error instanceof AuthError) {
    return { status: error.status, body: { error: error.message }, unexpected: false }
  }

  // Requirement 5.3.
  if (error instanceof NotFoundError) {
    return { status: 404, body: { error: NOT_FOUND_MESSAGE }, unexpected: false }
  }

  switch (bodyParserType(error)) {
    case 'entity.too.large':
      // Requirement 5.6.
      return { status: 413, body: { error: BODY_TOO_LARGE_MESSAGE }, unexpected: false }
    case 'entity.parse.failed':
    case 'encoding.unsupported':
    case 'charset.unsupported':
      return { status: 400, body: { error: MALFORMED_BODY_MESSAGE }, unexpected: false }
    default:
      break
  }

  // Requirement 10.5: nothing about `error` reaches the client from here.
  return { status: 500, body: { error: GENERIC_ERROR_MESSAGE }, unexpected: true }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Builds the terminal error handler. Mount it last, after every route.
 *
 * When the response has already begun streaming there is no status left to
 * set, so the error is logged and delegated to Express's default handler,
 * which destroys the connection rather than appending nonsense to a body.
 */
export function createErrorHandler(options: ErrorHandlerOptions = {}): ErrorRequestHandler {
  const log: Logger = options.logger ?? ((message, detail) => console.error(message, detail))

  return function errorHandler(
    error: unknown,
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const mapped = classifyError(error)

    if (mapped.unexpected) {
      // Full detail, server-side only: this is the sole record of what broke.
      log(`[clip2course-server] ${req.method} ${req.originalUrl} failed`, error)
    }

    if (res.headersSent) {
      next(error)
      return
    }

    if (mapped.retryAfterSeconds !== undefined) {
      res.setHeader('Retry-After', String(mapped.retryAfterSeconds))
    }

    res.status(mapped.status).json(mapped.body)
  }
}

/** The handler used by `createApp`, logging to the console. */
export const errorHandler: ErrorRequestHandler = createErrorHandler()

/**
 * Terminal 404 for an API path no route claimed.
 *
 * Mounted under `/api` so an unknown endpoint answers with the same shape as
 * every other failure instead of Express's HTML default.
 */
export const apiNotFoundHandler: RequestHandler = function apiNotFound(_req, res) {
  res.status(404).json({ error: NOT_FOUND_MESSAGE } satisfies ErrorBody)
}
