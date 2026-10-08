import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { AuthContextValue, AuthStatus } from '../context/AuthContext'
import { ApiError } from '../services/apiClient'
import Register, { MIN_PASSWORD_LENGTH, validateRegisterForm } from './Register'

/**
 * The page under test needs an auth boundary, so `useAuth` is substituted with
 * a controllable stand-in. Everything else — validation, in-flight locking,
 * error placement, redirect — is the page's real behaviour.
 */
const authState: { status: AuthStatus; register: AuthContextValue['register'] } = {
  status: 'anonymous',
  register: async () => {},
}

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    status: authState.status,
    user: null,
    login: async () => {},
    register: (...args: Parameters<AuthContextValue['register']>) =>
      authState.register(...args),
    logout: async () => {},
    handleUnauthorized: () => false,
  }),
}))

const VALID_PASSWORD = 'correct horse battery'

function renderRegister() {
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="/app/dashboard" element={<h1>Dashboard</h1>} />
      </Routes>
    </MemoryRouter>
  )
}

function fillForm({
  email = 'ada@example.com',
  password = VALID_PASSWORD,
  displayName,
}: { email?: string; password?: string; displayName?: string } = {}) {
  fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: email } })
  fireEvent.change(screen.getByLabelText(/^password$/i), {
    target: { value: password },
  })
  if (displayName !== undefined) {
    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: displayName },
    })
  }
}

/** Matches both the idle ("Create account") and in-flight ("Creating account…") label. */
const submit = () => screen.getByRole('button', { name: /creat(e|ing) account/i })

beforeEach(() => {
  authState.status = 'anonymous'
  authState.register = vi.fn(async () => {})
})

afterEach(() => {
  cleanup()
})

describe('validateRegisterForm', () => {
  it('requires an email and a password', () => {
    expect(validateRegisterForm('', '')).toEqual({
      email: 'Email is required',
      password: 'Password is required',
    })
  })

  it('names the length rule for a short password', () => {
    const errors = validateRegisterForm('ada@example.com', 'a'.repeat(MIN_PASSWORD_LENGTH - 1))
    expect(errors.password).toBe(`Use at least ${MIN_PASSWORD_LENGTH} characters`)
    expect(errors.email).toBeUndefined()
  })

  it('accepts an email at the 254-character limit and rejects one past it', () => {
    const local = 'a'.repeat(254 - '@example.com'.length)
    expect(validateRegisterForm(`${local}@example.com`, VALID_PASSWORD)).toEqual({})
    expect(validateRegisterForm(`${local}a@example.com`, VALID_PASSWORD).email).toBe(
      'Enter a valid email address'
    )
  })

  it('rejects a malformed email', () => {
    expect(validateRegisterForm('not-an-email', VALID_PASSWORD).email).toBe(
      'Enter a valid email address'
    )
  })
})

describe('Register page', () => {
  it('states the password policy inline and marks the field as new-password', () => {
    renderRegister()

    expect(
      screen.getByText(new RegExp(`at least ${MIN_PASSWORD_LENGTH} characters`, 'i'))
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute(
      'autocomplete',
      'new-password'
    )
  })

  it('validates before submit instead of calling the server', async () => {
    renderRegister()
    fillForm({ password: 'short' })
    fireEvent.click(submit())

    expect(
      await screen.findByText(`Use at least ${MIN_PASSWORD_LENGTH} characters`)
    ).toBeInTheDocument()
    expect(authState.register).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute('aria-invalid', 'true')
  })

  it('sends the trimmed email and an optional display name', async () => {
    renderRegister()
    fillForm({ email: '  Ada@Example.com  ', displayName: '  Ada  ' })
    fireEvent.click(submit())

    await waitFor(() =>
      expect(authState.register).toHaveBeenCalledWith(
        'Ada@Example.com',
        VALID_PASSWORD,
        'Ada'
      )
    )
  })

  it('omits the display name when it is left blank', async () => {
    renderRegister()
    fillForm({ displayName: '   ' })
    fireEvent.click(submit())

    await waitFor(() =>
      expect(authState.register).toHaveBeenCalledWith(
        'ada@example.com',
        VALID_PASSWORD,
        undefined
      )
    )
  })

  it('disables submit while in flight so a double click cannot register twice', async () => {
    let release: () => void = () => {}
    const inFlight = new Promise<void>((resolve) => {
      release = resolve
    })
    authState.register = vi.fn(() => inFlight)

    renderRegister()
    fillForm()
    fireEvent.click(submit())

    await waitFor(() => expect(submit()).toBeDisabled())
    fireEvent.click(submit())
    expect(authState.register).toHaveBeenCalledTimes(1)

    await act(async () => {
      release()
      await inFlight
    })

    expect(submit()).toBeEnabled()
  })

  it('shows server field errors against the matching field as plain text', async () => {
    authState.register = vi.fn(async () => {
      throw new ApiError('Please check the highlighted fields and try again.', {
        status: 400,
        fieldErrors: { password: 'This password is too common — choose another' },
      })
    })

    renderRegister()
    fillForm()
    fireEvent.click(submit())

    const message = await screen.findByText(
      'This password is too common — choose another'
    )
    expect(message).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute(
      'aria-describedby',
      expect.stringContaining('password-error')
    )
  })

  it('reports a connection problem distinctly from a rejected password', async () => {
    authState.register = vi.fn(async () => {
      throw new ApiError("Can't reach the server. Check your connection and try again.", {
        status: 0,
        isNetworkError: true,
      })
    })

    renderRegister()
    fillForm()
    fireEvent.click(submit())

    expect(await screen.findByRole('alert')).toHaveTextContent(/can't reach the server/i)
    expect(submit()).toBeEnabled()
  })

  it('shows the wait time on a rate-limited attempt', async () => {
    authState.register = vi.fn(async () => {
      throw new ApiError('Too many attempts. Please wait before trying again.', {
        status: 429,
        retryAfterSeconds: 90,
      })
    })

    renderRegister()
    fillForm()
    fireEvent.click(submit())

    expect(await screen.findByRole('alert')).toHaveTextContent(/90s/)
  })

  it('gives a neutral outcome when no session is issued, disclosing nothing', async () => {
    // The already-registered path: resolves successfully, no user, still anonymous
    authState.register = vi.fn(async () => {})

    renderRegister()
    fillForm()
    fireEvent.click(submit())

    const notice = await screen.findByRole('status')
    expect(notice).toHaveTextContent(/sign in to continue/i)
    expect(notice.textContent).not.toMatch(/already|exists|taken/i)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    // The password is cleared rather than left sitting in the field
    expect(screen.getByLabelText(/^password$/i)).toHaveValue('')
  })

  it('redirects an already-authenticated visitor to the dashboard', () => {
    authState.status = 'authenticated'
    renderRegister()

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument()
  })
})
