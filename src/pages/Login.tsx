/**
 * Sign-in page at `/login` (design.md, "Example 4: login form submit").
 *
 * The page owns three responsibilities beyond collecting two fields:
 *
 * - Destination. `ProtectedRoute` stashes the attempted path in location state,
 *   so a successful sign-in returns the user there rather than always dropping
 *   them on the dashboard (Requirements 6.2, 6.3).
 * - Error shape. A rejected credential, a rate limit and an unreachable server
 *   are three different situations and are reported as three different things
 *   (Requirements 10.1, 10.3, 10.4). Every message is rendered as text, never
 *   as markup (Requirement 9.4).
 * - Credential hygiene. The password lives in component state for exactly as
 *   long as the form is on screen, is passed straight to `login()`, and is
 *   never logged or persisted (Requirements 9.2, 9.3).
 */

import { useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ApiError } from '../services/apiClient'

/** Where a successful sign-in lands when no path was attempted first. */
const DEFAULT_DESTINATION = '/app/dashboard'

/** Field-scoped and form-scoped messages for one failed submission. */
export interface LoginErrors {
  email?: string
  password?: string
  /** Shown above the fields when the failure belongs to no single field. */
  form?: string
  /** True for a connection failure, which is worth an explicit retry. */
  retryable?: boolean
}

export default function Login() {
  const { status, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<LoginErrors>({})
  const [submitting, setSubmitting] = useState(false)

  /**
   * Set once this page starts a sign-in. Without it, the redirect below would
   * race the handler's own `navigate` the moment `status` flips to
   * authenticated, and send the user to the dashboard instead of the path they
   * originally asked for.
   */
  const signingIn = useRef(false)

  const destination = readInternalPath(location.state) ?? DEFAULT_DESTINATION

  // Requirement 6.7: never flash the form at someone who is already signed in.
  if (status === 'checking') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900"
      >
        <div
          aria-hidden="true"
          className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"
        />
        <p className="mt-4 text-slate-600 dark:text-slate-400">Checking your session…</p>
      </div>
    )
  }

  // Requirement 6.4: the login page is not a place for a signed-in user.
  if (status === 'authenticated' && !signingIn.current) {
    return <Navigate to={DEFAULT_DESTINATION} replace />
  }

  async function submit() {
    const trimmedEmail = email.trim()

    // Catch the empty cases here so a blank form doesn't spend a rate-limit
    // slot on the server.
    const missing: LoginErrors = {}
    if (trimmedEmail.length === 0) missing.email = 'Enter your email address.'
    if (password.length === 0) missing.password = 'Enter your password.'
    if (missing.email || missing.password) {
      setErrors(missing)
      return
    }

    setSubmitting(true) // Requirement 9.6
    setErrors({})
    signingIn.current = true

    try {
      await login(trimmedEmail, password)
      navigate(destination, { replace: true })
    } catch (error) {
      signingIn.current = false
      setErrors(toLoginErrors(error))
    } finally {
      setSubmitting(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    void submit()
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">Welcome back</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Sign in to reach your courses.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          aria-labelledby="login-heading"
          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm"
        >
          <h2 id="login-heading" className="sr-only">
            Sign in
          </h2>

          {/* Live region so a screen reader announces a failure that belongs to
              no single field. `aria-live` sits on a permanently rendered node,
              otherwise the announcement can be missed. */}
          <div role="alert" aria-live="polite">
            {errors.form && (
              <div className="mb-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3">
                <p className="text-sm text-red-700 dark:text-red-300">{errors.form}</p>
                {errors.retryable && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!submitting) void submit()
                    }}
                    disabled={submitting}
                    className="mt-2 text-sm font-medium text-red-700 dark:text-red-300 underline hover:no-underline disabled:opacity-60"
                  >
                    Try again
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="mb-4">
            <label
              htmlFor="login-email"
              className="block text-sm font-medium mb-1.5"
            >
              Email
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              autoFocus
              required
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? 'login-email-error' : undefined}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.email && (
              <p
                id="login-email-error"
                className="mt-1.5 text-sm text-red-600 dark:text-red-400"
              >
                {errors.email}
              </p>
            )}
          </div>

          <div className="mb-6">
            <label
              htmlFor="login-password"
              className="block text-sm font-medium mb-1.5"
            >
              Password
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              // Requirement 9.5: signing in, so the saved password, not a new one
              autoComplete="current-password"
              required
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={
                errors.password ? 'login-password-error' : undefined
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.password && (
              <p
                id="login-password-error"
                className="mt-1.5 text-sm text-red-600 dark:text-red-400"
              >
                {errors.password}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
          New here?{' '}
          <Link
            to="/register"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Reads the attempted path out of location state.
 *
 * Only same-site paths are accepted: a value that isn't a plain absolute path
 * (`//evil.example`, `https://…`) is discarded, so nothing that reaches
 * location state can turn this into an open redirect.
 */
export function readInternalPath(state: unknown): string | null {
  if (typeof state !== 'object' || state === null) return null

  const from = (state as { from?: unknown }).from
  if (typeof from !== 'string') return null
  if (!from.startsWith('/') || from.startsWith('//')) return null

  return from
}

/**
 * Turns a failed sign-in into the messages the form shows.
 *
 * Field errors from a 400 go against their field (Requirement 10.4); a network
 * failure is named as such and offered a retry (Requirement 10.1); a 429
 * reports the wait (Requirement 10.3); anything else falls back to the server's
 * own message, which for a 401 is the deliberately uniform
 * "Email or password is incorrect" (Requirement 2.2).
 */
export function toLoginErrors(error: unknown): LoginErrors {
  if (!(error instanceof ApiError)) {
    return { form: 'Something went wrong. Please try again.', retryable: true }
  }

  if (error.isNetworkError) {
    return { form: error.message, retryable: true }
  }

  if (error.status === 429) {
    return { form: `Too many attempts. ${describeWait(error.retryAfterSeconds)}` }
  }

  const fieldErrors = error.fieldErrors
  if (fieldErrors) {
    const mapped: LoginErrors = {}
    if (typeof fieldErrors.email === 'string') mapped.email = fieldErrors.email
    if (typeof fieldErrors.password === 'string') {
      mapped.password = fieldErrors.password
    }

    // Anything keyed to a field this form doesn't render still has to be shown
    const unknownField = Object.entries(fieldErrors).find(
      ([field]) => field !== 'email' && field !== 'password'
    )
    if (unknownField) mapped.form = unknownField[1]

    if (mapped.email || mapped.password || mapped.form) return mapped
  }

  return { form: error.message }
}

/** Formats the `Retry-After` wait, falling back when the server sent none. */
function describeWait(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    return 'Please wait a moment before trying again.'
  }

  if (seconds < 60) {
    return `Try again in ${Math.ceil(seconds)} second${
      Math.ceil(seconds) === 1 ? '' : 's'
    }.`
  }

  const minutes = Math.ceil(seconds / 60)
  return `Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
}
