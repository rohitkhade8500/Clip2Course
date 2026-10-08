/**
 * Registration page at `/register` (Requirement 6.1).
 *
 * Three things here are deliberate rather than incidental:
 *
 * - The password policy is stated inline *before* submission and checked
 *   client-side, so the common failure is caught without a round trip
 *   (Requirements 1.2, 1.3). The server still re-validates; this is UX only.
 * - Submit is disabled for the whole flight, because a double click on a slow
 *   connection is exactly how duplicate account attempts happen
 *   (Requirement 9.6).
 * - Registering an address that already exists resolves successfully but
 *   without a session, by design (Requirement 1.4). This page must therefore
 *   say something that reads the same either way, and never hint that the
 *   address was taken.
 *
 * The password lives in component state only as long as the form is mounted:
 * it is never written to a store and never logged (Requirements 9.2, 9.3).
 */

import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ApiError } from '../services/apiClient'

/** Mirrors the server policy in `server/src/auth/validation.ts`. */
export const MIN_PASSWORD_LENGTH = 12

/** Where a new (or already-signed-in) account lands. */
const DASHBOARD_PATH = '/app/dashboard'

/**
 * Shown once registration resolves without a session. That happens only on the
 * already-registered path, so the wording has to work for a user who genuinely
 * forgot they had an account without confirming anything to someone probing.
 */
const AMBIGUOUS_OUTCOME_MESSAGE =
  'That address is ready to use. Sign in to continue.'

type FieldErrors = Record<string, string>

/**
 * Client-side mirror of `validateRegistration`. Returns a field-keyed map so
 * the messages render in the same place as the server's (Requirement 10.4).
 */
export function validateRegisterForm(
  email: string,
  password: string
): FieldErrors {
  const errors: FieldErrors = {}
  const trimmedEmail = email.trim()

  if (trimmedEmail.length === 0) {
    errors.email = 'Email is required'
  } else if (trimmedEmail.length > 254 || !/^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(trimmedEmail)) {
    errors.email = 'Enter a valid email address'
  }

  if (password.length === 0) {
    errors.password = 'Password is required'
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters`
  }

  return errors
}

export default function Register() {
  const { status, register } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Covers both Requirement 6.4 (an authenticated visitor never sees this page)
  // and the success path: adopting the new user flips status, which re-renders
  // here and navigates.
  if (status === 'authenticated') {
    return <Navigate to={DASHBOARD_PATH} replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    setFormError(null)
    setNotice(null)

    // Requirement 1.3: name the unmet rule before spending a request on it
    const clientErrors = validateRegisterForm(email, password)
    setFieldErrors(clientErrors)
    if (Object.keys(clientErrors).length > 0) return

    setSubmitting(true)
    try {
      const trimmedName = displayName.trim()
      await register(
        email.trim(),
        password,
        trimmedName.length > 0 ? trimmedName : undefined
      )
      // Reached only when no session was issued — see AMBIGUOUS_OUTCOME_MESSAGE.
      // On the created-account path `status` is already 'authenticated' and the
      // redirect above wins.
      setNotice(AMBIGUOUS_OUTCOME_MESSAGE)
      setPassword('')
    } catch (error) {
      applyError(error)
    } finally {
      // Requirement 9.6: re-enabled only once the response has landed
      setSubmitting(false)
    }
  }

  function applyError(error: unknown) {
    if (error instanceof ApiError) {
      if (error.isNetworkError) {
        setFormError(error.message)
        return
      }

      if (error.status === 429) {
        const wait = error.retryAfterSeconds
        setFormError(
          wait === undefined
            ? error.message
            : `Too many attempts. Try again in ${wait}s.`
        )
        return
      }

      // Requirement 10.4: server messages go against the field that failed
      if (error.fieldErrors) setFieldErrors(error.fieldErrors)
      setFormError(error.fieldErrors ? null : error.message)
      return
    }

    setFormError('Something went wrong. Please try again.')
  }

  const describedBy = (field: string, hintId?: string) =>
    [fieldErrors[field] ? `${field}-error` : null, hintId]
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 px-4 py-12">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold mb-1">Create your account</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
          Your courses stay private to you.
        </p>

        <form
          onSubmit={handleSubmit}
          noValidate
          aria-labelledby="register-heading"
          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-5"
        >
          <h2 id="register-heading" className="sr-only">
            Registration form
          </h2>

          {/* Connection, rate-limit and generic failures. Plain text only
              (Requirement 9.4) — never dangerouslySetInnerHTML. */}
          {formError !== null && (
            <p
              role="alert"
              className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2"
            >
              {formError}
            </p>
          )}

          {notice !== null && (
            <p
              role="status"
              className="text-sm text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700/40 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2"
            >
              {notice}
            </p>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              maxLength={254}
              required
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={describedBy('email')}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {fieldErrors.email && (
              <p
                id="email-error"
                role="alert"
                className="mt-1 text-sm text-red-600 dark:text-red-400"
              >
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              // Requirement 9.5: tells password managers to offer a new one
              autoComplete="new-password"
              required
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={describedBy('password', 'password-policy')}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {/* Requirement 1.2 stated up front, not discovered on rejection */}
            <p
              id="password-policy"
              className="mt-1 text-sm text-slate-500 dark:text-slate-400"
            >
              Use at least {MIN_PASSWORD_LENGTH} characters. Avoid common
              passwords.
            </p>
            {fieldErrors.password && (
              <p
                id="password-error"
                role="alert"
                className="mt-1 text-sm text-red-600 dark:text-red-400"
              >
                {fieldErrors.password}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="displayName"
              className="block text-sm font-medium mb-1"
            >
              Display name{' '}
              <span className="font-normal text-slate-500 dark:text-slate-400">
                (optional)
              </span>
            </label>
            <input
              id="displayName"
              name="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="nickname"
              aria-invalid={fieldErrors.displayName ? true : undefined}
              aria-describedby={describedBy('displayName', 'display-name-hint')}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p
              id="display-name-hint"
              className="mt-1 text-sm text-slate-500 dark:text-slate-400"
            >
              Defaults to the first part of your email.
            </p>
            {fieldErrors.displayName && (
              <p
                id="displayName-error"
                role="alert"
                className="mt-1 text-sm text-red-600 dark:text-red-400"
              >
                {fieldErrors.displayName}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-sm text-center text-slate-600 dark:text-slate-400">
          Already have an account?{' '}
          <Link
            to="/login"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
