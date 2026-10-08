import { describe, expect, it, vi } from 'vitest'
import type { NextFunction, Request, Response } from 'express'
import { AuthError, RateLimitError, ValidationError } from '../auth/errors.ts'
import {
  BODY_TOO_LARGE_MESSAGE,
  createErrorHandler,
  classifyError,
  GENERIC_ERROR_MESSAGE,
  MALFORMED_BODY_MESSAGE,
  NOT_FOUND_MESSAGE,
  NotFoundError,
} from './errorHandler.ts'

/** Minimal response double recording what the handler set. */
function fakeResponse() {
  const state = {
    status: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    headersSent: false,
  }

  const res = {
    get headersSent() {
      return state.headersSent
    },
    setHeader(name: string, value: string) {
      state.headers[name] = value
    },
    status(code: number) {
      state.status = code
      return res
    },
    json(body: unknown) {
      state.body = body
      return res
    },
  }

  return { res: res as unknown as Response, state }
}

const req = { method: 'POST', originalUrl: '/api/auth/login' } as Request
const next = (() => {}) as NextFunction

describe('classifyError', () => {
  it('maps a validation failure to 400 with every field error', () => {
    const mapped = classifyError(
      new ValidationError({ email: 'Email is required', password: 'Password is required' }),
    )

    expect(mapped.status).toBe(400)
    expect(mapped.body.fieldErrors).toEqual({
      email: 'Email is required',
      password: 'Password is required',
    })
    expect(mapped.unexpected).toBe(false)
  })

  it('maps a rate limit to 429 carrying the retry delay', () => {
    const mapped = classifyError(new RateLimitError(42))

    expect(mapped.status).toBe(429)
    expect(mapped.retryAfterSeconds).toBe(42)
    expect(mapped.body.retryAfterSeconds).toBe(42)
  })

  it('maps bad credentials to 401 with the uniform message', () => {
    const mapped = classifyError(new AuthError())

    expect(mapped.status).toBe(401)
    expect(mapped.body.error).toBe('Email or password is incorrect')
  })

  it('maps a cross-user or missing resource to 404', () => {
    expect(classifyError(new NotFoundError())).toMatchObject({
      status: 404,
      body: { error: NOT_FOUND_MESSAGE },
    })
  })

  it('maps an oversized body to 413 and a malformed body to 400', () => {
    expect(classifyError({ type: 'entity.too.large', status: 413 })).toMatchObject({
      status: 413,
      body: { error: BODY_TOO_LARGE_MESSAGE },
    })
    expect(classifyError({ type: 'entity.parse.failed', status: 400 })).toMatchObject({
      status: 400,
      body: { error: MALFORMED_BODY_MESSAGE },
    })
  })

  it('maps anything unrecognised to a generic 500', () => {
    const mapped = classifyError(new Error('SQLITE_CONSTRAINT: users.email'))

    expect(mapped.status).toBe(500)
    expect(mapped.body).toEqual({ error: GENERIC_ERROR_MESSAGE })
    expect(mapped.unexpected).toBe(true)
  })
})

describe('createErrorHandler', () => {
  it('logs the detail of an unexpected fault but never returns it', () => {
    const logger = vi.fn()
    const { res, state } = fakeResponse()
    const cause = new Error('SQLITE_ERROR: no such table: users')

    createErrorHandler({ logger })(cause, req, res, next)

    expect(state.status).toBe(500)
    expect(state.body).toEqual({ error: GENERIC_ERROR_MESSAGE })
    expect(JSON.stringify(state.body)).not.toContain('SQLITE')
    expect(logger).toHaveBeenCalledWith(expect.stringContaining('/api/auth/login'), cause)
  })

  it('sets Retry-After on a rate-limited response', () => {
    const { res, state } = fakeResponse()

    createErrorHandler({ logger: vi.fn() })(new RateLimitError(90), req, res, next)

    expect(state.status).toBe(429)
    expect(state.headers['Retry-After']).toBe('90')
  })

  it('does not log an expected failure as a fault', () => {
    const logger = vi.fn()
    const { res, state } = fakeResponse()

    createErrorHandler({ logger })(new AuthError(), req, res, next)

    expect(state.status).toBe(401)
    expect(logger).not.toHaveBeenCalled()
  })

  it('delegates when the response has already started', () => {
    const logger = vi.fn()
    const forwarded = vi.fn()
    const state = { sent: true }
    const res = {
      get headersSent() {
        return state.sent
      },
      setHeader: vi.fn(),
      status: vi.fn(),
      json: vi.fn(),
    } as unknown as Response

    const cause = new Error('late failure')
    createErrorHandler({ logger })(cause, req, res, forwarded as unknown as NextFunction)

    expect(forwarded).toHaveBeenCalledWith(cause)
  })
})
