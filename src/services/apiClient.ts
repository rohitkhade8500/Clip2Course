/**
 * One wrapper for every call to the auth server.
 *
 * Sessions live in an httpOnly cookie the client cannot read, so every request
 * must carry `credentials: 'include'` and state-changing requests must echo the
 * readable CSRF cookie back in `X-CSRF-Token` (design.md, "CSRF"). Centralising
 * that here means no call site can forget it.
 *
 * The other job is classification: a dropped connection and a 401 mean very
 * different things. Only the 401 should sign a user out (Requirement 10.2), so
 * `ApiError.isNetworkError` keeps them apart.
 */

/** Prefix for every auth endpoint. Same-origin, so the dev proxy handles it. */
export const API_PREFIX = '/api'

/** Readable double-submit cookie set by `GET /api/auth/csrf` (server config). */
export const CSRF_COOKIE = 'c2c_csrf'

/** Header the server compares against the CSRF cookie. */
export const CSRF_HEADER = 'X-CSRF-Token'

/** Endpoint that issues the readable CSRF cookie. */
export const CSRF_PATH = '/auth/csrf'

/** Status used when the request never reached the server. */
export const NETWORK_ERROR_STATUS = 0

/** Message shown when the backend is unreachable (Requirement 10.1). */
export const NETWORK_ERROR_MESSAGE =
  "Can't reach the server. Check your connection and try again."

/** Per-field validation messages, keyed by field name (Requirement 10.4). */
export type FieldErrors = Record<string, string>

/** Uniform error body returned by the server: `{ error, fieldErrors }`. */
interface ErrorBody {
  error?: unknown
  fieldErrors?: unknown
}

/**
 * Every failure from `get`/`post` surfaces as one of these, so call sites can
 * branch on `isNetworkError`, `status` and `fieldErrors` instead of guessing.
 */
export class ApiError extends Error {
  /** HTTP status, or {@link NETWORK_ERROR_STATUS} when nothing came back. */
  readonly status: number

  /** Field-keyed validation messages from a 400, when the server sent any. */
  readonly fieldErrors?: FieldErrors

  /** Seconds to wait, parsed from `Retry-After` on a 429 (Requirement 10.3). */
  readonly retryAfterSeconds?: number

  /** True only when the request failed before the server answered. */
  readonly isNetworkError: boolean

  constructor(
    message: string,
    init: {
      status: number
      fieldErrors?: FieldErrors
      retryAfterSeconds?: number
      isNetworkError?: boolean
      cause?: unknown
    }
  ) {
    super(message, { cause: init.cause })
    this.name = 'ApiError'
    this.status = init.status
    this.fieldErrors = init.fieldErrors
    this.retryAfterSeconds = init.retryAfterSeconds
    this.isNetworkError = init.isNetworkError ?? false
  }
}

/** Reads a cookie value by name, or null when it is absent. */
export function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null

  for (const part of document.cookie.split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1) continue

    const key = part.slice(0, separator).trim()
    if (key !== name) continue

    try {
      return decodeURIComponent(part.slice(separator + 1).trim())
    } catch {
      // A malformed percent-escape shouldn't take down the request
      return part.slice(separator + 1).trim()
    }
  }

  return null
}

/** GET a JSON resource. Never sends a CSRF header; GET is not state-changing. */
export async function get<T>(path: string): Promise<T> {
  return request<T>('GET', path)
}

/**
 * POST a JSON body. Fetches the CSRF cookie first when the browser doesn't
 * hold one yet, so the very first state-changing call still succeeds.
 */
export async function post<T>(path: string, body?: unknown): Promise<T> {
  const token = await ensureCsrfToken(path)
  return request<T>('POST', path, body, token)
}

export const apiClient = { get, post }

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  csrfToken?: string | null
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }

  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (csrfToken) headers[CSRF_HEADER] = csrfToken

  let response: Response
  try {
    response = await fetch(toUrl(path), {
      method,
      // The session cookie is the credential; without this it isn't sent
      credentials: 'include',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (cause) {
    // fetch only rejects when the request never completed: DNS failure,
    // connection refused, offline, abort. Not a 401 — the user stays signed in.
    throw new ApiError(NETWORK_ERROR_MESSAGE, {
      status: NETWORK_ERROR_STATUS,
      isNetworkError: true,
      cause,
    })
  }

  if (!response.ok) throw await toApiError(response)

  return (await readJson(response)) as T
}

function toUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  const normalized = path.startsWith('/') ? path : `/${path}`
  return normalized.startsWith(`${API_PREFIX}/`)
    ? normalized
    : `${API_PREFIX}${normalized}`
}

/**
 * Returns the CSRF token for a state-changing call, requesting one when the
 * cookie is missing. A failure to obtain it is not fatal here: the server's
 * rejection carries a clearer message than anything invented client-side.
 */
async function ensureCsrfToken(path: string): Promise<string | null> {
  const existing = readCookie(CSRF_COOKIE)
  if (existing) return existing

  // Avoid recursing when the CSRF endpoint itself is being called
  if (toUrl(path) === toUrl(CSRF_PATH)) return null

  try {
    await request<unknown>('GET', CSRF_PATH)
  } catch {
    return null
  }

  return readCookie(CSRF_COOKIE)
}

async function toApiError(response: Response): Promise<ApiError> {
  const body = (await readJson(response)) as ErrorBody | null

  const message =
    typeof body?.error === 'string' && body.error.trim().length > 0
      ? body.error
      : defaultMessage(response.status)

  return new ApiError(message, {
    status: response.status,
    fieldErrors: toFieldErrors(body?.fieldErrors),
    retryAfterSeconds:
      response.status === 429
        ? parseRetryAfter(response.headers.get('Retry-After'))
        : undefined,
  })
}

/** Only string-valued entries are kept, so a crafted body can't smuggle objects. */
function toFieldErrors(raw: unknown): FieldErrors | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined
  }

  const fieldErrors: FieldErrors = {}
  for (const [field, message] of Object.entries(raw)) {
    if (typeof message === 'string') fieldErrors[field] = message
  }

  return Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined
}

/** `Retry-After` is either delta-seconds or an HTTP date (RFC 9110). */
function parseRetryAfter(raw: string | null): number | undefined {
  if (raw === null) return undefined

  const value = raw.trim()
  if (value.length === 0) return undefined

  if (/^\d+$/.test(value)) return Number(value)

  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return undefined

  return Math.max(0, Math.ceil((timestamp - Date.now()) / 1000))
}

/** Parses a JSON body, tolerating an empty or non-JSON response. */
async function readJson(response: Response): Promise<unknown> {
  let text: string
  try {
    text = await response.text()
  } catch {
    return null
  }

  if (text.trim().length === 0) return null

  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

function defaultMessage(status: number): string {
  switch (status) {
    case 400:
      return 'Please check the highlighted fields and try again.'
    case 401:
      return 'Email or password is incorrect'
    case 404:
      return 'That resource could not be found.'
    case 413:
      return 'That request was too large.'
    case 429:
      return 'Too many attempts. Please wait before trying again.'
    default:
      return status >= 500
        ? 'Something went wrong on our end. Please try again.'
        : `Request failed with status ${status}.`
  }
}
