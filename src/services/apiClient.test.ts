import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  apiClient,
  ApiError,
  CSRF_COOKIE,
  CSRF_HEADER,
  NETWORK_ERROR_STATUS,
  readCookie,
} from './apiClient'

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>

let fetchMock: FetchMock

/** Minimal Response builder; jsdom provides the real Response class. */
function jsonResponse(
  status: number,
  body?: unknown,
  headers: Record<string, string> = {}
): Response {
  const hasBody = body !== undefined
  return new Response(hasBody ? JSON.stringify(body) : null, {
    status,
    headers: hasBody ? { 'Content-Type': 'application/json', ...headers } : headers,
  })
}

function clearCookies() {
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0]?.trim()
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  }
}

function lastRequestInit(): RequestInit {
  const call = fetchMock.mock.calls.at(-1)
  return (call?.[1] ?? {}) as RequestInit
}

/** Awaits a call expected to fail and hands back the typed ApiError. */
async function captureError(call: Promise<unknown>): Promise<ApiError> {
  try {
    await call
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    return error as ApiError
  }
  throw new Error('Expected the request to reject')
}

function headerOf(init: RequestInit, name: string): string | undefined {
  const headers = (init.headers ?? {}) as Record<string, string>
  const match = Object.keys(headers).find(
    (key) => key.toLowerCase() === name.toLowerCase()
  )
  return match ? headers[match] : undefined
}

beforeEach(() => {
  clearCookies()
  fetchMock = vi.fn<typeof fetch>()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  clearCookies()
})

describe('apiClient.get', () => {
  it('sends credentials and returns the parsed body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 'u1', email: 'a@b.co' }))

    const user = await apiClient.get<{ id: string; email: string }>('/auth/me')

    expect(user).toEqual({ id: 'u1', email: 'a@b.co' })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/me')
    expect(lastRequestInit().credentials).toBe('include')
    // GET is not state-changing, so no CSRF header is required
    expect(headerOf(lastRequestInit(), CSRF_HEADER)).toBeUndefined()
  })

  it('resolves to null for an empty body', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    await expect(apiClient.get('/auth/me')).resolves.toBeNull()
  })
})

describe('apiClient.post CSRF handling', () => {
  it('echoes the readable CSRF cookie in the header', async () => {
    document.cookie = `${CSRF_COOKIE}=tok-123; path=/`
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }))

    await apiClient.post('/auth/logout')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(headerOf(lastRequestInit(), CSRF_HEADER)).toBe('tok-123')
  })

  it('requests a token first when no cookie is held yet', async () => {
    fetchMock.mockImplementation(async (input) => {
      if (String(input) === '/api/auth/csrf') {
        document.cookie = `${CSRF_COOKIE}=fresh-tok; path=/`
        return jsonResponse(200, { csrfToken: 'fresh-tok' })
      }
      return jsonResponse(200, { ok: true })
    })

    await apiClient.post('/auth/login', { email: 'a@b.co', password: 'x' })

    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      '/api/auth/csrf',
      '/api/auth/login',
    ])
    expect(headerOf(lastRequestInit(), CSRF_HEADER)).toBe('fresh-tok')
  })
})

describe('apiClient error classification', () => {
  it('classifies a 401 with the server message, not as a network error', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { error: 'Email or password is incorrect' })
    )

    const error = await captureError(apiClient.get('/auth/me'))

    expect(error.status).toBe(401)
    expect(error.isNetworkError).toBe(false)
    expect(error.message).toBe('Email or password is incorrect')
  })

  it('classifies a network failure separately from a 401', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    const error = await captureError(apiClient.get('/auth/me'))

    expect(error.isNetworkError).toBe(true)
    expect(error.status).toBe(NETWORK_ERROR_STATUS)
    expect(error.status).not.toBe(401)
  })

  it('reads the wait time from Retry-After on a 429', async () => {
    document.cookie = `${CSRF_COOKIE}=tok; path=/`
    fetchMock.mockResolvedValue(
      jsonResponse(429, { error: 'Too many attempts' }, { 'Retry-After': '120' })
    )

    const error = await captureError(apiClient.post('/auth/login', {}))

    expect(error.status).toBe(429)
    expect(error.retryAfterSeconds).toBe(120)
  })

  it('exposes field errors from a 400', async () => {
    document.cookie = `${CSRF_COOKIE}=tok; path=/`
    fetchMock.mockResolvedValue(
      jsonResponse(400, {
        error: 'Registration failed',
        fieldErrors: { password: 'Use at least 12 characters', junk: 42 },
      })
    )

    const error = await captureError(apiClient.post('/auth/register', {}))

    expect(error.status).toBe(400)
    // Non-string values are dropped so a crafted body can't smuggle objects
    expect(error.fieldErrors).toEqual({ password: 'Use at least 12 characters' })
  })

  it('falls back to a generic message when the body is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>oops</html>', { status: 500 }))

    const error = await captureError(apiClient.get('/auth/me'))

    expect(error.status).toBe(500)
    expect(error.message).not.toContain('<html>')
  })
})

describe('readCookie', () => {
  it('finds a value among several cookies and decodes it', () => {
    document.cookie = 'other=1; path=/'
    document.cookie = `${CSRF_COOKIE}=${encodeURIComponent('a b+c')}; path=/`

    expect(readCookie(CSRF_COOKIE)).toBe('a b+c')
    expect(readCookie('missing')).toBeNull()
  })
})
