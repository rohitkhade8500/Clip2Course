import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ApiError } from '../services/apiClient'
import Login, { readInternalPath, toLoginErrors } from './Login'

/** Hoisted so the module mock below can reach it during import. */
const auth = vi.hoisted(() => ({
  status: 'anonymous' as 'checking' | 'authenticated' | 'anonymous',
  login: vi.fn<(email: string, password: string) => Promise<void>>(),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    status: auth.status,
    user: null,
    login: auth.login,
    register: vi.fn(),
    logout: vi.fn(),
    handleUnauthorized: () => false,
  }),
}))

const EMAIL = 'ada@example.com'
const PASSWORD = 'correct horse battery staple'

beforeEach(() => {
  auth.status = 'anonymous'
  auth.login.mockReset()
  auth.login.mockResolvedValue(undefined)
})

function renderLogin(state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state }]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/app/dashboard" element={<p>dashboard page</p>} />
        <Route path="/app/course/7" element={<p>course page</p>} />
      </Routes>
    </MemoryRouter>
  )
}

const emailField = () => screen.getByLabelText('Email')
const passwordField = () => screen.getByLabelText('Password')
/** Matches both the idle ("Sign in") and in-flight ("Signing in…") labels. */
const submitButton = () => screen.getByRole('button', { name: /sign(ing)? in/i })

function fillForm(email = EMAIL, password = PASSWORD) {
  fireEvent.change(emailField(), { target: { value: email } })
  fireEvent.change(passwordField(), { target: { value: password } })
}

/** A promise whose settlement the test controls. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('Login page', () => {
  it('renders labelled email and password fields, password marked current-password', () => {
    renderLogin()

    expect(emailField()).toBeInTheDocument()
    const password = passwordField()
    expect(password).toHaveAttribute('type', 'password')
    // Requirement 9.5
    expect(password).toHaveAttribute('autocomplete', 'current-password')
  })

  it('reports empty fields without calling the server', () => {
    renderLogin()

    fireEvent.click(submitButton())

    expect(screen.getByText('Enter your email address.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
    expect(auth.login).not.toHaveBeenCalled()
  })

  it('disables the submit control while the request is in flight', async () => {
    const pending = deferred<void>()
    auth.login.mockReturnValue(pending.promise)

    renderLogin()
    fillForm()
    fireEvent.click(submitButton())

    // Requirement 9.6
    await waitFor(() => expect(submitButton()).toBeDisabled())

    // A second click while disabled must not produce a second request
    fireEvent.click(submitButton())
    expect(auth.login).toHaveBeenCalledTimes(1)

    await act(async () => {
      pending.resolve()
    })
  })

  it('returns to the originally attempted path on success', async () => {
    renderLogin({ from: '/app/course/7' })
    fillForm()
    fireEvent.click(submitButton())

    // Requirement 6.3
    await waitFor(() => expect(screen.getByText('course page')).toBeInTheDocument())
    expect(auth.login).toHaveBeenCalledWith(EMAIL, PASSWORD)
  })

  it('lands on the dashboard when no path was attempted', async () => {
    renderLogin()
    fillForm()
    fireEvent.click(submitButton())

    await waitFor(() =>
      expect(screen.getByText('dashboard page')).toBeInTheDocument()
    )
  })

  it('ignores an off-site attempted path', async () => {
    renderLogin({ from: '//evil.example/steal' })
    fillForm()
    fireEvent.click(submitButton())

    await waitFor(() =>
      expect(screen.getByText('dashboard page')).toBeInTheDocument()
    )
  })

  it('shows the uniform 401 message as text', async () => {
    auth.login.mockRejectedValue(
      new ApiError('Email or password is incorrect', { status: 401 })
    )

    renderLogin()
    fillForm()
    fireEvent.click(submitButton())

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Email or password is incorrect'
      )
    )
    expect(submitButton()).not.toBeDisabled()
  })

  it('renders a crafted error message as plain text, not markup', async () => {
    auth.login.mockRejectedValue(
      new ApiError('<img src=x onerror="alert(1)">bad', { status: 401 })
    )

    renderLogin()
    fillForm()
    fireEvent.click(submitButton())

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        '<img src=x onerror="alert(1)">bad'
      )
    )
    expect(screen.getByRole('alert').querySelector('img')).toBeNull()
  })

  it('attaches a validation error to the field it belongs to', async () => {
    auth.login.mockRejectedValue(
      new ApiError('Please check the highlighted fields and try again.', {
        status: 400,
        fieldErrors: { password: 'Password must be at least 12 characters.' },
      })
    )

    renderLogin()
    fillForm(EMAIL, 'short')
    fireEvent.click(submitButton())

    // Requirement 10.4
    const message = await screen.findByText(
      'Password must be at least 12 characters.'
    )
    const password = passwordField()
    expect(password).toHaveAttribute('aria-invalid', 'true')
    expect(password).toHaveAttribute('aria-describedby', message.id)
    expect(emailField()).not.toHaveAttribute('aria-invalid')
  })

  it('shows the wait time on a 429', async () => {
    auth.login.mockRejectedValue(
      new ApiError('Too many attempts.', {
        status: 429,
        retryAfterSeconds: 120,
      })
    )

    renderLogin()
    fillForm()
    fireEvent.click(submitButton())

    // Requirement 10.3
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Try again in 2 minutes.')
    )
  })

  it('distinguishes a connection failure and offers a retry', async () => {
    auth.login.mockRejectedValue(
      new ApiError("Can't reach the server. Check your connection and try again.", {
        status: 0,
        isNetworkError: true,
      })
    )

    renderLogin()
    fillForm()
    fireEvent.click(submitButton())

    // Requirement 10.1
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent("Can't reach the server")
    )

    const retry = screen.getByRole('button', { name: 'Try again' })
    auth.login.mockResolvedValue(undefined)
    fireEvent.click(retry)

    await waitFor(() =>
      expect(screen.getByText('dashboard page')).toBeInTheDocument()
    )
    expect(auth.login).toHaveBeenCalledTimes(2)
  })

  it('redirects an already-signed-in visitor to the dashboard', () => {
    auth.status = 'authenticated'

    renderLogin()

    // Requirement 6.4
    expect(screen.getByText('dashboard page')).toBeInTheDocument()
  })

  it('shows a loading state while the session check is in flight', () => {
    auth.status = 'checking'

    renderLogin()

    // Requirement 6.7
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
  })
})

describe('readInternalPath', () => {
  it('accepts a same-site path and rejects everything else', () => {
    expect(readInternalPath({ from: '/app/courses' })).toBe('/app/courses')
    expect(readInternalPath({ from: '//evil.example' })).toBeNull()
    expect(readInternalPath({ from: 'https://evil.example' })).toBeNull()
    expect(readInternalPath({ from: 42 })).toBeNull()
    expect(readInternalPath(null)).toBeNull()
    expect(readInternalPath(undefined)).toBeNull()
  })
})

describe('toLoginErrors', () => {
  it('falls back to a generic retryable message for a non-ApiError', () => {
    const errors = toLoginErrors(new Error('boom'))

    expect(errors.form).toBe('Something went wrong. Please try again.')
    expect(errors.retryable).toBe(true)
  })

  it('handles a 429 with no Retry-After header', () => {
    const errors = toLoginErrors(new ApiError('slow down', { status: 429 }))

    expect(errors.form).toContain('Please wait a moment')
  })

  it('surfaces a field error for a field this form does not render', () => {
    const errors = toLoginErrors(
      new ApiError('bad request', {
        status: 400,
        fieldErrors: { displayName: 'Display name is too long.' },
      })
    )

    expect(errors.form).toBe('Display name is too long.')
  })
})
