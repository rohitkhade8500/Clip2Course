/**
 * Route table behaviour (Requirements 6.1, 6.4, 6.5, 6.6).
 *
 * The real `App`, `AuthProvider` and pages are rendered; only the network
 * boundary is stubbed, so what these check is the wiring — which paths need a
 * session and which do not — rather than a mocked-out approximation of it.
 */

import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import App from './App'

const USER = { id: 'user-1', email: 'ada@example.com', displayName: 'Ada' }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Every request resolves to a signed-in user. */
function stubAuthenticated() {
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ user: USER })))
}

/** Every request is rejected as unauthenticated. */
function stubAnonymous() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => jsonResponse({ error: 'Unauthorized' }, 401))
  )
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App routes', () => {
  it('keeps the landing page reachable without a session', async () => {
    stubAnonymous()

    renderAt('/')

    // Requirement 6.6: no redirect, no login prompt, just the page
    expect(
      await screen.findByRole('heading', { name: /turn any video into a/i })
    ).toBeInTheDocument()
  })

  it('serves the login page at /login', async () => {
    stubAnonymous()

    renderAt('/login')

    expect(
      await screen.findByRole('heading', { name: /welcome back/i })
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute(
      'autocomplete',
      'current-password'
    )
  })

  it('serves the registration page at /register', async () => {
    stubAnonymous()

    renderAt('/register')

    expect(
      await screen.findByRole('heading', { name: /create your account/i })
    ).toBeInTheDocument()
  })

  it.each([
    '/app/dashboard',
    '/app/create',
    '/app/courses',
    '/app/course/abc-123',
  ])('sends an anonymous visitor from %s to the login page', async (path) => {
    stubAnonymous()

    renderAt(path)

    // Requirement 6.5: every /app path sits behind the guard
    expect(
      await screen.findByRole('heading', { name: /welcome back/i })
    ).toBeInTheDocument()
  })

  it('renders the dashboard at /app/dashboard for a signed-in user', async () => {
    stubAuthenticated()

    renderAt('/app/dashboard')

    expect(
      await screen.findByRole('heading', { name: 'Ada' })
    ).toBeInTheDocument()
  })

  it.each(['/login', '/register'])(
    'redirects a signed-in user away from %s to the dashboard',
    async (path) => {
      stubAuthenticated()

      renderAt(path)

      // Requirement 6.4
      expect(
        await screen.findByRole('heading', { name: 'Ada' })
      ).toBeInTheDocument()
    }
  )

  it('renders the not-found page for an unknown path', async () => {
    stubAnonymous()

    renderAt('/nope')

    expect(await screen.findByText(/404/i)).toBeInTheDocument()
  })
})
