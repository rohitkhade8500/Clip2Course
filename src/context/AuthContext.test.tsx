import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { ApiError, apiClient } from '../services/apiClient'
import { claimUnownedData } from '../services/courseStore'
import { AuthProvider, useAuth } from './AuthContext'

vi.mock('../services/apiClient', async () => {
  const actual = await vi.importActual<typeof import('../services/apiClient')>(
    '../services/apiClient'
  )
  return { ...actual, apiClient: { get: vi.fn(), post: vi.fn() } }
})

vi.mock('../services/courseStore', () => ({
  claimUnownedData: vi.fn(async () => 0),
}))

const get = apiClient.get as Mock
const post = apiClient.post as Mock
const claim = claimUnownedData as Mock

const ADA = { id: 'u-1', email: 'ada@example.com', displayName: 'ada' }
const PASSWORD = 'correct horse battery staple'

/** Renders the auth state and exposes the actions as buttons. */
function Probe() {
  const { status, user, login, register, logout, handleUnauthorized } = useAuth()

  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="user">{user ? user.email : 'none'}</span>
      <button onClick={() => void login(ADA.email, PASSWORD).catch(() => {})}>
        login
      </button>
      <button onClick={() => void register(ADA.email, PASSWORD).catch(() => {})}>
        register
      </button>
      <button onClick={() => void logout()}>logout</button>
      <button
        onClick={() =>
          handleUnauthorized(new ApiError('nope', { status: 401 }))
        }
      >
        got401
      </button>
      <button
        onClick={() =>
          handleUnauthorized(
            new ApiError('offline', { status: 0, isNetworkError: true })
          )
        }
      >
        gotOffline
      </button>
    </div>
  )
}

function renderAuth() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  )
}

const unauthorized = () => new ApiError('Unauthenticated', { status: 401 })
const offline = () =>
  new ApiError('offline', { status: 0, isNetworkError: true })

async function signedIn() {
  get.mockResolvedValue({ user: ADA })
  renderAuth()
  await waitFor(() =>
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  claim.mockResolvedValue(0)
})

describe('session restore on mount', () => {
  it('holds checking until /auth/me resolves, then authenticates', async () => {
    let resolveMe: (value: unknown) => void = () => {}
    get.mockReturnValue(
      new Promise((resolve) => {
        resolveMe = resolve
      })
    )

    renderAuth()

    expect(screen.getByTestId('status')).toHaveTextContent('checking')
    expect(get).toHaveBeenCalledWith('/auth/me')

    await act(async () => {
      resolveMe({ user: ADA })
    })

    expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    expect(screen.getByTestId('user')).toHaveTextContent(ADA.email)
  })

  it('becomes anonymous when the session check returns 401', async () => {
    get.mockRejectedValue(unauthorized())

    renderAuth()

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('anonymous')
    )
    expect(screen.getByTestId('user')).toHaveTextContent('none')
    expect(claim).not.toHaveBeenCalled()
  })

  it('resolves to anonymous rather than hanging when the server is unreachable', async () => {
    get.mockRejectedValue(offline())

    renderAuth()

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('anonymous')
    )
  })
})

describe('login and register', () => {
  it('authenticates on a successful login and claims pre-account data once', async () => {
    get.mockRejectedValue(unauthorized())
    post.mockResolvedValue({ user: ADA })

    renderAuth()
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('anonymous')
    )

    await act(async () => {
      screen.getByText('login').click()
    })

    expect(post).toHaveBeenCalledWith('/auth/login', {
      email: ADA.email,
      password: PASSWORD,
    })
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    expect(claim).toHaveBeenCalledExactlyOnceWith(ADA.id)

    // A second sign-in for the same user must not re-run the claim
    await act(async () => {
      screen.getByText('login').click()
    })
    expect(claim).toHaveBeenCalledTimes(1)
  })

  it('never writes the password to a client store', async () => {
    get.mockRejectedValue(unauthorized())
    post.mockResolvedValue({ user: ADA })

    renderAuth()
    await act(async () => {
      screen.getByText('register').click()
    })

    const dumped = [localStorage, sessionStorage].flatMap((store) =>
      Object.keys(store).map((key) => `${key}=${store.getItem(key)}`)
    )
    expect(dumped.join('|')).not.toContain(PASSWORD)
    expect(localStorage.length + sessionStorage.length).toBe(0)
  })

  it('stays anonymous when credentials are rejected', async () => {
    get.mockRejectedValue(unauthorized())
    post.mockRejectedValue(unauthorized())

    renderAuth()
    await act(async () => {
      screen.getByText('login').click()
    })

    expect(screen.getByTestId('status')).toHaveTextContent('anonymous')
    expect(claim).not.toHaveBeenCalled()
  })

  it('treats a success-shaped response without a user as anonymous', async () => {
    get.mockRejectedValue(unauthorized())
    post.mockResolvedValue({ user: null })

    renderAuth()
    await act(async () => {
      screen.getByText('register').click()
    })

    expect(screen.getByTestId('status')).toHaveTextContent('anonymous')
    expect(screen.getByTestId('user')).toHaveTextContent('none')
  })
})

describe('logout and 401 handling', () => {
  it('clears the cached user on logout', async () => {
    await signedIn()
    post.mockResolvedValue({})

    await act(async () => {
      screen.getByText('logout').click()
    })

    expect(post).toHaveBeenCalledWith('/auth/logout')
    expect(screen.getByTestId('status')).toHaveTextContent('anonymous')
    expect(screen.getByTestId('user')).toHaveTextContent('none')
  })

  it('clears the cached user even when the logout request fails', async () => {
    await signedIn()
    post.mockRejectedValue(offline())

    await act(async () => {
      screen.getByText('logout').click()
    })

    expect(screen.getByTestId('status')).toHaveTextContent('anonymous')
  })

  it('signs the user out on a 401 during normal use', async () => {
    await signedIn()

    await act(async () => {
      screen.getByText('got401').click()
    })

    expect(screen.getByTestId('status')).toHaveTextContent('anonymous')
  })

  it('keeps the user signed in when a request fails with a network error', async () => {
    await signedIn()

    await act(async () => {
      screen.getByText('gotOffline').click()
    })

    expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    expect(screen.getByTestId('user')).toHaveTextContent(ADA.email)
  })
})
