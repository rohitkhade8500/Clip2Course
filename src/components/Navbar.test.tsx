/**
 * Authenticated navigation (Requirements 7.8, 3.3).
 *
 * The real AuthProvider is used with only the network boundary stubbed, so the
 * nav is exercised across the actual `checking → authenticated | anonymous`
 * transition rather than a hand-written status.
 */

import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../context/AuthContext'
import Navbar from './Navbar'

const USER = { id: 'user-1', email: 'ada@example.com', displayName: 'Ada' }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function renderNavbar() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Navbar />
      </AuthProvider>
    </MemoryRouter>
  )
}

/** The desktop primary call-to-action, whose destination depends on auth. */
function cta(): HTMLAnchorElement {
  const element = document.getElementById('nav-cta')
  if (!(element instanceof HTMLAnchorElement)) throw new Error('CTA not rendered')
  return element
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Navbar', () => {
  it('shows the display name and a logout control when signed in', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ user: USER })))

    renderNavbar()

    expect(await screen.findByText('Ada')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('points the primary call-to-action at the dashboard when signed in', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ user: USER })))

    renderNavbar()

    await waitFor(() => expect(cta()).toHaveAttribute('href', '/app/dashboard'))
    expect(cta()).toHaveTextContent('Dashboard')
  })

  it('shows sign in and create account links when anonymous', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'Unauthorized' }, 401))
    )

    renderNavbar()

    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login'
    )
    expect(cta()).toHaveAttribute('href', '/register')
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument()
  })

  it('renders no auth links while the session check is in flight', () => {
    // Never settles, so the provider stays in 'checking'
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))

    renderNavbar()

    // Neither state may be shown: an anonymous link here would flash at a user
    // who turns out to be signed in
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument()
    expect(document.getElementById('nav-cta')).toBeNull()
  })

  it('logs out and returns to the anonymous nav', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/auth/logout')) return jsonResponse({ ok: true })
      return jsonResponse({ user: USER })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderNavbar()

    fireEvent.click(await screen.findByRole('button', { name: 'Log out' }))

    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByText('Ada')).not.toBeInTheDocument()
    expect(
      fetchMock.mock.calls.some(([input]) =>
        (typeof input === 'string' ? input : String(input)).includes('/auth/logout')
      )
    ).toBe(true)
  })
})
