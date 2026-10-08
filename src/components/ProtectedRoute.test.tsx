/**
 * Guard behaviour across all three auth statuses (Requirements 6.2, 6.7).
 *
 * The real AuthProvider is used and only the network boundary is stubbed, so
 * these exercise the actual `checking → authenticated | anonymous` transition
 * rather than a hand-written status value.
 */

import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider } from '../context/AuthContext'
import ProtectedRoute from './ProtectedRoute'

const USER = { id: 'user-1', email: 'a@b.co', displayName: 'Ada' }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Renders the login page's view of where the visitor was headed. */
function LoginProbe() {
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? 'none'
  return <div data-testid="login">login from: {from}</div>
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginProbe />} />
          <Route element={<ProtectedRoute />}>
            <Route
              path="/app/dashboard"
              element={<div data-testid="protected">dashboard</div>}
            />
            <Route path="/app/course/:id" element={<Outlet />} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ProtectedRoute', () => {
  it('renders a loading state while the session check is in flight', () => {
    // Never settles, so the provider stays in 'checking'
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))

    renderAt('/app/dashboard')

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByTestId('login')).not.toBeInTheDocument()
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument()
  })

  it('renders the protected route once the session resolves', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ user: USER })))

    renderAt('/app/dashboard')

    expect(await screen.findByTestId('protected')).toBeInTheDocument()
    expect(screen.queryByTestId('login')).not.toBeInTheDocument()
  })

  it('redirects an anonymous visitor to /login, preserving the attempted path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'Unauthorized' }, 401))
    )

    renderAt('/app/dashboard')

    expect(await screen.findByTestId('login')).toHaveTextContent(
      'login from: /app/dashboard'
    )
  })

  it('preserves a dynamic path with a query string', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'Unauthorized' }, 401))
    )

    renderAt('/app/course/abc-123?tab=quiz')

    expect(await screen.findByTestId('login')).toHaveTextContent(
      'login from: /app/course/abc-123?tab=quiz'
    )
  })

  it('never shows the login page to a signed-in user (no login flash)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ user: USER })))

    renderAt('/app/dashboard')

    // The spinner, not /login, is what fills the gap before the check settles
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByTestId('login')).not.toBeInTheDocument()

    await waitFor(() => expect(screen.getByTestId('protected')).toBeInTheDocument())
    expect(screen.queryByTestId('login')).not.toBeInTheDocument()
  })
})
