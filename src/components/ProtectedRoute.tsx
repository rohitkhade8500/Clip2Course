/**
 * Navigation guard for the `/app/*` routes (design.md, Example 3).
 *
 * This is navigation only, never security: anyone can edit client state to
 * render a protected page, and it still gets them nothing, because ownership is
 * enforced server-side (Requirement 5). What this does buy us is a predictable
 * journey — and, critically, no login-screen flash for a signed-in user
 * reloading the page, because `'checking'` renders a spinner instead of
 * treating "not yet known" as "not signed in" (Requirement 6.7).
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/** Full-page spinner shown while the session check is in flight. */
function FullPageSpinner() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900"
    >
      <div
        aria-hidden="true"
        className="animate-spin h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full"
      />
      <p className="mt-4 text-slate-600 dark:text-slate-400">Checking your session…</p>
    </div>
  )
}

export default function ProtectedRoute() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'checking') return <FullPageSpinner />

  if (status === 'anonymous') {
    // The attempted path rides along in location state so the login page can
    // return the user to where they were headed (Requirements 6.2, 6.3).
    // `replace` keeps the protected path out of history, so Back doesn't
    // bounce between it and /login.
    return (
      <Navigate
        to="/login"
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
        replace
      />
    )
  }

  return <Outlet />
}
