/**
 * Single source of truth for who is signed in (design.md, Component 5).
 *
 * The session itself lives in an httpOnly cookie the client cannot read, so
 * "who am I" is answered by asking the server (`GET /api/auth/me`) rather than
 * by reading any client store. That has three consequences this file exists to
 * handle:
 *
 * - There is a window on every page load where the answer isn't known yet. The
 *   `'checking'` status covers it, so a signed-in user reloading the page never
 *   sees the login screen flash (Requirement 6.7).
 * - Only a 401 means "not signed in". A dropped connection means "unknown", and
 *   must leave a signed-in user signed in (Requirement 10.2).
 * - Passwords are function arguments and nothing else: they go into the request
 *   body and are never stored in state, a store, or a log
 *   (Requirements 9.2, 9.3).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { ApiError, apiClient } from '../services/apiClient'
import { claimUnownedData } from '../services/courseStore'

/** Endpoints, relative to the `/api` prefix apiClient adds. */
const ME_PATH = '/auth/me'
const LOGIN_PATH = '/auth/login'
const REGISTER_PATH = '/auth/register'
const LOGOUT_PATH = '/auth/logout'

/** `'checking'` is the pre-answer state, not an error state. */
export type AuthStatus = 'checking' | 'authenticated' | 'anonymous'

/** The only user fields the server discloses. Never includes a password. */
export interface PublicUser {
  id: string
  email: string
  displayName: string
}

export interface AuthContextValue {
  status: AuthStatus
  user: PublicUser | null
  login(email: string, password: string): Promise<void>
  register(email: string, password: string, displayName?: string): Promise<void>
  logout(): Promise<void>
  /**
   * Hook for Requirement 6.8: hand any failed request's error here and the
   * cached user is cleared if — and only if — it was a 401. Returns true when
   * the error was handled as a sign-out. Network failures are ignored, so an
   * outage cannot log anyone out (Requirement 10.2).
   */
  handleUnauthorized(error: unknown): boolean
}

const anonymousValue: AuthContextValue = {
  status: 'anonymous',
  user: null,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  handleUnauthorized: () => false,
}

const AuthContext = createContext<AuthContextValue>(anonymousValue)

export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking')
  const [user, setUser] = useState<PublicUser | null>(null)

  /** Guards against a state update landing after the provider unmounts. */
  const mounted = useRef(true)

  /** User ids already passed to claimUnownedData, so it runs once each. */
  const claimed = useRef(new Set<string>())

  const adopt = useCallback((next: PublicUser) => {
    if (!mounted.current) return

    setUser(next)
    setStatus('authenticated')

    // Requirement 8.5: courses created before accounts existed have no owner.
    // The first sign-in adopts them. Claiming is idempotent and never touches
    // another user's rows, and a failure here must not break signing in.
    if (claimed.current.has(next.id)) return
    claimed.current.add(next.id)

    void claimUnownedData(next.id).catch((error: unknown) => {
      console.warn('Could not adopt pre-account courses', error)
    })
  }, [])

  const clear = useCallback(() => {
    if (!mounted.current) return

    setUser(null)
    setStatus('anonymous')
  }, [])

  // Restore the session once on mount. Status stays 'checking' until this
  // settles, which is the whole point of having that state.
  useEffect(() => {
    mounted.current = true

    void (async () => {
      try {
        adopt(toPublicUser(await apiClient.get<unknown>(ME_PATH)))
      } catch {
        // Either a 401 (genuinely signed out) or the server was unreachable.
        // With no cached user there is nothing to preserve, so both land on
        // anonymous; ProtectedRoute then sends protected paths to /login.
        clear()
      }
    })()

    return () => {
      mounted.current = false
    }
  }, [adopt, clear])

  const login = useCallback(
    async (email: string, password: string) => {
      // `password` is read straight into the request body and never retained.
      await authenticate(LOGIN_PATH, { email, password }, adopt, clear)
    },
    [adopt, clear]
  )

  const register = useCallback(
    async (email: string, password: string, displayName?: string) => {
      await authenticate(
        REGISTER_PATH,
        displayName === undefined
          ? { email, password }
          : { email, password, displayName },
        adopt,
        clear
      )
    },
    [adopt, clear]
  )

  const logout = useCallback(async () => {
    try {
      await apiClient.post<unknown>(LOGOUT_PATH)
    } catch {
      // Logout is idempotent server-side (Requirement 3.4) and the local user
      // must go regardless: failing to reach the server is not a reason to
      // leave someone signed in on a shared browser (Requirement 3.3).
    } finally {
      claimed.current.clear()
      clear()
    }
  }, [clear])

  const handleUnauthorized = useCallback(
    (error: unknown) => {
      if (!isUnauthorized(error)) return false

      clear()
      return true
    },
    [clear]
  )

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, register, logout, handleUnauthorized }),
    [status, user, login, register, logout, handleUnauthorized]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Shared body of login and register.
 *
 * Registration with an already-registered address returns the same
 * success-shaped response as a new account but without a user or a session
 * cookie (Requirement 1.4). That case is indistinguishable from here by
 * design, so it simply resolves as anonymous — the caller sees no error and
 * cannot learn whether the address existed.
 */
async function authenticate(
  path: string,
  body: { email: string; password: string; displayName?: string },
  adopt: (user: PublicUser) => void,
  clear: () => void
): Promise<void> {
  let payload: unknown
  try {
    payload = await apiClient.post<unknown>(path, body)
  } catch (error) {
    // A rejected credential means anonymous; an unreachable server means
    // unknown, so only the 401 clears anything (Requirement 10.2).
    if (isUnauthorized(error)) clear()
    throw error
  }

  const next = readUser(payload)
  if (next) {
    adopt(next)
    return
  }

  clear()
}

/** True only for a real 401 — never for a network failure. */
function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401 && !error.isNetworkError
}

/** Reads `{ user }` or a bare user object, returning null when neither fits. */
function readUser(payload: unknown): PublicUser | null {
  if (typeof payload !== 'object' || payload === null) return null

  const wrapped = (payload as { user?: unknown }).user
  const candidate = wrapped === undefined ? payload : wrapped

  if (typeof candidate !== 'object' || candidate === null) return null

  const { id, email, displayName } = candidate as Record<string, unknown>
  if (typeof id !== 'string' || id.length === 0) return null
  if (typeof email !== 'string') return null

  return {
    id,
    email,
    displayName: typeof displayName === 'string' ? displayName : email,
  }
}

/** Same as {@link readUser} but treats a missing user as a failed response. */
function toPublicUser(payload: unknown): PublicUser {
  const parsed = readUser(payload)
  if (!parsed) throw new Error('Malformed user payload')
  return parsed
}
